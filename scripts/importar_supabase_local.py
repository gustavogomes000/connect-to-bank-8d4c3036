#!/usr/bin/env python3
"""
Script Âncora — Importa CSVs da pasta banco_de_dados/ direto pro Supabase
Sem depender de IA, BigQuery ou Edge Functions.
Funciona offline, rate-limit free, eficiência máxima.

Uso:
  python importar_supabase_local.py --pasta "C:\Users\Gustavo\Desktop\dados\banco_de_dados"

Ou com .env:
  python importar_supabase_local.py

Requer: pip install supabase python-dotenv
"""

import os
import sys
import csv
import json
import time
import argparse
from pathlib import Path
from datetime import datetime

try:
    from supabase import create_client, Client
except ImportError:
    print("❌ Instale: pip install supabase python-dotenv")
    sys.exit(1)

# ═══ Configuração ═══
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://yvdfdmyusdhgtzfguxbj.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# Mapeamento: nome do CSV → tabela no Supabase + mapeamento de colunas
MAPA_TABELAS = {
    "bd_eleicoes_candidatos.csv": {
        "tabela": "bd_eleicoes_candidatos",
        "colunas": {
            "ANO_ELEICAO": "ano",
            "NR_TURNO": "turno",
            "DS_CARGO": "cargo",
            "NM_URNA_CANDIDATO": "nome_urna",
            "NM_CANDIDATO": "nome_completo",
            "NR_CANDIDATO": "numero_urna",
            "SG_PARTIDO": "sigla_partido",
            "NM_PARTIDO": "nome_partido",
            "NR_PARTIDO": "numero_partido",
            "NM_UE": "municipio",
            "CD_MUNICIPIO": "codigo_municipio",
            "DS_SIT_TOT_TURNO": "situacao_final",
            "DS_SITUACAO_CANDIDATURA": "situacao_candidatura",
            "DS_GENERO": "genero",
            "DS_GRAU_INSTRUCAO": "grau_instrucao",
            "DS_OCUPACAO": "ocupacao",
            "DT_NASCIMENTO": "data_nascimento",
            "DS_NACIONALIDADE": "nacionalidade",
            "SQ_CANDIDATO": "sequencial_candidato",
            "NR_ZONA": "zona",
            # Fallbacks para nomes já limpos
            "ano": "ano", "turno": "turno", "cargo": "cargo",
            "nome_urna": "nome_urna", "nome_completo": "nome_completo",
            "numero_urna": "numero_urna", "sigla_partido": "sigla_partido",
            "nome_partido": "nome_partido", "numero_partido": "numero_partido",
            "municipio": "municipio", "codigo_municipio": "codigo_municipio",
            "situacao_final": "situacao_final", "situacao_candidatura": "situacao_candidatura",
            "genero": "genero", "grau_instrucao": "grau_instrucao",
            "ocupacao": "ocupacao", "data_nascimento": "data_nascimento",
            "nacionalidade": "nacionalidade", "sequencial_candidato": "sequencial_candidato",
            "zona": "zona",
        },
        "inteiros": ["ano", "turno", "numero_urna", "numero_partido", "zona"],
    },
    "bd_eleicoes_votacao.csv": {
        "tabela": "bd_eleicoes_votacao",
        "colunas": {
            "ANO_ELEICAO": "ano",
            "NR_TURNO": "turno",
            "DS_CARGO": "cargo",
            "NM_UE": "municipio",
            "CD_MUNICIPIO": "codigo_municipio",
            "NR_ZONA": "zona",
            "NM_VOTAVEL": "nome_candidato",
            "NR_VOTAVEL": "numero_urna",
            "SG_PARTIDO": "partido",
            "QT_VOTOS": "total_votos",
            # Fallbacks
            "ano": "ano", "turno": "turno", "cargo": "cargo",
            "municipio": "municipio", "codigo_municipio": "codigo_municipio",
            "zona": "zona", "nome_candidato": "nome_candidato",
            "numero_urna": "numero_urna", "partido": "partido",
            "total_votos": "total_votos",
        },
        "inteiros": ["ano", "turno", "zona", "numero_urna", "total_votos"],
    },
    "bd_eleicoes_comparecimento.csv": {
        "tabela": "bd_eleicoes_comparecimento",
        "colunas": {
            "ANO_ELEICAO": "ano",
            "NR_TURNO": "turno",
            "NM_MUNICIPIO": "municipio",
            "CD_MUNICIPIO": "codigo_municipio",
            "NR_ZONA": "zona",
            "QT_APTOS": "eleitorado_apto",
            "QT_COMPARECIMENTO": "comparecimento",
            "QT_ABSTENCOES": "abstencoes",
            "QT_VOTOS_NOMINAIS": "votos_nominais",
            "QT_VOTOS_BRANCOS": "votos_brancos",
            "QT_VOTOS_NULOS": "votos_nulos",
            "QT_VOTOS_LEGENDA": "votos_legenda",
            # Fallbacks
            "ano": "ano", "turno": "turno", "municipio": "municipio",
            "codigo_municipio": "codigo_municipio", "zona": "zona",
            "eleitorado_apto": "eleitorado_apto", "comparecimento": "comparecimento",
            "abstencoes": "abstencoes", "votos_nominais": "votos_nominais",
            "votos_brancos": "votos_brancos", "votos_nulos": "votos_nulos",
            "votos_legenda": "votos_legenda",
        },
        "inteiros": ["ano", "turno", "zona", "eleitorado_apto", "comparecimento",
                      "abstencoes", "votos_nominais", "votos_brancos", "votos_nulos", "votos_legenda"],
    },
    "bd_eleicoes_bens_candidatos.csv": {
        "tabela": "bd_eleicoes_bens_candidatos",
        "colunas": {
            "ANO_ELEICAO": "ano",
            "NR_TURNO": "turno",
            "DS_CARGO": "cargo",
            "NM_UE": "municipio",
            "CD_MUNICIPIO": "codigo_municipio",
            "NM_CANDIDATO": "nome_candidato",
            "SQ_CANDIDATO": "sequencial_candidato",
            "SG_PARTIDO": "sigla_partido",
            "NR_ORDEM_BEM_CANDIDATO": "ordem_bem",
            "DS_TIPO_BEM_CANDIDATO": "tipo_bem",
            "DS_BEM_CANDIDATO": "descricao_bem",
            "VR_BEM_CANDIDATO": "valor_bem",
            # Fallbacks
            "ano": "ano", "turno": "turno", "cargo": "cargo",
            "municipio": "municipio", "codigo_municipio": "codigo_municipio",
            "nome_candidato": "nome_candidato", "sequencial_candidato": "sequencial_candidato",
            "sigla_partido": "sigla_partido", "ordem_bem": "ordem_bem",
            "tipo_bem": "tipo_bem", "descricao_bem": "descricao_bem", "valor_bem": "valor_bem",
        },
        "inteiros": ["ano", "turno", "ordem_bem"],
        "decimais": ["valor_bem"],
    },
    "bd_eleicoes_votacao_partido.csv": {
        "tabela": "bd_eleicoes_votacao_partido",
        "colunas": {
            "ANO_ELEICAO": "ano",
            "NR_TURNO": "turno",
            "DS_CARGO": "cargo",
            "NM_UE": "municipio",
            "CD_MUNICIPIO": "codigo_municipio",
            "NR_ZONA": "zona",
            "SG_PARTIDO": "sigla_partido",
            "NR_PARTIDO": "numero_partido",
            "QT_VOTOS_NOMINAIS": "votos_nominais",
            "QT_VOTOS_LEGENDA": "votos_legenda",
            "QT_VOTOS_NOMINAIS_VALIDOS": "total_votos",
            # Fallbacks
            "ano": "ano", "turno": "turno", "cargo": "cargo",
            "municipio": "municipio", "codigo_municipio": "codigo_municipio",
            "zona": "zona", "sigla_partido": "sigla_partido",
            "numero_partido": "numero_partido", "votos_nominais": "votos_nominais",
            "votos_legenda": "votos_legenda", "total_votos": "total_votos",
        },
        "inteiros": ["ano", "turno", "zona", "numero_partido", "votos_nominais", "votos_legenda", "total_votos"],
    },
    "bd_eleicoes_locais_votacao.csv": {
        "tabela": "bd_eleicoes_locais_votacao",
        "colunas": {
            "ANO_ELEICAO": "ano",
            "NR_ZONA": "zona",
            "NR_SECAO": "secao",
            "NM_MUNICIPIO": "municipio",
            "CD_MUNICIPIO": "codigo_municipio",
            "NM_LOCAL_VOTACAO": "local_votacao",
            "DS_ENDERECO": "endereco_local",
            "NM_BAIRRO": "bairro",
            "QT_APTOS": "eleitorado_apto",
            # Fallbacks
            "ano": "ano", "zona": "zona", "secao": "secao",
            "municipio": "municipio", "codigo_municipio": "codigo_municipio",
            "local_votacao": "local_votacao", "endereco_local": "endereco_local",
            "bairro": "bairro", "eleitorado_apto": "eleitorado_apto",
        },
        "inteiros": ["ano", "zona", "secao", "eleitorado_apto"],
    },
    "bd_eleicoes_comparecimento_secao.csv": {
        "tabela": "bd_eleicoes_comparecimento_secao",
        "colunas": {
            "ANO_ELEICAO": "ano",
            "NR_TURNO": "turno",
            "NM_MUNICIPIO": "municipio",
            "CD_MUNICIPIO": "codigo_municipio",
            "NR_ZONA": "zona",
            "NR_SECAO": "secao",
            "NM_LOCAL_VOTACAO": "local_votacao",
            "DS_ENDERECO": "endereco",
            "NM_BAIRRO": "bairro",
            "QT_APTOS": "eleitorado_apto",
            "QT_COMPARECIMENTO": "comparecimento",
            "QT_ABSTENCOES": "abstencoes",
            "QT_VOTOS_BRANCOS": "votos_brancos",
            "QT_VOTOS_NULOS": "votos_nulos",
            # Fallbacks
            "ano": "ano", "turno": "turno", "municipio": "municipio",
            "codigo_municipio": "codigo_municipio", "zona": "zona",
            "secao": "secao", "local_votacao": "local_votacao",
            "endereco": "endereco", "bairro": "bairro",
            "eleitorado_apto": "eleitorado_apto", "comparecimento": "comparecimento",
            "abstencoes": "abstencoes", "votos_brancos": "votos_brancos",
            "votos_nulos": "votos_nulos",
        },
        "inteiros": ["ano", "turno", "zona", "secao", "eleitorado_apto",
                      "comparecimento", "abstencoes", "votos_brancos", "votos_nulos"],
    },
}

# ═══ Funções ═══

def converter_valor(valor, campo, config):
    """Converte valor para o tipo correto"""
    if valor is None or valor.strip() == "" or valor == "#NULO#" or valor == "#NE#":
        return None
    valor = valor.strip().strip('"')
    if campo in config.get("inteiros", []):
        try:
            return int(float(valor))
        except (ValueError, TypeError):
            return None
    if campo in config.get("decimais", []):
        try:
            return float(valor.replace(",", "."))
        except (ValueError, TypeError):
            return None
    return valor


def mapear_linha(row, config):
    """Mapeia uma linha CSV para o formato Supabase"""
    resultado = {}
    mapa = config["colunas"]
    for col_csv, val in row.items():
        col_limpa = col_csv.strip().strip('"')
        if col_limpa in mapa:
            campo_db = mapa[col_limpa]
            resultado[campo_db] = converter_valor(val, campo_db, config)
    return resultado


def detectar_encoding(filepath):
    """Tenta detectar encoding do CSV"""
    for enc in ["utf-8", "latin-1", "cp1252", "iso-8859-1"]:
        try:
            with open(filepath, "r", encoding=enc) as f:
                f.read(1024)
            return enc
        except (UnicodeDecodeError, UnicodeError):
            continue
    return "utf-8"


def detectar_separador(filepath, encoding):
    """Detecta separador do CSV"""
    with open(filepath, "r", encoding=encoding) as f:
        primeira = f.readline()
    if primeira.count(";") > primeira.count(","):
        return ";"
    return ","


def importar_csv(supabase: Client, filepath: Path, config: dict, batch_size=500):
    """Importa um CSV para o Supabase em batches"""
    tabela = config["tabela"]
    encoding = detectar_encoding(str(filepath))
    separador = detectar_separador(str(filepath), encoding)

    print(f"  📂 Encoding: {encoding} | Separador: '{separador}'")

    total = 0
    inseridos = 0
    erros = 0
    batch = []

    with open(filepath, "r", encoding=encoding, errors="replace") as f:
        reader = csv.DictReader(f, delimiter=separador)
        for row in reader:
            total += 1
            mapeado = mapear_linha(row, config)

            # Validação mínima: precisa ter 'ano'
            if not mapeado.get("ano"):
                continue

            batch.append(mapeado)

            if len(batch) >= batch_size:
                try:
                    supabase.table(tabela).insert(batch).execute()
                    inseridos += len(batch)
                except Exception as e:
                    erros += len(batch)
                    erro_msg = str(e)[:200]
                    # Tenta inserir um a um pra salvar o máximo
                    for item in batch:
                        try:
                            supabase.table(tabela).insert(item).execute()
                            inseridos += 1
                            erros -= 1
                        except:
                            pass
                    if erros > 0:
                        print(f"  ⚠️  Batch com erros: {erro_msg}")
                batch = []

                # Progresso
                if total % 5000 == 0:
                    print(f"  📊 {total:,} lidos | {inseridos:,} inseridos")

    # Último batch
    if batch:
        try:
            supabase.table(tabela).insert(batch).execute()
            inseridos += len(batch)
        except Exception as e:
            for item in batch:
                try:
                    supabase.table(tabela).insert(item).execute()
                    inseridos += 1
                except:
                    erros += 1

    return total, inseridos, erros


def limpar_tabela(supabase: Client, tabela: str):
    """Remove todos os registros da tabela"""
    try:
        # Deleta em batches grandes usando filtro que pega tudo
        supabase.table(tabela).delete().gte("id", 0).execute()
        print(f"  🗑️  Tabela {tabela} limpa")
    except Exception as e:
        print(f"  ⚠️  Erro ao limpar {tabela}: {e}")


# ═══ Main ═══

def main():
    parser = argparse.ArgumentParser(description="Importar CSVs → Supabase (script âncora)")
    parser.add_argument("--pasta", default=None, help="Pasta com os CSVs consolidados")
    parser.add_argument("--url", default=SUPABASE_URL, help="URL do Supabase")
    parser.add_argument("--key", default=SUPABASE_KEY, help="Service role key do Supabase")
    parser.add_argument("--limpar", action="store_true", help="Limpar tabelas antes de importar")
    parser.add_argument("--batch", type=int, default=500, help="Tamanho do batch (padrão: 500)")
    parser.add_argument("--tabela", default=None, help="Importar apenas uma tabela específica")
    args = parser.parse_args()

    # Tentar carregar .env
    try:
        from dotenv import load_dotenv
        load_dotenv()
        if not args.key:
            args.key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    except ImportError:
        pass

    if not args.key:
        print("❌ Forneça a service role key via --key ou SUPABASE_SERVICE_KEY")
        print("   Encontre em: https://supabase.com/dashboard/project/yvdfdmyusdhgtzfguxbj/settings/api")
        sys.exit(1)

    # Auto-detectar pasta
    pasta = args.pasta
    if not pasta:
        candidatas = [
            r"C:\Users\Gustavo\Desktop\dados\banco_de_dados",
            r".\banco_de_dados",
            r".\dados\banco_de_dados",
        ]
        for p in candidatas:
            if os.path.isdir(p):
                pasta = p
                break
    
    if not pasta or not os.path.isdir(pasta):
        print("❌ Pasta não encontrada. Use --pasta para especificar")
        sys.exit(1)

    print(f"""
╔══════════════════════════════════════════════════════╗
║     IMPORTADOR ÂNCORA — CSV → SUPABASE DIRETO       ║
║     Sem IA, sem BigQuery, sem rate limit             ║
╚══════════════════════════════════════════════════════╝

📁 Pasta: {pasta}
🔗 Supabase: {args.url}
📦 Batch: {args.batch}
🗑️  Limpar: {'Sim' if args.limpar else 'Não'}
""")

    # Conectar
    supabase: Client = create_client(args.url, args.key)
    print("✅ Conectado ao Supabase\n")

    # Listar CSVs disponíveis
    csvs_encontrados = []
    for arquivo in sorted(os.listdir(pasta)):
        if arquivo.endswith(".csv") and arquivo in MAPA_TABELAS:
            csvs_encontrados.append(arquivo)

    if not csvs_encontrados:
        print("❌ Nenhum CSV compatível encontrado na pasta")
        print(f"   CSVs esperados: {', '.join(MAPA_TABELAS.keys())}")
        sys.exit(1)

    if args.tabela:
        csvs_encontrados = [c for c in csvs_encontrados if args.tabela in c]

    print(f"📋 {len(csvs_encontrados)} CSVs para importar:\n")
    for csv_file in csvs_encontrados:
        tamanho = os.path.getsize(os.path.join(pasta, csv_file)) / (1024 * 1024)
        print(f"   • {csv_file} ({tamanho:.1f} MB)")

    print()
    inicio_total = time.time()
    resultados = []

    for i, csv_file in enumerate(csvs_encontrados, 1):
        config = MAPA_TABELAS[csv_file]
        filepath = Path(pasta) / csv_file
        tabela = config["tabela"]

        print(f"[{i}/{len(csvs_encontrados)}] {csv_file} → {tabela}")

        if args.limpar:
            limpar_tabela(supabase, tabela)

        inicio = time.time()
        total, inseridos, erros = importar_csv(supabase, filepath, config, args.batch)
        duracao = time.time() - inicio

        resultado = {
            "arquivo": csv_file,
            "tabela": tabela,
            "total_lidos": total,
            "inseridos": inseridos,
            "erros": erros,
            "duracao_seg": round(duracao, 1),
        }
        resultados.append(resultado)

        status = "✅" if erros == 0 else "⚠️"
        print(f"  {status} {inseridos:,} inseridos / {total:,} lidos | {erros} erros | {duracao:.1f}s\n")

    # Relatório final
    duracao_total = time.time() - inicio_total
    total_inseridos = sum(r["inseridos"] for r in resultados)
    total_erros = sum(r["erros"] for r in resultados)

    print(f"""
╔══════════════════════════════════════════════════════╗
║                 RELATÓRIO FINAL                      ║
╠══════════════════════════════════════════════════════╣""")
    for r in resultados:
        s = "✅" if r["erros"] == 0 else "⚠️"
        print(f"║ {s} {r['tabela']:<35} {r['inseridos']:>8,} regs ║")
    print(f"""╠══════════════════════════════════════════════════════╣
║ Total inseridos: {total_inseridos:>10,}                       ║
║ Total erros:     {total_erros:>10,}                       ║
║ Tempo total:     {duracao_total:>10.1f}s                      ║
╚══════════════════════════════════════════════════════╝""")

    # Salvar log
    log_path = os.path.join(pasta, f"log_importacao_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2)
    print(f"\n📝 Log salvo em: {log_path}")


if __name__ == "__main__":
    main()
