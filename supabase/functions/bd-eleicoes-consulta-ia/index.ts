import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TABELAS_SCHEMA = `
Tabelas disponíveis no banco PostgreSQL (schema public):

1. bd_eleicoes_candidatos: candidatos eleitorais de Goiás
   Colunas: id (bigint PK), ano (int), turno (int), nome_completo (text), nome_urna (text), 
   numero_urna (int), sigla_partido (text), partido (text), cargo (text), municipio (text), 
   codigo_municipio (text), situacao_candidatura (text), situacao_final (text), genero (text), 
   grau_instrucao (text), ocupacao (text), data_nascimento (text), nacionalidade (text), 
   foto_url (text), sequencial_candidato (text), zona (int)

2. bd_eleicoes_votacao: votos por candidato por zona
   Colunas: id (bigint PK), ano (int), turno (int), municipio (text), codigo_municipio (text), 
   zona (int), cargo (text), nome_candidato (text), numero_urna (int), partido (text), total_votos (int)

3. bd_eleicoes_votacao_partido: votos por partido
   Colunas: id (bigint PK), ano (int), turno (int), municipio (text), codigo_municipio (text), 
   zona (int), cargo (text), sigla_partido (text), numero_partido (int), total_votos (int), 
   votos_nominais (int), votos_legenda (int)

4. bd_eleicoes_comparecimento: comparecimento por zona
   Colunas: id (bigint PK), ano (int), turno (int), municipio (text), codigo_municipio (text), 
   zona (int), eleitorado_apto (int), comparecimento (int), abstencoes (int), 
   votos_brancos (int), votos_nulos (int), votos_nominais (int), votos_legenda (int)

5. bd_eleicoes_comparecimento_secao: comparecimento por seção/bairro
   Colunas: id (bigint PK), ano (int), turno (int), municipio (text), codigo_municipio (text),
   zona (int), secao (int), local_votacao (text), bairro (text), endereco (text),
   eleitorado_apto (int), comparecimento (int), abstencoes (int), votos_brancos (int), votos_nulos (int)

6. bd_eleicoes_bens_candidatos: bens declarados
   Colunas: id (bigint PK), ano (int), turno (int), sequencial_candidato (text), nome_candidato (text),
   sigla_partido (text), cargo (text), municipio (text), codigo_municipio (text),
   ordem_bem (int), tipo_bem (text), descricao_bem (text), valor_bem (float)

7. bd_eleicoes_locais_votacao: locais de votação
   Colunas: id (bigint PK), ano (int), municipio (text), codigo_municipio (text), zona (int), 
   secao (int), local_votacao (text), bairro (text), endereco_local (text), eleitorado_apto (int)

Contexto: Dados eleitorais do estado de Goiás (GO), Brasil. Anos disponíveis: 2012-2024.
Principais municípios: GOIÂNIA, APARECIDA DE GOIÂNIA, ANÁPOLIS.
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { pergunta } = await req.json();
    if (!pergunta || typeof pergunta !== "string" || pergunta.length < 5) {
      return new Response(JSON.stringify({ erro: "Pergunta inválida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return new Response(JSON.stringify({ erro: "GEMINI_API_KEY não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Ask Gemini to generate SQL
    const prompt = `Você é um analista de dados eleitorais. Com base no schema abaixo, gere uma consulta SQL PostgreSQL para responder a pergunta do usuário.

${TABELAS_SCHEMA}

REGRAS IMPORTANTES:
- Gere APENAS SELECT, nunca INSERT/UPDATE/DELETE
- Use LIMIT máximo de 200 linhas
- Sempre use nomes de tabela completos (bd_eleicoes_*)
- Para comparações de texto use UPPER() ou ILIKE
- Retorne colunas com nomes descritivos usando AS
- Escolha o tipo de gráfico mais adequado: bar, pie, line, area, table, kpi
- Para KPIs, retorne uma única linha com valores numéricos
- Sempre ordene os resultados de forma relevante

Responda APENAS em JSON válido com esta estrutura:
{
  "sql": "SELECT ...",
  "tipo_grafico": "bar|pie|line|area|table|kpi",
  "titulo": "Título descritivo da visualização",
  "descricao": "Breve explicação do que está sendo mostrado"
}

Pergunta do usuário: ${pergunta}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini error:", errText);
      return new Response(JSON.stringify({ erro: "Erro ao consultar IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // Extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ erro: "IA não retornou formato válido", raw: rawText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const { sql, tipo_grafico, titulo, descricao } = parsed;

    // Safety check
    const sqlUpper = sql.toUpperCase().trim();
    if (!sqlUpper.startsWith("SELECT") || sqlUpper.includes("DROP") || sqlUpper.includes("DELETE") || 
        sqlUpper.includes("INSERT") || sqlUpper.includes("UPDATE") || sqlUpper.includes("ALTER") ||
        sqlUpper.includes("TRUNCATE") || sqlUpper.includes("CREATE")) {
      return new Response(JSON.stringify({ erro: "Query não permitida por segurança" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Execute SQL via Supabase
    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const dbClient = createClient(supabaseUrl, supabaseKey);
    
    // Use rpc to execute raw SQL safely
    const { data: queryResult, error: queryError } = await dbClient.rpc('execute_readonly_query' as any, {
      query_text: sql
    }) as any;

    // Fallback: if rpc doesn't exist, try direct table queries
    if (queryError) {
      console.error("RPC error, trying direct approach:", queryError.message);
      
      // Parse the SQL to extract table and basic structure, then use Supabase client
      // For now, return the SQL and let the frontend know
      return new Response(JSON.stringify({
        sucesso: false,
        erro: `Função RPC não encontrada. SQL gerado: ${sql}`,
        sql_gerado: sql,
        tipo_grafico: tipo_grafico || "table",
        titulo: titulo || "Consulta",
        descricao: descricao || "",
        colunas: [],
        dados: [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dados = Array.isArray(queryResult) ? queryResult : [];
    const colunas = dados.length > 0 ? Object.keys(dados[0]) : [];

    return new Response(JSON.stringify({
      sucesso: true,
      tipo_grafico: tipo_grafico || "table",
      titulo: titulo || "Resultado",
      descricao: descricao || "",
      colunas,
      dados,
      sql_gerado: sql,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ erro: e.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
