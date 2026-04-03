#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════╗
║  IMPORTADOR FONTES EXTERNAS → BigQuery  v2.0  (Goiânia+Aparecida)║
║  IBGE, INEP, DataSUS, Portais Transparência                     ║
║  FILTRO MUNICIPAL: somente Goiânia (5208707) e Aparecida (5201405)║
╚══════════════════════════════════════════════════════════════════╝

Comandos:
  python importar_externas.py importar [--prioridade 1] [--resume] [--fonte ibge]
  python importar_externas.py dry-run  [--prioridade 1]
  python importar_externas.py status
"""

import argparse, csv, hashlib, io, json, os, re, sys, tempfile, time
import unicodedata, zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

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
VERSION    = "externas-bq-v2.0"
CONFIG     = "sources_externas.json"

CACHE_DIR  = Path(".cache_externas")
STATE_DIR  = Path(".state")
LOG_DIR    = Path(".logs")

# ═══════════════════════════════════════════════════════════
#  FILTRO MUNICIPAL — SOMENTE Goiânia + Aparecida de Goiânia
# ═══════════════════════════════════════════════════════════
MUNICIPIOS_IBGE = {"5208707", "5201405"}
MUNICIPIOS_NOMES = {
    "GOIANIA", "GOIÂNIA",
    "APARECIDA DE GOIANIA", "APARECIDA DE GOIÂNIA",
}

def is_municipio_foco_ibge(loc_id: str) -> bool:
    """Checa se localidade IBGE é um dos municípios foco"""
    return str(loc_id).strip() in MUNICIPIOS_IBGE

def is_municipio_foco_nome(nome: str) -> bool:
    """Checa se nome de município é um dos focos"""
    n = unicodedata.normalize("NFKD", nome.strip().upper()).encode("ascii", "ignore").decode("ascii")
    return n in {"GOIANIA", "APARECIDA DE GOIANIA"}

def filtrar_records_municipio(records: List[Dict], item: dict) -> List[Dict]:
    """Filtra registros para conter apenas Goiânia e Aparecida.
    Se skip_filtro_municipal=true no item, retorna sem filtrar.
    """
    if item.get("skip_filtro_municipal", False):
        return records
    
    fonte = item.get("fonte", "")
    tipo = item.get("tipo", "")
    
    # IBGE agregados: filtrar por localidade_id
    if fonte == "ibge":
        filtered = [r for r in records if is_municipio_foco_ibge(r.get("localidade_id", ""))]
        log_info(f"  Filtro municipal IBGE: {len(filtered):,} de {len(records):,} registros")
        return filtered
    
    # DataSUS: filtrar por codigo_municipio ou município no nome
    if fonte == "datasus":
        filtered = []
        for r in records:
            # Tentar código IBGE do município
            cod_mun = str(r.get("codigo_municipio_ibge", r.get("codigo_ibge", r.get("co_municipio", "")))).strip()
            if cod_mun in MUNICIPIOS_IBGE:
                filtered.append(r)
                continue
            # Tentar código com 7 dígitos em qualquer campo que contenha "municipio"
            found = False
            for k, v in r.items():
                if "municipio" in k.lower() or "cidade" in k.lower():
                    vs = str(v or "").strip()
                    if vs in MUNICIPIOS_IBGE or is_municipio_foco_nome(vs):
                        found = True; break
            if found:
                filtered.append(r)
        log_info(f"  Filtro municipal DataSUS: {len(filtered):,} de {len(records):,} registros")
        return filtered
    
    # INEP: filtrar por co_municipio
    if fonte == "inep":
        # Já filtrado por UF no ZIP, agora filtra por município
        filtered = []
        for r in records:
            cod = str(r.get("co_municipio", "")).strip()
            if cod in MUNICIPIOS_IBGE:
                filtered.append(r)
        log_info(f"  Filtro municipal INEP: {len(filtered):,} de {len(records):,} registros")
        return filtered
    
    return records

def filtrar_csv_municipio(headers: List[str], rows: List[list], item: dict):
    """Filtra CSV rows para conter apenas Goiânia e Aparecida"""
    if item.get("skip_filtro_municipal", False):
        return headers, rows
    
    # Procurar coluna de município
    mun_cols = ["co_municipio", "codigo_municipio", "cd_municipio", "codmun", "cod_municipio"]
    mun_name_cols = ["nm_municipio", "municipio", "nome_municipio", "no_municipio"]
    
    mun_idx = None
    mun_name_idx = None
    
    for i, h in enumerate(headers):
        h_low = h.lower()
        if h_low in mun_cols and mun_idx is None:
            mun_idx = i
        if h_low in mun_name_cols and mun_name_idx is None:
            mun_name_idx = i
    
    if mun_idx is None and mun_name_idx is None:
        log_info(f"  ⚠ Sem coluna de município para filtrar — mantendo {len(rows):,} linhas")
        return headers, rows
    
    filtered = []
    for row in rows:
        if mun_idx is not None and mun_idx < len(row):
            val = re.sub(r"\D", "", row[mun_idx].strip())
            if val in MUNICIPIOS_IBGE:
                filtered.append(row); continue
        if mun_name_idx is not None and mun_name_idx < len(row):
            if is_municipio_foco_nome(row[mun_name_idx]):
                filtered.append(row); continue
    
    log_info(f"  Filtro municipal CSV: {len(filtered):,} de {len(rows):,} linhas")
    return headers, filtered

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

def utcnow(): return datetime.now(timezone.utc)
def fmt_dur(s):
    if s < 60: return f"{s:.0f}s"
    m, s = divmod(int(s), 60)
    return f"{m}m{s:02d}s"

# ═══════════════════════════════════════════════════════════
#  MANIFEST (resume)
# ═══════════════════════════════════════════════════════════
def manifest_path(): return STATE_DIR / "manifest_externas.jsonl"

def load_ok_keys():
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
#  SOURCES
# ═══════════════════════════════════════════════════════════
def load_sources(fonte_filtro=None):
    data = json.loads(Path(CONFIG).read_text("utf-8"))
    out = []
    for it in data.get("items", []):
        if fonte_filtro and it.get("fonte") != fonte_filtro:
            continue
        out.append(it)
    return out

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

def load_rows_to_bq(client, table_name, headers, rows):
    table_id = f"{FULL_DS}.{table_name}"
    with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=",", quoting=csv.QUOTE_MINIMAL)
        w.writerow(headers)
        for row in rows:
            w.writerow(row)
        tmp_path = Path(f.name)
    try:
        job_config = bigquery.LoadJobConfig(
            source_format=bigquery.SourceFormat.CSV,
            skip_leading_rows=1, field_delimiter=",", quote_character='"',
            allow_quoted_newlines=True,
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
            autodetect=False,
            schema=[bigquery.SchemaField(h, "STRING") for h in headers],
        )
        with tmp_path.open("rb") as f:
            job = client.load_table_from_file(f, table_id, job_config=job_config)
        job.result()
        dest = client.get_table(table_id)
        return int(dest.num_rows or 0)
    finally:
        tmp_path.unlink(missing_ok=True)

def load_json_to_bq(client, table_name, records: List[Dict]):
    """Carrega lista de dicts no BigQuery via JSON newline"""
    if not records: return 0
    table_id = f"{FULL_DS}.{table_name}"
    with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False, encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        tmp_path = Path(f.name)
    try:
        job_config = bigquery.LoadJobConfig(
            source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
            autodetect=True,
        )
        with tmp_path.open("rb") as f:
            job = client.load_table_from_file(f, table_id, job_config=job_config)
        job.result()
        dest = client.get_table(table_id)
        return int(dest.num_rows or 0)
    finally:
        tmp_path.unlink(missing_ok=True)

def list_ext_tables(client):
    try:
        tables = list(client.list_tables(FULL_DS))
        return [t.table_id for t in tables if t.table_id.startswith("raw_ibge_") or
                t.table_id.startswith("raw_inep_") or t.table_id.startswith("raw_datasus_") or
                t.table_id.startswith("raw_transp_")]
    except NotFound:
        return []

# ═══════════════════════════════════════════════════════════
#  PROCESSADORES POR FORMATO
# ═══════════════════════════════════════════════════════════
def norm_key(s):
    """Normaliza chave JSON para snake_case"""
    s = unicodedata.normalize("NFKD", str(s).strip()).encode("ascii","ignore").decode("ascii")
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s).strip("_").lower()
    return re.sub(r"_+", "_", s) or "col"

def process_ibge_agregados(sess, url, item):
    """Processa API de agregados do IBGE → lista de dicts flat
    NOTA: A API já retorna filtrado por N6[N3[52]] (GO), mas filtramos
    após para manter apenas Goiânia e Aparecida.
    """
    log_api(f"IBGE Agregados: {item.get('tipo')}")
    resp = sess.get(url, timeout=120)
    resp.raise_for_status()
    data = resp.json()

    records = []
    for variavel_obj in data:
        variavel_id = variavel_obj.get("id", "")
        variavel_nome = variavel_obj.get("variavel", "")
        unidade = variavel_obj.get("unidade", "")

        classifs = variavel_obj.get("classificacoes", [])
        resultados = variavel_obj.get("resultados", [])
        for resultado in resultados:
            classif_info = {}
            for cl in resultado.get("classificacoes", classifs):
                cl_nome = norm_key(cl.get("nome", ""))
                if isinstance(cl.get("categoria"), dict):
                    for cat_id, cat_nome in cl["categoria"].items():
                        classif_info[f"{cl_nome}_id"] = cat_id
                        classif_info[f"{cl_nome}_nome"] = cat_nome

            series = resultado.get("series", [])
            for serie in series:
                loc = serie.get("localidade", {})
                loc_id = loc.get("id", "")
                loc_nome = loc.get("nome", "")
                loc_nivel = loc.get("nivel", {}).get("nome", "")

                for periodo, valor in serie.get("serie", {}).items():
                    rec = {
                        "variavel_id": str(variavel_id),
                        "variavel_nome": variavel_nome,
                        "unidade": unidade,
                        "localidade_id": str(loc_id),
                        "localidade_nome": loc_nome,
                        "localidade_nivel": loc_nivel,
                        "periodo": str(periodo),
                        "valor": str(valor) if valor else None,
                    }
                    rec.update(classif_info)
                    records.append(rec)

    log_info(f"  {len(records):,} registros brutos da API IBGE")
    return records

def process_api_json_simple(sess, url, item):
    """Processa API JSON simples (DataSUS, portais) → lista de dicts"""
    log_api(f"{item.get('fonte')}/{item.get('tipo')}")

    all_records = []
    paginado = item.get("paginado", False)
    exercicios = item.get("exercicios", [None])

    for exercicio in exercicios:
        page = 1
        while True:
            current_url = url
            if exercicio:
                current_url = re.sub(r'exercicio=\d+', f'exercicio={exercicio}', current_url)
            if paginado:
                param_pag = item.get("param_pagina", "pagina")
                current_url = re.sub(f'{param_pag}=\\d+', f'{param_pag}={page}', current_url)

            try:
                resp = sess.get(current_url, timeout=120)
                if resp.status_code == 404:
                    log_info(f"  404 em {current_url} — pulando")
                    break
                resp.raise_for_status()
                data = resp.json()
            except requests.exceptions.HTTPError as e:
                log_info(f"  HTTP {e.response.status_code} — parando paginação")
                break
            except Exception as e:
                log_err(f"  Erro: {e}")
                break

            if isinstance(data, list):
                records = data
            elif isinstance(data, dict):
                records = None
                # DataSUS e outros: procura a chave que contém a lista
                for k in ["estabelecimentos", "leitos", "profissionais", 
                          "data", "dados", "results", "items", "registros", "content"]:
                    if k in data and isinstance(data[k], list):
                        records = data[k]; break
                if records is None:
                    records = [data]
            else:
                break

            if not records:
                break

            for rec in records:
                if exercicio:
                    rec["_exercicio"] = str(exercicio)
                flat = {}
                for k, v in rec.items():
                    if isinstance(v, dict):
                        for k2, v2 in v.items():
                            flat[f"{k}_{k2}"] = str(v2) if v2 is not None else None
                    elif isinstance(v, list):
                        flat[k] = json.dumps(v, ensure_ascii=False)
                    else:
                        flat[k] = str(v) if v is not None else None
                all_records.append(flat)

            log_info(f"  {'Exercício ' + str(exercicio) + ' — ' if exercicio else ''}página {page}: {len(records)} registros")

            if not paginado or len(records) < 100:
                break
            page += 1

    log_info(f"  Total bruto: {len(all_records):,} registros")
    return all_records

def process_download_csv(sess, url, item):
    """Baixa CSV direto e retorna (headers, rows)"""
    log_dl(f"Download CSV: {item.get('tipo')}")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    fname = re.sub(r'[^a-zA-Z0-9._-]', '_', Path(url.split("?")[0]).name) or "download.csv"
    dest = CACHE_DIR / fname

    if not dest.exists():
        resp = sess.get(url, timeout=300, stream=True)
        resp.raise_for_status()
        with dest.open("wb") as f:
            for chunk in resp.iter_content(1<<18):
                if chunk: f.write(chunk)
        log_dl(f"  Baixado: {dest.name}")
    else:
        log_skip(f"  Cache: {dest.name}")

    text = dest.read_bytes()
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text_dec = text.decode(enc); break
        except:
            text_dec = text.decode("latin-1", errors="replace")

    lines = text_dec.split("\n", 1)
    if not lines: return [], []

    delim = max([";",",","\t","|"], key=lambda c: lines[0].count(c))
    reader = csv.reader(io.StringIO(text_dec), delimiter=delim)
    header_raw = next(reader, [])
    headers = [norm_key(h) for h in header_raw]
    rows = [r for r in reader if len(r) >= len(headers)//2]

    log_info(f"  {len(rows):,} linhas lidas")
    return headers, rows

def process_download_zip(sess, url, item):
    """Baixa ZIP, extrai CSV e retorna (headers, rows) filtrado por UF"""
    log_dl(f"Download ZIP: {item.get('tipo')}")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    fname = Path(url.split("?")[0]).name or "download.zip"
    dest = CACHE_DIR / fname

    if not dest.exists():
        resp = sess.get(url, timeout=600, stream=True)
        resp.raise_for_status()
        with dest.open("wb") as f:
            for chunk in resp.iter_content(1<<18):
                if chunk: f.write(chunk)
        log_dl(f"  Baixado: {dest.name}")
    else:
        log_skip(f"  Cache: {dest.name}")

    csv_pattern = item.get("csv_pattern", "")
    filtro_col = item.get("filtro_coluna", "")
    filtro_val = item.get("filtro_valor", "")

    all_headers = None
    all_rows = []

    with zipfile.ZipFile(dest, "r") as zf:
        members = [m for m in zf.infolist()
                   if m.filename.lower().endswith((".csv", ".txt"))
                   and not m.filename.startswith("__MACOSX")]

        if csv_pattern:
            members = [m for m in members if csv_pattern.upper() in Path(m.filename).stem.upper()]

        log_info(f"  {len(members)} CSVs encontrados no ZIP")

        for member in members:
            raw = zf.read(member.filename)
            for enc in ("utf-8-sig", "utf-8", "latin-1"):
                try: text = raw.decode(enc); break
                except: text = raw.decode("latin-1", errors="replace")

            lines = text.split("\n", 1)
            if not lines: continue

            delim = max([";",",","\t","|"], key=lambda c: lines[0].count(c))
            reader = csv.reader(io.StringIO(text), delimiter=delim)
            header_raw = next(reader, [])
            headers = [norm_key(h) for h in header_raw]

            if all_headers is None:
                all_headers = headers

            filtro_idx = None
            if filtro_col:
                filtro_col_norm = norm_key(filtro_col)
                for i, h in enumerate(headers):
                    if h == filtro_col_norm:
                        filtro_idx = i; break

            n_total = n_match = 0
            for row in reader:
                n_total += 1
                if filtro_idx is not None:
                    val = (row[filtro_idx] if filtro_idx < len(row) else "").strip()
                    if val != filtro_val:
                        continue
                n_match += 1
                if len(row) < len(headers):
                    row = list(row) + [""] * (len(headers) - len(row))
                elif len(row) > len(headers):
                    row = row[:len(headers)]
                all_rows.append(row)

            log_info(f"  {Path(member.filename).name}: {n_match:,} linhas" +
                     (f" (de {n_total:,})" if filtro_idx else ""))

    return all_headers or [], all_rows

def process_geojson(sess, url, item):
    """Baixa GeoJSON e converte features para records"""
    log_api(f"GeoJSON: {item.get('tipo')}")
    resp = sess.get(url, timeout=120)
    resp.raise_for_status()
    data = resp.json()

    records = []
    features = data.get("features", [])
    for feat in features:
        props = feat.get("properties", {})
        geom = feat.get("geometry", {})
        rec = {}
        for k, v in props.items():
            rec[norm_key(k)] = str(v) if v is not None else None
        rec["geometry_type"] = geom.get("type", "")
        coords = geom.get("coordinates")
        if coords:
            rec["coordinates"] = json.dumps(coords)
        records.append(rec)

    log_info(f"  {len(records):,} features extraídas")
    return records

# ═══════════════════════════════════════════════════════════
#  DISPATCHER
# ═══════════════════════════════════════════════════════════
def process_item(sess, item):
    """Processa um item e retorna (tipo_resultado, dados)
    tipo_resultado: 'records' → lista de dicts, 'csv' → (headers, rows)
    
    TODOS os resultados passam pelo filtro municipal (Goiânia + Aparecida).
    """
    fmt = item.get("formato", "")
    url = item.get("url", "")
    fonte = item.get("fonte", "")

    if fmt == "api_json":
        if fonte == "ibge":
            records = process_ibge_agregados(sess, url, item)
        else:
            records = process_api_json_simple(sess, url, item)
        # >>> FILTRO MUNICIPAL para records <<<
        records = filtrar_records_municipio(records, item)
        return "records", records

    elif fmt == "download_csv":
        headers, rows = process_download_csv(sess, url, item)
        # >>> FILTRO MUNICIPAL para CSV <<<
        headers, rows = filtrar_csv_municipio(headers, rows, item)
        return "csv", (headers, rows)

    elif fmt == "download_zip":
        headers, rows = process_download_zip(sess, url, item)
        # >>> FILTRO MUNICIPAL para CSV do ZIP <<<
        headers, rows = filtrar_csv_municipio(headers, rows, item)
        return "csv", (headers, rows)

    elif fmt == "download_geojson":
        records = process_geojson(sess, url, item)
        # GeoJSON de malha já é específico por município (URL tem código IBGE)
        return "records", records

    else:
        log_err(f"Formato desconhecido: {fmt}")
        return None, None

# ═══════════════════════════════════════════════════════════
#  COMANDOS
# ═══════════════════════════════════════════════════════════
def cmd_dry_run(args):
    sources = [s for s in load_sources(args.fonte) if s.get("prioridade",1) <= args.prioridade]
    banner(f"DRY RUN — {len(sources)} fontes externas (prioridade ≤ {args.prioridade})")
    print(f"  {C.Y}⚠ FILTRO MUNICIPAL ATIVO: somente Goiânia (5208707) e Aparecida (5201405){C.RST}\n")
    for i, s in enumerate(sources, 1):
        print(f"  {C.CY}{i:3d}.{C.RST} [{s['fonte']}] {s['tipo']} → {s['tabela_bq']}")
        print(f"       {C.GR}{s.get('descricao','')}{C.RST}")
        print(f"       {C.GR}{s['url'][:100]}...{C.RST}" if len(s['url']) > 100 else f"       {C.GR}{s['url']}{C.RST}")
    print(f"\n  {C.B}Total: {len(sources)} fontes serão importadas{C.RST}\n")

def cmd_status(args):
    banner("STATUS — Tabelas externas no BigQuery")
    bq = get_client()
    tables = list_ext_tables(bq)
    if not tables:
        log_info("Nenhuma tabela externa encontrada"); return

    print(f"  {C.B}{'Tabela':<50} {'Linhas':>12}{C.RST}")
    print(f"  {'─'*65}")
    total = 0
    for t in sorted(tables):
        try:
            tbl = bq.get_table(f"{FULL_DS}.{t}")
            rows = int(tbl.num_rows or 0)
            total += rows
            color = C.G if rows > 0 else C.R
            print(f"  {color}{t:<50}{C.RST} {rows:>12,}")
        except:
            print(f"  {C.R}{t:<50} ???{C.RST}")
    print(f"  {'─'*65}")
    print(f"  {C.B}{'TOTAL':<50} {total:>12,}{C.RST}")
    print(f"\n  {len(tables)} tabelas | {total:,} linhas totais\n")

def cmd_importar(args):
    banner(f"IMPORTADOR FONTES EXTERNAS → BigQuery  {VERSION}")
    print(f"  {C.Y}{C.B}FILTRO MUNICIPAL: somente Goiânia + Aparecida de Goiânia{C.RST}\n")

    sources = [s for s in load_sources(args.fonte) if s.get("prioridade",1) <= args.prioridade]
    if not sources:
        log_err("Nenhuma fonte encontrada!"); return

    bq = get_client()
    ensure_ds(bq)

    ok_keys = load_ok_keys() if args.resume else set()
    run_id = utcnow().strftime("%Y%m%d_%H%M%S")
    sess = requests.Session()
    sess.headers.update({"User-Agent": "EleicoesGO-Importador/2.0"})

    log_info(f"{len(sources)} fontes | Prioridade ≤ {args.prioridade}" +
             (f" | Fonte: {args.fonte}" if args.fonte else ""))

    n_ok = n_err = n_skip = total_rows = 0
    results = []
    t_start = time.time()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    for idx, item in enumerate(sources, 1):
        tabela = item["tabela_bq"]
        key = f"{item['fonte']}|{item['tipo']}|{tabela}"
        tag = f"[{idx}/{len(sources)}]"

        print(f"\n  {C.B}{'─'*60}{C.RST}")
        log_info(f"{tag} [{item['fonte']}] {item['tipo']} → {tabela}")

        if key in ok_keys:
            log_skip("Já importado (resume)")
            n_skip += 1
            results.append({"tabela": tabela, "status": "skip", "linhas": 0})
            continue

        t0 = time.time()
        try:
            tipo_resultado, dados = process_item(sess, item)

            if tipo_resultado is None:
                n_err += 1
                results.append({"tabela": tabela, "status": "erro", "linhas": 0, "erro": "formato desconhecido"})
                continue

            if tipo_resultado == "records":
                if not dados:
                    log_err(f"0 registros após filtro municipal")
                    n_err += 1
                    results.append({"tabela": tabela, "status": "erro", "linhas": 0, "erro": "0 registros após filtro"})
                    continue
                log_load(f"{tabela} ({len(dados):,} registros — filtrado)")
                loaded = load_json_to_bq(bq, tabela, dados)

            elif tipo_resultado == "csv":
                headers, rows = dados
                if not rows:
                    log_err(f"0 linhas após filtro municipal")
                    n_err += 1
                    results.append({"tabela": tabela, "status": "erro", "linhas": 0, "erro": "0 linhas após filtro"})
                    continue
                log_load(f"{tabela} ({len(rows):,} linhas — filtrado)")
                loaded = load_rows_to_bq(bq, tabela, headers, rows)

            dur = time.time() - t0
            log_ok(f"✓ {tabela} | {loaded:,} linhas | {fmt_dur(dur)}")
            n_ok += 1
            total_rows += loaded
            results.append({"tabela": tabela, "status": "ok", "linhas": loaded, "duracao": round(dur,1)})
            save_manifest(key, {"tabela": tabela, "linhas": loaded, "fonte": item["fonte"], "tipo": item["tipo"]})

        except Exception as e:
            dur = time.time() - t0
            log_err(f"{tabela}: {str(e)[:150]}")
            n_err += 1
            results.append({"tabela": tabela, "status": "erro", "linhas": 0, "erro": str(e)[:200]})

    # ═══════════════════════════════════════════════════════
    #  RELATÓRIO FINAL
    # ═══════════════════════════════════════════════════════
    banner("RELATÓRIO FINAL — FONTES EXTERNAS (Goiânia + Aparecida)")
    box("Resumo", [
        f"Versão:      {VERSION}",
        f"Run:         {run_id}",
        f"Duração:     {fmt_dur(time.time() - t_start)}",
        f"Filtro:      Goiânia (5208707) + Aparecida (5201405)",
        f"",
        f"✓ Sucesso:   {n_ok}",
        f"⊘ Pulados:   {n_skip}",
        f"✗ Erros:     {n_err}",
        f"",
        f"Linhas:      {total_rows:,}",
    ])

    if results:
        print(f"  {C.B}{'Status':<10} {'Tabela':<45} {'Linhas':>10}{C.RST}")
        print(f"  {'─'*70}")
        for r in results:
            s = r["status"]
            color = C.G if s=="ok" else (C.GR if s=="skip" else C.R)
            icon = "✓" if s=="ok" else ("⊘" if s=="skip" else "✗")
            print(f"  {color}{icon} {s:<8}{C.RST} {r['tabela']:<45} {r['linhas']:>10,}")
        print(f"  {'─'*70}")

    report = {"versao": VERSION, "run_id": run_id, "ok": n_ok, "erros": n_err,
              "skip": n_skip, "linhas": total_rows, "filtro": "goiania+aparecida", "resultados": results}
    rp = STATE_DIR / f"report_externas_{run_id}.json"
    rp.write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf-8")

    status = '🎉 Concluído!' if n_err == 0 else '⚠️  Concluído com erros'
    print(f"\n  {C.B}{status}{C.RST}\n")

# ═══════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════
def main():
    ap = argparse.ArgumentParser(description=f"Importador Fontes Externas → BigQuery (Goiânia+Aparecida) {VERSION}")
    sub = ap.add_subparsers(dest="comando")

    p_imp = sub.add_parser("importar", help="Importar fontes externas → BigQuery")
    p_imp.add_argument("--prioridade", type=int, default=99)
    p_imp.add_argument("--resume", action="store_true")
    p_imp.add_argument("--fonte", type=str, default=None, help="Filtrar por fonte (ibge, inep, datasus, transparencia_goiania, transparencia_aparecida)")

    p_dry = sub.add_parser("dry-run", help="Ver plano sem executar")
    p_dry.add_argument("--prioridade", type=int, default=99)
    p_dry.add_argument("--fonte", type=str, default=None)

    sub.add_parser("status", help="Ver tabelas externas no BigQuery")

    args = ap.parse_args()

    if args.comando == "importar": cmd_importar(args)
    elif args.comando == "dry-run": cmd_dry_run(args)
    elif args.comando == "status": cmd_status(args)
    else:
        ap.print_help()
        print(f"\n  {C.Y}FILTRO MUNICIPAL: somente Goiânia (5208707) + Aparecida (5201405){C.RST}")
        print(f"\n  Exemplos:")
        print(f"    python importar_externas.py dry-run")
        print(f"    python importar_externas.py dry-run --fonte ibge")
        print(f"    python importar_externas.py importar --prioridade 1")
        print(f"    python importar_externas.py importar --fonte ibge")
        print(f"    python importar_externas.py importar --fonte datasus --resume")
        print(f"    python importar_externas.py status\n")

if __name__ == "__main__":
    main()
