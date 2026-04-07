const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================
// LOVABLE AI GATEWAY (replaces Gemini)
// =============================================

async function callAI(systemPrompt: string, userMessage: string, apiKey: string, maxTokens = 2000): Promise<string | null> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error("Lovable AI error:", res.status, errBody);
      if (res.status === 429) return "ERROR:429";
      if (res.status === 402) return "ERROR:402";
      return null;
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("AI call failed:", err);
    return null;
  }
}

// =============================================
// SCHEMA (shared reference)
// =============================================

const SCHEMA_COMPLETO = `
Tabelas MotherDuck (DuckDB). Banco: my_db. Sufixo: _YYYY_GO.
ATENÇÃO: Use APENAS as colunas listadas abaixo. NUNCA invente colunas.

1. my_db.consulta_cand_YYYY_GO (anos: 2014-2024) — candidatos
   Colunas: ano_eleicao(BIGINT), nr_turno(BIGINT), nm_candidato(VARCHAR), nm_urna_candidato(VARCHAR),
   sg_partido(VARCHAR), nm_partido(VARCHAR), ds_cargo(VARCHAR),
   nm_ue(VARCHAR=município), sg_uf(VARCHAR), sq_candidato(BIGINT), nr_candidato(BIGINT),
   nr_cpf_candidato(BIGINT), ds_situacao_candidatura(VARCHAR),
   sg_uf_nascimento(VARCHAR), dt_nascimento(DATE), ds_genero(VARCHAR), ds_grau_instrucao(VARCHAR),
   ds_ocupacao(VARCHAR), ds_cor_raca(VARCHAR), ds_estado_civil(VARCHAR),
   ds_sit_tot_turno(VARCHAR=situação final: ELEITO/NÃO ELEITO/etc),
   nr_partido(BIGINT)
   ⚠️ NÃO EXISTE: ds_nacionalidade, nr_idade_data_posse, nm_bairro

2. my_db.bem_candidato_YYYY_GO (anos: 2014-2024)
   Colunas: ano_eleicao, sg_uf, nm_ue, sq_candidato(BIGINT), nr_ordem_bem_candidato(BIGINT),
   ds_tipo_bem_candidato(VARCHAR), ds_bem_candidato(VARCHAR),
   vr_bem_candidato(VARCHAR! vírgula decimal, ex: '100000,00')
   ⚠️ Para somar: CAST(REPLACE(vr_bem_candidato, ',', '.') AS DOUBLE)
   ⚠️ NÃO TEM: nm_candidato, sg_partido (precisa JOIN com consulta_cand via sq_candidato)

3. my_db.votacao_candidato_munzona_YYYY_GO (anos: 2014-2024)
   Colunas: ano_eleicao, nr_turno, nm_municipio(VARCHAR), nr_zona(BIGINT), ds_cargo,
   sq_candidato, nr_candidato, nm_candidato, nm_urna_candidato, sg_partido, nm_partido,
   qt_votos_nominais(BIGINT), ds_sit_tot_turno

4. my_db.detalhe_votacao_munzona_YYYY_GO (anos: 2014-2024) — comparecimento
   Colunas: ano_eleicao, nr_turno, nm_municipio, nr_zona, ds_cargo,
   qt_aptos(BIGINT), qt_comparecimento(BIGINT), qt_abstencoes(BIGINT),
   qt_votos_brancos(BIGINT), qt_votos_nulos(BIGINT)

5. my_db.eleitorado_local_votacao_YYYY (anos: 2014-2024) — TEM BAIRRO! Nacional, filtrar sg_uf='GO'
   Colunas: ano_eleicao(BIGINT), nm_municipio, nr_zona, nr_secao,
   nm_local_votacao(VARCHAR), ds_endereco(VARCHAR), nm_bairro(VARCHAR),
   qt_eleitores_perfil(BIGINT), sg_uf
   ⚠️ Tabela nacional, sem sufixo _GO. Filtrar com sg_uf='GO'

6. my_db.votacao_partido_munzona_YYYY_GO (anos: 2014-2024)
   Colunas: ano_eleicao, nr_turno, nm_municipio, nr_zona, ds_cargo,
   nr_partido, sg_partido, nm_partido, qt_votos_nominais_validos(BIGINT), qt_votos_legenda_validos(BIGINT)
   ⚠️ ATENÇÃO: colunas são qt_votos_nominais_validos e qt_votos_legenda_validos (NÃO qt_votos_nominais/qt_votos_legenda)

7. my_db.perfil_eleitorado_YYYY (anos: 2014-2024) — Nacional, filtrar sg_uf='GO'
   Colunas: ano_eleicao, nm_municipio, nr_zona, ds_genero, ds_faixa_etaria,
   ds_grau_escolaridade, ds_raca_cor, qt_eleitores_perfil(BIGINT)

REGRAS:
- Sempre especifique o ano na tabela (ex: my_db.consulta_cand_2024_GO)
- Para múltiplos anos, use UNION ALL
- vr_bem_candidato é VARCHAR com vírgula decimal
- NUNCA use colunas que não existem
- Use LIMIT máximo 200
- Contexto: Dados eleitorais do estado de Goiás (GO), Brasil
`;

// =============================================
// ENTITY / INTENT (reusable engine)
// =============================================

const CARGOS_MAP: Record<string, string[]> = {
  "PREFEITO": ["prefeito", "prefeita", "prefeitura"],
  "VEREADOR": ["vereador", "vereadora", "vereadores", "câmara", "camara"],
  "GOVERNADOR": ["governador", "governadora"],
  "DEPUTADO ESTADUAL": ["deputado estadual", "deputada estadual"],
  "DEPUTADO FEDERAL": ["deputado federal", "deputada federal"],
  "SENADOR": ["senador", "senadora"],
  "PRESIDENTE": ["presidente"],
  "VICE-PREFEITO": ["vice-prefeito", "vice prefeito"],
};

const SITUACOES_MAP: Record<string, string[]> = {
  "ELEITO": ["eleito", "eleita", "eleitos", "eleitas", "ganhou", "venceu"],
  "NÃO ELEITO": ["não eleito", "nao eleito", "perdeu", "derrotado"],
  "2º TURNO": ["segundo turno", "2o turno", "2º turno"],
  "SUPLENTE": ["suplente", "suplentes"],
};

const PARTIDOS_CONHECIDOS = [
  "PT", "PL", "MDB", "PSDB", "PP", "PSD", "UNIÃO", "REPUBLICANOS", "PDT", "PSB",
  "PODE", "PSOL", "AVANTE", "SOLIDARIEDADE", "CIDADANIA", "PCdoB", "PV", "REDE",
  "NOVO", "PROS", "DC", "PMB", "PMN", "PRTB", "PSC", "PTC", "PTB",
  "AGIR", "MOBILIZA", "PRD", "UNIÃO BRASIL",
];

const MUNICIPIOS_PRINCIPAIS = [
  "GOIÂNIA", "GOIANIA", "APARECIDA DE GOIÂNIA", "APARECIDA DE GOIANIA",
  "ANÁPOLIS", "ANAPOLIS", "RIO VERDE", "LUZIÂNIA", "LUZIANIA",
  "ÁGUAS LINDAS DE GOIÁS", "AGUAS LINDAS", "VALPARAÍSO DE GOIÁS", "VALPARAISO",
  "TRINDADE", "FORMOSA", "NOVO GAMA", "SENADOR CANEDO", "CATALÃO", "CATALAO",
  "ITUMBIARA", "JATAÍ", "JATAI", "PLANALTINA", "CALDAS NOVAS",
];

type Intent =
  | "ranking_votos" | "ranking_patrimonio" | "total_candidatos" | "total_votos"
  | "comparecimento" | "abstencao" | "evolucao" | "comparativo_partidos"
  | "distribuicao_genero" | "distribuicao_instrucao" | "distribuicao_ocupacao"
  | "distribuicao_idade" | "bairro_comparecimento" | "busca_candidato"
  | "patrimonio_candidato" | "votos_por_zona" | "partidos_ranking"
  | "locais_votacao" | "resumo_eleicao" | "comparativo_anos" | "generico";

function detectIntent(text: string): Intent {
  const has = (...words: string[]) => words.some(w => text.includes(w));
  if (has("patrimônio", "patrimonio", "bens", "declarado", "mais rico")) {
    if (has("ranking", "top", "maiores", "mais rico")) return "ranking_patrimonio";
    return "patrimonio_candidato";
  }
  if (has("comparecimento", "presença", "presenca", "frequência")) {
    if (has("bairro")) return "bairro_comparecimento";
    if (has("evolução", "evolucao", "histórico", "historico")) return "evolucao";
    return "comparecimento";
  }
  if (has("abstenção", "abstencao", "absteve", "faltou")) return "abstencao";
  if (has("evolução", "evolucao", "ao longo", "tendência", "histórico", "historico")) return "evolucao";
  if (has("gênero", "genero", "homens e mulheres", "sexo", "feminino", "masculino")) return "distribuicao_genero";
  if (has("escolaridade", "instrução", "instrucao", "formação", "ensino")) return "distribuicao_instrucao";
  if (has("ocupação", "ocupacao", "profissão", "profissao")) return "distribuicao_ocupacao";
  if (has("idade", "faixa etária", "faixa etaria", "nascimento")) return "distribuicao_idade";
  if (has("local de votação", "local de votacao", "colégio", "colegio", "escola")) return "locais_votacao";
  if (has("zona") && has("voto", "votos")) return "votos_por_zona";
  if (has("comparar", "comparativo", "versus", "vs") && has("partido")) return "comparativo_partidos";
  if (has("comparar", "comparativo") && has("ano", "eleição", "eleicao")) return "comparativo_anos";
  if (has("resumo", "visão geral", "panorama")) return "resumo_eleicao";
  if (has("partido") && has("ranking", "top", "maiores")) return "partidos_ranking";
  if (has("ranking", "top", "mais votado", "mais votados")) return "ranking_votos";
  if (has("quantos", "quantas", "total de candidatos")) return "total_candidatos";
  if (has("total de votos", "soma dos votos")) return "total_votos";
  if (has("bairro") && has("votação", "votacao", "eleitores")) return "bairro_comparecimento";
  if (has("quem é", "quem e", "candidato", "perfil de", "informações sobre")) return "busca_candidato";
  if (has("partido") && has("voto", "votos", "desempenho")) return "partidos_ranking";
  return "generico";
}

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
  if (lower.includes("primeiro turno") || lower.includes("1º turno")) turnos.push(1);
  if (lower.includes("segundo turno") || lower.includes("2º turno")) turnos.push(2);
  let limite = 20;
  const topMatch = text.match(/top\s*(\d+)/i) || text.match(/(\d+)\s*(mais|maiores|principais)/i);
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
  if (lower.includes("mulher") || lower.includes("feminino") || lower.includes("candidatas")) generos.push("FEMININO");
  if (lower.includes("homem") || lower.includes("masculino")) generos.push("MASCULINO");
  const zonaMatch = text.match(/zona\s*(\d+)/gi);
  const zonas = zonaMatch ? zonaMatch.map(z => parseInt(z.replace(/\D/g, ''))) : [];
  const nomes: string[] = [];
  const quoted = text.match(/"([^"]+)"/g);
  if (quoted) nomes.push(...quoted.map(q => q.replace(/"/g, '').toUpperCase()));
  return { anos: [...new Set(anos)], municipios: [...new Set(municipios)], partidos: [...new Set(partidos)], cargos: [...new Set(cargos)], situacoes: [...new Set(situacoes)], generos: [...new Set(generos)], limite, nomes, zonas: [...new Set(zonas)], turnos: [...new Set(turnos)] };
}

// =============================================
// SQL BUILDER — corrected table/column names
// =============================================

function candTable(ano: number) { return `my_db.consulta_cand_${ano}_GO`; }
function bensTable(ano: number) { return `my_db.bem_candidato_${ano}_GO`; }
function votPartTable(ano: number) { return `my_db.votacao_partido_munzona_${ano}_GO`; }
function compTable(ano: number) { return `my_db.detalhe_votacao_munzona_${ano}_GO`; }
function votCandTable(ano: number) { return `my_db.votacao_candidato_munzona_${ano}_GO`; }

function buildWhere(e: Entities, isMunField = false): string {
  const munField = isMunField ? "nm_municipio" : "nm_ue";
  const c: string[] = [];
  if (e.municipios.length === 1) c.push(`${munField} = '${e.municipios[0]}'`);
  else if (e.municipios.length > 1) c.push(`${munField} IN (${e.municipios.map(m => `'${m}'`).join(',')})`);
  if (e.cargos.length === 1) c.push(`ds_cargo ILIKE '%${e.cargos[0]}%'`);
  if (e.turnos.length === 1) c.push(`nr_turno = ${e.turnos[0]}`);
  if (e.generos.length === 1) c.push(`ds_genero = '${e.generos[0]}'`);
  if (e.situacoes.length === 1) c.push(`ds_sit_tot_turno ILIKE '%${e.situacoes[0]}%'`);
  if (e.partidos.length === 1) c.push(`sg_partido = '${e.partidos[0]}'`);
  else if (e.partidos.length > 1) c.push(`sg_partido IN (${e.partidos.map(p => `'${p}'`).join(',')})`);
  return c.length ? `WHERE ${c.join(' AND ')}` : '';
}

function buildSQL(intent: Intent, e: Entities): string {
  const ano = e.anos[0] || 2024;
  const mun = e.municipios[0] || 'GOIÂNIA';

  switch (intent) {
    case "ranking_votos":
    case "total_votos": {
      const mCond = e.municipios.length ? `WHERE nm_municipio = '${mun}'` : '';
      const cCond = e.cargos.length ? `${mCond ? ' AND' : ' WHERE'} ds_cargo ILIKE '%${e.cargos[0]}%'` : '';
      return `SELECT sg_partido AS partido, nm_partido AS nome_partido, sum(qt_votos_nominais_validos) AS votos_nominais, sum(qt_votos_legenda_validos) AS votos_legenda
        FROM ${votPartTable(ano)} ${mCond}${cCond} GROUP BY sg_partido, nm_partido ORDER BY votos_nominais DESC LIMIT ${e.limite}`;
    }
    case "ranking_patrimonio":
      return `SELECT c.nm_urna_candidato AS candidato, c.sg_partido AS partido,
        sum(CAST(REPLACE(b.vr_bem_candidato, ',', '.') AS DOUBLE)) AS patrimonio
        FROM ${bensTable(ano)} b JOIN ${candTable(ano)} c ON b.sq_candidato = c.sq_candidato
        ${e.municipios.length ? `WHERE c.nm_ue = '${mun}'` : ''}
        GROUP BY c.nm_urna_candidato, c.sg_partido ORDER BY patrimonio DESC LIMIT ${e.limite}`;
    case "patrimonio_candidato":
      if (e.nomes.length > 0) {
        return `SELECT ds_tipo_bem_candidato AS tipo, ds_bem_candidato AS descricao,
          CAST(REPLACE(vr_bem_candidato, ',', '.') AS DOUBLE) AS valor
          FROM ${bensTable(ano)} WHERE sq_candidato IN (
            SELECT sq_candidato FROM ${candTable(ano)} WHERE nm_urna_candidato ILIKE '%${e.nomes[0]}%'
          ) ORDER BY valor DESC LIMIT 50`;
      }
      return buildSQL("ranking_patrimonio", e);
    case "total_candidatos": {
      const w = buildWhere(e);
      return `SELECT ds_cargo AS cargo, count(*) AS total,
        count(CASE WHEN ds_genero = 'FEMININO' THEN 1 END) AS mulheres,
        count(CASE WHEN ds_genero = 'MASCULINO' THEN 1 END) AS homens
        FROM ${candTable(ano)} ${w} GROUP BY ds_cargo ORDER BY total DESC`;
    }
    case "comparecimento": {
      const w = buildWhere(e, true);
      return `SELECT nm_municipio AS municipio, sum(qt_aptos) AS eleitores, sum(qt_comparecimento) AS comparecimento,
        ROUND(sum(qt_comparecimento) * 100.0 / NULLIF(sum(qt_aptos), 0), 1) AS taxa_pct
        FROM ${compTable(ano)} ${w} GROUP BY nm_municipio ORDER BY eleitores DESC LIMIT 50`;
    }
    case "abstencao": {
      const w = buildWhere(e, true);
      return `SELECT nm_municipio AS municipio, sum(qt_abstencoes) AS abstencoes,
        ROUND(sum(qt_abstencoes) * 100.0 / NULLIF(sum(qt_aptos), 0), 1) AS taxa_pct
        FROM ${compTable(ano)} ${w} GROUP BY nm_municipio ORDER BY taxa_pct DESC LIMIT 30`;
    }
    case "evolucao": {
      const anos = [2014, 2016, 2018, 2020, 2022, 2024];
      return `SELECT * FROM (${anos.map(a =>
        `SELECT ${a} AS ano, sum(qt_aptos) AS eleitores, sum(qt_comparecimento) AS comparecimento FROM ${compTable(a)} WHERE nm_municipio = '${mun}' AND nr_turno = 1`
      ).join(' UNION ALL ')}) ORDER BY ano`;
    }
    case "distribuicao_genero": {
      const w = buildWhere(e);
      return `SELECT ds_genero AS genero, count(*) AS total FROM ${candTable(ano)} ${w} GROUP BY ds_genero ORDER BY total DESC`;
    }
    case "distribuicao_instrucao": {
      const w = buildWhere(e);
      return `SELECT ds_grau_instrucao AS escolaridade, count(*) AS total FROM ${candTable(ano)} ${w} GROUP BY ds_grau_instrucao ORDER BY total DESC`;
    }
    case "distribuicao_ocupacao": {
      const w = buildWhere(e);
      return `SELECT ds_ocupacao AS ocupacao, count(*) AS total FROM ${candTable(ano)} ${w} GROUP BY ds_ocupacao ORDER BY total DESC LIMIT 15`;
    }
    case "distribuicao_idade": {
      const w = buildWhere(e);
      const baseWhere = w || 'WHERE 1=1';
      return `SELECT CASE WHEN age <= 25 THEN '18-25' WHEN age <= 35 THEN '26-35' WHEN age <= 45 THEN '36-45'
        WHEN age <= 55 THEN '46-55' WHEN age <= 65 THEN '56-65' ELSE '66+' END AS faixa, count(*) AS total
        FROM (
          SELECT CAST(EXTRACT(YEAR FROM AGE(CURRENT_DATE, valid_date)) AS INT) as age
          FROM (
            SELECT TRY_CAST(dt_nascimento AS DATE) as valid_date
            FROM ${candTable(ano)} ${baseWhere}
          ) dates
          WHERE valid_date IS NOT NULL
        ) sub WHERE age BETWEEN 18 AND 120 GROUP BY faixa ORDER BY faixa`;
    }
    case "bairro_comparecimento":
      return `SELECT nm_bairro AS bairro, count(DISTINCT nm_local_votacao) AS locais, sum(qt_eleitores_perfil) AS eleitores
        FROM my_db.eleitorado_local_votacao_${ano} WHERE sg_uf = 'GO' AND nm_municipio = '${mun}' AND nm_bairro IS NOT NULL AND nm_bairro != ''
        GROUP BY nm_bairro ORDER BY eleitores DESC LIMIT 30`;
    case "busca_candidato": {
      if (e.nomes.length > 0) {
        return `SELECT nm_urna_candidato AS candidato, nm_candidato AS nome, sg_partido AS partido,
          ds_cargo AS cargo, nm_ue AS municipio, ds_sit_tot_turno AS situacao, ds_genero AS genero,
          ds_grau_instrucao AS escolaridade, ds_ocupacao AS ocupacao
          FROM ${candTable(ano)} WHERE (nm_urna_candidato ILIKE '%${e.nomes[0]}%' OR nm_candidato ILIKE '%${e.nomes[0]}%') LIMIT 20`;
      }
      const w = buildWhere(e);
      return `SELECT nm_urna_candidato AS candidato, sg_partido AS partido, ds_cargo AS cargo, ds_sit_tot_turno AS situacao
        FROM ${candTable(ano)} ${w} ORDER BY nm_urna_candidato LIMIT 30`;
    }
    case "votos_por_zona":
      return `SELECT nr_zona AS zona, sum(qt_aptos) AS eleitores, sum(qt_comparecimento) AS comparecimento,
        ROUND(sum(qt_comparecimento) * 100.0 / NULLIF(sum(qt_aptos), 0), 1) AS taxa_pct
        FROM ${compTable(ano)} WHERE nm_municipio = '${mun}' GROUP BY nr_zona ORDER BY zona`;
    case "comparativo_partidos": {
      if (e.partidos.length >= 2) {
        const pList = e.partidos.map(p => `'${p}'`).join(',');
        const mCond = e.municipios.length ? `AND nm_municipio = '${mun}'` : '';
        const cCond = e.cargos.length ? `AND ds_cargo ILIKE '%${e.cargos[0]}%'` : '';
        return `SELECT sg_partido AS partido, sum(qt_votos_nominais_validos) AS votos_nominais, sum(qt_votos_legenda_validos) AS votos_legenda
          FROM ${votPartTable(ano)} WHERE sg_partido IN (${pList}) ${mCond} ${cCond} GROUP BY sg_partido ORDER BY votos_nominais DESC`;
      }
      return buildSQL("partidos_ranking", e);
    }
    case "partidos_ranking": {
      const mCond = e.municipios.length ? `WHERE nm_municipio = '${mun}'` : '';
      return `SELECT sg_partido AS partido, sum(qt_votos_nominais_validos) AS votos_nominais
        FROM ${votPartTable(ano)} ${mCond} GROUP BY sg_partido ORDER BY votos_nominais DESC LIMIT ${e.limite}`;
    }
    case "locais_votacao":
      return `SELECT nm_local_votacao AS local, nm_bairro AS bairro, ds_endereco AS endereco, sum(qt_eleitores_perfil) AS eleitores
        FROM my_db.eleitorado_local_votacao_${ano} WHERE sg_uf = 'GO' AND nm_municipio = '${mun}'
        GROUP BY nm_local_votacao, nm_bairro, ds_endereco ORDER BY eleitores DESC LIMIT 30`;
    case "resumo_eleicao": {
      const w = buildWhere(e);
      return `SELECT count(*) AS total_candidatos,
        count(CASE WHEN ds_sit_tot_turno ILIKE '%ELEITO%' AND ds_sit_tot_turno NOT ILIKE '%NÃO ELEITO%' THEN 1 END) AS eleitos,
        count(CASE WHEN ds_genero = 'FEMININO' THEN 1 END) AS mulheres,
        count(DISTINCT sg_partido) AS partidos,
        count(DISTINCT nm_ue) AS municipios
        FROM ${candTable(ano)} ${w}`;
    }
    case "comparativo_anos": {
      const anos = [2016, 2018, 2020, 2022, 2024];
      const mCond = e.municipios.length ? `WHERE nm_ue = '${mun}'` : '';
      return `SELECT * FROM (${anos.map(a =>
        `SELECT ${a} AS ano, count(*) AS candidatos,
        count(CASE WHEN ds_sit_tot_turno ILIKE '%ELEITO%' AND ds_sit_tot_turno NOT ILIKE '%NÃO ELEITO%' THEN 1 END) AS eleitos
        FROM ${candTable(a)} ${mCond}`
      ).join(' UNION ALL ')}) ORDER BY ano`;
    }
    default:
      return "";
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

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ erro: "LOVABLE_API_KEY não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mdToken = Deno.env.get("MOTHERDUCK_TOKEN");
    if (!mdToken) {
      return new Response(JSON.stringify({ erro: "MOTHERDUCK_TOKEN não configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STEP 1: Algorithmic intent + entity detection (NO AI call) ──
    const lower = pergunta.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let intent = detectIntent(lower);
    const entities = extractEntities(pergunta);
    if (entities.anos.length === 0) entities.anos = [2024];

    let sql = buildSQL(intent, entities);
    let usedAI = false;

    // ── STEP 2: Only call AI for "generico" or empty SQL ──
    if (!sql || intent === "generico") {
      const sqlPrompt = `Gere SQL DuckDB/MotherDuck. Use APENAS colunas listadas. NUNCA invente.
Responda APENAS JSON: {"sql":"SELECT ..."}
${SCHEMA_COMPLETO}`;

      const raw = await callAI(sqlPrompt, pergunta, apiKey, 600);
      if (raw === "ERROR:429") {
        return new Response(JSON.stringify({ erro: "Limite de requisições da IA atingido. Aguarde." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (raw === "ERROR:402") {
        return new Response(JSON.stringify({ erro: "Créditos esgotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (raw && !raw.startsWith("ERROR:")) {
        try {
          const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          const match = cleaned.match(/\{[\s\S]*\}/);
          if (match) {
            const jsonStr = match[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']').replace(/[\x00-\x1f]/g, ' ');
            const parsed = JSON.parse(jsonStr);
            if (parsed.sql) { sql = parsed.sql; usedAI = true; }
          }
        } catch {}
      }
    }

    if (!sql) {
      return new Response(JSON.stringify({
        sucesso: true,
        resposta: "Não entendi sua pergunta. Tente perguntar sobre candidatos, votos, partidos, comparecimento, patrimônio ou bairros em Goiás.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Safety check
    const sqlUp = sql.toUpperCase().trim();
    if (!sqlUp.startsWith("SELECT") && !sqlUp.startsWith("WITH")) {
      return new Response(JSON.stringify({ erro: "Query não permitida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const forbidden = ["DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "TRUNCATE", "CREATE"];
    if (forbidden.some(f => sqlUp.includes(f))) {
      return new Response(JSON.stringify({ erro: "Operação proibida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STEP 3: Execute SQL ──
    const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");

    async function executarQuery(q: string) {
      const pg = postgres({
        hostname: "pg.us-east-1-aws.motherduck.com",
        port: 5432, username: "postgres", password: mdToken,
        database: "md:", ssl: "require",
        connection: { application_name: "eleicoesgo-consulta-ia" },
        max: 1, idle_timeout: 5, connect_timeout: 15,
      });
      try {
        const rows = await pg.unsafe(q);
        await pg.end();
        return Array.isArray(rows) ? rows.map((r: any) => ({ ...r })) : [];
      } catch (err) {
        await pg.end().catch(() => {});
        throw err;
      }
    }

    let dados: Record<string, any>[];
    let sqlUsado = sql;

    try {
      dados = await executarQuery(sql);
    } catch (queryErr: any) {
      console.error("Query error:", queryErr.message, "SQL:", sql);
      const retryRaw = await callAI(
        `SQL falhou. Corrija usando APENAS colunas existentes.\n${SCHEMA_COMPLETO}\nResponda APENAS JSON: {"sql":"SELECT ..."}`,
        `Pergunta: "${pergunta}"\nSQL: ${sql}\nErro: ${queryErr.message}`,
        apiKey, 600
      );
      if (retryRaw && !retryRaw.startsWith("ERROR:")) {
        try {
          const cleaned = retryRaw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          const match = cleaned.match(/\{[\s\S]*\}/);
          if (match) {
            const jsonStr = match[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']').replace(/[\x00-\x1f]/g, ' ');
            const parsed = JSON.parse(jsonStr);
            if (parsed.sql) {
              dados = await executarQuery(parsed.sql);
              sqlUsado = parsed.sql;
            } else throw new Error("no sql");
          } else throw new Error("no match");
        } catch {
          return new Response(JSON.stringify({
            sucesso: false, erro: "Não consegui consultar esses dados. Reformule a pergunta.",
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } else {
        return new Response(JSON.stringify({
          sucesso: false, erro: "Erro na consulta. Tente reformular.",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ── STEP 4: Format response as text ──
    let resposta: string;

    if (dados.length === 0) {
      resposta = "Não encontrei resultados para essa consulta. Tente reformular ou verificar os filtros (ano, município, cargo).";
    } else if (dados.length <= 15) {
      resposta = formatSimpleResult(intent, entities, dados);
    } else {
      const sample = dados.slice(0, 15);
      const textRaw = await callAI(
        `Assistente de eleições de Goiás. Responda em markdown. NÃO mencione SQL/banco. Use negrito e listas. Seja direto.`,
        `Pergunta: "${pergunta}"\nDados (${dados.length} registros, amostra de 15):\n${JSON.stringify(sample)}`,
        apiKey, 800
      );

      resposta = (textRaw && !textRaw.startsWith("ERROR:"))
        ? textRaw
        : formatSimpleResult(intent, entities, dados);
    }

    return new Response(JSON.stringify({
      sucesso: true,
      resposta,
      sql_gerado: sqlUsado,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ erro: e.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// =============================================
// ALGORITHMIC TEXT FORMATTER (no AI needed)
// =============================================

function formatSimpleResult(intent: Intent, entities: Entities, dados: Record<string, any>[]): string {
  const ano = entities.anos[0] || 2024;
  const mun = entities.municipios[0] || "Goiás";
  const cols = Object.keys(dados[0]);

  if (dados.length === 1 && cols.length <= 6) {
    const lines = cols.map(c => {
      const v = dados[0][c];
      const formatted = typeof v === 'number' ? v.toLocaleString('pt-BR') : v;
      return `- **${c.replace(/_/g, ' ')}**: ${formatted}`;
    });
    return `📊 **Resultado — ${mun} ${ano}**\n\n${lines.join('\n')}`;
  }

  let text = `📊 **${mun} ${ano}** — ${dados.length} resultado(s)\n\n`;
  const header = `| ${cols.map(c => c.replace(/_/g, ' ')).join(' | ')} |`;
  const separator = `| ${cols.map(() => '---').join(' | ')} |`;
  const rows = dados.slice(0, 20).map(row =>
    `| ${cols.map(c => {
      const v = row[c];
      return typeof v === 'number' ? v.toLocaleString('pt-BR') : (v || '—');
    }).join(' | ')} |`
  );
  text += `${header}\n${separator}\n${rows.join('\n')}`;
  if (dados.length > 20) text += `\n\n*...e mais ${dados.length - 20} resultados.*`;
  return text;
}
