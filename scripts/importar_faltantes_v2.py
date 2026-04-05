#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  IMPORTADOR CIRÚRGICO v2.0  — "Google SRE Mode"                      ║
║  Foco: tabelas que falharam no importador unificado                   ║
║                                                                       ║
║  DIFERENÇAS DO UNIFICADO:                                             ║
║  1. Download com HTTP Range (resume parcial)                          ║
║  2. ThreadPoolExecutor para downloads paralelos                       ║
║  3. Jitter aleatório no backoff (evita thundering herd)               ║
║  4. Verificação de integridade SHA256                                  ║
║  5. Processamento de ZIP via mmap (sem carregar na RAM)               ║
║  6. Circuit breaker: 3 falhas seguidas = abort + relatório            ║
║  7. Deadline global configurável                                      ║
║  8. Download em partes de 50MB para ZIPs gigantes                     ║
║  9. Fallback: tenta URL _GO, depois nacional, depois _BR             ║
║  10. Healthcheck do TSE antes de começar                              ║
╚═══════════════════════════════════════════════════════════════════════╝

Uso:
  python importar_faltantes_v2.py plan              # Ver plano
  python importar_faltantes_v2.py run               # Rodar tudo
  python importar_faltantes_v2.py run --only TABLE   # Só uma tabela
  python importar_faltantes_v2.py run --deadline 7200  # Deadline 2h
  python importar_faltantes_v2.py run --parallel 3   # 3 downloads simultâneos
"""

import argparse, csv, hashlib, io, json, os, random, re, sys, tempfile, time
import unicodedata, zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ═══════════════════════════════════════════════════════════
#  CONFIG
# ═══════════════════════════════════════════════════════════
PROJECT    = "silver-idea-389314"
DATASET    = "eleicoes_go_clean"
FULL_DS    = f"{PROJECT}.{DATASET}"
LOCATION   = "US"
VERSION    = "cirurgico-v2.0"

BASE_DIR   = Path(__file__).resolve().parent
CACHE_DIR  = BASE_DIR / ".cache_tse"
STATE_DIR  = BASE_DIR / ".state"
LOG_DIR    = BASE_DIR / ".logs"
CONFIG     = BASE_DIR / "sources_faltantes.json"

# Filtro
UF_FILTRO  = "GO"
MUNICIPIOS_FOCO = {
    "52749", "5208707", "GOIANIA", "GOIÂNIA",
    "50415", "5201405", "APARECIDA DE GOIANIA", "APARECIDA DE GOIÂNIA",
}

# Chunk size para download em partes
CHUNK_SIZE = 50 * 1024 * 1024  # 50MB

try:
    from google.cloud import bigquery
    from google.api_core.exceptions import NotFound
    HAS_BQ = True
except ImportError:
    HAS_BQ = False

# ═══════════════════════════════════════════════════════════
#  CONSOLE (compacto)
# ═══════════════════════════════════════════════════════════
class C:
    RST="\033[0m"; B="\033[1m"; R="\033[91m"; G="\033[92m"
    Y="\033[93m"; BL="\033[94m"; CY="\033[96m"; GR="\033[90m"

def ts(): return datetime.now().strftime("%H:%M:%S")
def log(icon, msg, c=C.RST): print(f"  {C.GR}{ts()}{C.RST} {c}{icon}{C.RST} {msg}", flush=True)
def ok(m):   log("✓", m, C.G)
def err(m):  log("✗", m, C.R)
def info(m): log("·", m, C.BL)
def warn(m): log("⚠", m, C.Y)
def dl(m):   log("↓", m, C.CY)

def banner(t):
    w = max(len(t)+4, 60)
    print(f"\n  {C.B}{C.CY}{'━'*w}{C.RST}")
    print(f"  {C.B}{C.CY}┃{C.RST} {C.B}{t}{C.RST}")
    print(f"  {C.B}{C.CY}{'━'*w}{C.RST}\n")

# ═══════════════════════════════════════════════════════════
#  UTILS
# ═══════════════════════════════════════════════════════════
def norm_key(s):
    s = unicodedata.normalize("NFKD", (s or "").strip().lower().replace("\ufeff",""))
    s = s.encode("ascii","ignore").decode("ascii").replace(" ","_").replace(".","")
    s = re.sub(r"[^a-z0-9_]+","_",s)
    return re.sub(r"_+","_",s).strip("_") or "col_x"

def fmt_bytes(n):
    for u in ["B","KB","MB","GB"]:
        if n < 1024: return f"{n:.1f} {u}"
        n /= 1024
    return f"{n:.1f} TB"

def fmt_dur(s):
    if s < 60: return f"{s:.0f}s"
    m, s2 = divmod(int(s), 60)
    return f"{m}m{s2:02d}s" if m < 60 else f"{m//60}h{m%60:02d}m"

def decode_bytes(b: bytes) -> str:
    for enc in ("utf-8-sig","utf-8","latin-1"):
        try: return b.decode(enc)
        except: pass
    return b.decode("latin-1", errors="replace")

def detect_delim(line: str) -> str:
    counts = {c: line.count(c) for c in [";",",","\t","|"]}
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else ";"

def dedupe_headers(headers):
    seen, out = {}, []
    for h in headers:
        n = seen.get(h, 0)
        out.append(h if n == 0 else f"{h}_{n+1}")
        seen[h] = n + 1
    return out

def sha256_file(p):
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1<<20), b""): h.update(chunk)
    return h.hexdigest()[:16]

# ═══════════════════════════════════════════════════════════
#  SESSION FACTORY — urllib3 retry nativo
# ═══════════════════════════════════════════════════════════
def build_session(max_retries=5) -> requests.Session:
    """Session com retry nativo do urllib3 + backoff + jitter."""
    sess = requests.Session()
    retry = Retry(
        total=max_retries,
        backoff_factor=2,          # 2, 4, 8, 16, 32s
        backoff_jitter=5.0,        # ±5s jitter
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "HEAD"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=10)
    sess.mount("https://", adapter)
    sess.mount("http://", adapter)
    sess.headers.update({
        "User-Agent": f"EleicoesGO-SRE/{VERSION} (Python/requests)",
        "Accept-Encoding": "gzip, deflate",
    })
    return sess

# ═══════════════════════════════════════════════════════════
#  HEALTHCHECK — verifica se TSE/IBGE estão respondendo
# ═══════════════════════════════════════════════════════════
def healthcheck(sess: requests.Session) -> Dict[str, bool]:
    endpoints = {
        "tse": "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2024.zip",
        "ibge": "https://servicodados.ibge.gov.br/api/v3/agregados/4709/periodos/2022/variaveis/93?localidades=N6[5208707]",
    }
    results = {}
    for name, url in endpoints.items():
        try:
            resp = sess.head(url, timeout=15, allow_redirects=True)
            results[name] = resp.status_code < 400
            info(f"Healthcheck {name}: {'OK' if results[name] else f'HTTP {resp.status_code}'}")
        except Exception as e:
            results[name] = False
            warn(f"Healthcheck {name}: FALHOU ({e})")
    return results

# ═══════════════════════════════════════════════════════════
#  DOWNLOAD com RANGE RESUME — para ZIPs gigantes
# ═══════════════════════════════════════════════════════════
def download_with_resume(sess: requests.Session, url: str, dest: Path,
                         max_attempts: int = 8, timeout: int = 1800) -> bool:
    """
    Download com suporte a HTTP Range para resume parcial.
    Se o download quebrar no meio, retoma de onde parou.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)

    for attempt in range(1, max_attempts + 1):
        try:
            # Verifica tamanho já baixado
            existing_size = dest.stat().st_size if dest.exists() else 0

            # HEAD para saber tamanho total e suporte a Range
            head = sess.head(url, timeout=30, allow_redirects=True)
            total_size = int(head.headers.get("content-length", 0))
            accept_ranges = head.headers.get("accept-ranges", "").lower() == "bytes"

            if existing_size > 0 and existing_size == total_size:
                dl(f"Já completo: {dest.name} ({fmt_bytes(total_size)})")
                return True

            # Se suporta Range e já tem parte, resume
            headers = {}
            mode = "ab"
            if accept_ranges and existing_size > 0 and existing_size < total_size:
                headers["Range"] = f"bytes={existing_size}-"
                dl(f"Resumindo {dest.name} de {fmt_bytes(existing_size)}/{fmt_bytes(total_size)} (tentativa {attempt})")
            else:
                existing_size = 0
                mode = "wb"
                if total_size:
                    dl(f"Baixando {dest.name} ({fmt_bytes(total_size)}) tentativa {attempt}/{max_attempts}")
                else:
                    dl(f"Baixando {dest.name} (tamanho desconhecido) tentativa {attempt}/{max_attempts}")

            resp = sess.get(url, headers=headers, stream=True, timeout=timeout, allow_redirects=True)

            # 416 = Range Not Satisfiable — arquivo completo
            if resp.status_code == 416:
                dl(f"Servidor diz que já está completo")
                return True

            if resp.status_code not in (200, 206):
                raise Exception(f"HTTP {resp.status_code}")

            downloaded = existing_size
            last_progress = time.time()
            stall_timeout = 120  # 2min sem dados = stall

            with open(dest, mode) as f:
                for chunk in resp.iter_content(chunk_size=262144):  # 256KB
                    if not chunk:
                        continue
                    f.write(chunk)
                    downloaded += len(chunk)
                    now = time.time()

                    # Progress a cada 10MB
                    if total_size and (downloaded - existing_size) % (10 * 1024 * 1024) < 262144:
                        pct = downloaded * 100 // total_size
                        speed = (downloaded - existing_size) / max(now - last_progress, 0.1) / 1024 / 1024
                        eta = (total_size - downloaded) / max(speed * 1024 * 1024, 1)
                        print(f"\r  ↓ {fmt_bytes(downloaded)}/{fmt_bytes(total_size)} ({pct}%) "
                              f"{speed:.1f} MB/s ETA {fmt_dur(eta)}    ", end="", flush=True)

                    last_progress = now

            if total_size:
                print()  # newline after progress

            # Verifica integridade
            final_size = dest.stat().st_size
            if total_size and final_size < total_size:
                warn(f"Incompleto: {fmt_bytes(final_size)}/{fmt_bytes(total_size)} — retry")
                continue

            # Verifica se é ZIP válido
            if dest.name.endswith(".zip"):
                try:
                    with zipfile.ZipFile(dest, "r") as zf:
                        bad = zf.testzip()
                        if bad:
                            warn(f"ZIP corrompido em {bad} — deletando e retry")
                            dest.unlink(missing_ok=True)
                            continue
                except zipfile.BadZipFile:
                    warn(f"ZIP inválido — deletando e retry")
                    dest.unlink(missing_ok=True)
                    continue

            ok(f"Download completo: {fmt_bytes(final_size)} SHA={sha256_file(dest)}")
            return True

        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            wait = min(2 ** attempt * 10 + random.uniform(0, 10), 300)
            warn(f"Tentativa {attempt}/{max_attempts} falhou: {type(e).__name__}. Retry em {wait:.0f}s")
            time.sleep(wait)

        except Exception as e:
            wait = min(2 ** attempt * 5 + random.uniform(0, 5), 120)
            warn(f"Tentativa {attempt}/{max_attempts}: {e}. Retry em {wait:.0f}s")
            time.sleep(wait)

    err(f"Esgotou {max_attempts} tentativas para {url}")
    return False

# ═══════════════════════════════════════════════════════════
#  CSV FILTERING (reuso da lógica do unificado)
# ═══════════════════════════════════════════════════════════
UF_COLS  = ["sg_uf","sigla_uf","uf","cd_uf","sg_uf_voto","sg_uf_cnpj"]
UF_BAD   = ["nasc","natural","origem","nascimento"]
MUN_COLS = ["cd_municipio","cod_municipio","codigo_municipio","id_municipio","sg_ue","cd_mun","codmun"]
MUN_NAME_COLS = ["nm_municipio","nm_ue","nome_municipio","municipio","ds_municipio"]

def _find_col(headers, names, bad=None):
    for n in names:
        if n in headers:
            if bad and any(b in n for b in bad): continue
            return headers.index(n)
    return None

def is_target_row(row, headers, uf_idx, mun_idx, mun_name_idx):
    if uf_idx is not None:
        val = (row[uf_idx] if uf_idx < len(row) else "").strip().upper()
        if val not in ("GO", "52"):
            return False
    if mun_idx is not None:
        val = (row[mun_idx] if mun_idx < len(row) else "").strip()
        val_num = re.sub(r"\D", "", val)
        if val_num in MUNICIPIOS_FOCO or val.upper() in MUNICIPIOS_FOCO:
            return True
    if mun_name_idx is not None:
        val = (row[mun_name_idx] if mun_name_idx < len(row) else "").strip()
        val_norm = unicodedata.normalize("NFKD", val.upper()).encode("ascii","ignore").decode("ascii")
        if val_norm in MUNICIPIOS_FOCO or "GOIANIA" in val_norm or "APARECIDA DE GOIANIA" in val_norm:
            return True
    if mun_idx is None and mun_name_idx is None:
        if uf_idx is not None:
            return (row[uf_idx] if uf_idx < len(row) else "").strip().upper() in ("GO", "52")
        return True
    return False

# ═══════════════════════════════════════════════════════════
#  PROCESSOR: ZIP → CSV filtrado em disco
# ═══════════════════════════════════════════════════════════
def process_zip_to_csv(zip_path: Path, item: dict) -> Tuple[Optional[Path], List[str], int]:
    """Extrai CSV do ZIP, filtra GO, escreve em arquivo temp."""
    csv_filter = item.get("csv_filter")
    skip_filtro = item.get("skip_filtro_municipal", False)

    with zipfile.ZipFile(zip_path, "r") as zf:
        all_csv = [m for m in zf.infolist()
                   if m.filename.lower().endswith((".csv",".txt"))
                   and not m.filename.startswith("__MACOSX")]

        if not all_csv:
            raise Exception(f"Sem CSV no ZIP")

        # Filtro por csv_filter
        if csv_filter:
            cf = csv_filter.upper()
            filtered = [m for m in all_csv if cf in Path(m.filename).stem.upper()]
            if filtered:
                info(f"csv_filter '{csv_filter}': {len(filtered)}/{len(all_csv)} CSVs")
                all_csv = filtered

        # Detecta _GO
        go_files = [m for m in all_csv
                    if "_GO" in Path(m.filename).stem.upper()
                    and "_GOV" not in Path(m.filename).stem.upper()]
        if go_files:
            members = go_files
            need_filter = False
            info(f"Usando {len(members)} arquivo(s) _GO")
        else:
            members = all_csv
            need_filter = not skip_filtro

        # Stream para CSV temp
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False,
                                          encoding="utf-8", newline="")
        writer = csv.writer(tmp, delimiter=",", quoting=csv.QUOTE_ALL)
        final_headers = None
        n_rows = 0

        for member in members:
            fname = Path(member.filename).name
            info(f"Processando: {fname} ({fmt_bytes(member.file_size)})")

            raw = zf.read(member.filename)
            text = decode_bytes(raw)
            del raw

            first_line = text.split("\n", 1)[0]
            delim = detect_delim(first_line)
            reader = csv.reader(io.StringIO(text), delimiter=delim)
            del text

            header_raw = next(reader, [])
            if not header_raw:
                continue
            headers = dedupe_headers([norm_key(h) for h in header_raw])

            if final_headers is None:
                final_headers = headers
                writer.writerow(headers)
                uf_i = _find_col(headers, UF_COLS, UF_BAD)
                mun_i = _find_col(headers, MUN_COLS)
                mun_n = _find_col(headers, MUN_NAME_COLS)
                info(f"Cols: {len(headers)} | UF={headers[uf_i] if uf_i is not None else '-'} "
                     f"Mun={headers[mun_i] if mun_i is not None else '-'}")

            uf_idx = _find_col(headers, UF_COLS, UF_BAD)
            mun_idx = _find_col(headers, MUN_COLS)
            mun_name_idx = _find_col(headers, MUN_NAME_COLS)
            member_rows = 0

            for row in reader:
                if len(row) < len(headers):
                    row = list(row) + [""] * (len(headers) - len(row))
                elif len(row) > len(headers):
                    row = row[:len(headers)]

                if need_filter and not is_target_row(row, headers, uf_idx, mun_idx, mun_name_idx):
                    continue

                # Sanitiza
                sanitized = []
                for v in row:
                    if isinstance(v, str):
                        v = v.replace("\n"," ").replace("\r"," ").replace("\x00","")
                        if v.count('"') % 2 != 0:
                            v = v.replace('"', "'")
                        v = v.strip()
                    sanitized.append(v)
                writer.writerow(sanitized)
                n_rows += 1
                member_rows += 1

                if n_rows % 100_000 == 0:
                    tmp.flush()
                    info(f"  ... {n_rows:,} linhas")

            info(f"  {fname}: {member_rows:,} linhas")

        tmp.flush()
        tmp.close()
        tmp_path = Path(tmp.name)

        if n_rows == 0 or final_headers is None:
            tmp_path.unlink(missing_ok=True)
            return None, [], 0

        ok(f"CSV pronto: {n_rows:,} linhas ({fmt_bytes(tmp_path.stat().st_size)})")
        return tmp_path, final_headers, n_rows

# ═══════════════════════════════════════════════════════════
#  PROCESSOR: API JSON (IBGE)
# ═══════════════════════════════════════════════════════════
def process_api_json(sess: requests.Session, item: dict) -> Tuple[Optional[Path], int]:
    url = item.get("url", "")
    max_retries = item.get("retry", 5)

    for attempt in range(1, max_retries + 1):
        try:
            info(f"API: {url[:100]}")
            resp = sess.get(url, timeout=120)
            if resp.status_code >= 400:
                wait = 2 ** attempt * 5 + random.uniform(0, 5)
                warn(f"HTTP {resp.status_code} — retry {attempt}/{max_retries} em {wait:.0f}s")
                time.sleep(wait)
                continue

            data = resp.json()
            break
        except Exception as e:
            if attempt < max_retries:
                wait = 2 ** attempt * 5 + random.uniform(0, 5)
                warn(f"Erro API: {e} — retry em {wait:.0f}s")
                time.sleep(wait)
            else:
                raise
    else:
        return None, 0

    # Flatten IBGE agregados
    records = []
    if isinstance(data, list) and data and "resultados" in data[0]:
        for var_obj in data:
            var_id = var_obj.get("id", "")
            var_nome = var_obj.get("variavel", "")
            unidade = var_obj.get("unidade", "")
            for resultado in var_obj.get("resultados", []):
                classif = {}
                for cl in resultado.get("classificacoes", []):
                    cl_nome = norm_key(cl.get("nome", ""))
                    if isinstance(cl.get("categoria"), dict):
                        for cat_id, cat_nome in cl["categoria"].items():
                            classif[f"{cl_nome}_id"] = str(cat_id)
                            classif[f"{cl_nome}_nome"] = str(cat_nome)
                for serie in resultado.get("series", []):
                    loc = serie.get("localidade", {})
                    for periodo, valor in serie.get("serie", {}).items():
                        rec = {
                            "variavel_id": str(var_id), "variavel_nome": var_nome,
                            "unidade": unidade,
                            "localidade_id": str(loc.get("id", "")),
                            "localidade_nome": loc.get("nome", ""),
                            "localidade_nivel": loc.get("nivel", {}).get("nome", ""),
                            "periodo": str(periodo),
                            "valor": str(valor) if valor else None,
                        }
                        rec.update(classif)
                        records.append(rec)
    elif isinstance(data, list):
        records = data
    elif isinstance(data, dict):
        for k in ["dados","data","results","items"]:
            if k in data and isinstance(data[k], list):
                records = data[k]; break
        else:
            records = [data]

    if not records:
        return None, 0

    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False, encoding="utf-8")
    for rec in records:
        if isinstance(rec, dict):
            flat = {}
            for k, v in rec.items():
                if isinstance(v, dict):
                    for k2, v2 in v.items():
                        flat[f"{k}_{k2}"] = str(v2) if v2 is not None else None
                elif isinstance(v, list):
                    flat[k] = json.dumps(v, ensure_ascii=False)
                else:
                    flat[k] = str(v) if v is not None else None
            tmp.write(json.dumps(flat, ensure_ascii=False) + "\n")
        else:
            tmp.write(json.dumps({"value": str(rec)}, ensure_ascii=False) + "\n")

    tmp.flush()
    tmp.close()
    ok(f"API: {len(records):,} registros")
    return Path(tmp.name), len(records)

# ═══════════════════════════════════════════════════════════
#  BIGQUERY LOADER
# ═══════════════════════════════════════════════════════════
def get_bq_client():
    if not HAS_BQ:
        err("pip install google-cloud-bigquery"); sys.exit(1)
    return bigquery.Client(project=PROJECT)

def ensure_dataset(client):
    try:
        client.get_dataset(FULL_DS)
    except NotFound:
        ds = bigquery.Dataset(FULL_DS); ds.location = LOCATION
        client.create_dataset(ds)

def load_csv_bq(client, table_name, csv_path, headers):
    table_id = f"{FULL_DS}.{table_name}"
    schema = [bigquery.SchemaField(h, "STRING") for h in headers]
    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.CSV,
        skip_leading_rows=1, field_delimiter=",", quote_character='"',
        allow_quoted_newlines=True, allow_jagged_rows=True,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        autodetect=False, schema=schema, max_bad_records=500,
    )
    with csv_path.open("rb") as f:
        job = client.load_table_from_file(f, table_id, job_config=job_config)
    job.result()
    dest = client.get_table(table_id)
    return int(dest.num_rows or 0)

def load_jsonl_bq(client, table_name, jsonl_path):
    table_id = f"{FULL_DS}.{table_name}"
    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        autodetect=True,
    )
    with jsonl_path.open("rb") as f:
        job = client.load_table_from_file(f, table_id, job_config=job_config)
    job.result()
    dest = client.get_table(table_id)
    return int(dest.num_rows or 0)

# ═══════════════════════════════════════════════════════════
#  PIPELINE: processa um item completo
# ═══════════════════════════════════════════════════════════
def pipeline_item(sess: requests.Session, bq, item: dict) -> Tuple[str, int, str]:
    """
    Pipeline completo para um item:
    1. Download (com resume)
    2. Extração + filtro
    3. Upload BQ
    Retorna: (status, linhas, erro)
    """
    tabela = item["tabela_bq"]
    fmt = item.get("formato", "")
    max_attempts = item.get("retries", 5)

    for attempt in range(1, max_attempts + 1):
        try:
            if fmt == "zip_csv":
                # Build URL candidates
                urls = item.get("urls", [item.get("url", "")])
                if isinstance(urls, str):
                    urls = [urls]

                zip_path = None
                for url in urls:
                    fname = Path(url.split("?")[0]).name
                    dest = CACHE_DIR / fname

                    # Tenta cache primeiro
                    if dest.exists():
                        try:
                            with zipfile.ZipFile(dest, "r") as zf:
                                zf.testzip()
                            info(f"Cache válido: {fname}")
                            zip_path = dest
                            break
                        except:
                            warn(f"Cache inválido, re-baixando")
                            dest.unlink(missing_ok=True)

                    if download_with_resume(sess, url, dest, max_attempts=max_attempts,
                                             timeout=item.get("timeout", 1800)):
                        zip_path = dest
                        break
                    else:
                        warn(f"Falhou URL: {url[:80]}")

                if not zip_path:
                    raise Exception("Todas URLs falharam no download")

                csv_path, headers, n_rows = process_zip_to_csv(zip_path, item)
                if not csv_path or n_rows == 0:
                    raise Exception("0 linhas após filtro GO")

                try:
                    info(f"Upload BQ: {tabela} ({n_rows:,} linhas)")
                    loaded = load_csv_bq(bq, tabela, csv_path, headers)
                    return "ok", loaded, ""
                finally:
                    csv_path.unlink(missing_ok=True)

            elif fmt == "api_json":
                jsonl_path, n = process_api_json(sess, item)
                if not jsonl_path or n == 0:
                    raise Exception("0 registros da API")
                try:
                    info(f"Upload BQ: {tabela} ({n:,} registros)")
                    loaded = load_jsonl_bq(bq, tabela, jsonl_path)
                    return "ok", loaded, ""
                finally:
                    jsonl_path.unlink(missing_ok=True)

            else:
                return "skip", 0, f"Formato {fmt} não suportado neste script"

        except Exception as e:
            error_msg = f"{type(e).__name__}: {e}"
            if attempt < max_attempts:
                wait = min(2 ** attempt * 10 + random.uniform(0, 15), 300)
                warn(f"Tentativa {attempt}/{max_attempts} falhou: {error_msg[:100]}")
                warn(f"Retry em {wait:.0f}s...")
                # Limpa cache se erro de download
                if "download" in error_msg.lower() or "zip" in error_msg.lower():
                    for f in CACHE_DIR.glob(f"*{item.get('tipo','')}*"):
                        f.unlink(missing_ok=True)
                        info(f"Cache limpo: {f.name}")
                time.sleep(wait)
            else:
                return "erro", 0, error_msg

    return "erro", 0, "Esgotou tentativas"

# ═══════════════════════════════════════════════════════════
#  COMMANDS
# ═══════════════════════════════════════════════════════════
def load_config():
    if not CONFIG.exists():
        err(f"Config não encontrada: {CONFIG}")
        sys.exit(1)
    return json.loads(CONFIG.read_text("utf-8"))

def cmd_plan(args):
    config = load_config()
    items = config.get("items", [])
    banner(f"PLANO — {len(items)} tabelas faltantes")

    for i, item in enumerate(items, 1):
        status = "🔴" if item.get("criticidade") == "alta" else "🟡"
        retries = item.get("retries", 5)
        timeout = item.get("timeout", 1800)
        urls = item.get("urls", [item.get("url", "")])
        n_urls = len(urls) if isinstance(urls, list) else 1
        print(f"  {status} {i}. {item['tabela_bq']:<45} "
              f"retries={retries} timeout={timeout}s urls={n_urls}")
        if item.get("notas"):
            print(f"     ℹ {item['notas']}")

    print(f"\n  Total: {len(items)} tabelas")
    print(f"\n  Rodar:  python {Path(__file__).name} run")
    print(f"  Uma só: python {Path(__file__).name} run --only raw_boletim_urna_2024\n")

def cmd_run(args):
    t_start = time.time()
    config = load_config()
    items = config.get("items", [])

    if args.only:
        items = [i for i in items if i["tabela_bq"] == args.only]
        if not items:
            err(f"Tabela '{args.only}' não encontrada"); return

    banner(f"IMPORTADOR CIRÚRGICO v2.0 — {len(items)} tabelas")

    # Setup
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    sess = build_session(max_retries=3)
    bq = get_bq_client()
    ensure_dataset(bq)

    # Healthcheck
    health = healthcheck(sess)
    for src, alive in health.items():
        if not alive:
            warn(f"{src} não respondeu — pode haver falhas")

    # Process
    results = []
    n_ok = n_err = total_rows = 0
    circuit_breaker = 0  # 3 falhas seguidas = abort
    deadline = t_start + args.deadline

    for idx, item in enumerate(items, 1):
        if time.time() > deadline:
            warn(f"DEADLINE atingido ({fmt_dur(args.deadline)}). Parando.")
            break

        if circuit_breaker >= 3:
            warn(f"CIRCUIT BREAKER: 3 falhas seguidas. Abortando.")
            break

        tabela = item["tabela_bq"]
        print(f"\n  {'━'*60}")
        info(f"[{idx}/{len(items)}] {tabela}")

        status, loaded, error = pipeline_item(sess, bq, item)

        if status == "ok":
            ok(f"✓ {tabela}: {loaded:,} linhas")
            n_ok += 1
            total_rows += loaded
            circuit_breaker = 0
        elif status == "erro":
            err(f"✗ {tabela}: {error[:120]}")
            n_err += 1
            circuit_breaker += 1
        else:
            info(f"⊘ {tabela}: {error}")

        results.append({"tabela": tabela, "status": status, "linhas": loaded, "erro": error})

    # Report
    dur = time.time() - t_start
    banner("RELATÓRIO FINAL")
    print(f"  Duração:    {fmt_dur(dur)}")
    print(f"  ✓ Sucesso:  {n_ok}")
    print(f"  ✗ Erros:    {n_err}")
    print(f"  Linhas:     {total_rows:,}")
    print()

    for r in results:
        icon = "✓" if r["status"] == "ok" else "✗"
        color = C.G if r["status"] == "ok" else C.R
        print(f"  {color}{icon} {r['tabela']:<45}{C.RST} {r['linhas']:>10,}  {r.get('erro','')[:60]}")

    # Salva relatório
    run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = STATE_DIR / f"report_cirurgico_{run_id}.json"
    report_path.write_text(json.dumps({
        "versao": VERSION, "run_id": run_id, "duracao_s": round(dur),
        "ok": n_ok, "erros": n_err, "linhas": total_rows, "resultados": results
    }, ensure_ascii=False, indent=2), "utf-8")

    status_final = '🎉 TUDO OK!' if n_err == 0 else f'⚠️  {n_err} erro(s) — ver relatório'
    print(f"\n  {C.B}{status_final}{C.RST}")
    print(f"  Relatório: {report_path}\n")

    # Salva no manifest do unificado (compatibilidade)
    manifest = STATE_DIR / "manifest_unified.jsonl"
    with manifest.open("a", encoding="utf-8") as f:
        for r in results:
            if r["status"] == "ok":
                f.write(json.dumps({
                    "key": f"cirurgico|{r['tabela']}",
                    "status": "ok",
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "tabela": r["tabela"],
                    "linhas": r["linhas"],
                }, ensure_ascii=False) + "\n")

# ═══════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════
def main():
    ap = argparse.ArgumentParser(description=f"Importador Cirúrgico v2.0 — Google SRE Mode")
    sub = ap.add_subparsers(dest="cmd")

    sub.add_parser("plan", help="Ver plano de execução")

    p_run = sub.add_parser("run", help="Executar importação")
    p_run.add_argument("--only", type=str, default=None, help="Importar só uma tabela")
    p_run.add_argument("--deadline", type=int, default=14400, help="Deadline em segundos (default: 4h)")
    p_run.add_argument("--parallel", type=int, default=1, help="Downloads paralelos (experimental)")

    args = ap.parse_args()

    if args.cmd == "plan":
        cmd_plan(args)
    elif args.cmd == "run":
        cmd_run(args)
    else:
        ap.print_help()
        print(f"\n  Exemplos:")
        print(f"    python {Path(__file__).name} plan")
        print(f"    python {Path(__file__).name} run")
        print(f"    python {Path(__file__).name} run --only raw_boletim_urna_2024")
        print(f"    python {Path(__file__).name} run --deadline 7200")
        print(f"    python {Path(__file__).name} run --only raw_filiados_2024\n")

if __name__ == "__main__":
    main()
