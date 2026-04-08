import { supabase } from '@/integrations/supabase/client';

// ═══════════════════════════════════════════════════════════════
// MOTHERDUCK — ROTEADOR ESTRITO DE TABELAS + QUERIES HARDCODED
// Regra: ZERO IA para SQL. Tudo é TypeScript determinístico.
// ═══════════════════════════════════════════════════════════════

/**
 * Execute SQL against MotherDuck via the query-motherduck edge function.
 */
export async function mdQuery<T = Record<string, any>>(sql: string): Promise<T[]> {
  const { data, error } = await supabase.functions.invoke('query-motherduck', {
    body: { query: sql },
  });
  if (error) throw new Error(error.message || 'Erro ao chamar MotherDuck');
  if (data?.error) throw new Error(data.error);
  return (data?.rows || []) as T[];
}

// ═══════════════════════════════════════════════════════════════
// 1. ROTEADOR DE TABELAS — getTableName()
//    Garante nomes 100% corretos. NUNCA invente tabelas.
// ═══════════════════════════════════════════════════════════════

/** Mapeamento dataset → nome real da tabela no MotherDuck */
const DATASET_MAP: Record<string, {
  prefix: string;
  anos: number[];
  sufixo: 'UF' | 'NACIONAL';  // UF = _GO, NACIONAL = sem sufixo de estado
}> = {
  // Candidatos
  candidatos:              { prefix: 'consulta_cand',              anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  candidatos_complementar: { prefix: 'consulta_cand_complementar', anos: [2022,2024],                     sufixo: 'UF' },
  bens:                    { prefix: 'bem_candidato',              anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  coligacoes:              { prefix: 'consulta_coligacao',         anos: [2014,2016,2018,2020,2024],      sufixo: 'UF' },
  vagas:                   { prefix: 'consulta_vagas',             anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  rede_social:             { prefix: 'rede_social_candidato',      anos: [2024],                          sufixo: 'UF' },
  cassacoes:               { prefix: 'cassacoes',                  anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },

  // Votação
  votacao:                 { prefix: 'votacao_candidato_munzona',  anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  votacao_partido:         { prefix: 'votacao_partido_munzona',    anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  votacao_secao:           { prefix: 'votacao_secao',              anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  detalhe_munzona:         { prefix: 'detalhe_votacao_munzona',    anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  detalhe_secao:           { prefix: 'detalhe_votacao_secao',      anos: [2014,2016,2020,2022,2024],      sufixo: 'UF' },

  // Eleitorado (NACIONAL — filtrar sg_uf='GO')
  eleitorado_local:        { prefix: 'eleitorado_local_votacao',   anos: [2014,2016,2018,2020,2024],      sufixo: 'NACIONAL' },
  perfil_eleitorado:       { prefix: 'perfil_eleitorado',          anos: [2014,2016,2018,2020,2024],      sufixo: 'NACIONAL' },

  // Finanças
  receitas:                { prefix: 'receitas_candidatos',                 anos: [2014,2018,2020,2022,2024], sufixo: 'UF' },
  receitas_doador:         { prefix: 'receitas_candidatos_doador_originario', anos: [2018,2020,2022,2024],    sufixo: 'UF' },
  despesas_contratadas:    { prefix: 'despesas_contratadas_candidatos',     anos: [2018,2020,2022,2024],      sufixo: 'UF' },
  despesas_pagas:          { prefix: 'despesas_pagas_candidatos',           anos: [2018,2020,2022,2024],      sufixo: 'UF' },

  // Pesquisas Eleitorais
  pesquisa_eleitoral:      { prefix: 'pesquisa_eleitoral',         anos: [2024],                          sufixo: 'UF' },
  pesquisa_contratante:    { prefix: 'pesquisa_contratante',       anos: [2024],                          sufixo: 'UF' },
};

/**
 * Retorna o nome exato da tabela no MotherDuck.
 * @param dataset - Chave do dataset (ex: 'candidatos', 'bens', 'votacao')
 * @param ano - Ano da eleição (ex: 2024)
 * @param uf - UF (default: 'GO'). Ignorado para tabelas nacionais.
 * @throws Se dataset ou ano inválido
 */
export function getTableName(dataset: string, ano: number, uf: string = 'GO'): string {
  const config = DATASET_MAP[dataset];
  if (!config) {
    throw new Error(`Dataset desconhecido: "${dataset}". Datasets válidos: ${Object.keys(DATASET_MAP).join(', ')}`);
  }
  if (!config.anos.includes(ano)) {
    throw new Error(`Ano ${ano} não disponível para "${dataset}". Anos válidos: ${config.anos.join(', ')}`);
  }
  if (config.sufixo === 'NACIONAL') {
    return `my_db.${config.prefix}_${ano}`;
  }
  return `my_db.${config.prefix}_${ano}_${uf}`;
}

/** Lista os anos disponíveis para um dataset */
export function getAnosDisponiveis(dataset: string): number[] {
  return DATASET_MAP[dataset]?.anos || [];
}

/** Lista todos os datasets disponíveis */
export function getDatasets(): string[] {
  return Object.keys(DATASET_MAP);
}

// ═══════════════════════════════════════════════════════════════
// 2. QUERIES SQL HARDCODED — ZERO IA
//    Cada função retorna uma string SQL pronta.
// ═══════════════════════════════════════════════════════════════

// ── Helper: WHERE clause builder ──
interface FiltrosPainel {
  ano?: number;
  municipio?: string;
  cargo?: string;
  partido?: string;
  turno?: number;
  genero?: string;
  situacao?: string;
  limite?: number;
}

function buildWhereClause(filtros: FiltrosPainel, campoMunicipio = 'NM_UE'): string {
  const conds: string[] = [];
  if (filtros.municipio) conds.push(`${campoMunicipio} = '${filtros.municipio}'`);
  if (filtros.cargo) conds.push(`DS_CARGO ILIKE '%${filtros.cargo}%'`);
  if (filtros.partido) conds.push(`SG_PARTIDO = '${filtros.partido}'`);
  if (filtros.turno) conds.push(`NR_TURNO = ${filtros.turno}`);
  if (filtros.genero) conds.push(`DS_GENERO = '${filtros.genero}'`);
  if (filtros.situacao) conds.push(`DS_SIT_TOT_TURNO ILIKE '%${filtros.situacao}%'`);
  return conds.length ? `WHERE ${conds.join(' AND ')}` : '';
}

// ── QUERY PRINCIPAL (PAINEL): candidatos + votos ──

/**
 * Query do Painel: SELECT em consulta_cand LEFT JOIN votacao_candidato_munzona
 * usando SQ_CANDIDATO como chave. Retorna candidato, partido, cargo, votos, situação.
 */
export function sqlPainelCandidatos(filtros: FiltrosPainel = {}): string {
  const ano = filtros.ano || 2024;
  const cand = getTableName('candidatos', ano);
  const vot = getTableName('votacao', ano);
  const limit = filtros.limite || 100;

  const conds: string[] = [];
  if (filtros.municipio) conds.push(`c.NM_UE = '${filtros.municipio}'`);
  if (filtros.cargo) conds.push(`c.DS_CARGO ILIKE '%${filtros.cargo}%'`);
  if (filtros.partido) conds.push(`c.SG_PARTIDO = '${filtros.partido}'`);
  if (filtros.turno) conds.push(`c.NR_TURNO = ${filtros.turno}`);
  if (filtros.genero) conds.push(`c.DS_GENERO = '${filtros.genero}'`);
  if (filtros.situacao) conds.push(`c.DS_SIT_TOT_TURNO ILIKE '%${filtros.situacao}%'`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  return `
    SELECT
      c.NM_URNA_CANDIDATO AS candidato,
      c.NM_CANDIDATO AS nome_completo,
      c.SG_PARTIDO AS partido,
      c.DS_CARGO AS cargo,
      c.NM_UE AS municipio,
      c.DS_SIT_TOT_TURNO AS situacao,
      c.DS_GENERO AS genero,
      c.DS_GRAU_INSTRUCAO AS escolaridade,
      c.DS_OCUPACAO AS ocupacao,
      c.SQ_CANDIDATO AS sq_candidato,
      c.NR_CANDIDATO AS numero,
      COALESCE(SUM(v.QT_VOTOS_NOMINAIS), 0) AS total_votos
    FROM ${cand} c
    LEFT JOIN ${vot} v ON c.SQ_CANDIDATO = v.SQ_CANDIDATO
    ${where}
    GROUP BY c.NM_URNA_CANDIDATO, c.NM_CANDIDATO, c.SG_PARTIDO, c.DS_CARGO,
             c.NM_UE, c.DS_SIT_TOT_TURNO, c.DS_GENERO, c.DS_GRAU_INSTRUCAO,
             c.DS_OCUPACAO, c.SQ_CANDIDATO, c.NR_CANDIDATO
    ORDER BY total_votos DESC
    LIMIT ${limit}
  `.trim();
}

// ── QUERY DO DOSSIÊ (PERFIL DO CANDIDATO) ──

/** Busca dados pessoais do candidato por SQ_CANDIDATO ou CPF */
export function sqlPerfilCandidato(ano: number, identificador: { sq?: string; cpf?: string }): string {
  const cand = getTableName('candidatos', ano);
  const filtro = identificador.sq
    ? `SQ_CANDIDATO = '${identificador.sq}'`
    : `NR_CPF_CANDIDATO = '${identificador.cpf}'`;

  return `
    SELECT
      NM_URNA_CANDIDATO AS candidato,
      NM_CANDIDATO AS nome_completo,
      SG_PARTIDO AS partido,
      NM_PARTIDO AS nome_partido,
      DS_CARGO AS cargo,
      NM_UE AS municipio,
      NR_CANDIDATO AS numero,
      DS_SIT_TOT_TURNO AS situacao,
      DS_GENERO AS genero,
      DS_GRAU_INSTRUCAO AS escolaridade,
      DS_OCUPACAO AS ocupacao,
      DS_COR_RACA AS cor_raca,
      DS_ESTADO_CIVIL AS estado_civil,
      DT_NASCIMENTO AS data_nascimento,
      SG_UF_NASCIMENTO AS uf_nascimento,
      SQ_CANDIDATO AS sq_candidato,
      NR_CPF_CANDIDATO AS cpf,
      DS_SITUACAO_CANDIDATURA AS situacao_candidatura
    FROM ${cand}
    WHERE ${filtro}
    LIMIT 1
  `.trim();
}

/** Bens do candidato (JOIN via SQ_CANDIDATO) */
export function sqlBensCandidato(ano: number, sqCandidato: string): string {
  const bens = getTableName('bens', ano);

  return `
    SELECT
      NR_ORDEM_BEM_CANDIDATO AS ordem,
      DS_TIPO_BEM_CANDIDATO AS tipo,
      DS_BEM_CANDIDATO AS descricao,
      CAST(REPLACE(VR_BEM_CANDIDATO, ',', '.') AS DOUBLE) AS valor
    FROM ${bens}
    WHERE SQ_CANDIDATO = '${sqCandidato}'
    ORDER BY valor DESC
  `.trim();
}

/** Total de patrimônio do candidato */
export function sqlPatrimonioCandidato(ano: number, sqCandidato: string): string {
  const bens = getTableName('bens', ano);

  return `
    SELECT
      COUNT(*) AS total_bens,
      SUM(CAST(REPLACE(VR_BEM_CANDIDATO, ',', '.') AS DOUBLE)) AS patrimonio_total
    FROM ${bens}
    WHERE SQ_CANDIDATO = '${sqCandidato}'
  `.trim();
}

/** Histórico de votação por zona (MunZona) */
export function sqlVotacaoPorZona(ano: number, sqCandidato: string): string {
  const vot = getTableName('votacao', ano);

  return `
    SELECT
      NR_ZONA AS zona,
      NM_MUNICIPIO AS municipio,
      SUM(QT_VOTOS_NOMINAIS) AS total_votos
    FROM ${vot}
    WHERE SQ_CANDIDATO = '${sqCandidato}'
    GROUP BY NR_ZONA, NM_MUNICIPIO
    ORDER BY total_votos DESC
  `.trim();
}

/** Histórico do candidato em múltiplas eleições (por CPF) */
export function sqlHistoricoCandidato(cpf: string, anosParam?: number[]): string {
  const anos = anosParam || [2014, 2016, 2018, 2020, 2022, 2024];
  const unions = anos.map(a => {
    const cand = getTableName('candidatos', a);
    return `SELECT
      ${a} AS ano,
      NM_URNA_CANDIDATO AS candidato,
      SG_PARTIDO AS partido,
      DS_CARGO AS cargo,
      NM_UE AS municipio,
      DS_SIT_TOT_TURNO AS situacao,
      SQ_CANDIDATO AS sq_candidato
    FROM ${cand}
    WHERE NR_CPF_CANDIDATO = '${cpf}'`;
  });

  return `SELECT * FROM (${unions.join(' UNION ALL ')}) ORDER BY ano DESC`;
}

// ── QUERIES AGREGADAS ──

/** Ranking de patrimônio dos candidatos */
export function sqlRankingPatrimonio(filtros: FiltrosPainel = {}): string {
  const ano = filtros.ano || 2024;
  const cand = getTableName('candidatos', ano);
  const bens = getTableName('bens', ano);
  const limit = filtros.limite || 20;

  const conds: string[] = [];
  if (filtros.municipio) conds.push(`c.NM_UE = '${filtros.municipio}'`);
  if (filtros.cargo) conds.push(`c.DS_CARGO ILIKE '%${filtros.cargo}%'`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  return `
    SELECT
      c.NM_URNA_CANDIDATO AS candidato,
      c.SG_PARTIDO AS partido,
      c.DS_CARGO AS cargo,
      c.NM_UE AS municipio,
      SUM(CAST(REPLACE(b.VR_BEM_CANDIDATO, ',', '.') AS DOUBLE)) AS patrimonio
    FROM ${bens} b
    JOIN ${cand} c ON b.SQ_CANDIDATO = c.SQ_CANDIDATO
    ${where}
    GROUP BY c.NM_URNA_CANDIDATO, c.SG_PARTIDO, c.DS_CARGO, c.NM_UE
    ORDER BY patrimonio DESC
    LIMIT ${limit}
  `.trim();
}

/** Comparecimento e abstenção por município */
export function sqlComparecimento(filtros: FiltrosPainel = {}): string {
  const ano = filtros.ano || 2024;
  const comp = getTableName('detalhe_munzona', ano);

  const conds: string[] = [];
  if (filtros.municipio) conds.push(`NM_MUNICIPIO = '${filtros.municipio}'`);
  if (filtros.turno) conds.push(`NR_TURNO = ${filtros.turno}`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  return `
    SELECT
      NM_MUNICIPIO AS municipio,
      SUM(QT_APTOS) AS eleitores,
      SUM(QT_COMPARECIMENTO) AS comparecimento,
      SUM(QT_ABSTENCOES) AS abstencoes,
      ROUND(SUM(QT_COMPARECIMENTO) * 100.0 / NULLIF(SUM(QT_APTOS), 0), 1) AS taxa_comparecimento
    FROM ${comp}
    ${where}
    GROUP BY NM_MUNICIPIO
    ORDER BY eleitores DESC
    LIMIT 50
  `.trim();
}

/** Ranking de partidos por votos */
export function sqlRankingPartidos(filtros: FiltrosPainel = {}): string {
  const ano = filtros.ano || 2024;
  const vp = getTableName('votacao_partido', ano);
  const limit = filtros.limite || 20;

  const conds: string[] = [];
  if (filtros.municipio) conds.push(`NM_MUNICIPIO = '${filtros.municipio}'`);
  if (filtros.cargo) conds.push(`DS_CARGO ILIKE '%${filtros.cargo}%'`);
  if (filtros.turno) conds.push(`NR_TURNO = ${filtros.turno}`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  return `
    SELECT
      SG_PARTIDO AS partido,
      NM_PARTIDO AS nome_partido,
      SUM(QT_VOTOS_NOMINAIS_VALIDOS) AS votos_nominais,
      SUM(QT_VOTOS_LEGENDA_VALIDOS) AS votos_legenda
    FROM ${vp}
    ${where}
    GROUP BY SG_PARTIDO, NM_PARTIDO
    ORDER BY votos_nominais DESC
    LIMIT ${limit}
  `.trim();
}

/** Distribuição de candidatos por gênero */
export function sqlDistribuicaoGenero(filtros: FiltrosPainel = {}): string {
  const ano = filtros.ano || 2024;
  const cand = getTableName('candidatos', ano);
  const where = buildWhereClause(filtros);

  return `
    SELECT DS_GENERO AS genero, COUNT(*) AS total
    FROM ${cand} ${where}
    GROUP BY DS_GENERO ORDER BY total DESC
  `.trim();
}

/** Distribuição de candidatos por escolaridade */
export function sqlDistribuicaoEscolaridade(filtros: FiltrosPainel = {}): string {
  const ano = filtros.ano || 2024;
  const cand = getTableName('candidatos', ano);
  const where = buildWhereClause(filtros);

  return `
    SELECT DS_GRAU_INSTRUCAO AS escolaridade, COUNT(*) AS total
    FROM ${cand} ${where}
    GROUP BY DS_GRAU_INSTRUCAO ORDER BY total DESC
  `.trim();
}

/** Locais de votação agrupados por escola */
export function sqlLocaisVotacao(ano: number, municipio: string): string {
  const tab = getTableName('eleitorado_local', ano);
  return `
    SELECT
      NM_LOCAL_VOTACAO AS local_votacao,
      NR_ZONA AS zona,
      NM_BAIRRO AS bairro,
      DS_ENDERECO AS endereco,
      COUNT(DISTINCT NR_SECAO) AS secoes,
      SUM(QT_ELEITORES_PERFIL) AS eleitores
    FROM ${tab}
    WHERE SG_UF = 'GO'
      AND NM_MUNICIPIO = '${municipio}'
      AND NM_LOCAL_VOTACAO IS NOT NULL AND NM_LOCAL_VOTACAO != ''
    GROUP BY NM_LOCAL_VOTACAO, NR_ZONA, NM_BAIRRO, DS_ENDERECO
    ORDER BY eleitores DESC
  `.trim();
}

/** Seções de um local de votação específico */
export function sqlSecoesLocal(ano: number, municipio: string, localVotacao: string): string {
  const tab = getTableName('eleitorado_local', ano);
  return `
    SELECT
      NR_SECAO AS secao,
      NR_ZONA AS zona,
      SUM(QT_ELEITORES_PERFIL) AS eleitores
    FROM ${tab}
    WHERE SG_UF = 'GO'
      AND NM_MUNICIPIO = '${municipio}'
      AND NM_LOCAL_VOTACAO = '${localVotacao}'
    GROUP BY NR_SECAO, NR_ZONA
    ORDER BY NR_SECAO
  `.trim();
}

/** Eleitores por bairro (tabela nacional, filtrar GO) */
export function sqlEleitoresPorBairro(ano: number, municipio: string): string {
  const tab = getTableName('eleitorado_local', ano);

  return `
    SELECT
      NM_BAIRRO AS bairro,
      COUNT(DISTINCT NM_LOCAL_VOTACAO) AS locais,
      SUM(QT_ELEITORES_PERFIL) AS eleitores
    FROM ${tab}
    WHERE SG_UF = 'GO'
      AND NM_MUNICIPIO = '${municipio}'
      AND NM_BAIRRO IS NOT NULL AND NM_BAIRRO != ''
    GROUP BY NM_BAIRRO
    ORDER BY eleitores DESC
    LIMIT 30
  `.trim();
}

/** Evolução histórica do comparecimento em um município */
export function sqlEvolucaoComparecimento(municipio: string): string {
  const anos = getAnosDisponiveis('detalhe_munzona');
  const unions = anos.map(a => {
    const tab = getTableName('detalhe_munzona', a);
    return `SELECT ${a} AS ano, SUM(QT_APTOS) AS eleitores, SUM(QT_COMPARECIMENTO) AS comparecimento
      FROM ${tab} WHERE NM_MUNICIPIO = '${municipio}' AND NR_TURNO = 1`;
  });

  return `SELECT * FROM (${unions.join(' UNION ALL ')}) ORDER BY ano`;
}

/** Resumo geral de uma eleição */
export function sqlResumoEleicao(filtros: FiltrosPainel = {}): string {
  const ano = filtros.ano || 2024;
  const cand = getTableName('candidatos', ano);
  const where = buildWhereClause(filtros);

  return `
    SELECT
      COUNT(*) AS total_candidatos,
      COUNT(CASE WHEN DS_SIT_TOT_TURNO ILIKE '%ELEITO%' AND DS_SIT_TOT_TURNO NOT ILIKE '%NÃO ELEITO%' THEN 1 END) AS eleitos,
      COUNT(CASE WHEN DS_GENERO = 'FEMININO' THEN 1 END) AS mulheres,
      COUNT(DISTINCT SG_PARTIDO) AS partidos,
      COUNT(DISTINCT NM_UE) AS municipios
    FROM ${cand} ${where}
  `.trim();
}

// ═══════════════════════════════════════════════════════════════
// 3. RE-EXPORTS LEGADOS (compatibilidade com código existente)
// ═══════════════════════════════════════════════════════════════

/** @deprecated Use getTableName('candidatos', ano) */
export const MD = {
  candidatos: (ano?: number | null) => ano ? getTableName('candidatos', ano) : _unionAll('candidatos'),
  bens: (ano?: number | null) => ano ? getTableName('bens', ano) : _unionAll('bens'),
  votacao: (ano?: number | null) => ano ? getTableName('votacao', ano) : _unionAll('votacao'),
  votacaoPartido: (ano?: number | null) => ano ? getTableName('votacao_partido', ano) : _unionAll('votacao_partido'),
  votacaoSecao: (ano: number) => getTableName('votacao_secao', ano),
  detalheVotacaoMunzona: (ano?: number | null) => ano ? getTableName('detalhe_munzona', ano) : _unionAll('detalhe_munzona'),
  detalheVotacaoSecao: (ano?: number | null) => ano ? getTableName('detalhe_secao', ano) : _unionAll('detalhe_secao'),
  comparecimento: (ano?: number | null) => ano ? getTableName('detalhe_munzona', ano) : _unionAll('detalhe_munzona'),
  perfilEleitorado: (ano?: number | null) => ano ? getTableName('perfil_eleitorado', ano) : _unionAll('perfil_eleitorado'),
  eleitoradoLocal: (ano?: number | null) => ano ? getTableName('eleitorado_local', ano) : _unionAll('eleitorado_local'),
  receitas: (ano?: number | null) => ano ? getTableName('receitas', ano) : _unionAll('receitas'),
  despesasContratadas: (ano?: number | null) => ano ? getTableName('despesas_contratadas', ano) : _unionAll('despesas_contratadas'),
  despesasPagas: (ano?: number | null) => ano ? getTableName('despesas_pagas', ano) : _unionAll('despesas_pagas'),
  coligacoes: (ano?: number | null) => ano ? getTableName('coligacoes', ano) : _unionAll('coligacoes'),
  vagas: (ano?: number | null) => ano ? getTableName('vagas', ano) : _unionAll('vagas'),
  comparecimentoSecao: (ano?: number | null) => ano ? getTableName('detalhe_secao', ano) : _unionAll('detalhe_secao'),
} as const;

function _unionAll(dataset: string): string {
  const config = DATASET_MAP[dataset];
  if (!config) return '';
  const unions = config.anos.map(a => {
    const table = config.sufixo === 'NACIONAL'
      ? `my_db.${config.prefix}_${a}`
      : `my_db.${config.prefix}_${a}_GO`;
    return `SELECT * FROM ${table}`;
  });
  return `(${unions.join(' UNION ALL ')})`;
}

// Re-export anos para compatibilidade
export const CAND_ANOS = DATASET_MAP.candidatos.anos;
export const BENS_ANOS = DATASET_MAP.bens.anos;
export const VOTACAO_MUNZONA_ANOS = DATASET_MAP.votacao.anos;
export const VOTACAO_PARTIDO_ANOS = DATASET_MAP.votacao_partido.anos;
export const VOTACAO_SECAO_ANOS = DATASET_MAP.votacao_secao.anos;
export const DETALHE_VOTACAO_MUNZONA_ANOS = DATASET_MAP.detalhe_munzona.anos;
export const DETALHE_VOTACAO_SECAO_ANOS = DATASET_MAP.detalhe_secao.anos;
export const COLIGACAO_ANOS = DATASET_MAP.coligacoes.anos;
export const VAGAS_ANOS = DATASET_MAP.vagas.anos;
export const PERFIL_ELEITORADO_ANOS = DATASET_MAP.perfil_eleitorado.anos;
export const ELEITORADO_LOCAL_ANOS = DATASET_MAP.eleitorado_local.anos;
export const RECEITAS_CAND_ANOS = DATASET_MAP.receitas.anos;
export const DESPESAS_CONTRATADAS_ANOS = DATASET_MAP.despesas_contratadas.anos;
export const DESPESAS_PAGAS_ANOS = DATASET_MAP.despesas_pagas.anos;
export const COMP_ANOS = DATASET_MAP.detalhe_munzona.anos;
export const PERFIL_ELEITOR_SECAO_ANOS = [2014, 2016, 2018, 2020, 2024];
export const PESQUISA_ELEITORAL_ANOS = [2024];
export const PESQUISA_CONTRATANTE_ANOS = [2024];

/** Column mapping TSE → app concepts */
export const COL = {
  ano: 'ANO_ELEICAO',
  turno: 'NR_TURNO',
  nomeCompleto: 'NM_CANDIDATO',
  nomeUrna: 'NM_URNA_CANDIDATO',
  partido: 'SG_PARTIDO',
  nomePartido: 'NM_PARTIDO',
  cargo: 'DS_CARGO',
  municipio: 'NM_UE',
  genero: 'DS_GENERO',
  escolaridade: 'DS_GRAU_INSTRUCAO',
  ocupacao: 'DS_OCUPACAO',
  situacaoFinal: 'DS_SIT_TOT_TURNO',
  sequencial: 'SQ_CANDIDATO',
  numero: 'NR_CANDIDATO',
  cpf: 'NR_CPF_CANDIDATO',
  nascimento: 'DT_NASCIMENTO',
  ufNascimento: 'SG_UF_NASCIMENTO',
  corRaca: 'DS_COR_RACA',
  situacaoCandidatura: 'DS_SITUACAO_CANDIDATURA',
  estadoCivil: 'DS_ESTADO_CIVIL',
  tipoBem: 'DS_TIPO_BEM_CANDIDATO',
  descBem: 'DS_BEM_CANDIDATO',
  valorBem: 'VR_BEM_CANDIDATO',
  valorBemNum: "CAST(REPLACE(VR_BEM_CANDIDATO, ',', '.') AS DOUBLE)",
  ordemBem: 'NR_ORDEM_BEM_CANDIDATO',
  zona: 'NR_ZONA',
  secao: 'NR_SECAO',
  votos: 'QT_VOTOS_NOMINAIS',
  nmMunicipio: 'NM_MUNICIPIO',
  aptos: 'QT_APTOS',
  comp: 'QT_COMPARECIMENTO',
  abst: 'QT_ABSTENCOES',
  brancos: 'QT_VOTOS_BRANCOS',
  nulos: 'QT_VOTOS_NULOS',
} as const;
