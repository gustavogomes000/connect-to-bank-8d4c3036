#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════╗
║  IMPORTADOR — 6 tabelas que falharam                             ║
║  raw_filiados_2024, raw_legendas_2024, raw_legendas_2022         ║
║  raw_boletim_urna_2024, raw_boletim_urna_2022                    ║
║  raw_ibge_censo_domicilios                                       ║
╚══════════════════════════════════════════════════════════════════╝

  python importar_faltantes.py
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
CACHE_DIR.mkdir(exist_ok=True)

# Municípios foco
MUN_CODES = {"52749","5208707","50415","5201405"}
MUN_NAMES = {"GOIANIA","GOIÂNIA","APARECIDA DE GOIANIA","APARECIDA DE GOIÂNIA"}
UF_COLS   = ["sg_uf","sigla_uf","uf","cd_uf","cod_uf","sg_uf_voto","sg_uf_cnpj"]
UF_BAD    = ["nasc","natural","origem","nascimento"]
MUN_COLS  = ["cd_municipio","cod_municipio","codigo_municipio","id_municipio","sg_ue","cd_mun"]
MUN_NAME_COLS = ["nm_municipio","nm_ue","nome_municipio","municipio","ds_municipio"]

# ═══════════════════════════════════════════════════════════
#  UTILS
# ═══════════════════════════════════════════════════════════
class C:
    RST="\033[0m"; B="\033[1m"; R="\033[91m"; G="\033[92m"
    Y="\033[93m"; BL="\033[94m"; CY="\033[96m"; GR="\033[90m"

def ts(): return datetime.now().strftime("%H:%M:%S")
def log_ok(msg):   print(f"  {C.GR}{ts()}{C.RST} {C.G}✓{C.RST} {msg}", flush=True)
def log_err(msg):  print(f"  {C.GR}{ts()}{C.RST} {C.R}✗{C.RST} {msg}", flush=True)
def log_info(msg): print(f"  {C.GR}{ts()}{C.RST} {C.BL}ℹ{C.RST} {msg}", flush=True)
def log_try(msg):  print(f"  {C.GR}{ts()}{C.RST} {C.Y}⟳{C.RST} {msg}", flush=True)

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
            if bad_words and any(b in name for b in bad_words):
                continue
            return headers.index(name)
    return None

def normalize_name(val):
    return unicodedata.normalize("NFKD", val.strip().upper()).encode("ascii","ignore").decode("ascii")

def is_go_row(headers, row, uf_idx, mun_idx, mun_name_idx):
    if uf_idx is not None:
        uf_val = (row[uf_idx] if uf_idx < len(row) else "").strip().upper()
        if uf_val not in ("GO", "52"):
            return False
    if mun_idx is not None:
        val = (row[mun_idx] if mun_idx < len(row) else "").strip()
        val_clean = re.sub(r"\D", "", val)
        if val_clean in MUN_CODES or val.upper() in MUN_NAMES:
            return True
    if mun_name_idx is not None:
        val = (row[mun_name_idx] if mun_name_idx < len(row) else "").strip()
        norm = normalize_name(val)
        if norm in MUN_NAMES or "GOIANIA" in norm or "APARECIDA DE GOIANIA" in norm:
            return True
    if mun_idx is None and mun_name_idx is None:
        return True
    return False


# ═══════════════════════════════════════════════════════════
#  DOWNLOAD
# ═══════════════════════════════════════════════════════════
def download_with_retry(url, dest, max_retries=5):
    for attempt in range(1, max_retries + 1):
        try:
            log_try(f"Download tentativa {attempt}/{max_retries}: {Path(url).name}")
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
            log_ok(f"Download OK: {dest.name} ({downloaded:,} bytes)")
            return True
        except Exception as e:
            log_err(f"Tentativa {attempt} falhou: {e}")
            if dest.exists():
                dest.unlink()
            if attempt < max_retries:
                wait = 2 ** attempt * 3
                log_info(f"Aguardando {wait}s...")
                time.sleep(wait)
    return False


# ═══════════════════════════════════════════════════════════
#  PROCESSAR ZIP TSE → JSONL → BigQuery
# ═══════════════════════════════════════════════════════════
def process_zip_to_bq(client, tabela, zip_path, csv_filter=None, filter_go=True):
    """Lê ZIP, filtra GO, converte para JSONL, sobe pro BQ."""
    log_info(f"Processando ZIP: {zip_path.name}")

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

        log_info(f"{len(members)} CSV(s) encontrados")
        if not members:
            # Listar todos para debug
            all_files = [m.filename for m in zf.infolist()]
            log_err(f"Arquivos no ZIP: {all_files[:20]}")
            raise Exception("Nenhum CSV encontrado no ZIP")

        all_headers = None
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False, encoding="utf-8")
        n_rows = 0

        for member in members:
            fname = Path(member.filename).name
            log_info(f"Lendo: {fname} ({member.file_size:,} bytes)")

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
                log_info(f"{len(headers)} colunas | UF={uf_idx} MUN={mun_idx} MUN_NM={mun_name_idx}")

            n_file = 0
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
                    n_file += 1
                except Exception:
                    pass

            log_info(f"  → {n_file:,} linhas de {fname}")
            del text

        tmp.flush()
        tmp.close()
        tmp_path = Path(tmp.name)

    if n_rows == 0:
        tmp_path.unlink(missing_ok=True)
        raise Exception("0 linhas após filtro GO")

    log_info(f"Total: {n_rows:,} linhas para {tabela}")

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
        log_ok(f"✅ {tabela} → {rows:,} linhas no BQ")
        return rows
    finally:
        tmp_path.unlink(missing_ok=True)


# ═══════════════════════════════════════════════════════════
#  FILIADOS — arquivo ENORME, precisa tratar por partes
#  O ZIP contém um CSV por partido, precisa ler TODOS
# ═══════════════════════════════════════════════════════════
def process_filiados(client):
    tabela = "raw_filiados_2024"
    print(f"\n{'='*60}")
    print(f"  {C.B}{C.CY}TSE: {tabela} (filiados - arquivo grande){C.RST}")
    print(f"{'='*60}")

    urls = [
        "https://cdn.tse.jus.br/estatistica/sead/odsele/filiacao_partidaria/filiados_todos_2024.zip",
        # Alternativa: baixar só GO
        "https://cdn.tse.jus.br/estatistica/sead/odsele/filiacao_partidaria/filiados_desfiliados_2024.zip",
    ]

    for url in urls:
        zip_name = Path(url.split("?")[0]).name
        zip_path = CACHE_DIR / zip_name

        if not zip_path.exists():
            if not download_with_retry(url, zip_path):
                continue
        else:
            log_info(f"Cache: {zip_name}")

        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.testzip()
        except Exception:
            log_err(f"ZIP corrompido, removendo")
            zip_path.unlink(missing_ok=True)
            if not download_with_retry(url, zip_path):
                continue

        try:
            rows = process_zip_to_bq(client, tabela, zip_path, csv_filter=None, filter_go=True)
            if rows > 0:
                return True
        except Exception as e:
            log_err(f"Falhou: {e}")
            # Se o ZIP for muito grande, tentar ler só arquivo _GO
            try:
                log_try("Tentando extrair apenas arquivo GO do ZIP...")
                with zipfile.ZipFile(zip_path, "r") as zf:
                    all_files = [m.filename for m in zf.infolist()
                                if m.filename.lower().endswith(".csv")]
                    go_files = [f for f in all_files if "_GO" in f.upper() or "GOIAS" in f.upper()]
                    log_info(f"Arquivos no ZIP: {len(all_files)} total, {len(go_files)} GO")
                    if not go_files:
                        log_info(f"Primeiros arquivos: {all_files[:10]}")
            except Exception as e2:
                log_err(f"Erro ao listar ZIP: {e2}")
            continue

    log_err(f"❌ {tabela}: falhou")
    return False


# ═══════════════════════════════════════════════════════════
#  LEGENDAS / BOLETIM URNA — tratamento padrão
# ═══════════════════════════════════════════════════════════
def process_tse_standard(client, tabela, urls, csv_filter=None):
    print(f"\n{'='*60}")
    print(f"  {C.B}{C.CY}TSE: {tabela}{C.RST}")
    print(f"{'='*60}")

    for url_idx, url in enumerate(urls):
        zip_name = Path(url.split("?")[0]).name
        zip_path = CACHE_DIR / zip_name

        if not zip_path.exists():
            if not download_with_retry(url, zip_path):
                continue
        else:
            log_info(f"Cache: {zip_name}")

        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.testzip()
        except Exception:
            log_err(f"ZIP corrompido, removendo")
            zip_path.unlink(missing_ok=True)
            if not download_with_retry(url, zip_path):
                continue

        try:
            rows = process_zip_to_bq(client, tabela, zip_path, csv_filter=csv_filter, filter_go=True)
            if rows > 0:
                return True
        except Exception as e:
            log_err(f"URL {url_idx+1} falhou: {e}")
            # Debug: listar conteúdo do ZIP
            try:
                with zipfile.ZipFile(zip_path, "r") as zf:
                    files = [m.filename for m in zf.infolist() if not m.filename.startswith("__")]
                    log_info(f"Conteúdo do ZIP ({len(files)} arquivos): {files[:15]}")
            except:
                pass
            continue

    log_err(f"❌ {tabela}: falhou")
    return False


# ═══════════════════════════════════════════════════════════
#  IBGE DOMICÍLIOS
# ═══════════════════════════════════════════════════════════
def process_ibge_domicilios(client):
    tabela = "raw_ibge_censo_domicilios"
    print(f"\n{'='*60}")
    print(f"  {C.B}{C.CY}IBGE: {tabela}{C.RST}")
    print(f"{'='*60}")

    sess = requests.Session()
    sess.headers.update({"User-Agent": "Mozilla/5.0 (importador-eleicoes-go)"})

    # Lista expandida de URLs alternativas
    urls = [
        # Censo 2022 — Domicílios por tipo
        "https://servicodados.ibge.gov.br/api/v3/agregados/4709/periodos/2022/variaveis/381?localidades=N6[5208707,5201405]",
        # Censo 2022 — Domicílios particulares permanentes
        "https://servicodados.ibge.gov.br/api/v3/agregados/4709/periodos/2022/variaveis/381?localidades=N6[5208707,5201405]&classificacao=1[all]",
        # Censo 2022 — Domicílios por espécie
        "https://servicodados.ibge.gov.br/api/v3/agregados/9553/periodos/2022/variaveis/216?localidades=N6[5208707,5201405]",
        # Censo 2022 — Outro agregado
        "https://servicodados.ibge.gov.br/api/v3/agregados/6706/periodos/2022/variaveis/381?localidades=N6[5208707,5201405]",
        # Censo 2022 — Total domicílios
        "https://servicodados.ibge.gov.br/api/v3/agregados/4714/periodos/2022/variaveis/381?localidades=N6[5208707,5201405]",
        # Censo 2022 — Domicílios variável 93
        "https://servicodados.ibge.gov.br/api/v3/agregados/4709/periodos/2022/variaveis/93?localidades=N6[5208707,5201405]",
        # Censo 2010 fallback
        "https://servicodados.ibge.gov.br/api/v3/agregados/1378/periodos/2010/variaveis/137?localidades=N6[5208707,5201405]&classificacao=57[all]",
        "https://servicodados.ibge.gov.br/api/v3/agregados/1378/periodos/2010/variaveis/137?localidades=N6[5208707,5201405]",
        # Sinopse domicílios
        "https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/2022/variaveis/9324?localidades=N6[5208707,5201405]",
        # Resultados gerais da amostra
        "https://servicodados.ibge.gov.br/api/v3/agregados/3158/periodos/2010/variaveis/137?localidades=N6[5208707,5201405]",
    ]

    for i, url in enumerate(urls):
        try:
            agg_id = url.split("/agregados/")[1].split("/")[0]
        except:
            agg_id = "?"
        log_try(f"URL {i+1}/{len(urls)}: agregado {agg_id}")

        try:
            resp = sess.get(url, timeout=60)
            if resp.status_code == 404:
                log_err(f"404 — agregado {agg_id} não existe")
                continue
            if resp.status_code != 200:
                log_err(f"HTTP {resp.status_code}")
                continue

            data = resp.json()

            # Verificar se resposta tem dados
            if isinstance(data, dict) and "message" in data:
                log_err(f"API retornou erro: {data['message'][:100]}")
                continue

            # Flatten
            rows = []
            if isinstance(data, list):
                for var_block in data:
                    var_id = var_block.get("id", "")
                    var_nome = var_block.get("variavel", "")
                    resultados = var_block.get("resultados", [])
                    for res in resultados:
                        classificacoes = res.get("classificacoes", [])
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
                log_err(f"0 registros")
                continue

            log_ok(f"{len(rows)} registros!")

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
                log_ok(f"✅ {tabela} → {final_rows:,} linhas no BQ")
                return True
            finally:
                tmp_path.unlink(missing_ok=True)

        except Exception as e:
            log_err(f"Falhou: {e}")
            continue

    log_err(f"❌ {tabela}: TODAS as URLs falharam")
    return False


# ═══════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════
def main():
    print(f"""
╔══════════════════════════════════════════════════════════════════╗
║  IMPORTADOR — 6 tabelas que falharam                             ║
║  Filiados, Legendas, Boletim Urna, IBGE Domicílios               ║
╚══════════════════════════════════════════════════════════════════╝
    """)

    client = bigquery.Client(project=PROJECT)

    # Verificar quais já existem
    try:
        existing = {t.table_id for t in client.list_tables(FULL_DS)}
    except NotFound:
        existing = set()

    resultados = {"ok": [], "erro": [], "ja_existe": []}

    # ── 1. FILIADOS ──
    if "raw_filiados_2024" in existing:
        log_ok("raw_filiados_2024 já existe, pulando")
        resultados["ja_existe"].append("raw_filiados_2024")
    else:
        if process_filiados(client):
            resultados["ok"].append("raw_filiados_2024")
        else:
            resultados["erro"].append("raw_filiados_2024")

    # ── 2. LEGENDAS 2024 ──
    if "raw_legendas_2024" in existing:
        log_ok("raw_legendas_2024 já existe, pulando")
        resultados["ja_existe"].append("raw_legendas_2024")
    else:
        ok = process_tse_standard(client, "raw_legendas_2024", [
            "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_legendas/consulta_legendas_2024.zip",
            "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_legendas/consulta_legenda_2024.zip",
        ])
        (resultados["ok"] if ok else resultados["erro"]).append("raw_legendas_2024")

    # ── 3. LEGENDAS 2022 ──
    if "raw_legendas_2022" in existing:
        log_ok("raw_legendas_2022 já existe, pulando")
        resultados["ja_existe"].append("raw_legendas_2022")
    else:
        ok = process_tse_standard(client, "raw_legendas_2022", [
            "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_legendas/consulta_legendas_2022.zip",
            "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_legendas/consulta_legenda_2022.zip",
        ])
        (resultados["ok"] if ok else resultados["erro"]).append("raw_legendas_2022")

    # ── 4. BOLETIM URNA 2024 ──
    if "raw_boletim_urna_2024" in existing:
        log_ok("raw_boletim_urna_2024 já existe, pulando")
        resultados["ja_existe"].append("raw_boletim_urna_2024")
    else:
        ok = process_tse_standard(client, "raw_boletim_urna_2024", [
            "https://cdn.tse.jus.br/estatistica/sead/odsele/boletim_urna/boletim_urna_2024_GO.zip",
            "https://cdn.tse.jus.br/estatistica/sead/odsele/boletim_urna/bweb_2t_GO_051020241535.zip",
            "https://cdn.tse.jus.br/estatistica/sead/odsele/boletim_urna/bu_imgbu_logjez_rdv_vscmr_2024_GO.zip",
        ])
        (resultados["ok"] if ok else resultados["erro"]).append("raw_boletim_urna_2024")

    # ── 5. BOLETIM URNA 2022 ──
    if "raw_boletim_urna_2022" in existing:
        log_ok("raw_boletim_urna_2022 já existe, pulando")
        resultados["ja_existe"].append("raw_boletim_urna_2022")
    else:
        ok = process_tse_standard(client, "raw_boletim_urna_2022", [
            "https://cdn.tse.jus.br/estatistica/sead/odsele/boletim_urna/boletim_urna_2022_GO.zip",
            "https://cdn.tse.jus.br/estatistica/sead/odsele/boletim_urna/bu_imgbu_logjez_rdv_vscmr_2022_GO.zip",
        ])
        (resultados["ok"] if ok else resultados["erro"]).append("raw_boletim_urna_2022")

    # ── 6. IBGE DOMICÍLIOS ──
    if "raw_ibge_censo_domicilios" in existing:
        log_ok("raw_ibge_censo_domicilios já existe, pulando")
        resultados["ja_existe"].append("raw_ibge_censo_domicilios")
    else:
        if process_ibge_domicilios(client):
            resultados["ok"].append("raw_ibge_censo_domicilios")
        else:
            resultados["erro"].append("raw_ibge_censo_domicilios")

    # ── RELATÓRIO ──
    print(f"\n{'='*60}")
    print(f"  {C.B}RELATÓRIO FINAL{C.RST}")
    print(f"{'='*60}")

    if resultados["ja_existe"]:
        print(f"\n  {C.BL}⏭ Já existiam ({len(resultados['ja_existe'])}):{C.RST}")
        for t in resultados["ja_existe"]:
            print(f"     • {t}")

    if resultados["ok"]:
        print(f"\n  {C.G}✅ Importadas ({len(resultados['ok'])}):{C.RST}")
        for t in resultados["ok"]:
            print(f"     • {t}")

    if resultados["erro"]:
        print(f"\n  {C.R}❌ Falharam ({len(resultados['erro'])}):{C.RST}")
        for t in resultados["erro"]:
            print(f"     • {t}")

    total = len(resultados["ok"]) + len(resultados["ja_existe"])
    print(f"\n  {C.B}Total OK: {total}/6{C.RST}")

    if not resultados["erro"]:
        print(f"\n  {C.G}{C.B}🎉 TUDO IMPORTADO!{C.RST}")


if __name__ == "__main__":
    main()
