const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================
// ENTITY DICTIONARIES
// =============================================

const CARGOS_MAP: Record<string, string[]> = {
  "PREFEITO": ["prefeito", "prefeita", "prefeitura"],
  "VEREADOR": ["vereador", "vereadora", "vereadores", "câmara", "camara"],
  "GOVERNADOR": ["governador", "governadora", "governo do estado"],
  "DEPUTADO ESTADUAL": ["deputado estadual", "deputada estadual", "estaduais"],
  "DEPUTADO FEDERAL": ["deputado federal", "deputada federal", "federais"],
  "SENADOR": ["senador", "senadora"],
  "PRESIDENTE": ["presidente", "presidência", "presidencia"],
  "VICE-PREFEITO": ["vice-prefeito", "vice prefeito"],
};

const SITUACOES_MAP: Record<string, string[]> = {
  "ELEITO": ["eleito", "eleita", "eleitos", "eleitas", "ganhou", "ganharam", "venceu", "venceram", "vitorioso"],
  "NÃO ELEITO": ["não eleito", "nao eleito", "perdeu", "perderam", "derrotado"],
  "2º TURNO": ["segundo turno", "2o turno", "2º turno"],
  "SUPLENTE": ["suplente", "suplentes"],
};

const PARTIDOS_CONHECIDOS = [
  "PT", "PL", "MDB", "PSDB", "PP", "PSD", "UNIÃO", "REPUBLICANOS", "PDT", "PSB",
  "PODE", "PSOL", "AVANTE", "SOLIDARIEDADE", "CIDADANIA", "PCdoB", "PV", "REDE",
  "NOVO", "PROS", "DC", "PMB", "PMN", "PRTB", "PSC", "PTC", "PTB", "SD",
  "AGIR", "MOBILIZA", "PRD", "UNIÃO BRASIL",
];

const MUNICIPIOS_PRINCIPAIS = [
  "GOIÂNIA", "GOIANIA", "APARECIDA DE GOIÂNIA", "APARECIDA DE GOIANIA",
  "ANÁPOLIS", "ANAPOLIS", "RIO VERDE", "LUZIÂNIA", "LUZIANIA",
  "ÁGUAS LINDAS DE GOIÁS", "AGUAS LINDAS", "VALPARAÍSO DE GOIÁS", "VALPARAISO",
  "TRINDADE", "FORMOSA", "NOVO GAMA", "SENADOR CANEDO", "CATALÃO", "CATALAO",
  "ITUMBIARA", "JATAÍ", "JATAI", "PLANALTINA", "CALDAS NOVAS",
];

const GENEROS_MAP: Record<string, string[]> = {
  "FEMININO": ["mulher", "mulheres", "feminino", "feminina", "candidatas", "vereadoras", "prefeitas"],
  "MASCULINO": ["homem", "homens", "masculino", "candidatos homens"],
};

// =============================================
// INTENT DETECTION
// =============================================

type Intent =
  | "ranking_votos" | "ranking_patrimonio" | "total_candidatos" | "total_votos"
  | "comparecimento" | "abstencao" | "evolucao" | "comparativo_partidos"
  | "distribuicao_genero" | "distribuicao_instrucao" | "distribuicao_ocupacao"
  | "distribuicao_idade" | "bairro_comparecimento" | "busca_candidato"
  | "patrimonio_candidato" | "votos_por_zona" | "partidos_ranking"
  | "locais_votacao" | "resumo_eleicao" | "comparativo_anos" | "generico";

function detectIntent(text: string): Intent {
  const has = (...words: string[]) => words.some(w => text.includes(w));
  if (has("patrimônio", "patrimonio", "bens", "declarado", "mais rico", "riqueza")) {
    if (has("ranking", "top", "maiores", "mais rico")) return "ranking_patrimonio";
    return "patrimonio_candidato";
  }
  if (has("comparecimento", "presença", "presenca", "frequência", "frequencia")) {
    if (has("bairro")) return "bairro_comparecimento";
    if (has("evolução", "evolucao", "ao longo", "histórico", "historico")) return "evolucao";
    return "comparecimento";
  }
  if (has("abstenção", "abstencao", "absteve", "faltou", "ausência", "ausencia")) return "abstencao";
  if (has("evolução", "evolucao", "ao longo", "tendência", "tendencia", "histórico", "historico")) return "evolucao";
  if (has("gênero", "genero", "homens e mulheres", "sexo", "feminino", "masculino")) return "distribuicao_genero";
  if (has("escolaridade", "instrução", "instrucao", "grau de instrução", "formação", "formacao", "ensino")) return "distribuicao_instrucao";
  if (has("ocupação", "ocupacao", "profissão", "profissao", "trabalha")) return "distribuicao_ocupacao";
  if (has("idade", "faixa etária", "faixa etaria", "nascimento", "jovens", "idosos")) return "distribuicao_idade";
  if (has("local de votação", "local de votacao", "colégio", "colegio", "escola", "seção", "secao")) return "locais_votacao";
  if (has("zona") && has("voto", "votos")) return "votos_por_zona";
  if (has("comparar", "comparativo", "versus", "vs", " x ") && has("partido")) return "comparativo_partidos";
  if (has("comparar", "comparativo") && has("ano", "eleição", "eleicao")) return "comparativo_anos";
  if (has("resumo", "visão geral", "visao geral", "panorama", "overview")) return "resumo_eleicao";
  if (has("partido") && (has("ranking", "top", "maiores", "mais votos"))) return "partidos_ranking";
  if (has("ranking", "top", "mais votado", "mais votados", "campeão", "campeões")) return "ranking_votos";
  if (has("quantos", "quantas", "total de candidatos", "número de candidatos", "numero de candidatos")) return "total_candidatos";
  if (has("total de votos", "votos totais", "soma dos votos")) return "total_votos";
  if (has("bairro") && (has("votação", "votacao", "comparecimento"))) return "bairro_comparecimento";
  if (has("quem é", "quem e", "candidato", "perfil de", "informações sobre", "informacoes sobre", "dados de")) return "busca_candidato";
  if (has("partido") && (has("voto", "votos", "desempenho"))) return "partidos_ranking";
  return "generico";
}

// =============================================
// ENTITY EXTRACTION
// =============================================

interface Entities {
  anos: number[];
  municipios: string[];
  partidos: string[];
  cargos: string[];
  situacoes: string[];
  generos: string[];
  limite: number;
  nomes: string[];
  zonas: number[];
  turnos: number[];
}

function extractEntities(text: string): Entities {
  const lower = text.toLowerCase();
  const yearMatches = text.match(/\b(20\d{2})\b/g);
  const anos = yearMatches ? [...new Set(yearMatches.map(Number))].filter(y => y >= 2000 && y <= 2030) : [];
  const turnos: number[] = [];
  if (lower.includes("primeiro turno") || lower.includes("1o turno") || lower.includes("1º turno")) turnos.push(1);
  if (lower.includes("segundo turno") || lower.includes("2o turno") || lower.includes("2º turno")) turnos.push(2);
  let limite = 20;
  const topMatch = text.match(/top\s*(\d+)/i) || text.match(/(\d+)\s*(mais|maiores|principais|primeiros)/i);
  if (topMatch) limite = Math.min(parseInt(topMatch[1]), 200);
  const cargos: string[] = [];
  for (const [cargo, keywords] of Object.entries(CARGOS_MAP)) {
    if (keywords.some(k => lower.includes(k))) cargos.push(cargo);
  }
  const situacoes: string[] = [];
  for (const [sit, keywords] of Object.entries(SITUACOES_MAP)) {
    if (keywords.some(k => lower.includes(k))) situacoes.push(sit);
  }
  const partidos: string[] = [];
  for (const p of PARTIDOS_CONHECIDOS) {
    const regex = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(text)) partidos.push(p);
  }
  const municipios: string[] = [];
  for (const m of MUNICIPIOS_PRINCIPAIS) {
    const normalized = m.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const textNorm = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (textNorm.includes(normalized)) {
      municipios.push(m.includes("GOIANIA") ? "GOIÂNIA" :
        m.includes("APARECIDA") ? "APARECIDA DE GOIÂNIA" :
        m.includes("ANAPOLIS") ? "ANÁPOLIS" :
        m.includes("LUZIANIA") ? "LUZIÂNIA" :
        m.includes("CATALAO") ? "CATALÃO" :
        m.includes("JATAI") ? "JATAÍ" :
        m.includes("VALPARAISO") ? "VALPARAÍSO DE GOIÁS" :
        m.includes("AGUAS LINDAS") ? "ÁGUAS LINDAS DE GOIÁS" : m);
    }
  }
  const generos: string[] = [];
  for (const [g, keywords] of Object.entries(GENEROS_MAP)) {
    if (keywords.some(k => lower.includes(k))) generos.push(g);
  }
  const zonaMatch = text.match(/zona\s*(\d+)/gi);
  const zonas = zonaMatch ? zonaMatch.map(z => parseInt(z.replace(/\D/g, ''))) : [];
  const nomes: string[] = [];
  const quoted = text.match(/"([^"]+)"/g);
  if (quoted) nomes.push(...quoted.map(q => q.replace(/"/g, '').toUpperCase()));
  return { anos: [...new Set(anos)], municipios: [...new Set(municipios)], partidos: [...new Set(partidos)], cargos: [...new Set(cargos)], situacoes: [...new Set(situacoes)], generos: [...new Set(generos)], limite, nomes, zonas: [...new Set(zonas)], turnos: [...new Set(turnos)] };
}

// =============================================
// SQL BUILDER — MotherDuck tables
// =============================================

function candTable(ano: number) { return `my_db.candidatos_${ano}_GO`; }
function bensTable(ano: number) { return `my_db.bens_candidatos_${ano}_GO`; }
function votTable(ano: number) { return `my_db.votacao_munzona_${ano}_GO`; }
function compTable(ano: number) { return `my_db.comparecimento_munzona_${ano}_GO`; }
function compSecaoTable(ano: number) { return `my_db.comparecimento_abstencao_${ano}_GO`; }
function votPartTable(ano: number) { return `my_db.votacao_partido_munzona_${ano}_GO`; }

interface QueryPlan {
  sql: string;
  tipo_grafico: string;
  titulo: string;
  descricao: string;
}

function buildMDWhere(e: Entities, tableAlias = ""): string {
  const p = tableAlias ? `${tableAlias}.` : "";
  const c: string[] = [];
  if (e.municipios.length === 1) c.push(`${p}nm_ue = '${e.municipios[0]}'`);
  else if (e.municipios.length > 1) c.push(`${p}nm_ue IN (${e.municipios.map(m => `'${m}'`).join(',')})`);
  if (e.cargos.length === 1) c.push(`${p}ds_cargo ILIKE '%${e.cargos[0]}%'`);
  if (e.turnos.length === 1) c.push(`${p}nr_turno = ${e.turnos[0]}`);
  if (e.generos.length === 1) c.push(`${p}ds_genero = '${e.generos[0]}'`);
  if (e.situacoes.length === 1) c.push(`${p}ds_sit_tot_turno ILIKE '%${e.situacoes[0]}%'`);
  if (e.partidos.length === 1) c.push(`${p}sg_partido = '${e.partidos[0]}'`);
  else if (e.partidos.length > 1) c.push(`${p}sg_partido IN (${e.partidos.map(pp => `'${pp}'`).join(',')})`);
  return c.length ? c.join(' AND ') : '';
}

function buildVotWhere(e: Entities, tableAlias = ""): string {
  const p = tableAlias ? `${tableAlias}.` : "";
  const c: string[] = [];
  if (e.municipios.length === 1) c.push(`${p}nm_municipio = '${e.municipios[0]}'`);
  else if (e.municipios.length > 1) c.push(`${p}nm_municipio IN (${e.municipios.map(m => `'${m}'`).join(',')})`);
  if (e.cargos.length === 1) c.push(`${p}ds_cargo ILIKE '%${e.cargos[0]}%'`);
  if (e.zonas.length === 1) c.push(`${p}nr_zona = ${e.zonas[0]}`);
  if (e.partidos.length === 1) c.push(`${p}sg_partido = '${e.partidos[0]}'`);
  else if (e.partidos.length > 1) c.push(`${p}sg_partido IN (${e.partidos.map(pp => `'${pp}'`).join(',')})`);
  return c.length ? c.join(' AND ') : '';
}

function buildQuery(intent: Intent, e: Entities): QueryPlan {
  const ano = e.anos.length === 1 ? e.anos[0] : 2024;
  const anoLabel = e.anos.length === 1 ? e.anos[0].toString() : '2024';
  const munLabel = e.municipios.length === 1 ? e.municipios[0] : 'Goiás';
  const cargoLabel = e.cargos.length === 1 ? e.cargos[0].toLowerCase() : 'todos';

  switch (intent) {
    case "ranking_votos": {
      const w = buildVotWhere(e);
      const wc = w ? `WHERE ${w}` : '';
      return {
        sql: `SELECT nm_urna_candidato AS candidato, sg_partido AS partido, sum(qt_votos_nominais) AS total_votos
          FROM ${votTable(ano)} ${wc}
          GROUP BY nm_urna_candidato, sg_partido ORDER BY total_votos DESC LIMIT ${e.limite}`,
        tipo_grafico: "bar",
        titulo: `Top ${e.limite} mais votados — ${munLabel} ${anoLabel}`,
        descricao: `Ranking de candidatos ${cargoLabel} por votos`,
      };
    }
    case "ranking_patrimonio": {
      return {
        sql: `SELECT c.nm_urna_candidato AS candidato, c.sg_partido AS partido,
          sum(CAST(REPLACE(b.vr_bem_candidato, ',', '.') AS DOUBLE)) AS patrimonio_total, count(*) AS qtd_bens
          FROM ${bensTable(ano)} b
          JOIN ${candTable(ano)} c ON b.sq_candidato = c.sq_candidato
          ${e.municipios.length ? `WHERE c.nm_ue = '${e.municipios[0]}'` : ''}
          GROUP BY c.nm_urna_candidato, c.sg_partido ORDER BY patrimonio_total DESC LIMIT ${e.limite}`,
        tipo_grafico: "bar",
        titulo: `Top ${e.limite} maior patrimônio — ${anoLabel}`,
        descricao: `Patrimônio total declarado dos candidatos`,
      };
    }
    case "patrimonio_candidato": {
      if (e.nomes.length > 0) {
        return {
          sql: `SELECT ds_tipo_bem_candidato AS tipo, ds_bem_candidato AS descricao, CAST(REPLACE(vr_bem_candidato, ',', '.') AS DOUBLE) AS valor
            FROM ${bensTable(ano)} WHERE UPPER(nm_candidato) ILIKE '%${e.nomes[0]}%' OR sq_candidato IN (
              SELECT sq_candidato FROM ${candTable(ano)} WHERE nm_urna_candidato ILIKE '%${e.nomes[0]}%'
            ) ORDER BY valor DESC LIMIT 50`,
          tipo_grafico: "table",
          titulo: `Bens — ${e.nomes[0]}`,
          descricao: `Bens declarados pelo candidato`,
        };
      }
      return buildQuery("ranking_patrimonio", e);
    }
    case "total_candidatos": {
      const w = buildMDWhere(e);
      const wc = w ? `WHERE ${w}` : '';
      return {
        sql: `SELECT ds_cargo AS cargo, count(*) AS total,
          count(CASE WHEN ds_genero = 'FEMININO' THEN 1 END) AS mulheres,
          count(CASE WHEN ds_genero = 'MASCULINO' THEN 1 END) AS homens
          FROM ${candTable(ano)} ${wc}
          GROUP BY ds_cargo ORDER BY total DESC`,
        tipo_grafico: "table",
        titulo: `Total de candidatos — ${munLabel} ${anoLabel}`,
        descricao: `Contagem por cargo`,
      };
    }
    case "comparecimento": {
      const w = buildVotWhere(e);
      const wc = w ? `WHERE ${w}` : '';
      return {
        sql: `SELECT nm_municipio AS municipio, sum(qt_aptos) AS eleitores, sum(qt_comparecimento) AS comparecimento,
          sum(qt_abstencoes) AS abstencoes,
          ROUND(sum(qt_comparecimento) * 100.0 / NULLIF(sum(qt_aptos), 0), 1) AS taxa_comp
          FROM ${compTable(ano)} ${wc}
          GROUP BY nm_municipio ORDER BY eleitores DESC LIMIT 50`,
        tipo_grafico: "bar",
        titulo: `Comparecimento — ${munLabel} ${anoLabel}`,
        descricao: `Dados de comparecimento e abstenção`,
      };
    }
    case "abstencao": {
      const w = buildVotWhere(e);
      const wc = w ? `WHERE ${w}` : '';
      return {
        sql: `SELECT nm_municipio AS municipio, sum(qt_abstencoes) AS abstencoes, sum(qt_aptos) AS eleitores,
          ROUND(sum(qt_abstencoes) * 100.0 / NULLIF(sum(qt_aptos), 0), 1) AS taxa_abstencao
          FROM ${compTable(ano)} ${wc}
          GROUP BY nm_municipio ORDER BY taxa_abstencao DESC LIMIT 30`,
        tipo_grafico: "bar",
        titulo: `Abstenção — ${anoLabel}`,
        descricao: `Taxa de abstenção por município`,
      };
    }
    case "evolucao": {
      const mun = e.municipios.length === 1 ? e.municipios[0] : 'GOIÂNIA';
      const anos = [2014, 2016, 2018, 2020, 2022, 2024];
      const unions = anos.map(a =>
        `SELECT ${a} AS ano, sum(qt_aptos) AS eleitores, sum(qt_comparecimento) AS comparecimento, sum(qt_abstencoes) AS abstencoes FROM ${compTable(a)} WHERE nm_municipio = '${mun}' AND nr_turno = 1`
      ).join(' UNION ALL ');
      return {
        sql: `SELECT * FROM (${unions}) ORDER BY ano`,
        tipo_grafico: "line",
        titulo: `Evolução eleitoral — ${mun}`,
        descricao: `Série histórica de comparecimento`,
      };
    }
    case "distribuicao_genero": {
      const w = buildMDWhere(e);
      const wc = w ? `WHERE ${w}` : '';
      return {
        sql: `SELECT ds_genero AS genero, count(*) AS total FROM ${candTable(ano)} ${wc} GROUP BY ds_genero ORDER BY total DESC`,
        tipo_grafico: "pie",
        titulo: `Distribuição por gênero — ${anoLabel}`,
        descricao: `Candidatos por gênero`,
      };
    }
    case "distribuicao_instrucao": {
      const w = buildMDWhere(e);
      const wc = w ? `WHERE ${w}` : '';
      return {
        sql: `SELECT ds_grau_instrucao AS escolaridade, count(*) AS total FROM ${candTable(ano)} ${wc} GROUP BY ds_grau_instrucao ORDER BY total DESC`,
        tipo_grafico: "bar",
        titulo: `Escolaridade dos candidatos — ${anoLabel}`,
        descricao: `Distribuição por grau de instrução`,
      };
    }
    case "distribuicao_ocupacao": {
      const w = buildMDWhere(e);
      const wc = w ? `WHERE ${w}` : '';
      return {
        sql: `SELECT ds_ocupacao AS ocupacao, count(*) AS total FROM ${candTable(ano)} ${wc} GROUP BY ds_ocupacao ORDER BY total DESC LIMIT 15`,
        tipo_grafico: "bar",
        titulo: `Ocupações dos candidatos — ${anoLabel}`,
        descricao: `Top ocupações declaradas`,
      };
    }
    case "distribuicao_idade": {
      const w = buildMDWhere(e, '');
      const wc = w ? `WHERE ${w} AND dt_nascimento IS NOT NULL AND dt_nascimento != ''` : "WHERE dt_nascimento IS NOT NULL AND dt_nascimento != ''";
      return {
        sql: `SELECT CASE
          WHEN age <= 25 THEN '18-25'
          WHEN age <= 35 THEN '26-35'
          WHEN age <= 45 THEN '36-45'
          WHEN age <= 55 THEN '46-55'
          WHEN age <= 65 THEN '56-65'
          ELSE '66+'
          END AS faixa, count(*) AS total
          FROM (
            SELECT CAST(EXTRACT(YEAR FROM AGE(CURRENT_DATE, TRY_CAST(dt_nascimento AS DATE))) AS INT) as age
            FROM ${candTable(ano)} ${wc}
          ) sub WHERE age BETWEEN 18 AND 120
          GROUP BY faixa ORDER BY faixa`,
        tipo_grafico: "bar",
        titulo: `Faixa etária dos candidatos — ${anoLabel}`,
        descricao: `Distribuição por idade`,
      };
    }
    case "bairro_comparecimento": {
      const mun = e.municipios.length === 1 ? e.municipios[0] : 'GOIÂNIA';
      return {
        sql: `SELECT nm_bairro AS bairro, sum(qt_aptos) AS eleitores, sum(qt_comparecimento) AS comparecimento,
          sum(qt_abstencoes) AS abstencoes,
          ROUND(sum(qt_comparecimento) * 100.0 / NULLIF(sum(qt_aptos), 0), 1) AS taxa_comp
          FROM ${compSecaoTable(ano)} WHERE nm_municipio = '${mun}'
          GROUP BY nm_bairro ORDER BY eleitores DESC LIMIT 30`,
        tipo_grafico: "bar",
        titulo: `Bairros — ${mun} ${anoLabel}`,
        descricao: `Comparecimento por bairro`,
      };
    }
    case "busca_candidato": {
      if (e.nomes.length > 0) {
        const w = buildMDWhere(e);
        const extra = w ? ` AND ${w}` : '';
        return {
          sql: `SELECT nm_urna_candidato AS candidato, nm_candidato AS nome_completo, sg_partido AS partido,
            ds_cargo AS cargo, nm_ue AS municipio, ds_sit_tot_turno AS situacao, ds_genero AS genero,
            ds_grau_instrucao AS escolaridade, ds_ocupacao AS ocupacao, dt_nascimento AS nascimento
            FROM ${candTable(ano)} WHERE nm_urna_candidato ILIKE '%${e.nomes[0]}%' OR nm_candidato ILIKE '%${e.nomes[0]}%'${extra}
            LIMIT 20`,
          tipo_grafico: "table",
          titulo: `Busca: ${e.nomes[0]}`,
          descricao: `Candidatos encontrados`,
        };
      }
      const w = buildMDWhere(e);
      const wc = w ? `WHERE ${w}` : '';
      return {
        sql: `SELECT nm_urna_candidato AS candidato, sg_partido AS partido, ds_cargo AS cargo, nm_ue AS municipio, ds_sit_tot_turno AS situacao
          FROM ${candTable(ano)} ${wc} ORDER BY nm_urna_candidato LIMIT 30`,
        tipo_grafico: "table",
        titulo: `Candidatos — ${munLabel} ${anoLabel}`,
        descricao: `Lista de candidatos`,
      };
    }
    case "votos_por_zona": {
      const mun = e.municipios.length === 1 ? e.municipios[0] : 'GOIÂNIA';
      return {
        sql: `SELECT nr_zona AS zona, sum(qt_aptos) AS eleitores, sum(qt_comparecimento) AS comparecimento,
          ROUND(sum(qt_comparecimento) * 100.0 / NULLIF(sum(qt_aptos), 0), 1) AS taxa_comp
          FROM ${compTable(ano)} WHERE nm_municipio = '${mun}'
          GROUP BY nr_zona ORDER BY zona`,
        tipo_grafico: "bar",
        titulo: `Zonas eleitorais — ${mun} ${anoLabel}`,
        descricao: `Comparecimento por zona`,
      };
    }
    case "comparativo_partidos": {
      if (e.partidos.length >= 2) {
        const pList = e.partidos.map(p => `'${p}'`).join(',');
        const mun = e.municipios.length === 1 ? `AND nm_municipio = '${e.municipios[0]}'` : '';
        const cargo = e.cargos.length === 1 ? `AND ds_cargo ILIKE '%${e.cargos[0]}%'` : '';
        return {
          sql: `SELECT sg_partido AS partido, sum(qt_votos_nominais) AS votos_nominais, sum(qt_votos_legenda) AS votos_legenda
            FROM ${votPartTable(ano)} WHERE sg_partido IN (${pList}) ${mun} ${cargo}
            GROUP BY sg_partido ORDER BY votos_nominais DESC`,
          tipo_grafico: "bar",
          titulo: `${e.partidos.join(' × ')} — ${anoLabel}`,
          descricao: `Comparativo de votos entre partidos`,
        };
      }
      return buildQuery("partidos_ranking", e);
    }
    case "partidos_ranking": {
      const mun = e.municipios.length === 1 ? `WHERE nm_municipio = '${e.municipios[0]}'` : '';
      return {
        sql: `SELECT sg_partido AS partido, sum(qt_votos_nominais) AS votos_nominais, sum(qt_votos_legenda) AS votos_legenda
          FROM ${votPartTable(ano)} ${mun}
          GROUP BY sg_partido ORDER BY votos_nominais DESC LIMIT ${e.limite}`,
        tipo_grafico: "bar",
        titulo: `Ranking de partidos — ${munLabel} ${anoLabel}`,
        descricao: `Votos nominais e de legenda por partido`,
      };
    }
    case "locais_votacao": {
      const mun = e.municipios.length === 1 ? e.municipios[0] : 'GOIÂNIA';
      return {
        sql: `SELECT nm_local_votacao AS local, nm_bairro AS bairro, sum(qt_aptos) AS eleitores, sum(qt_comparecimento) AS comparecimento
          FROM ${compSecaoTable(ano)} WHERE nm_municipio = '${mun}'
          GROUP BY nm_local_votacao, nm_bairro ORDER BY eleitores DESC LIMIT 30`,
        tipo_grafico: "table",
        titulo: `Locais de votação — ${mun} ${anoLabel}`,
        descricao: `Escolas e colégios eleitorais`,
      };
    }
    case "resumo_eleicao": {
      const w = buildMDWhere(e);
      const wc = w ? `WHERE ${w}` : '';
      return {
        sql: `SELECT count(*) AS total_candidatos,
          count(CASE WHEN ds_sit_tot_turno ILIKE '%ELEITO%' AND ds_sit_tot_turno NOT ILIKE '%NÃO ELEITO%' THEN 1 END) AS eleitos,
          count(CASE WHEN ds_genero = 'FEMININO' THEN 1 END) AS mulheres,
          count(DISTINCT sg_partido) AS partidos,
          count(DISTINCT nm_ue) AS municipios,
          count(DISTINCT ds_cargo) AS cargos
          FROM ${candTable(ano)} ${wc}`,
        tipo_grafico: "kpi",
        titulo: `Resumo — ${munLabel} ${anoLabel}`,
        descricao: `Visão geral da eleição`,
      };
    }
    case "comparativo_anos": {
      const mun = e.municipios.length === 1 ? `WHERE nm_ue = '${e.municipios[0]}'` : '';
      const anos = [2016, 2018, 2020, 2022, 2024];
      const unions = anos.map(a =>
        `SELECT ${a} AS ano, count(*) AS candidatos,
          count(CASE WHEN ds_sit_tot_turno ILIKE '%ELEITO%' AND ds_sit_tot_turno NOT ILIKE '%NÃO ELEITO%' THEN 1 END) AS eleitos,
          count(CASE WHEN ds_genero = 'FEMININO' THEN 1 END) AS mulheres
          FROM ${candTable(a)} ${mun}`
      ).join(' UNION ALL ');
      return {
        sql: `SELECT * FROM (${unions}) ORDER BY ano`,
        tipo_grafico: "line",
        titulo: `Comparativo entre eleições — ${munLabel}`,
        descricao: `Evolução de candidatos, eleitos e mulheres`,
      };
    }
    default: {
      // generico — use AI
      return {
        sql: "",
        tipo_grafico: "table",
        titulo: "Consulta genérica",
        descricao: "",
      };
    }
  }
}

// =============================================
// MAIN HANDLER
// =============================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { pergunta } = await req.json();
    if (!pergunta || typeof pergunta !== "string" || pergunta.length < 3) {
      return new Response(JSON.stringify({ erro: "Pergunta inválida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lower = pergunta.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const intent = detectIntent(lower);
    const entities = extractEntities(pergunta);

    // Default year to 2024 if none specified
    if (entities.anos.length === 0) entities.anos = [2024];

    let plan = buildQuery(intent, entities);

    // For generic intent, use AI to generate SQL
    if (intent === "generico" || !plan.sql) {
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      if (lovableKey) {
        try {
          const aiRes = await fetch("https://ai-gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${lovableKey}` },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: `Gere SQL DuckDB para MotherDuck. Tabelas: my_db.candidatos_YYYY_GO (colunas: ano_eleicao, nm_candidato, nm_urna_candidato, sg_partido, ds_cargo, nm_ue, ds_genero, ds_grau_instrucao, ds_ocupacao, ds_sit_tot_turno, sq_candidato, nr_candidato, dt_nascimento), my_db.votacao_munzona_YYYY_GO (nm_municipio, nr_zona, nm_urna_candidato, sg_partido, ds_cargo, qt_votos_nominais), my_db.comparecimento_munzona_YYYY_GO (nm_municipio, nr_zona, qt_aptos, qt_comparecimento, qt_abstencoes, qt_votos_brancos, qt_votos_nulos), my_db.bens_candidatos_YYYY_GO (sq_candidato, ds_tipo_bem_candidato, vr_bem_candidato VARCHAR com vírgula decimal), my_db.comparecimento_abstencao_YYYY_GO (nm_municipio, nm_bairro, nm_local_votacao, qt_aptos, qt_comparecimento). Anos: 2012-2024. IMPORTANTE: vr_bem_candidato usa vírgula como decimal (ex: '100000,00'), sempre use CAST(REPLACE(vr_bem_candidato, ',', '.') AS DOUBLE) para somas. NÃO existe coluna nr_idade_data_posse — calcule idade via dt_nascimento. Use LIMIT 200. Responda APENAS JSON: {"sql":"...","tipo_grafico":"bar|pie|line|area|table|kpi","titulo":"...","descricao":"..."}. NUNCA invente dados. APENAS use tabelas listadas.` },
                { role: "user", content: pergunta },
              ],
              temperature: 0.1,
              max_tokens: 1500,
            }),
          });
          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const raw = aiData?.choices?.[0]?.message?.content || "";
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              plan = { sql: parsed.sql, tipo_grafico: parsed.tipo_grafico || "table", titulo: parsed.titulo || "Resultado", descricao: parsed.descricao || "" };
            }
          }
        } catch (aiErr) {
          console.error("AI fallback error:", aiErr);
        }
      }
    }

    if (!plan.sql) {
      return new Response(JSON.stringify({
        sucesso: true,
        resposta_texto: "Desculpe, não consegui entender sua pergunta. Tente perguntar sobre candidatos, votos, partidos, comparecimento, patrimônio, bairros ou evolução eleitoral em Goiás.",
        tipo_grafico: "table",
        titulo: "Não entendi",
        descricao: "",
        colunas: [],
        dados: [],
        intent,
        entities_encontradas: entities,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Safety check
    const sqlUp = plan.sql.toUpperCase().trim();
    if (!sqlUp.startsWith("SELECT") && !sqlUp.startsWith("WITH")) {
      return new Response(JSON.stringify({ erro: "Query não permitida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Execute via MotherDuck
    const mdToken = Deno.env.get("MOTHERDUCK_TOKEN");
    if (!mdToken) {
      return new Response(JSON.stringify({ erro: "MOTHERDUCK_TOKEN não configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
    const pg = postgres({
      hostname: "pg.us-east-1-aws.motherduck.com",
      port: 5432,
      username: "postgres",
      password: mdToken,
      database: "md:",
      ssl: "require",
      connection: { application_name: "eleicoesgo-chat" },
      max: 1,
      idle_timeout: 5,
      connect_timeout: 15,
    });

    try {
      const rows = await pg.unsafe(plan.sql);
      await pg.end();

      const dados = Array.isArray(rows) ? rows.map((r: any) => ({ ...r })) : [];
      const colunas = dados.length > 0 ? Object.keys(dados[0]) : [];

      // Generate response text
      let resposta = plan.descricao || plan.titulo;
      if (dados.length === 0) {
        resposta = `Não encontrei dados para sua consulta sobre "${pergunta}". Tente ajustar os filtros (ano, município, cargo).`;
      } else if (plan.tipo_grafico === "kpi" && dados.length === 1) {
        const kpiParts = colunas.map(c => `**${c.replace(/_/g, ' ')}**: ${Number(dados[0][c]).toLocaleString('pt-BR')}`);
        resposta = `${plan.titulo}\n\n${kpiParts.join('\n')}`;
      } else {
        resposta = `${plan.titulo}: ${dados.length} resultado(s) encontrado(s). ${plan.descricao}`;
      }

      return new Response(JSON.stringify({
        sucesso: true,
        tipo_grafico: plan.tipo_grafico,
        titulo: plan.titulo,
        descricao: plan.descricao,
        resposta_texto: resposta,
        colunas,
        dados,
        sql_gerado: plan.sql,
        intent,
        entities_encontradas: entities,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (queryErr: any) {
      await pg.end().catch(() => {});
      console.error("Query error:", queryErr.message, "SQL:", plan.sql);
      return new Response(JSON.stringify({
        sucesso: false,
        erro: queryErr.message,
        resposta_texto: `Erro ao executar a consulta: ${queryErr.message}`,
        tipo_grafico: "table",
        titulo: "Erro",
        descricao: "",
        colunas: [],
        dados: [],
        sql_gerado: plan.sql,
        intent,
        entities_encontradas: entities,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e: any) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ erro: e.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
