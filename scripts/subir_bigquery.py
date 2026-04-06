#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

csv.field_size_limit(sys.maxsize)

DEFAULT_PROJECT = "eleicoesgo20182024"
DEFAULT_DATASET = "bd_eleicoes"
DEFAULT_LOCATION = "US"
DEFAULT_FOLDER = Path(r"C:\Users\Gustavo\Desktop\dados_organizados\banco_de_dados")

TABLES = [
    "bens_candidatos",
    "boletim_urna",
    "candidatos",
    "candidatos_complementar",
    "cassacoes",
    "coligacoes",
    "comparecimento",
    "comparecimento_abstencao",
    "despesas",
    "despesas_contratadas",
    "despesas_pagas",
    "eleitorado_local",
    "mesarios",
    "perfil_eleitor_secao",
    "perfil_eleitorado",
    "pesquisas",
    "receitas",
    "redes_sociais",
    "vagas",
    "votacao",
    "votacao_partido",
    "votacao_secao",
]

EXPECTED = {
    "bens_candidatos": 292883,
    "boletim_urna": 8603127,
    "candidatos": 180882,
    "candidatos_complementar": 46235,
    "cassacoes": 3885,
    "coligacoes": 39427,
    "comparecimento": 8693,
    "comparecimento_abstencao": 2712632,
    "despesas": 1155856,
    "despesas_contratadas": 1180678,
    "despesas_pagas": 929074,
    "eleitorado_local": 217387,
    "mesarios": 346188,
    "perfil_eleitor_secao": 22352332,
    "perfil_eleitorado": 1807952,
    "pesquisas": 34457,
    "receitas": 865446,
    "redes_sociais": 44402,
    "vagas": 3758,
    "votacao": 1751886,
    "votacao_partido": 124632,
    "votacao_secao": 25375357,
}

TABLES_WITHOUT_HEADER = {"boletim_urna"}


def log(message: str = "") -> None:
    print(message, flush=True)


def run_live(args: list[str], allow_fail: bool = False) -> int:
    result = subprocess.run(args)
    if result.returncode != 0 and not allow_fail:
        raise RuntimeError(f"Falha no comando: {' '.join(args)}")
    return result.returncode


def run_capture(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")


def read_first_row(csv_path: Path) -> list[str]:
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            with csv_path.open("r", encoding=encoding, newline="") as handle:
                reader = csv.reader(handle, delimiter=";", quotechar='"')
                row = next(reader, None)
                if row:
                    return row
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"Nao foi possivel ler a primeira linha de {csv_path}: {last_error}")


def normalize_header(value: str, index: int) -> str:
    value = (value or "").replace("\ufeff", "").strip().strip('"').strip()
    if not value:
        value = f"coluna_{index:03d}"

    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    value = re.sub(r"_+", "_", value).strip("_")

    if not value:
        value = f"coluna_{index:03d}"
    if value[0].isdigit():
        value = f"col_{value}"

    return value[:300]


def dedupe_headers(headers: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    result: list[str] = []

    for header in headers:
        count = seen.get(header, 0) + 1
        seen[header] = count
        result.append(header if count == 1 else f"{header}_{count}")

    return result


def build_columns(csv_path: Path, has_header: bool) -> list[str]:
    first_row = read_first_row(csv_path)
    if has_header:
        return dedupe_headers([normalize_header(value, index) for index, value in enumerate(first_row, start=1)])
    return [f"col_{index:03d}" for index in range(1, len(first_row) + 1)]


def write_schema_file(table: str, columns: list[str]) -> Path:
    schema = [{"name": column, "type": "STRING", "mode": "NULLABLE"} for column in columns]
    temp = tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=f"_{table}.json", delete=False)
    try:
        json.dump(schema, temp, ensure_ascii=False)
        temp.flush()
        return Path(temp.name)
    finally:
        temp.close()


def recreate_dataset(project: str, dataset: str, location: str) -> None:
    log(f"Recriando dataset {dataset}...")
    run_live(["bq", "rm", "-r", "-f", f"{project}:{dataset}"], allow_fail=True)
    run_live(["bq", "mk", f"--location={location}", "--dataset", f"{project}:{dataset}"])


def load_table(project: str, dataset: str, location: str, table: str, csv_path: Path, columns: list[str], skip_rows: int) -> bool:
    schema_path = write_schema_file(table, columns)
    destination = f"{project}:{dataset}.{table}"
    cmd = [
        "bq",
        "load",
        f"--location={location}",
        "--source_format=CSV",
        "--field_delimiter=;",
        "--encoding=UTF-8",
        "--allow_quoted_newlines",
        "--allow_jagged_rows",
        f"--skip_leading_rows={skip_rows}",
        "--replace",
        destination,
        str(csv_path),
        str(schema_path),
    ]

    try:
        return run_live(cmd, allow_fail=True) == 0
    finally:
        schema_path.unlink(missing_ok=True)


def query_count(project: str, dataset: str, location: str, table: str) -> int:
    sql = f"SELECT COUNT(*) AS total FROM `{project}.{dataset}.{table}`"
    result = run_capture(["bq", "query", f"--location={location}", "--nouse_legacy_sql", "--format=csv", sql])
    if result.returncode != 0:
        message = result.stderr.strip() or result.stdout.strip() or f"Erro ao consultar {table}"
        raise RuntimeError(message)

    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if len(lines) < 2:
        raise RuntimeError(f"Consulta sem retorno para {table}")

    return int(lines[-1].replace(",", ""))


def main() -> int:
    parser = argparse.ArgumentParser(description="Carga local de CSVs para BigQuery com schema explicito")
    parser.add_argument("--project", default=DEFAULT_PROJECT)
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--location", default=DEFAULT_LOCATION)
    parser.add_argument("--pasta", default=str(DEFAULT_FOLDER))
    args = parser.parse_args()

    folder = Path(args.pasta)
    if not folder.exists():
        log(f"Pasta nao encontrada: {folder}")
        return 1

    recreate_dataset(args.project, args.dataset, args.location)

    load_ok = 0
    load_fail = 0
    validation_ok = 0
    validation_fail = 0

    for table in TABLES:
        csv_path = folder / f"bd_eleicoes_{table}.csv"
        if not csv_path.exists():
            log(f"AUSENTE {table}")
            load_fail += 1
            validation_fail += 1
            continue

        has_header = table not in TABLES_WITHOUT_HEADER
        skip_rows = 1 if has_header else 0

        try:
            columns = build_columns(csv_path, has_header=has_header)
        except Exception as exc:
            log(f"ERRO {table} -> {exc}")
            load_fail += 1
            validation_fail += 1
            continue

        size_mb = csv_path.stat().st_size / (1024 * 1024)
        log(f"\nSubindo {table} ({size_mb:.1f} MB | {len(columns)} colunas)...")

        loaded = load_table(args.project, args.dataset, args.location, table, csv_path, columns, skip_rows)
        if not loaded:
            log(f"ERRO {table}")
            load_fail += 1
            validation_fail += 1
            continue

        load_ok += 1

        try:
            real = query_count(args.project, args.dataset, args.location, table)
            expected = EXPECTED[table]
            if real == expected:
                log(f"OK  {table} -> {real} / {expected}")
                validation_ok += 1
            else:
                log(f"FALHA {table} -> {real} / {expected} (diff {real - expected})")
                validation_fail += 1
        except Exception as exc:
            log(f"FALHA {table} -> {exc}")
            validation_fail += 1

    log("\n========================================")
    log(f"CARGA: {load_ok} OK | {load_fail} erros")
    log(f"VALIDACAO: {validation_ok} OK | {validation_fail} com diferenca")
    log("========================================")

    return 0 if load_fail == 0 and validation_fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
