import { supabase } from '@/integrations/supabase/client';

// ═══════════════════════════════════════════════════════════════
// MOTHERDUCK — ROTEADOR ESTRITO DE TABELAS + QUERIES HARDCODED
// Regra: ZERO IA para SQL. Tudo é TypeScript determinístico.
// ═══════════════════════════════════════════════════════════════

/** Sanitize a string for safe SQL interpolation (escape single quotes) */
export function sqlSafe(value: string): string {
  return value.replace(/'/g, "''").replace(/\\/g, '\\\\').replace(/;/g, '');
}

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
  candidatos_complementar: { prefix: 'consulta_cand_complementar', anos: [2020,2022,2024],                sufixo: 'UF' },
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
  boletim_urna:            { prefix: 'boletim_urna',               anos: [2014,2018,2020,2022,2024],      sufixo: 'UF' },

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
  zona?: number;
  bairro?: string;
  escola?: string;
  limite?: number;
}

/** Returns true if this is a general (state/federal) election year */
export function isEleicaoGeral(ano: number): boolean {
  return [2014, 2018, 2022].includes(ano);
}

/** Check if any geo filter (zona/bairro/escola) is active */
function needsGeoJoin(f: FiltrosPainel): boolean {
  return !!(f.zona || f.bairro || f.escola);
}

/** Build the INNER JOIN + WHERE conditions for geographic filtering */
function buildGeoJoin(f: FiltrosPainel, votAlias = 'v', locAlias = 'loc'): { join: string; conds: string[] } {
  if (!needsGeoJoin(f)) return { join: '', conds: [] };
  const ano = f.ano || 2024;
  const anosLocal = getAnosDisponiveis('eleitorado_local');
  const anoLocal = anosLocal.includes(ano) ? ano : [...anosLocal].sort((a, b) => Math.abs(a - ano) - Math.abs(b - ano))[0] || 2024;
  const loc = getTableName('eleitorado_local', anoLocal);
  const join = `INNER JOIN ${loc} ${locAlias} ON ${votAlias}.NR_ZONA = ${locAlias}.NR_ZONA AND ${votAlias}.NR_SECAO = ${locAlias}.NR_SECAO AND ${locAlias}.SG_UF = 'GO' AND ${locAlias}.NM_MUNICIPIO = '${sqlSafe(f.municipio || '')}'`;
  const conds: string[] = [];
  if (f.zona) conds.push(`${votAlias}.NR_ZONA = ${Number(f.zona)}`);
  if (f.bairro) conds.push(`${locAlias}.NM_BAIRRO = '${sqlSafe(f.bairro)}'`);
  if (f.escola) conds.push(`${locAlias}.NM_LOCAL_VOTACAO = '${sqlSafe(f.escola)}'`);
  return { join, conds };
}

function buildWhereClause(filtros: FiltrosPainel, campoMunicipio = 'NM_UE'): string {
  const conds: string[] = [];
  const ano = filtros.ano || 2024;
  // For general elections, don't filter candidate origin by municipality
  if (filtros.municipio && !isEleicaoGeral(ano)) conds.push(`${campoMunicipio} = '${sqlSafe(filtros.municipio)}'`);
  if (filtros.cargo) conds.push(`DS_CARGO ILIKE '%${sqlSafe(filtros.cargo)}%'`);
  if (filtros.partido) conds.push(`SG_PARTIDO = '${sqlSafe(filtros.partido)}'`);
  if (filtros.turno) conds.push(`NR_TURNO = ${Number(filtros.turno)}`);
  if (filtros.genero) conds.push(`DS_GENERO = '${sqlSafe(filtros.genero)}'`);
  if (filtros.situacao) conds.push(`DS_SIT_TOT_TURNO ILIKE '%${sqlSafe(filtros.situacao)}%'`);
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
  const limit = filtros.limite || 100;
  const geral = isEleicaoGeral(ano);

  // votacao_candidato_munzona always has SQ_CANDIDATO; votacao_secao does NOT
  const vot = getTableName('votacao', ano);

  const conds: string[] = [];
  if (filtros.municipio && !geral) conds.push(`c.NM_UE = '${sqlSafe(filtros.municipio)}'`);
  if (filtros.municipio && geral) conds.push(`v.NM_MUNICIPIO = '${sqlSafe(filtros.municipio)}'`);
  if (filtros.cargo) conds.push(`c.DS_CARGO ILIKE '%${sqlSafe(filtros.cargo)}%'`);
  if (filtros.partido) conds.push(`c.SG_PARTIDO = '${sqlSafe(filtros.partido)}'`);
  if (filtros.turno) conds.push(`c.NR_TURNO = ${Number(filtros.turno)}`);
  if (filtros.genero) conds.push(`c.DS_GENERO = '${sqlSafe(filtros.genero)}'`);
  if (filtros.situacao) conds.push(`c.DS_SIT_TOT_TURNO ILIKE '%${sqlSafe(filtros.situacao)}%'`);

  // Geo filters: zone can be applied on votacao_candidato_munzona directly
  if (filtros.zona) conds.push(`v.NR_ZONA = ${filtros.zona}`);

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

/** Histórico de votação por zona (MunZona) — always uses votacao_candidato_munzona which HAS SQ_CANDIDATO */
export function sqlVotacaoPorZona(ano: number, sqCandidato: string, filtros?: FiltrosPainel): string {
  const vot = getTableName('votacao', ano);

  const conds: string[] = [`v.SQ_CANDIDATO = '${sqlSafe(sqCandidato)}'`];
  if (filtros?.municipio && !isEleicaoGeral(ano)) conds.push(`v.NM_MUNICIPIO = '${sqlSafe(filtros.municipio)}'`);
  if (filtros?.zona) conds.push(`v.NR_ZONA = ${Number(filtros.zona)}`);
  const where = `WHERE ${conds.join(' AND ')}`;

  return `
    SELECT
      v.NR_ZONA AS zona,
      v.NM_MUNICIPIO AS municipio,
      SUM(v.QT_VOTOS_NOMINAIS) AS total_votos
    FROM ${vot} v
    ${where}
    GROUP BY v.NR_ZONA, v.NM_MUNICIPIO
    ORDER BY total_votos DESC
  `.trim();
}

/** Votação detalhada por zona do candidato — uses votacao_candidato_munzona (has SQ_CANDIDATO) */
export function sqlVotacaoTerritorialDetalhada(ano: number, sqCandidato: string, filtros?: FiltrosPainel): string {
  const vot = getTableName('votacao', ano);

  const conds: string[] = [`v.SQ_CANDIDATO = '${sqlSafe(sqCandidato)}'`];
  if (filtros?.municipio && !isEleicaoGeral(ano)) conds.push(`v.NM_MUNICIPIO = '${sqlSafe(filtros.municipio)}'`);
  if (filtros?.zona) conds.push(`v.NR_ZONA = ${Number(filtros.zona)}`);
  const where = `WHERE ${conds.join(' AND ')}`;

  return `
    SELECT
      v.NR_ZONA AS zona,
      v.NM_MUNICIPIO AS municipio,
      SUM(v.QT_VOTOS_NOMINAIS) AS total_votos
    FROM ${vot} v
    ${where}
    GROUP BY v.NR_ZONA, v.NM_MUNICIPIO
    ORDER BY total_votos DESC
    LIMIT 200
  `.trim();
}

function buildSecaoMetadataSubquery(ano: number, municipio?: string | null): string | null {
  const municipioSafe = municipio?.replace(/'/g, "''");
  const municipioFilter = municipioSafe ? `AND NM_MUNICIPIO = '${municipioSafe}'` : '';

  // Try eleitorado_local for the exact year first
  const anosLocal = getAnosDisponiveis('eleitorado_local');
  let anoLocal: number | null = null;
  if (anosLocal.includes(ano)) {
    anoLocal = ano;
  } else {
    // Fallback: use the closest available year's eleitorado_local (bairros don't change much)
    const sorted = [...anosLocal].sort((a, b) => Math.abs(a - ano) - Math.abs(b - ano));
    if (sorted.length > 0) anoLocal = sorted[0];
  }

  if (anoLocal !== null) {
    const loc = getTableName('eleitorado_local', anoLocal);
    return `
      SELECT
        NM_MUNICIPIO,
        NR_ZONA,
        NR_SECAO,
        MAX(COALESCE(NM_BAIRRO, 'NÃO INFORMADO')) AS NM_BAIRRO,
        MAX(COALESCE(NM_LOCAL_VOTACAO, 'NÃO INFORMADO')) AS NM_LOCAL_VOTACAO
      FROM ${loc}
      WHERE SG_UF = 'GO'
        ${municipioFilter}
      GROUP BY NM_MUNICIPIO, NR_ZONA, NR_SECAO
    `.trim();
  }

  if (getAnosDisponiveis('detalhe_secao').includes(ano)) {
    const detalheSecao = getTableName('detalhe_secao', ano);
    return `
      SELECT
        NM_MUNICIPIO,
        NR_ZONA,
        NR_SECAO,
        'NÃO INFORMADO' AS NM_BAIRRO,
        MAX(COALESCE(NM_LOCAL_VOTACAO, 'NÃO INFORMADO')) AS NM_LOCAL_VOTACAO
      FROM ${detalheSecao}
      WHERE 1=1
        ${municipioFilter}
      GROUP BY NM_MUNICIPIO, NR_ZONA, NR_SECAO
    `.trim();
  }

  return null;
}

function sqlTextValue(expr: string): string {
  return `TRIM(REPLACE(CAST(${expr} AS VARCHAR), '"', ''))`;
}

function sqlIntValue(expr: string): string {
  return `CAST(NULLIF(${sqlTextValue(expr)}, '') AS BIGINT)`;
}

function buildBoletimNormalizadoSubquery(ano: number): string | null {
  if (!getAnosDisponiveis('boletim_urna').includes(ano)) return null;

  const bu = getTableName('boletim_urna', ano);

  if (ano === 2014) {
    return `
      SELECT
        CAST(column07 AS BIGINT) AS nr_zona,
        CAST(column08 AS BIGINT) AS nr_secao,
        TRIM(CAST(column13 AS VARCHAR)) AS nm_municipio,
        TRIM(CAST(column06 AS VARCHAR)) AS ds_cargo_pergunta,
        CAST(column21 AS BIGINT) AS nr_votavel,
        CAST(column23 AS BIGINT) AS qt_votos,
        CASE CAST(column24 AS BIGINT)
          WHEN 1 THEN 'Nominal'
          WHEN 2 THEN 'Branco'
          WHEN 3 THEN 'Nulo'
          ELSE 'Outro'
        END AS ds_tipo_votavel
      FROM ${bu}
    `.trim();
  }

  return `
    SELECT
      ${sqlIntValue('nr_zona')} AS nr_zona,
      ${sqlIntValue('nr_secao')} AS nr_secao,
      ${sqlTextValue('nm_municipio')} AS nm_municipio,
      ${sqlTextValue('ds_cargo_pergunta')} AS ds_cargo_pergunta,
      ${sqlIntValue('nr_votavel')} AS nr_votavel,
      ${sqlIntValue('qt_votos')} AS qt_votos,
      ${sqlTextValue('ds_tipo_votavel')} AS ds_tipo_votavel
    FROM ${bu}
  `.trim();
}

function buildBoletimCargoCondition(alias: string, cargo?: string | null): string {
  if (!cargo) return '';
  const cargoSafe = cargo.replace(/'/g, "''");
  // Vice-prefeito/vice-governador shares the same ballot entry as the titular
  const upper = cargoSafe.toUpperCase();
  if (upper.startsWith('VICE-') || upper.startsWith('VICE ')) {
    const titularCargo = cargoSafe.replace(/^VICE[- ]/i, '');
    return `AND (UPPER(COALESCE(${alias}.ds_cargo_pergunta, '')) = UPPER('${cargoSafe}') OR UPPER(COALESCE(${alias}.ds_cargo_pergunta, '')) = UPPER('${titularCargo}'))`;
  }
  return `AND UPPER(COALESCE(${alias}.ds_cargo_pergunta, '')) = UPPER('${cargoSafe}')`;
}

function buildBoletimMunicipioCondition(alias: string, ano: number, municipio?: string | null): string {
  if (!municipio || isEleicaoGeral(ano)) return '';
  const municipioSafe = municipio.replace(/'/g, "''");
  return `AND ${alias}.nm_municipio = '${municipioSafe}'`;
}

function buildMunicipioCondition(alias: string, ano: number, municipio?: string | null): string {
  if (!municipio || isEleicaoGeral(ano)) return '';
  const municipioSafe = municipio.replace(/'/g, "''");
  return `AND ${alias}.NM_MUNICIPIO = '${municipioSafe}'`;
}

function buildCargoCondition(alias: string, cargo?: string | null): string {
  if (!cargo) return '';
  const cargoSafe = cargo.replace(/'/g, "''");
  return `AND UPPER(COALESCE(${alias}.DS_CARGO, '')) = UPPER('${cargoSafe}')`;
}

interface HistoricoIdentificador {
  cpf?: string;
  nomeCompleto?: string;
}

function buildHistoricoCandidatoFilter(alias: string, identificador: HistoricoIdentificador): string {
  // Prioriza CPF (mais confiável — nome pode variar entre eleições)
  const cpfSafe = identificador.cpf?.trim().replace(/'/g, "''");
  if (cpfSafe && cpfSafe.length >= 11) return `${alias}.NR_CPF_CANDIDATO = '${cpfSafe}'`;

  const nomeSafe = identificador.nomeCompleto?.trim().replace(/'/g, "''");
  if (nomeSafe) return `UPPER(TRIM(CAST(${alias}.NM_CANDIDATO AS VARCHAR))) = UPPER('${nomeSafe}')`;

  throw new Error('Identificador do histórico não informado.');
}

function buildHistoricoBoletimVotesSubquery(ano: number, identificador: HistoricoIdentificador): string | null {
  const boletimSubquery = buildBoletimNormalizadoSubquery(ano);
  if (!boletimSubquery) return null;

  const cand = getTableName('candidatos', ano);
  const filtro = buildHistoricoCandidatoFilter('c2', identificador);

  return `
    SELECT
      c2.SQ_CANDIDATO AS sq_candidato,
      SUM(b.qt_votos) AS total_votos
    FROM ${cand} c2
    JOIN (${boletimSubquery}) b
      ON b.nr_votavel = c2.NR_CANDIDATO
     AND b.ds_tipo_votavel = 'Nominal'
     AND (UPPER(COALESCE(b.ds_cargo_pergunta, '')) = UPPER(c2.DS_CARGO) OR UPPER(COALESCE(b.ds_cargo_pergunta, '')) = UPPER(REPLACE(REPLACE(c2.DS_CARGO, 'VICE-', ''), 'VICE ', '')))
     ${buildBoletimMunicipioCondition('b', ano, undefined).trim()}
    WHERE ${filtro}
      ${isEleicaoGeral(ano) ? '' : 'AND b.nm_municipio = c2.NM_UE'}
    GROUP BY c2.SQ_CANDIDATO
  `.trim();
}

/**
 * Composição completa de votos por bairro+escola usando boletim_urna (tem nr_votavel por seção).
 * Enriquece com metadados da seção via eleitorado_local ou detalhe_votacao_secao.
 * @param nrCandidato - Número do candidato na urna (NR_CANDIDATO)
 */
export function sqlComposicaoVotosCandidato(
  ano: number,
  nrCandidato: number | string,
  municipio?: string | null,
  cargo?: string | null,
): string {
  const metadataSubquery = buildSecaoMetadataSubquery(ano, municipio);
  const boletimSubquery = buildBoletimNormalizadoSubquery(ano);

  if (boletimSubquery && metadataSubquery) {
    return `
      SELECT
        COALESCE(meta.NM_MUNICIPIO, b.nm_municipio) AS municipio,
        COALESCE(meta.NM_BAIRRO, 'NÃO INFORMADO') AS bairro,
        COALESCE(meta.NM_LOCAL_VOTACAO, 'NÃO INFORMADO') AS escola,
        b.nr_zona AS zona,
        SUM(b.qt_votos) AS total_votos,
        COUNT(DISTINCT b.nr_secao) AS secoes
      FROM (${boletimSubquery}) b
      LEFT JOIN (${metadataSubquery}) meta
        ON b.nm_municipio = meta.NM_MUNICIPIO AND b.nr_zona = meta.NR_ZONA AND b.nr_secao = meta.NR_SECAO
      WHERE b.nr_votavel = ${nrCandidato}
        AND b.ds_tipo_votavel = 'Nominal'
        ${buildBoletimCargoCondition('b', cargo)}
        ${buildBoletimMunicipioCondition('b', ano, municipio)}
      GROUP BY meta.NM_MUNICIPIO, meta.NM_BAIRRO, meta.NM_LOCAL_VOTACAO, b.nm_municipio, b.nr_zona
      ORDER BY total_votos DESC
    `.trim();
  }

  if (boletimSubquery) {
    return `
      SELECT
        b.nm_municipio AS municipio,
        'NÃO INFORMADO' AS bairro,
        'NÃO INFORMADO' AS escola,
        b.nr_zona AS zona,
        SUM(b.qt_votos) AS total_votos,
        COUNT(DISTINCT b.nr_secao) AS secoes
      FROM (${boletimSubquery}) b
      WHERE b.nr_votavel = ${nrCandidato}
        AND b.ds_tipo_votavel = 'Nominal'
        ${buildBoletimCargoCondition('b', cargo)}
        ${buildBoletimMunicipioCondition('b', ano, municipio)}
      GROUP BY b.nm_municipio, b.nr_zona
      ORDER BY total_votos DESC
    `.trim();
  }

  // Fallback: votacao_secao TEM NR_VOTAVEL, QT_VOTOS, NM_LOCAL_VOTACAO por seção
  if (getAnosDisponiveis('votacao_secao').includes(ano)) {
    const vs = getTableName('votacao_secao', ano);
    if (metadataSubquery) {
      return `
        SELECT
          vs.NM_MUNICIPIO AS municipio,
          COALESCE(meta.NM_BAIRRO, 'NÃO INFORMADO') AS bairro,
          COALESCE(vs.NM_LOCAL_VOTACAO, 'NÃO INFORMADO') AS escola,
          vs.NR_ZONA AS zona,
          SUM(vs.QT_VOTOS) AS total_votos,
          COUNT(DISTINCT vs.NR_SECAO) AS secoes
        FROM ${vs} vs
        LEFT JOIN (${metadataSubquery}) meta
          ON vs.NR_ZONA = meta.NR_ZONA AND vs.NR_SECAO = meta.NR_SECAO
            AND vs.NM_MUNICIPIO = meta.NM_MUNICIPIO
        WHERE vs.NR_VOTAVEL = ${nrCandidato}
          ${buildMunicipioCondition('vs', ano, municipio)}
        GROUP BY vs.NM_MUNICIPIO, meta.NM_BAIRRO, vs.NM_LOCAL_VOTACAO, vs.NR_ZONA
        ORDER BY total_votos DESC
      `.trim();
    }
    return `
      SELECT
        vs.NM_MUNICIPIO AS municipio,
        'NÃO INFORMADO' AS bairro,
        COALESCE(vs.NM_LOCAL_VOTACAO, 'NÃO INFORMADO') AS escola,
        vs.NR_ZONA AS zona,
        SUM(vs.QT_VOTOS) AS total_votos,
        COUNT(DISTINCT vs.NR_SECAO) AS secoes
      FROM ${vs} vs
      WHERE vs.NR_VOTAVEL = ${nrCandidato}
        ${buildMunicipioCondition('vs', ano, municipio)}
      GROUP BY vs.NM_MUNICIPIO, vs.NM_LOCAL_VOTACAO, vs.NR_ZONA
      ORDER BY total_votos DESC
    `.trim();
  }

  // Ultimate fallback: votacao_candidato_munzona (zone-level only)
  const vot = getTableName('votacao', ano);
  return `
    SELECT
      v.NM_MUNICIPIO AS municipio,
      'NÃO INFORMADO' AS bairro,
      'Dados por seção não disponíveis' AS escola,
      v.NR_ZONA AS zona,
      SUM(v.QT_VOTOS_NOMINAIS) AS total_votos,
      0 AS secoes
    FROM ${vot} v
    WHERE v.NR_CANDIDATO = ${nrCandidato}
      ${buildCargoCondition('v', cargo)}
      ${buildMunicipioCondition('v', ano, municipio)}
    GROUP BY v.NM_MUNICIPIO, v.NR_ZONA
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
      SQ_CANDIDATO AS sq_candidato,
      NR_CANDIDATO AS numero
    FROM ${cand}
    WHERE NR_CPF_CANDIDATO = '${cpf}'`;
  });

  return `SELECT * FROM (${unions.join(' UNION ALL ')}) ORDER BY ano DESC`;
}

/** Histórico com votos totais por eleição (prioriza nome completo e cai para CPF quando necessário) */
export function sqlHistoricoComVotos(identificador: HistoricoIdentificador): string {
  const anos = [2014, 2016, 2018, 2020, 2022, 2024];
  const unions: string[] = [];

  for (const a of anos) {
    const cand = getTableName('candidatos', a);
    const vot = getTableName('votacao', a);
    const filtro = buildHistoricoCandidatoFilter('c', identificador);
    const boletimVotes = buildHistoricoBoletimVotesSubquery(a, identificador);

    unions.push(`SELECT
      ${a} AS ano,
      c.NM_URNA_CANDIDATO AS candidato,
      c.SG_PARTIDO AS partido,
      c.DS_CARGO AS cargo,
      c.NM_UE AS municipio,
      c.DS_SIT_TOT_TURNO AS situacao,
      c.SQ_CANDIDATO AS sq_candidato,
      c.NR_CANDIDATO AS numero,
      COALESCE(
        NULLIF(v.total_votos, 0),
        vn.total_votos,
        vb.total_votos,
        0
      ) AS total_votos
    FROM ${cand} c
    LEFT JOIN (
      SELECT SQ_CANDIDATO, SUM(QT_VOTOS_NOMINAIS) AS total_votos
      FROM ${vot}
      GROUP BY SQ_CANDIDATO
    ) v ON c.SQ_CANDIDATO = v.SQ_CANDIDATO
    LEFT JOIN (
      SELECT NR_CANDIDATO, NM_MUNICIPIO, DS_CARGO, SUM(QT_VOTOS_NOMINAIS) AS total_votos
      FROM ${vot}
      GROUP BY NR_CANDIDATO, NM_MUNICIPIO, DS_CARGO
    ) vn ON c.NR_CANDIDATO = vn.NR_CANDIDATO AND c.NM_UE = vn.NM_MUNICIPIO AND UPPER(c.DS_CARGO) = UPPER(vn.DS_CARGO) AND COALESCE(v.total_votos, 0) = 0
    ${boletimVotes ? `LEFT JOIN (${boletimVotes}) vb ON c.SQ_CANDIDATO = vb.sq_candidato` : 'LEFT JOIN (SELECT NULL AS sq_candidato, NULL AS total_votos) vb ON 1=0'}
    WHERE ${filtro}`);
  }

  return `SELECT * FROM (${unions.join(' UNION ALL ')}) ORDER BY ano DESC`;
}

/** Votos por zona de uma eleição específica. Usa boletim normalizado quando disponível.
 *  Por padrão NÃO filtra por município — mostra todas as cidades onde o candidato teve votos.
 */
export function sqlVotosHistoricoPorZona(
  ano: number,
  sqCandidato: string | null,
  nrCandidato?: number | string | null,
  cargo?: string | null,
  _municipio?: string | null, // ignorado — sempre mostra todas as cidades
): string {
  const boletimSubquery = buildBoletimNormalizadoSubquery(ano);

  if (boletimSubquery && nrCandidato) {
    return `
      SELECT
        b.nr_zona AS zona,
        b.nm_municipio AS municipio,
        SUM(b.qt_votos) AS total_votos
      FROM (${boletimSubquery}) b
      WHERE b.nr_votavel = ${nrCandidato}
        AND b.ds_tipo_votavel = 'Nominal'
        ${buildBoletimCargoCondition('b', cargo)}
      GROUP BY b.nr_zona, b.nm_municipio
      ORDER BY total_votos DESC
    `.trim();
  }

  const vot = getTableName('votacao', ano);
  const conds: string[] = [];

  if (sqCandidato) conds.push(`v.SQ_CANDIDATO = '${sqCandidato}'`);
  else if (nrCandidato) conds.push(`v.NR_CANDIDATO = ${nrCandidato}`);

  const primaryQuery = `
    SELECT
      v.NR_ZONA AS zona,
      v.NM_MUNICIPIO AS municipio,
      SUM(v.QT_VOTOS_NOMINAIS) AS total_votos
    FROM ${vot} v
    WHERE ${conds.length ? conds.join(' AND ') : '1=0'}
    GROUP BY v.NR_ZONA, v.NM_MUNICIPIO
    ORDER BY total_votos DESC
  `.trim();

  // If we have both sqCandidato AND nrCandidato, provide a UNION fallback
  if (sqCandidato && nrCandidato) {
    return `
      WITH primary_result AS (${primaryQuery})
      SELECT * FROM primary_result
      WHERE (SELECT COUNT(*) FROM primary_result) > 0
      UNION ALL
      SELECT
        v.NR_ZONA AS zona,
        v.NM_MUNICIPIO AS municipio,
        SUM(v.QT_VOTOS_NOMINAIS) AS total_votos
      FROM ${vot} v
      WHERE v.NR_CANDIDATO = ${nrCandidato}
        AND (SELECT COUNT(*) FROM primary_result) = 0
      GROUP BY v.NR_ZONA, v.NM_MUNICIPIO
      ORDER BY total_votos DESC
    `.trim();
  }

  return primaryQuery;
}

/** Votos por local de votação de uma zona específica em uma eleição.
 *  Usa boletim_urna (tem nr_votavel + qt_votos por seção) e enriquece com metadados de local.
 */
export function sqlVotosHistoricoPorLocal(
  ano: number,
  nrCandidato: number | string,
  zona: number,
  municipio: string,
  _sqCandidato?: number | string | null,
  cargo?: string | null,
): string {
  const municipioSafe = municipio.replace(/'/g, "''");
  const metadataSubquery = buildSecaoMetadataSubquery(ano, municipio);
  const boletimSubquery = buildBoletimNormalizadoSubquery(ano);

  // boletim_urna normalizado (2014 tem schema legado; 2020 vem com strings entre aspas)
  if (boletimSubquery) {
    if (metadataSubquery) {
      return `
        SELECT
          COALESCE(meta.NM_BAIRRO, 'NÃO INFORMADO') AS bairro,
          COALESCE(meta.NM_LOCAL_VOTACAO, 'NÃO INFORMADO') AS local_votacao,
          b.nr_zona AS zona,
          SUM(b.qt_votos) AS total_votos,
          COUNT(DISTINCT b.nr_secao) AS secoes
        FROM (${boletimSubquery}) b
        LEFT JOIN (${metadataSubquery}) meta
          ON b.nm_municipio = meta.NM_MUNICIPIO AND b.nr_zona = meta.NR_ZONA AND b.nr_secao = meta.NR_SECAO
        WHERE b.nm_municipio = '${municipioSafe}'
          AND b.nr_votavel = ${nrCandidato}
          AND b.ds_tipo_votavel = 'Nominal'
          ${buildBoletimCargoCondition('b', cargo)}
          AND b.nr_zona = ${zona}
        GROUP BY
          COALESCE(meta.NM_BAIRRO, 'NÃO INFORMADO'),
          COALESCE(meta.NM_LOCAL_VOTACAO, 'NÃO INFORMADO'),
          b.nr_zona
        ORDER BY total_votos DESC
      `.trim();
    }

    return `
      SELECT
        'NÃO INFORMADO' AS bairro,
        'NÃO INFORMADO' AS local_votacao,
        b.nr_zona AS zona,
        SUM(b.qt_votos) AS total_votos,
        COUNT(DISTINCT b.nr_secao) AS secoes
      FROM (${boletimSubquery}) b
      WHERE b.nm_municipio = '${municipioSafe}'
        AND b.nr_votavel = ${nrCandidato}
        AND b.ds_tipo_votavel = 'Nominal'
        ${buildBoletimCargoCondition('b', cargo)}
        AND b.nr_zona = ${zona}
      GROUP BY b.nr_zona
      ORDER BY total_votos DESC
    `.trim();
  }

  // Fallback: no boletim_urna for this year (e.g. 2016)
  // Use votacao_secao which has NR_VOTAVEL, QT_VOTOS, NM_LOCAL_VOTACAO per section
  if (getAnosDisponiveis('votacao_secao').includes(ano)) {
    const vs = getTableName('votacao_secao', ano);
    if (metadataSubquery) {
      return `
        SELECT
          COALESCE(meta.NM_BAIRRO, 'NÃO INFORMADO') AS bairro,
          COALESCE(vs.NM_LOCAL_VOTACAO, 'NÃO INFORMADO') AS local_votacao,
          vs.NR_ZONA AS zona,
          SUM(vs.QT_VOTOS) AS total_votos,
          COUNT(DISTINCT vs.NR_SECAO) AS secoes
        FROM ${vs} vs
        LEFT JOIN (${metadataSubquery}) meta
          ON vs.NM_MUNICIPIO = meta.NM_MUNICIPIO AND vs.NR_ZONA = meta.NR_ZONA AND vs.NR_SECAO = meta.NR_SECAO
        WHERE vs.NM_MUNICIPIO = '${municipioSafe}'
          AND vs.NR_VOTAVEL = ${nrCandidato}
          AND vs.NR_ZONA = ${zona}
        GROUP BY
          COALESCE(meta.NM_BAIRRO, 'NÃO INFORMADO'),
          COALESCE(vs.NM_LOCAL_VOTACAO, 'NÃO INFORMADO'),
          vs.NR_ZONA
        ORDER BY total_votos DESC
      `.trim();
    }
    return `
      SELECT
        'NÃO INFORMADO' AS bairro,
        COALESCE(vs.NM_LOCAL_VOTACAO, 'NÃO INFORMADO') AS local_votacao,
        vs.NR_ZONA AS zona,
        SUM(vs.QT_VOTOS) AS total_votos,
        COUNT(DISTINCT vs.NR_SECAO) AS secoes
      FROM ${vs} vs
      WHERE vs.NM_MUNICIPIO = '${municipioSafe}'
        AND vs.NR_VOTAVEL = ${nrCandidato}
        AND vs.NR_ZONA = ${zona}
      GROUP BY vs.NM_LOCAL_VOTACAO, vs.NR_ZONA
      ORDER BY total_votos DESC
    `.trim();
  }

  // Ultimate fallback: votacao_candidato_munzona (zone-level only)
  const vot = getTableName('votacao', ano);
  return `
    SELECT
      'NÃO INFORMADO' AS bairro,
      'Dados por seção não disponíveis' AS local_votacao,
      v.NR_ZONA AS zona,
      SUM(v.QT_VOTOS_NOMINAIS) AS total_votos,
      0 AS secoes
    FROM ${vot} v
    WHERE v.NM_MUNICIPIO = '${municipioSafe}'
      AND v.NR_ZONA = ${zona}
      AND v.NR_CANDIDATO = ${nrCandidato}
    GROUP BY v.NR_ZONA
    ORDER BY total_votos DESC
  `.trim();
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

/** Comparecimento e abstenção — geo-aware via detalhe_secao when filters active */
export function sqlComparecimento(filtros: FiltrosPainel = {}): string {
  const ano = filtros.ano || 2024;
  const geo = needsGeoJoin(filtros);
  // When geo filters active, use detalhe_secao for section-level join
  const comp = geo ? getTableName('detalhe_secao', ano) : getTableName('detalhe_munzona', ano);

  const conds: string[] = [];
  if (filtros.municipio) conds.push(`d.NM_MUNICIPIO = '${filtros.municipio}'`);
  if (filtros.turno) conds.push(`d.NR_TURNO = ${filtros.turno}`);
  if (filtros.zona) conds.push(`d.NR_ZONA = ${filtros.zona}`);

  const { join: geoJoin, conds: geoConds } = geo ? buildGeoJoin(filtros, 'd', 'loc') : { join: '', conds: [] as string[] };
  conds.push(...geoConds);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  return `
    SELECT
      d.NM_MUNICIPIO AS municipio,
      SUM(d.QT_APTOS) AS eleitores,
      SUM(d.QT_COMPARECIMENTO) AS comparecimento,
      SUM(d.QT_ABSTENCOES) AS abstencoes,
      ROUND(SUM(d.QT_COMPARECIMENTO) * 100.0 / NULLIF(SUM(d.QT_APTOS), 0), 1) AS taxa_comparecimento
    FROM ${comp} d
    ${geoJoin}
    ${where}
    GROUP BY d.NM_MUNICIPIO
    ORDER BY eleitores DESC
    LIMIT 50
  `.trim();
}

/** Ranking de partidos por votos — geo-aware */
export function sqlRankingPartidos(filtros: FiltrosPainel = {}): string {
  const ano = filtros.ano || 2024;
  const limit = filtros.limite || 20;
  const geo = needsGeoJoin(filtros);
  // Use votacao_secao for geo filtering; votacao_partido_munzona otherwise
  const vp = geo ? getTableName('votacao_secao', ano) : getTableName('votacao_partido', ano);

  const conds: string[] = [];
  if (filtros.municipio) conds.push(`v.NM_MUNICIPIO = '${filtros.municipio}'`);
  if (filtros.cargo && !geo) conds.push(`v.DS_CARGO ILIKE '%${filtros.cargo}%'`);
  if (filtros.turno) conds.push(`v.NR_TURNO = ${filtros.turno}`);
  if (filtros.zona) conds.push(`v.NR_ZONA = ${filtros.zona}`);

  const { join: geoJoin, conds: geoConds } = geo ? buildGeoJoin(filtros, 'v', 'loc') : { join: '', conds: [] as string[] };
  conds.push(...geoConds);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  if (geo) {
    // Aggregate from votacao_secao by partido
    return `
      SELECT
        v.NM_PARTIDO AS partido,
        v.NM_PARTIDO AS nome_partido,
        SUM(v.QT_VOTOS_NOMINAIS) AS votos_nominais,
        0 AS votos_legenda
      FROM ${vp} v
      ${geoJoin}
      ${where}
      GROUP BY v.NM_PARTIDO
      ORDER BY votos_nominais DESC
      LIMIT ${limit}
    `.trim();
  }

  return `
    SELECT
      v.SG_PARTIDO AS partido,
      v.NM_PARTIDO AS nome_partido,
      SUM(v.QT_VOTOS_NOMINAIS_VALIDOS) AS votos_nominais,
      SUM(v.QT_VOTOS_LEGENDA_VALIDOS) AS votos_legenda
    FROM ${vp} v
    ${where}
    GROUP BY v.SG_PARTIDO, v.NM_PARTIDO
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
      SUM(QT_ELEITOR_SECAO) AS eleitores
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
      SUM(QT_ELEITOR_SECAO) AS eleitores
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
      SUM(QT_ELEITOR_SECAO) AS eleitores
    FROM ${tab}
    WHERE SG_UF = 'GO'
      AND NM_MUNICIPIO = '${municipio}'
      AND NM_BAIRRO IS NOT NULL AND NM_BAIRRO != ''
    GROUP BY NM_BAIRRO
    ORDER BY eleitores DESC
    LIMIT 30
  `.trim();
}

/** Votos totais por zona+bairro+escola (geral, sem candidato específico) */
export function sqlVotosRegional(filtros: FiltrosPainel = {}): string {
  const ano = filtros.ano || 2024;
  const vot = getTableName('votacao_secao', ano);
  const loc = getTableName('eleitorado_local', ano);
  const municipio = filtros.municipio || 'GOIÂNIA';

  const conds: string[] = [`v.NM_MUNICIPIO = '${municipio}'`];
  if (filtros.turno) conds.push(`v.NR_TURNO = ${filtros.turno}`);
  if (filtros.zona) conds.push(`v.NR_ZONA = ${filtros.zona}`);
  if (filtros.bairro) conds.push(`loc.NM_BAIRRO = '${filtros.bairro}'`);
  if (filtros.escola) conds.push(`loc.NM_LOCAL_VOTACAO = '${filtros.escola}'`);

  const where = `WHERE ${conds.join(' AND ')}`;

  return `
    SELECT
      v.NR_ZONA AS zona,
      COALESCE(loc.NM_BAIRRO, '') AS bairro,
      COALESCE(loc.NM_LOCAL_VOTACAO, '') AS escola,
      COUNT(DISTINCT v.NR_SECAO) AS secoes,
      SUM(v.QT_VOTOS_NOMINAIS) AS total_votos
    FROM ${vot} v
    INNER JOIN ${loc} loc
      ON v.NR_ZONA = loc.NR_ZONA AND v.NR_SECAO = loc.NR_SECAO
      AND loc.SG_UF = 'GO' AND loc.NM_MUNICIPIO = '${municipio}'
    ${where}
    GROUP BY v.NR_ZONA, loc.NM_BAIRRO, loc.NM_LOCAL_VOTACAO
    ORDER BY total_votos DESC
    LIMIT 300
  `.trim();
}

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

// ── INTELIGÊNCIA GEOGRÁFICA: Votos por Bairro + Escola ──

/** Votos totais agrupados por bairro (via votacao_secao JOIN eleitorado_local) */
export function sqlVotosPorBairro(ano: number, municipio: string): string {
  const vot = getTableName('votacao_secao', ano);
  const loc = getTableName('eleitorado_local', ano);

  return `
    SELECT
      l.NM_BAIRRO AS bairro,
      COUNT(DISTINCT l.NM_LOCAL_VOTACAO) AS locais,
      COUNT(DISTINCT v.NR_SECAO) AS secoes,
      SUM(v.QT_VOTOS_NOMINAIS) AS votos
    FROM ${vot} v
    JOIN ${loc} l
      ON v.NR_ZONA = l.NR_ZONA AND v.NR_SECAO = l.NR_SECAO
      AND l.SG_UF = 'GO' AND l.NM_MUNICIPIO = '${municipio}'
    WHERE v.NM_MUNICIPIO = '${municipio}'
      AND l.NM_BAIRRO IS NOT NULL AND l.NM_BAIRRO != ''
    GROUP BY l.NM_BAIRRO
    ORDER BY votos DESC
  `.trim();
}

/** Votos de um candidato por zona (votacao_candidato_munzona has SQ_CANDIDATO; votacao_secao does NOT) */
export function sqlVotosCandidatoPorBairro(ano: number, municipio: string, sqCandidato: string): string {
  const vot = getTableName('votacao', ano);

  return `
    SELECT
      v.NR_ZONA AS zona,
      v.NM_MUNICIPIO AS municipio,
      SUM(v.QT_VOTOS_NOMINAIS) AS votos
    FROM ${vot} v
    WHERE v.NM_MUNICIPIO = '${municipio}'
      AND v.SQ_CANDIDATO = '${sqCandidato}'
    GROUP BY v.NR_ZONA, v.NM_MUNICIPIO
    ORDER BY votos DESC
  `.trim();
}

/** Escolas de um bairro com votos totais (aggregate, not per-candidate) */
export function sqlEscolasPorBairro(ano: number, municipio: string, bairro: string): string {
  const vot = getTableName('votacao_secao', ano);
  const loc = getTableName('eleitorado_local', ano);

  return `
    SELECT
      l.NM_LOCAL_VOTACAO AS local_votacao,
      l.DS_ENDERECO AS endereco,
      l.NR_ZONA AS zona,
      COUNT(DISTINCT v.NR_SECAO) AS secoes,
      SUM(v.QT_VOTOS_NOMINAIS) AS votos
    FROM ${vot} v
    JOIN ${loc} l
      ON v.NR_ZONA = l.NR_ZONA AND v.NR_SECAO = l.NR_SECAO
      AND l.SG_UF = 'GO' AND l.NM_MUNICIPIO = '${municipio}'
    WHERE v.NM_MUNICIPIO = '${municipio}'
      AND l.NM_BAIRRO = '${bairro}'
    GROUP BY l.NM_LOCAL_VOTACAO, l.DS_ENDERECO, l.NR_ZONA
    ORDER BY votos DESC
  `.trim();
}

/** Escolas de um bairro - votos totais (votacao_secao has no SQ_CANDIDATO, so per-candidate not possible) */
export function sqlEscolasCandidatoPorBairro(ano: number, municipio: string, bairro: string, _sqCandidato: string): string {
  // votacao_secao does NOT have SQ_CANDIDATO. Return aggregate data instead.
  return sqlEscolasPorBairro(ano, municipio, bairro);
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
