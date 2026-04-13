// ═══════════════════════════════════════════════════════════════
// bd-eleicoes-chat — Chat com gráficos. SQL 100% determinístico.
// Gemini = normalização de texto APENAS. ZERO IA para SQL.
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── ROTEADOR DE TABELAS ──

const DATASET_MAP: Record<string, { prefix: string; anos: number[]; sufixo: 'UF' | 'NAC' }> = {
  candidatos:          { prefix: 'consulta_cand',             anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  bens:                { prefix: 'bem_candidato',             anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  votacao:             { prefix: 'votacao_candidato_munzona',  anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  votacao_partido:     { prefix: 'votacao_partido_munzona',    anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  detalhe_munzona:     { prefix: 'detalhe_votacao_munzona',    anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
  detalhe_secao:       { prefix: 'detalhe_votacao_secao',      anos: [2014,2016,2020,2022,2024],      sufixo: 'UF' },
  eleitorado_local:    { prefix: 'eleitorado_local_votacao',   anos: [2014,2016,2018,2020,2024],      sufixo: 'NAC' },
  perfil_eleitorado:   { prefix: 'perfil_eleitorado',          anos: [2014,2016,2018,2020,2024],      sufixo: 'NAC' },
  votacao_secao:       { prefix: 'votacao_secao_munzona',      anos: [2014,2016,2018,2020,2022,2024], sufixo: 'UF' },
};

function T(dataset: string, ano: number, uf = 'GO'): string {
  const c = DATASET_MAP[dataset];
  if (!c) throw new Error(`Dataset desconhecido: ${dataset}`);
  if (!c.anos.includes(ano)) {
    // Fallback to closest available year
    const closest = c.anos.reduce((a, b) => Math.abs(b - ano) < Math.abs(a - ano) ? b : a);
    return c.sufixo === 'NAC' ? `my_db.${c.prefix}_${closest}` : `my_db.${c.prefix}_${closest}_${uf}`;
  }
  return c.sufixo === 'NAC' ? `my_db.${c.prefix}_${ano}` : `my_db.${c.prefix}_${ano}_${uf}`;
}

function hasTable(dataset: string, ano: number): boolean {
  const c = DATASET_MAP[dataset];
  return c ? c.anos.includes(ano) : false;
}

// ── SQL SAFE ──
function sqlSafe(s: string): string {
  return s.replace(/'/g, "''").replace(/[;\-\-]/g, '');
}

// ── GEMINI NORMALIZER (enhanced for multi-name) ──

async function callGemini(question: string): Promise<string | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Você é um normalizador de buscas eleitorais de Goiás.
Extraia palavras-chave: [INTENÇÃO], [CARGO], [MUNICIPIO], [ANO], [NOME_CANDIDATO_1], [NOME_CANDIDATO_2], [NOME_CANDIDATO_3], [PARTIDO], [ZONA], [SECAO], [LOCAL_VOTACAO]
Intenções possíveis: comparativo_candidatos, votos_candidato, votos_candidato_secao, votos_candidato_local, votos_candidato_zona, ranking_votos, ranking_patrimonio, patrimonio_candidato, total_candidatos, comparecimento, abstencao, evolucao, distribuicao_genero, distribuicao_instrucao, bairro_comparecimento, busca_candidato, votos_por_zona, partidos_ranking, resumo_eleicao
REGRAS:
- Se a pergunta compara 2+ candidatos (ex: "compare fulano e ciclano"), INTENÇÃO = comparativo_candidatos
- Se menciona "votos" + nome de pessoa, INTENÇÃO = votos_candidato
- Se menciona "seção" ou "secao" + votos, INTENÇÃO = votos_candidato_secao
- Se menciona "escola" ou "colégio" ou "local" + votos, INTENÇÃO = votos_candidato_local
- Se menciona "zona" + votos de candidato, INTENÇÃO = votos_candidato_zona
- Nomes de candidato SEMPRE em MAIÚSCULO
- Se houver múltiplos candidatos, separe com ||| (ex: TATA TEIXEIRA|||VANDERLAN|||ADRIANA ACCORSI)
Responda APENAS keywords separadas por vírgula.

Pergunta: "${question}"` }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
        }),
      }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch { clearTimeout(timer); return null; }
}

// ── INTENT + ENTITIES ──

const CARGOS: Record<string, string[]> = {
  "PREFEITO": ["prefeito","prefeita","prefeitura"],
  "VEREADOR": ["vereador","vereadora","vereadores","câmara","camara"],
  "VICE-PREFEITO": ["vice-prefeito","vice prefeito","vice"],
  "GOVERNADOR": ["governador","governadora"],
  "DEPUTADO ESTADUAL": ["deputado estadual","deputada estadual"],
  "DEPUTADO FEDERAL": ["deputado federal","deputada federal"],
  "SENADOR": ["senador","senadora"],
  "PRESIDENTE": ["presidente"],
};

const PARTIDOS = ["PT","PL","MDB","PSDB","PP","PSD","UNIÃO","REPUBLICANOS","PDT","PSB","PODE","PSOL","AVANTE","SOLIDARIEDADE","CIDADANIA","PCdoB","PV","REDE","NOVO","AGIR","MOBILIZA","PRD","UNIÃO BRASIL"];

const MUNICIPIOS = ["GOIÂNIA","GOIANIA","APARECIDA DE GOIÂNIA","APARECIDA DE GOIANIA","ANÁPOLIS","ANAPOLIS","RIO VERDE","LUZIÂNIA","LUZIANIA","TRINDADE","FORMOSA","SENADOR CANEDO","CATALÃO","CATALAO","ITUMBIARA","JATAÍ","JATAI","PLANALTINA","CALDAS NOVAS","VALPARAÍSO DE GOIÁS","VALPARAISO DE GOIAS","ÁGUAS LINDAS DE GOIÁS","AGUAS LINDAS DE GOIAS","NOVO GAMA","CIDADE OCIDENTAL","INHUMAS","GOIANÉSIA","GOIANESIA","MINEIROS","PORANGATU","NIQUELÂNDIA","NIQUELANDIA","URUAÇU","URUACU","JARAGUÁ","JARAGUA","PIRACANJUBA","QUIRINÓPOLIS","QUIRINOPOLIS","MORRINHOS","PIRES DO RIO","CERES","IPORÁ","IPORA","CRISTALINA","ALEXÂNIA","ALEXANIA","IPAMERI","GOIATUBA","SANTA HELENA DE GOIÁS","SANTA HELENA DE GOIAS"];

function normalizeMun(m: string): string {
  const n = m.toUpperCase();
  if (n.includes("GOIANIA") && !n.includes("APARECIDA")) return "GOIÂNIA";
  if (n.includes("APARECIDA")) return "APARECIDA DE GOIÂNIA";
  if (n.includes("ANAPOLIS")) return "ANÁPOLIS";
  if (n.includes("CATALAO")) return "CATALÃO";
  if (n.includes("JATAI")) return "JATAÍ";
  if (n.includes("VALPARAISO")) return "VALPARAÍSO DE GOIÁS";
  if (n.includes("AGUAS LINDAS")) return "ÁGUAS LINDAS DE GOIÁS";
  if (n.includes("NIQUELANDIA")) return "NIQUELÂNDIA";
  if (n.includes("GOIANESIA")) return "GOIANÉSIA";
  if (n.includes("QUIRINOPOLIS")) return "QUIRINÓPOLIS";
  if (n.includes("ALEXANIA")) return "ALEXÂNIA";
  if (n.includes("IPORA")) return "IPORÁ";
  if (n.includes("SANTA HELENA")) return "SANTA HELENA DE GOIÁS";
  return m;
}

type Intent = "votos_candidato"|"comparativo_candidatos"|"ranking_votos"|"ranking_patrimonio"|"patrimonio_candidato"|"total_candidatos"|"comparecimento"|"abstencao"|"evolucao"|"distribuicao_genero"|"distribuicao_instrucao"|"distribuicao_ocupacao"|"distribuicao_idade"|"bairro_comparecimento"|"busca_candidato"|"votos_por_zona"|"partidos_ranking"|"comparativo_partidos"|"locais_votacao"|"resumo_eleicao"|"comparativo_anos"|"votos_candidato_local"|"votos_candidato_zona"|"votos_candidato_secao"|"evolucao_candidato"|"generico";

interface Entities {
  anos: number[]; municipios: string[]; partidos: string[]; cargos: string[];
  situacoes: string[]; generos: string[]; limite: number; nomes: string[];
  zonas: number[]; turnos: number[]; secoes: number[]; locais: string[];
}

function detectIntent(text: string): Intent {
  const has = (...w: string[]) => w.some(x => text.includes(x));

  // COMPARATIVO de candidatos (highest priority)
  if (has("comparar","compare","comparativo","versus","vs","x ") && !has("partido","ano","eleição")) {
    return "comparativo_candidatos";
  }
  // Multiple names with "e" connector → comparativo
  const ePattern = text.match(/(\w{3,})\s+(?:e|versus|vs|x)\s+(\w{3,})/i);
  if (ePattern && has("voto","votos","desempenho","resultado")) return "comparativo_candidatos";

  // Votos + seção
  if ((has("voto","votos")) && has("seção","secao","seções","secoes")) return "votos_candidato_secao";
  // Votos + local/escola/colégio
  if ((has("voto","votos")) && has("escola","colégio","colegio","local de votação","local votacao")) return "votos_candidato_local";
  // Votos + zona
  if ((has("voto","votos")) && has("zona")) return "votos_candidato_zona";

  // Evolução de candidato entre eleições
  if (has("evolução","evolucao","histórico","historico") && (has("candidato","candidata") || text.match(/[A-Z]{2,}/))) return "evolucao_candidato";

  // Votos genérico
  if ((has("voto","votos","votação","votacao","quantos voto","quantos votos")) && !has("ranking","top","mais votado","mais votados")) {
    return "votos_candidato";
  }
  if (has("patrimônio","patrimonio","bens","mais rico")) return has("ranking","top","maiores") ? "ranking_patrimonio" : "patrimonio_candidato";
  if (has("comparecimento","presença")) { if (has("bairro")) return "bairro_comparecimento"; if (has("evolução","evolucao","histórico")) return "evolucao"; return "comparecimento"; }
  if (has("abstenção","abstencao")) return "abstencao";
  if (has("evolução","evolucao","tendência","histórico")) return "evolucao";
  if (has("gênero","genero","feminino","masculino")) return "distribuicao_genero";
  if (has("escolaridade","instrução","instrucao")) return "distribuicao_instrucao";
  if (has("ocupação","ocupacao","profissão")) return "distribuicao_ocupacao";
  if (has("idade","faixa etária")) return "distribuicao_idade";
  if (has("local de votação","colégio","escola") && !has("voto")) return "locais_votacao";
  if (has("comparar","comparativo","versus") && has("partido")) return "comparativo_partidos";
  if (has("comparar","comparativo") && has("ano","eleição")) return "comparativo_anos";
  if (has("resumo","panorama","visão geral")) return "resumo_eleicao";
  if (has("partido") && has("ranking","top")) return "partidos_ranking";
  if (has("ranking","top","mais votado","mais votados")) return "ranking_votos";
  if (has("quantos candidatos","quantas candidatas","total de candidatos")) return "total_candidatos";
  if (has("bairro") && (has("votação","eleitores"))) return "bairro_comparecimento";
  if (has("quem é","quem e","perfil","candidato")) return "busca_candidato";
  if (has("partido") && has("voto","desempenho")) return "partidos_ranking";
  return "generico";
}

function extractEntities(text: string): Entities {
  const lower = text.toLowerCase();
  const normalized = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const yearMatches = text.match(/\b(20\d{2})\b/g);
  const anos = yearMatches ? [...new Set(yearMatches.map(Number))].filter(y => y >= 2000 && y <= 2030) : [];
  const turnos: number[] = [];
  if (lower.includes("primeiro turno") || lower.includes("1º turno") || lower.includes("1o turno")) turnos.push(1);
  if (lower.includes("segundo turno") || lower.includes("2º turno") || lower.includes("2o turno")) turnos.push(2);
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
    if (normalized.includes(n)) municipios.push(normalizeMun(m));
  }
  const generos: string[] = [];
  if (lower.includes("mulher") || lower.includes("feminino") || lower.includes("candidatas")) generos.push("FEMININO");
  if (lower.includes("homem") || lower.includes("masculino")) generos.push("MASCULINO");
  const situacoes: string[] = [];
  if (lower.includes("eleito") || lower.includes("ganhou") || lower.includes("venceu")) situacoes.push("ELEITO");
  if (lower.includes("não eleito") || lower.includes("perdeu")) situacoes.push("NÃO ELEITO");
  const zonaMatch = text.match(/zona\s*(\d+)/gi);
  const zonas = zonaMatch ? zonaMatch.map(z => parseInt(z.replace(/\D/g, ''))) : [];
  const secaoMatch = text.match(/se[çc][aã]o\s*(\d+)/gi);
  const secoes = secaoMatch ? secaoMatch.map(s => parseInt(s.replace(/\D/g, ''))) : [];
  
  // Local de votação extraction
  const locais: string[] = [];
  const localMatch = text.match(/(?:escola|colégio|colegio|local)\s+([A-ZÀ-Úa-zà-ú\s]+?)(?:\s+(?:em|de|da|do|na|no|\d|$))/i);
  if (localMatch) locais.push(localMatch[1].trim().toUpperCase());

  // ── MULTI-NAME EXTRACTION ──
  const nomes: string[] = [];
  const stopWords = new Set(["VOTOS","VOTO","CANDIDATO","CANDIDATA","CANDIDATOS","CANDIDATAS","ELEIÇÃO","ELEICAO","PREFEITO","PREFEITA","VEREADOR","VEREADORA","PARTIDO","RANKING","GOIANIA","GOIÂNIA","TOTAL","COMPARE","COMPARAR","COMPARATIVO","ENTRE","TEVE","QUANTOS","RESULTADO","DESEMPENHO","NUMERO","ZONA","SECAO","SEÇÃO","LOCAL","ESCOLA","COLEGIO","COLÉGIO","EM","DE","DO","DA","NA","NO","QUAL","COMO","FOI","OS","AS","QUE","POR","PARA","COM","SEM","OU","MAIS","MENOS","TEVE","TEM","TIVERAM","FORAM","ERA","SÃO","TODOS","TODAS","PRIMEIRO","SEGUNDO","TURNO","ANO","MUNICIPAL","ESTADUAL","FEDERAL"]);

  function cleanName(raw: string): string {
    // Remove stop words from start and end, keep middle
    const words = raw.trim().split(/\s+/).filter(w => w.length > 1);
    // Trim leading stop words
    while (words.length > 0 && stopWords.has(words[0].toUpperCase())) words.shift();
    // Trim trailing stop words  
    while (words.length > 0 && stopWords.has(words[words.length - 1].toUpperCase())) words.pop();
    // Also remove municipality names from end
    const result = words.join(' ');
    for (const m of MUNICIPIOS) {
      const mNorm = m.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      if (result.toUpperCase().endsWith(mNorm) || result.toUpperCase().endsWith(m)) {
        return result.slice(0, -(m.length)).trim();
      }
    }
    return result;
  }
  
  // 1. Names separated by ||| (from Gemini)
  if (text.includes('|||')) {
    const parts = text.split('|||').map(s => cleanName(s)).filter(s => s.length > 2);
    nomes.push(...parts.map(s => s.toUpperCase()));
  }
  
  // 2. Quoted names
  if (nomes.length === 0) {
    const quoted = text.match(/"([^"]+)"/g);
    if (quoted) nomes.push(...quoted.map(q => q.replace(/"/g, '').toUpperCase()));
  }
  
  // 3. "candidato A e candidato B" or "A versus B" or "A e B" - for comparisons
  if (nomes.length === 0) {
    // First try with explicit separators: "Name1 e Name2 e Name3"
    const parts = text.split(/\s+(?:e|versus|vs|x|,)\s+/i);
    if (parts.length >= 2) {
      for (const part of parts) {
        const cleaned = cleanName(part);
        if (cleaned.length > 2 && !stopWords.has(cleaned.toUpperCase())) {
          nomes.push(cleaned.toUpperCase());
        }
      }
    }
  }

  // 4. "votos do/da/de [Name]" (single name)
  if (nomes.length === 0) {
    const p1 = text.match(/(?:votos?\s+(?:do|da|de|d[eo]s?)\s+)([A-ZÀ-Úa-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+)*)/i);
    if (p1) {
      const cleaned = cleanName(p1[1]);
      if (cleaned.length > 2) nomes.push(cleaned.toUpperCase());
    }
  }
  
  // 5. "votos [Name] teve" or "votos [Name]"
  if (nomes.length === 0) {
    const p2 = text.match(/votos?\s+([A-ZÀ-Úa-zà-ú]{2,}(?:\s+[A-ZÀ-Úa-zà-ú]{2,})+)/i);
    if (p2) {
      const cleaned = cleanName(p2[1]);
      if (cleaned.length > 2) nomes.push(cleaned.toUpperCase());
    }
  }
  
  // 6. "candidato/perfil [Name]"
  if (nomes.length === 0) {
    const p3 = text.match(/(?:candidato|candidata|perfil\s+(?:do|da|de)\s+)([A-ZÀ-Úa-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+)*)/i);
    if (p3) {
      const cleaned = cleanName(p3[1]);
      if (cleaned.length > 2) nomes.push(cleaned.toUpperCase());
    }
  }

  const filteredNomes = nomes.filter(n => !stopWords.has(n) && n.length > 2);

  return { anos: [...new Set(anos)], municipios: [...new Set(municipios)], partidos: [...new Set(partidos)], cargos: [...new Set(cargos)], situacoes: [...new Set(situacoes)], generos: [...new Set(generos)], limite, nomes: [...new Set(filteredNomes)], zonas: [...new Set(zonas)], turnos: [...new Set(turnos)], secoes: [...new Set(secoes)], locais: [...new Set(locais)] };
}

// ── CONFIG VISUAL ──

interface ConfigVisual {
  tipo_grafico: 'bar'|'pie'|'line'|'area'|'table'|'kpi';
  titulo: string;
  descricao: string;
  mapping: { axis: string; dataKeys: string[]; pivotingColumn?: string; pivotingValue?: string };
}

interface QueryPlan { sql: string; config_visual: ConfigVisual; }

// ── SQL BUILDER + VISUAL CONFIG (100% determinístico) ──

function buildWhere(e: Entities, munField = "NM_UE"): string {
  const c: string[] = [];
  if (e.municipios.length === 1) c.push(`${munField} = '${sqlSafe(e.municipios[0])}'`);
  else if (e.municipios.length > 1) c.push(`${munField} IN (${e.municipios.map(m => `'${sqlSafe(m)}'`).join(',')})`);
  if (e.cargos.length === 1) c.push(`DS_CARGO ILIKE '%${sqlSafe(e.cargos[0])}%'`);
  if (e.turnos.length === 1) c.push(`NR_TURNO = ${Number(e.turnos[0])}`);
  if (e.generos.length === 1) c.push(`DS_GENERO = '${sqlSafe(e.generos[0])}'`);
  if (e.situacoes.length === 1) c.push(`DS_SIT_TOT_TURNO ILIKE '%${sqlSafe(e.situacoes[0])}%'`);
  if (e.partidos.length === 1) c.push(`SG_PARTIDO = '${sqlSafe(e.partidos[0])}'`);
  else if (e.partidos.length > 1) c.push(`SG_PARTIDO IN (${e.partidos.map(p => `'${sqlSafe(p)}'`).join(',')})`);
  return c.length ? `WHERE ${c.join(' AND ')}` : '';
}

function removeAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Generate ILIKE condition that works with or without accents
function ilike(field: string, value: string): string {
  const safe = sqlSafe(value);
  const noAcc = sqlSafe(removeAccents(value));
  if (safe === noAcc) return `${field} ILIKE '%${safe}%'`;
  return `(${field} ILIKE '%${safe}%' OR ${field} ILIKE '%${noAcc}%')`;
}

function nameSearch(nome: string, candField = "c.NM_URNA_CANDIDATO", fullField = "c.NM_CANDIDATO"): string {
  return `(${ilike(candField, nome)} OR ${ilike(fullField, nome)})`;
}

function buildNameCondition(nomes: string[], candidateField = "c.NM_URNA_CANDIDATO", fullNameField = "c.NM_CANDIDATO"): string {
  if (nomes.length === 0) return '';
  const conds = nomes.map(n => nameSearch(n, candidateField, fullNameField));
  return `(${conds.join(' OR ')})`;
}

function buildQuery(intent: Intent, e: Entities): QueryPlan | null {
  const ano = e.anos[0] || 2024;
  const mun = e.municipios[0] ? sqlSafe(e.municipios[0]) : '';
  const lbl = e.municipios[0] || 'Goiás';

  switch (intent) {
    // ── COMPARATIVO DE CANDIDATOS (NEW — side by side) ──
    case "comparativo_candidatos": {
      if (e.nomes.length < 2) {
        // Not enough names, fall through to votos_candidato
        return buildQuery("votos_candidato", e);
      }
      const nameCond = buildNameCondition(e.nomes);
      const munCond = mun ? `AND v.NM_MUNICIPIO='${mun}'` : '';
      const cargoCond = e.cargos.length ? `AND c.DS_CARGO ILIKE '%${sqlSafe(e.cargos[0])}%'` : '';
      const turnoCond = e.turnos.length ? `AND v.NR_TURNO=${Number(e.turnos[0])}` : '';
      
      return {
        sql: `SELECT c.NM_URNA_CANDIDATO AS candidato, c.SG_PARTIDO AS partido, c.DS_CARGO AS cargo, c.NM_UE AS municipio, c.DS_SIT_TOT_TURNO AS situacao, c.NR_CANDIDATO AS numero, SUM(v.QT_VOTOS_NOMINAIS) AS total_votos FROM ${T('votacao', ano)} v JOIN ${T('candidatos', ano)} c ON v.SQ_CANDIDATO=c.SQ_CANDIDATO WHERE ${nameCond} ${munCond} ${cargoCond} ${turnoCond} GROUP BY c.NM_URNA_CANDIDATO, c.SG_PARTIDO, c.DS_CARGO, c.NM_UE, c.DS_SIT_TOT_TURNO, c.NR_CANDIDATO ORDER BY total_votos DESC LIMIT 30`,
        config_visual: {
          tipo_grafico: "bar",
          titulo: `Comparativo: ${e.nomes.join(' × ')} — ${ano}`,
          descricao: `Comparação de votos entre ${e.nomes.length} candidatos`,
          mapping: { axis: "candidato", dataKeys: ["total_votos"] },
        },
      };
    }

    // ── VOTOS POR CANDIDATO ──
    case "votos_candidato": {
      const nome = e.nomes[0] || '';
      if (nome) {
        const munCond = mun ? `AND v.NM_MUNICIPIO='${mun}'` : '';
        const cargoCond = e.cargos.length ? `AND c.DS_CARGO ILIKE '%${sqlSafe(e.cargos[0])}%'` : '';
        const turnoCond = e.turnos.length ? `AND v.NR_TURNO=${Number(e.turnos[0])}` : '';
        return {
          sql: `SELECT c.NM_URNA_CANDIDATO AS candidato, c.SG_PARTIDO AS partido, c.DS_CARGO AS cargo, c.NM_UE AS municipio, c.DS_SIT_TOT_TURNO AS situacao, c.NR_CANDIDATO AS numero, SUM(v.QT_VOTOS_NOMINAIS) AS total_votos FROM ${T('votacao', ano)} v JOIN ${T('candidatos', ano)} c ON v.SQ_CANDIDATO=c.SQ_CANDIDATO WHERE ${nameSearch(nome)} ${munCond} ${cargoCond} ${turnoCond} GROUP BY c.NM_URNA_CANDIDATO, c.SG_PARTIDO, c.DS_CARGO, c.NM_UE, c.DS_SIT_TOT_TURNO, c.NR_CANDIDATO ORDER BY total_votos DESC LIMIT 20`,
          config_visual: { tipo_grafico: "table", titulo: `Votos de ${e.nomes[0]} — ${ano}`, descricao: `Resultado eleitoral de ${e.nomes[0]}`, mapping: { axis: "candidato", dataKeys: ["total_votos"] } },
        };
      }
      return buildQuery("ranking_votos", e);
    }

    // ── VOTOS POR SEÇÃO (NEW) ──
    case "votos_candidato_secao": {
      const nome = e.nomes[0] ? sqlSafe(e.nomes[0]) : '';
      const m = mun || 'GOIÂNIA';
      const nameCond = nome ? `AND v.NM_VOTAVEL ILIKE '%${nome}%'` : '';
      const zonaCond = e.zonas.length ? `AND v.NR_ZONA=${Number(e.zonas[0])}` : '';
      const secaoCond = e.secoes.length ? `AND v.NR_SECAO=${Number(e.secoes[0])}` : '';

      if (hasTable('detalhe_secao', ano)) {
        return {
          sql: `SELECT v.NR_ZONA AS zona, v.NR_SECAO AS secao, v.NM_VOTAVEL AS candidato, v.SG_PARTIDO AS partido, SUM(v.QT_VOTOS) AS total_votos FROM ${T('detalhe_secao', ano)} v WHERE v.NM_MUNICIPIO='${sqlSafe(m)}' ${nameCond} ${zonaCond} ${secaoCond} AND v.NM_VOTAVEL IS NOT NULL AND v.NM_VOTAVEL NOT IN ('BRANCO','NULO') GROUP BY v.NR_ZONA, v.NR_SECAO, v.NM_VOTAVEL, v.SG_PARTIDO ORDER BY total_votos DESC LIMIT ${e.limite}`,
          config_visual: {
            tipo_grafico: "table",
            titulo: nome ? `Votos de ${e.nomes[0]} por seção — ${m} ${ano}` : `Votos por seção — ${m} ${ano}`,
            descricao: "Detalhamento por seção eleitoral",
            mapping: { axis: "secao", dataKeys: ["total_votos"] },
          },
        };
      }
      // Fallback to zone-level
      return buildQuery("votos_candidato_zona", e);
    }

    // ── VOTOS POR LOCAL/ESCOLA ──
    case "votos_candidato_local": {
      const nome = e.nomes[0] ? sqlSafe(e.nomes[0]) : '';
      const m = mun || 'GOIÂNIA';
      const nameCond = nome ? `AND v.NM_VOTAVEL ILIKE '%${nome}%'` : '';
      const localCond = e.locais.length ? `AND e.NM_LOCAL_VOTACAO ILIKE '%${sqlSafe(e.locais[0])}%'` : '';

      if (hasTable('detalhe_secao', ano)) {
        return {
          sql: `SELECT e.NM_LOCAL_VOTACAO AS local_votacao, e.NM_BAIRRO AS bairro, v.NM_VOTAVEL AS candidato, SUM(v.QT_VOTOS) AS total_votos FROM ${T('detalhe_secao', ano)} v JOIN ${T('eleitorado_local', Math.min(ano, 2024))} e ON v.NR_ZONA=e.NR_ZONA AND v.NR_SECAO=CAST(e.NR_SECAO AS INT) AND v.NM_MUNICIPIO=e.NM_MUNICIPIO WHERE v.NM_MUNICIPIO='${sqlSafe(m)}' AND e.SG_UF='GO' ${nameCond} ${localCond} AND v.NM_VOTAVEL IS NOT NULL AND v.NM_VOTAVEL NOT IN ('BRANCO','NULO') GROUP BY e.NM_LOCAL_VOTACAO, e.NM_BAIRRO, v.NM_VOTAVEL ORDER BY total_votos DESC LIMIT ${e.limite}`,
          config_visual: {
            tipo_grafico: "bar",
            titulo: nome ? `Votos de ${e.nomes[0]} por escola — ${m} ${ano}` : `Votos por local — ${m} ${ano}`,
            descricao: "Votação por local de votação",
            mapping: { axis: "local_votacao", dataKeys: ["total_votos"] },
          },
        };
      }
      // Fallback: use votacao + eleitorado_local at zone level
      const cf = nome ? `AND v.NM_URNA_CANDIDATO ILIKE '%${nome}%'` : '';
      return {
        sql: `SELECT e.NM_LOCAL_VOTACAO AS local_votacao, e.NM_BAIRRO AS bairro, v.NM_URNA_CANDIDATO AS candidato, SUM(v.QT_VOTOS_NOMINAIS) AS total_votos FROM ${T('votacao', ano)} v JOIN ${T('eleitorado_local', Math.min(ano, 2024))} e ON v.NR_ZONA=e.NR_ZONA AND v.NM_MUNICIPIO=e.NM_MUNICIPIO WHERE v.NM_MUNICIPIO='${sqlSafe(m)}' ${cf} AND e.SG_UF='GO' ${localCond} GROUP BY e.NM_LOCAL_VOTACAO, e.NM_BAIRRO, v.NM_URNA_CANDIDATO ORDER BY total_votos DESC LIMIT ${e.limite}`,
        config_visual: {
          tipo_grafico: "bar",
          titulo: nome ? `Votos de ${e.nomes[0]} por escola — ${m} ${ano}` : `Votos por local — ${m} ${ano}`,
          descricao: "Votação por local de votação",
          mapping: { axis: "local_votacao", dataKeys: ["total_votos"] },
        },
      };
    }

    // ── VOTOS POR ZONA ──
    case "votos_candidato_zona": {
      const nome = e.nomes[0] ? sqlSafe(e.nomes[0]) : '';
      const m = mun || 'GOIÂNIA';
      
      if (nome) {
        // Multiple candidates for comparison by zone
        if (e.nomes.length >= 2) {
          const nameCond = buildNameCondition(e.nomes, "v.NM_URNA_CANDIDATO", "v.NM_URNA_CANDIDATO");
          return {
            sql: `SELECT NR_ZONA AS zona, NM_URNA_CANDIDATO AS candidato, SUM(QT_VOTOS_NOMINAIS) AS total_votos FROM ${T('votacao', ano)} WHERE ${nameCond.replace(/c\./g, '')} AND NM_MUNICIPIO='${sqlSafe(m)}' GROUP BY NR_ZONA, NM_URNA_CANDIDATO ORDER BY zona, total_votos DESC`,
            config_visual: { tipo_grafico: "bar", titulo: `${e.nomes.join(' × ')} por zona — ${m} ${ano}`, descricao: "Comparativo por zona", mapping: { axis: "zona", dataKeys: ["total_votos"], pivotingColumn: "candidato" } },
          };
        }
        return {
          sql: `SELECT NR_ZONA AS zona, NM_URNA_CANDIDATO AS candidato, SUM(QT_VOTOS_NOMINAIS) AS total_votos FROM ${T('votacao', ano)} WHERE NM_URNA_CANDIDATO ILIKE '%${nome}%' AND NM_MUNICIPIO='${sqlSafe(m)}' GROUP BY NR_ZONA, NM_URNA_CANDIDATO ORDER BY zona`,
          config_visual: { tipo_grafico: "bar", titulo: `Votos de ${e.nomes[0]} por zona — ${m} ${ano}`, descricao: "Votação por zona", mapping: { axis: "zona", dataKeys: ["total_votos"] } },
        };
      }
      return {
        sql: `SELECT NR_ZONA AS zona, SUM(QT_APTOS) AS eleitores, SUM(QT_COMPARECIMENTO) AS comparecimento FROM ${T('detalhe_munzona', ano)} WHERE NM_MUNICIPIO='${sqlSafe(m)}' GROUP BY NR_ZONA ORDER BY zona`,
        config_visual: { tipo_grafico: "bar", titulo: `Zonas — ${m} ${ano}`, descricao: "Por zona eleitoral", mapping: { axis: "zona", dataKeys: ["eleitores","comparecimento"] } },
      };
    }

    // ── EVOLUÇÃO DE CANDIDATO ENTRE ELEIÇÕES (NEW) ──
    case "evolucao_candidato": {
      const nome = e.nomes[0] ? sqlSafe(e.nomes[0]) : '';
      if (!nome) return buildQuery("evolucao", e);
      const anosDisp = [2014,2016,2018,2020,2022,2024];
      const munCond = mun ? `AND v.NM_MUNICIPIO='${mun}'` : '';
      const parts = anosDisp.map(a => `SELECT ${a} AS ano, c.NM_URNA_CANDIDATO AS candidato, c.DS_CARGO AS cargo, c.SG_PARTIDO AS partido, SUM(v.QT_VOTOS_NOMINAIS) AS total_votos, c.DS_SIT_TOT_TURNO AS situacao FROM ${T('votacao', a)} v JOIN ${T('candidatos', a)} c ON v.SQ_CANDIDATO=c.SQ_CANDIDATO WHERE (c.NM_URNA_CANDIDATO ILIKE '%${nome}%' OR c.NM_CANDIDATO ILIKE '%${nome}%') ${munCond} GROUP BY c.NM_URNA_CANDIDATO, c.DS_CARGO, c.SG_PARTIDO, c.DS_SIT_TOT_TURNO`);
      return {
        sql: `SELECT * FROM (${parts.join(' UNION ALL ')}) ORDER BY ano`,
        config_visual: { tipo_grafico: "line", titulo: `Evolução de ${e.nomes[0]}`, descricao: "Desempenho ao longo das eleições", mapping: { axis: "ano", dataKeys: ["total_votos"] } },
      };
    }

    case "ranking_votos": {
      const conds: string[] = [];
      if (mun) conds.push(`NM_MUNICIPIO='${mun}'`);
      if (e.cargos.length) conds.push(`DS_CARGO ILIKE '%${sqlSafe(e.cargos[0])}%'`);
      const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return {
        sql: `SELECT NM_URNA_CANDIDATO AS candidato, SG_PARTIDO AS partido, DS_CARGO AS cargo, SUM(QT_VOTOS_NOMINAIS) AS total_votos FROM ${T('votacao', ano)} ${w} GROUP BY NM_URNA_CANDIDATO,SG_PARTIDO,DS_CARGO ORDER BY total_votos DESC LIMIT ${e.limite}`,
        config_visual: { tipo_grafico: "bar", titulo: `Top ${e.limite} mais votados — ${lbl} ${ano}`, descricao: "Ranking por votos nominais", mapping: { axis: "candidato", dataKeys: ["total_votos"] } },
      };
    }
    case "ranking_patrimonio": {
      const conds: string[] = [];
      if (mun) conds.push(`c.NM_UE='${mun}'`);
      if (e.cargos.length) conds.push(`c.DS_CARGO ILIKE '%${sqlSafe(e.cargos[0])}%'`);
      const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return {
        sql: `SELECT c.NM_URNA_CANDIDATO AS candidato, c.SG_PARTIDO AS partido, SUM(CAST(REPLACE(b.VR_BEM_CANDIDATO,',','.')AS DOUBLE)) AS patrimonio FROM ${T('bens', ano)} b JOIN ${T('candidatos', ano)} c ON b.SQ_CANDIDATO=c.SQ_CANDIDATO ${w} GROUP BY c.NM_URNA_CANDIDATO,c.SG_PARTIDO ORDER BY patrimonio DESC LIMIT ${e.limite}`,
        config_visual: { tipo_grafico: "bar", titulo: `Maior patrimônio — ${ano}`, descricao: "Patrimônio declarado", mapping: { axis: "candidato", dataKeys: ["patrimonio"] } },
      };
    }
    case "patrimonio_candidato": {
      if (e.nomes.length > 0) {
        // Compare patrimônio of multiple candidates
        if (e.nomes.length >= 2) {
          const nameCond = buildNameCondition(e.nomes);
          return {
            sql: `SELECT c.NM_URNA_CANDIDATO AS candidato, c.SG_PARTIDO AS partido, SUM(CAST(REPLACE(b.VR_BEM_CANDIDATO,',','.')AS DOUBLE)) AS patrimonio, COUNT(*) AS qtd_bens FROM ${T('bens', ano)} b JOIN ${T('candidatos', ano)} c ON b.SQ_CANDIDATO=c.SQ_CANDIDATO WHERE ${nameCond} GROUP BY c.NM_URNA_CANDIDATO, c.SG_PARTIDO ORDER BY patrimonio DESC`,
            config_visual: { tipo_grafico: "bar", titulo: `Patrimônio: ${e.nomes.join(' × ')} — ${ano}`, descricao: "Comparativo de patrimônio", mapping: { axis: "candidato", dataKeys: ["patrimonio"] } },
          };
        }
        const nome = sqlSafe(e.nomes[0]);
        return {
          sql: `SELECT DS_TIPO_BEM_CANDIDATO AS tipo, DS_BEM_CANDIDATO AS descricao, CAST(REPLACE(VR_BEM_CANDIDATO,',','.')AS DOUBLE) AS valor FROM ${T('bens', ano)} WHERE SQ_CANDIDATO IN (SELECT SQ_CANDIDATO FROM ${T('candidatos', ano)} WHERE NM_URNA_CANDIDATO ILIKE '%${nome}%') ORDER BY valor DESC LIMIT 50`,
          config_visual: { tipo_grafico: "table", titulo: `Bens — ${e.nomes[0]}`, descricao: "Bens declarados", mapping: { axis: "tipo", dataKeys: ["valor"] } },
        };
      }
      return buildQuery("ranking_patrimonio", e);
    }
    case "total_candidatos": {
      const w = buildWhere(e);
      return {
        sql: `SELECT DS_CARGO AS cargo, COUNT(*) AS total, COUNT(CASE WHEN DS_GENERO='FEMININO' THEN 1 END) AS mulheres, COUNT(CASE WHEN DS_GENERO='MASCULINO' THEN 1 END) AS homens FROM ${T('candidatos', ano)} ${w} GROUP BY DS_CARGO ORDER BY total DESC`,
        config_visual: { tipo_grafico: "table", titulo: `Candidatos — ${lbl} ${ano}`, descricao: "Por cargo", mapping: { axis: "cargo", dataKeys: ["total","mulheres","homens"] } },
      };
    }
    case "comparecimento": {
      const w = buildWhere(e, "NM_MUNICIPIO");
      return {
        sql: `SELECT NM_MUNICIPIO AS municipio, SUM(QT_APTOS) AS eleitores, SUM(QT_COMPARECIMENTO) AS comparecimento, ROUND(SUM(QT_COMPARECIMENTO)*100.0/NULLIF(SUM(QT_APTOS),0),1) AS taxa FROM ${T('detalhe_munzona', ano)} ${w} GROUP BY NM_MUNICIPIO ORDER BY eleitores DESC LIMIT 50`,
        config_visual: { tipo_grafico: "bar", titulo: `Comparecimento — ${ano}`, descricao: "Por município", mapping: { axis: "municipio", dataKeys: ["comparecimento","eleitores"] } },
      };
    }
    case "abstencao": {
      const w = buildWhere(e, "NM_MUNICIPIO");
      return {
        sql: `SELECT NM_MUNICIPIO AS municipio, SUM(QT_ABSTENCOES) AS abstencoes, ROUND(SUM(QT_ABSTENCOES)*100.0/NULLIF(SUM(QT_APTOS),0),1) AS taxa FROM ${T('detalhe_munzona', ano)} ${w} GROUP BY NM_MUNICIPIO ORDER BY taxa DESC LIMIT 30`,
        config_visual: { tipo_grafico: "bar", titulo: `Abstenção — ${ano}`, descricao: "Por município", mapping: { axis: "municipio", dataKeys: ["abstencoes","taxa"] } },
      };
    }
    case "evolucao": {
      const anos = [2014,2016,2018,2020,2022,2024];
      const m = mun || 'GOIÂNIA';
      return {
        sql: `SELECT * FROM (${anos.map(a => `SELECT ${a} AS ano, SUM(QT_APTOS) AS eleitores, SUM(QT_COMPARECIMENTO) AS comparecimento FROM ${T('detalhe_munzona', a)} WHERE NM_MUNICIPIO='${sqlSafe(m)}' AND NR_TURNO=1`).join(' UNION ALL ')}) ORDER BY ano`,
        config_visual: { tipo_grafico: "line", titulo: `Evolução — ${m}`, descricao: "Série histórica", mapping: { axis: "ano", dataKeys: ["eleitores","comparecimento"] } },
      };
    }
    case "distribuicao_genero": {
      const w = buildWhere(e);
      return {
        sql: `SELECT DS_GENERO AS genero, COUNT(*) AS total FROM ${T('candidatos', ano)} ${w} GROUP BY DS_GENERO ORDER BY total DESC`,
        config_visual: { tipo_grafico: "pie", titulo: `Gênero — ${ano}`, descricao: "Distribuição", mapping: { axis: "genero", dataKeys: ["total"] } },
      };
    }
    case "distribuicao_instrucao": {
      const w = buildWhere(e);
      return {
        sql: `SELECT DS_GRAU_INSTRUCAO AS escolaridade, COUNT(*) AS total FROM ${T('candidatos', ano)} ${w} GROUP BY DS_GRAU_INSTRUCAO ORDER BY total DESC`,
        config_visual: { tipo_grafico: "bar", titulo: `Escolaridade — ${ano}`, descricao: "Por grau de instrução", mapping: { axis: "escolaridade", dataKeys: ["total"] } },
      };
    }
    case "distribuicao_ocupacao": {
      const w = buildWhere(e);
      return {
        sql: `SELECT DS_OCUPACAO AS ocupacao, COUNT(*) AS total FROM ${T('candidatos', ano)} ${w} GROUP BY DS_OCUPACAO ORDER BY total DESC LIMIT 15`,
        config_visual: { tipo_grafico: "bar", titulo: `Ocupações — ${ano}`, descricao: "Top profissões", mapping: { axis: "ocupacao", dataKeys: ["total"] } },
      };
    }
    case "distribuicao_idade": {
      const w = buildWhere(e);
      const base = w || 'WHERE 1=1';
      return {
        sql: `SELECT CASE WHEN age<=25 THEN '18-25' WHEN age<=35 THEN '26-35' WHEN age<=45 THEN '36-45' WHEN age<=55 THEN '46-55' WHEN age<=65 THEN '56-65' ELSE '66+' END AS faixa, COUNT(*) AS total FROM (SELECT CAST(EXTRACT(YEAR FROM AGE(CURRENT_DATE,valid_date))AS INT) as age FROM (SELECT TRY_CAST(DT_NASCIMENTO AS DATE) as valid_date FROM ${T('candidatos', ano)} ${base}) dates WHERE valid_date IS NOT NULL) sub WHERE age BETWEEN 18 AND 120 GROUP BY faixa ORDER BY faixa`,
        config_visual: { tipo_grafico: "bar", titulo: `Faixa etária — ${ano}`, descricao: "Distribuição", mapping: { axis: "faixa", dataKeys: ["total"] } },
      };
    }
    case "bairro_comparecimento": {
      const m = mun || 'GOIÂNIA';
      return {
        sql: `SELECT NM_BAIRRO AS bairro, COUNT(DISTINCT NM_LOCAL_VOTACAO) AS locais, SUM(QT_ELEITORES_PERFIL) AS eleitores FROM ${T('eleitorado_local', Math.min(ano, 2024))} WHERE SG_UF='GO' AND NM_MUNICIPIO='${sqlSafe(m)}' AND NM_BAIRRO IS NOT NULL AND NM_BAIRRO!='' GROUP BY NM_BAIRRO ORDER BY eleitores DESC LIMIT 30`,
        config_visual: { tipo_grafico: "bar", titulo: `Bairros — ${m} ${ano}`, descricao: "Eleitores por bairro", mapping: { axis: "bairro", dataKeys: ["eleitores","locais"] } },
      };
    }
    case "busca_candidato": {
      if (e.nomes.length > 0) {
        const nameCond = buildNameCondition(e.nomes, "NM_URNA_CANDIDATO", "NM_CANDIDATO");
        return {
          sql: `SELECT NM_URNA_CANDIDATO AS candidato, NM_CANDIDATO AS nome_completo, SG_PARTIDO AS partido, DS_CARGO AS cargo, NM_UE AS municipio, DS_SIT_TOT_TURNO AS situacao, DS_GENERO AS genero, DS_GRAU_INSTRUCAO AS escolaridade, DS_OCUPACAO AS ocupacao, NR_CANDIDATO AS numero FROM ${T('candidatos', ano)} WHERE ${nameCond.replace(/c\./g, '')} LIMIT 20`,
          config_visual: { tipo_grafico: "table", titulo: `Perfil: ${e.nomes.join(', ')}`, descricao: "Dados do candidato", mapping: { axis: "candidato", dataKeys: [] } },
        };
      }
      const w = buildWhere(e);
      return {
        sql: `SELECT NM_URNA_CANDIDATO AS candidato, SG_PARTIDO AS partido, DS_CARGO AS cargo, DS_SIT_TOT_TURNO AS situacao FROM ${T('candidatos', ano)} ${w} ORDER BY NM_URNA_CANDIDATO LIMIT 30`,
        config_visual: { tipo_grafico: "table", titulo: `Candidatos — ${lbl} ${ano}`, descricao: "", mapping: { axis: "candidato", dataKeys: [] } },
      };
    }
    case "votos_por_zona": {
      const m = mun || 'GOIÂNIA';
      return {
        sql: `SELECT NR_ZONA AS zona, SUM(QT_APTOS) AS eleitores, SUM(QT_COMPARECIMENTO) AS comparecimento FROM ${T('detalhe_munzona', ano)} WHERE NM_MUNICIPIO='${sqlSafe(m)}' GROUP BY NR_ZONA ORDER BY zona`,
        config_visual: { tipo_grafico: "bar", titulo: `Zonas — ${m} ${ano}`, descricao: "Por zona eleitoral", mapping: { axis: "zona", dataKeys: ["eleitores","comparecimento"] } },
      };
    }
    case "comparativo_partidos": {
      if (e.partidos.length >= 2) {
        const pList = e.partidos.map(p => `'${sqlSafe(p)}'`).join(',');
        const mCond = mun ? `AND NM_MUNICIPIO='${mun}'` : '';
        return {
          sql: `SELECT SG_PARTIDO AS partido, SUM(QT_VOTOS_NOMINAIS_VALIDOS) AS votos_nominais, SUM(QT_VOTOS_LEGENDA_VALIDOS) AS votos_legenda FROM ${T('votacao_partido', ano)} WHERE SG_PARTIDO IN (${pList}) ${mCond} GROUP BY SG_PARTIDO ORDER BY votos_nominais DESC`,
          config_visual: { tipo_grafico: "bar", titulo: `${e.partidos.join(' × ')} — ${ano}`, descricao: "Comparativo", mapping: { axis: "partido", dataKeys: ["votos_nominais","votos_legenda"] } },
        };
      }
      return buildQuery("partidos_ranking", e);
    }
    case "partidos_ranking":
      return {
        sql: `SELECT SG_PARTIDO AS partido, SUM(QT_VOTOS_NOMINAIS_VALIDOS) AS votos FROM ${T('votacao_partido', ano)} ${mun?`WHERE NM_MUNICIPIO='${mun}'`:''} GROUP BY SG_PARTIDO ORDER BY votos DESC LIMIT ${e.limite}`,
        config_visual: { tipo_grafico: "bar", titulo: `Ranking partidos — ${lbl} ${ano}`, descricao: "Por votos", mapping: { axis: "partido", dataKeys: ["votos"] } },
      };
    case "locais_votacao": {
      const m = mun || 'GOIÂNIA';
      return {
        sql: `SELECT NM_LOCAL_VOTACAO AS local, NM_BAIRRO AS bairro, DS_ENDERECO AS endereco, SUM(QT_ELEITORES_PERFIL) AS eleitores FROM ${T('eleitorado_local', Math.min(ano, 2024))} WHERE SG_UF='GO' AND NM_MUNICIPIO='${sqlSafe(m)}' GROUP BY NM_LOCAL_VOTACAO,NM_BAIRRO,DS_ENDERECO ORDER BY eleitores DESC LIMIT 30`,
        config_visual: { tipo_grafico: "table", titulo: `Locais de votação — ${m} ${ano}`, descricao: "Escolas e colégios", mapping: { axis: "local", dataKeys: ["eleitores"] } },
      };
    }
    case "resumo_eleicao": {
      const w = buildWhere(e);
      return {
        sql: `SELECT COUNT(*) AS total_candidatos, COUNT(CASE WHEN DS_SIT_TOT_TURNO ILIKE '%ELEITO%' AND DS_SIT_TOT_TURNO NOT ILIKE '%NÃO ELEITO%' THEN 1 END) AS eleitos, COUNT(CASE WHEN DS_GENERO='FEMININO' THEN 1 END) AS mulheres, COUNT(DISTINCT SG_PARTIDO) AS partidos FROM ${T('candidatos', ano)} ${w}`,
        config_visual: { tipo_grafico: "kpi", titulo: `Resumo — ${lbl} ${ano}`, descricao: "Visão geral", mapping: { axis: "", dataKeys: ["total_candidatos","eleitos","mulheres","partidos"] } },
      };
    }
    case "comparativo_anos": {
      const anos = [2016,2018,2020,2022,2024];
      const mc = mun ? `WHERE NM_UE='${mun}'` : '';
      return {
        sql: `SELECT * FROM (${anos.map(a => `SELECT ${a} AS ano, COUNT(*) AS candidatos, COUNT(CASE WHEN DS_SIT_TOT_TURNO ILIKE '%ELEITO%' AND DS_SIT_TOT_TURNO NOT ILIKE '%NÃO ELEITO%' THEN 1 END) AS eleitos FROM ${T('candidatos', a)} ${mc}`).join(' UNION ALL ')}) ORDER BY ano`,
        config_visual: { tipo_grafico: "line", titulo: `Comparativo — ${lbl}`, descricao: "Evolução entre eleições", mapping: { axis: "ano", dataKeys: ["candidatos","eleitos"] } },
      };
    }
    default: return null;
  }
}

// ── SMART RESPONSE FORMATTER ──

function formatResponse(dados: Record<string, any>[], colunas: string[], plan: QueryPlan, pergunta: string, intent: Intent): string {
  if (dados.length === 0) {
    return `Nenhum dado encontrado para "${pergunta}". Tente ajustar o nome, ano ou filtros.`;
  }

  const fmt = (v: any) => typeof v === 'number' ? v.toLocaleString('pt-BR') : v;

  // Single row with few columns → detailed KPI style
  if (dados.length === 1 && colunas.length <= 8) {
    const row = dados[0];
    const parts = colunas.map(c => `**${c.replace(/_/g, ' ')}**: ${fmt(row[c])}`);
    return `**${plan.config_visual.titulo}**\n\n${parts.join('\n')}`;
  }

  // COMPARATIVO: side-by-side comparison
  if (intent === 'comparativo_candidatos' && colunas.includes('total_votos')) {
    const lines = dados.map((r, i) => {
      const extra = r.partido ? ` (${r.partido})` : '';
      const cargo = r.cargo ? ` — ${r.cargo}` : '';
      const mun = r.municipio ? ` em ${r.municipio}` : '';
      const sit = r.situacao ? ` [${r.situacao}]` : '';
      const pct = dados[0].total_votos > 0 && i > 0 
        ? ` (${((r.total_votos / dados[0].total_votos) * 100).toFixed(1)}% do 1º)`
        : i === 0 ? ' 🏆' : '';
      return `${i + 1}. **${r.candidato}**${extra}${cargo}${mun}: **${fmt(r.total_votos)} votos**${sit}${pct}`;
    });
    const diff = dados.length >= 2 ? `\n\n📊 **Diferença**: ${fmt(dados[0].total_votos - dados[1].total_votos)} votos entre 1º e 2º` : '';
    return `**${plan.config_visual.titulo}**\n\n${lines.join('\n')}${diff}`;
  }

  // Vote queries → show actual vote numbers prominently
  if (colunas.includes('total_votos')) {
    const lines = dados.slice(0, 15).map((r, i) => {
      const extra = r.partido ? ` (${r.partido})` : '';
      const cargo = r.cargo ? ` — ${r.cargo}` : '';
      const mun = r.municipio ? ` em ${r.municipio}` : '';
      const sit = r.situacao ? ` [${r.situacao}]` : '';
      const zona = r.zona !== undefined ? ` | Zona ${r.zona}` : '';
      const secao = r.secao !== undefined ? ` Seção ${r.secao}` : '';
      const bairro = r.bairro ? ` (${r.bairro})` : '';
      const local = r.local_votacao ? `**${r.local_votacao}**${bairro}` : `**${r.candidato || 'N/A'}**`;
      return `${i + 1}. ${local}${extra}${cargo}${mun}${zona}${secao}: **${fmt(r.total_votos)} votos**${sit}`;
    });
    return `**${plan.config_visual.titulo}**\n\n${lines.join('\n')}${dados.length > 15 ? `\n\n_...e mais ${dados.length - 15} resultados_` : ''}`;
  }

  // Patrimonio
  if (colunas.includes('patrimonio') || colunas.includes('valor')) {
    const valCol = colunas.includes('patrimonio') ? 'patrimonio' : 'valor';
    const nameCol = colunas.includes('candidato') ? 'candidato' : colunas[0];
    const lines = dados.slice(0, 10).map((r, i) => {
      const v = typeof r[valCol] === 'number' ? `R$ ${r[valCol].toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : r[valCol];
      const extra = r.partido ? ` (${r.partido})` : '';
      const bens = r.qtd_bens ? ` — ${r.qtd_bens} bens` : '';
      return `${i + 1}. **${r[nameCol]}**${extra}: ${v}${bens}`;
    });
    return `**${plan.config_visual.titulo}**\n\n${lines.join('\n')}`;
  }

  // Table data → markdown table for small sets
  if (dados.length <= 15 && colunas.length <= 8) {
    const header = `| ${colunas.map(c => c.replace(/_/g, ' ')).join(' | ')} |`;
    const sep = `| ${colunas.map(() => '---').join(' | ')} |`;
    const rows = dados.map(r => `| ${colunas.map(c => fmt(r[c])).join(' | ')} |`);
    return `**${plan.config_visual.titulo}**\n\n${header}\n${sep}\n${rows.join('\n')}`;
  }

  // Large datasets → summary
  const firstCol = colunas[0];
  const numCol = colunas.find(c => typeof dados[0]?.[c] === 'number');
  const highlights = dados.slice(0, 5).map((r, i) => {
    const v = numCol && typeof r[numCol] === 'number' ? ` (${fmt(r[numCol])})` : '';
    return `${i + 1}. **${r[firstCol]}**${v}`;
  }).join('\n');
  return `**${plan.config_visual.titulo}** — ${dados.length} resultados\n\n${highlights}${dados.length > 5 ? `\n\n_...e mais ${dados.length - 5} resultados_` : ''}`;
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
    const geminiResult = await callGemini(pergunta);
    if (geminiResult) {
      inputParaAnalise = geminiResult;
      console.log(`[Normalizer] "${pergunta}" → "${geminiResult}"`);
    }

    // Step 2: Detecção algorítmica
    const combined = `${pergunta} ${inputParaAnalise}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const intent = detectIntent(combined);
    const entities = extractEntities(`${pergunta} ${inputParaAnalise}`);
    if (entities.anos.length === 0) entities.anos = [2024];

    // Try to extract names from Gemini output if none found
    if (entities.nomes.length === 0 && geminiResult) {
      // Check for ||| separated names first
      const pipeNames = geminiResult.split('|||').map(s => s.trim()).filter(s => /^[A-ZÀ-Ú\s]{3,}$/.test(s));
      if (pipeNames.length > 0) {
        entities.nomes.push(...pipeNames);
      } else {
        const geminiNames = geminiResult.match(/[A-ZÀ-Ú]{2,}(?:\s+[A-ZÀ-Ú]{2,})+/g);
        if (geminiNames) {
          const keywords = new Set(["NOME CANDIDATO","NOME CANDIDATO 1","NOME CANDIDATO 2","NOME CANDIDATO 3","BUSCA CANDIDATO","VOTOS CANDIDATO","RANKING VOTOS","TOTAL CANDIDATOS","DISTRIBUICAO GENERO","COMPARATIVO CANDIDATOS","VOTOS CANDIDATO LOCAL","VOTOS CANDIDATO ZONA","VOTOS CANDIDATO SECAO"]);
          for (const gn of geminiNames) {
            if (!keywords.has(gn) && gn.length > 3) {
              entities.nomes.push(gn);
            }
          }
        }
      }
    }

    // If comparativo intent but only 1 name, try harder to find second name
    if (intent === 'comparativo_candidatos' && entities.nomes.length < 2 && geminiResult) {
      // Extract all capitalized words sequences as potential names
      const allCaps = geminiResult.match(/[A-ZÀ-Ú]{2,}(?:\s+[A-ZÀ-Ú]{2,})*/g) || [];
      const keywords = new Set(["COMPARATIVO CANDIDATOS","NOME CANDIDATO","VOTOS","PREFEITO","VEREADOR","GOIANIA","GOIÂNIA"]);
      for (const cap of allCaps) {
        if (!keywords.has(cap) && cap.length > 3 && !entities.nomes.includes(cap)) {
          entities.nomes.push(cap);
        }
      }
    }

    console.log(`[Pipeline] Intent: ${intent} | Entities:`, JSON.stringify({ anos: entities.anos, municipios: entities.municipios, cargos: entities.cargos, nomes: entities.nomes, zonas: entities.zonas, secoes: entities.secoes }));

    // Step 3: Build SQL + visual config (100% determinístico)
    let plan = buildQuery(intent, entities);

    if (!plan) {
      return new Response(JSON.stringify({
        sucesso: true, resposta_texto: "Não entendi sua pergunta. Tente perguntar sobre:\n- **Votos de um candidato** (ex: \"quantos votos Tatá teve\")\n- **Comparar candidatos** (ex: \"compare Vanderlan e Adriana\")\n- **Votos por escola** (ex: \"votos no Colégio Estadual\")\n- **Votos por zona** (ex: \"votos na zona 42\")\n- **Ranking** de mais votados ou patrimônio\n- **Evolução** de um candidato ao longo das eleições\n- **Comparecimento** e abstenção",
        config_visual: { tipo_grafico: "table", titulo: "Não entendi", descricao: "", mapping: { axis: "", dataKeys: [] } },
        dados_brutos: [], colunas: [],
        tipo_grafico: "table", titulo: "Não entendi", descricao: "", dados: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Safety
    const sqlUp = plan.sql.toUpperCase().trim();
    if (!sqlUp.startsWith("SELECT") && !sqlUp.startsWith("WITH")) return new Response(JSON.stringify({ erro: "Query não permitida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (["DROP","DELETE","INSERT","UPDATE","ALTER","TRUNCATE","CREATE"].some(f => sqlUp.includes(f))) return new Response(JSON.stringify({ erro: "Operação proibida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Step 4: Execute
    const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
    async function exec(q: string) {
      const pg = postgres({ hostname: "pg.us-east-1-aws.motherduck.com", port: 5432, username: "postgres", password: mdToken, database: "md:", ssl: "require", connection: { application_name: "eleicoesgo-chat" }, max: 1, idle_timeout: 5, connect_timeout: 15 });
      try { const rows = await pg.unsafe(q); await pg.end(); return Array.isArray(rows) ? rows.map((r: any) => ({ ...r })) : []; }
      catch (err) { await pg.end().catch(() => {}); throw err; }
    }

    let dados: Record<string, any>[];
    try {
      dados = await exec(plan.sql);
    } catch (queryErr: any) {
      console.error("Query error:", queryErr.message, "SQL:", plan.sql);
      return new Response(JSON.stringify({ sucesso: false, erro: `Erro na consulta: ${queryErr.message?.substring(0, 100)}. Tente reformular a pergunta.` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 5: Smart response formatting
    const colunas = dados.length > 0 ? Object.keys(dados[0]) : [];
    const resposta = formatResponse(dados, colunas, plan, pergunta, intent);

    return new Response(JSON.stringify({
      sucesso: true,
      config_visual: plan.config_visual,
      dados_brutos: dados,
      resposta_texto: resposta,
      colunas,
      sql_gerado: plan.sql,
      intent,
      entities_encontradas: entities,
      tipo_grafico: plan.config_visual.tipo_grafico,
      titulo: plan.config_visual.titulo,
      descricao: plan.config_visual.descricao,
      dados,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ erro: "Erro interno" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
