#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════╗
║  IMPORTADOR TSE → BigQuery  v5.0  (Goiás) — VERSÃO FINAL        ║
║  Eficiente: só baixa/processa CSV de GO, 1 tabela por fonte      ║
║  Suporte csv_filter para ZIPs multi-CSV (prestação contas)       ║
╚══════════════════════════════════════════════════════════════════╝

Comandos:
  python importar_bigquery.py importar [--prioridade 1] [--resume] [--force]
  python importar_bigquery.py dry-run  [--prioridade 1]
  python importar_bigquery.py purge
  python importar_bigquery.py status
"""

import argparse, csv, hashlib, io, json, os, re, sys, tempfile, time
import unicodedata, zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import requests

try:
    from tqdm import tqdm as _tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False

try:
    from google.cloud import bigquery
    from google.api_core.exceptions import NotFound
    HAS_BQ = True
except ImportError:
    HAS_BQ = False

# ═══════════════════════════════════════════════════════════
#  CONFIGURAÇÃO FIXA
# ═══════════════════════════════════════════════════════════
PROJECT    = "silver-idea-389314"
DATASET    = "eleicoes_go_clean"
FULL_DS    = f"{PROJECT}.{DATASET}"
LOCATION   = "US"
UF_FILTRO  = "GO"
VERSION    = "tse-go-bq-v5.0"
CONFIG     = "sources.json"

# Filtro municipal: SOMENTE Goiânia e Aparecida de Goiânia
MUNICIPIOS_FOCO = {
    "52749", "5208707", "GOIANIA", "GOIÂNIA",
    "50415", "5201405", "APARECIDA DE GOIANIA", "APARECIDA DE GOIÂNIA",
}
FILTRO_MUNICIPAL = True

CACHE_DIR  = Path(".cache_tse")
STATE_DIR  = Path(".state")
LOG_DIR    = Path(".logs")

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

def tq(*a, **kw):
    if not HAS_TQDM:
        return a[0] if a else iter([])
    kw.setdefault("file", sys.stdout)
    kw.setdefault("dynamic_ncols", True)
    kw.setdefault("bar_format", "{l_bar}{bar:30}{r_bar}")
    return _tqdm(*a, **kw)

# ═══════════════════════════════════════════════════════════
#  UTILS
# ═══════════════════════════════════════════════════════════
def safe_int(x):
    if x is None: return None
    try: return int(str(x).strip())
    except: return None

def bq_ident(s):
    s = unicodedata.normalize("NFKD", (s or "").strip().lower()).encode("ascii","ignore").decode("ascii")
    return re.sub(r"_+","_", re.sub(r"[^a-z0-9_]+","_",s)).strip("_") or "x"

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

# ═══════════════════════════════════════════════════════════
#  MANIFEST (resume)
# ═══════════════════════════════════════════════════════════
def manifest_path(): return STATE_DIR / "manifest.jsonl"

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
#  ERROR LOG (persistente)
# ═══════════════════════════════════════════════════════════
_error_log = []

def log_error_detail(tipo, ano, arquivo, erro):
    entry = {"ts": utcnow().isoformat(), "tipo": tipo, "ano": ano, "arquivo": arquivo, "erro": str(erro)[:500]}
    _error_log.append(entry)
    log_err(f"{tipo}/{ano}: {str(erro)[:120]}")

def save_error_log(run_id):
    if not _error_log: return
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    p = LOG_DIR / f"erros_{run_id}.json"
    p.write_text(json.dumps(_error_log, ensure_ascii=False, indent=2), encoding="utf-8")
    log_info(f"Log de erros salvo: {p}")

# ═══════════════════════════════════════════════════════════
#  SOURCES
# ═══════════════════════════════════════════════════════════
@dataclass
class Src:
    tipo: str
    ano: Optional[int]
    url: str
    tabela: str
    prioridade: int = 1
    csv_filter: Optional[str] = None
    timeout: int = 600  # Timeout de download em segundos

def load_sources():
    data = json.loads(Path(CONFIG).read_text("utf-8"))
    out = []
    for it in data.get("items", []):
        url = str(it.get("url","")).strip()
        tipo = str(it.get("tipo","")).strip()
        tab = str(it.get("tabela_bq","")).strip()
        if not (url and tipo and tab): continue
        out.append(Src(tipo=tipo, ano=safe_int(it.get("ano")), url=url, tabela=tab,
                       prioridade=safe_int(it.get("prioridade")) or 1,
                       csv_filter=it.get("csv_filter"),
                       timeout=safe_int(it.get("timeout")) or 600))
    return out

# ═══════════════════════════════════════════════════════════
#  DOWNLOAD com retry + backoff
# ═══════════════════════════════════════════════════════════
def download(sess, url, dest, retries=3):
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(1, retries+1):
        try:
            with sess.get(url, stream=True, timeout=600) as r:
                r.raise_for_status()
                total = int(r.headers.get("content-length") or 0)
                with dest.open("wb") as f:
                    downloaded = 0
                    for chunk in r.iter_content(1<<18):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total and downloaded % (5 * 1<<20) < (1<<18):
                                pct = downloaded * 100 // total
                                print(f"\r  ↓ {dest.name}: {fmt_bytes(downloaded)}/{fmt_bytes(total)} ({pct}%)", end="", flush=True)
                if total:
                    print()
            # Validar tamanho mínimo
            if dest.stat().st_size < 100:
                log_err(f"Arquivo muito pequeno: {dest.stat().st_size} bytes")
                dest.unlink(missing_ok=True)
                continue
            return True
        except Exception as e:
            if attempt < retries:
                wait = attempt * 10
                log_info(f"Retry {attempt}/{retries} em {wait}s: {e}")
                time.sleep(wait)
            else:
                log_err(f"Download falhou após {retries} tentativas: {e}")
                dest.unlink(missing_ok=True)
                return False
    return False

# ═══════════════════════════════════════════════════════════
#  CSV PARSING
# ═══════════════════════════════════════════════════════════
def detect_delim(line):
    counts = {c: line.count(c) for c in [";",",","\t","|"]}
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else ";"

def norm_h(h):
    h = unicodedata.normalize("NFKD", (h or "").strip().lower().replace("\ufeff",""))
    h = h.encode("ascii","ignore").decode("ascii").replace(" ","_").replace(".","")
    h = re.sub(r"[^a-z0-9_]+","_",h)
    return re.sub(r"_+","_",h).strip("_") or "col_x"

def dedupe(headers):
    seen, out = {}, []
    for h in headers:
        n = seen.get(h, 0)
        out.append(h if n == 0 else f"{h}_{n+1}")
        seen[h] = n + 1
    return out

def decode(b):
    for enc in ("utf-8-sig","utf-8","latin-1"):
        try: return b.decode(enc)
        except: pass
    return b.decode("latin-1", errors="replace")

# ═══════════════════════════════════════════════════════════
#  FILTRO MUNICIPAL — Aparecida + Goiânia
# ═══════════════════════════════════════════════════════════
UF_COLS  = ["sg_uf","sigla_uf","uf","cd_uf","cod_uf"]
UF_BAD   = ["nasc","natural","origem","nascimento"]
MUN_COLS = ["cd_municipio","cod_municipio","codigo_municipio","id_municipio","codmun","cdmun",
            "sg_ue","cd_municipio_nascimento"]
MUN_NAME_COLS = ["nm_municipio","nm_ue","nome_municipio","municipio","ds_municipio"]

def find_uf_col(headers):
    for name in UF_COLS:
        if name in headers:
            idx = headers.index(name)
            if not any(b in name for b in UF_BAD): return idx
    return None

def find_mun_col(headers):
    for name in MUN_COLS:
        if name in headers: return headers.index(name)
    return None

def find_mun_name_col(headers):
    for name in MUN_NAME_COLS:
        if name in headers: return headers.index(name)
    return None

def normalize_mun_name(val):
    val = unicodedata.normalize("NFKD", val.strip().upper()).encode("ascii","ignore").decode("ascii")
    return val

def is_target_row(headers, row, uf_idx, mun_idx, mun_name_idx):
    if not FILTRO_MUNICIPAL:
        if uf_idx is not None:
            val = (row[uf_idx] if uf_idx < len(row) else "").strip().upper()
            return val == "GO" or val == "52"
        if mun_idx is not None:
            val = re.sub(r"\D","", row[mun_idx] if mun_idx < len(row) else "")
            return val.startswith("52")
        return True

    # === MODO MUNICIPAL: só Aparecida + Goiânia ===
    if uf_idx is not None:
        uf_val = (row[uf_idx] if uf_idx < len(row) else "").strip().upper()
        if uf_val not in ("GO", "52"):
            return False

    if mun_idx is not None:
        val = (row[mun_idx] if mun_idx < len(row) else "").strip()
        val_clean = re.sub(r"\D", "", val)
        if val_clean in MUNICIPIOS_FOCO or val.upper() in MUNICIPIOS_FOCO:
            return True

    if mun_name_idx is not None:
        val = (row[mun_name_idx] if mun_name_idx < len(row) else "").strip()
        val_norm = normalize_mun_name(val)
        if val_norm in MUNICIPIOS_FOCO:
            return True
        if "GOIANIA" in val_norm and "APARECIDA" not in val_norm:
            return True
        if "APARECIDA DE GOIANIA" in val_norm:
            return True

    # Sem coluna de município → aceitar GO inteiro
    if mun_idx is None and mun_name_idx is None:
        if uf_idx is not None:
            uf_val = (row[uf_idx] if uf_idx < len(row) else "").strip().upper()
            return uf_val in ("GO", "52")
        return True

    return False

def pick_go_csv(zf, all_members, csv_filter=None):
    """
    Estratégia inteligente para pegar só o CSV de GO:
    1. Se csv_filter definido → filtra CSVs pelo nome primeiro
    2. Se tem arquivo _GO no nome → usa ele
    3. Senão, processa todos e filtra por coluna UF
    """
    # Fase 1: aplicar csv_filter (ex: "receita", "despesa")
    if csv_filter:
        cf_upper = csv_filter.upper()
        filtered = [m for m in all_members
                    if cf_upper in Path(m.filename).stem.upper()]
        if filtered:
            log_info(f"  csv_filter '{csv_filter}': {len(filtered)} de {len(all_members)} CSVs")
            all_members = filtered
        else:
            log_info(f"  csv_filter '{csv_filter}': nenhum match — usando todos")

    names_upper = {m: Path(m.filename).stem.upper() for m in all_members}

    # Fase 2: arquivo específico _GO
    go_files = [m for m in all_members if "_GO" in names_upper[m] and "_GOV" not in names_upper[m]]
    if go_files:
        return go_files, True

    # Fase 3: processar todos e filtrar por coluna UF
    return all_members, False

def process_csv_member(zf, member, filter_go):
    raw = zf.read(member.filename)
    text = decode(raw)
    lines = text.split("\n", 1)
    if not lines or not lines[0].strip():
        return [], [], 0, 0

    delim = detect_delim(lines[0])
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    header_raw = next(reader, [])
    if not header_raw:
        return [], [], 0, 0

    headers = dedupe([norm_h(h) for h in header_raw])

    if not filter_go:
        rows = []
        n = 0
        for row in reader:
            n += 1
            if len(row) < len(headers):
                row = list(row) + [""] * (len(headers) - len(row))
            elif len(row) > len(headers):
                row = row[:len(headers)]
            rows.append(row)
        return headers, rows, n, n

    uf_idx = find_uf_col(headers)
    mun_idx = find_mun_col(headers)
    mun_name_idx = find_mun_name_col(headers)

    rows = []
    n_total = 0
    for row in reader:
        n_total += 1
        if not is_target_row(headers, row, uf_idx, mun_idx, mun_name_idx):
            continue
        if len(row) < len(headers):
            row = list(row) + [""] * (len(headers) - len(row))
        elif len(row) > len(headers):
            row = row[:len(headers)]
        rows.append(row)

    return headers, rows, n_total, len(rows)

# ═══════════════════════════════════════════════════════════
#  BIGQUERY OPS
# ═══════════════════════════════════════════════════════════
def get_client():
    if not HAS_BQ:
        print(f"\n  {C.R}ERRO: pip install google-cloud-bigquery{C.RST}\n")
        sys.exit(1)
    return bigquery.Client(project=PROJECT)

def ensure_ds(client):
    try: client.get_dataset(FULL_DS)
    except NotFound:
        ds = bigquery.Dataset(FULL_DS); ds.location = LOCATION
        client.create_dataset(ds)
        log_info(f"Dataset criado: {FULL_DS}")

def load_to_bq(client, table_name, headers, rows):
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
            skip_leading_rows=1,
            field_delimiter=",",
            quote_character='"',
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

def list_tables(client):
    try:
        tables = list(client.list_tables(FULL_DS))
        return [t.table_id for t in tables if t.table_id.startswith("raw_")]
    except NotFound:
        return []

def purge_tables(client):
    tables = list_tables(client)
    if not tables:
        log_info("Nenhuma tabela raw_ encontrada para apagar")
        return 0
    for t in tables:
        table_id = f"{FULL_DS}.{t}"
        client.delete_table(table_id, not_found_ok=True)
        log_info(f"Apagada: {t}")
    return len(tables)

# ═══════════════════════════════════════════════════════════
#  COMANDOS
# ═══════════════════════════════════════════════════════════
def cmd_dry_run(args):
    sources = [s for s in load_sources() if s.prioridade <= args.prioridade]
    banner(f"DRY RUN — {len(sources)} fontes (prioridade ≤ {args.prioridade})")
    for i, s in enumerate(sources, 1):
        extra = f"  [csv_filter={s.csv_filter}]" if s.csv_filter else ""
        print(f"  {C.CY}{i:3d}.{C.RST} {s.tipo}/{s.ano or 'ATUAL'} → {s.tabela}{extra}")
        print(f"       {C.GR}{s.url[:120]}{C.RST}")
    print(f"\n  {C.B}Total: {len(sources)} tabelas serão criadas no BigQuery{C.RST}\n")

def cmd_purge(args):
    banner("PURGE — Apagar todas tabelas raw_")
    bq = get_client()
    tables = list_tables(bq)
    if not tables:
        log_info("Nenhuma tabela para apagar"); return

    print(f"\n  {C.R}{C.B}ATENÇÃO: Vai apagar {len(tables)} tabelas:{C.RST}")
    for t in tables:
        print(f"    {C.R}✗ {t}{C.RST}")

    resp = input(f"\n  Confirma? (digite 'sim'): ").strip().lower()
    if resp != "sim":
        log_info("Cancelado"); return

    n = purge_tables(bq)
    log_ok(f"{n} tabelas apagadas")

    mp = manifest_path()
    if mp.exists(): mp.unlink()
    log_info("Manifest limpo")

def cmd_status(args):
    banner("STATUS — Tabelas no BigQuery")
    bq = get_client()
    tables = list_tables(bq)
    if not tables:
        log_info("Nenhuma tabela raw_ encontrada"); return

    print(f"  {C.B}{'Tabela':<50} {'Linhas':>12}{C.RST}")
    print(f"  {'─'*65}")
    total_rows = 0
    for t in sorted(tables):
        try:
            tbl = bq.get_table(f"{FULL_DS}.{t}")
            rows = int(tbl.num_rows or 0)
            total_rows += rows
            color = C.G if rows > 0 else C.R
            print(f"  {color}{t:<50}{C.RST} {rows:>12,}")
        except:
            print(f"  {C.R}{t:<50} ???{C.RST}")
    print(f"  {'─'*65}")
    print(f"  {C.B}{'TOTAL':<50} {total_rows:>12,}{C.RST}")
    print(f"\n  {len(tables)} tabelas | {total_rows:,} linhas totais\n")

def cmd_importar(args):
    t_global_start = time.time()
    banner(f"IMPORTADOR TSE → BigQuery  {VERSION}")

    sources = [s for s in load_sources() if s.prioridade <= args.prioridade]
    if not sources:
        log_err("Nenhuma fonte encontrada!"); return

    bq = get_client()
    ensure_ds(bq)

    ok_keys = load_ok_keys() if args.resume and not args.force else set()
    run_id = utcnow().strftime("%Y%m%d_%H%M%S")
    sess = requests.Session()
    sess.headers.update({"User-Agent": "EleicoesGO-Importador/5.0"})

    log_info(f"{len(sources)} fontes | Prioridade ≤ {args.prioridade}")
    log_info(f"Dataset: {FULL_DS} | Resume: {'SIM' if args.resume else 'NÃO'}")
    if FILTRO_MUNICIPAL:
        log_info(f"FILTRO MUNICIPAL: Goiânia + Aparecida de Goiânia")

    n_ok = n_err = n_skip = total_rows = 0
    results = []

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    for idx, src in enumerate(sources, 1):
        ano = str(src.ano) if src.ano else "ATUAL"
        tag = f"[{idx}/{len(sources)}]"
        key = f"{src.tipo}|{ano}|{src.tabela}"

        print(f"\n  {C.B}{'─'*60}{C.RST}")
        log_info(f"{tag} {src.tipo}/{ano} → {src.tabela}" +
                 (f" [csv_filter={src.csv_filter}]" if src.csv_filter else ""))

        if key in ok_keys:
            log_skip(f"Já importado (resume)")
            n_skip += 1
            results.append({"tabela": src.tabela, "status": "skip", "linhas": 0})
            continue

        # Download — usa cache pelo nome do arquivo
        zip_name = Path(src.url.split("?")[0]).name
        zip_path = CACHE_DIR / zip_name

        if not zip_path.exists():
            log_dl(src.url[:120])
            if not download(sess, src.url, zip_path):
                log_error_detail(src.tipo, ano, zip_name, "Download falhou após 3 tentativas")
                n_err += 1
                results.append({"tabela": src.tabela, "status": "erro", "linhas": 0, "erro": "download"})
                continue
            log_dl(f"✓ {fmt_bytes(zip_path.stat().st_size)}")
        else:
            log_skip(f"Cache: {zip_name} ({fmt_bytes(zip_path.stat().st_size)})")

        # Processar ZIP
        t0 = time.time()
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                all_csv = [m for m in zf.infolist()
                           if m.filename.lower().endswith((".csv",".txt"))
                           and not m.filename.startswith("__MACOSX")]

                if not all_csv:
                    log_err(f"Sem CSV no ZIP")
                    n_err += 1
                    results.append({"tabela": src.tabela, "status": "erro", "linhas": 0, "erro": "sem CSV"})
                    continue

                members, already_go = pick_go_csv(zf, all_csv, csv_filter=src.csv_filter)

                if already_go:
                    log_info(f"{len(all_csv)} CSVs no ZIP → usando {len(members)} arquivo(s) _GO")
                elif len(all_csv) > 1:
                    log_info(f"{len(all_csv)} CSVs no ZIP → filtrando por UF=GO")
                else:
                    log_info(f"1 CSV no ZIP")

                all_headers = None
                all_rows = []

                for member in members:
                    fname = Path(member.filename).name
                    headers, rows, n_total, n_go = process_csv_member(zf, member, filter_go=not already_go)

                    if not headers:
                        continue

                    if all_headers is None:
                        all_headers = headers
                    elif headers != all_headers:
                        log_info(f"  {fname}: headers diferente, pulando")
                        continue

                    if n_go > 0:
                        log_flt(f"  {fname}: {n_go:,} linhas GO" + (f" (de {n_total:,})" if n_total != n_go else ""))
                        all_rows.extend(rows)

                if not all_rows or all_headers is None:
                    log_err(f"0 linhas GO encontradas em {zip_name}")
                    log_error_detail(src.tipo, ano, zip_name, "0 linhas GO após filtro")
                    n_err += 1
                    results.append({"tabela": src.tabela, "status": "erro", "linhas": 0, "erro": "0 linhas GO"})
                    continue

                log_load(f"{src.tabela} ({len(all_rows):,} linhas)")
                loaded = load_to_bq(bq, src.tabela, all_headers, all_rows)
                dur = time.time() - t0

                log_ok(f"✓ {src.tabela} | {loaded:,} linhas | {fmt_dur(dur)}")

                n_ok += 1
                total_rows += loaded
                results.append({"tabela": src.tabela, "status": "ok", "linhas": loaded, "duracao": round(dur,1)})

                save_manifest(key, {"tabela": src.tabela, "linhas": loaded, "tipo": src.tipo, "ano": src.ano})

        except zipfile.BadZipFile:
            log_err(f"ZIP corrompido — deletando cache")
            zip_path.unlink(missing_ok=True)
            log_error_detail(src.tipo, ano, zip_name, "ZIP corrompido")
            n_err += 1
            results.append({"tabela": src.tabela, "status": "erro", "linhas": 0, "erro": "ZIP corrompido"})
        except Exception as e:
            log_error_detail(src.tipo, ano, zip_name, e)
            n_err += 1
            results.append({"tabela": src.tabela, "status": "erro", "linhas": 0, "erro": str(e)[:200]})

    # ═══════════════════════════════════════════════════════
    #  RELATÓRIO FINAL
    # ═══════════════════════════════════════════════════════
    dur_total = time.time() - t_global_start

    banner("RELATÓRIO FINAL")

    box("Resumo", [
        f"Versão:      {VERSION}",
        f"Run:         {run_id}",
        f"Duração:     {fmt_dur(dur_total)}",
        f"",
        f"✓ Sucesso:   {n_ok}",
        f"⊘ Pulados:   {n_skip}",
        f"✗ Erros:     {n_err}",
        f"",
        f"Linhas GO:   {total_rows:,}",
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

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    report = {"versao": VERSION, "run_id": run_id, "ok": n_ok, "erros": n_err, "skip": n_skip,
              "linhas": total_rows, "duracao_s": round(dur_total), "resultados": results}
    rp = STATE_DIR / f"report_{run_id}.json"
    rp.write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf-8")

    save_error_log(run_id)

    status = '🎉 Concluído!' if n_err == 0 else '⚠️  Concluído com erros — veja .logs/'
    print(f"\n  {C.B}{status}{C.RST}\n")

# ═══════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════
def main():
    ap = argparse.ArgumentParser(description=f"Importador TSE → BigQuery (GO) {VERSION}")
    sub = ap.add_subparsers(dest="comando")

    p_imp = sub.add_parser("importar", help="Importar dados TSE → BigQuery")
    p_imp.add_argument("--prioridade", type=int, default=99)
    p_imp.add_argument("--resume", action="store_true")
    p_imp.add_argument("--force", action="store_true")

    p_dry = sub.add_parser("dry-run", help="Ver plano sem executar")
    p_dry.add_argument("--prioridade", type=int, default=99)

    sub.add_parser("purge", help="Apagar todas tabelas raw_ do BigQuery")
    sub.add_parser("status", help="Ver tabelas e contagem de linhas")

    args = ap.parse_args()

    if args.comando == "importar": cmd_importar(args)
    elif args.comando == "dry-run": cmd_dry_run(args)
    elif args.comando == "purge": cmd_purge(args)
    elif args.comando == "status": cmd_status(args)
    else:
        ap.print_help()
        print(f"\n  Exemplos:")
        print(f"    python importar_bigquery.py dry-run --prioridade 1")
        print(f"    python importar_bigquery.py importar --prioridade 1")
        print(f"    python importar_bigquery.py importar --resume")
        print(f"    python importar_bigquery.py purge")
        print(f"    python importar_bigquery.py status\n")

if __name__ == "__main__":
    main()
