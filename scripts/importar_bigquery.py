#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════╗
║  IMPORTADOR TSE → BigQuery  v3.0                                ║
║  Filtra GO, resiliente a erros, bonito no console               ║
╚══════════════════════════════════════════════════════════════════╝

Uso:
  python importar_bigquery.py --project SEU_PROJECT --dataset SEU_PROJECT.eleicoes_go --config sources.json

Flags úteis:
  --resume          Pula arquivos já importados com sucesso
  --force           Ignora resume e reimporta tudo
  --prioridade 1    Só importa itens com prioridade <= N
  --dry-run         Mostra o que faria sem executar
"""

import argparse
import csv
import hashlib
import io
import json
import os
import re
import sys
import tempfile
import time
import unicodedata
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Optional, Sequence, Tuple

import requests
from tqdm import tqdm as _tqdm

# BigQuery import (fail gracefully if not installed)
try:
    from google.cloud import bigquery
    from google.api_core.exceptions import NotFound
    HAS_BQ = True
except ImportError:
    HAS_BQ = False

VERSION = "tse-go-bq-v3.0"

# ═══════════════════════════════════════════════════════════
#  CONSOLE BONITO
# ═══════════════════════════════════════════════════════════
class Colors:
    RESET   = "\033[0m"
    BOLD    = "\033[1m"
    RED     = "\033[91m"
    GREEN   = "\033[92m"
    YELLOW  = "\033[93m"
    BLUE    = "\033[94m"
    CYAN    = "\033[96m"
    GRAY    = "\033[90m"
    WHITE   = "\033[97m"
    BG_GREEN = "\033[42m"
    BG_RED   = "\033[41m"
    BG_BLUE  = "\033[44m"

STATUS_COLORS = {
    "START":    f"{Colors.BG_BLUE}{Colors.WHITE}",
    "DOWNLOAD": Colors.CYAN,
    "FILTER":   Colors.BLUE,
    "LOAD":     Colors.YELLOW,
    "OK":       f"{Colors.BG_GREEN}{Colors.WHITE}",
    "SKIP":     Colors.GRAY,
    "ERR":      f"{Colors.BG_RED}{Colors.WHITE}",
    "INFO":     Colors.WHITE,
    "WARN":     Colors.YELLOW,
    "RETRY":    Colors.YELLOW,
    "CLEAN":    Colors.CYAN,
}

def tqdm_stdout(*args, **kwargs):
    kwargs.setdefault("file", sys.stdout)
    kwargs.setdefault("dynamic_ncols", True)
    kwargs.setdefault("bar_format", "{l_bar}{bar:30}{r_bar}")
    return _tqdm(*args, **kwargs)

def ts() -> str:
    return datetime.now().strftime("%H:%M:%S")

def log(status: str, msg: str):
    color = STATUS_COLORS.get(status, Colors.WHITE)
    tag = f"{color} {status:^10} {Colors.RESET}"
    print(f"  {Colors.GRAY}{ts()}{Colors.RESET} {tag} {msg}", flush=True)

def banner(text: str):
    w = max(len(text) + 6, 60)
    print(f"\n  {Colors.BOLD}{Colors.CYAN}{'═' * w}{Colors.RESET}")
    print(f"  {Colors.BOLD}{Colors.CYAN}║{Colors.RESET}  {Colors.BOLD}{text}{Colors.RESET}")
    print(f"  {Colors.BOLD}{Colors.CYAN}{'═' * w}{Colors.RESET}\n")

def summary_box(title: str, lines: List[str]):
    w = max(max(len(l) for l in lines) + 6, len(title) + 6, 50)
    print(f"\n  {Colors.GREEN}┌{'─' * w}┐{Colors.RESET}")
    print(f"  {Colors.GREEN}│{Colors.RESET} {Colors.BOLD}{title:<{w-2}}{Colors.RESET} {Colors.GREEN}│{Colors.RESET}")
    print(f"  {Colors.GREEN}├{'─' * w}┤{Colors.RESET}")
    for l in lines:
        print(f"  {Colors.GREEN}│{Colors.RESET} {l:<{w-2}} {Colors.GREEN}│{Colors.RESET}")
    print(f"  {Colors.GREEN}└{'─' * w}┘{Colors.RESET}\n")

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

def iso_ts(dt: datetime) -> str:
    return dt.isoformat()


# ═══════════════════════════════════════════════════════════
#  UTILS
# ═══════════════════════════════════════════════════════════
def safe_int(x) -> Optional[int]:
    if x is None: return None
    try: return int(str(x).strip())
    except: return None

def bq_ident(s: str) -> str:
    s = (s or "").strip().lower()
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z0-9_]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "x"

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def digits_only(s: str) -> str:
    return re.sub(r"\D+", "", s or "")

def fmt_bytes(n: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if n < 1024: return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"

def fmt_duration(secs: float) -> str:
    if secs < 60: return f"{secs:.0f}s"
    m, s = divmod(int(secs), 60)
    if m < 60: return f"{m}m{s:02d}s"
    h, m = divmod(m, 60)
    return f"{h}h{m:02d}m{s:02d}s"


# ═══════════════════════════════════════════════════════════
#  MANIFEST (resume)
# ═══════════════════════════════════════════════════════════
def manifest_key(fonte: str, tipo: str, ano: Optional[int], arquivo: str, sha: str) -> str:
    return f"{fonte}|{tipo}|{ano if ano is not None else 'ATUAL'}|{arquivo}|{sha}"

def append_manifest(path: Path, obj: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")

def load_ok_keys(path: Path) -> set:
    ok = set()
    if not path.exists(): return ok
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try:
                obj = json.loads(line)
                if obj.get("status") == "sucesso" and obj.get("key"):
                    ok.add(obj["key"])
            except: pass
    return ok


# ═══════════════════════════════════════════════════════════
#  CONFIG / SOURCES
# ═══════════════════════════════════════════════════════════
@dataclass
class SourceItem:
    fonte: str
    tipo: str
    ano: Optional[int]
    formato: str
    url: str
    tabela_bq: str = ""
    prioridade: int = 1

def load_sources(path: Path) -> List[SourceItem]:
    data = json.loads(path.read_text(encoding="utf-8"))
    items = data.get("items") or []
    out = []
    for it in items:
        fonte = str(it.get("fonte") or "").strip()
        tipo = str(it.get("tipo") or "").strip()
        url = str(it.get("url") or "").strip()
        if not (fonte and tipo and url): continue
        out.append(SourceItem(
            fonte=fonte, tipo=tipo,
            ano=safe_int(it.get("ano")),
            formato=str(it.get("formato") or "zip_csv").strip(),
            url=url,
            tabela_bq=str(it.get("tabela_bq") or "").strip(),
            prioridade=safe_int(it.get("prioridade")) or 1,
        ))
    return out


# ═══════════════════════════════════════════════════════════
#  DOWNLOAD (com retry)
# ═══════════════════════════════════════════════════════════
def download_with_retry(session: requests.Session, url: str, out_path: Path, max_retries: int = 3) -> bool:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(1, max_retries + 1):
        try:
            with session.get(url, stream=True, timeout=300) as r:
                r.raise_for_status()
                total = int(r.headers.get("content-length") or 0)
                with out_path.open("wb") as f, tqdm_stdout(
                    total=total if total > 0 else None,
                    unit="B", unit_scale=True,
                    desc=f"  ↓ {out_path.name}",
                    leave=False
                ) as p:
                    for chunk in r.iter_content(chunk_size=1 << 18):
                        if chunk:
                            f.write(chunk)
                            p.update(len(chunk))
            return True
        except Exception as e:
            if attempt < max_retries:
                wait = attempt * 5
                log("RETRY", f"Download falhou (tentativa {attempt}/{max_retries}): {e}. Aguardando {wait}s...")
                time.sleep(wait)
            else:
                log("ERR", f"Download falhou após {max_retries} tentativas: {e}")
                return False
    return False


# ═══════════════════════════════════════════════════════════
#  CSV PARSING
# ═══════════════════════════════════════════════════════════
def detect_delimiter(sample_line: str) -> str:
    candidates = [";", ",", "\t", "|"]
    counts = {c: sample_line.count(c) for c in candidates}
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else ";"

def norm_header(h: str) -> str:
    h = (h or "").strip().lower().replace("\ufeff", "")
    h = unicodedata.normalize("NFKD", h).encode("ascii", "ignore").decode("ascii")
    h = h.replace(" ", "_").replace(".", "")
    h = re.sub(r"[^a-z0-9_]+", "_", h)
    h = re.sub(r"_+", "_", h).strip("_")
    return h or "col_x"

def dedupe_headers(headers: List[str]) -> List[str]:
    seen: Dict[str, int] = {}
    out = []
    for h in headers:
        n = seen.get(h, 0)
        out.append(h if n == 0 else f"{h}__{n+1}")
        seen[h] = n + 1
    return out

def decode_best_effort(b: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try: return b.decode(enc)
        except: pass
    return b.decode("latin-1", errors="replace")

def iter_csv_from_zip(zf: zipfile.ZipFile, member: zipfile.ZipInfo):
    raw = zf.read(member.filename)
    text = decode_best_effort(raw)
    lines = text.split("\n", 1)
    if not lines or not lines[0].strip():
        return [], iter(()), ";"
    delim = detect_delimiter(lines[0])
    sio = io.StringIO(text)
    reader = csv.reader(sio, delimiter=delim)
    header = next(reader, [])
    return header, reader, delim


# ═══════════════════════════════════════════════════════════
#  FILTRO GO (resiliente)
# ═══════════════════════════════════════════════════════════
UF_COL_PRIORITY = ["sg_uf", "sigla_uf", "uf", "cd_uf", "cod_uf"]
UF_BAD_HINTS = ["nasc", "natural", "origem", "uf_nascimento", "uf_nat"]
MUN_COL_CANDIDATES = [
    "cd_municipio", "cod_municipio", "codigo_municipio", "id_municipio",
    "codmun", "cdmun", "geocodigo", "codigo_ibge", "cod_ibge"
]

def find_col(headers, priority, bad_hints=()):
    for name in priority:
        if name in headers:
            idx = headers.index(name)
            if any(b in headers[idx] for b in bad_hints): continue
            return idx
    return None

def find_mun_col(headers):
    for name in MUN_COL_CANDIDATES:
        if name in headers: return headers.index(name)
    for i, h in enumerate(headers):
        if "municip" in h or "munic" in h: return i
    return None

def keep_row_go(headers, row, uf="GO"):
    uf_idx = find_col(headers, UF_COL_PRIORITY, UF_BAD_HINTS)
    if uf_idx is not None:
        val = (row[uf_idx] if uf_idx < len(row) else "").strip().upper()
        return val == uf
    mun_idx = find_mun_col(headers)
    if mun_idx is not None:
        val = digits_only(row[mun_idx] if mun_idx < len(row) else "")
        return val.startswith("52")
    # Sem coluna de UF/município → arquivo já é _GO, aceita tudo
    return True

def write_filtered_csv(out_path: Path, headers: List[str], rows, desc: str) -> int:
    n = 0
    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=",", quoting=csv.QUOTE_MINIMAL)
        w.writerow(headers)
        for row in tqdm_stdout(rows, desc=f"  ⏳ {desc}", unit=" lin", leave=False):
            if not keep_row_go(headers, row):
                continue
            if len(row) < len(headers):
                row = list(row) + [""] * (len(headers) - len(row))
            elif len(row) > len(headers):
                row = list(row[:len(headers)])
            w.writerow(row)
            n += 1
    return n


# ═══════════════════════════════════════════════════════════
#  BIGQUERY
# ═══════════════════════════════════════════════════════════
def ensure_dataset(client, project: str, dataset: str, location: str = "US"):
    ds_id = f"{project}.{dataset}"
    try:
        client.get_dataset(ds_id)
    except NotFound:
        ds = bigquery.Dataset(ds_id)
        ds.location = location
        client.create_dataset(ds)
        log("INFO", f"Dataset criado: {ds_id}")

def ensure_table(client, table_id: str, headers: List[str]):
    try:
        client.get_table(table_id)
        return
    except NotFound:
        schema = [bigquery.SchemaField(h, "STRING") for h in headers]
        table = bigquery.Table(table_id, schema=schema)
        client.create_table(table)
        log("INFO", f"Tabela criada: {table_id}")

def load_csv_to_bq(client, table_id: str, csv_path: Path) -> int:
    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.CSV,
        skip_leading_rows=1,
        field_delimiter=",",
        quote_character='"',
        allow_quoted_newlines=True,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    with csv_path.open("rb") as f:
        job = client.load_table_from_file(f, table_id, job_config=job_config)
    job.result()
    dest = client.get_table(table_id)
    return int(dest.num_rows or 0)


# ═══════════════════════════════════════════════════════════
#  RESULTADO TRACKING
# ═══════════════════════════════════════════════════════════
@dataclass
class ImportResult:
    fonte: str
    tipo: str
    ano: Optional[int]
    arquivo: str
    tabela: str
    linhas: int
    status: str  # sucesso | erro | skip
    erro: str = ""
    duracao: float = 0.0

@dataclass
class RunStats:
    total: int = 0
    sucesso: int = 0
    erro: int = 0
    skip: int = 0
    linhas_total: int = 0
    resultados: List[ImportResult] = field(default_factory=list)
    erros_detalhe: List[str] = field(default_factory=list)
    inicio: float = field(default_factory=time.time)


# ═══════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════
def main():
    ap = argparse.ArgumentParser(description="Importador TSE → BigQuery (GO)")
    ap.add_argument("--project", required=True, help="Google Cloud project ID")
    ap.add_argument("--dataset", required=True, help="project.dataset (ex: meu-proj.eleicoes_go)")
    ap.add_argument("--config", required=True, help="Caminho do sources.json")
    ap.add_argument("--resume", action="store_true", help="Pula itens já importados")
    ap.add_argument("--force", action="store_true", help="Reimporta tudo (ignora resume)")
    ap.add_argument("--prioridade", type=int, default=99, help="Importa só itens com prioridade <= N")
    ap.add_argument("--location", default="US", help="Localização do dataset BigQuery")
    ap.add_argument("--dry-run", action="store_true", help="Mostra plano sem executar")
    args = ap.parse_args()

    if not HAS_BQ and not args.dry_run:
        print(f"\n  {Colors.RED}ERRO: google-cloud-bigquery não instalado!{Colors.RESET}")
        print(f"  Execute: pip install google-cloud-bigquery\n")
        sys.exit(1)

    parts = args.dataset.split(".")
    if len(parts) != 2:
        print(f"\n  {Colors.RED}ERRO: --dataset deve ser project.dataset{Colors.RESET}\n")
        sys.exit(1)
    ds_project, dataset_id = parts

    banner(f"IMPORTADOR TSE → BigQuery  {VERSION}")

    cfg_path = Path(args.config)
    cache_dir = Path(".cache_tse")
    state_dir = Path(".state")
    cache_dir.mkdir(parents=True, exist_ok=True)
    state_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = state_dir / "manifest.jsonl"

    sources = load_sources(cfg_path)
    if not sources:
        log("ERR", "Config sem itens válidos!")
        sys.exit(1)

    # Filtra por prioridade
    sources = [s for s in sources if s.prioridade <= args.prioridade]

    log("INFO", f"Config: {cfg_path.name} | {len(sources)} fontes | Prioridade ≤ {args.prioridade}")
    log("INFO", f"Dataset: {ds_project}.{dataset_id} | Location: {args.location}")
    log("INFO", f"Resume: {'SIM' if args.resume else 'NÃO'} | Force: {'SIM' if args.force else 'NÃO'}")

    if args.dry_run:
        banner("DRY RUN - Plano de Importação")
        for i, s in enumerate(sources, 1):
            ano = s.ano or "ATUAL"
            print(f"  {Colors.CYAN}{i:3d}.{Colors.RESET} {s.fonte}/{s.tipo}/{ano} → {s.tabela_bq or 'auto'}")
            print(f"       {Colors.GRAY}{s.url}{Colors.RESET}")
        print(f"\n  {Colors.BOLD}Total: {len(sources)} fontes para importar{Colors.RESET}\n")
        return

    # Init BigQuery
    bq = bigquery.Client(project=args.project)
    ensure_dataset(bq, ds_project, dataset_id, location=args.location)

    ok_keys = load_ok_keys(manifest_path) if args.resume else set()
    run_id = utcnow().strftime("%Y%m%d_%H%M%S")
    stats = RunStats()
    sess = requests.Session()

    banner(f"Iniciando importação — {len(sources)} fontes")

    for src_idx, src in enumerate(sources, 1):
        ano_token = str(src.ano) if src.ano is not None else "ATUAL"
        prefix = f"[{src_idx}/{len(sources)}]"

        url_name = Path(src.url.split("?")[0]).name or f"{bq_ident(src.tipo)}_{ano_token}.zip"
        zip_path = cache_dir / url_name

        print(f"\n  {Colors.BOLD}{'─' * 60}{Colors.RESET}")
        log("START", f"{prefix} {src.fonte}/{src.tipo}/{ano_token}")

        # Download
        if not zip_path.exists():
            log("DOWNLOAD", f"{src.url}")
            if not download_with_retry(sess, src.url, zip_path):
                stats.erro += 1
                stats.erros_detalhe.append(f"{src.tipo}/{ano_token}: download falhou")
                stats.resultados.append(ImportResult(
                    src.fonte, src.tipo, src.ano, url_name, "", 0, "erro", "download falhou"
                ))
                continue
            log("DOWNLOAD", f"✓ {fmt_bytes(zip_path.stat().st_size)}")
        else:
            log("SKIP", f"Cache: {url_name} ({fmt_bytes(zip_path.stat().st_size)})")

        zip_sha = sha256_file(zip_path)

        # Processar ZIP
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                members = [m for m in zf.infolist()
                          if m.filename.lower().endswith((".csv", ".txt"))
                          and not m.filename.startswith("__MACOSX")]

                if not members:
                    log("WARN", f"Sem CSV/TXT no ZIP: {url_name}")
                    continue

                log("INFO", f"{len(members)} arquivo(s) no ZIP")

                for member in members:
                    arquivo = Path(member.filename).name
                    key = manifest_key(src.fonte, src.tipo, src.ano, arquivo, zip_sha)
                    stats.total += 1

                    if args.resume and not args.force and key in ok_keys:
                        log("SKIP", f"  {arquivo} (já importado)")
                        stats.skip += 1
                        stats.resultados.append(ImportResult(
                            src.fonte, src.tipo, src.ano, arquivo, "", 0, "skip"
                        ))
                        continue

                    t0 = time.time()

                    header_raw, rows_iter, delim = iter_csv_from_zip(zf, member)
                    if not header_raw:
                        log("WARN", f"  CSV vazio: {arquivo}")
                        continue

                    header_norm = dedupe_headers([norm_header(h) for h in header_raw])
                    log("FILTER", f"  {arquivo} | delim='{delim}' | {len(header_norm)} colunas")

                    with tempfile.TemporaryDirectory() as td:
                        out_csv = Path(td) / "filtered.csv"
                        written = write_filtered_csv(
                            out_csv, header_norm, rows_iter,
                            desc=f"{src.tipo}/{ano_token}"
                        )

                        if written == 0:
                            log("WARN", f"  0 linhas GO em {arquivo}")
                            continue

                        # Tabela BigQuery
                        if src.tabela_bq:
                            stem = bq_ident(Path(arquivo).stem)
                            if len(members) > 1:
                                table_name = f"{src.tabela_bq}__{stem}"
                            else:
                                table_name = src.tabela_bq
                        else:
                            table_name = f"raw__{bq_ident(src.fonte)}__{bq_ident(src.tipo)}__{ano_token}__{bq_ident(Path(arquivo).stem)}"

                        table_id = f"{ds_project}.{dataset_id}.{table_name}"

                        ensure_table(bq, table_id, header_norm)
                        log("LOAD", f"  → {table_name} ({written:,} linhas)")

                        loaded = load_csv_to_bq(bq, table_id, out_csv)
                        duracao = time.time() - t0

                        log("OK", f"  ✓ {table_name} | {loaded:,} linhas | {fmt_duration(duracao)}")

                        stats.sucesso += 1
                        stats.linhas_total += loaded
                        stats.resultados.append(ImportResult(
                            src.fonte, src.tipo, src.ano, arquivo, table_name, loaded, "sucesso", duracao=duracao
                        ))

                        append_manifest(manifest_path, {
                            "ts": iso_ts(utcnow()),
                            "run_id": run_id,
                            "key": key,
                            "status": "sucesso",
                            "fonte": src.fonte,
                            "tipo": src.tipo,
                            "ano": src.ano,
                            "arquivo": arquivo,
                            "sha256": zip_sha,
                            "table_id": table_id,
                            "linhas_bq": loaded,
                        })
                        ok_keys.add(key)

        except zipfile.BadZipFile:
            log("ERR", f"ZIP corrompido: {url_name} — deletando cache")
            zip_path.unlink(missing_ok=True)
            stats.erro += 1
            stats.erros_detalhe.append(f"{src.tipo}/{ano_token}: ZIP corrompido")
            stats.resultados.append(ImportResult(
                src.fonte, src.tipo, src.ano, url_name, "", 0, "erro", "ZIP corrompido"
            ))
        except Exception as e:
            log("ERR", f"Erro processando {src.tipo}/{ano_token}: {e}")
            stats.erro += 1
            stats.erros_detalhe.append(f"{src.tipo}/{ano_token}: {str(e)[:100]}")
            stats.resultados.append(ImportResult(
                src.fonte, src.tipo, src.ano, url_name, "", 0, "erro", str(e)[:200]
            ))

    # ═══════════════════════════════════════════════════════
    #  RELATÓRIO FINAL
    # ═══════════════════════════════════════════════════════
    duracao_total = time.time() - stats.inicio

    banner("RELATÓRIO FINAL")

    summary_box("Resumo da Importação", [
        f"Versão:       {VERSION}",
        f"Run ID:       {run_id}",
        f"Duração:      {fmt_duration(duracao_total)}",
        f"",
        f"Total:        {stats.total} arquivos",
        f"✓ Sucesso:    {stats.sucesso}",
        f"⊘ Pulados:    {stats.skip}",
        f"✗ Erros:      {stats.erro}",
        f"",
        f"Linhas GO:    {stats.linhas_total:,}",
    ])

    if stats.resultados:
        print(f"  {Colors.BOLD}Detalhamento:{Colors.RESET}")
        print(f"  {'─' * 90}")
        print(f"  {'Status':<10} {'Tipo':<25} {'Ano':<6} {'Tabela':<30} {'Linhas':>10}")
        print(f"  {'─' * 90}")
        for r in stats.resultados:
            ano = str(r.ano) if r.ano else "—"
            status_color = Colors.GREEN if r.status == "sucesso" else (Colors.GRAY if r.status == "skip" else Colors.RED)
            icon = "✓" if r.status == "sucesso" else ("⊘" if r.status == "skip" else "✗")
            print(f"  {status_color}{icon} {r.status:<8}{Colors.RESET} {r.tipo:<25} {ano:<6} {r.tabela:<30} {r.linhas:>10,}")
        print(f"  {'─' * 90}")

    if stats.erros_detalhe:
        print(f"\n  {Colors.RED}{Colors.BOLD}Erros encontrados:{Colors.RESET}")
        for e in stats.erros_detalhe:
            print(f"  {Colors.RED}  ✗ {e}{Colors.RESET}")

    # Salvar relatório JSON
    report_path = state_dir / f"report_{run_id}.json"
    report = {
        "versao": VERSION,
        "run_id": run_id,
        "inicio": iso_ts(datetime.fromtimestamp(stats.inicio, tz=timezone.utc)),
        "fim": iso_ts(utcnow()),
        "duracao_segundos": round(duracao_total, 1),
        "total": stats.total,
        "sucesso": stats.sucesso,
        "erros": stats.erro,
        "skip": stats.skip,
        "linhas_total": stats.linhas_total,
        "resultados": [
            {
                "fonte": r.fonte, "tipo": r.tipo, "ano": r.ano,
                "arquivo": r.arquivo, "tabela": r.tabela,
                "linhas": r.linhas, "status": r.status,
                "erro": r.erro, "duracao": round(r.duracao, 1),
            }
            for r in stats.resultados
        ],
        "erros_detalhe": stats.erros_detalhe,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    log("INFO", f"Relatório salvo: {report_path}")

    print(f"\n  {Colors.BOLD}{'🎉 Importação concluída!' if stats.erro == 0 else '⚠️  Importação concluída com erros'}{Colors.RESET}\n")


if __name__ == "__main__":
    main()
