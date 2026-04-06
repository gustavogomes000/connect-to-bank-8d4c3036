from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Optional

ALLOWED_EXTENSIONS = {".zip", ".csv", ".txt", ".xlsx", ".json", ".geojson"}

TYPE_HINTS = {
    "candidatos": [["consulta", "cand"]],
    "votacao_munzona": [["votacao", "candidato", "munzona"]],
    "votacao_secao": [["votacao", "secao"]],
    "comparecimento_munzona": [["detalhe", "votacao", "munzona"], ["comparecimento", "munzona"]],
    "comparecimento_secao": [["detalhe", "votacao", "secao"], ["comparecimento", "secao"]],
    "bens_candidatos": [["bem", "candidato"]],
    "receitas": [["prestacao", "contas", "candidatos"]],
    "despesas": [["prestacao", "contas", "candidatos"]],
    "perfil_eleitorado": [["perfil", "eleitorado"]],
    "perfil_eleitor_secao": [["perfil", "eleitor", "secao"]],
    "votacao_partido_munzona": [["votacao", "partido", "munzona"]],
    "eleitorado_local": [["eleitorado", "local", "votacao"]],
    "filiados": [["filiad"] , ["filiacao", "partidaria"]],
    "coligacoes": [["consulta", "coligacao"]],
    "vagas": [["consulta", "vagas"]],
    "legendas": [["legenda"], ["legendas"], ["consulta", "legenda"]],
    "redes_sociais": [["rede", "social", "candidato"]],
    "boletim_urna": [["bweb"], ["boletim", "urna"]],
    "pesquisas": [["pesquisa"], ["pesquisas"]],
    "cassacoes": [["motivo", "cassacao"]],
    "censo_setor": [["go_20241025"], ["setor", "censitario"], ["agregados", "setores"]],
    "escolas": [["microdados", "censo", "escolar"], ["escolas"]],
    "malha_setores_goiania": [["5208707"], ["goiania", "geojson"]],
    "malha_setores_aparecida": [["5201405"], ["aparecida", "geojson"]],
}

_LOCAL_FILE_CACHE: Dict[str, List[Path]] = {}


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (text or "").lower()).strip("_")


def _cache_key(directory: Path) -> str:
    try:
        return str(directory.resolve()).lower()
    except Exception:
        return str(directory).lower()


def _list_candidate_files(directory: Path) -> List[Path]:
    key = _cache_key(directory)
    if key not in _LOCAL_FILE_CACHE:
        if not directory.exists():
            _LOCAL_FILE_CACHE[key] = []
        else:
            _LOCAL_FILE_CACHE[key] = [
                p for p in directory.rglob("*")
                if p.is_file() and p.suffix.lower() in ALLOWED_EXTENSIONS
            ]
    return _LOCAL_FILE_CACHE[key]


def _pick_best(paths: List[Path]) -> Optional[Path]:
    if not paths:
        return None

    def sort_key(path: Path):
        try:
            stat = path.stat()
            return (stat.st_size, stat.st_mtime)
        except Exception:
            return (0, 0)

    return sorted(paths, key=sort_key, reverse=True)[0]


def _match_year(path: Path, year: str, tipo: str) -> bool:
    if not year:
        return True
    name = path.name.lower()
    if year in name:
        return True
    if tipo == "boletim_urna" and any(part.endswith(year) for part in re.split(r"[^0-9]", name) if part):
        return True
    return False


def _hint_matches(path: Path, tipo: str, year: str) -> bool:
    name_norm = _norm(path.name)
    for group in TYPE_HINTS.get(tipo, []):
        if all(token in name_norm for token in group) and _match_year(path, year, tipo):
            return True
    return False


def find_local_source_file(directory: Path, item: dict) -> Optional[Path]:
    if not directory.exists():
        return None

    files = _list_candidate_files(directory)
    if not files:
        return None

    url = str(item.get("url", "") or "")
    tipo = str(item.get("tipo", "") or "").strip().lower()
    year = str(item.get("ano") or "").strip()
    basename = Path(url.split("?")[0]).name.lower()
    basename_norm = _norm(basename)
    tabela_norm = _norm(str(item.get("tabela_bq", "") or ""))

    exact_matches = []
    loose_matches = []

    for path in files:
        name_lower = path.name.lower()
        name_norm = _norm(path.name)

        if basename and name_lower == basename:
            exact_matches.append(path)
            continue

        if basename_norm and basename_norm in name_norm:
            loose_matches.append(path)
            continue

        if tipo and _hint_matches(path, tipo, year):
            loose_matches.append(path)
            continue

        if tabela_norm and any(tok for tok in tabela_norm.split("_") if tok and tok != year):
            tokens = [tok for tok in tabela_norm.split("_") if tok and tok not in {"raw", year}]
            if tokens and all(tok in name_norm for tok in tokens[: min(3, len(tokens))]) and _match_year(path, year, tipo):
                loose_matches.append(path)

    return _pick_best(exact_matches) or _pick_best(loose_matches)