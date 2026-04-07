#!/usr/bin/env python3
"""
Importa ZIPs do TSE direto para o MotherDuck, filtrando Goiás por padrão
e restringindo datasets granulares para Goiânia + Aparecida de Goiânia.

Uso:
  python scripts/importar_motherduck_zips.py --pasta "C:\Users\Gustavo\Desktop\dados" --db my_db --modo replace-year

Pré-requisitos:
  python -m pip install --upgrade duckdb
  Windows PowerShell:  $env:motherduck_token="SEU_TOKEN"
  CMD:                 set motherduck_token=SEU_TOKEN
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import sys
import tempfile
import unicodedata
import zipfile
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Iterable

try:
    import duckdb
except ImportError:
    print("❌ Instale primeiro: python -m pip install --upgrade duckdb")
    sys.exit(1)


DEFAULT_DB = "my_db"
DEFAULT_DETAIL_CITIES = ["GOIANIA", "APARECIDA DE GOIANIA"]
YEAR_RE = re.compile(r"20(12|14|16|18|20|22|24)")
ALLOWED_FILE_SUFFIXES = {".csv", ".txt"}


@dataclass(frozen=True)
class DatasetRule:
    key: str
    target_template: str
    patterns: tuple[str, ...]
    scope: str  # go | detail
    header_all: tuple[str, ...] = ()


@dataclass
class ImportResult:
    zip_path: str
    member: str
    dataset: str
    tabela: str
    ano: int
    scope: str
    encoding: str
    rows_filtradas: int
    status: str
    detalhe: str = ""


DATASET_RULES: tuple[DatasetRule, ...] = (
    DatasetRule(
        key="votacao_partido_munzona",
        target_template="votacao_partido_munzona_{ano}_GO",
        patterns=("votacao_partido_munzona", "votacao_partido"),
        scope="go",
        header_all=("ano_eleicao", "sg_partido"),
    ),
    DatasetRule(
        key="votacao_munzona",
        target_template="votacao_munzona_{ano}_GO",
        patterns=("votacao_candidato_munzona", "votacao_munzona"),
        scope="go",
        header_all=("ano_eleicao", "nm_urna_candidato", "qt_votos_nominais"),
    ),
    DatasetRule(
        key="comparecimento_munzona",
        target_template="comparecimento_munzona_{ano}_GO",
        patterns=("detalhe_abstencao_munzona", "comparecimento_munzona", "abstencao_munzona"),
        scope="go",
        header_all=("ano_eleicao", "qt_comparecimento", "qt_abstencoes"),
    ),
    DatasetRule(
        key="comparecimento_secao",
        target_template="comparecimento_secao_{ano}_GO",
        patterns=("detalhe_abstencao_secao", "comparecimento_secao", "abstencao_secao"),
        scope="detail",
        header_all=("ano_eleicao", "nr_secao", "qt_comparecimento"),
    ),
    DatasetRule(
        key="votacao_secao",
        target_template="votacao_secao_{ano}_GO",
        patterns=("votacao_secao",),
        scope="detail",
        header_all=("ano_eleicao", "nr_secao", "qt_votos_nominais"),
    ),
    DatasetRule(
        key="eleitorado_local",
        target_template="eleitorado_local_{ano}_GO",
        patterns=("eleitorado_local", "local_votacao"),
        scope="detail",
        header_all=("ano_eleicao", "nr_secao"),
    ),
    DatasetRule(
        key="perfil_eleitorado",
        target_template="perfil_eleitorado_{ano}_GO",
        patterns=("perfil_eleitorado",),
        scope="go",
        header_all=("ano_eleicao", "qt_eleitores_perfil"),
    ),
    DatasetRule(
        key="candidatos",
        target_template="candidatos_{ano}_GO",
        patterns=("consulta_cand",),
        scope="go",
        header_all=("ano_eleicao", "sq_candidato", "nm_urna_candidato"),
    ),
    DatasetRule(
        key="bens_candidatos",
        target_template="bens_candidatos_{ano}_GO",
        patterns=("bem_candidato", "bens_candidato", "bens_candidatos"),
        scope="go",
        header_all=("ano_eleicao", "sq_candidato", "vr_bem_candidato"),
    ),
    DatasetRule(
        key="receitas",
        target_template="receitas_{ano}_GO",
        patterns=("receitas_candidatos", "receitas"),
        scope="go",
        header_all=("ano_eleicao", "vr_receita"),
    ),
    DatasetRule(
        key="despesas_contratadas",
        target_template="despesas_contratadas_{ano}_GO",
        patterns=("despesas_contratadas", "despesas"),
        scope="go",
        header_all=("ano_eleicao", "vr_despesa_contratada"),
    ),
    DatasetRule(
        key="coligacoes",
        target_template="coligacoes_{ano}_GO",
        patterns=("consulta_coligacao", "coligacao"),
        scope="go",
        header_all=("ano_eleicao", "sq_coligacao"),
    ),
    DatasetRule(
        key="vagas",
        target_template="vagas_{ano}_GO",
        patterns=("consulta_vagas", "vagas"),
        scope="go",
        header_all=("ano_eleicao",),
    ),
)


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = value.encode("ascii", "ignore").decode("ascii")
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    value = re.sub(r"_+", "_", value).strip("_")
    return value


def sql_literal(value: str) -> str:
    return value.replace("'", "''")


def validate_identifier(value: str, label: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value):
        raise SystemExit(f"❌ {label} inválido: {value}")
    return value


def ensure_token() -> None:
    token = os.environ.get("motherduck_token") or os.environ.get("MOTHERDUCK_TOKEN")
    if not token:
        raise SystemExit(
            "❌ Defina o token do MotherDuck antes de rodar. Ex.: PowerShell -> $env:motherduck_token=\"SEU_TOKEN\""
        )
    os.environ["motherduck_token"] = token


def decode_preview(raw: bytes) -> tuple[str, str]:
    for encoding in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            return raw.decode(encoding), "latin-1" if encoding in {"latin-1", "cp1252"} else "utf-8"
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="replace"), "latin-1"


def sniff_delimiter(lines: list[str]) -> str:
    sample = "\n".join(lines[:5])
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,|\t")
        return dialect.delimiter
    except csv.Error:
        first = lines[0] if lines else ""
        return ";" if first.count(";") >= first.count(",") else ","


def read_member_header(zip_path: Path, member: str) -> tuple[list[str], str]:
    with zipfile.ZipFile(zip_path) as zf:
        with zf.open(member) as fh:
            raw = fh.read(65536)

    text, encoding = decode_preview(raw)
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return [], encoding

    delim = sniff_delimiter(lines)
    header = next(csv.reader([lines[0]], delimiter=delim), [])
    normalized = [normalize_text(col) for col in header if col.strip()]
    return normalized, encoding


def detect_rule(zip_name: str, member_name: str, header: list[str]) -> DatasetRule | None:
    haystack = f"{normalize_text(zip_name)} {normalize_text(member_name)}"
    header_set = set(header)

    for rule in DATASET_RULES:
        if any(pattern in haystack for pattern in rule.patterns):
            return rule

    for rule in DATASET_RULES:
        if rule.header_all and all(col in header_set for col in rule.header_all):
            return rule

    return None


def extract_year(*values: str) -> int | None:
    for value in values:
        match = YEAR_RE.search(value)
        if match:
            return int(match.group(0))
    return None


def read_csv_sql(csv_path: Path, encoding: str) -> str:
    path_sql = sql_literal(csv_path.as_posix())
    return (
        "read_csv("
        f"'{path_sql}', "
        "auto_detect=true, "
        "sample_size=-1, "
        "header=true, "
        "ignore_errors=true, "
        "normalize_names=true, "
        f"encoding='{encoding}', "
        "nullstr=['', '#NULO#', '#NE#']"
        ")"
    )


def build_go_clauses(columns: Iterable[str]) -> list[str]:
    cols = set(columns)
    clauses: list[str] = []

    if "sg_uf" in cols:
        clauses.append("upper(trim(coalesce(sg_uf, ''))) = 'GO'")

    for col in ("sg_ue", "cd_municipio", "codigo_municipio", "cd_municipio_tse"):
        if col in cols:
            clauses.append(f"cast({col} as varchar) like '52%'")

    return clauses


def build_city_variants(cities: list[str]) -> list[str]:
    variants: list[str] = []
    seen: set[str] = set()
    for city in cities:
        raw = city.strip()
        normalized = normalize_text(raw).replace("_", " ").upper()
        for value in (raw.upper(), normalized):
            if value and value not in seen:
                variants.append(value)
                seen.add(value)
    return variants


def build_filter_sql(rule: DatasetRule, columns: list[str], detail_cities: list[str]) -> str | None:
    cols = set(columns)
    go_clauses = build_go_clauses(cols)

    if rule.scope == "go":
        return " OR ".join(go_clauses) if go_clauses else None

    city_values = ", ".join(f"'{sql_literal(city)}'" for city in build_city_variants(detail_cities))
    city_clauses = [
        f"upper(trim(coalesce({col}, ''))) in ({city_values})"
        for col in ("nm_municipio", "nm_ue", "municipio")
        if col in cols
    ]

    if city_clauses and go_clauses:
        return f"({' OR '.join(go_clauses)}) AND ({' OR '.join(city_clauses)})"
    if city_clauses:
        return " OR ".join(city_clauses)
    if go_clauses:
        return " OR ".join(go_clauses)
    return None


def connect_motherduck(db_name: str):
    con = duckdb.connect()
    con.execute("INSTALL md")
    con.execute("LOAD md")
    con.execute(f"ATTACH 'md:{sql_literal(db_name)}'")
    con.execute(f"USE {db_name}")
    return con


def table_exists(con, db_name: str, table_name: str) -> bool:
    rows = con.execute(
        """
        select count(*)
        from information_schema.tables
        where table_catalog = ? and table_schema = 'main' and table_name = ?
        """,
        [db_name, table_name],
    ).fetchone()
    return bool(rows and rows[0])


def describe_columns(con, db_name: str, table_name: str) -> list[str]:
    rows = con.execute(f"DESCRIBE {db_name}.{table_name}").fetchall()
    return [row[0] for row in rows]


def iter_zip_members(root: Path):
    for zip_path in sorted(root.rglob("*.zip")):
        try:
            with zipfile.ZipFile(zip_path) as zf:
                for member in zf.namelist():
                    suffix = Path(member).suffix.lower()
                    if member.endswith("/") or suffix not in ALLOWED_FILE_SUFFIXES:
                        continue
                    yield zip_path, member
        except zipfile.BadZipFile:
            print(f"⚠️ ZIP inválido ignorado: {zip_path}")


def extract_member(zip_path: Path, member: str, temp_dir: Path) -> Path:
    suffix = Path(member).suffix.lower() or ".csv"
    extracted_path = temp_dir / f"{normalize_text(zip_path.stem)}__{normalize_text(Path(member).stem)}{suffix}"
    with zipfile.ZipFile(zip_path) as zf:
        with zf.open(member) as src, open(extracted_path, "wb") as dst:
            shutil.copyfileobj(src, dst)
    return extracted_path


def maybe_delete_scope(con, db_name: str, table_name: str, mode: str, year: int, deleted_once: set[tuple[str, str]]) -> None:
    if mode == "append":
        return

    key = (table_name, str(year) if mode == "replace-year" else "ALL")
    if key in deleted_once:
        return

    if not table_exists(con, db_name, table_name):
        deleted_once.add(key)
        return

    if mode == "replace-table":
        con.execute(f"DELETE FROM {db_name}.{table_name}")
    elif mode == "replace-year":
        con.execute(f"DELETE FROM {db_name}.{table_name} WHERE ano_eleicao = ?", [year])

    deleted_once.add(key)


def process_member(
    con,
    db_name: str,
    zip_path: Path,
    member: str,
    header: list[str],
    encoding: str,
    rule: DatasetRule,
    year: int,
    detail_cities: list[str],
    temp_dir: Path,
    mode: str,
    deleted_once: set[tuple[str, str]],
    dry_run: bool,
) -> ImportResult:
    filter_sql = build_filter_sql(rule, header, detail_cities)
    table_name = rule.target_template.format(ano=year)

    if not filter_sql:
        return ImportResult(
            zip_path=str(zip_path),
            member=member,
            dataset=rule.key,
            tabela=table_name,
            ano=year,
            scope=rule.scope,
            encoding=encoding,
            rows_filtradas=0,
            status="ignorado",
            detalhe="Sem coluna segura para filtrar Goiás.",
        )

    extracted = extract_member(zip_path, member, temp_dir)
    source_sql = read_csv_sql(extracted, encoding)
    filtered_sql = f"SELECT * FROM {source_sql} WHERE {filter_sql}"
    rows_filtradas = int(con.execute(f"SELECT count(*) FROM ({filtered_sql}) t").fetchone()[0] or 0)

    if rows_filtradas == 0:
        return ImportResult(
            zip_path=str(zip_path),
            member=member,
            dataset=rule.key,
            tabela=table_name,
            ano=year,
            scope=rule.scope,
            encoding=encoding,
            rows_filtradas=0,
            status="vazio",
            detalhe="Arquivo não trouxe linhas após o filtro.",
        )

    if dry_run:
        return ImportResult(
            zip_path=str(zip_path),
            member=member,
            dataset=rule.key,
            tabela=table_name,
            ano=year,
            scope=rule.scope,
            encoding=encoding,
            rows_filtradas=rows_filtradas,
            status="simulado",
        )

    maybe_delete_scope(con, db_name, table_name, mode, year, deleted_once)
    con.execute(f"CREATE TABLE IF NOT EXISTS {db_name}.{table_name} AS {filtered_sql} LIMIT 0")
    target_cols = describe_columns(con, db_name, table_name)
    usable_cols = [col for col in target_cols if col in set(header)]

    if not usable_cols:
        return ImportResult(
            zip_path=str(zip_path),
            member=member,
            dataset=rule.key,
            tabela=table_name,
            ano=year,
            scope=rule.scope,
            encoding=encoding,
            rows_filtradas=0,
            status="erro",
            detalhe="Nenhuma coluna compatível entre o arquivo e a tabela alvo.",
        )

    col_list = ", ".join(usable_cols)
    con.execute(f"INSERT INTO {db_name}.{table_name} ({col_list}) SELECT {col_list} FROM ({filtered_sql}) t")
    return ImportResult(
        zip_path=str(zip_path),
        member=member,
        dataset=rule.key,
        tabela=table_name,
        ano=year,
        scope=rule.scope,
        encoding=encoding,
        rows_filtradas=rows_filtradas,
        status="importado",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Importa ZIPs do TSE direto para o MotherDuck")
    parser.add_argument("--pasta", required=True, help="Pasta raiz com os ZIPs")
    parser.add_argument("--db", default=DEFAULT_DB, help="Banco MotherDuck (padrão: my_db)")
    parser.add_argument(
        "--modo",
        choices=("append", "replace-year", "replace-table"),
        default="replace-year",
        help="append = só adiciona | replace-year = apaga o ano antes | replace-table = apaga a tabela inteira",
    )
    parser.add_argument(
        "--municipios-detalhados",
        default=",".join(DEFAULT_DETAIL_CITIES),
        help="Municípios para datasets granulares, separados por vírgula",
    )
    parser.add_argument(
        "--somente",
        default="",
        help="Datasets específicos, separados por vírgula (ex.: candidatos,votacao_munzona,comparecimento_secao)",
    )
    parser.add_argument("--anos", default="", help="Filtrar anos, separados por vírgula (ex.: 2020,2022,2024)")
    parser.add_argument("--dry-run", action="store_true", help="Só conta linhas e mostra o que seria importado")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = Path(args.pasta).expanduser().resolve()
    db_name = validate_identifier(args.db, "Banco MotherDuck")

    if not root.exists() or not root.is_dir():
        raise SystemExit(f"❌ Pasta não encontrada: {root}")

    ensure_token()

    selected = {normalize_text(item) for item in args.somente.split(",") if item.strip()}
    years = {int(item.strip()) for item in args.anos.split(",") if item.strip()}
    detail_cities = [item.strip() for item in args.municipios_detalhados.split(",") if item.strip()]

    con = connect_motherduck(db_name)
    deleted_once: set[tuple[str, str]] = set()
    resultados: list[ImportResult] = []
    ignorados: list[dict[str, str]] = []

    print("=" * 72)
    print("IMPORTAÇÃO ZIP -> MOTHERDUCK")
    print(f"Pasta: {root}")
    print(f"Banco: {db_name}")
    print(f"Modo: {args.modo}")
    print(f"Granular: {', '.join(detail_cities)}")
    print(f"Dry-run: {'Sim' if args.dry_run else 'Não'}")
    print("=" * 72)

    with tempfile.TemporaryDirectory(prefix="tse_import_") as temp_dir_str:
        temp_dir = Path(temp_dir_str)

        for zip_path, member in iter_zip_members(root):
            header, encoding = read_member_header(zip_path, member)
            if not header:
                ignorados.append({"zip": str(zip_path), "member": member, "motivo": "Cabeçalho vazio"})
                continue

            rule = detect_rule(zip_path.name, member, header)
            if not rule:
                ignorados.append({"zip": str(zip_path), "member": member, "motivo": "Dataset não mapeado"})
                continue

            if selected and rule.key not in selected:
                continue

            year = extract_year(zip_path.name, member)
            if not year:
                ignorados.append({"zip": str(zip_path), "member": member, "motivo": "Ano não identificado"})
                continue

            if years and year not in years:
                continue

            print(f"\n➡️ {zip_path.name} :: {member}")
            print(f"   dataset={rule.key} | ano={year} | scope={rule.scope} | encoding={encoding}")

            try:
                resultado = process_member(
                    con=con,
                    db_name=db_name,
                    zip_path=zip_path,
                    member=member,
                    header=header,
                    encoding=encoding,
                    rule=rule,
                    year=year,
                    detail_cities=detail_cities,
                    temp_dir=temp_dir,
                    mode=args.modo,
                    deleted_once=deleted_once,
                    dry_run=args.dry_run,
                )
                resultados.append(resultado)
                emoji = "✅" if resultado.status in {"importado", "simulado"} else "⚠️"
                detalhe = f" | {resultado.detalhe}" if resultado.detalhe else ""
                print(f"   {emoji} {resultado.status} | {resultado.rows_filtradas:,} linhas -> {resultado.tabela}{detalhe}")
            except Exception as exc:
                resultados.append(
                    ImportResult(
                        zip_path=str(zip_path),
                        member=member,
                        dataset=rule.key,
                        tabela=rule.target_template.format(ano=year),
                        ano=year,
                        scope=rule.scope,
                        encoding=encoding,
                        rows_filtradas=0,
                        status="erro",
                        detalhe=str(exc)[:300],
                    )
                )
                print(f"   ❌ erro | {str(exc)[:300]}")

    resumo_path = root / f"log_importacao_motherduck_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    payload = {
        "db": db_name,
        "modo": args.modo,
        "dry_run": args.dry_run,
        "municipios_detalhados": detail_cities,
        "resultados": [asdict(item) for item in resultados],
        "ignorados": ignorados,
    }
    with open(resumo_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)

    total_importado = sum(item.rows_filtradas for item in resultados if item.status in {"importado", "simulado"})
    total_erros = sum(1 for item in resultados if item.status == "erro")
    total_vazios = sum(1 for item in resultados if item.status in {"vazio", "ignorado"})

    print("\n" + "=" * 72)
    print(f"Processados: {len(resultados)}")
    print(f"Linhas {'simuladas' if args.dry_run else 'importadas'}: {total_importado:,}")
    print(f"Erros: {total_erros}")
    print(f"Sem carga: {total_vazios}")
    print(f"Ignorados fora do mapeamento: {len(ignorados)}")
    print(f"Log: {resumo_path}")
    print("=" * 72)


if __name__ == "__main__":
    main()