#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════╗
║  IMPORTADOR AGRESSIVO — 10 tabelas pendentes                     ║
║  Estratégias múltiplas: se uma falha, tenta a próxima            ║
║  NÃO PARA até conseguir ou esgotar TODAS as alternativas         ║
╚══════════════════════════════════════════════════════════════════╝

  python importar_pendentes.py
"""

import csv, io, json, os, re, sys, tempfile, time, zipfile, unicodedata
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Tuple

import requests

try:
    from google.cloud import bigquery
    from google.api_core.exceptions import NotFound
except ImportError:
    print("ERRO: pip install google-cloud-bigquery")
    sys.exit(1)

# ═══════════════════════════════════════════════════════════
#  CONFIG
# ═══════════════════════════════════════════════════════════
PROJECT  = "silver-idea-389314"
DATASET  = "eleicoes_go_clean"
FULL_DS  = f"{PROJECT}.{DATASET}"
LOCATION = "US"

BASE_DIR  = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / ".cache_tse"
LOG_DIR   = BASE_DIR / ".logs"
CACHE_DIR.mkdir(exist_ok=True)
LOG_DIR.mkdir(exist_ok=True)

# Municípios foco
MUN_CODES = {"52749","5208707","50415","5201405"}
MUN_NAMES = {"GOIANIA","GOIÂNIA","APARECIDA DE GOIANIA","APARECIDA DE GOIÂNIA"}
UF_COLS   = ["sg_uf","sigla_uf","uf","cd_uf","cod_uf","sg_uf_voto","sg_uf_cnpj"]
UF_BAD    = ["nasc","natural","origem","nascimento"]
MUN_COLS  = ["cd_municipio","cod_municipio","codigo_municipio","id_municipio","sg_ue","cd_mun"]
MUN_NAME_COLS = ["nm_municipio","nm_ue","nome_municipio","municipio","ds_municipio"]

# ═══════════════════════════════════════════════════════════
#  TABELAS PENDENTES
# ═══════════════════════════════════════════════════════════
PENDENTES_TSE = [
    {
        "tabela": "raw_despesas_2024",
        "csv_filter": "despesa",
        "urls": [
            "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2024.zip",
            "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/despesas_contratadas_candidatos_2024.zip",
        ],
    },
    {
        "tabela": "raw_despesas_2022",
        "csv_filter": "despesa",
        "urls": [
            "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2022.zip",
            "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/despesas_contratadas_candidatos_2022.zip",
        ],
    },
    {
        "tabela": "raw_despesas_2020",
        "csv_filter": "despesa",
        "urls": [
            "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2020.zip",
            "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/despesas_contratadas_candidatos_2020.zip",
        ],
    },
    {
        "tabela": "raw_despesas_2018",
        "csv_filter": "despesa",
        "urls": [
            "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2018.zip",
            "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/despesas_contratadas_candidatos_2018.zip",
        ],
    },
    {
        "tabela": "raw_filiados_2024",
        "csv_filter": None,
        "urls": [
            "https://cdn.tse.jus.br/estatistica/sead/odsele/filiacao_partidaria/filiados_todos_2024.zip",
        ],
    },
    {
        "tabela": "raw_legendas_2024",
        "csv_filter": None,
        "urls": [
            "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_legendas/consulta_legendas_2024.zip",
        ],
    },
    {
        "tabela": "raw_legendas_2022",
        "csv_filter": None,
        "urls": [
            "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_legendas/consulta_legendas_2022.zip",
        ],
    },
    {
        "tabela": "raw_boletim_urna_2024",
        "csv_filter": None,
        "urls": [
            "https://cdn.tse.jus.br/estatistica/sead/odsele/boletim_urna/boletim_urna_2024_GO.zip",
        ],
    },
    {
        "tabela": "raw_boletim_urna_2022",
        "csv_filter": None,
        "urls": [
            "https://cdn.tse.jus.br/estatistica/sead/odsele/boletim_urna/boletim_urna_2022_GO.zip",
        ],
    },
]

# IBGE — múltiplos agregados candidatos para cada dado
PENDENTES_IBGE = [
    {
        "tabela": "raw_ibge_censo_alfabetizacao",
        "descricao": "Alfabetização Goiânia/Aparecida",
        "urls": [
            # Agregado 4714 — Pessoas de 5+ anos por alfabetização (Censo 2022 - Resultados)
            "https://servicodados.ibge.gov.br/api/v3/agregados/4714/periodos/2022/variaveis/93?localidades=N6[5208707,5201405]&classificacao=67[all]",
            # Agregado 9543 — se existir
            "https://servicodados.ibge.gov.br/api/v3/agregados/9543/periodos/2022/variaveis/93?localidades=N6[5208707,5201405]",
            # Agregado 7113 — Pessoas por alfabetização (universo)
            "https://servicodados.ibge.gov.br/api/v3/agregados/7113/periodos/2022/variaveis/93?localidades=N6[5208707,5201405]&classificacao=67[all]",
            # Agregado 4714 sem classificação
            "https://servicodados.ibge.gov.br/api/v3/agregados/4714/periodos/2022/variaveis/93?localidades=N6[5208707,5201405]",
            # Censo 2010 fallback
            "https://servicodados.ibge.gov.br/api/v3/agregados/3540/periodos/2010/variaveis/93?localidades=N6[5208707,5201405]&classificacao=67[all]",
        ],
    },
    {
        "tabela": "raw_ibge_censo_domicilios",
        "descricao": "Domicílios Goiânia/Aparecida",
        "urls": [
            # Agregado 4709 — Domicílios por tipo
            "https://servicodados.ibge.gov.br/api/v3/agregados/4709/periodos/2022/variaveis/381?localidades=N6[5208707,5201405]",
            # Agregado 9553
            "https://servicodados.ibge.gov.br/api/v3/agregados/9553/periodos/2022/variaveis/216?localidades=N6[5208707,5201405]",
            # Agregado 4709 com classificação espécie
            "https://servicodados.ibge.gov.br/api/v3/agregados/4709/periodos/2022/variaveis/381?localidades=N6[5208707,5201405]&classificacao=1[all]",
            # Agregado 6706 — Domicílios particulares
            "https://servicodados.ibge.gov.br/api/v3/agregados/6706/periodos/2022/variaveis/381?localidades=N6[5208707,5201405]",
            # Censo 2010 fallback
            "https://servicodados.ibge.gov.br/api/v3/agregados/1378/periodos/2010/variaveis/137?localidades=N6[5208707,5201405]&classificacao=57[all]",
        ],
    },
]


# ═══════════════════════════════════════════════════════════
#  UTILS
# ═══════════════════════════════════════════════════════════
class C:
    RST="\033[0m"; B="\033[1m"; R="\033[91m"; G="\033[92m"
    Y="\033[93m"; BL="\033[94m"; CY="\033[96m"; GR="\033[90m"

def ts(): return datetime.now().strftime("%H:%M:%S")
def log_ok(msg):   print(f"  {C.GR}{ts()}{C.RST} {C.G}   ✓  {C.RST} {msg}", flush=True)
def log_err(msg):  print(f"  {C.GR}{ts()}{C.RST} {C.R}  ✗  {C.RST} {msg}", flush=True)
def log_info(msg): print(f"  {C.GR}{ts()}{C.RST} {C.BL}  ℹ  {C.RST} {msg}", flush=True)
def log_try(msg):  print(f"  {C.GR}{ts()}{C.RST} {C.Y}  ⟳  {C.RST} {msg}", flush=True)

def decode(b):
    for enc in ("utf-8-sig","utf-8","latin-1"):
        try: return b.decode(enc)
        except: pass
    return b.decode("latin-1", errors="replace")

def norm_h(h):
    h = h.strip().strip('"').strip()
    h = unicodedata.normalize("NFKD", h).encode("ascii","ignore").decode("ascii")
    return re.sub(r'[^a-z0-9_]', '_', h.lower()).strip('_')

def sanitize(val):
    if not val: return ""
    val = val.replace("\r\n"," ").replace("\r"," ").replace("\n"," ").replace("\x00","")
    if val.count('"') % 2 != 0:
        val = val.replace('"', "'")
    return val.strip()

def detect_delim(line):
    if ";" in line and "," not in line: return ";"
    if line.count(";") > line.count(","): return ";"
    return ","

def dedupe(headers):
    seen = {}
    out = []
    for h in headers:
        if h in seen:
            seen[h] += 1
            out.append(f"{h}_{seen[h]}")
        else:
            seen[h] = 0
            out.append(h)
    return out

def find_col(headers, candidates, bad_words=None):
    for name in candidates:
        if name in headers:
            idx = headers.index(name)
            if bad_words and any(b in name for b in bad_words):
                continue
            return idx
    return None

def normalize_name(val):
    return unicodedata.normalize("NFKD", val.strip().upper()).encode("ascii","ignore").decode("ascii")

def is_go_row(headers, row, uf_idx, mun_idx, mun_name_idx):
    """Aceita a linha se é de GO (Goiânia ou Aparecida)."""
    if uf_idx is not None:
        uf_val = (row[uf_idx] if uf_idx < len(row) else "").strip().upper()
        if uf_val not in ("GO", "52"):
            return False

    # Tenta código município
    if mun_idx is not None:
        val = (row[mun_idx] if mun_idx < len(row) else "").strip()
        val_clean = re.sub(r"\D", "", val)
        if val_clean in MUN_CODES or val.upper() in MUN_NAMES:
            return True

    # Tenta nome município
    if mun_name_idx is not None:
        val = (row[mun_name_idx] if mun_name_idx < len(row) else "").strip()
        norm = normalize_name(val)
        if norm in MUN_NAMES or "GOIANIA" in norm or "APARECIDA DE GOIANIA" in norm:
            return True

    # Sem coluna de município → aceitar GO inteiro
    if mun_idx is None and mun_name_idx is None:
        if uf_idx is not None:
            return True  # Já validou GO acima
        return True  # Sem filtro possível

    return False


# ═══════════════════════════════════════════════════════════
#  DOWNLOAD com retry agressivo
# ═══════════════════════════════════════════════════════════
def download_with_retry(url, dest, max_retries=5):
    """Download com até 5 tentativas, backoff exponencial."""
    for attempt in range(1, max_retries + 1):
        try:
            log_try(f"  Download tentativa {attempt}/{max_retries}: {Path(url).name}")
            sess = requests.Session()
            sess.headers.update({"User-Agent": "Mozilla/5.0 (importador-eleicoes-go)"})
            resp = sess.get(url, timeout=600, stream=True)
            resp.raise_for_status()
            total = int(resp.headers.get("content-length", 0))
            downloaded = 0
            with dest.open("wb") as f:
                for chunk in resp.iter_content(1 << 18):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
            if total > 0 and downloaded < total * 0.95:
                raise Exception(f"Download incompleto: {downloaded}/{total}")
            log_ok(f"  Download OK: {dest.name} ({downloaded:,} bytes)")
            return True
        except Exception as e:
            log_err(f"  Tentativa {attempt} falhou: {e}")
            if dest.exists():
                dest.unlink()
            if attempt < max_retries:
                wait = 2 ** attempt * 5
                log_info(f"  Aguardando {wait}s...")
                time.sleep(wait)
    return False


# ═══════════════════════════════════════════════════════════
#  ESTRATÉGIA 1: Processar CSV completo em Python, sanitizar TUDO
# ═══════════════════════════════════════════════════════════
def strategy_full_sanitize(client, tabela, zip_path, csv_filter):
    """Lê todo o CSV, sanitiza cada campo, grava CSV limpo, sobe pro BQ."""
    log_try(f"  Estratégia 1: sanitização completa em Python")

    with zipfile.ZipFile(zip_path, "r") as zf:
        members = [m for m in zf.infolist()
                   if m.filename.lower().endswith((".csv",".txt"))
                   and not m.filename.startswith("__MACOSX")]

        if csv_filter:
            cf = csv_filter.upper()
            filtered = [m for m in members if cf in Path(m.filename).stem.upper()]
            if filtered:
                members = filtered

        # Procura arquivo _GO primeiro
        go_files = [m for m in members if "_GO" in Path(m.filename).stem.upper()
                    and "_GOV" not in Path(m.filename).stem.upper()]
        if go_files:
            members = go_files
            filter_go = False
        else:
            filter_go = True

        log_info(f"  {len(members)} CSV(s) a processar")

        all_headers = None
        all_rows = []

        for member in members:
            fname = Path(member.filename).name
            log_info(f"  Lendo: {fname}")
            raw = zf.read(member.filename)
            text = decode(raw)
            del raw

            delim = detect_delim(text.split("\n", 1)[0])

            # ESTRATÉGIA AGRESSIVA: ler linha por linha com tratamento de erros
            reader = csv.reader(io.StringIO(text), delimiter=delim)
            try:
                header_raw = next(reader)
            except StopIteration:
                continue

            headers = dedupe([norm_h(h) for h in header_raw])
            if all_headers is None:
                all_headers = headers
                uf_idx = find_col(headers, UF_COLS, UF_BAD)
                mun_idx = find_col(headers, MUN_COLS)
                mun_name_idx = find_col(headers, MUN_NAME_COLS)
                log_info(f"  {len(headers)} colunas | UF={uf_idx} MUN={mun_idx} MUN_NM={mun_name_idx}")

            n_total = 0
            n_ok = 0
            n_err = 0
            for row in reader:
                n_total += 1
                try:
                    # Ajustar colunas
                    if len(row) < len(headers):
                        row = list(row) + [""] * (len(headers) - len(row))
                    elif len(row) > len(headers):
                        row = row[:len(headers)]

                    # Filtrar GO
                    if filter_go and not is_go_row(headers, row, uf_idx, mun_idx, mun_name_idx):
                        continue

                    # Sanitizar
                    row = [sanitize(v) for v in row]
                    all_rows.append(row)
                    n_ok += 1
                except Exception:
                    n_err += 1

            log_info(f"  {fname}: {n_total:,} total → {n_ok:,} GO | {n_err} erros")

        if not all_headers or not all_rows:
            raise Exception("0 linhas após processamento")

        log_info(f"  Total: {len(all_rows):,} linhas para {tabela}")

    # Gravar CSV temporário ultra-limpo
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False,
                                      encoding="utf-8", newline="")
    writer = csv.writer(tmp, delimiter=",", quoting=csv.QUOTE_ALL)
    writer.writerow(all_headers)
    for row in all_rows:
        writer.writerow(row)
    tmp.flush()
    tmp.close()
    tmp_path = Path(tmp.name)

    try:
        return upload_to_bq(client, tabela, tmp_path, all_headers,
                           max_bad=1000)
    finally:
        tmp_path.unlink(missing_ok=True)


# ═══════════════════════════════════════════════════════════
#  ESTRATÉGIA 2: JSONL (evita problemas de CSV completamente)
# ═══════════════════════════════════════════════════════════
def strategy_jsonl(client, tabela, zip_path, csv_filter):
    """Converte para JSONL — zero problemas de parsing CSV no BQ."""
    log_try(f"  Estratégia 2: conversão para JSONL (elimina problemas CSV)")

    with zipfile.ZipFile(zip_path, "r") as zf:
        members = [m for m in zf.infolist()
                   if m.filename.lower().endswith((".csv",".txt"))
                   and not m.filename.startswith("__MACOSX")]

        if csv_filter:
            cf = csv_filter.upper()
            filtered = [m for m in members if cf in Path(m.filename).stem.upper()]
            if filtered:
                members = filtered

        go_files = [m for m in members if "_GO" in Path(m.filename).stem.upper()
                    and "_GOV" not in Path(m.filename).stem.upper()]
        if go_files:
            members = go_files
            filter_go = False
        else:
            filter_go = True

        all_headers = None
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False,
                                          encoding="utf-8")
        n_rows = 0

        for member in members:
            raw = zf.read(member.filename)
            text = decode(raw)
            del raw
            delim = detect_delim(text.split("\n", 1)[0])
            reader = csv.reader(io.StringIO(text), delimiter=delim)
            try:
                header_raw = next(reader)
            except StopIteration:
                continue
            headers = dedupe([norm_h(h) for h in header_raw])
            if all_headers is None:
                all_headers = headers
                uf_idx = find_col(headers, UF_COLS, UF_BAD)
                mun_idx = find_col(headers, MUN_COLS)
                mun_name_idx = find_col(headers, MUN_NAME_COLS)

            for row in reader:
                try:
                    if len(row) < len(headers):
                        row = list(row) + [""] * (len(headers) - len(row))
                    elif len(row) > len(headers):
                        row = row[:len(headers)]
                    if filter_go and not is_go_row(headers, row, uf_idx, mun_idx, mun_name_idx):
                        continue
                    obj = {}
                    for i, h in enumerate(headers):
                        obj[h] = sanitize(row[i]) if i < len(row) else ""
                    tmp.write(json.dumps(obj, ensure_ascii=False) + "\n")
                    n_rows += 1
                except Exception:
                    pass

        tmp.flush()
        tmp.close()
        tmp_path = Path(tmp.name)

    if n_rows == 0:
        tmp_path.unlink(missing_ok=True)
        raise Exception("0 linhas JSONL")

    log_info(f"  {n_rows:,} linhas em JSONL")

    try:
        table_id = f"{FULL_DS}.{tabela}"
        job_config = bigquery.LoadJobConfig(
            source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
            autodetect=False,
            schema=[bigquery.SchemaField(h, "STRING") for h in all_headers],
            max_bad_records=1000,
        )
        with tmp_path.open("rb") as f:
            job = client.load_table_from_file(f, table_id, job_config=job_config)
        job.result()
        dest = client.get_table(table_id)
        rows = int(dest.num_rows or 0)
        log_ok(f"  JSONL → {rows:,} linhas no BQ")
        return rows
    finally:
        tmp_path.unlink(missing_ok=True)


# ═══════════════════════════════════════════════════════════
#  ESTRATÉGIA 3: Batch pequeno (divide em chunks de 50k)
# ═══════════════════════════════════════════════════════════
def strategy_batch(client, tabela, zip_path, csv_filter):
    """Divide em batches de 50k linhas — se um batch falha, continua."""
    log_try(f"  Estratégia 3: upload em batches de 50k linhas")
    BATCH_SIZE = 50_000

    with zipfile.ZipFile(zip_path, "r") as zf:
        members = [m for m in zf.infolist()
                   if m.filename.lower().endswith((".csv",".txt"))
                   and not m.filename.startswith("__MACOSX")]
        if csv_filter:
            cf = csv_filter.upper()
            filtered = [m for m in members if cf in Path(m.filename).stem.upper()]
            if filtered: members = filtered
        go_files = [m for m in members if "_GO" in Path(m.filename).stem.upper()
                    and "_GOV" not in Path(m.filename).stem.upper()]
        if go_files:
            members = go_files
            filter_go = False
        else:
            filter_go = True

        all_headers = None
        all_rows = []

        for member in members:
            raw = zf.read(member.filename)
            text = decode(raw)
            del raw
            delim = detect_delim(text.split("\n", 1)[0])
            reader = csv.reader(io.StringIO(text), delimiter=delim)
            try: header_raw = next(reader)
            except StopIteration: continue
            headers = dedupe([norm_h(h) for h in header_raw])
            if all_headers is None:
                all_headers = headers
                uf_idx = find_col(headers, UF_COLS, UF_BAD)
                mun_idx = find_col(headers, MUN_COLS)
                mun_name_idx = find_col(headers, MUN_NAME_COLS)

            for row in reader:
                try:
                    if len(row) < len(headers):
                        row = list(row) + [""] * (len(headers) - len(row))
                    elif len(row) > len(headers):
                        row = row[:len(headers)]
                    if filter_go and not is_go_row(headers, row, uf_idx, mun_idx, mun_name_idx):
                        continue
                    all_rows.append([sanitize(v) for v in row])
                except: pass

    if not all_headers or not all_rows:
        raise Exception("0 linhas")

    total_uploaded = 0
    n_batches = (len(all_rows) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(n_batches):
        batch = all_rows[i*BATCH_SIZE : (i+1)*BATCH_SIZE]
        log_info(f"  Batch {i+1}/{n_batches}: {len(batch):,} linhas")

        # Usar JSONL para cada batch
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False, encoding="utf-8")
        for row in batch:
            obj = {h: (row[j] if j < len(row) else "") for j, h in enumerate(all_headers)}
            tmp.write(json.dumps(obj, ensure_ascii=False) + "\n")
        tmp.flush(); tmp.close()
        tmp_path = Path(tmp.name)

        try:
            table_id = f"{FULL_DS}.{tabela}"
            disposition = (bigquery.WriteDisposition.WRITE_TRUNCATE if i == 0
                          else bigquery.WriteDisposition.WRITE_APPEND)
            job_config = bigquery.LoadJobConfig(
                source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
                write_disposition=disposition,
                autodetect=False,
                schema=[bigquery.SchemaField(h, "STRING") for h in all_headers],
                max_bad_records=500,
            )
            with tmp_path.open("rb") as f:
                job = client.load_table_from_file(f, table_id, job_config=job_config)
            job.result()
            total_uploaded += len(batch)
            log_ok(f"  Batch {i+1} OK")
        except Exception as e:
            log_err(f"  Batch {i+1} falhou: {e}")
        finally:
            tmp_path.unlink(missing_ok=True)

    if total_uploaded > 0:
        dest = client.get_table(f"{FULL_DS}.{tabela}")
        rows = int(dest.num_rows or 0)
        log_ok(f"  Total final: {rows:,} linhas")
        return rows
    raise Exception("Todos os batches falharam")


# ═══════════════════════════════════════════════════════════
#  UPLOAD CSV → BQ
# ═══════════════════════════════════════════════════════════
def upload_to_bq(client, tabela, csv_path, headers, max_bad=500):
    table_id = f"{FULL_DS}.{tabela}"
    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.CSV,
        skip_leading_rows=1,
        field_delimiter=",",
        quote_character='"',
        allow_quoted_newlines=True,
        allow_jagged_rows=True,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        autodetect=False,
        schema=[bigquery.SchemaField(h, "STRING") for h in headers],
        max_bad_records=max_bad,
    )
    with csv_path.open("rb") as f:
        job = client.load_table_from_file(f, table_id, job_config=job_config)
    job.result()
    dest = client.get_table(table_id)
    rows = int(dest.num_rows or 0)
    log_ok(f"  CSV → {rows:,} linhas no BQ")
    return rows


# ═══════════════════════════════════════════════════════════
#  PROCESSAR IBGE
# ═══════════════════════════════════════════════════════════
def process_ibge(client, item):
    tabela = item["tabela"]
    print(f"\n{'='*60}")
    print(f"  {C.B}{C.CY}IBGE: {tabela}{C.RST}")
    print(f"{'='*60}")

    sess = requests.Session()
    sess.headers.update({"User-Agent": "Mozilla/5.0 (importador-eleicoes-go)"})

    for i, url in enumerate(item["urls"]):
        log_try(f"  URL {i+1}/{len(item['urls'])}: agregado {url.split('/agregados/')[1].split('/')[0]}")
        try:
            resp = sess.get(url, timeout=60)
            resp.raise_for_status()
            data = resp.json()

            # Flatten IBGE response
            rows = []
            if isinstance(data, list):
                for var_block in data:
                    var_id = var_block.get("id", "")
                    var_nome = var_block.get("variavel", "")
                    resultados = var_block.get("resultados", [])
                    for res in resultados:
                        classificacoes = res.get("classificacoes", [])
                        class_info = {}
                        for cl in classificacoes:
                            class_info[f"class_{cl.get('id','')}"] = cl.get("nome","")
                            for cat in cl.get("categoria", {}).items() if isinstance(cl.get("categoria"), dict) else []:
                                class_info[f"cat_{cl.get('id','')}"] = cat[1] if isinstance(cat, tuple) else ""

                        series = res.get("series", [])
                        for serie in series:
                            localidade = serie.get("localidade", {})
                            loc_id = localidade.get("id", "")
                            loc_nome = localidade.get("nome", "")
                            serie_data = serie.get("serie", {})
                            for periodo, valor in serie_data.items():
                                row = {
                                    "variavel_id": str(var_id),
                                    "variavel_nome": var_nome,
                                    "localidade_id": str(loc_id),
                                    "localidade_nome": loc_nome,
                                    "periodo": str(periodo),
                                    "valor": str(valor) if valor else "",
                                }
                                # Adicionar classificações
                                for cat_block in classificacoes:
                                    cat_id = cat_block.get("id", "")
                                    cat_nome = cat_block.get("nome", "")
                                    row[f"classificacao_{cat_id}_nome"] = cat_nome
                                    categorias = cat_block.get("categoria", {})
                                    if isinstance(categorias, dict):
                                        for cat_k, cat_v in categorias.items():
                                            row[f"categoria_{cat_id}_id"] = str(cat_k)
                                            row[f"categoria_{cat_id}_nome"] = str(cat_v)

                                rows.append(row)

            if not rows:
                log_err(f"  0 registros nessa URL")
                continue

            log_ok(f"  {len(rows)} registros!")

            # Upload JSONL
            tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False, encoding="utf-8")
            all_keys = list(dict.fromkeys(k for r in rows for k in r.keys()))
            for row in rows:
                obj = {k: row.get(k, "") for k in all_keys}
                tmp.write(json.dumps(obj, ensure_ascii=False) + "\n")
            tmp.flush(); tmp.close()
            tmp_path = Path(tmp.name)

            try:
                table_id = f"{FULL_DS}.{tabela}"
                job_config = bigquery.LoadJobConfig(
                    source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
                    write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
                    autodetect=False,
                    schema=[bigquery.SchemaField(k, "STRING") for k in all_keys],
                    max_bad_records=100,
                )
                with tmp_path.open("rb") as f:
                    job = client.load_table_from_file(f, table_id, job_config=job_config)
                job.result()
                dest = client.get_table(table_id)
                final_rows = int(dest.num_rows or 0)
                log_ok(f"  ✅ {tabela} → {final_rows:,} linhas no BQ")
                return True
            finally:
                tmp_path.unlink(missing_ok=True)

        except Exception as e:
            log_err(f"  Falhou: {e}")
            continue

    log_err(f"  ❌ {tabela}: TODAS as URLs falharam")
    return False


# ═══════════════════════════════════════════════════════════
#  PROCESSAR TSE
# ═══════════════════════════════════════════════════════════
def process_tse(client, item):
    tabela = item["tabela"]
    csv_filter = item.get("csv_filter")
    urls = item["urls"]

    print(f"\n{'='*60}")
    print(f"  {C.B}{C.CY}TSE: {tabela}{C.RST}")
    print(f"{'='*60}")

    strategies = [
        ("Sanitização completa CSV", strategy_full_sanitize),
        ("Conversão JSONL", strategy_jsonl),
        ("Upload em batches JSONL", strategy_batch),
    ]

    for url_idx, url in enumerate(urls):
        zip_name = Path(url.split("?")[0]).name
        zip_path = CACHE_DIR / zip_name

        # Download
        if not zip_path.exists():
            if not download_with_retry(url, zip_path):
                log_err(f"  URL {url_idx+1} falhou no download")
                continue
        else:
            log_info(f"  Cache: {zip_name}")

        # Verificar ZIP válido
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.testzip()
        except Exception:
            log_err(f"  ZIP corrompido, removendo cache")
            zip_path.unlink(missing_ok=True)
            if not download_with_retry(url, zip_path):
                continue

        # Tentar cada estratégia
        for strat_name, strat_fn in strategies:
            try:
                rows = strat_fn(client, tabela, zip_path, csv_filter)
                if rows and rows > 0:
                    log_ok(f"  ✅ {tabela} → {rows:,} linhas ({strat_name})")
                    return True
            except Exception as e:
                log_err(f"  {strat_name} falhou: {e}")
                continue

    log_err(f"  ❌ {tabela}: TODAS estratégias e URLs falharam")
    return False


# ═══════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════
def main():
    print(f"""
╔══════════════════════════════════════════════════════════════════╗
║  IMPORTADOR AGRESSIVO — 10 tabelas pendentes                     ║
║  3 estratégias × múltiplas URLs = máxima chance de sucesso       ║
╚══════════════════════════════════════════════════════════════════╝
    """)

    client = bigquery.Client(project=PROJECT)

    # Verificar quais já existem
    try:
        existing = {t.table_id for t in client.list_tables(FULL_DS)}
    except NotFound:
        existing = set()

    all_items = PENDENTES_TSE + [{"tabela": i["tabela"]} for i in PENDENTES_IBGE]
    pendentes = [t for t in [i["tabela"] for i in all_items] if t not in existing]
    ja_ok = [t for t in [i["tabela"] for i in all_items] if t in existing]

    if ja_ok:
        log_info(f"Já existem ({len(ja_ok)}): {', '.join(ja_ok)}")

    if not pendentes:
        log_ok("🎉 Todas as 10 tabelas já estão no BigQuery!")
        return

    log_info(f"Pendentes ({len(pendentes)}): {', '.join(pendentes)}")
    print()

    resultados = {"ok": [], "erro": []}

    # TSE
    for item in PENDENTES_TSE:
        if item["tabela"] not in pendentes:
            continue
        ok = process_tse(client, item)
        if ok:
            resultados["ok"].append(item["tabela"])
        else:
            resultados["erro"].append(item["tabela"])

    # IBGE
    for item in PENDENTES_IBGE:
        if item["tabela"] not in pendentes:
            continue
        ok = process_ibge(client, item)
        if ok:
            resultados["ok"].append(item["tabela"])
        else:
            resultados["erro"].append(item["tabela"])

    # Relatório final
    print(f"\n{'='*60}")
    print(f"  {C.B}RELATÓRIO FINAL{C.RST}")
    print(f"{'='*60}")

    if resultados["ok"]:
        print(f"\n  {C.G}✅ Importadas com sucesso ({len(resultados['ok'])}):{C.RST}")
        for t in resultados["ok"]:
            print(f"     • {t}")

    if resultados["erro"]:
        print(f"\n  {C.R}❌ Falharam ({len(resultados['erro'])}):{C.RST}")
        for t in resultados["erro"]:
            print(f"     • {t}")

    total = len(resultados["ok"]) + len(resultados["erro"])
    print(f"\n  {C.B}Score: {len(resultados['ok'])}/{total}{C.RST}")

    # Salvar log
    log_file = LOG_DIR / f"pendentes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with log_file.open("w") as f:
        json.dump(resultados, f, indent=2, ensure_ascii=False)
    log_info(f"Log salvo: {log_file}")

    if resultados["erro"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
