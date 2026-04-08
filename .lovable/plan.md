## Reformulação do Perfil de Candidatos

### 1. Página `/candidatos` (PerfilCandidatos.tsx)
- Renomear para "Painel de Candidatos"
- **Primeiro dado**: Composição de votos (totais, por zona, bairro, escola)
- **Busca rápida**: campo de busca para filtrar por zona, setor ou escola
- Cards de candidato clicáveis que levam ao perfil completo

### 2. Página `/candidato/:id` (CandidatoPerfil.tsx) — Reformulação total
Ordem das seções:

**a) Cabeçalho do candidato** (dashboard visual)
- Nome de urna, partido, cargo, número, situação
- Dados pessoais legíveis: gênero, idade, escolaridade, ocupação, estado civil, cor/raça
- Patrimônio total e nº de bens como KPIs
- **ZERO nomes de tabelas** — tudo traduzido para linguagem humana

**b) Composição de Votos** (já existe, manter)
- Busca por zona/bairro/escola
- KPIs + tabelas de bairros, zonas, escolas

**c) Histórico Eleitoral** (reformulado)
- Timeline visual: ano → cargo → partido → município → votos → situação
- Para cada eleição passada: total de votos + distribuição por zona
- Mostra evolução partidária (trocou de partido?)

**d) Patrimônio** (accordion colapsável)
- Lista de bens com tipo, descrição, valor

**e) Finanças — Receitas e Despesas**
- Receitas com doador, origem, valor (já existe)
- **REMOVER**: cards de "Finanças (tabelas completas)" com nomes de tabela (imagem 3)

**f) Redes Sociais** (mostrar links reais, não contagem)

**g) REMOVER**: 
- Seção "Risco e Presença Digital" com contagem de registros (imagem 3)
- Chat de Contexto (imagem 4)
- RecordGrid com "todas as colunas" (dados brutos)
- LinkedIn Político (substituído pelo cabeçalho humanizado)
- Toda referência a nomes de tabelas/fontes técnicas

### 3. Renomear na sidebar
- Manter "Candidatos" como nome do módulo