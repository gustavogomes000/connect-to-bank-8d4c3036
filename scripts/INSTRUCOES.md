# 📋 Guia Completo — Importação TSE → BigQuery (Goiás)

## 🎯 O que esse script faz

Baixa dados públicos do TSE (candidatos, votação, comparecimento, receitas, despesas, perfil eleitorado, etc.), **filtra apenas Goiás**, e sobe tudo no BigQuery como tabelas brutas (todas colunas STRING).

---

## 📦 Pré-requisitos

### 1. Python 3.9+
```bash
python --version
```

### 2. Instalar dependências
```bash
pip install google-cloud-bigquery requests tqdm
```

### 3. Autenticar no Google Cloud
```bash
# Opção A: Login interativo
gcloud auth application-default login

# Opção B: Service Account (recomendado para servidor)
export GOOGLE_APPLICATION_CREDENTIALS="/caminho/para/service-account.json"
```

### 4. Criar projeto no Google Cloud (se ainda não tem)
- Acesse: https://console.cloud.google.com
- Crie um projeto ou use um existente
- Ative a API do BigQuery: `BigQuery API`

---

## 🚀 Como Executar

### Passo 1 — Verificar o plano (DRY RUN)
```bash
cd scripts
python importar_bigquery.py \
  --project SEU_PROJETO_GCP \
  --dataset SEU_PROJETO_GCP.eleicoes_go \
  --config sources.json \
  --dry-run
```
Isso mostra todas as fontes que serão importadas, sem baixar nada.

### Passo 2 — Importar prioridade 1 (dados essenciais)
```bash
python importar_bigquery.py \
  --project SEU_PROJETO_GCP \
  --dataset SEU_PROJETO_GCP.eleicoes_go \
  --config sources.json \
  --prioridade 1
```

### Passo 3 — Importar tudo (prioridade 1 + 2)
```bash
python importar_bigquery.py \
  --project SEU_PROJETO_GCP \
  --dataset SEU_PROJETO_GCP.eleicoes_go \
  --config sources.json \
  --resume
```
O `--resume` pula o que já foi importado com sucesso.

### Passo 4 — Se der erro em algum, corrigir e reimportar
```bash
# Reimportar tudo forçado
python importar_bigquery.py \
  --project SEU_PROJETO_GCP \
  --dataset SEU_PROJETO_GCP.eleicoes_go \
  --config sources.json \
  --force

# Ou só deletar o cache do ZIP problemático e rodar com --resume
rm .cache_tse/arquivo_problematico.zip
python importar_bigquery.py ... --resume
```

---

## 📊 O Que Será Importado

### Prioridade 1 — Dados Essenciais (rodar primeiro)

| Tipo | Anos | Tabela BigQuery |
|------|------|-----------------|
| Candidatos | 2016-2024 | `raw_candidatos_XXXX` |
| Votação por município/zona | 2016-2024 | `raw_votacao_munzona_XXXX` |
| Votação por seção | 2016-2024 | `raw_votacao_secao_XXXX` |
| Comparecimento município/zona | 2016-2024 | `raw_comparecimento_munzona_XXXX` |
| Comparecimento por seção | 2020-2024 | `raw_comparecimento_secao_XXXX` |
| Bens de candidatos | 2016-2024 | `raw_bens_candidatos_XXXX` |
| Receitas de campanha | 2018-2024 | `raw_receitas_XXXX` |
| Despesas de campanha | 2018-2024 | `raw_despesas_XXXX` |
| Perfil do eleitorado | 2018-2024 | `raw_perfil_eleitorado_XXXX` |
| Perfil eleitor por seção | 2020-2024 | `raw_perfil_eleitor_secao_XXXX` |
| Votação por partido | 2016-2024 | `raw_votacao_partido_munzona_XXXX` |
| Eleitorado por local | 2020-2024 | `raw_eleitorado_local_XXXX` |

### Prioridade 2 — Dados Complementares

| Tipo | Anos | Tabela BigQuery |
|------|------|-----------------|
| Candidatos (antigos) | 2012-2014 | `raw_candidatos_XXXX` |
| Votação (antigos) | 2012-2014 | `raw_votacao_munzona_XXXX` |
| Filiados | 2024 | `raw_filiados_2024` |
| Coligações | 2020-2024 | `raw_coligacoes_XXXX` |
| Vagas | 2020-2024 | `raw_vagas_XXXX` |
| Legendas | 2022-2024 | `raw_legendas_XXXX` |
| Redes sociais | 2022-2024 | `raw_redes_sociais_XXXX` |
| Boletim de urna | 2022-2024 | `raw_boletim_urna_XXXX` |

---

## 🔧 Estrutura de Arquivos

```
scripts/
├── importar_bigquery.py      # Script principal
├── sources.json               # Catálogo de fontes (URLs TSE)
├── INSTRUCOES.md              # Este arquivo
├── .cache_tse/                # ZIPs baixados (cache local)
│   ├── consulta_cand_2024.zip
│   └── ...
└── .state/
    ├── manifest.jsonl         # Controle de importações (resume)
    └── report_XXXXXXXX.json   # Relatório de cada execução
```

---

## 🛡️ Estratégia de Resiliência

1. **Downloads com retry** — 3 tentativas com espera progressiva (5s, 10s, 15s)
2. **ZIP corrompido** — detecta, deleta cache, permite reimportar
3. **Filtro GO inteligente** — busca coluna UF ou código município (prefixo 52)
4. **Manifest de controle** — cada arquivo importado é registrado; `--resume` pula os OK
5. **Erros não param** — se um arquivo falha, continua com os próximos
6. **Relatório final** — JSON com tudo que aconteceu + resumo visual no console

---

## 📈 Depois da Importação (Próximos Passos)

1. **Validar no BigQuery** — abra o console do BigQuery e verifique as tabelas
2. **Conferir contagens** — `SELECT COUNT(*) FROM eleicoes_go.raw_candidatos_2024`
3. **Criar views consolidadas** — unir anos, normalizar dados
4. **Migrar para Supabase** — quando a base estiver validada, criaremos o pipeline Supabase

---

## ❓ Troubleshooting

| Problema | Solução |
|----------|---------|
| `google-cloud-bigquery não instalado` | `pip install google-cloud-bigquery` |
| `403 Forbidden` no download | URL do TSE pode ter mudado, verificar em dados.tse.jus.br |
| `Permission denied` no BigQuery | Verificar permissões do projeto GCP |
| ZIP corrompido | Deletar arquivo em `.cache_tse/` e rodar de novo |
| 0 linhas após filtro | Arquivo pode não ter coluna UF — verificar headers no log |
| Muito lento | Usar `--prioridade 1` para importar só o essencial primeiro |

---

## 💰 Custos BigQuery

- **Armazenamento**: ~$0.02/GB/mês (dados de GO são pequenos, ~poucos GB)
- **Consultas**: $5/TB processado (primeiros 1TB/mês grátis)
- **Importação**: Gratuita (load jobs não cobram)

Para o volume de dados de Goiás, o custo estimado é **< $1/mês**.
