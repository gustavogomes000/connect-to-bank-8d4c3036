// ═══════════════════════════════════════════════════════════════
// bd-eleicoes-consulta-ia — Pipeline DETERMINÍSTICO
// Gemini = normalização de texto APENAS. SQL = 100% TypeScript.
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── ROTEADOR DE TABELAS (espelho do motherduck.ts) ──

const DATASET_MAP: Record<string, { prefix: string; anos: number[]; sufixo: 'UF' | 'NAC' }> = {
  candidatos:          { prefix: 'consulta_cand',             anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  bens:                { prefix: 'bem_candidato',             anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  votacao:             { prefix: 'votacao_candidato_munzona',  anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  votacao_partido:     { prefix: 'votacao_partido_munzona',    anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  detalhe_munzona:     { prefix: 'detalhe_votacao_munzona',    anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  detalhe_secao:       { prefix: 'detalhe_votacao_secao',      anos: [2014,2016,2020,2022,2024],      sufixo: 'UF' },
  eleitorado_local:    { prefix: 'eleitorado_local_votacao',   anos: [2014,2016,2018,2020,2024],      sufixo: 'NAC' },
  perfil_eleitorado:   { prefix: 'perfil_eleitorado',          anos: [2014,2016,2018,2020,2024],      sufixo: 'NAC' },
  receitas:            { prefix: 'receitas_candidatos',        anos: [2014,2018,2020,2022,2024],      sufixo: 'UF' },
  despesas_contratadas:{ prefix: 'despesas_contratadas_candidatos', anos: [2018,2020,2022,2024],      sufixo: 'UF' },
  despesas_pagas:      { prefix: 'despesas_pagas_candidatos',  anos: [2018,2020,2022,2024],           sufixo: 'UF' },
};

function T(dataset: string, ano: number, uf = 'GO'): string {
  const c = DATASET_MAP[dataset];
  if (!c) throw new Error(`Dataset desconhecido: ${dataset}`);
  if (!c.anos.includes(ano)) throw new Error(`Ano ${ano} indisponível para ${dataset}`);
  return c.sufixo === 'NAC' ? `my_db.${c.prefix}_${ano}` : `my_db.${c.prefix}_${ano}_${uf}`;
}

// ── GEMINI NORMALIZER (texto → keywords, NÃO gera SQL) ──

async function callGeminiNormalizer(question: string): Promise<string | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Você é um normalizador de buscas eleitorais de Goiás.
Extraia palavras-chave: [INTENÇÃO], [CARGO], [MUNICIPIO], [ANO], [NOME_CANDIDATO]
Intenções: ranking_votos, ranking_patrimonio, patrimonio_candidato, total_candidatos, comparecimento, abstencao, evolucao, distribuicao_genero, distribuicao_instrucao, distribuicao_ocupacao, bairro_comparecimento, busca_candidato, votos_por_zona, partidos_ranking, comparativo_partidos, resumo_eleicao
Responda APENAS keywords separadas por vírgula.

Pergunta: "${question}"` }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 100 },
        }),
      }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch { clearTimeout(timer); return null; }
}

// ── DETECÇÃO DE INTENÇÃO + ENTIDADES (algorítmico, zero IA) ──

const CARGOS: Record<string, string[]> = {
  "PREFEITO": ["prefeito","prefeita","prefeitura"],
  "VEREADOR": ["vereador","vereadora","vereadores","câmara","camara"],
  "GOVERNADOR": ["governador","governadora"],
  "DEPUTADO ESTADUAL": ["deputado estadual","deputada estadual"],
  "DEPUTADO FEDERAL": ["deputado federal","deputada federal"],
  "SENADOR": ["senador","senadora"],
  "PRESIDENTE": ["presidente"],
};

const PARTIDOS = ["PT","PL","MDB","PSDB","PP","PSD","UNIÃO","REPUBLICANOS","PDT","PSB","PODE","PSOL","AVANTE","SOLIDARIEDADE","CIDADANIA","PCdoB","PV","REDE","NOVO","AGIR","MOBILIZA","PRD","UNIÃO BRASIL"];

const MUNICIPIOS = [
  "GOIÂNIA","GOIANIA","APARECIDA DE GOIÂNIA","APARECIDA DE GOIANIA",
  "ANÁPOLIS","ANAPOLIS","RIO VERDE","LUZIÂNIA","LUZIANIA",
  "TRINDADE","FORMOSA","SENADOR CANEDO","CATALÃO","CATALAO",
  "ITUMBIARA","JATAÍ","JATAI","PLANALTINA","CALDAS NOVAS",
];

function normalizeMun(m: string): string {
  if (m.includes("GOIANIA")) return "GOIÂNIA";
  if (m.includes("APARECIDA")) return "APARECIDA DE GOIÂNIA";
  if (m.includes("ANAPOLIS")) return "ANÁPOLIS";
  if (m.includes("CATALAO")) return "CATALÃO";
  if (m.includes("JATAI")) return "JATAÍ";
  return m;
}

type Intent = "ranking_votos"|"ranking_patrimonio"|"patrimonio_candidato"|"total_candidatos"|"comparecimento"|"abstencao"|"evolucao"|"distribuicao_genero"|"distribuicao_instrucao"|"distribuicao_ocupacao"|"bairro_comparecimento"|"busca_candidato"|"votos_por_zona"|"partidos_ranking"|"comparativo_partidos"|"resumo_eleicao"|"comparativo_anos"|"locais_votacao"|"generico";

interface Entities {
  anos: number[]; municipios: string[]; partidos: string[]; cargos: string[];
  situacoes: string[]; generos: string[]; limite: number; nomes: string[];
  zonas: number[]; turnos: number[];
}

function detectIntent(text: string): Intent {
  const has = (...w: string[]) => w.some(x => text.includes(x));
  if (has("patrimônio","patrimonio","bens","mais rico")) return has("ranking","top","maiores") ? "ranking_patrimonio" : "patrimonio_candidato";
  if (has("comparecimento","presença","presenca")) { if (has("bairro")) return "bairro_comparecimento"; if (has("evolução","evolucao","histórico")) return "evolucao"; return "comparecimento"; }
  if (has("abstenção","abstencao")) return "abstencao";
  if (has("evolução","evolucao","tendência","histórico")) return "evolucao";
  if (has("gênero","genero","feminino","masculino")) return "distribuicao_genero";
  if (has("escolaridade","instrução","instrucao")) return "distribuicao_instrucao";
  if (has("ocupação","ocupacao","profissão")) return "distribuicao_ocupacao";
  if (has("local de votação","colégio","colegio","escola")) return "locais_votacao";
  if (has("zona") && has("voto")) return "votos_por_zona";
  if (has("comparar","comparativo","versus") && has("partido")) return "comparativo_partidos";
  if (has("comparar","comparativo") && has("ano","eleição")) return "comparativo_anos";
  if (has("resumo","panorama","visão geral")) return "resumo_eleicao";
  if (has("partido") && has("ranking","top")) return "partidos_ranking";
  if (has("ranking","top","mais votado","mais votados")) return "ranking_votos";
  if (has("quantos","quantas","total de candidatos")) return "total_candidatos";
  if (has("bairro") && has("votação","eleitores")) return "bairro_comparecimento";
  if (has("candidato","perfil de","quem é")) return "busca_candidato";
  if (has("partido") && has("voto","desempenho")) return "partidos_ranking";
  return "generico";
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
  for (const [c, kw] of Object.entries(CARGOS)) { if (kw.some(k => lower.includes(k))) cargos.push(c); }
  const partidos: string[] = [];
  for (const p of PARTIDOS) { if (new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) partidos.push(p); }
  const municipios: string[] = [];
  for (const m of MUNICIPIOS) {
    const n = m.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(n)) municipios.push(normalizeMun(m));
  }
  const generos: string[] = [];
  if (lower.includes("mulher") || lower.includes("feminino") || lower.includes("candidatas")) generos.push("FEMININO");
  if (lower.includes("homem") || lower.includes("masculino")) generos.push("MASCULINO");
  const situacoes: string[] = [];
  if (lower.includes("eleito") || lower.includes("ganhou") || lower.includes("venceu")) situacoes.push("ELEITO");
  if (lower.includes("não eleito") || lower.includes("perdeu")) situacoes.push("NÃO ELEITO");
  const zonaMatch = text.match(/zona\s*(\d+)/gi);
  const zonas = zonaMatch ? zonaMatch.map(z => parseInt(z.replace(/\D/g, ''))) : [];
  const nomes: string[] = [];
  const quoted = text.match(/"([^"]+)"/g);
  if (quoted) nomes.push(...quoted.map(q => q.replace(/"/g, '').toUpperCase()));
  return { anos: [...new Set(anos)], municipios: [...new Set(municipios)], partidos: [...new Set(partidos)], cargos: [...new Set(cargos)], situacoes: [...new Set(situacoes)], generos: [...new Set(generos)], limite, nomes, zonas: [...new Set(zonas)], turnos: [...new Set(turnos)] };
}

// ── SQL BUILDER (100% determinístico, usa T() para tabelas) ──

function buildWhere(e: Entities, munField = "NM_UE"): string {
  const c: string[] = [];
  if (e.municipios.length === 1) c.push(`${munField} = '${e.municipios[0]}'`);
  else if (e.municipios.length > 1) c.push(`${munField} IN (${e.municipios.map(m => `'${m}'`).join(',')})`);
  if (e.cargos.length === 1) c.push(`DS_CARGO ILIKE '%${e.cargos[0]}%'`);
  if (e.turnos.length === 1) c.push(`NR_TURNO = ${e.turnos[0]}`);
  if (e.generos.length === 1) c.push(`DS_GENERO = '${e.generos[0]}'`);
  if (e.situacoes.length === 1) c.push(`DS_SIT_TOT_TURNO ILIKE '%${e.situacoes[0]}%'`);
  if (e.partidos.length === 1) c.push(`SG_PARTIDO = '${e.partidos[0]}'`);
  else if (e.partidos.length > 1) c.push(`SG_PARTIDO IN (${e.partidos.map(p => `'${p}'`).join(',')})`);
  return c.length ? `WHERE ${c.join(' AND ')}` : '';
}

function buildSQL(intent: Intent, e: Entities): string {
  const ano = e.anos[0] || 2024;
  const mun = e.municipios[0] || 'GOIÂNIA';

  switch (intent) {
    case "ranking_votos": {
      const conds: string[] = [];
      if (e.municipios.length) conds.push(`NM_MUNICIPIO = '${mun}'`);
      if (e.cargos.length) conds.push(`DS_CARGO ILIKE '%${e.cargos[0]}%'`);
      const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return `SELECT SG_PARTIDO AS partido, NM_PARTIDO AS nome_partido, SUM(QT_VOTOS_NOMINAIS_VALIDOS) AS votos_nominais, SUM(QT_VOTOS_LEGENDA_VALIDOS) AS votos_legenda FROM ${T('votacao_partido', ano)} ${w} GROUP BY SG_PARTIDO, NM_PARTIDO ORDER BY votos_nominais DESC LIMIT ${e.limite}`;
    }
    case "ranking_patrimonio": {
      const conds: string[] = [];
      if (e.municipios.length) conds.push(`c.NM_UE = '${mun}'`);
      if (e.cargos.length) conds.push(`c.DS_CARGO ILIKE '%${e.cargos[0]}%'`);
      const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return `SELECT c.NM_URNA_CANDIDATO AS candidato, c.SG_PARTIDO AS partido, SUM(CAST(REPLACE(b.VR_BEM_CANDIDATO,',','.')AS DOUBLE)) AS patrimonio FROM ${T('bens', ano)} b JOIN ${T('candidatos', ano)} c ON b.SQ_CANDIDATO=c.SQ_CANDIDATO ${w} GROUP BY c.NM_URNA_CANDIDATO, c.SG_PARTIDO ORDER BY patrimonio DESC LIMIT ${e.limite}`;
    }
    case "patrimonio_candidato": {
      if (e.nomes.length > 0) {
        return `SELECT DS_TIPO_BEM_CANDIDATO AS tipo, DS_BEM_CANDIDATO AS descricao, CAST(REPLACE(VR_BEM_CANDIDATO,',','.')AS DOUBLE) AS valor FROM ${T('bens', ano)} WHERE SQ_CANDIDATO IN (SELECT SQ_CANDIDATO FROM ${T('candidatos', ano)} WHERE NM_URNA_CANDIDATO ILIKE '%${e.nomes[0]}%') ORDER BY valor DESC LIMIT 50`;
      }
      return buildSQL("ranking_patrimonio", e);
    }
    case "total_candidatos": {
      const w = buildWhere(e);
      return `SELECT DS_CARGO AS cargo, COUNT(*) AS total, COUNT(CASE WHEN DS_GENERO='FEMININO' THEN 1 END) AS mulheres, COUNT(CASE WHEN DS_GENERO='MASCULINO' THEN 1 END) AS homens FROM ${T('candidatos', ano)} ${w} GROUP BY DS_CARGO ORDER BY total DESC`;
    }
    case "comparecimento": {
      const w = buildWhere(e, "NM_MUNICIPIO");
      return `SELECT NM_MUNICIPIO AS municipio, SUM(QT_APTOS) AS eleitores, SUM(QT_COMPARECIMENTO) AS comparecimento, ROUND(SUM(QT_COMPARECIMENTO)*100.0/NULLIF(SUM(QT_APTOS),0),1) AS taxa FROM ${T('detalhe_munzona', ano)} ${w} GROUP BY NM_MUNICIPIO ORDER BY eleitores DESC LIMIT 50`;
    }
    case "abstencao": {
      const w = buildWhere(e, "NM_MUNICIPIO");
      return `SELECT NM_MUNICIPIO AS municipio, SUM(QT_ABSTENCOES) AS abstencoes, ROUND(SUM(QT_ABSTENCOES)*100.0/NULLIF(SUM(QT_APTOS),0),1) AS taxa FROM ${T('detalhe_munzona', ano)} ${w} GROUP BY NM_MUNICIPIO ORDER BY taxa DESC LIMIT 30`;
    }
    case "evolucao": {
      const anos = [2014,2016,2018,2020,2022,2024];
      return `SELECT * FROM (${anos.map(a => `SELECT ${a} AS ano, SUM(QT_APTOS) AS eleitores, SUM(QT_COMPARECIMENTO) AS comparecimento FROM ${T('detalhe_munzona', a)} WHERE NM_MUNICIPIO='${mun}' AND NR_TURNO=1`).join(' UNION ALL ')}) ORDER BY ano`;
    }
    case "distribuicao_genero": {
      const w = buildWhere(e);
      return `SELECT DS_GENERO AS genero, COUNT(*) AS total FROM ${T('candidatos', ano)} ${w} GROUP BY DS_GENERO ORDER BY total DESC`;
    }
    case "distribuicao_instrucao": {
      const w = buildWhere(e);
      return `SELECT DS_GRAU_INSTRUCAO AS escolaridade, COUNT(*) AS total FROM ${T('candidatos', ano)} ${w} GROUP BY DS_GRAU_INSTRUCAO ORDER BY total DESC`;
    }
    case "distribuicao_ocupacao": {
      const w = buildWhere(e);
      return `SELECT DS_OCUPACAO AS ocupacao, COUNT(*) AS total FROM ${T('candidatos', ano)} ${w} GROUP BY DS_OCUPACAO ORDER BY total DESC LIMIT 15`;
    }
    case "bairro_comparecimento":
      return `SELECT NM_BAIRRO AS bairro, COUNT(DISTINCT NM_LOCAL_VOTACAO) AS locais, SUM(QT_ELEITORES_PERFIL) AS eleitores FROM ${T('eleitorado_local', ano)} WHERE SG_UF='GO' AND NM_MUNICIPIO='${mun}' AND NM_BAIRRO IS NOT NULL AND NM_BAIRRO!='' GROUP BY NM_BAIRRO ORDER BY eleitores DESC LIMIT 30`;
    case "busca_candidato": {
      if (e.nomes.length > 0) {
        return `SELECT NM_URNA_CANDIDATO AS candidato, SG_PARTIDO AS partido, DS_CARGO AS cargo, NM_UE AS municipio, DS_SIT_TOT_TURNO AS situacao, DS_GENERO AS genero FROM ${T('candidatos', ano)} WHERE (NM_URNA_CANDIDATO ILIKE '%${e.nomes[0]}%' OR NM_CANDIDATO ILIKE '%${e.nomes[0]}%') LIMIT 20`;
      }
      const w = buildWhere(e);
      return `SELECT NM_URNA_CANDIDATO AS candidato, SG_PARTIDO AS partido, DS_CARGO AS cargo, DS_SIT_TOT_TURNO AS situacao FROM ${T('candidatos', ano)} ${w} ORDER BY NM_URNA_CANDIDATO LIMIT 30`;
    }
    case "votos_por_zona":
      return `SELECT NR_ZONA AS zona, SUM(QT_APTOS) AS eleitores, SUM(QT_COMPARECIMENTO) AS comparecimento, ROUND(SUM(QT_COMPARECIMENTO)*100.0/NULLIF(SUM(QT_APTOS),0),1) AS taxa FROM ${T('detalhe_munzona', ano)} WHERE NM_MUNICIPIO='${mun}' GROUP BY NR_ZONA ORDER BY zona`;
    case "comparativo_partidos": {
      if (e.partidos.length >= 2) {
        const pList = e.partidos.map(p => `'${p}'`).join(',');
        const mCond = e.municipios.length ? `AND NM_MUNICIPIO='${mun}'` : '';
        return `SELECT SG_PARTIDO AS partido, SUM(QT_VOTOS_NOMINAIS_VALIDOS) AS votos_nominais, SUM(QT_VOTOS_LEGENDA_VALIDOS) AS votos_legenda FROM ${T('votacao_partido', ano)} WHERE SG_PARTIDO IN (${pList}) ${mCond} GROUP BY SG_PARTIDO ORDER BY votos_nominais DESC`;
      }
      return buildSQL("partidos_ranking", e);
    }
    case "partidos_ranking": {
      const mCond = e.municipios.length ? `WHERE NM_MUNICIPIO = '${mun}'` : '';
      return `SELECT SG_PARTIDO AS partido, SUM(QT_VOTOS_NOMINAIS_VALIDOS) AS votos FROM ${T('votacao_partido', ano)} ${mCond} GROUP BY SG_PARTIDO ORDER BY votos DESC LIMIT ${e.limite}`;
    }
    case "locais_votacao":
      return `SELECT NM_LOCAL_VOTACAO AS local, NM_BAIRRO AS bairro, DS_ENDERECO AS endereco, SUM(QT_ELEITORES_PERFIL) AS eleitores FROM ${T('eleitorado_local', ano)} WHERE SG_UF='GO' AND NM_MUNICIPIO='${mun}' GROUP BY NM_LOCAL_VOTACAO,NM_BAIRRO,DS_ENDERECO ORDER BY eleitores DESC LIMIT 30`;
    case "resumo_eleicao": {
      const w = buildWhere(e);
      return `SELECT COUNT(*) AS total_candidatos, COUNT(CASE WHEN DS_SIT_TOT_TURNO ILIKE '%ELEITO%' AND DS_SIT_TOT_TURNO NOT ILIKE '%NÃO ELEITO%' THEN 1 END) AS eleitos, COUNT(CASE WHEN DS_GENERO='FEMININO' THEN 1 END) AS mulheres, COUNT(DISTINCT SG_PARTIDO) AS partidos, COUNT(DISTINCT NM_UE) AS municipios FROM ${T('candidatos', ano)} ${w}`;
    }
    case "comparativo_anos": {
      const anos = [2016,2018,2020,2022,2024];
      const mCond = e.municipios.length ? `WHERE NM_UE='${mun}'` : '';
      return `SELECT * FROM (${anos.map(a => `SELECT ${a} AS ano, COUNT(*) AS candidatos, COUNT(CASE WHEN DS_SIT_TOT_TURNO ILIKE '%ELEITO%' AND DS_SIT_TOT_TURNO NOT ILIKE '%NÃO ELEITO%' THEN 1 END) AS eleitos FROM ${T('candidatos', a)} ${mCond}`).join(' UNION ALL ')}) ORDER BY ano`;
    }
    default: return "";
  }
}

// ── MARKDOWN FORMATTER ──

function toMarkdown(dados: Record<string, any>[], max = 20): string {
  if (!dados.length) return "";
  const cols = Object.keys(dados[0]);
  const header = `| ${cols.map(c => c.replace(/_/g, ' ')).join(' | ')} |`;
  const sep = `| ${cols.map(() => '---').join(' | ')} |`;
  const rows = dados.slice(0, max).map(r => `| ${cols.map(c => { const v = r[c]; if (v === null || v === undefined) return '—'; if (typeof v === 'number') return v.toLocaleString('pt-BR'); return String(v); }).join(' | ')} |`);
  return `${header}\n${sep}\n${rows.join('\n')}`;
}

function formatResult(intent: Intent, e: Entities, dados: Record<string, any>[]): string {
  const ano = e.anos[0] || 2024;
  const mun = e.municipios[0] || "Goiás";
  if (dados.length === 0) return "Não encontrei resultados. Tente reformular ou verificar os filtros.";
  const cols = Object.keys(dados[0]);
  if (dados.length === 1 && cols.length <= 6) {
    return `📊 **${mun} ${ano}**\n\n${cols.map(c => { const v = dados[0][c]; return `- **${c.replace(/_/g,' ')}**: ${typeof v === 'number' ? v.toLocaleString('pt-BR') : v}`; }).join('\n')}`;
  }
  let text = `📊 **${mun} ${ano}** — ${dados.length} resultado(s)\n\n`;
  text += toMarkdown(dados, 20);
  if (dados.length > 20) text += `\n\n*...e mais ${dados.length - 20} resultados.*`;
  return text;
}

// ── MAIN HANDLER ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { pergunta } = await req.json();
    if (!pergunta || typeof pergunta !== "string" || pergunta.length < 3) {
      return new Response(JSON.stringify({ erro: "Pergunta inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const mdToken = Deno.env.get("MOTHERDUCK_TOKEN");
    if (!mdToken) return new Response(JSON.stringify({ erro: "MOTHERDUCK_TOKEN não configurado" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Step 1: Gemini normaliza texto (NÃO gera SQL)
    let inputParaAnalise = pergunta;
    const geminiResult = await callGeminiNormalizer(pergunta);
    if (geminiResult) {
      inputParaAnalise = geminiResult;
      console.log(`[Normalizer] "${pergunta}" → "${geminiResult}"`);
    }

    // Step 2: Detecção algorítmica
    const combined = `${pergunta} ${inputParaAnalise}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const intent = detectIntent(combined);
    const entities = extractEntities(`${pergunta} ${inputParaAnalise}`);
    if (entities.anos.length === 0) entities.anos = [2024];

    console.log(`[Pipeline] Intent: ${intent} | Entities:`, JSON.stringify({ anos: entities.anos, municipios: entities.municipios, cargos: entities.cargos }));

    // Step 3: Build SQL (100% TypeScript, ZERO IA)
    const sql = buildSQL(intent, entities);
    if (!sql) {
      return new Response(JSON.stringify({
        sucesso: true,
        resposta: "Não entendi. Pergunte sobre candidatos, votos, partidos, comparecimento, patrimônio ou bairros.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Safety
    const sqlUp = sql.toUpperCase().trim();
    if (!sqlUp.startsWith("SELECT") && !sqlUp.startsWith("WITH")) return new Response(JSON.stringify({ erro: "Query não permitida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (["DROP","DELETE","INSERT","UPDATE","ALTER","TRUNCATE","CREATE"].some(f => sqlUp.includes(f))) return new Response(JSON.stringify({ erro: "Operação proibida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Step 4: Execute
    const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
    const pg = postgres({ hostname: "pg.us-east-1-aws.motherduck.com", port: 5432, username: "postgres", password: mdToken, database: "md:", ssl: "require", connection: { application_name: "eleicoesgo-consulta-ia" }, max: 1, idle_timeout: 5, connect_timeout: 15 });

    let dados: Record<string, any>[];
    try {
      const rows = await pg.unsafe(sql);
      dados = Array.isArray(rows) ? rows.map((r: any) => ({ ...r })) : [];
      await pg.end();
    } catch (queryErr: any) {
      await pg.end().catch(() => {});
      console.error("[Pipeline] Query error:", queryErr.message, "SQL:", sql);
      return new Response(JSON.stringify({ sucesso: false, erro: "Erro ao consultar. Reformule a pergunta.", sql_gerado: sql }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 5: Format (100% TypeScript)
    const resposta = formatResult(intent, entities, dados);
    return new Response(JSON.stringify({ sucesso: true, resposta, sql_gerado: sql }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("[Pipeline] Error:", e);
    return new Response(JSON.stringify({ erro: e.message || "Erro interno" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
