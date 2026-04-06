/**
 * Edge Function: bd-eleicoes-bigquery
 * Proxy universal para consultar dados eleitorais no BigQuery.
 * 
 * Qualquer app Lovable pode chamar:
 *   supabase.functions.invoke("bd-eleicoes-bigquery", { body: { tabela: "raw_candidatos_2024" } })
 * 
 * Endpoints:
 *   POST /  — consulta dados
 *     body: { tabela, filtros?, colunas?, limite?, offset?, ordenar? }
 *   GET  /tabelas — lista todas as tabelas disponíveis
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PROJECT_ID = "silver-idea-389314";
const DATASET = "eleicoes_go_clean";
const BQ_API = "https://bigquery.googleapis.com/bigquery/v2";

// ═══════════════════════════════════════════════════════════
//  GCP Auth — JWT com Service Account
// ═══════════════════════════════════════════════════════════
async function getAccessToken(): Promise<string> {
  const saKeyJson = Deno.env.get("GCP_SERVICE_ACCOUNT_KEY");
  if (!saKeyJson) {
    throw new Error("GCP_SERVICE_ACCOUNT_KEY não configurada");
  }

  const sa = JSON.parse(saKeyJson);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/bigquery.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: exp,
  };

  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const unsignedToken = `${enc(header)}.${enc(payload)}`;

  // Import private key
  const pemContent = sa.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${unsignedToken}.${signature}`;

  // Exchange JWT for access token
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResp.ok) {
    const err = await tokenResp.text();
    throw new Error(`Falha ao obter token GCP: ${err}`);
  }

  const tokenData = await tokenResp.json();
  return tokenData.access_token;
}

// ═══════════════════════════════════════════════════════════
//  BigQuery Query
// ═══════════════════════════════════════════════════════════
interface QueryParams {
  tabela: string;
  filtros?: Record<string, string | number>;
  colunas?: string[];
  limite?: number;
  offset?: number;
  ordenar?: string;
  sql_custom?: string; // SQL livre (opcional, requer auth admin)
}

// Tabelas permitidas (prefixo raw_)
const TABELA_REGEX = /^raw_[a-z0-9_]+$/;
const MAX_LIMITE = 10000;
const DEFAULT_LIMITE = 1000;

function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "");
}

function buildQuery(params: QueryParams): { query: string; params: { name: string; parameterType: { type: string }; parameterValue: { value: string } }[] } {
  const tabela = sanitizeIdentifier(params.tabela);
  if (!TABELA_REGEX.test(tabela)) {
    throw new Error(`Tabela inválida: ${tabela}. Use apenas tabelas raw_*`);
  }

  const colunas = params.colunas?.map(sanitizeIdentifier).join(", ") || "*";
  const limite = Math.min(params.limite || DEFAULT_LIMITE, MAX_LIMITE);
  const offset = params.offset || 0;

  let sql = `SELECT ${colunas} FROM \`${PROJECT_ID}.${DATASET}.${tabela}\``;
  const queryParams: { name: string; parameterType: { type: string }; parameterValue: { value: string } }[] = [];

  // Filtros
  if (params.filtros && Object.keys(params.filtros).length > 0) {
    const conditions: string[] = [];
    let i = 0;
    for (const [col, val] of Object.entries(params.filtros)) {
      const safeCol = sanitizeIdentifier(col);
      const paramName = `p${i}`;
      conditions.push(`${safeCol} = @${paramName}`);
      queryParams.push({
        name: paramName,
        parameterType: { type: "STRING" },
        parameterValue: { value: String(val) },
      });
      i++;
    }
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }

  // Ordenação
  if (params.ordenar) {
    const safeOrder = sanitizeIdentifier(params.ordenar);
    sql += ` ORDER BY ${safeOrder}`;
  }

  sql += ` LIMIT ${limite} OFFSET ${offset}`;

  return { query: sql, params: queryParams };
}

async function executeBQQuery(accessToken: string, sql: string, queryParams: unknown[]): Promise<unknown> {
  const url = `${BQ_API}/projects/${PROJECT_ID}/queries`;

  const body: Record<string, unknown> = {
    query: sql,
    useLegacySql: false,
    maxResults: MAX_LIMITE,
    timeoutMs: 30000,
    parameterMode: "NAMED",
  };

  if (queryParams.length > 0) {
    body.queryParameters = queryParams;
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`BigQuery erro [${resp.status}]: ${err}`);
  }

  return await resp.json();
}

function formatResults(bqResponse: Record<string, unknown>): { colunas: string[]; linhas: Record<string, string>[]; total: number } {
  const schema = (bqResponse.schema as { fields: { name: string }[] })?.fields || [];
  const rows = (bqResponse.rows as { f: { v: string }[] }[]) || [];
  const colunas = schema.map((f) => f.name);

  const linhas = rows.map((row) => {
    const obj: Record<string, string> = {};
    row.f.forEach((cell, i) => {
      obj[colunas[i]] = cell.v;
    });
    return obj;
  });

  return {
    colunas,
    linhas,
    total: parseInt(String(bqResponse.totalRows || "0"), 10),
  };
}

// ═══════════════════════════════════════════════════════════
//  Listar tabelas
// ═══════════════════════════════════════════════════════════
async function listTables(accessToken: string): Promise<{ tabelas: { nome: string; linhas: string; tamanho_bytes: string }[] }> {
  const url = `${BQ_API}/projects/${PROJECT_ID}/datasets/${DATASET}/tables?maxResults=200`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`BigQuery listTables erro [${resp.status}]: ${err}`);
  }

  const data = await resp.json();
  const tables = (data.tables || []).map((t: Record<string, unknown>) => ({
    nome: (t.tableReference as { tableId: string }).tableId,
    linhas: String((t as Record<string, string>).numRows || "0"),
    tamanho_bytes: String((t as Record<string, string>).numBytes || "0"),
  }));

  return { tabelas: tables };
}

// ═══════════════════════════════════════════════════════════
//  Handler principal
// ═══════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const accessToken = await getAccessToken();

    // GET /tabelas — lista tabelas
    if (url.pathname.endsWith("/tabelas") || url.searchParams.get("acao") === "tabelas") {
      const result = await listTables(accessToken);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST / — consulta dados
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ erro: "Use POST com body JSON" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as QueryParams;

    if (!body.tabela) {
      return new Response(JSON.stringify({ erro: "Campo 'tabela' é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { query, params } = buildQuery(body);
    const bqResult = await executeBQQuery(accessToken, query, params);
    const formatted = formatResults(bqResult as Record<string, unknown>);

    return new Response(JSON.stringify({
      sucesso: true,
      tabela: body.tabela,
      ...formatted,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Erro bd-eleicoes-bigquery:", error);
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ sucesso: false, erro: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
