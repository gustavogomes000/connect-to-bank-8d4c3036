#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from dataclasses import dataclass
from pathlib import Path


def configure_csv_field_limit() -> None:
    limit = sys.maxsize
    while limit > 1024:
        try:
            csv.field_size_limit(limit)
            return
        except OverflowError:
            limit //= 10


configure_csv_field_limit()

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
SOURCE_ENCODINGS = ("utf-8-sig", "utf-8", "latin-1")


@dataclass
class PreparedLoadFile:
    path: Path
    columns: list[str]
    row_count: int
    strategy: str
    source_encoding: str


def log(message: str = "") -> None:
    print(message, flush=True)


def resolve_bq_binary() -> str:
    for candidate in ("bq.cmd", "bq.exe", "bq"):
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    raise RuntimeError("bq nao encontrado no PATH. Rode 'where bq' no PowerShell.")


def execute_subprocess(command: list[str], **kwargs) -> subprocess.CompletedProcess:
    executable = Path(command[0]).suffix.lower()
    if executable in {".cmd", ".bat"}:
        return subprocess.run(subprocess.list2cmdline(command), shell=True, **kwargs)
    return subprocess.run(command, **kwargs)


def run_live(bq_binary: str, args: list[str], allow_fail: bool = False) -> int:
    result = execute_subprocess([bq_binary, *args])
    if result.returncode != 0 and not allow_fail:
        raise RuntimeError(f"Falha no comando: bq {' '.join(args)}")
    return result.returncode


def run_capture(bq_binary: str, args: list[str]) -> subprocess.CompletedProcess[str]:
    return execute_subprocess(
        [bq_binary, *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def is_blank_row(row: list[str]) -> bool:
    return not row or not any((value or "").strip() for value in row)


def detect_source_encoding(csv_path: Path) -> str:
    last_error: Exception | None = None
    for encoding in SOURCE_ENCODINGS:
        try:
            with csv_path.open("r", encoding=encoding, errors="replace", newline="") as handle:
                handle.readline()
            return encoding
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"Nao foi possivel detectar o encoding de {csv_path}: {last_error}")


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
        if count == 1:
            result.append(header)
            continue

        suffix = f"_{count}"
        base = header[: 300 - len(suffix)]
        result.append(f"{base}{suffix}")

    return result


def sanitize_field(value: object) -> str:
    text = "" if value is None else str(value)
    text = text.replace("\r\n", " ").replace("\r", " ").replace("\n", " ")
    text = text.replace("\x00", "")
    if text.count('"') % 2 != 0:
        text = text.replace('"', "'")
    return text.strip()


def normalize_data_row(row: list[str], column_count: int) -> list[str]:
    normalized = [sanitize_field(value) for value in row]
    if len(normalized) < column_count:
        normalized.extend([""] * (column_count - len(normalized)))
    elif len(normalized) > column_count:
        normalized = normalized[:column_count]
    return normalized


def split_semicolon_line(line: str) -> tuple[list[str], bool]:
    fields: list[str] = []
    current: list[str] = []
    in_quotes = False
    index = 0

    while index < len(line):
        char = line[index]

        if char == '"':
            if in_quotes and index + 1 < len(line) and line[index + 1] == '"':
                current.append('"')
                index += 2
                continue
            in_quotes = not in_quotes
        elif char == ";" and not in_quotes:
            fields.append("".join(current))
            current = []
        else:
            current.append(char)

        index += 1

    fields.append("".join(current))
    return fields, in_quotes


def parse_linewise_row(raw_line: str) -> list[str] | None:
    line = raw_line.rstrip("\r\n").replace("\ufeff", "").replace("\x00", "")
    if not line.strip():
        return None

    row, unbalanced = split_semicolon_line(line)
    if unbalanced:
        repaired = line.replace('"', "'")
        row, _ = split_semicolon_line(repaired)

    return row


def prepare_clean_csv(csv_path: Path, table: str, has_header: bool, strategy: str) -> PreparedLoadFile:
    source_encoding = detect_source_encoding(csv_path)
    temp = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        newline="",
        suffix=f"_{table}_{strategy}.csv",
        delete=False,
    )
    temp_path = Path(temp.name)
    writer = csv.writer(temp, delimiter=",", quoting=csv.QUOTE_ALL)

    columns: list[str] | None = None
    row_count = 0

    try:
        if strategy == "standard":
            with csv_path.open("r", encoding=source_encoding, errors="replace", newline="") as handle:
                reader = csv.reader(handle, delimiter=";", quotechar='"')
                for raw_row in reader:
                    if is_blank_row(raw_row):
                        continue

                    if columns is None:
                        if has_header:
                            columns = dedupe_headers(
                                [normalize_header(value, index) for index, value in enumerate(raw_row, start=1)]
                            )
                            writer.writerow(columns)
                        else:
                            columns = [f"col_{index:03d}" for index in range(1, len(raw_row) + 1)]
                            writer.writerow(columns)
                            writer.writerow(normalize_data_row(raw_row, len(columns)))
                            row_count += 1
                        continue

                    writer.writerow(normalize_data_row(raw_row, len(columns)))
                    row_count += 1
        elif strategy == "linewise":
            with csv_path.open("r", encoding=source_encoding, errors="replace", newline="") as handle:
                for raw_line in handle:
                    parsed_row = parse_linewise_row(raw_line)
                    if parsed_row is None or is_blank_row(parsed_row):
                        continue

                    if columns is None:
                        if has_header:
                            columns = dedupe_headers(
                                [normalize_header(value, index) for index, value in enumerate(parsed_row, start=1)]
                            )
                            writer.writerow(columns)
                        else:
                            columns = [f"col_{index:03d}" for index in range(1, len(parsed_row) + 1)]
                            writer.writerow(columns)
                            writer.writerow(normalize_data_row(parsed_row, len(columns)))
                            row_count += 1
                        continue

                    writer.writerow(normalize_data_row(parsed_row, len(columns)))
                    row_count += 1
        else:
            raise RuntimeError(f"Estrategia desconhecida: {strategy}")

        if columns is None:
            raise RuntimeError(f"Arquivo vazio ou sem linhas validas: {csv_path}")

        temp.flush()
        return PreparedLoadFile(
            path=temp_path,
            columns=columns,
            row_count=row_count,
            strategy=strategy,
            source_encoding=source_encoding,
        )
    except Exception:
        temp.close()
        temp_path.unlink(missing_ok=True)
        raise
    finally:
        temp.close()


def write_schema_file(table: str, columns: list[str]) -> Path:
    schema = [{"name": column, "type": "STRING", "mode": "NULLABLE"} for column in columns]
    temp = tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=f"_{table}.json", delete=False)
    try:
        json.dump(schema, temp, ensure_ascii=False)
        temp.flush()
        return Path(temp.name)
    finally:
        temp.close()


def recreate_dataset(bq_binary: str, project: str, dataset: str, location: str) -> None:
    log(f"Recriando dataset {dataset}...")
    run_live(bq_binary, ["rm", "-r", "-f", f"{project}:{dataset}"], allow_fail=True)
    run_live(bq_binary, ["mk", f"--location={location}", "--dataset", f"{project}:{dataset}"])


def load_table(
    bq_binary: str,
    project: str,
    dataset: str,
    location: str,
    table: str,
    prepared_file: PreparedLoadFile,
) -> bool:
    schema_path = write_schema_file(table, prepared_file.columns)
    destination = f"{project}:{dataset}.{table}"
    cmd = [
        "load",
        f"--location={location}",
        "--source_format=CSV",
        "--field_delimiter=,",
        "--encoding=UTF-8",
        "--allow_quoted_newlines",
        "--allow_jagged_rows",
        "--skip_leading_rows=1",
        "--replace",
        destination,
        str(prepared_file.path),
        str(schema_path),
    ]

    try:
        return run_live(bq_binary, cmd, allow_fail=True) == 0
    finally:
        schema_path.unlink(missing_ok=True)


def query_count(bq_binary: str, project: str, dataset: str, location: str, table: str) -> int:
    sql = f"SELECT COUNT(*) AS total FROM `{project}.{dataset}.{table}`"
    result = run_capture(bq_binary, ["query", f"--location={location}", "--nouse_legacy_sql", "--format=csv", sql])
    if result.returncode != 0:
        message = result.stderr.strip() or result.stdout.strip() or f"Erro ao consultar {table}"
        raise RuntimeError(message)

    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if len(lines) < 2:
        raise RuntimeError(f"Consulta sem retorno para {table}")

    return int(lines[-1].replace(",", ""))


def main() -> int:
    parser = argparse.ArgumentParser(description="Carga local de CSVs para BigQuery com limpeza e schema explicito")
    parser.add_argument("--project", default=DEFAULT_PROJECT)
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--location", default=DEFAULT_LOCATION)
    parser.add_argument("--pasta", default=str(DEFAULT_FOLDER))
    args = parser.parse_args()

    folder = Path(args.pasta)
    if not folder.exists():
        log(f"Pasta nao encontrada: {folder}")
        return 1

    try:
        bq_binary = resolve_bq_binary()
    except Exception as exc:
        log(str(exc))
        return 1

    recreate_dataset(bq_binary, args.project, args.dataset, args.location)

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

        expected = EXPECTED[table]
        has_header = table not in TABLES_WITHOUT_HEADER
        size_mb = csv_path.stat().st_size / (1024 * 1024)
        log(f"\nSubindo {table} ({size_mb:.1f} MB)...")

        table_loaded = False
        table_validated = False

        for strategy in ("standard", "linewise"):
            prepared_file: PreparedLoadFile | None = None

            try:
                prepared_file = prepare_clean_csv(csv_path, table, has_header=has_header, strategy=strategy)
                log(
                    f"  parser={strategy} | origem={prepared_file.source_encoding} | "
                    f"linhas={prepared_file.row_count} | colunas={len(prepared_file.columns)}"
                )
            except Exception as exc:
                log(f"ERRO preparacao {table} [{strategy}] -> {exc}")
                if strategy == "linewise":
                    break
                continue

            try:
                if prepared_file.row_count != expected and strategy != "linewise":
                    diff = prepared_file.row_count - expected
                    log(
                        f"  contagem divergente no parser {strategy}: "
                        f"{prepared_file.row_count}/{expected} (diff {diff})"
                    )
                    log(f"  tentando parser de reparo por linha para {table}...")
                    continue

                loaded = load_table(
                    bq_binary=bq_binary,
                    project=args.project,
                    dataset=args.dataset,
                    location=args.location,
                    table=table,
                    prepared_file=prepared_file,
                )
                if not loaded:
                    log(f"ERRO {table} [{strategy}]")
                    if strategy == "linewise":
                        break
                    log(f"  tentando parser de reparo por linha para {table}...")
                    continue

                table_loaded = True

                real = query_count(bq_binary, args.project, args.dataset, args.location, table)
                if real == expected:
                    log(f"OK  {table} -> {real}/{expected} [{strategy}]")
                    table_validated = True
                    break

                diff = real - expected
                log(f"FALHA {table} -> {real}/{expected} (diff {diff}) [{strategy}]")
                if strategy == "linewise":
                    break
                log(f"  tentando parser de reparo por linha para {table}...")
            except Exception as exc:
                log(f"FALHA {table} [{strategy}] -> {exc}")
                if strategy == "linewise":
                    break
                log(f"  tentando parser de reparo por linha para {table}...")
            finally:
                if prepared_file is not None:
                    prepared_file.path.unlink(missing_ok=True)

        if table_loaded:
            load_ok += 1
        else:
            load_fail += 1

        if table_validated:
            validation_ok += 1
        else:
            validation_fail += 1

    log("\n========================================")
    log(f"CARGA: {load_ok} OK | {load_fail} erros")
    log(f"VALIDACAO: {validation_ok} OK | {validation_fail} com diferenca")
    log("========================================")

    return 0 if load_fail == 0 and validation_fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
