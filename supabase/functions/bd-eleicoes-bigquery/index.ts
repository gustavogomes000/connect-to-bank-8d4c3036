/**
 * Edge Function: bd-eleicoes-bigquery v2
 * Proxy universal BigQuery — suporta: tabelas, schema, contagem, query
 * 
 * Ações (via body.acao ou query param):
 *   "tabelas"  — lista todas as tabelas com contagem
 *   "schema"   — retorna colunas de uma tabela
 *   "contar"   — COUNT(*) com filtros opcionais  
 *   "query"    — consulta dados com filtros, paginação, ordenação
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PROJECT_ID = "silver-idea-389314";
const DATASET = "eleicoes_go_clean";
const BQ_API = "https://bigquery.googleapis.com/bigquery/v2";

// ═══ GCP Auth ═══
let cachedToken: { token: string; expires: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.token;

  const saKeyJson = Deno.env.get("GCP_SERVICE_ACCOUNT_KEY");
  if (!saKeyJson) throw new Error("GCP_SERVICE_ACCOUNT_KEY não configurada");

  const sa = JSON.parse(saKeyJson);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/bigquery.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp,
  };

  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const unsignedToken = `${enc(header)}.${enc(payload)}`;

  const pemContent = sa.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${unsignedToken}.${signature}`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResp.ok) throw new Error(`Falha token GCP: ${await tokenResp.text()}`);
  const tokenData = await tokenResp.json();
  cachedToken = { token: tokenData.access_token, expires: Date.now() + 3500_000 };
  return tokenData.access_token;
}

// ═══ BigQuery helpers ═══
const TABELA_REGEX = /^raw_[a-z0-9_]+$/;
const MAX_LIMITE = 10000;

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "");
}

async function bqQuery(token: string, sql: string, params: unknown[] = []): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    query: sql,
    useLegacySql: false,
    maxResults: MAX_LIMITE,
    timeoutMs: 30000,
    parameterMode: "NAMED",
  };
  if (params.length > 0) body.queryParameters = params;

  const resp = await fetch(`${BQ_API}/projects/${PROJECT_ID}/queries`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) throw new Error(`BigQuery [${resp.status}]: ${await resp.text()}`);
  return await resp.json();
}

function formatRows(bqResp: Record<string, unknown>): { colunas: string[]; linhas: Record<string, string>[]; total: number } {
  const schema = (bqResp.schema as { fields: { name: string }[] })?.fields || [];
  const rows = (bqResp.rows as { f: { v: string }[] }[]) || [];
  const colunas = schema.map(f => f.name);
  const linhas = rows.map(row => {
    const obj: Record<string, string> = {};
    row.f.forEach((cell, i) => { obj[colunas[i]] = cell.v; });
    return obj;
  });
  return { colunas, linhas, total: parseInt(String(bqResp.totalRows || "0"), 10) };
}

// ═══ Ações ═══
async function listarTabelas(token: string) {
  const url = `${BQ_API}/projects/${PROJECT_ID}/datasets/${DATASET}/tables?maxResults=200`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`listTables [${resp.status}]: ${await resp.text()}`);
  const data = await resp.json();
  const tabelas = (data.tables || []).map((t: Record<string, unknown>) => ({
    nome: (t.tableReference as { tableId: string }).tableId,
    linhas: String((t as Record<string, string>).numRows || "0"),
    tamanho_mb: (Number((t as Record<string, string>).numBytes || 0) / 1_048_576).toFixed(1),
  }));
  return { tabelas };
}

async function schemaTabela(token: string, tabela: string) {
  const safe = sanitize(tabela);
  if (!TABELA_REGEX.test(safe)) throw new Error(`Tabela inválida: ${safe}`);
  const sql = `SELECT column_name, data_type FROM \`${PROJECT_ID}.${DATASET}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t ORDER BY ordinal_position`;
  const params = [{ name: "t", parameterType: { type: "STRING" }, parameterValue: { value: safe } }];
  const result = await bqQuery(token, sql, params);
  const { linhas } = formatRows(result);
  return { tabela: safe, colunas: linhas };
}

async function contarTabela(token: string, tabela: string, filtros?: Record<string, string>) {
  const safe = sanitize(tabela);
  if (!TABELA_REGEX.test(safe)) throw new Error(`Tabela inválida: ${safe}`);
  let sql = `SELECT COUNT(*) as total FROM \`${PROJECT_ID}.${DATASET}.${safe}\``;
  const params: unknown[] = [];
  if (filtros && Object.keys(filtros).length > 0) {
    const conds: string[] = [];
    let i = 0;
    for (const [col, val] of Object.entries(filtros)) {
      const sc = sanitize(col);
      conds.push(`${sc} = @p${i}`);
      params.push({ name: `p${i}`, parameterType: { type: "STRING" }, parameterValue: { value: String(val) } });
      i++;
    }
    sql += ` WHERE ${conds.join(" AND ")}`;
  }
  const result = await bqQuery(token, sql, params);
  const { linhas } = formatRows(result);
  return { tabela: safe, total: parseInt(linhas[0]?.total || "0", 10) };
}

interface QueryBody {
  tabela: string;
  filtros?: Record<string, string>;
  colunas?: string[];
  limite?: number;
  offset?: number;
  ordenar?: string;
  ordem?: "ASC" | "DESC";
  busca?: { coluna: string; valor: string };
}

async function queryTabela(token: string, body: QueryBody) {
  const safe = sanitize(body.tabela);
  if (!TABELA_REGEX.test(safe)) throw new Error(`Tabela inválida: ${safe}`);

  const colunas = body.colunas?.map(sanitize).join(", ") || "*";
  const limite = Math.min(body.limite || 100, MAX_LIMITE);
  const offset = body.offset || 0;

  let sql = `SELECT ${colunas} FROM \`${PROJECT_ID}.${DATASET}.${safe}\``;
  const params: unknown[] = [];
  const conds: string[] = [];
  let pi = 0;

  if (body.filtros) {
    for (const [col, val] of Object.entries(body.filtros)) {
      conds.push(`${sanitize(col)} = @p${pi}`);
      params.push({ name: `p${pi}`, parameterType: { type: "STRING" }, parameterValue: { value: String(val) } });
      pi++;
    }
  }

  if (body.busca?.coluna && body.busca?.valor) {
    conds.push(`LOWER(${sanitize(body.busca.coluna)}) LIKE @busca`);
    params.push({ name: "busca", parameterType: { type: "STRING" }, parameterValue: { value: `%${body.busca.valor.toLowerCase()}%` } });
  }

  if (conds.length > 0) sql += ` WHERE ${conds.join(" AND ")}`;

  if (body.ordenar) {
    sql += ` ORDER BY ${sanitize(body.ordenar)} ${body.ordem === "DESC" ? "DESC" : "ASC"}`;
  }

  sql += ` LIMIT ${limite} OFFSET ${offset}`;

  const result = await bqQuery(token, sql, params);
  return { sucesso: true, tabela: safe, ...formatRows(result) };
}

// ═══ Handler ═══
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = await getAccessToken();

    // Determinar ação
    let acao = url.searchParams.get("acao") || "";
    let body: Record<string, unknown> = {};

    if (req.method === "POST") {
      body = await req.json();
      if (body.acao) acao = String(body.acao);
    }

    if (url.pathname.endsWith("/tabelas")) acao = "tabelas";

    let result: unknown;

    switch (acao) {
      case "tabelas":
        result = await listarTabelas(token);
        break;
      case "schema":
        result = await schemaTabela(token, String(body.tabela || url.searchParams.get("tabela") || ""));
        break;
      case "contar":
        result = await contarTabela(token, String(body.tabela || ""), body.filtros as Record<string, string>);
        break;
      default:
        // Query padrão
        if (!body.tabela) {
          return new Response(JSON.stringify({ erro: "Campo 'tabela' ou 'acao' obrigatório" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = await queryTabela(token, body as unknown as QueryBody);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Erro bd-eleicoes-bigquery:", error);
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ sucesso: false, erro: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
