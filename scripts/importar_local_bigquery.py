#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════╗
║  IMPORTADOR LOCAL → BigQuery  v1.0  (Goiás)                      ║
║  Lê ZIPs/CSVs de pasta local, filtra GO, sobe no BigQuery        ║
║  Sem download — usa arquivos já baixados manualmente              ║
╚══════════════════════════════════════════════════════════════════╝

Uso:
  python importar_local_bigquery.py scan              # Ver o que será importado
  python importar_local_bigquery.py importar           # Importar tudo
  python importar_local_bigquery.py importar --resume  # Pular já importados
  python importar_local_bigquery.py status             # Ver tabelas no BQ

Ajuste a variável PASTA_DADOS abaixo para apontar para sua pasta.
"""

import argparse, csv, hashlib, io, json, os, re, sys, tempfile, time
import unicodedata, zipfile, glob
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

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
#  CONFIGURAÇÃO — AJUSTE AQUI
# ═══════════════════════════════════════════════════════════
PROJECT    = "silver-idea-389314"
DATASET    = "eleicoes_go_clean"
FULL_DS    = f"{PROJECT}.{DATASET}"
LOCATION   = "US"
UF_FILTRO  = "GO"
VERSION    = "local-bq-v1.0"

# Pasta com os ZIPs baixados — AJUSTE PARA SUA MÁQUINA
PASTA_DADOS = Path(r"C:\Users\Gustavo\Desktop\dados")

BASE_DIR   = Path(__file__).resolve().parent
STATE_DIR  = BASE_DIR / ".state_local"
LOG_DIR    = BASE_DIR / ".logs_local"

# ═══════════════════════════════════════════════════════════
#  MAPEAMENTO: nome do arquivo → tabela BigQuery
# ═══════════════════════════════════════════════════════════
# Cada padrão mapeia regex do nome do ZIP → (tipo, tabela_prefix)
# Ano é extraído automaticamente do nome do arquivo
FILE_PATTERNS = [
    # --- Candidatos (já existe no sources.json original, mas vamos processar se não estiver no BQ)
    (r"consulta_cand_(\d{4})\.zip$",                    "candidatos",            "raw_candidatos"),
    (r"consulta_cand_complementar_(\d{4})\.zip$",       "cand_complementar",     "raw_candidatos_complementar"),

    # --- Votação
    (r"votacao_candidato_munzona_(\d{4})\.zip$",        "votacao_munzona",       "raw_votacao_munzona"),
    (r"votacao_partido_munzona_(\d{4})\.zip$",          "votacao_partido",       "raw_votacao_partido_munzona"),
    (r"votacao_secao_(\d{4})_(?:GO|BR).*\.zip$",        "votacao_secao",         "raw_votacao_secao"),

    # --- Comparecimento / Detalhe votação
    (r"detalhe_votacao_munzona_(\d{4})\.zip$",          "detalhe_vot_munzona",   "raw_detalhe_votacao_munzona"),
    (r"detalhe_votacao_secao_(\d{4})\.zip$",            "detalhe_vot_secao",     "raw_detalhe_votacao_secao"),

    # --- Bens candidatos
    (r"bem_candidato_(\d{4})\.zip$",                    "bens_candidatos",       "raw_bens_candidatos"),

    # --- Prestação de contas (receitas + despesas no mesmo ZIP)
    (r"prestacao_de_contas_eleitorais_candidatos_(\d{4})\.zip$", "prestacao_contas_cand", "raw_prestacao_contas_cand"),
    (r"prestacao_de_contas_eleitorais_orgaos_partidarios_(\d{4})\.zip$", "prestacao_partidos", "raw_prestacao_partidos"),
    (r"prestacao_contas_final_(\d{4})\.zip$",           "prestacao_final",       "raw_prestacao_final"),
    (r"prestacao_contas_final_sup_(\d{4})\.zip$",       "prestacao_final_sup",   "raw_prestacao_final_sup"),
    (r"prestacao_contas_parcial_(\d{4})\.zip$",         "prestacao_parcial",     "raw_prestacao_parcial"),
    (r"prestacao_contas_relatorio_financeiro_(\d{4})\.zip$", "relatorio_fin",    "raw_relatorio_financeiro"),
    (r"prestacao_contas_(\d{4})\.zip$",                 "prestacao_contas",      "raw_prestacao_contas"),

    # --- Perfil eleitorado
    (r"perfil_eleitorado_(\d{4})\.zip$",                "perfil_eleitorado",     "raw_perfil_eleitorado"),
    (r"perfil_eleitor_secao_(\d{4})_GO\.zip$",          "perfil_eleitor_secao",  "raw_perfil_eleitor_secao"),

    # --- Perfil comparecimento/abstenção
    (r"perfil_comparecimento_abstencao_(\d{4}).*\.zip$","perfil_comparecimento", "raw_perfil_comparecimento"),
    (r"perfil_comparecimento_abstencao_eleitor_deficiente_(\d{4}).*\.zip$", "perfil_comp_deficiente", "raw_perfil_comp_deficiente"),
    (r"perfil_comparecimento_abstencao_eleitor_tte_(\d{4}).*\.zip$", "perfil_comp_tte", "raw_perfil_comp_tte"),

    # --- Eleitorado local
    (r"eleitorado_local_votacao_(\d{4})\.zip$",         "eleitorado_local",      "raw_eleitorado_local"),

    # --- Coligações
    (r"consulta_coligacao_(\d{4})\.zip$",               "coligacoes",            "raw_coligacoes"),

    # --- Vagas
    (r"consulta_vagas_(\d{4})\.zip$",                   "vagas",                 "raw_vagas"),

    # --- Redes sociais
    (r"rede_social_candidato_(\d{4})(?:_GO)?\.zip$",    "redes_sociais",         "raw_redes_sociais"),

    # --- Cassações
    (r"motivo_cassacao_(\d{4}).*\.zip$",                "cassacoes",             "raw_cassacoes"),

    # --- Boletim de urna
    (r"bweb_(\d)t_GO_.*\.zip$",                         "boletim_urna",          "raw_boletim_urna"),
    (r"BWEB_(\d)t_GO_.*\.zip$",                         "boletim_urna",          "raw_boletim_urna"),

    # --- Mesários
    (r"convocacao_mesarios_(\d{4})\.zip$",              "mesarios",              "raw_mesarios"),
    (r"convocacao_mesarios_funcoes_especiais_(\d{4})\.zip$", "mesarios_especiais", "raw_mesarios_especiais"),

    # --- Extrato bancário
    (r"extrato_bancario_candidato_(\d{4})\.zip$",       "extrato_bancario",      "raw_extrato_bancario"),
    (r"extrato_bancario_partido_(\d{4})\.zip$",         "extrato_bancario_part", "raw_extrato_bancario_partido"),
    (r"extrato_campanha_(\d{4})_GO\.zip$",              "extrato_campanha",      "raw_extrato_campanha"),

    # --- FEFC / Fundo partidário
    (r"fefc_fp_(\d{4})\.zip$",                          "fefc_fp",               "raw_fefc_fp"),

    # --- CNPJ campanha
    (r"cnpj_?campanha_(\d{4})\.zip$",                   "cnpj_campanha",         "raw_cnpj_campanha"),
    (r"cnpj(\d{4})\.zip$",                              "cnpj_campanha",         "raw_cnpj_campanha"),
    (r"CNPJ_campanha_(\d{4})\.zip$",                    "cnpj_campanha",         "raw_cnpj_campanha"),
    (r"CNPJ_diretorios_partidarios_(\d{4})\.zip$",      "cnpj_dir_partidario",   "raw_cnpj_dir_partidario"),

    # --- Certidão criminal
    (r"certidao_criminal_(\d{4})_GO\.zip$",             "certidao_criminal",     "raw_certidao_criminal"),

    # --- Fotos (pular)
    (r"foto_cand\d{4}_GO_div\.zip$",                    "__SKIP__",              "__SKIP__"),

    # --- Propostas governo (pular)
    (r"proposta_governo_(\d{4})_GO\.zip$",              "__SKIP__",              "__SKIP__"),

    # --- Histórico totalização (nacional, pular)
    (r"Historico_Totalizacao_.*\.zip$",                 "__SKIP__",              "__SKIP__"),

    # --- Municipio TSE-IBGE
    (r"municipio_tse_ibge\.zip$",                       "municipio_tse_ibge",    "raw_municipio_tse_ibge"),
]

# Arquivos CSV soltos (não ZIP)
CSV_PATTERNS = [
    (r"Censo 2022 - Alfabetiza",    "censo_alfabetizacao",   "raw_censo_alfabetizacao"),
    (r"Censo 2022 - Pir.mide",      "censo_piramide_etaria", "raw_censo_piramide_etaria"),
    (r"Censo 2022 - Popula.*cor",    "censo_cor_raca",        "raw_censo_cor_raca"),
    (r"Censo 2022 - Popula.*sexo",   "censo_sexo",            "raw_censo_sexo"),
]

# Arquivos Excel (IBGE)
XLSX_PATTERNS = [
    (r"tabela6579\.xlsx$",  "ibge_populacao",  "raw_ibge_populacao"),
    (r"tabela5938\.xlsx$",  "ibge_pib",        "raw_ibge_pib"),
]

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
def utcnow(): return datetime.now(timezone.utc)

def fmt_bytes(n):
    for u in ["B","KB","MB","GB"]:
        if n < 1024: return f"{n:.1f} {u}"
        n /= 1024
    return f"{n:.1f} TB"

def fmt_dur(s):
    if s < 60: return f"{s:.0f}s"
    m, s = divmod(int(s), 60)
    return f"{m}m{s:02d}s" if m < 60 else f"{m//60}h{m%60:02d}m{s:02d}s"

def norm_h(h):
    h = unicodedata.normalize("NFKD", (h or "").strip().lower().replace("\ufeff",""))
    h = h.encode("ascii","ignore").decode("ascii").replace(" ","_").replace(".","")
    h = re.sub(r"[^a-z0-9_]+","_",h)
    return re.sub(r"_+","_",h).strip("_") or "col_x"

def dedupe_headers(headers):
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

def detect_delim(line):
    counts = {c: line.count(c) for c in [";",",","\t","|"]}
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else ";"

def sanitize_field(val):
    if not val: return ""
    val = val.replace("\r\n"," ").replace("\r"," ").replace("\n"," ").replace("\x00","")
    if val.count('"') % 2 != 0:
        val = val.replace('"', "'")
    return val.strip()

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
#  FILTRO GO
# ═══════════════════════════════════════════════════════════
UF_COLS  = ["sg_uf","sigla_uf","uf","cd_uf","cod_uf","sg_uf_voto","sg_uf_cnpj"]
UF_BAD   = ["nasc","natural","origem","nascimento"]
MUN_COLS = ["cd_municipio","cod_municipio","codigo_municipio","id_municipio","codmun","cdmun",
            "sg_ue","cd_municipio_nascimento","cd_mun"]

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

def is_go_row(headers, row, uf_idx, mun_idx):
    """Retorna True se a linha é de Goiás."""
    if uf_idx is not None:
        val = (row[uf_idx] if uf_idx < len(row) else "").strip().upper()
        return val == "GO" or val == "52"
    if mun_idx is not None:
        val = re.sub(r"\D","", row[mun_idx] if mun_idx < len(row) else "")
        return val.startswith("52")
    # Sem coluna UF/município → aceitar tudo (pode ser arquivo já filtrado por GO)
    return True

# ═══════════════════════════════════════════════════════════
#  SCAN LOCAL — descobrir arquivos e mapear para tabelas
# ═══════════════════════════════════════════════════════════
@dataclass
class LocalFile:
    path: Path
    filename: str
    tipo: str
    tabela: str
    ano: Optional[int]
    formato: str  # "zip", "csv", "xlsx"
    size_bytes: int

def extract_ano_from_bweb(filename):
    """Extrai ano dos arquivos bweb pelo timestamp no nome."""
    # bweb_1t_GO_091020241636 → 2024
    m = re.search(r"(\d{2})(\d{2})(\d{4})(\d{4})\.zip", filename)
    if m:
        return int(m.group(3))
    # bweb_1t_GO_14102014133534 → 2014
    m = re.search(r"(\d{2})(\d{2})(\d{4})(\d{6})\.zip", filename)
    if m:
        return int(m.group(3))
    return None

def scan_folder(pasta: Path) -> List[LocalFile]:
    """Escaneia a pasta e retorna lista de arquivos reconhecidos."""
    files = []
    seen_tabelas = {}  # tabela → melhor arquivo (evita duplicatas)

    if not pasta.exists():
        log_err(f"Pasta não encontrada: {pasta}")
        return []

    all_files = sorted(pasta.iterdir())

    for fp in all_files:
        if not fp.is_file():
            continue

        fname = fp.name

        # Pular checksums e arquivos de config
        if fname.endswith((".sha1", ".sha512", ".json")):
            continue

        # Pular ZIPs de projeto
        if any(x in fname.lower() for x in ["setlovable", "se7-prompt", "Tabelas_panorama"]):
            continue

        matched = False

        # Tentar ZIPs
        if fname.lower().endswith(".zip"):
            for pattern, tipo, tabela_prefix in FILE_PATTERNS:
                m = re.search(pattern, fname, re.IGNORECASE)
                if m:
                    matched = True
                    if tipo == "__SKIP__":
                        break

                    # Extrair ano
                    ano = None
                    if m.groups():
                        try:
                            val = int(m.group(1))
                            if val >= 2000:
                                ano = val
                            elif val <= 2:  # turno do boletim
                                ano = extract_ano_from_bweb(fname)
                        except:
                            pass

                    if tipo == "boletim_urna":
                        # Boletim: turno está no nome, ano no timestamp
                        turno_match = re.search(r"(\d)t_GO", fname)
                        turno = turno_match.group(1) if turno_match else "1"
                        if ano:
                            tabela = f"{tabela_prefix}_{ano}_t{turno}"
                        else:
                            tabela = f"{tabela_prefix}_{turno}t"
                    else:
                        tabela = f"{tabela_prefix}_{ano}" if ano else tabela_prefix

                    # Evitar duplicatas: (1).zip
                    if " (1)" in fname or "(1)" in fname:
                        if tabela in seen_tabelas:
                            break  # Já temos o original

                    lf = LocalFile(
                        path=fp, filename=fname, tipo=tipo,
                        tabela=tabela, ano=ano, formato="zip",
                        size_bytes=fp.stat().st_size
                    )

                    # Se já existe, só substituir se for mais novo
                    if tabela not in seen_tabelas:
                        seen_tabelas[tabela] = lf
                        files.append(lf)

                    break

        # CSVs soltos (Censo)
        elif fname.lower().endswith(".csv"):
            for pattern, tipo, tabela in CSV_PATTERNS:
                if re.search(pattern, fname, re.IGNORECASE):
                    matched = True
                    lf = LocalFile(
                        path=fp, filename=fname, tipo=tipo,
                        tabela=tabela, ano=2022, formato="csv",
                        size_bytes=fp.stat().st_size
                    )
                    if tabela not in seen_tabelas:
                        seen_tabelas[tabela] = lf
                        files.append(lf)
                    break

        # Excel (IBGE)
        elif fname.lower().endswith(".xlsx"):
            for pattern, tipo, tabela in XLSX_PATTERNS:
                if re.search(pattern, fname, re.IGNORECASE):
                    matched = True
                    lf = LocalFile(
                        path=fp, filename=fname, tipo=tipo,
                        tabela=tabela, ano=None, formato="xlsx",
                        size_bytes=fp.stat().st_size
                    )
                    if tabela not in seen_tabelas:
                        seen_tabelas[tabela] = lf
                        files.append(lf)
                    break

        if not matched and fp.suffix.lower() in (".zip", ".csv", ".xlsx"):
            log_info(f"  ⚠ Não reconhecido: {fname}")

    return files

# ═══════════════════════════════════════════════════════════
#  PROCESSAR CSV (de ZIP ou arquivo solto)
# ═══════════════════════════════════════════════════════════
def process_csv_content(text, filter_go=True):
    """Processa conteúdo CSV e retorna headers, rows filtrados por GO."""
    lines = text.split("\n", 1)
    if not lines or not lines[0].strip():
        return [], [], 0, 0

    delim = detect_delim(lines[0])
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    header_raw = next(reader, [])
    if not header_raw:
        return [], [], 0, 0

    headers = dedupe_headers([norm_h(h) for h in header_raw])

    if not filter_go:
        rows = []
        for row in reader:
            if len(row) < len(headers):
                row = list(row) + [""] * (len(headers) - len(row))
            elif len(row) > len(headers):
                row = row[:len(headers)]
            rows.append(row)
        return headers, rows, len(rows), len(rows)

    uf_idx = find_uf_col(headers)
    mun_idx = find_mun_col(headers)

    rows = []
    n_total = 0
    for row in reader:
        n_total += 1
        if not is_go_row(headers, row, uf_idx, mun_idx):
            continue
        if len(row) < len(headers):
            row = list(row) + [""] * (len(headers) - len(row))
        elif len(row) > len(headers):
            row = row[:len(headers)]
        rows.append(row)

    return headers, rows, n_total, len(rows)

def process_zip_file(zip_path, filter_go=True, csv_filter=None):
    """Processa um ZIP e retorna headers + rows consolidados (filtrado por GO)."""
    with zipfile.ZipFile(zip_path, "r") as zf:
        all_csv = [m for m in zf.infolist()
                   if m.filename.lower().endswith((".csv",".txt"))
                   and not m.filename.startswith("__MACOSX")
                   and "__MACOSX" not in m.filename]

        if not all_csv:
            return None, None, 0, 0, "Sem CSV no ZIP"

        # Filtrar por csv_filter se definido
        if csv_filter:
            cf_upper = csv_filter.upper()
            filtered = [m for m in all_csv if cf_upper in Path(m.filename).stem.upper()]
            if filtered:
                all_csv = filtered

        # Verificar se já é arquivo _GO (pré-filtrado)
        go_files = [m for m in all_csv
                    if "_GO" in Path(m.filename).stem.upper()
                    and "_GOV" not in Path(m.filename).stem.upper()]
        if go_files:
            all_csv = go_files
            already_go = True
        else:
            already_go = False

        all_headers = None
        all_rows = []
        total_raw = 0

        for member in all_csv:
            try:
                raw = zf.read(member.filename)
                text = decode(raw)
                headers, rows, n_total, n_go = process_csv_content(
                    text, filter_go=(filter_go and not already_go)
                )

                if not headers:
                    continue

                if all_headers is None:
                    all_headers = headers
                elif headers != all_headers:
                    # Headers diferentes — CSV diferente dentro do mesmo ZIP
                    # Processar como tabela separada seria ideal, mas por simplicidade pula
                    continue

                total_raw += n_total
                all_rows.extend(rows)

                fname = Path(member.filename).name
                if n_go != n_total:
                    log_flt(f"  {fname}: {n_go:,} GO de {n_total:,}")
                else:
                    log_info(f"  {fname}: {n_go:,} linhas")

            except Exception as e:
                log_err(f"  Erro em {member.filename}: {e}")
                continue

        if not all_rows or all_headers is None:
            return None, None, total_raw, 0, "0 linhas GO"

        return all_headers, all_rows, total_raw, len(all_rows), None

def process_csv_file(csv_path, filter_go=False):
    """Processa um CSV solto (Censo etc.)."""
    try:
        raw = csv_path.read_bytes()
        text = decode(raw)
        headers, rows, n_total, n_go = process_csv_content(text, filter_go=filter_go)
        if not headers:
            return None, None, 0, 0, "CSV vazio"
        return headers, rows, n_total, n_go, None
    except Exception as e:
        return None, None, 0, 0, str(e)

def process_xlsx_file(xlsx_path):
    """Processa um Excel (IBGE)."""
    try:
        import openpyxl
    except ImportError:
        log_err("pip install openpyxl  — necessário para ler Excel")
        return None, None, 0, 0, "openpyxl não instalado"

    try:
        wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
        ws = wb.active

        rows_data = list(ws.iter_rows(values_only=True))
        if not rows_data:
            return None, None, 0, 0, "Excel vazio"

        # Primeira linha = headers
        raw_headers = [str(h or f"col_{i}") for i, h in enumerate(rows_data[0])]
        headers = dedupe_headers([norm_h(h) for h in raw_headers])

        rows = []
        for row in rows_data[1:]:
            row_str = [str(v) if v is not None else "" for v in row]
            if len(row_str) < len(headers):
                row_str += [""] * (len(headers) - len(row_str))
            elif len(row_str) > len(headers):
                row_str = row_str[:len(headers)]
            rows.append(row_str)

        wb.close()
        return headers, rows, len(rows), len(rows), None

    except Exception as e:
        return None, None, 0, 0, str(e)

# ═══════════════════════════════════════════════════════════
#  BIGQUERY
# ═══════════════════════════════════════════════════════════
def get_client():
    if not HAS_BQ:
        print(f"\n  {C.R}ERRO: pip install google-cloud-bigquery{C.RST}\n")
        sys.exit(1)
    return bigquery.Client(project=PROJECT)

def ensure_ds(client):
    try:
        client.get_dataset(FULL_DS)
    except NotFound:
        ds = bigquery.Dataset(FULL_DS)
        ds.location = LOCATION
        client.create_dataset(ds)
        log_info(f"Dataset criado: {FULL_DS}")

def table_exists_with_data(client, table_name):
    """Verifica se tabela existe E tem dados (para skip de duplicatas)."""
    table_id = f"{FULL_DS}.{table_name}"
    try:
        tbl = client.get_table(table_id)
        return int(tbl.num_rows or 0) > 0
    except NotFound:
        return False

def load_to_bq(client, table_name, headers, rows):
    """Carrega dados no BigQuery. Cria tabela se não existir."""
    table_id = f"{FULL_DS}.{table_name}"

    # Criar CSV temporário
    with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=",", quoting=csv.QUOTE_ALL)
        w.writerow(headers)
        for row in rows:
            sanitized = [sanitize_field(v) for v in row]
            w.writerow(sanitized)
        tmp_path = Path(f.name)

    try:
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
            max_bad_records=500,
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
        return {t.table_id: int(client.get_table(f"{FULL_DS}.{t.table_id}").num_rows or 0)
                for t in tables if t.table_id.startswith("raw_")}
    except NotFound:
        return {}

# ═══════════════════════════════════════════════════════════
#  COMANDOS
# ═══════════════════════════════════════════════════════════
def cmd_scan(args):
    banner(f"SCAN — Analisando {PASTA_DADOS}")

    files = scan_folder(PASTA_DADOS)
    if not files:
        log_err("Nenhum arquivo reconhecido!")
        return

    # Agrupar por tipo
    by_type = {}
    for f in files:
        by_type.setdefault(f.tipo, []).append(f)

    total_size = sum(f.size_bytes for f in files)

    print(f"  {C.B}{'#':>3} {'Tipo':<25} {'Tabela BQ':<40} {'Ano':>6} {'Tamanho':>10}{C.RST}")
    print(f"  {'─'*90}")

    for i, f in enumerate(files, 1):
        print(f"  {C.CY}{i:3d}{C.RST} {f.tipo:<25} {f.tabela:<40} {f.ano or '':>6} {fmt_bytes(f.size_bytes):>10}")

    print(f"  {'─'*90}")
    print(f"  {C.B}{len(files)} arquivos | {len(by_type)} tipos | {fmt_bytes(total_size)} total{C.RST}")

    # Resumo por tipo
    print(f"\n  {C.B}Resumo por tipo:{C.RST}")
    for tipo, tipo_files in sorted(by_type.items()):
        anos = sorted(set(f.ano for f in tipo_files if f.ano))
        anos_str = f"{min(anos)}-{max(anos)}" if anos else "N/A"
        print(f"    {tipo:<30} {len(tipo_files):>3} arquivo(s)  anos: {anos_str}")

    print(f"\n  Para importar: python {Path(__file__).name} importar")
    print(f"  Para pular já importados: python {Path(__file__).name} importar --resume\n")

def cmd_status(args):
    banner("STATUS — Tabelas no BigQuery")
    bq = get_client()
    tables = list_tables(bq)
    if not tables:
        log_info("Nenhuma tabela raw_ encontrada")
        return

    print(f"  {C.B}{'Tabela':<50} {'Linhas':>12}{C.RST}")
    print(f"  {'─'*65}")
    total_rows = 0
    for t in sorted(tables):
        rows = tables[t]
        total_rows += rows
        color = C.G if rows > 0 else C.R
        print(f"  {color}{t:<50}{C.RST} {rows:>12,}")
    print(f"  {'─'*65}")
    print(f"  {C.B}{'TOTAL':<50} {total_rows:>12,}{C.RST}")
    print(f"\n  {len(tables)} tabelas | {total_rows:,} linhas totais\n")

def cmd_importar(args):
    t_start = time.time()
    banner(f"IMPORTADOR LOCAL → BigQuery  {VERSION}")

    files = scan_folder(PASTA_DADOS)
    if not files:
        log_err("Nenhum arquivo reconhecido!")
        return

    bq = get_client()
    ensure_ds(bq)

    ok_keys = load_ok_keys() if args.resume else set()

    log_info(f"{len(files)} arquivos reconhecidos")
    log_info(f"Dataset: {FULL_DS}")
    log_info(f"Resume: {'SIM' if args.resume else 'NÃO'}")
    log_info(f"Filtro: Goiás (UF=GO)")

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    n_ok = n_err = n_skip = total_rows = 0
    results = []
    errors = []

    for idx, lf in enumerate(files, 1):
        tag = f"[{idx}/{len(files)}]"
        key = f"{lf.tipo}|{lf.ano}|{lf.tabela}"

        print(f"\n  {C.B}{'─'*60}{C.RST}")
        log_info(f"{tag} {lf.filename} → {lf.tabela}")

        # Skip se já importado (resume)
        if key in ok_keys:
            log_skip(f"Já importado (resume)")
            n_skip += 1
            results.append({"tabela": lf.tabela, "status": "skip", "linhas": 0})
            continue

        # Skip se tabela já tem dados no BQ
        if args.resume and table_exists_with_data(bq, lf.tabela):
            log_skip(f"Tabela já tem dados no BigQuery")
            n_skip += 1
            results.append({"tabela": lf.tabela, "status": "skip", "linhas": 0})
            save_manifest(key, {"tabela": lf.tabela, "linhas": 0, "nota": "já existia"})
            continue

        # Processar arquivo
        t0 = time.time()
        headers = rows = None
        n_total = n_go = 0
        erro = None

        try:
            if lf.formato == "zip":
                headers, rows, n_total, n_go, erro = process_zip_file(lf.path, filter_go=True)
            elif lf.formato == "csv":
                headers, rows, n_total, n_go, erro = process_csv_file(lf.path, filter_go=False)
            elif lf.formato == "xlsx":
                headers, rows, n_total, n_go, erro = process_xlsx_file(lf.path)

            if erro or not headers or not rows:
                log_err(f"{erro or '0 linhas'}")
                n_err += 1
                errors.append({"arquivo": lf.filename, "tabela": lf.tabela, "erro": erro or "0 linhas"})
                results.append({"tabela": lf.tabela, "status": "erro", "linhas": 0, "erro": erro})
                continue

            # Carregar no BigQuery
            log_load(f"{lf.tabela} ({len(rows):,} linhas, {len(headers)} colunas)")
            loaded = load_to_bq(bq, lf.tabela, headers, rows)
            dur = time.time() - t0

            log_ok(f"✓ {lf.tabela} | {loaded:,} linhas | {fmt_dur(dur)}")

            n_ok += 1
            total_rows += loaded
            results.append({"tabela": lf.tabela, "status": "ok", "linhas": loaded, "duracao": round(dur,1)})
            save_manifest(key, {"tabela": lf.tabela, "linhas": loaded, "tipo": lf.tipo, "ano": lf.ano})

        except zipfile.BadZipFile:
            log_err(f"ZIP corrompido: {lf.filename}")
            n_err += 1
            errors.append({"arquivo": lf.filename, "tabela": lf.tabela, "erro": "ZIP corrompido"})
            results.append({"tabela": lf.tabela, "status": "erro", "linhas": 0, "erro": "ZIP corrompido"})
        except Exception as e:
            log_err(f"{type(e).__name__}: {str(e)[:150]}")
            n_err += 1
            errors.append({"arquivo": lf.filename, "tabela": lf.tabela, "erro": str(e)[:300]})
            results.append({"tabela": lf.tabela, "status": "erro", "linhas": 0, "erro": str(e)[:200]})

    # ═══════════════════════════════════════════════════════
    #  RELATÓRIO FINAL
    # ═══════════════════════════════════════════════════════
    dur_total = time.time() - t_start

    banner("RELATÓRIO FINAL")

    box("Resumo", [
        f"Versão:      {VERSION}",
        f"Pasta:       {PASTA_DADOS}",
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

    # Salvar relatório
    run_id = utcnow().strftime("%Y%m%d_%H%M%S")
    report = {
        "versao": VERSION, "run_id": run_id,
        "ok": n_ok, "erros": n_err, "skip": n_skip,
        "linhas": total_rows, "duracao_s": round(dur_total),
        "resultados": results, "erros_detalhe": errors
    }
    rp = STATE_DIR / f"report_{run_id}.json"
    rp.write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf-8")
    log_info(f"Relatório: {rp}")

    if errors:
        ep = LOG_DIR / f"erros_{run_id}.json"
        ep.write_text(json.dumps(errors, ensure_ascii=False, indent=2), "utf-8")
        log_info(f"Log de erros: {ep}")

    status_msg = '🎉 Concluído!' if n_err == 0 else '⚠️  Concluído com erros'
    print(f"\n  {C.B}{status_msg}{C.RST}\n")

# ═══════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════
def main():
    ap = argparse.ArgumentParser(description=f"Importador Local → BigQuery (GO) {VERSION}")
    sub = ap.add_subparsers(dest="comando")

    sub.add_parser("scan", help="Ver arquivos reconhecidos e plano de importação")

    p_imp = sub.add_parser("importar", help="Importar dados locais → BigQuery")
    p_imp.add_argument("--resume", action="store_true", help="Pular já importados")

    sub.add_parser("status", help="Ver tabelas e contagem no BigQuery")

    args = ap.parse_args()

    # Verificar pasta
    if not PASTA_DADOS.exists():
        print(f"\n  {C.R}ERRO: Pasta não encontrada: {PASTA_DADOS}{C.RST}")
        print(f"  Ajuste a variável PASTA_DADOS no script.\n")
        sys.exit(1)

    if args.comando == "scan":
        cmd_scan(args)
    elif args.comando == "importar":
        cmd_importar(args)
    elif args.comando == "status":
        cmd_status(args)
    else:
        ap.print_help()
        print(f"\n  {C.B}Exemplos:{C.RST}")
        print(f"    python {Path(__file__).name} scan              # Ver o que será importado")
        print(f"    python {Path(__file__).name} importar           # Importar tudo")
        print(f"    python {Path(__file__).name} importar --resume  # Pular já importados")
        print(f"    python {Path(__file__).name} status             # Ver tabelas no BQ\n")

if __name__ == "__main__":
    main()
