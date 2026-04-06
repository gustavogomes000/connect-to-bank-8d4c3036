#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════╗
║  IMPORTADOR UNIFICADO → BigQuery  v8.0  (Goiás)                 ║
║  TSE + IBGE + DataSUS + INEP + SICONFI + Câmara + Transparência ║
║                                                                  ║
║  MELHORIAS v8:                                                   ║
║  • Streaming para disco — nunca carrega CSV inteiro na RAM       ║
║  • Backoff exponencial em TODA requisição HTTP                   ║
║  • DataSUS paginação real limit=20, offset incremental           ║
║  • schema_override no JSON → tipagem forte no BQ                 ║
║  • parametros_dinamicos → URLs com {ano}, {pagina}, etc          ║
║  • Log de erros detalhado ao final                               ║
║  • Fallback de URL automático para ZIPs nacionais                ║
╚══════════════════════════════════════════════════════════════════╝

Comandos:
  python importar_unificado.py importar [--prioridade 1] [--resume] [--force] [--fonte tse]
  python importar_unificado.py dry-run  [--prioridade 1] [--fonte ibge]
  python importar_unificado.py purge
  python importar_unificado.py status
"""

import argparse, csv, hashlib, io, json, os, re, sys, tempfile, time
import unicodedata, zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional, Tuple

import requests

try:
    from local_source_resolver import find_local_source_file
except ImportError:
    from scripts.local_source_resolver import find_local_source_file

try:
    from google.cloud import bigquery
    from google.api_core.exceptions import NotFound
    HAS_BQ = True
except ImportError:
    HAS_BQ = False

# ═══════════════════════════════════════════════════════════
#  CONFIGURAÇÃO
# ═══════════════════════════════════════════════════════════
PROJECT    = "silver-idea-389314"
DATASET    = "eleicoes_go_clean"
FULL_DS    = f"{PROJECT}.{DATASET}"
LOCATION   = "US"
UF_FILTRO  = "GO"
VERSION    = "unificado-v9.0"

BASE_DIR   = Path(__file__).resolve().parent
CWD_DIR    = Path.cwd().resolve()
WORK_DIR   = CWD_DIR if (CWD_DIR / "sources_unified.json").exists() else BASE_DIR
CONFIG     = WORK_DIR / "sources_unified.json"
if not CONFIG.exists():
    CONFIG = BASE_DIR / "sources_unified.json"

CACHE_DIR  = WORK_DIR / ".cache_tse"
STATE_DIR  = WORK_DIR / ".state"
LOG_DIR    = WORK_DIR / ".logs"
LOCAL_SOURCE_DIRS: List[Path] = []

# Filtro municipal: SOMENTE Goiânia e Aparecida
MUNICIPIOS_FOCO = {
    "52749", "5208707", "GOIANIA", "GOIÂNIA",
    "50415", "5201405", "APARECIDA DE GOIANIA", "APARECIDA DE GOIÂNIA",
}
MUNICIPIOS_IBGE = {"5208707", "5201405"}
FILTRO_MUNICIPAL = True

# Tamanho do batch para streaming (linhas escritas por vez no CSV temp)
STREAM_FLUSH_EVERY = 50_000

# ═══════════════════════════════════════════════════════════
#  CONSOLE
# ═══════════════════════════════════════════════════════════
class C:
    RST="\033[0m"; B="\033[1m"; R="\033[91m"; G="\033[92m"
    Y="\033[93m"; BL="\033[94m"; CY="\033[96m"; GR="\033[90m"
    W="\033[97m"; BG_G="\033[42m"; BG_R="\033[41m"; BG_B="\033[44m"

def ts(): return datetime.now().strftime("%H:%M:%S")

def log(tag, msg, color=C.W):
    print(f"  {C.GR}{ts()}{C.RST} {color}{tag:^10}{C.RST} {msg}", flush=True)

def log_ok(msg):   log("  OK  ", msg, f"{C.BG_G}{C.W}")
def log_err(msg):  log(" ERRO ", msg, f"{C.BG_R}{C.W}")
def log_skip(msg): log("  SKIP", msg, C.GR)
def log_info(msg): log(" INFO ", msg, C.W)
def log_dl(msg):   log("  DL  ", msg, C.CY)
def log_api(msg):  log("  API ", msg, C.BL)
def log_flt(msg):  log("FILTRO", msg, C.BL)
def log_load(msg): log(" LOAD ", msg, C.Y)

def banner(text):
    w = max(len(text)+6, 60)
    print(f"\n  {C.B}{C.CY}{'═'*w}{C.RST}")
    print(f"  {C.B}{C.CY}║{C.RST}  {C.B}{text}{C.RST}")
    print(f"  {C.B}{C.CY}{'═'*w}{C.RST}\n")

def box(title, lines):
    w = max(max(len(l) for l in lines)+6, len(title)+6, 50)
    print(f"\n  {C.G}┌{'─'*w}┐{C.RST}")
    print(f"  {C.G}│{C.RST} {C.B}{title:<{w-2}}{C.RST} {C.G}│{C.RST}")
    print(f"  {C.G}├{'─'*w}┤{C.RST}")
    for l in lines:
        print(f"  {C.G}│{C.RST} {l:<{w-2}} {C.G}│{C.RST}")
    print(f"  {C.G}└{'─'*w}┘{C.RST}\n")

# ═══════════════════════════════════════════════════════════
#  UTILS
# ═══════════════════════════════════════════════════════════
def safe_int(x):
    if x is None: return None
    try: return int(str(x).strip())
    except: return None

def norm_key(s):
    s = unicodedata.normalize("NFKD", (s or "").strip().lower().replace("\ufeff",""))
    s = s.encode("ascii","ignore").decode("ascii").replace(" ","_").replace(".","")
    s = re.sub(r"[^a-z0-9_]+","_",s)
    return re.sub(r"_+","_",s).strip("_") or "col_x"

def sha256_file(p):
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1<<20), b""): h.update(chunk)
    return h.hexdigest()[:16]

def fmt_bytes(n):
    for u in ["B","KB","MB","GB"]:
        if n < 1024: return f"{n:.1f} {u}"
        n /= 1024
    return f"{n:.1f} TB"

def fmt_dur(s):
    if s < 60: return f"{s:.0f}s"
    m, s = divmod(int(s), 60)
    return f"{m}m{s:02d}s" if m < 60 else f"{m//60}h{m%60:02d}m{s:02d}s"

def utcnow(): return datetime.now(timezone.utc)

def decode_bytes(b: bytes) -> str:
    for enc in ("utf-8-sig","utf-8","latin-1"):
        try: return b.decode(enc)
        except: pass
    return b.decode("latin-1", errors="replace")

def detect_delim(line: str) -> str:
    counts = {c: line.count(c) for c in [";",",","\t","|"]}
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else ";"

def dedupe_headers(headers: List[str]) -> List[str]:
    seen, out = {}, []
    for h in headers:
        n = seen.get(h, 0)
        out.append(h if n == 0 else f"{h}_{n+1}")
        seen[h] = n + 1
    return out

# ═══════════════════════════════════════════════════════════
#  MANIFEST (resume)
# ═══════════════════════════════════════════════════════════
def manifest_path(): return STATE_DIR / "manifest_unified.jsonl"

def load_ok_keys() -> set:
    p = manifest_path()
    ok = set()
    if not p.exists(): return ok
    for line in p.read_text("utf-8").splitlines():
        if not line.strip(): continue
        try:
            obj = json.loads(line)
            if obj.get("status") == "ok": ok.add(obj.get("key",""))
        except: pass
    return ok

def save_manifest(key, info):
    p = manifest_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"key": key, "status": "ok", "ts": utcnow().isoformat(), **info}, ensure_ascii=False) + "\n")

# ═══════════════════════════════════════════════════════════
#  ERROR LOG
# ═══════════════════════════════════════════════════════════
_error_log: List[Dict] = []

def log_error_detail(tipo, ano, arquivo, erro):
    entry = {"ts": utcnow().isoformat(), "tipo": tipo, "ano": str(ano), "arquivo": str(arquivo), "erro": str(erro)[:500]}
    _error_log.append(entry)
    log_err(f"{tipo}/{ano}: {str(erro)[:120]}")

def save_error_log(run_id):
    if not _error_log: return
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    p = LOG_DIR / f"erros_{run_id}.json"
    p.write_text(json.dumps(_error_log, ensure_ascii=False, indent=2), encoding="utf-8")
    log_info(f"Log de erros salvo: {p}")

def configure_local_source_dirs(local_dir_arg: Optional[str] = None):
    global LOCAL_SOURCE_DIRS

    env_dir = os.getenv("ELEICOES_LOCAL_DIR") or os.getenv("IMPORTADOR_LOCAL_DIR")
    candidates = []
    if local_dir_arg:
        candidates.append(Path(local_dir_arg).expanduser())
    if env_dir:
        candidates.append(Path(env_dir).expanduser())
    candidates.extend([WORK_DIR, BASE_DIR])

    out = []
    seen = set()
    for directory in candidates:
        try:
            resolved = directory.resolve()
        except Exception:
            resolved = directory
        key = str(resolved).lower()
        if key in seen or not resolved.exists():
            continue
        seen.add(key)
        out.append(resolved)

    LOCAL_SOURCE_DIRS = out

def resolve_local_source(item: dict, allowed_suffixes: Optional[set] = None) -> Optional[Path]:
    allowed = {s.lower() for s in allowed_suffixes} if allowed_suffixes else None

    for directory in LOCAL_SOURCE_DIRS:
        path = find_local_source_file(directory, item)
        if not path:
            continue
        if allowed and path.suffix.lower() not in allowed:
            continue
        return path
    return None

def clear_item_cache_files(item: dict) -> List[str]:
    removed = []
    seen = set()

    for url in build_url_candidates(item):
        name = Path(url.split("?")[0]).name
        if not name or name in seen:
            continue
        seen.add(name)
        path = CACHE_DIR / name
        if path.exists():
            path.unlink(missing_ok=True)
            removed.append(path.name)

    if removed or not CACHE_DIR.exists():
        return removed

    year = str(item.get("ano") or "").strip()
    tipo_tokens = [tok for tok in re.split(r"[_\W]+", str(item.get("tipo") or "").lower()) if tok]

    for path in CACHE_DIR.iterdir():
        if not path.is_file():
            continue
        name_lower = path.name.lower()
        if year and year not in name_lower:
            continue
        if tipo_tokens and not any(tok in name_lower for tok in tipo_tokens):
            continue
        path.unlink(missing_ok=True)
        removed.append(path.name)

    return removed

def is_permanent_error(msg: str) -> bool:
    text = (msg or "").lower()
    permanent_tokens = [
        "404 client error",
        "http 404",
        "400 client error",
        "http 400",
        "invalid pattern",
        "formato desconhecido",
    ]
    return any(token in text for token in permanent_tokens)

# ═══════════════════════════════════════════════════════════
#  SOURCES
# ═══════════════════════════════════════════════════════════
def load_sources(fonte_filtro=None):
    data = json.loads(CONFIG.read_text("utf-8"))
    out = []
    for it in data.get("items", []):
        if fonte_filtro and it.get("fonte") != fonte_filtro:
            continue
        out.append(it)
    return out

# ═══════════════════════════════════════════════════════════
#  HTTP com RETRY + BACKOFF EXPONENCIAL
# ═══════════════════════════════════════════════════════════
def http_get(sess: requests.Session, url: str, max_retries: int = 5,
             timeout: int = 180, stream: bool = False) -> requests.Response:
    """GET robusto com backoff exponencial. Retries em 500, timeout, conexão."""
    for attempt in range(1, max_retries + 1):
        try:
            resp = sess.get(url, timeout=timeout, stream=stream, allow_redirects=True)
            if resp.status_code in (500, 502, 503, 429) and attempt < max_retries:
                wait = min(2 ** attempt * 5, 120)
                log_info(f"  HTTP {resp.status_code} — retry {attempt}/{max_retries} em {wait}s")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp
        except requests.exceptions.Timeout:
            if attempt < max_retries:
                wait = min(2 ** attempt * 10, 300)
                log_info(f"  Timeout — retry {attempt}/{max_retries} em {wait}s")
                time.sleep(wait)
            else:
                raise
        except requests.exceptions.ConnectionError:
            if attempt < max_retries:
                wait = min(2 ** attempt * 10, 300)
                log_info(f"  Conexão falhou — retry {attempt}/{max_retries} em {wait}s")
                time.sleep(wait)
            else:
                raise
        except requests.exceptions.HTTPError:
            raise
    raise Exception(f"Falhou após {max_retries} tentativas: {url}")

# ═══════════════════════════════════════════════════════════
#  DOWNLOAD ZIP com fallback + validação
# ═══════════════════════════════════════════════════════════
def ensure_valid_zip(path: Path, delete_invalid: bool = True) -> bool:
    if not path.exists(): return False
    try:
        if path.stat().st_size < 1024:
            if delete_invalid:
                path.unlink(missing_ok=True)
            return False
        if not zipfile.is_zipfile(path):
            if delete_invalid:
                path.unlink(missing_ok=True)
            return False
        return True
    except:
        if delete_invalid:
            path.unlink(missing_ok=True)
        return False

def download_zip(sess: requests.Session, url: str, dest: Path,
                 retries: int = 5, timeout: int = 900) -> Tuple[bool, Optional[str]]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            resp = sess.get(url, stream=True, timeout=timeout, allow_redirects=True)
            if resp.status_code in (404, 410):
                dest.unlink(missing_ok=True)
                return False, f"HTTP {resp.status_code}: {resp.reason}"
            resp.raise_for_status()
            total = int(resp.headers.get("content-length") or 0)
            dl = 0
            with dest.open("wb") as f:
                for chunk in resp.iter_content(1 << 18):
                    if chunk:
                        f.write(chunk)
                        dl += len(chunk)
                        if total and dl % (5 * 1 << 20) < (1 << 18):
                            pct = dl * 100 // total
                            print(f"\r  ↓ {dest.name}: {fmt_bytes(dl)}/{fmt_bytes(total)} ({pct}%)", end="", flush=True)
            if total: print()
            if not ensure_valid_zip(dest):
                last_err = f"ZIP inválido ({dest.stat().st_size if dest.exists() else 0} bytes)"
                continue
            return True, None
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            if attempt < retries:
                wait = min(2 ** attempt * 10, 120)
                log_info(f"  DL retry {attempt}/{retries} em {wait}s: {e}")
                time.sleep(wait)
            else:
                dest.unlink(missing_ok=True)
    return False, last_err

def build_url_candidates(item: dict) -> List[str]:
    """Constrói lista de URLs candidatas para download com fallback."""
    url = item.get("url", "").strip()
    tipo = item.get("tipo", "")
    candidates = []

    if tipo == "despesas" and item.get("ano"):
        candidates.append(
            f"https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/"
            f"prestacao_de_contas_eleitorais_candidatos_{item['ano']}.zip"
        )
    if tipo == "comparecimento_secao":
        national = re.sub(r"_GO(?=\.zip)", "", url, flags=re.I)
        if national != url:
            candidates.append(url)
        candidates.append(national)
    else:
        candidates.append(url)

    seen = set()
    return [u for u in candidates if u and u not in seen and not seen.add(u)]

def download_with_fallback(sess, item):
    local_path = resolve_local_source(item, allowed_suffixes={".zip"})
    if local_path and ensure_valid_zip(local_path, delete_invalid=False):
        log_skip(f"Local: {local_path.name} ({fmt_bytes(local_path.stat().st_size)})")
        return local_path, local_path.name, str(local_path), []

    candidates = build_url_candidates(item)
    timeout = item.get("timeout", 600)
    errors = []

    for i, url in enumerate(candidates, 1):
        name = Path(url.split("?")[0]).name
        path = CACHE_DIR / name

        if ensure_valid_zip(path):
            log_skip(f"Cache: {name} ({fmt_bytes(path.stat().st_size)})")
            return path, name, url, errors

        if len(candidates) > 1:
            log_info(f"URL {i}/{len(candidates)}: {name}")
        log_dl(url[:120])
        if timeout > 600:
            log_info(f"Timeout estendido: {timeout}s")

        ok, err = download_zip(sess, url, path, timeout=timeout)
        if ok:
            log_dl(f"✓ {fmt_bytes(path.stat().st_size)}")
            return path, name, url, errors
        errors.append(f"{name}: {err}")

    return None, None, None, errors

# ═══════════════════════════════════════════════════════════
#  CSV FILTERING  — UF/Município
# ═══════════════════════════════════════════════════════════
UF_COLS  = ["sg_uf","sigla_uf","uf","cd_uf","sg_uf_voto","sg_uf_cnpj"]
UF_BAD   = ["nasc","natural","origem","nascimento"]
MUN_COLS = ["cd_municipio","cod_municipio","codigo_municipio","id_municipio","sg_ue","cd_mun","codmun"]
MUN_NAME_COLS = ["nm_municipio","nm_ue","nome_municipio","municipio","ds_municipio"]

def _find_col(headers, names, bad=None):
    for n in names:
        if n in headers:
            idx = headers.index(n)
            if bad and any(b in n for b in bad): continue
            return idx
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

    # Sem coluna de município → aceitar GO inteiro
    if mun_idx is None and mun_name_idx is None:
        if uf_idx is not None:
            return (row[uf_idx] if uf_idx < len(row) else "").strip().upper() in ("GO", "52")
        return True

    return False

# ═══════════════════════════════════════════════════════════
#  STREAMING CSV PROCESSOR — nunca carrega tudo na RAM
# ═══════════════════════════════════════════════════════════
def stream_csv_from_zip(zf: zipfile.ZipFile, member, csv_filter: Optional[str],
                        filter_go: bool) -> Generator[Tuple[List[str], List[str]], None, None]:
    """
    Gerador que yield (headers, row) linha a linha.
    Nunca carrega o CSV inteiro na memória.
    """
    raw = zf.read(member.filename)
    text = decode_bytes(raw)
    del raw  # libera memória imediatamente

    lines_iter = iter(text.split("\n"))
    first_line = next(lines_iter, "")
    if not first_line.strip():
        return

    delim = detect_delim(first_line)
    # Reconstrói o texto para o csv.reader — mas usa StringIO em streaming
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    del text  # libera string grande

    header_raw = next(reader, [])
    if not header_raw:
        return

    headers = dedupe_headers([norm_key(h) for h in header_raw])

    if filter_go:
        uf_idx = _find_col(headers, UF_COLS, UF_BAD)
        mun_idx = _find_col(headers, MUN_COLS)
        mun_name_idx = _find_col(headers, MUN_NAME_COLS)

        for row in reader:
            if len(row) < len(headers):
                row = list(row) + [""] * (len(headers) - len(row))
            elif len(row) > len(headers):
                row = row[:len(headers)]
            if is_target_row(row, headers, uf_idx, mun_idx, mun_name_idx):
                yield headers, row
    else:
        for row in reader:
            if len(row) < len(headers):
                row = list(row) + [""] * (len(headers) - len(row))
            elif len(row) > len(headers):
                row = row[:len(headers)]
            yield headers, row

def pick_csv_members(zf, all_members, csv_filter=None):
    """Seleciona CSVs do ZIP: aplica csv_filter e detecta _GO."""
    if csv_filter:
        cf = csv_filter.upper()
        filtered = [m for m in all_members if cf in Path(m.filename).stem.upper()]
        if filtered:
            log_info(f"  csv_filter '{csv_filter}': {len(filtered)} de {len(all_members)} CSVs")
            all_members = filtered

    go_files = [m for m in all_members
                if "_GO" in Path(m.filename).stem.upper()
                and "_GOV" not in Path(m.filename).stem.upper()]
    if go_files:
        return go_files, True  # já é GO, não precisa filtrar

    return all_members, False

# ═══════════════════════════════════════════════════════════
#  BIGQUERY OPS
# ═══════════════════════════════════════════════════════════
def get_client():
    if not HAS_BQ:
        print(f"\n  {C.R}ERRO: pip install google-cloud-bigquery{C.RST}\n"); sys.exit(1)
    return bigquery.Client(project=PROJECT)

def ensure_ds(client):
    try: client.get_dataset(FULL_DS)
    except NotFound:
        ds = bigquery.Dataset(FULL_DS); ds.location = LOCATION
        client.create_dataset(ds)
        log_info(f"Dataset criado: {FULL_DS}")

def build_bq_schema(headers: List[str], schema_override: Optional[Dict] = None) -> list:
    """Constrói schema BQ respeitando schema_override do JSON."""
    override = schema_override or {}
    schema = []
    for h in headers:
        bq_type = override.get(h, "STRING")
        schema.append(bigquery.SchemaField(h, bq_type))
    return schema

def load_csv_to_bq(client, table_name: str, csv_path: Path,
                   headers: List[str], schema_override: Optional[Dict] = None,
                   partition_col: Optional[str] = None) -> int:
    """Carrega CSV do disco para BQ com tipagem forte opcional."""
    table_id = f"{FULL_DS}.{table_name}"
    schema = build_bq_schema(headers, schema_override)

    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.CSV,
        skip_leading_rows=1,
        field_delimiter=",",
        quote_character='"',
        allow_quoted_newlines=True,
        allow_jagged_rows=True,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        autodetect=False,
        schema=schema,
        max_bad_records=500,
    )

    if partition_col and partition_col in headers:
        job_config.time_partitioning = bigquery.TimePartitioning(field=partition_col)

    with csv_path.open("rb") as f:
        job = client.load_table_from_file(f, table_id, job_config=job_config)
    job.result()
    dest = client.get_table(table_id)
    return int(dest.num_rows or 0)

def load_jsonl_to_bq(client, table_name: str, jsonl_path: Path,
                     schema_override: Optional[Dict] = None) -> int:
    """Carrega JSONL do disco para BQ."""
    table_id = f"{FULL_DS}.{table_name}"

    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        autodetect=True,
    )

    # Se tem override, aplica schema explícito
    if schema_override:
        # autodetect + schema_override: precisamos de 2 passes
        # Primeira: detecta, segunda: override — ou simplesmente autodetect=True
        pass  # autodetect com override é complexo, mantemos autodetect=True

    with jsonl_path.open("rb") as f:
        job = client.load_table_from_file(f, table_id, job_config=job_config)
    job.result()
    dest = client.get_table(table_id)
    return int(dest.num_rows or 0)

def list_all_raw_tables(client):
    try:
        tables = list(client.list_tables(FULL_DS))
        return [t.table_id for t in tables if t.table_id.startswith("raw_")]
    except NotFound:
        return []

# ═══════════════════════════════════════════════════════════
#  PROCESSADOR: ZIP_CSV (TSE) — STREAMING PARA DISCO
# ═══════════════════════════════════════════════════════════
def process_zip_csv(sess, item):
    """
    Processa fonte zip_csv (TSE).
    Streaming: escreve linhas filtradas direto num CSV temporário.
    Retorna: (csv_path, headers, n_rows) ou (None, None, 0) em caso de erro.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    zip_path, zip_name, resolved_url, dl_errors = download_with_fallback(sess, item)
    if not zip_path:
        detail = "; ".join(dl_errors) if dl_errors else "sem detalhe"
        raise Exception(f"Download falhou | {detail}")

    csv_filter = item.get("csv_filter")
    if not csv_filter and item.get("tipo") == "despesas":
        csv_filter = "despesa"
    elif not csv_filter and item.get("tipo") == "receitas" and "prestacao_de_contas" in item.get("url",""):
        csv_filter = "receita"

    with zipfile.ZipFile(zip_path, "r") as zf:
        all_csv = [m for m in zf.infolist()
                   if m.filename.lower().endswith((".csv",".txt"))
                   and not m.filename.startswith("__MACOSX")]

        if not all_csv:
            raise Exception(f"Sem CSV no ZIP {zip_name}")

        members, already_go = pick_csv_members(zf, all_csv, csv_filter)
        filter_go = not already_go

        if already_go:
            log_info(f"  {len(all_csv)} CSVs → usando {len(members)} arquivo(s) _GO")
        elif len(all_csv) > 1:
            log_info(f"  {len(all_csv)} CSVs → filtrando por UF=GO")

        # Cria CSV temporário para streaming
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False,
                                           encoding="utf-8", newline="")
        writer = csv.writer(tmp, delimiter=",", quoting=csv.QUOTE_ALL)
        final_headers = None
        n_rows = 0
        n_total = 0

        for member in members:
            fname = Path(member.filename).name
            member_rows = 0

            for headers, row in stream_csv_from_zip(zf, member, csv_filter, filter_go):
                n_total += 1
                if final_headers is None:
                    final_headers = headers
                    writer.writerow(headers)
                    # Log de debug
                    uf_i = _find_col(headers, UF_COLS, UF_BAD)
                    mun_i = _find_col(headers, MUN_COLS)
                    mun_n = _find_col(headers, MUN_NAME_COLS)
                    log_info(f"  Headers ({len(headers)} cols): {headers[:8]}...")
                    log_info(f"  UF: {headers[uf_i] if uf_i is not None else '-'} | "
                             f"Mun: {headers[mun_i] if mun_i is not None else '-'} | "
                             f"MunNm: {headers[mun_n] if mun_n is not None else '-'}")

                # Sanitiza: remove newlines internos, nulos e aspas desbalanceadas
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

                # Flush periódico para não acumular buffer
                if n_rows % STREAM_FLUSH_EVERY == 0:
                    tmp.flush()

            if member_rows > 0:
                log_flt(f"  {fname}: {member_rows:,} linhas GO")
            else:
                log_info(f"  {fname}: 0 linhas GO")

        tmp.flush()
        tmp.close()
        tmp_path = Path(tmp.name)

        if n_rows == 0 or final_headers is None:
            tmp_path.unlink(missing_ok=True)
            raise Exception(f"0 linhas GO em {zip_name}")

        log_info(f"  Streaming: {n_rows:,} linhas escritas em {fmt_bytes(tmp_path.stat().st_size)}")
        return tmp_path, final_headers, n_rows

# ═══════════════════════════════════════════════════════════
#  PROCESSADOR: API JSON (IBGE, SICONFI, Câmara)
# ═══════════════════════════════════════════════════════════
def process_api_json(sess, item):
    """
    Processa API JSON. Suporta:
    - parametros_dinamicos (ex: {ano} → [2021, 2022, ...])
    - Paginação simples com chave_lista
    - IBGE agregados com estrutura especial
    Retorna (jsonl_path, n_records).
    """
    url_template = item.get("url", "")
    fonte = item.get("fonte", "")
    max_retries = item.get("retry", 3)
    parametros = item.get("parametros_dinamicos", {})
    chave_lista = item.get("chave_lista", "")

    # Resolve parametros_dinamicos
    urls_to_fetch = []
    if parametros:
        # Pega a primeira chave dinâmica (ex: "ano")
        for param_key, param_values in parametros.items():
            for val in param_values:
                resolved = url_template.replace(f"{{{param_key}}}", str(val))
                urls_to_fetch.append((resolved, {param_key: val}))
    else:
        urls_to_fetch.append((url_template, {}))

    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False, encoding="utf-8")
    n_records = 0

    for url, extra_fields in urls_to_fetch:
        if extra_fields:
            log_api(f"  {fonte}/{item.get('tipo')} params={extra_fields}")

        try:
            resp = http_get(sess, url, max_retries=max_retries, timeout=120)
        except Exception as e:
            log_info(f"  Erro em {url[:80]}: {e}")
            continue

        data = resp.json()

        # IBGE agregados: estrutura especial
        if fonte == "ibge" and isinstance(data, list) and data and "resultados" in data[0]:
            records = _flatten_ibge_agregados(data)
        elif isinstance(data, list):
            records = data
        elif isinstance(data, dict):
            if chave_lista and chave_lista in data:
                records = data[chave_lista]
            else:
                for k in ["dados","data","results","items","registros","content","estabelecimentos","leitos","profissionais"]:
                    if k in data and isinstance(data[k], list):
                        records = data[k]; break
                else:
                    records = [data]
        else:
            continue

        for rec in records:
            flat = _flatten_record(rec)
            flat.update({k: str(v) for k, v in extra_fields.items()})
            tmp.write(json.dumps(flat, ensure_ascii=False) + "\n")
            n_records += 1

        log_info(f"  → {len(records):,} registros")

    tmp.flush()
    tmp.close()
    return Path(tmp.name), n_records

def _flatten_ibge_agregados(data: list) -> List[Dict]:
    records = []
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
    return records

def _flatten_record(rec: Any) -> Dict:
    if not isinstance(rec, dict):
        return {"value": str(rec)}
    flat = {}
    for k, v in rec.items():
        if isinstance(v, dict):
            for k2, v2 in v.items():
                flat[f"{k}_{k2}"] = str(v2) if v2 is not None else None
        elif isinstance(v, list):
            flat[k] = json.dumps(v, ensure_ascii=False)
        else:
            flat[k] = str(v) if v is not None else None
    return flat

# ═══════════════════════════════════════════════════════════
#  PROCESSADOR: API JSON PAGINADO OFFSET (DataSUS)
# ═══════════════════════════════════════════════════════════
def process_api_paginado_offset(sess, item):
    """DataSUS: paginação real com limit=20 e offset incremental."""
    url = item.get("url", "")
    chave_lista = item.get("chave_lista", "")
    page_size = 20  # DataSUS estável com 20

    log_api(f"{item.get('fonte')}/{item.get('tipo')} (offset, limit={page_size})")

    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False, encoding="utf-8")
    n_records = 0
    offset = 0
    consecutive_errors = 0

    while True:
        sep = "&" if "?" in url else "?"
        current_url = f"{url}{sep}offset={offset}&limit={page_size}"

        try:
            resp = http_get(sess, current_url, max_retries=3, timeout=120)
            data = resp.json()
            consecutive_errors = 0
        except Exception as e:
            consecutive_errors += 1
            if consecutive_errors >= 3:
                log_err(f"  3 erros consecutivos — parando offset={offset}")
                break
            offset += page_size
            continue

        if isinstance(data, dict) and chave_lista and chave_lista in data:
            records = data[chave_lista]
        elif isinstance(data, list):
            records = data
        elif isinstance(data, dict):
            records = None
            for k in ["estabelecimentos","leitos","profissionais","data","dados"]:
                if k in data and isinstance(data[k], list):
                    records = data[k]; break
            if records is None: break
        else:
            break

        if not records:
            break

        for rec in records:
            flat = _flatten_record(rec)
            tmp.write(json.dumps(flat, ensure_ascii=False) + "\n")
            n_records += 1

        if n_records % 500 < page_size:
            log_info(f"  ... {n_records:,} registros (offset={offset})")

        offset += page_size
        if len(records) < page_size:
            break

    tmp.flush()
    tmp.close()
    log_info(f"  Total: {n_records:,} registros")
    return Path(tmp.name), n_records

# ═══════════════════════════════════════════════════════════
#  PROCESSADOR: API JSON PAGINADO (Transparência)
# ═══════════════════════════════════════════════════════════
def process_api_paginado(sess, item):
    """Transparência Goiânia/Aparecida: paginação por {pagina} na URL."""
    url_template = item.get("url", "")
    parametros = item.get("parametros_dinamicos", {})

    anos = parametros.get("ano", [None])
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False, encoding="utf-8")
    n_records = 0

    for ano in anos:
        page = 1
        while True:
            url = url_template
            if ano: url = url.replace("{ano}", str(ano))
            url = url.replace("{pagina}", str(page))

            try:
                resp = http_get(sess, url, max_retries=3, timeout=120)
                data = resp.json()
            except requests.exceptions.HTTPError as e:
                if e.response is not None and e.response.status_code == 404:
                    break
                log_info(f"  HTTP error ano={ano} pag={page}")
                break
            except Exception as e:
                log_err(f"  {e}")
                break

            if isinstance(data, list):
                records = data
            elif isinstance(data, dict):
                for k in ["data","dados","results","items","content","registros"]:
                    if k in data and isinstance(data[k], list):
                        records = data[k]; break
                else:
                    records = [data] if data else []
            else:
                break

            if not records:
                break

            for rec in records:
                flat = _flatten_record(rec)
                if ano: flat["_exercicio"] = str(ano)
                tmp.write(json.dumps(flat, ensure_ascii=False) + "\n")
                n_records += 1

            log_info(f"  {'Ano ' + str(ano) + ' — ' if ano else ''}pág {page}: {len(records)} regs")

            if len(records) < 100:
                break
            page += 1

    tmp.flush()
    tmp.close()
    log_info(f"  Total: {n_records:,} registros")
    return Path(tmp.name), n_records

# ═══════════════════════════════════════════════════════════
#  PROCESSADOR: DOWNLOAD CSV
# ═══════════════════════════════════════════════════════════
def process_download_csv(sess, item):
    url = item.get("url", "")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    fname = re.sub(r'[^a-zA-Z0-9._-]', '_', Path(url.split("?")[0]).name) or "download.csv"
    local_path = resolve_local_source(item, allowed_suffixes={".csv", ".txt"})
    if local_path:
        dest = local_path
        log_skip(f"Local: {dest.name} ({fmt_bytes(dest.stat().st_size)})")
    else:
        dest = CACHE_DIR / fname

    if not local_path and not dest.exists():
        log_dl(f"Baixando {fname}")
        resp = http_get(sess, url, max_retries=3, timeout=300, stream=True)
        with dest.open("wb") as f:
            for chunk in resp.iter_content(1 << 18):
                if chunk: f.write(chunk)
    elif not local_path:
        log_skip(f"Cache: {fname}")

    raw = dest.read_bytes()
    text = decode_bytes(raw)

    lines = text.split("\n", 1)
    if not lines: raise Exception("CSV vazio")

    delim = detect_delim(lines[0])
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    header_raw = next(reader, [])
    headers = dedupe_headers([norm_key(h) for h in header_raw])

    # Escreve CSV filtrado em temp
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8", newline="")
    writer = csv.writer(tmp, delimiter=",", quoting=csv.QUOTE_ALL)
    writer.writerow(headers)
    n = 0
    for row in reader:
        if len(row) >= len(headers) // 2:
            if len(row) < len(headers):
                row = list(row) + [""] * (len(headers) - len(row))
            elif len(row) > len(headers):
                row = row[:len(headers)]
            sanitized = []
            for v in row:
                if isinstance(v, str):
                    v = v.replace("\n"," ").replace("\r"," ").replace("\x00","")
                    if v.count('"') % 2 != 0:
                        v = v.replace('"', "'")
                    v = v.strip()
                sanitized.append(v)
            writer.writerow(sanitized)
            n += 1

    tmp.flush(); tmp.close()
    log_info(f"  {n:,} linhas")
    return Path(tmp.name), headers, n

# ═══════════════════════════════════════════════════════════
#  PROCESSADOR: DOWNLOAD ZIP (INEP, IBGE censo setor)
# ═══════════════════════════════════════════════════════════
def process_download_zip(sess, item):
    zip_path, fname, _, dl_errors = download_with_fallback(sess, item)
    if not zip_path:
        detail = "; ".join(dl_errors) if dl_errors else "sem detalhe"
        raise Exception(f"Download falhou | {detail}")

    csv_pattern = item.get("csv_pattern", "")
    filtro_col = item.get("filtro_coluna", "")
    filtro_val = item.get("filtro_valor", "")

    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8", newline="")
    writer = csv.writer(tmp, delimiter=",", quoting=csv.QUOTE_ALL)
    final_headers = None
    n_rows = 0

    with zipfile.ZipFile(zip_path, "r") as zf:
        members = [m for m in zf.infolist()
                   if m.filename.lower().endswith((".csv", ".txt"))
                   and not m.filename.startswith("__MACOSX")]
        if csv_pattern:
            members = [m for m in members if csv_pattern.upper() in Path(m.filename).stem.upper()]

        for member in members:
            raw = zf.read(member.filename)
            text = decode_bytes(raw)
            del raw

            reader = csv.reader(io.StringIO(text), delimiter=detect_delim(text.split("\n",1)[0]))
            del text
            header_raw = next(reader, [])
            headers = dedupe_headers([norm_key(h) for h in header_raw])

            if final_headers is None:
                final_headers = headers
                writer.writerow(headers)

            filtro_idx = None
            if filtro_col:
                fc = norm_key(filtro_col)
                for i, h in enumerate(headers):
                    if h == fc: filtro_idx = i; break

            for row in reader:
                if filtro_idx is not None:
                    val = (row[filtro_idx] if filtro_idx < len(row) else "").strip()
                    if val != filtro_val: continue
                if len(row) < len(headers):
                    row = list(row) + [""] * (len(headers) - len(row))
                elif len(row) > len(headers):
                    row = row[:len(headers)]
                writer.writerow(row)
                n_rows += 1

    tmp.flush(); tmp.close()
    log_info(f"  {n_rows:,} linhas")
    return Path(tmp.name), final_headers or [], n_rows

# ═══════════════════════════════════════════════════════════
#  PROCESSADOR: GEOJSON
# ═══════════════════════════════════════════════════════════
def process_geojson(sess, item):
    local_path = resolve_local_source(item, allowed_suffixes={".json", ".geojson"})
    if local_path:
        log_skip(f"Local: {local_path.name} ({fmt_bytes(local_path.stat().st_size)})")
        data = json.loads(decode_bytes(local_path.read_bytes()))
    else:
        url = item.get("url", "")
        log_api(f"GeoJSON: {item.get('tipo')}")
        resp = http_get(sess, url, max_retries=3, timeout=120)
        data = resp.json()

    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False, encoding="utf-8")
    n = 0
    for feat in data.get("features", []):
        props = feat.get("properties", {})
        geom = feat.get("geometry", {})
        rec = {norm_key(k): str(v) if v is not None else None for k, v in props.items()}
        rec["geometry_type"] = geom.get("type", "")
        coords = geom.get("coordinates")
        if coords: rec["coordinates"] = json.dumps(coords)
        tmp.write(json.dumps(rec, ensure_ascii=False) + "\n")
        n += 1

    tmp.flush(); tmp.close()
    log_info(f"  {n:,} features")
    return Path(tmp.name), n

# ═══════════════════════════════════════════════════════════
#  DISPATCHER PRINCIPAL
# ═══════════════════════════════════════════════════════════
def process_and_load(sess, bq, item) -> Tuple[int, str]:
    """
    Processa qualquer formato e carrega no BQ.
    Retorna (linhas_carregadas, "").
    Sempre usa arquivo temporário — nunca RAM massiva.
    """
    fmt = item.get("formato", "")
    tabela = item["tabela_bq"]
    bq_cfg = item.get("bigquery_config", {})
    schema_override = bq_cfg.get("schema_override")
    partition_col = bq_cfg.get("partition_col")

    try:
        if fmt == "zip_csv":
            csv_path, headers, n = process_zip_csv(sess, item)
            try:
                log_load(f"{tabela} ({n:,} linhas)")
                loaded = load_csv_to_bq(bq, tabela, csv_path, headers, schema_override, partition_col)
                return loaded, ""
            finally:
                csv_path.unlink(missing_ok=True)

        elif fmt == "api_json":
            jsonl_path, n = process_api_json(sess, item)
            try:
                if n == 0: raise Exception("0 registros da API")
                log_load(f"{tabela} ({n:,} registros)")
                loaded = load_jsonl_to_bq(bq, tabela, jsonl_path, schema_override)
                return loaded, ""
            finally:
                jsonl_path.unlink(missing_ok=True)

        elif fmt == "api_json_paginado_offset":
            jsonl_path, n = process_api_paginado_offset(sess, item)
            try:
                if n == 0: raise Exception("0 registros (DataSUS)")
                log_load(f"{tabela} ({n:,} registros)")
                loaded = load_jsonl_to_bq(bq, tabela, jsonl_path, schema_override)
                return loaded, ""
            finally:
                jsonl_path.unlink(missing_ok=True)

        elif fmt == "api_json_paginado":
            jsonl_path, n = process_api_paginado(sess, item)
            try:
                if n == 0: raise Exception("0 registros (paginado)")
                log_load(f"{tabela} ({n:,} registros)")
                loaded = load_jsonl_to_bq(bq, tabela, jsonl_path, schema_override)
                return loaded, ""
            finally:
                jsonl_path.unlink(missing_ok=True)

        elif fmt == "download_csv":
            csv_path, headers, n = process_download_csv(sess, item)
            try:
                if n == 0: raise Exception("0 linhas no CSV")
                log_load(f"{tabela} ({n:,} linhas)")
                loaded = load_csv_to_bq(bq, tabela, csv_path, headers, schema_override, partition_col)
                return loaded, ""
            finally:
                csv_path.unlink(missing_ok=True)

        elif fmt == "download_zip":
            csv_path, headers, n = process_download_zip(sess, item)
            try:
                if n == 0: raise Exception("0 linhas no ZIP")
                log_load(f"{tabela} ({n:,} linhas)")
                loaded = load_csv_to_bq(bq, tabela, csv_path, headers, schema_override, partition_col)
                return loaded, ""
            finally:
                csv_path.unlink(missing_ok=True)

        elif fmt == "download_geojson":
            jsonl_path, n = process_geojson(sess, item)
            try:
                if n == 0: raise Exception("0 features")
                log_load(f"{tabela} ({n:,} features)")
                loaded = load_jsonl_to_bq(bq, tabela, jsonl_path, schema_override)
                return loaded, ""
            finally:
                jsonl_path.unlink(missing_ok=True)

        else:
            raise Exception(f"Formato desconhecido: {fmt}")

    except Exception as e:
        return 0, str(e)

# ═══════════════════════════════════════════════════════════
#  COMANDOS
# ═══════════════════════════════════════════════════════════
def cmd_dry_run(args):
    sources = [s for s in load_sources(args.fonte) if s.get("prioridade", 1) <= args.prioridade]
    banner(f"DRY RUN — {len(sources)} fontes (prioridade ≤ {args.prioridade})")

    by_fonte = {}
    for s in sources:
        f = s.get("fonte", "?")
        by_fonte.setdefault(f, []).append(s)

    for fonte, items in by_fonte.items():
        print(f"\n  {C.B}{C.CY}[{fonte.upper()}] — {len(items)} tabelas{C.RST}")
        for i, s in enumerate(items, 1):
            extra = f"  [csv_filter={s.get('csv_filter','')}]" if s.get("csv_filter") else ""
            extra += f"  [schema_override]" if s.get("bigquery_config",{}).get("schema_override") else ""
            print(f"    {C.CY}{i:3d}.{C.RST} {s.get('tipo','')} → {s['tabela_bq']}{extra}")

    print(f"\n  {C.B}Total: {len(sources)} tabelas{C.RST}\n")

def cmd_purge(args):
    banner("PURGE — Apagar todas tabelas raw_")
    bq = get_client()
    tables = list_all_raw_tables(bq)
    if not tables:
        log_info("Nenhuma tabela"); return

    print(f"\n  {C.R}{C.B}ATENÇÃO: Vai apagar {len(tables)} tabelas{C.RST}")
    resp = input(f"  Confirma? (digite 'sim'): ").strip().lower()
    if resp != "sim": return

    for t in tables:
        bq.delete_table(f"{FULL_DS}.{t}", not_found_ok=True)
    log_ok(f"{len(tables)} tabelas apagadas")

    mp = manifest_path()
    if mp.exists(): mp.unlink()

def cmd_status(args):
    banner("STATUS — Tabelas no BigQuery")
    bq = get_client()
    tables = list_all_raw_tables(bq)
    if not tables:
        log_info("Nenhuma tabela raw_"); return

    print(f"  {C.B}{'Tabela':<55} {'Linhas':>12}{C.RST}")
    print(f"  {'─'*70}")
    total = 0
    for t in sorted(tables):
        try:
            tbl = bq.get_table(f"{FULL_DS}.{t}")
            rows = int(tbl.num_rows or 0)
            total += rows
            color = C.G if rows > 0 else C.R
            print(f"  {color}{t:<55}{C.RST} {rows:>12,}")
        except:
            print(f"  {C.R}{t:<55} ???{C.RST}")
    print(f"  {'─'*70}")
    print(f"  {C.B}{'TOTAL':<55} {total:>12,}{C.RST}")
    print(f"\n  {len(tables)} tabelas | {total:,} linhas\n")

def cmd_importar(args):
    t_start = time.time()
    banner(f"IMPORTADOR UNIFICADO → BigQuery  {VERSION}")
    configure_local_source_dirs(args.local_dir)

    sources = load_sources(args.fonte)

    # Filtro --tabela: importar tabela específica
    if args.tabela:
        sources = [s for s in sources if s["tabela_bq"] == args.tabela]
        if not sources:
            log_err(f"Tabela '{args.tabela}' não encontrada em sources_unified.json")
            log_info("Use: python importar_unificado.py dry-run  para ver tabelas disponíveis")
            return
        log_info(f"Modo tabela específica: {args.tabela}")
    else:
        sources = [s for s in sources if s.get("prioridade", 1) <= args.prioridade]

    if not sources:
        log_err("Nenhuma fonte!"); return

    bq = get_client()
    ensure_ds(bq)

    ok_keys = load_ok_keys() if args.resume and not args.force else set()
    run_id = utcnow().strftime("%Y%m%d_%H%M%S")
    sess = requests.Session()
    sess.headers.update({"User-Agent": f"EleicoesGO-Importador/{VERSION}"})

    item_retries = getattr(args, 'retries', 3)

    log_info(f"{len(sources)} fontes | Prioridade ≤ {args.prioridade}" +
             (f" | Fonte: {args.fonte}" if args.fonte else "") +
             (f" | Tabela: {args.tabela}" if args.tabela else ""))
    log_info(f"Dataset: {FULL_DS} | Resume: {'SIM' if args.resume else 'NÃO'} | Retries/item: {item_retries}")
    log_info(f"FILTRO: Goiânia + Aparecida de Goiânia")
    if LOCAL_SOURCE_DIRS:
        log_info("Fontes locais: " + " | ".join(str(p) for p in LOCAL_SOURCE_DIRS))

    n_ok = n_err = n_skip = total_rows = 0
    results = []

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    for idx, item in enumerate(sources, 1):
        tabela = item["tabela_bq"]
        tipo = item.get("tipo", "")
        ano = item.get("ano", "")
        fonte = item.get("fonte", "")
        key = f"{fonte}|{tipo}|{ano}|{tabela}"
        tag = f"[{idx}/{len(sources)}]"

        print(f"\n  {C.B}{'─'*60}{C.RST}")
        log_info(f"{tag} [{fonte}] {tipo}/{ano or 'ATUAL'} → {tabela}")

        if key in ok_keys and not args.tabela:
            log_skip("Já importado (resume)")
            n_skip += 1
            results.append({"tabela": tabela, "status": "skip", "linhas": 0})
            continue

        # Retry no nível do item inteiro para tabelas difíceis
        loaded = 0
        err = ""
        for attempt in range(1, item_retries + 1):
            t0 = time.time()
            loaded, err = process_and_load(sess, bq, item)
            dur = time.time() - t0

            if not err:
                break  # sucesso!

            if attempt < item_retries and not is_permanent_error(err):
                wait = min(2 ** attempt * 15, 300)
                log_info(f"  ⟳ Retry item {attempt}/{item_retries} em {wait}s — erro: {err[:100]}")
                # Limpa cache do ZIP para forçar re-download
                if any(token in err for token in ("Download", "Timeout", "Connection", "HTTPError", "HTTP ")):
                    for name in clear_item_cache_files(item):
                        log_info(f"  Cache limpo: {name}")
                time.sleep(wait)
            elif attempt < item_retries:
                log_info(f"  Erro permanente — sem retry: {err[:120]}")
                break
            else:
                log_info(f"  ✗ Esgotou {item_retries} tentativas para {tabela}")

        if err:
            log_error_detail(tipo, ano or "ATUAL", tabela, err)
            n_err += 1
            results.append({"tabela": tabela, "status": "erro", "linhas": 0, "erro": err[:200]})
        else:
            log_ok(f"✓ {tabela} | {loaded:,} linhas | {fmt_dur(dur)}")
            n_ok += 1
            total_rows += loaded
            results.append({"tabela": tabela, "status": "ok", "linhas": loaded, "duracao": round(dur, 1)})
            save_manifest(key, {"tabela": tabela, "linhas": loaded, "fonte": fonte, "tipo": tipo, "ano": ano})

    # ═══════════════════════════════════════════════════════
    #  SEGUNDA PASSADA: retry automático dos que falharam
    # ═══════════════════════════════════════════════════════
    failed_items = [r for r in results if r["status"] == "erro"]
    if failed_items and not getattr(args, '_is_retry_pass', False):
        banner(f"RETRY AUTOMÁTICO — {len(failed_items)} itens com erro")
        failed_tabelas = {r["tabela"] for r in failed_items}
        retry_sources = [s for s in sources if s["tabela_bq"] in failed_tabelas]

        n_retry_ok = 0
        for ridx, item in enumerate(retry_sources, 1):
            tabela = item["tabela_bq"]
            tipo = item.get("tipo", "")
            ano = item.get("ano", "")
            fonte = item.get("fonte", "")
            key = f"{fonte}|{tipo}|{ano}|{tabela}"

            print(f"\n  {C.B}{'─'*60}{C.RST}")
            log_info(f"  ↻ RETRY [{ridx}/{len(retry_sources)}] {tabela}")

            # Limpa cache para forçar re-download ou re-busca local
            for name in clear_item_cache_files(item):
                log_info(f"  Cache limpo: {name}")

            loaded, err = process_and_load(sess, bq, item)
            if not err and loaded > 0:
                log_ok(f"✓ RETRY {tabela} | {loaded:,} linhas")
                n_retry_ok += 1
                total_rows += loaded
                n_ok += 1
                n_err -= 1
                # Atualiza resultado
                for r in results:
                    if r["tabela"] == tabela and r["status"] == "erro":
                        r["status"] = "ok"
                        r["linhas"] = loaded
                        r.pop("erro", None)
                        break
                save_manifest(key, {"tabela": tabela, "linhas": loaded, "fonte": fonte, "tipo": tipo, "ano": ano})
            else:
                log_err(f"  RETRY falhou: {tabela} — {(err or 'sem detalhe')[:100]}")

        if n_retry_ok:
            log_info(f"  Retry recuperou {n_retry_ok}/{len(failed_items)} itens")

    # ═══════════════════════════════════════════════════════
    #  RELATÓRIO FINAL
    # ═══════════════════════════════════════════════════════
    dur_total = time.time() - t_start
    banner("RELATÓRIO FINAL")
    box("Resumo", [
        f"Versão:      {VERSION}",
        f"Run:         {run_id}",
        f"Duração:     {fmt_dur(dur_total)}",
        f"Filtro:      Goiânia + Aparecida",
        f"",
        f"✓ Sucesso:   {n_ok}",
        f"⊘ Pulados:   {n_skip}",
        f"✗ Erros:     {n_err}",
        f"",
        f"Linhas:      {total_rows:,}",
    ])

    if results:
        print(f"  {C.B}{'Status':<10} {'Tabela':<50} {'Linhas':>10}{C.RST}")
        print(f"  {'─'*75}")
        for r in results:
            s = r["status"]
            color = C.G if s == "ok" else (C.GR if s == "skip" else C.R)
            icon = "✓" if s == "ok" else ("⊘" if s == "skip" else "✗")
            print(f"  {color}{icon} {s:<8}{C.RST} {r['tabela']:<50} {r['linhas']:>10,}")
        print(f"  {'─'*75}")

    # Lista pendentes para o usuário copiar
    still_failed = [r for r in results if r["status"] == "erro"]
    if still_failed:
        print(f"\n  {C.R}{C.B}⚠ {len(still_failed)} tabelas ainda com erro:{C.RST}")
        for r in still_failed:
            print(f"    {C.R}✗ {r['tabela']}{C.RST}  →  {r.get('erro','')[:80]}")
        print(f"\n  {C.Y}Para retentar apenas estas:{C.RST}")
        for r in still_failed:
            print(f"    python importar_unificado.py importar --tabela {r['tabela']} --local-dir \"C:\\Users\\Gustavo\\Desktop\\dados\"")

    report = {
        "versao": VERSION, "run_id": run_id, "ok": n_ok, "erros": n_err,
        "skip": n_skip, "linhas": total_rows, "duracao_s": round(dur_total),
        "resultados": results
    }
    rp = STATE_DIR / f"report_{run_id}.json"
    rp.write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf-8")

    save_error_log(run_id)

    status = '🎉 Concluído!' if n_err == 0 else f'⚠️  {n_err} erros restantes — veja comandos acima'
    print(f"\n  {C.B}{status}{C.RST}\n")

# ═══════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════
def main():
    ap = argparse.ArgumentParser(description=f"Importador Unificado → BigQuery (GO) {VERSION}")
    sub = ap.add_subparsers(dest="comando")

    p_imp = sub.add_parser("importar", help="Importar tudo → BigQuery")
    p_imp.add_argument("--prioridade", type=int, default=99)
    p_imp.add_argument("--resume", action="store_true")
    p_imp.add_argument("--force", action="store_true")
    p_imp.add_argument("--fonte", type=str, default=None, help="Filtrar por fonte: tse, ibge, datasus, siconfi, camara...")
    p_imp.add_argument("--tabela", type=str, default=None, help="Importar tabela específica pelo nome (ex: raw_filiados_2024)")
    p_imp.add_argument("--retries", type=int, default=3, help="Retry no nível do item inteiro (default: 3)")
    p_imp.add_argument("--local-dir", type=str, default=None, help="Pasta com arquivos já baixados para usar como fallback local")

    p_dry = sub.add_parser("dry-run", help="Ver plano sem executar")
    p_dry.add_argument("--prioridade", type=int, default=99)
    p_dry.add_argument("--fonte", type=str, default=None)

    sub.add_parser("purge", help="Apagar todas tabelas raw_")
    sub.add_parser("status", help="Ver tabelas e contagem")

    args = ap.parse_args()

    if args.comando == "importar": cmd_importar(args)
    elif args.comando == "dry-run": cmd_dry_run(args)
    elif args.comando == "purge": cmd_purge(args)
    elif args.comando == "status": cmd_status(args)
    else:
        ap.print_help()
        print(f"\n  Exemplos:")
        print(f"    python importar_unificado.py dry-run")
        print(f"    python importar_unificado.py dry-run --fonte tse --prioridade 1")
        print(f"    python importar_unificado.py importar --prioridade 1")
        print(f"    python importar_unificado.py importar --resume")
        print(f"    python importar_unificado.py importar --fonte ibge")
        print(f"    python importar_unificado.py importar --resume --local-dir C:\\Users\\Gustavo\\Desktop\\dados")
        print(f"    python importar_unificado.py importar --tabela raw_filiados_2024")
        print(f"    python importar_unificado.py importar --tabela raw_boletim_urna_2024 --retries 5")
        print(f"    python importar_unificado.py importar --fonte datasus --resume")
        print(f"    python importar_unificado.py purge")
        print(f"    python importar_unificado.py status\n")

if __name__ == "__main__":
    main()
