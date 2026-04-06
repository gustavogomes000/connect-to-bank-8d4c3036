const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TABELAS_SCHEMA = `
Tabelas disponíveis no MotherDuck (DuckDB via Postgres wire protocol), database "my_db":

IMPORTANTE: As tabelas são separadas POR ANO. Use o padrão: nome_YYYY_GO
Anos disponíveis: 2012, 2014, 2016, 2018, 2020, 2022, 2024.

1. candidatos_YYYY_GO: candidatos eleitorais de Goiás
   Colunas: ano_eleicao, nr_turno, nm_candidato (nome completo), nm_urna_candidato (nome de urna),
   nr_candidato (número), sg_partido, nm_partido, ds_cargo, nm_ue (município),
   ds_sit_tot_turno (situação final: ELEITO, NÃO ELEITO, SUPLENTE, etc),
   ds_genero (MASCULINO/FEMININO), ds_grau_instrucao, ds_ocupacao,
   dt_nascimento, ds_nacionalidade, ds_cor_raca, ds_estado_civil,
   sq_candidato (sequencial único), nr_cpf_candidato, nr_idade_data_posse

2. bens_candidatos_YYYY_GO: bens declarados (anos 2014-2024)
   Colunas: ano_eleicao, sq_candidato, nm_candidato, sg_partido, ds_cargo, nm_ue,
   nr_ordem_bem_candidato, ds_tipo_bem_candidato, ds_bem_candidato,
   vr_bem_candidato (VARCHAR! Use CAST(vr_bem_candidato AS DOUBLE) para somas)

3. votacao_munzona_YYYY_GO: votos por candidato por zona
   Colunas: ano_eleicao, nr_turno, nm_municipio, nr_zona, ds_cargo,
   nm_urna_candidato, nr_candidato, sg_partido, qt_votos_nominais

4. votacao_partido_munzona_YYYY_GO: votos por partido
   Colunas: ano_eleicao, nr_turno, nm_municipio, nr_zona, ds_cargo,
   sg_partido, nr_partido, qt_votos_nominais, qt_votos_legenda

5. comparecimento_munzona_YYYY_GO: comparecimento por zona (anos 2014-2024)
   Colunas: ano_eleicao, nr_turno, nm_municipio, nr_zona,
   qt_aptos, qt_comparecimento, qt_abstencoes, qt_votos_brancos, qt_votos_nulos

6. perfil_eleitorado_YYYY_GO: perfil do eleitorado (anos 2018-2024)
   Colunas: ano_eleicao, nm_municipio, nr_zona, ds_genero, ds_faixa_etaria,
   ds_grau_escolaridade, qt_eleitores_perfil

Contexto: Dados eleitorais do estado de Goiás (GO), Brasil.
Principais municípios: GOIÂNIA, APARECIDA DE GOIÂNIA, ANÁPOLIS.
Nomes de municípios são SEMPRE em MAIÚSCULAS.
`;

async function queryMotherDuck(sql: string) {
  const token = Deno.env.get("MOTHERDUCK_TOKEN");
  if (!token) throw new Error("MOTHERDUCK_TOKEN não configurado");

  const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");

  const pg = postgres({
    hostname: "pg.us-east-1-aws.motherduck.com",
    port: 5432,
    username: "postgres",
    password: token,
    database: "md:",
    ssl: "require",
    connection: { application_name: "consulta-ia" },
    max: 1,
    idle_timeout: 5,
    connect_timeout: 15,
  });

  try {
    const rows = await pg.unsafe(sql);
    await pg.end();
    return Array.from(rows);
  } catch (err) {
    await pg.end().catch(() => {});
    throw err;
  }
}

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
      return new Response(JSON.stringify({ erro: "GEMINI_API_KEY não configurada no Supabase. Configure em Project Settings > Edge Functions > Secrets." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Ask Gemini to generate SQL
    const prompt = `Você é um analista de dados eleitorais especializado em Goiás. Com base no schema abaixo, gere uma consulta SQL DuckDB para responder a pergunta do usuário.

${TABELAS_SCHEMA}

REGRAS IMPORTANTES:
- Gere APENAS SELECT, nunca INSERT/UPDATE/DELETE
- Use LIMIT máximo de 200 linhas
- Use nomes de tabela completos com prefixo my_db. (ex: my_db.candidatos_2024_GO)
- SEMPRE use o ano correto na tabela. Se o usuário pedir 2024, use _2024_GO
- Se o usuário não especificar ano, use 2024
- Para comparações de texto use UPPER() ou ILIKE
- Retorne colunas com nomes descritivos usando AS
- Escolha o tipo de gráfico mais adequado: bar, pie, line, area, table, kpi
- Para KPIs, retorne uma única linha com valores numéricos
- Sempre ordene os resultados de forma relevante
- Para somar vr_bem_candidato use CAST(vr_bem_candidato AS DOUBLE)
- Para evolução temporal, faça UNION ALL de tabelas de diferentes anos

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
    if (!sqlUpper.startsWith("SELECT") && !sqlUpper.startsWith("WITH")) {
      return new Response(JSON.stringify({ erro: "Query não permitida por segurança" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (sqlUpper.includes("DROP") || sqlUpper.includes("DELETE") || 
        sqlUpper.includes("INSERT") || sqlUpper.includes("UPDATE") || sqlUpper.includes("ALTER") ||
        sqlUpper.includes("TRUNCATE") || sqlUpper.includes("CREATE")) {
      return new Response(JSON.stringify({ erro: "Query não permitida por segurança" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Execute SQL via MotherDuck
    const dados = await queryMotherDuck(sql);
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
