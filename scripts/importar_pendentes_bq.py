#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════╗
║  IMPORTAR PENDENTES — Compara BQ real × sources_unified.json     ║
║  e importa SOMENTE as tabelas que não existem no BigQuery.       ║
║                                                                  ║
║  Usa toda infra do importar_unificado.py (download, filtro, etc) ║
╚══════════════════════════════════════════════════════════════════╝

Uso:
  python importar_pendentes_bq.py                    # Importa tudo que falta
  python importar_pendentes_bq.py --dry-run           # Mostra o que falta sem importar
  python importar_pendentes_bq.py --prioridade 1      # Só prioridade 1
  python importar_pendentes_bq.py --fonte datasus      # Só DataSUS
  python importar_pendentes_bq.py --local-dir "C:\\Users\\Gustavo\\Desktop\\dados"
"""

import argparse, json, sys, time
from pathlib import Path

# Importa tudo do unificado
sys.path.insert(0, str(Path(__file__).resolve().parent))
from importar_unificado import (
    get_client, ensure_ds, list_all_raw_tables, load_sources,
    process_and_load, save_manifest, configure_local_source_dirs,
    banner, box, log_ok, log_err, log_info, log_skip,
    fmt_dur, utcnow, C,
    FULL_DS, VERSION, CACHE_DIR, STATE_DIR,
    requests
)


def main():
    ap = argparse.ArgumentParser(description="Importar tabelas pendentes (compara BQ real)")
    ap.add_argument("--dry-run", action="store_true", help="Só mostra o que falta")
    ap.add_argument("--prioridade", type=int, default=99, help="Filtrar por prioridade máx")
    ap.add_argument("--fonte", type=str, default=None, help="Filtrar por fonte: tse, ibge, datasus...")
    ap.add_argument("--retries", type=int, default=3, help="Retries por item")
    ap.add_argument("--local-dir", type=str, default=None, help="Pasta com arquivos locais")
    args = ap.parse_args()

    banner("IMPORTAR PENDENTES — Verificando BigQuery")
    configure_local_source_dirs(args.local_dir)

    # 1. Listar tabelas existentes no BigQuery
    bq = get_client()
    ensure_ds(bq)
    existing = set(list_all_raw_tables(bq))
    log_info(f"Tabelas existentes no BigQuery: {len(existing)}")

    # 2. Carregar sources_unified.json
    sources = load_sources(args.fonte)
    sources = [s for s in sources if s.get("prioridade", 1) <= args.prioridade]
    log_info(f"Fontes no catálogo (prioridade ≤ {args.prioridade}): {len(sources)}")

    # 3. Identificar pendentes
    pending = []
    for item in sources:
        tabela = item["tabela_bq"]
        # Verifica tabela exata ou variações com sufixo _t1/_t2
        if tabela in existing:
            continue
        # Boletim de urna gera _t1 e _t2
        if f"{tabela}_t1" in existing and f"{tabela}_t2" in existing:
            continue
        pending.append(item)

    if not pending:
        banner("✅ TUDO IMPORTADO — Nenhuma tabela pendente!")
        log_info("Todas as tabelas do catálogo já existem no BigQuery.")
        return

    # 4. Mostrar pendentes
    print(f"\n  {C.R}{C.B}⚠ {len(pending)} tabelas PENDENTES:{C.RST}\n")
    by_fonte = {}
    for item in pending:
        f = item.get("fonte", "?")
        by_fonte.setdefault(f, []).append(item)

    for fonte, items in sorted(by_fonte.items()):
        print(f"  {C.CY}{C.B}[{fonte.upper()}]{C.RST} — {len(items)} tabelas")
        for item in items:
            fmt = item.get("formato", "?")
            print(f"    {C.Y}•{C.RST} {item['tabela_bq']}  ({fmt})")
        print()

    if args.dry_run:
        print(f"  {C.GR}Modo dry-run — nada foi importado.{C.RST}")
        print(f"  {C.Y}Para importar, rode sem --dry-run{C.RST}\n")
        return

    # 5. Importar pendentes
    banner(f"IMPORTANDO {len(pending)} TABELAS PENDENTES")

    sess = requests.Session()
    sess.headers.update({"User-Agent": f"EleicoesGO-Pendentes/{VERSION}"})

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    t_start = time.time()
    n_ok = n_err = total_rows = 0
    results = []

    for idx, item in enumerate(pending, 1):
        tabela = item["tabela_bq"]
        tipo = item.get("tipo", "")
        ano = item.get("ano", "")
        fonte = item.get("fonte", "")
        key = f"{fonte}|{tipo}|{ano}|{tabela}"
        tag = f"[{idx}/{len(pending)}]"

        print(f"\n  {C.B}{'─'*60}{C.RST}")
        log_info(f"{tag} [{fonte}] {tipo}/{ano or 'ATUAL'} → {tabela}")

        loaded = 0
        err = ""
        for attempt in range(1, args.retries + 1):
            t0 = time.time()
            loaded, err = process_and_load(sess, bq, item)
            dur = time.time() - t0

            if not err:
                break
            if attempt < args.retries:
                wait = min(2 ** attempt * 15, 300)
                log_info(f"  ⟳ Retry {attempt}/{args.retries} em {wait}s — {err[:100]}")
                time.sleep(wait)

        if err:
            log_err(f"✗ {tabela}: {err[:120]}")
            n_err += 1
            results.append({"tabela": tabela, "status": "erro", "erro": err[:200]})
        else:
            log_ok(f"✓ {tabela} | {loaded:,} linhas | {fmt_dur(dur)}")
            n_ok += 1
            total_rows += loaded
            results.append({"tabela": tabela, "status": "ok", "linhas": loaded})
            save_manifest(key, {"tabela": tabela, "linhas": loaded, "fonte": fonte, "tipo": tipo, "ano": ano})

    # 6. Relatório
    dur_total = time.time() - t_start
    banner("RELATÓRIO FINAL — PENDENTES")
    box("Resumo", [
        f"Duração:     {fmt_dur(dur_total)}",
        f"",
        f"✓ Sucesso:   {n_ok}",
        f"✗ Erros:     {n_err}",
        f"",
        f"Linhas:      {total_rows:,}",
    ])

    if results:
        print(f"  {C.B}{'Status':<10} {'Tabela':<50} {'Linhas':>10}{C.RST}")
        print(f"  {'─'*75}")
        for r in results:
            s = r["status"]
            color = C.G if s == "ok" else C.R
            icon = "✓" if s == "ok" else "✗"
            linhas = r.get("linhas", 0)
            print(f"  {color}{icon} {s:<8}{C.RST} {r['tabela']:<50} {linhas:>10,}")
        print(f"  {'─'*75}")

    still_failed = [r for r in results if r["status"] == "erro"]
    if still_failed:
        print(f"\n  {C.R}{C.B}⚠ {len(still_failed)} tabelas ainda com erro:{C.RST}")
        for r in still_failed:
            print(f"    {C.R}✗ {r['tabela']}{C.RST}  →  {r.get('erro','')[:80]}")
        print(f"\n  {C.Y}Para retentar uma tabela específica:{C.RST}")
        print(f"    python importar_unificado.py importar --tabela NOME_TABELA\n")

    status = '🎉 Tudo importado!' if n_err == 0 else f'⚠️  {n_err} erros — veja acima'
    print(f"\n  {C.B}{status}{C.RST}\n")


if __name__ == "__main__":
    main()
