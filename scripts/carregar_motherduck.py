# -*- coding: utf-8 -*-
import subprocess
import os
import re
from pathlib import Path
from collections import defaultdict

PASTA_CSV = Path(r"C:\Users\Gustavo\Desktop\dados\dados_go_prontos")
DUCKDB_CLI = Path(r"C:\Users\Gustavo\Desktop\dados\duckdb.exe")
DATABASE = "md:my_db"

def agrupar_arquivos():
    """Agrupa CSVs por tipo de dataset (prefixo antes do estado/municipio)."""
    arquivos = sorted(PASTA_CSV.glob("*.csv"))
    grupos = defaultdict(list)

    for f in arquivos:
        nome = f.stem

        # Padroes conhecidos: extrato_campanha_2016_GO_CIDADE_CARGO
        # votacao_candidato_munzona_2014_GO, perfil_eleitor_secao_2014_GO, etc.
        # Queremos agrupar por tipo+ano

        # Tenta extrair: tipo_ANO_UF ou tipo_ANO_UF_resto
        # Exemplos:
        #   extrato_campanha_2016_GO_GOIANIA_PREFEITO -> extrato_campanha_2016_GO
        #   votacao_candidato_munzona_2014_GO -> votacao_candidato_munzona_2014_GO
        #   perfil_eleitorado_2014 -> perfil_eleitorado_2014
        #   orgao_partidario_MDB -> orgao_partidario
        #   receitas_candidatos_2020_GO -> receitas_candidatos_2020_GO

        # Detectar padrao com _GO_ (tem cidade/cargo depois)
        match_go_cidade = re.match(r'^(.+?)_(\d{4})_GO_(.+)$', nome)
        if match_go_cidade:
            tipo = match_go_cidade.group(1)
            ano = match_go_cidade.group(2)
            tabela = f"{tipo}_{ano}_GO"
            grupos[tabela].append(f)
            continue

        # Padrao com _GO no final (sem cidade)
        match_go = re.match(r'^(.+?)_(\d{4})_GO$', nome)
        if match_go:
            tipo = match_go.group(1)
            ano = match_go.group(2)
            tabela = f"{tipo}_{ano}_GO"
            grupos[tabela].append(f)
            continue

        # Padrao com _BRASIL
        match_br = re.match(r'^(.+?)_(\d{4})_BRASIL$', nome)
        if match_br:
            tipo = match_br.group(1)
            ano = match_br.group(2)
            tabela = f"{tipo}_{ano}_BRASIL"
            grupos[tabela].append(f)
            continue

        # Padrao com _BR
        match_br2 = re.match(r'^(.+?)_(\d{4})_BR$', nome)
        if match_br2:
            tipo = match_br2.group(1)
            ano = match_br2.group(2)
            tabela = f"{tipo}_{ano}_BR"
            grupos[tabela].append(f)
            continue

        # Padrao orgao_partidario_PARTIDO (sem ano)
        match_partido = re.match(r'^(orgao_partidario)_(.+)$', nome)
        if match_partido:
            grupos["orgao_partidario"].append(f)
            continue

        # Padrao com ano mas sem UF
        match_ano = re.match(r'^(.+?)_(\d{4})$', nome)
        if match_ano:
            tipo = match_ano.group(1)
            ano = match_ano.group(2)
            tabela = f"{tipo}_{ano}"
            grupos[tabela].append(f)
            continue

        # Outros - agrupar por nome exato
        match_outros_uf = re.match(r'^(.+?)_(\d{4})_([A-Z]{2})$', nome)
        if match_outros_uf:
            tipo = match_outros_uf.group(1)
            ano = match_outros_uf.group(2)
            uf = match_outros_uf.group(3)
            tabela = f"{tipo}_{ano}_{uf}"
            grupos[tabela].append(f)
            continue

        # Fallback
        grupos[nome].append(f)

    return grupos


def executar_sql(sql):
    """Executa SQL no DuckDB CLI conectado ao MotherDuck."""
    result = subprocess.run(
        [str(DUCKDB_CLI), DATABASE, "-c", sql],
        capture_output=True, text=True, timeout=600
    )
    if result.returncode != 0:
        return False, result.stderr
    return True, result.stdout


def carregar_grupo(tabela, arquivos):
    """Carrega um grupo de CSVs em uma tabela no MotherDuck."""
    if len(arquivos) == 1:
        caminho = str(arquivos[0]).replace("\\", "/")
        sql = f"""
            CREATE OR REPLACE TABLE {tabela} AS
            SELECT * FROM read_csv('{caminho}', 
                auto_detect=true, 
                ignore_errors=true,
                null_padding=true);
        """
    else:
        # Multiplos arquivos - usar glob ou union
        caminhos = [str(f).replace("\\", "/") for f in arquivos]
        # Se todos estao na mesma pasta, tentar glob
        pasta = str(arquivos[0].parent).replace("\\", "/")

        # Verificar se tem padrao comum
        prefixo_comum = os.path.commonprefix([f.name for f in arquivos])
        if prefixo_comum and len(prefixo_comum) > 5:
            glob_pattern = f"{pasta}/{prefixo_comum}*.csv"
            sql = f"""
                CREATE OR REPLACE TABLE {tabela} AS
                SELECT * FROM read_csv('{glob_pattern}', 
                    auto_detect=true, 
                    union_by_name=true, 
                    ignore_errors=true,
                    null_padding=true,
                    filename=true);
            """
        else:
            # Lista explicita (max 50 por vez para evitar comando muito longo)
            lista = ", ".join([f"'{c}'" for c in caminhos[:50]])
            sql = f"""
                CREATE OR REPLACE TABLE {tabela} AS
                SELECT * FROM read_csv([{lista}], 
                    auto_detect=true, 
                    union_by_name=true, 
                    ignore_errors=true,
                    null_padding=true,
                    filename=true);
            """

    return executar_sql(sql)


def main():
    print("=" * 60)
    print("CARREGADOR DE DADOS ELEITORAIS -> MOTHERDUCK")
    print("=" * 60)

    # Verificar conexao
    print("\n[1/3] Testando conexao com MotherDuck...")
    ok, msg = executar_sql("SELECT 1 as teste")
    if not ok:
        print(f"ERRO de conexao: {msg}")
        print("Verifique se o token esta configurado:")
        print('  $env:motherduck_token = "SEU_TOKEN"')
        return

    print("Conexao OK!")

    # Agrupar arquivos
    print("\n[2/3] Agrupando arquivos CSV...")
    grupos = agrupar_arquivos()
    print(f"Encontrados {sum(len(v) for v in grupos.values())} arquivos em {len(grupos)} tabelas")

    # Mostrar resumo
    print("\nTabelas que serao criadas:")
    for tabela, arquivos in sorted(grupos.items()):
        tamanho_mb = sum(f.stat().st_size for f in arquivos) / (1024*1024)
        print(f"  {tabela}: {len(arquivos)} arquivo(s), {tamanho_mb:.1f} MB")

    print(f"\n[3/3] Carregando {len(grupos)} tabelas no MotherDuck...")
    print("(isso pode demorar alguns minutos para arquivos grandes)\n")

    sucesso = 0
    erros = []

    for i, (tabela, arquivos) in enumerate(sorted(grupos.items()), 1):
        tamanho_mb = sum(f.stat().st_size for f in arquivos) / (1024*1024)
        print(f"  [{i}/{len(grupos)}] {tabela} ({len(arquivos)} arq, {tamanho_mb:.1f} MB)...", end=" ", flush=True)

        try:
            ok, msg = carregar_grupo(tabela, arquivos)
            if ok:
                print("OK")
                sucesso += 1
            else:
                print(f"ERRO: {msg[:100]}")
                erros.append((tabela, msg[:200]))
        except subprocess.TimeoutExpired:
            print("TIMEOUT (arquivo muito grande, pulando)")
            erros.append((tabela, "Timeout - arquivo muito grande"))
        except Exception as e:
            print(f"ERRO: {str(e)[:100]}")
            erros.append((tabela, str(e)[:200]))

    # Resumo final
    print("\n" + "=" * 60)
    print(f"RESULTADO: {sucesso}/{len(grupos)} tabelas carregadas com sucesso")

    if erros:
        print(f"\n{len(erros)} erros:")
        for tabela, erro in erros:
            print(f"  - {tabela}: {erro}")

    # Verificar tabelas criadas
    print("\nVerificando tabelas no MotherDuck...")
    ok, msg = executar_sql("SHOW TABLES")
    if ok:
        print(msg)

    print("\nPronto! Dados carregados no MotherDuck.")


if __name__ == "__main__":
    main()
