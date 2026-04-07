const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================
// LOVABLE AI GATEWAY (for reports/charts)
// =============================================

async function callLovableAI(systemPrompt: string, userMessage: string, apiKey: string, maxTokens = 1200): Promise<string | null> {
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
        temperature: 0.1,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error("Lovable AI error:", res.status, errBody);
      return `ERROR:${res.status}:${errBody}`;
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("Lovable AI call failed:", err);
    return null;
  }
}

// =============================================
// SCHEMA (compact for token efficiency)
// =============================================

const SCHEMA_COMPLETO = `
Tabelas DuckDB/MotherDuck. Banco: my_db. Sufixo: _YYYY_GO.
Use APENAS colunas listadas. NUNCA invente.

1. candidatos_YYYY_GO (2012-2024): ano_eleicao,nr_turno,nm_candidato,nm_urna_candidato,sg_partido,nm_partido,ds_cargo,nm_ue(município),sq_candidato,nr_candidato,ds_situacao_candidatura,dt_nascimento(DATE),ds_genero,ds_grau_instrucao,ds_ocupacao,ds_cor_raca,ds_estado_civil,ds_sit_tot_turno(ELEITO/NÃO ELEITO),nr_partido
⚠️ SEM: ds_nacionalidade,nr_idade_data_posse,nm_bairro

2. bens_candidatos_YYYY_GO (2014-2024): ano_eleicao,sg_uf,nm_ue,sq_candidato,nr_ordem_bem_candidato,ds_tipo_bem_candidato,ds_bem_candidato,vr_bem_candidato(VARCHAR vírgula→CAST(REPLACE(v,',','.')AS DOUBLE))
⚠️ SEM: nm_candidato,sg_partido (JOIN via sq_candidato)

3. votacao_munzona_YYYY_GO (2012-2024): ano_eleicao,nr_turno,nm_municipio,nr_zona,ds_cargo,sq_candidato,nr_candidato,nm_candidato,nm_urna_candidato,sg_partido,qt_votos_nominais,ds_sit_tot_turno

4. comparecimento_munzona_YYYY_GO (2014-2024): ano_eleicao,nr_turno,nm_municipio,nr_zona,ds_cargo,qt_aptos,qt_comparecimento,qt_abstencoes,qt_votos_brancos,qt_votos_nulos

5. eleitorado_local_YYYY_GO (2018-2024): aa_eleicao(não ano_eleicao!),nm_municipio,nr_zona,nr_secao,nm_local_votacao,ds_endereco,nm_bairro,qt_eleitor_secao

6. votacao_partido_munzona_YYYY_GO (2014-2024): ano_eleicao,nr_turno,nm_municipio,nr_zona,ds_cargo,sg_partido,nm_partido,qt_votos_nominais,qt_votos_legenda

7. perfil_eleitorado_YYYY_GO (2018-2024): ano_eleicao,nm_municipio,nr_zona,ds_genero,ds_faixa_etaria,ds_grau_escolaridade,ds_raca_cor,qt_eleitores_perfil

REGRAS: Tabela=my_db.nome_YYYY_GO. LIMIT max 200. Contexto: Goiás, Brasil.
`;

// =============================================
// ENTITY / INTENT ENGINE (algorithmic, no AI)
// =============================================

const CARGOS_MAP: Record<string, string[]> = {
  "PREFEITO": ["prefeito", "prefeita", "prefeitura"],
  "VEREADOR": ["vereador", "vereadora", "vereadores", "câmara", "camara"],
  "GOVERNADOR": ["governador", "governadora"],
  "DEPUTADO ESTADUAL": ["deputado estadual", "deputada estadual"],
  "DEPUTADO FEDERAL": ["deputado federal", "deputada federal"],
  "SENADOR": ["senador", "senadora"],
  "PRESIDENTE": ["presidente"],
};

const SITUACOES_MAP: Record<string, string[]> = {
  "ELEITO": ["eleito", "eleita", "eleitos", "ganhou", "venceu"],
  "NÃO ELEITO": ["não eleito", "nao eleito", "perdeu", "derrotado"],
};

const PARTIDOS_CONHECIDOS = [
  "PT", "PL", "MDB", "PSDB", "PP", "PSD", "UNIÃO", "REPUBLICANOS", "PDT", "PSB",
  "PODE", "PSOL", "AVANTE", "SOLIDARIEDADE", "CIDADANIA", "PCdoB", "PV", "REDE",
  "NOVO", "PROS", "DC", "PMB", "PMN", "PRTB", "PSC", "PTB",
  "AGIR", "MOBILIZA", "PRD", "UNIÃO BRASIL",
];

const MUNICIPIOS_PRINCIPAIS = [
  "GOIÂNIA", "GOIANIA", "APARECIDA DE GOIÂNIA", "APARECIDA DE GOIANIA",
  "ANÁPOLIS", "ANAPOLIS", "RIO VERDE", "LUZIÂNIA", "LUZIANIA",
  "TRINDADE", "FORMOSA", "SENADOR CANEDO", "CATALÃO", "CATALAO",
  "ITUMBIARA", "JATAÍ", "JATAI", "PLANALTINA", "CALDAS NOVAS",
];

type Intent =
  | "ranking_votos" | "ranking_patrimonio" | "total_candidatos"
  | "comparecimento" | "abstencao" | "evolucao" | "comparativo_partidos"
  | "distribuicao_genero" | "distribuicao_instrucao" | "distribuicao_ocupacao"
  | "distribuicao_idade" | "bairro_comparecimento" | "busca_candidato"
  | "patrimonio_candidato" | "votos_por_zona" | "partidos_ranking"
  | "locais_votacao" | "resumo_eleicao" | "comparativo_anos" | "generico";

function detectIntent(text: string): Intent {
  const has = (...w: string[]) => w.some(x => text.includes(x));
  if (has("patrimônio", "patrimonio", "bens", "mais rico")) {
    return has("ranking", "top", "maiores") ? "ranking_patrimonio" : "patrimonio_candidato";
  }
  if (has("comparecimento", "presença")) {
    if (has("bairro")) return "bairro_comparecimento";
    if (has("evolução", "evolucao", "histórico")) return "evolucao";
    return "comparecimento";
  }
  if (has("abstenção", "abstencao")) return "abstencao";
  if (has("evolução", "evolucao", "tendência", "histórico")) return "evolucao";
  if (has("gênero", "genero", "feminino", "masculino")) return "distribuicao_genero";
  if (has("escolaridade", "instrução", "instrucao")) return "distribuicao_instrucao";
  if (has("ocupação", "ocupacao", "profissão")) return "distribuicao_ocupacao";
  if (has("idade", "faixa etária")) return "distribuicao_idade";
  if (has("local de votação", "colégio", "escola")) return "locais_votacao";
  if (has("zona") && has("voto")) return "votos_por_zona";
  if (has("comparar", "comparativo", "versus") && has("partido")) return "comparativo_partidos";
  if (has("comparar", "comparativo") && has("ano", "eleição")) return "comparativo_anos";
  if (has("resumo", "panorama", "visão geral")) return "resumo_eleicao";
  if (has("partido") && has("ranking", "top")) return "partidos_ranking";
  if (has("ranking", "top", "mais votado", "mais votados")) return "ranking_votos";
  if (has("quantos", "quantas", "total de candidatos")) return "total_candidatos";
  if (has("bairro") && has("votação", "eleitores")) return "bairro_comparecimento";
  if (has("candidato", "perfil de", "quem é")) return "busca_candidato";
  if (has("partido") && has("voto", "desempenho")) return "partidos_ranking";
  return "generico";
}

interface Entities {
  anos: number[]; municipios: string[]; partidos: string[]; cargos: string[];
  situacoes: string[]; generos: string[]; limite: number; nomes: string[];
  zonas: number[]; turnos: number[];
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
  for (const [c, kw] of Object.entries(CARGOS_MAP)) { if (kw.some(k => lower.includes(k))) cargos.push(c); }
  const situacoes: string[] = [];
  for (const [s, kw] of Object.entries(SITUACOES_MAP)) { if (kw.some(k => lower.includes(k))) situacoes.push(s); }
  const partidos: string[] = [];
  for (const p of PARTIDOS_CONHECIDOS) {
    if (new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) partidos.push(p);
  }
  const municipios: string[] = [];
  for (const m of MUNICIPIOS_PRINCIPAIS) {
    const n = m.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(n)) {
      municipios.push(m.includes("GOIANIA") ? "GOIÂNIA" : m.includes("APARECIDA") ? "APARECIDA DE GOIÂNIA" :
        m.includes("ANAPOLIS") ? "ANÁPOLIS" : m.includes("CATALAO") ? "CATALÃO" :
        m.includes("JATAI") ? "JATAÍ" : m);
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
// SQL BUILDER + CHART TYPE (for reports)
// =============================================

function candTable(a: number) { return `my_db.candidatos_${a}_GO`; }
function bensTable(a: number) { return `my_db.bens_candidatos_${a}_GO`; }
function votTable(a: number) { return `my_db.votacao_munzona_${a}_GO`; }
function compTable(a: number) { return `my_db.comparecimento_munzona_${a}_GO`; }
function eleitLocalTable(a: number) { return `my_db.eleitorado_local_${a}_GO`; }
function votPartTable(a: number) { return `my_db.votacao_partido_munzona_${a}_GO`; }

interface QueryPlan { sql: string; tipo_grafico: string; titulo: string; descricao: string; }

function buildWhere(e: Entities, isMun = false): string {
  const f = isMun ? "nm_municipio" : "nm_ue";
  const c: string[] = [];
  if (e.municipios.length === 1) c.push(`${f} = '${e.municipios[0]}'`);
  else if (e.municipios.length > 1) c.push(`${f} IN (${e.municipios.map(m => `'${m}'`).join(',')})`);
  if (e.cargos.length === 1) c.push(`ds_cargo ILIKE '%${e.cargos[0]}%'`);
  if (e.turnos.length === 1) c.push(`nr_turno = ${e.turnos[0]}`);
  if (e.generos.length === 1) c.push(`ds_genero = '${e.generos[0]}'`);
  if (e.situacoes.length === 1) c.push(`ds_sit_tot_turno ILIKE '%${e.situacoes[0]}%'`);
  if (e.partidos.length === 1) c.push(`sg_partido = '${e.partidos[0]}'`);
  else if (e.partidos.length > 1) c.push(`sg_partido IN (${e.partidos.map(p => `'${p}'`).join(',')})`);
  return c.length ? `WHERE ${c.join(' AND ')}` : '';
}

function buildQuery(intent: Intent, e: Entities): QueryPlan | null {
  const ano = e.anos[0] || 2024;
  const mun = e.municipios[0] || 'GOIÂNIA';
  const lbl = e.municipios[0] || 'Goiás';

  switch (intent) {
    case "ranking_votos": {
      const w = buildWhere(e, true);
      return { sql: `SELECT nm_urna_candidato AS candidato, sg_partido AS partido, sum(qt_votos_nominais) AS total_votos FROM ${votTable(ano)} ${w} GROUP BY nm_urna_candidato, sg_partido ORDER BY total_votos DESC LIMIT ${e.limite}`, tipo_grafico: "bar", titulo: `Top ${e.limite} mais votados — ${lbl} ${ano}`, descricao: `Ranking por votos` };
    }
    case "ranking_patrimonio":
      return { sql: `SELECT c.nm_urna_candidato AS candidato, c.sg_partido AS partido, sum(CAST(REPLACE(b.vr_bem_candidato,',','.')AS DOUBLE)) AS patrimonio FROM ${bensTable(ano)} b JOIN ${candTable(ano)} c ON b.sq_candidato=c.sq_candidato ${e.municipios.length?`WHERE c.nm_ue='${mun}'`:''} GROUP BY c.nm_urna_candidato,c.sg_partido ORDER BY patrimonio DESC LIMIT ${e.limite}`, tipo_grafico: "bar", titulo: `Maior patrimônio — ${ano}`, descricao: `Patrimônio declarado` };
    case "patrimonio_candidato":
      if (e.nomes.length > 0) {
        return { sql: `SELECT ds_tipo_bem_candidato AS tipo, ds_bem_candidato AS descricao, CAST(REPLACE(vr_bem_candidato,',','.')AS DOUBLE) AS valor FROM ${bensTable(ano)} WHERE sq_candidato IN (SELECT sq_candidato FROM ${candTable(ano)} WHERE nm_urna_candidato ILIKE '%${e.nomes[0]}%') ORDER BY valor DESC LIMIT 50`, tipo_grafico: "table", titulo: `Bens — ${e.nomes[0]}`, descricao: `Bens declarados` };
      }
      return buildQuery("ranking_patrimonio", e);
    case "total_candidatos": {
      const w = buildWhere(e);
      return { sql: `SELECT ds_cargo AS cargo, count(*) AS total, count(CASE WHEN ds_genero='FEMININO' THEN 1 END) AS mulheres, count(CASE WHEN ds_genero='MASCULINO' THEN 1 END) AS homens FROM ${candTable(ano)} ${w} GROUP BY ds_cargo ORDER BY total DESC`, tipo_grafico: "table", titulo: `Candidatos — ${lbl} ${ano}`, descricao: `Por cargo` };
    }
    case "comparecimento": {
      const w = buildWhere(e, true);
      return { sql: `SELECT nm_municipio AS municipio, sum(qt_aptos) AS eleitores, sum(qt_comparecimento) AS comparecimento, ROUND(sum(qt_comparecimento)*100.0/NULLIF(sum(qt_aptos),0),1) AS taxa FROM ${compTable(ano)} ${w} GROUP BY nm_municipio ORDER BY eleitores DESC LIMIT 50`, tipo_grafico: "bar", titulo: `Comparecimento — ${ano}`, descricao: `Por município` };
    }
    case "abstencao": {
      const w = buildWhere(e, true);
      return { sql: `SELECT nm_municipio AS municipio, sum(qt_abstencoes) AS abstencoes, ROUND(sum(qt_abstencoes)*100.0/NULLIF(sum(qt_aptos),0),1) AS taxa FROM ${compTable(ano)} ${w} GROUP BY nm_municipio ORDER BY taxa DESC LIMIT 30`, tipo_grafico: "bar", titulo: `Abstenção — ${ano}`, descricao: `Por município` };
    }
    case "evolucao": {
      const anos = [2014, 2016, 2018, 2020, 2022, 2024];
      return { sql: `SELECT * FROM (${anos.map(a => `SELECT ${a} AS ano, sum(qt_aptos) AS eleitores, sum(qt_comparecimento) AS comparecimento FROM ${compTable(a)} WHERE nm_municipio='${mun}' AND nr_turno=1`).join(' UNION ALL ')}) ORDER BY ano`, tipo_grafico: "line", titulo: `Evolução — ${mun}`, descricao: `Série histórica` };
    }
    case "distribuicao_genero": {
      const w = buildWhere(e);
      return { sql: `SELECT ds_genero AS genero, count(*) AS total FROM ${candTable(ano)} ${w} GROUP BY ds_genero ORDER BY total DESC`, tipo_grafico: "pie", titulo: `Gênero — ${ano}`, descricao: `Distribuição` };
    }
    case "distribuicao_instrucao": {
      const w = buildWhere(e);
      return { sql: `SELECT ds_grau_instrucao AS escolaridade, count(*) AS total FROM ${candTable(ano)} ${w} GROUP BY ds_grau_instrucao ORDER BY total DESC`, tipo_grafico: "bar", titulo: `Escolaridade — ${ano}`, descricao: `Por grau de instrução` };
    }
    case "distribuicao_ocupacao": {
      const w = buildWhere(e);
      return { sql: `SELECT ds_ocupacao AS ocupacao, count(*) AS total FROM ${candTable(ano)} ${w} GROUP BY ds_ocupacao ORDER BY total DESC LIMIT 15`, tipo_grafico: "bar", titulo: `Ocupações — ${ano}`, descricao: `Top profissões` };
    }
    case "distribuicao_idade": {
      const w = buildWhere(e);
      const wc = w ? `${w} AND dt_nascimento IS NOT NULL` : "WHERE dt_nascimento IS NOT NULL";
      return { sql: `SELECT CASE WHEN age<=25 THEN '18-25' WHEN age<=35 THEN '26-35' WHEN age<=45 THEN '36-45' WHEN age<=55 THEN '46-55' WHEN age<=65 THEN '56-65' ELSE '66+' END AS faixa, count(*) AS total FROM (SELECT CAST(EXTRACT(YEAR FROM AGE(CURRENT_DATE,TRY_CAST(dt_nascimento AS DATE)))AS INT) as age FROM ${candTable(ano)} ${wc}) sub WHERE age BETWEEN 18 AND 120 GROUP BY faixa ORDER BY faixa`, tipo_grafico: "bar", titulo: `Faixa etária — ${ano}`, descricao: `Distribuição` };
    }
    case "bairro_comparecimento":
      return { sql: `SELECT nm_bairro AS bairro, count(DISTINCT nr_local_votacao) AS locais, sum(qt_eleitor_secao) AS eleitores FROM ${eleitLocalTable(ano)} WHERE nm_municipio='${mun}' AND nm_bairro IS NOT NULL AND nm_bairro!='' GROUP BY nm_bairro ORDER BY eleitores DESC LIMIT 30`, tipo_grafico: "bar", titulo: `Bairros — ${mun} ${ano}`, descricao: `Eleitores por bairro` };
    case "busca_candidato": {
      if (e.nomes.length > 0) {
        return { sql: `SELECT nm_urna_candidato AS candidato, sg_partido AS partido, ds_cargo AS cargo, nm_ue AS municipio, ds_sit_tot_turno AS situacao, ds_genero AS genero FROM ${candTable(ano)} WHERE (nm_urna_candidato ILIKE '%${e.nomes[0]}%' OR nm_candidato ILIKE '%${e.nomes[0]}%') LIMIT 20`, tipo_grafico: "table", titulo: `Busca: ${e.nomes[0]}`, descricao: `Candidatos` };
      }
      const w = buildWhere(e);
      return { sql: `SELECT nm_urna_candidato AS candidato, sg_partido AS partido, ds_cargo AS cargo, ds_sit_tot_turno AS situacao FROM ${candTable(ano)} ${w} ORDER BY nm_urna_candidato LIMIT 30`, tipo_grafico: "table", titulo: `Candidatos — ${lbl} ${ano}`, descricao: `` };
    }
    case "votos_por_zona":
      return { sql: `SELECT nr_zona AS zona, sum(qt_aptos) AS eleitores, sum(qt_comparecimento) AS comparecimento FROM ${compTable(ano)} WHERE nm_municipio='${mun}' GROUP BY nr_zona ORDER BY zona`, tipo_grafico: "bar", titulo: `Zonas — ${mun} ${ano}`, descricao: `Por zona eleitoral` };
    case "comparativo_partidos": {
      if (e.partidos.length >= 2) {
        const pList = e.partidos.map(p => `'${p}'`).join(',');
        return { sql: `SELECT sg_partido AS partido, sum(qt_votos_nominais) AS votos_nominais, sum(qt_votos_legenda) AS votos_legenda FROM ${votPartTable(ano)} WHERE sg_partido IN (${pList}) ${e.municipios.length?`AND nm_municipio='${mun}'`:''} GROUP BY sg_partido ORDER BY votos_nominais DESC`, tipo_grafico: "bar", titulo: `${e.partidos.join(' × ')} — ${ano}`, descricao: `Comparativo` };
      }
      return buildQuery("partidos_ranking", e);
    }
    case "partidos_ranking":
      return { sql: `SELECT sg_partido AS partido, sum(qt_votos_nominais) AS votos FROM ${votPartTable(ano)} ${e.municipios.length?`WHERE nm_municipio='${mun}'`:''} GROUP BY sg_partido ORDER BY votos DESC LIMIT ${e.limite}`, tipo_grafico: "bar", titulo: `Ranking partidos — ${lbl} ${ano}`, descricao: `Por votos` };
    case "locais_votacao":
      return { sql: `SELECT nm_local_votacao AS local, nm_bairro AS bairro, ds_endereco AS endereco, sum(qt_eleitor_secao) AS eleitores FROM ${eleitLocalTable(ano)} WHERE nm_municipio='${mun}' GROUP BY nm_local_votacao,nm_bairro,ds_endereco ORDER BY eleitores DESC LIMIT 30`, tipo_grafico: "table", titulo: `Locais de votação — ${mun} ${ano}`, descricao: `Escolas e colégios` };
    case "resumo_eleicao": {
      const w = buildWhere(e);
      return { sql: `SELECT count(*) AS total_candidatos, count(CASE WHEN ds_sit_tot_turno ILIKE '%ELEITO%' AND ds_sit_tot_turno NOT ILIKE '%NÃO ELEITO%' THEN 1 END) AS eleitos, count(CASE WHEN ds_genero='FEMININO' THEN 1 END) AS mulheres, count(DISTINCT sg_partido) AS partidos FROM ${candTable(ano)} ${w}`, tipo_grafico: "kpi", titulo: `Resumo — ${lbl} ${ano}`, descricao: `Visão geral` };
    }
    case "comparativo_anos": {
      const anos = [2016, 2018, 2020, 2022, 2024];
      const mc = e.municipios.length ? `WHERE nm_ue='${mun}'` : '';
      return { sql: `SELECT * FROM (${anos.map(a => `SELECT ${a} AS ano, count(*) AS candidatos, count(CASE WHEN ds_sit_tot_turno ILIKE '%ELEITO%' AND ds_sit_tot_turno NOT ILIKE '%NÃO ELEITO%' THEN 1 END) AS eleitos FROM ${candTable(a)} ${mc}`).join(' UNION ALL ')}) ORDER BY ano`, tipo_grafico: "line", titulo: `Comparativo — ${lbl}`, descricao: `Evolução entre eleições` };
    }
    default:
      return null;
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

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
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

    // ── STEP 1: Algorithmic detection (FREE, no AI) ──
    const lower = pergunta.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const intent = detectIntent(lower);
    const entities = extractEntities(pergunta);
    if (entities.anos.length === 0) entities.anos = [2024];

    let plan = buildQuery(intent, entities);
    let usedAI = false;

    // ── STEP 2: Only call Lovable AI for unknown patterns ──
    if (!plan || intent === "generico") {
      const sqlPrompt = `Gere SQL DuckDB. Use APENAS colunas listadas. NUNCA invente.
Escolha tipo_grafico: bar|pie|line|area|table|kpi
Responda APENAS JSON: {"sql":"SELECT ...","tipo_grafico":"...","titulo":"...","descricao":"..."}
${SCHEMA_COMPLETO}`;

      const raw = await callLovableAI(sqlPrompt, pergunta, lovableKey, 800);
      if (raw?.startsWith("ERROR:")) {
        const status = raw.split(":")[1];
        if (status === "429") {
          return new Response(JSON.stringify({ erro: "Limite de requisições. Aguarde." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === "402") {
          return new Response(JSON.stringify({ erro: "Créditos esgotados." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      if (raw && !raw.startsWith("ERROR:")) {
        try {
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) {
            const p = JSON.parse(match[0]);
            if (p.sql) { plan = p as QueryPlan; usedAI = true; }
          }
        } catch {}
      }
    }

    if (!plan) {
      return new Response(JSON.stringify({
        sucesso: true, resposta_texto: "Não entendi. Tente perguntar sobre candidatos, votos, partidos, comparecimento, patrimônio ou bairros.",
        tipo_grafico: "table", titulo: "Não entendi", descricao: "", colunas: [], dados: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Safety
    const sqlUp = plan.sql.toUpperCase().trim();
    if (!sqlUp.startsWith("SELECT") && !sqlUp.startsWith("WITH")) {
      return new Response(JSON.stringify({ erro: "Query não permitida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (["DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "TRUNCATE", "CREATE"].some(f => sqlUp.includes(f))) {
      return new Response(JSON.stringify({ erro: "Operação proibida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STEP 3: Execute ──
    const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
    async function exec(q: string) {
      const pg = postgres({
        hostname: "pg.us-east-1-aws.motherduck.com",
        port: 5432, username: "postgres", password: mdToken,
        database: "md:", ssl: "require",
        connection: { application_name: "eleicoesgo-relatorios" },
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
    try {
      dados = await exec(plan.sql);
    } catch (queryErr: any) {
      console.error("Query error:", queryErr.message, "SQL:", plan.sql);
      // Retry with AI correction
      if (lovableKey) {
        const retryRaw = await callLovableAI(
          `SQL falhou. Corrija usando APENAS colunas existentes.\n${SCHEMA_COMPLETO}\nResponda APENAS JSON: {"sql":"SELECT ...","tipo_grafico":"...","titulo":"...","descricao":"..."}`,
          `Pergunta: "${pergunta}"\nSQL: ${plan.sql}\nErro: ${queryErr.message}`,
          lovableKey, 800
        );
        if (retryRaw && !retryRaw.startsWith("ERROR:")) {
          try {
            const m = retryRaw.match(/\{[\s\S]*\}/);
            if (m) {
              const rp = JSON.parse(m[0]);
              if (rp.sql) {
                dados = await exec(rp.sql);
                plan = rp;
              } else throw new Error("no sql");
            } else throw new Error("no match");
          } catch {
            return new Response(JSON.stringify({ sucesso: false, erro: "Não consegui consultar. Reformule." }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else {
          return new Response(JSON.stringify({ sucesso: false, erro: "Erro na consulta." }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        return new Response(JSON.stringify({ sucesso: false, erro: queryErr.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const colunas = dados.length > 0 ? Object.keys(dados[0]) : [];
    let resposta = plan.descricao || plan.titulo;
    if (dados.length === 0) {
      resposta = `Nenhum dado encontrado para "${pergunta}".`;
    } else {
      resposta = `${plan.titulo}: ${dados.length} resultado(s). ${plan.descricao}`;
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

  } catch (e: any) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ erro: e.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
