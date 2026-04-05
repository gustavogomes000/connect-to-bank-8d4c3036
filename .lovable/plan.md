## Plano de Importação em Massa — TSE para Supabase

### Status Atual do Banco
- ✅ `bd_eleicoes_candidatos` — 74.879 registros (2018-2024)
- ✅ `bd_eleicoes_bens_candidatos` — 97.110 registros
- ⚠️ `bd_eleicoes_votacao` — 0 registros (tabela existe mas vazia)
- ⚠️ `bd_eleicoes_comparecimento` — 0 registros
- ⚠️ `bd_eleicoes_comparecimento_secao` — 0 registros
- ⚠️ `bd_eleicoes_locais_votacao` — 0 registros
- ⚠️ `bd_eleicoes_votacao_partido` — 0 registros

### Etapa 1: Migration SQL — Criar 15 tabelas novas
1. `bd_eleicoes_votacao_secao` — votação detalhada por seção
2. `bd_eleicoes_receitas` — receitas de campanha
3. `bd_eleicoes_despesas` — despesas de campanha
4. `bd_eleicoes_coligacoes` — coligações/federações
5. `bd_eleicoes_vagas` — vagas por cargo/município
6. `bd_eleicoes_redes_sociais` — redes sociais dos candidatos
7. `bd_eleicoes_motivo_cassacao` — cassações
8. `bd_eleicoes_perfil_eleitorado` — perfil demográfico eleitores
9. `bd_eleicoes_perfil_eleitor_secao` — perfil por seção
10. `bd_eleicoes_detalhe_votacao_secao` — detalhamento voto por seção
11. `bd_eleicoes_perfil_comparecimento` — comparecimento/abstençao perfil
12. `bd_eleicoes_boletim_urna` — BU (boletim de urna)
13. `bd_eleicoes_mesarios` — mesários convocados
14. `bd_eleicoes_censo` — dados IBGE/Censo 2022
15. `bd_eleicoes_municipio_tse_ibge` — mapeamento códigos TSE↔IBGE

### Etapa 2: Script Python para o usuário rodar localmente
- Lê todos os ZIPs da pasta `C:\Users\Gustavo\Desktop\dados`
- Extrai CSVs, filtra por GO (SG_UF, SG_UE, código 52*)
- Mapeia cada arquivo para a tabela correta
- Verifica duplicatas antes de inserir
- Insere em lotes via Supabase REST API
- Gera relatório final com contagem por tabela

### Arquivos que serão processados (~170 ZIPs)
**Dados que vão para tabelas existentes (popular as vazias):**
- `votacao_candidato_munzona_*.zip` → bd_eleicoes_votacao
- `votacao_partido_munzona_*.zip` → bd_eleicoes_votacao_partido

**Dados que vão para tabelas novas:**
- `votacao_secao_*_GO.zip` → bd_eleicoes_votacao_secao
- `prestacao_de_contas_eleitorais_*.zip` → bd_eleicoes_receitas + despesas
- `consulta_coligacao_*.zip` → bd_eleicoes_coligacoes
- `consulta_vagas_*.zip` → bd_eleicoes_vagas
- `rede_social_candidato_*.zip` → bd_eleicoes_redes_sociais
- `motivo_cassacao_*.zip` → bd_eleicoes_motivo_cassacao
- `perfil_eleitorado_*.zip` → bd_eleicoes_perfil_eleitorado
- `perfil_eleitor_secao_*.zip` → bd_eleicoes_perfil_eleitor_secao
- `detalhe_votacao_secao_*.zip` → bd_eleicoes_detalhe_votacao_secao
- `perfil_comparecimento_*.zip` → bd_eleicoes_perfil_comparecimento
- `bweb_*.zip` → bd_eleicoes_boletim_urna
- `convocacao_mesarios_*.zip` → bd_eleicoes_mesarios
- `Censo 2022 *.csv` → bd_eleicoes_censo
- `municipio_tse_ibge.zip` → bd_eleicoes_municipio_tse_ibge

**Arquivos que serão ignorados:**
- *.sha1, *.sha512, fotos, propostas governo, JSONs de config, GCP credentials
