const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================
// GEMINI NORMALIZER (Query Rewriting only)
// =============================================

const GEMINI_SYSTEM_PROMPT = `Você é um normalizador de buscas eleitorais do estado de Goiás, Brasil.
Leia a pergunta do usuário e extraia apenas as palavras-chave no formato:
[INTENÇÃO], [CARGO], [MUNICIPIO], [ANO]

Intenções válidas: ranking_votos, ranking_patrimonio, patrimonio, total_candidatos, comparecimento, abstencao, evolucao, comparativo_partidos, distribuicao_genero, distribuicao_instrucao, distribuicao_ocupacao, distribuicao_idade, bairro_comparecimento, busca_candidato, votos_por_zona, partidos_ranking, locais_votacao, resumo_eleicao, comparativo_anos, perfil_genero, escolaridade

Cargos válidos: prefeito, vereador, governador, deputado estadual, deputado federal, senador, presidente

Municípios comuns: Goiânia, Aparecida de Goiânia, Anápolis, Rio Verde, Luziânia, Valparaíso de Goiás, Trindade, Formosa, Senador Canedo, Catalão, Itumbiara, Jataí

Se não identificar algum campo, omita-o.
Se o usuário perguntar "quem é o mais rico", a intenção é "ranking_patrimonio".
Se o usuário perguntar sobre "escolaridade" ou "instrução", a intenção é "distribuicao_instrucao".
Se houver nome de candidato entre aspas, inclua como [NOME_CANDIDATO].
Se houver partido (PL, PT, MDB etc), inclua como [PARTIDO].

Exemplos:
- "quem é o mais rico em aparecida?" -> "ranking_patrimonio, prefeito, Aparecida de Goiânia, 2024"
- "ranking de votos vereador goiânia 2020" -> "ranking_votos, vereador, Goiânia, 2020"
- "quantas mulheres candidatas em 2024?" -> "distribuicao_genero, , , 2024"
- "comparecimento por bairro em goiânia" -> "bairro_comparecimento, , Goiânia, 2024"
- "patrimônio do candidato \"JOÃO SILVA\"" -> "patrimonio, , , 2024, JOÃO SILVA"

Responda APENAS com as palavras-chave separadas por vírgula. Nada mais.`;

async function callGeminiNormalizer(userQuestion: string): Promise<string | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.warn("[Normalizer] GEMINI_API_KEY não configurada, usando fallback direto");
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${GEMINI_SYSTEM_PROMPT}\n\nPergunta do usuário: "${userQuestion}"` }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 100,
          },
        }),
      }
    );

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Normalizer] Gemini HTTP ${res.status}:`, errText);
      return null; // fallback silencioso
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    return text;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      console.warn("[Normalizer] Gemini timeout (3s), usando fallback");
    } else {
      console.error("[Normalizer] Gemini error:", err.message);
    }
    return null; // fallback silencioso
  }
}

// =============================================
// ENTITY / INTENT ENGINE (deterministic)
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
// SQL BUILDER (100% deterministic, zero-AI)
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
        ${e.cargos.length ? `${e.municipios.length ? 'AND' : 'WHERE'} c.ds_cargo ILIKE '%${e.cargos[0]}%'` : ''}
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
// MARKDOWN TABLE FORMATTER (zero-AI)
// =============================================

function jsonToMarkdownTable(dados: Record<string, any>[], maxRows = 20): string {
  if (!dados.length) return "";
  const cols = Object.keys(dados[0]);
  const header = `| ${cols.map(c => c.replace(/_/g, ' ')).join(' | ')} |`;
  const separator = `| ${cols.map(() => '---').join(' | ')} |`;
  const rows = dados.slice(0, maxRows).map(row =>
    `| ${cols.map(c => {
      const v = row[c];
      if (v === null || v === undefined) return '—';
      if (typeof v === 'number') return v.toLocaleString('pt-BR');
      return String(v);
    }).join(' | ')} |`
  );
  return `${header}\n${separator}\n${rows.join('\n')}`;
}

function formatResult(intent: Intent, entities: Entities, dados: Record<string, any>[]): string {
  const ano = entities.anos[0] || 2024;
  const mun = entities.municipios[0] || "Goiás";

  if (dados.length === 0) {
    return "Não encontrei resultados para essa consulta. Tente reformular ou verificar os filtros (ano, município, cargo).";
  }

  const cols = Object.keys(dados[0]);

  // Single-row KPI
  if (dados.length === 1 && cols.length <= 6) {
    const lines = cols.map(c => {
      const v = dados[0][c];
      const formatted = typeof v === 'number' ? v.toLocaleString('pt-BR') : v;
      return `- **${c.replace(/_/g, ' ')}**: ${formatted}`;
    });
    return `📊 **Resultado — ${mun} ${ano}**\n\n${lines.join('\n')}`;
  }

  // Multi-row table
  let text = `📊 **${mun} ${ano}** — ${dados.length} resultado(s)\n\n`;
  text += jsonToMarkdownTable(dados, 20);
  if (dados.length > 20) text += `\n\n*...e mais ${dados.length - 20} resultados.*`;
  return text;
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

    const mdToken = Deno.env.get("MOTHERDUCK_TOKEN");
    if (!mdToken) {
      return new Response(JSON.stringify({ erro: "MOTHERDUCK_TOKEN não configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STEP 1: Gemini Normalizer (Query Rewriting) with fallback ──
    console.log(`[Pipeline] Input original: "${pergunta}"`);

    let inputParaAnalise = pergunta;
    let geminiUsado = false;

    try {
      const normalizado = await callGeminiNormalizer(pergunta);
      if (normalizado) {
        inputParaAnalise = normalizado;
        geminiUsado = true;
        console.log(`[Pipeline] Input normalizado pelo Gemini: "${normalizado}"`);
      } else {
        console.log("[Pipeline] Gemini não retornou, usando input original");
      }
    } catch (err: any) {
      console.warn("[Pipeline] Fallback: Gemini falhou, usando input original:", err.message);
    }

    // ── STEP 2: Deterministic intent + entity detection ──
    const textForDetection = `${pergunta} ${inputParaAnalise}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const intent = detectIntent(textForDetection);
    const entities = extractEntities(`${pergunta} ${inputParaAnalise}`);
    if (entities.anos.length === 0) entities.anos = [2024];

    console.log(`[Pipeline] Intent: ${intent} | Entities:`, JSON.stringify({
      anos: entities.anos,
      municipios: entities.municipios,
      cargos: entities.cargos,
      partidos: entities.partidos,
      nomes: entities.nomes,
    }));

    // ── STEP 3: Build SQL (100% deterministic) ──
    const sql = buildSQL(intent, entities);

    if (!sql) {
      return new Response(JSON.stringify({
        sucesso: true,
        resposta: "Não entendi sua pergunta. Tente perguntar sobre:\n\n" +
          "- 📊 **Ranking de votos** — ex: \"top 10 mais votados em Goiânia 2024\"\n" +
          "- 💰 **Patrimônio** — ex: \"candidatos mais ricos de Aparecida\"\n" +
          "- 📈 **Comparecimento** — ex: \"taxa de comparecimento em Goiânia\"\n" +
          "- 🏛️ **Partidos** — ex: \"ranking de partidos por votos\"\n" +
          "- 👥 **Perfil** — ex: \"distribuição por gênero dos candidatos\"\n" +
          "- 🗺️ **Bairros** — ex: \"eleitores por bairro em Goiânia\"\n" +
          "- 📋 **Resumo** — ex: \"resumo da eleição 2024\"",
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

    console.log(`[Pipeline] SQL gerado (determinístico): ${sql.substring(0, 200)}...`);

    // ── STEP 4: Execute SQL on MotherDuck ──
    const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");

    const pg = postgres({
      hostname: "pg.us-east-1-aws.motherduck.com",
      port: 5432, username: "postgres", password: mdToken,
      database: "md:", ssl: "require",
      connection: { application_name: "eleicoesgo-consulta-ia" },
      max: 1, idle_timeout: 5, connect_timeout: 15,
    });

    let dados: Record<string, any>[];
    try {
      const rows = await pg.unsafe(sql);
      dados = Array.isArray(rows) ? rows.map((r: any) => ({ ...r })) : [];
      await pg.end();
    } catch (queryErr: any) {
      await pg.end().catch(() => {});
      console.error("[Pipeline] Query error:", queryErr.message, "SQL:", sql);
      return new Response(JSON.stringify({
        sucesso: false,
        erro: "Erro ao consultar os dados. Tente reformular a pergunta.",
        sql_gerado: sql,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── STEP 5: Format response (100% TypeScript, zero-AI) ──
    const resposta = formatResult(intent, entities, dados);

    console.log(`[Pipeline] Sucesso | Gemini: ${geminiUsado ? 'SIM (normalização)' : 'NÃO (fallback)'} | Resultados: ${dados.length}`);

    return new Response(JSON.stringify({
      sucesso: true,
      resposta,
      sql_gerado: sql,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("[Pipeline] Error:", e);
    return new Response(JSON.stringify({ erro: e.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
