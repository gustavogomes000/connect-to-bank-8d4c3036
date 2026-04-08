# EleiçõesGO — Documentação Completa

## Visão Geral

Plataforma de inteligência eleitoral focada em Goiás (Goiânia e Aparecida de Goiânia).
Permite análise de candidatos, votação, zonas eleitorais e escolas eleitorais.

---

## Arquitetura

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Lovable    │────▶│   Supabase   │────▶│  MotherDuck  │
│  (Frontend)  │     │  (Backend)   │     │ (Analítico)  │
│  React + TS  │     │ Edge Funcs   │     │ 1200+ tabelas│
└─────────────┘     └──────────────┘     └─────────────┘
```

- **Frontend**: React 18 + Vite + Tailwind + Zustand + React Query + Recharts
- **Backend**: Supabase Edge Functions (proxy para MotherDuck)
- **Banco Analítico**: MotherDuck com 1200+ tabelas TSE (candidatos, votação, bens, eleitorado, etc.)

---

## Módulos da Aplicação

### 1. Ranking (`/` e `/ranking`)
**Arquivo**: `src/pages/Ranking.tsx`
- Tabela paginada de todos os candidatos
- Busca por nome, ordenação por colunas
- Filtros globais: Ano, Município, Cargo, Turno, Partido, Zona, Bairro, Escola
- Clique no candidato abre o Perfil
- **Dados**: `useRanking()` → `consulta_cand_{ano}_GO`

### 2. Zonas Eleitorais (`/zonas`)
**Arquivo**: `src/pages/ZonasEleitorais.tsx`
- Visão unificada por zona eleitoral
- KPIs: total de zonas, locais, seções, eleitores, comparecimento
- Tabela expansível: clique numa zona para ver colégios eleitorais
- Aba "Top Candidatos" com ranking por votos
- **Dados**: `useLocaisVotacao()` + `useComparecimento()` + `usePainelGeral()`

### 3. Escolas Eleitorais (`/escolas`)
**Arquivo**: `src/pages/EscolasEleitorais.tsx`
- Todos os locais de votação do município
- KPIs: locais mapeados, urnas, eleitores, média por seção
- Busca por nome da escola, bairro ou endereço
- Expansão de linhas para ver seções individuais
- **Dados**: `useLocaisVotacao()` + `useSecoesLocal()` → `eleitorado_local_votacao_{ano}`

### 4. Perfil do Candidato (`/candidato/:id`)
**Arquivo**: `src/pages/CandidatoPerfil.tsx`
- Ficha biográfica completa (nome, partido, cargo, gênero, escolaridade, ocupação, CPF mascarado)
- Patrimônio total declarado + lista de bens
- Timeline de trajetória partidária (múltiplas eleições por CPF)
- Aba "Evolução Histórica" — candidaturas anteriores
- Aba "Força Territorial" — votos por Zona + Bairro + Escola com barras de dominância
- Aba "Evolução Patrimonial" — patrimônio ao longo dos anos
- **Dados**: `useDossieCandidato()` + `useHistoricoCandidato()` + `useEvolucaoPatrimonio()`

### 5. Converse com a IA (`/chat`)
**Arquivo**: `src/pages/ChatEleicoes.tsx`
- Chat interativo para consultas em linguagem natural
- Gera gráficos e tabelas automaticamente
- Favoritos salvos localmente
- Rate limiting integrado
- **Dados**: Edge Function `bd-eleicoes-chat` → MotherDuck

### 6. Relatórios (`/relatorios`)
Mesma tela do Chat, acessível por rota diferente.

---

## Filtros Globais (Zustand Store)

**Arquivo**: `src/stores/filterStore.ts`

| Filtro | Tipo | Descrição |
|--------|------|-----------|
| `ano` | number | Ano da eleição (2014-2024) |
| `municipio` | string | Nome do município |
| `cargo` | string | Cargo disputado |
| `turno` | number | 1 ou 2 |
| `partido` | string | Sigla do partido |
| `zona` | number | Número da zona eleitoral |
| `bairro` | string | Nome do bairro (cascata da zona) |
| `escola` | string | Nome do local de votação (cascata do bairro) |

**Cascata geográfica**: Município → Zona → Bairro → Escola

**Componente visual**: `src/components/eleicoes/GlobalFilters.tsx`

---

## Motor de Consultas (MotherDuck)

**Arquivo principal**: `src/lib/motherduck.ts`

### Roteador de Tabelas (`getTableName`)
Mapeia datasets para nomes reais de tabelas no MotherDuck:
- `candidatos` → `my_db.consulta_cand_{ano}_GO`
- `bens` → `my_db.bem_candidato_{ano}_GO`
- `votacao` → `my_db.votacao_candidato_munzona_{ano}_GO`
- `votacao_secao` → `my_db.votacao_secao_{ano}_GO`
- `eleitorado_local` → `my_db.eleitorado_local_votacao_{ano}` (nacional, filtro SG_UF='GO')
- E 20+ outros datasets

### Queries SQL (todas hardcoded, ZERO IA)
| Função | Descrição |
|--------|-----------|
| `sqlPainelCandidatos` | Ranking com votos (LEFT JOIN votação) |
| `sqlPerfilCandidato` | Dados biográficos por SQ ou CPF |
| `sqlBensCandidato` | Lista de bens declarados |
| `sqlPatrimonioCandidato` | Total de patrimônio |
| `sqlVotacaoPorZona` | Votos por zona (geo-aware) |
| `sqlVotacaoTerritorialDetalhada` | Votos por zona+bairro+escola |
| `sqlHistoricoCandidato` | UNION ALL de candidaturas por CPF |
| `sqlRankingPatrimonio` | Top patrimônios |
| `sqlComparecimento` | Comparecimento/abstenção (geo-aware) |
| `sqlRankingPartidos` | Partidos por votos (geo-aware) |
| `sqlLocaisVotacao` | Escolas agrupadas por local |
| `sqlSecoesLocal` | Seções de um local específico |
| `sqlVotosRegional` | Votos por zona+bairro+escola (geral) |
| `sqlVotosPorBairro` | Votos totais por bairro |
| `sqlEscolasPorBairro` | Escolas dentro de um bairro |

### Filtro Geográfico em Cascata (SQL)
Quando zona/bairro/escola estão ativos, o sistema:
1. Troca `votacao_candidato_munzona` por `votacao_secao` (granular)
2. Faz `INNER JOIN` com `eleitorado_local_votacao` usando `NR_ZONA + NR_SECAO`
3. Aplica `WHERE` dinâmico para bairro e escola

---

## Hooks de Dados

**Arquivo**: `src/hooks/useEleicoes.ts`

| Hook | Descrição |
|------|-----------|
| `usePainelGeral(limite)` | Ranking geral de candidatos |
| `useDossieCandidato(sq, ano)` | Perfil + bens + votação territorial |
| `useHistoricoCandidato(cpf)` | Candidaturas em múltiplos anos |
| `useRanking(search, page, sort)` | Ranking paginado (página principal) |
| `useLocaisVotacao()` | Escolas/locais de votação |
| `useSecoesLocal(local)` | Seções de um local |
| `useKPIs()` | Resumo da eleição |
| `useComparecimento()` | Comparecimento/abstenção |
| `useZonas/useBairros/useEscolas()` | Listas para filtros cascata |
| `useVotosRegional()` | Votos por zona+bairro+escola |
| `useMunicipios/usePartidos/useCargos()` | Listas para selects |

---

## Edge Functions (Supabase)

| Função | Descrição |
|--------|-----------|
| `query-motherduck` | Proxy: recebe SQL → executa no MotherDuck → retorna rows |
| `bd-eleicoes-chat` | Chat IA: NLU → gera SQL → executa → retorna dados + config visual |
| `bd-eleicoes-consulta-ia` | Consulta IA alternativa |

---

## Componentes Compartilhados

| Componente | Descrição |
|-----------|-----------|
| `AppSidebar` | Menu lateral com navegação |
| `GlobalFilters` | Barra de filtros globais sticky |
| `GeoFilterBadge` | Badge visual de filtros geográficos ativos |
| `VotosRegionalTable` | Tabela reutilizável de votos por região |
| `CandidatoAvatar` | Avatar com inicial colorida |
| `SituacaoBadge` | Badge de situação (Eleito, Não Eleito, etc.) |
| `Pagination` | Componente de paginação |
| `DynamicChartRenderer` | Renderizador de gráficos dinâmicos |

---

## Estrutura de Rotas

| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/` | Ranking | Página inicial — ranking de candidatos |
| `/zonas` | ZonasEleitorais | Módulo de zonas eleitorais |
| `/escolas` | EscolasEleitorais | Locais de votação |
| `/chat` | ChatEleicoes | Chat com IA |
| `/relatorios` | ChatEleicoes | Relatórios personalizados |
| `/candidato/:id` | CandidatoPerfil | Perfil completo do candidato |
| `/config` | Configuracoes | Configurações do sistema |
| `/ajuda` | Ajuda | Página de ajuda |

---

## Tecnologias

- **React 18** + **TypeScript 5** + **Vite 5**
- **Tailwind CSS v3** com tokens semânticos (HSL)
- **Zustand** para estado global de filtros
- **TanStack React Query** para cache e fetching
- **Recharts** para gráficos
- **Lucide React** para ícones
- **shadcn/ui** para componentes base
- **Supabase JS** para comunicação com backend

---

## Dados Disponíveis no MotherDuck

### Datasets principais (por ano):
- `candidatos` (2014-2024) — dados biográficos
- `bens` (2014-2024) — patrimônio declarado
- `votacao` (2014-2024) — votos por munzona
- `votacao_secao` (2014-2024) — votos granulares por seção
- `eleitorado_local` (2014-2024) — locais de votação + bairros
- `detalhe_munzona` (2014-2024) — comparecimento/abstenção
- `detalhe_secao` (2014-2024) — comparecimento por seção
- `receitas/despesas` (2014-2024) — finanças de campanha
- `perfil_eleitorado` (2014-2024) — perfil demográfico
- `coligacoes` (2014-2024) — coligações/federações
- `pesquisa_eleitoral` (2024) — pesquisas eleitorais

### Tabelas Supabase:
- `bd_eleicoes_candidatos` — cache de candidatos
- `bd_eleicoes_votacao` — cache de votação
- `bd_eleicoes_locais_votacao` — cache de locais
- `bd_eleicoes_comparecimento` — cache de comparecimento
- `bd_eleicoes_bens_candidatos` — cache de bens
