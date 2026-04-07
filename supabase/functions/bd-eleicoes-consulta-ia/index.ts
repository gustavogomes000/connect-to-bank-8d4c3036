const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================
// LOVABLE AI GATEWAY HELPER
// =============================================

async function callLovableAI(systemPrompt: string, userMessage: string, apiKey: string, maxTokens = 2000): Promise<string | null> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
// VALIDATED MOTHERDUCK SCHEMA (April 2026)
// =============================================

const SCHEMA_COMPLETO = `
Tabelas MotherDuck (DuckDB). Banco: my_db. Sufixo: _YYYY_GO.
ATENÇÃO: Use APENAS as colunas listadas abaixo. NUNCA invente colunas.

1. my_db.candidatos_YYYY_GO (anos: 2012-2024)
   Colunas: ano_eleicao(BIGINT), nr_turno(BIGINT), nm_candidato(VARCHAR), nm_urna_candidato(VARCHAR),
   nm_social_candidato(VARCHAR), sg_partido(VARCHAR), nm_partido(VARCHAR), ds_cargo(VARCHAR),
   nm_ue(VARCHAR=município), sg_uf(VARCHAR), sq_candidato(BIGINT), nr_candidato(BIGINT),
   nr_cpf_candidato(BIGINT), ds_email(VARCHAR), ds_situacao_candidatura(VARCHAR),
   sg_uf_nascimento(VARCHAR), dt_nascimento(DATE), ds_genero(VARCHAR), ds_grau_instrucao(VARCHAR),
   ds_ocupacao(VARCHAR), ds_cor_raca(VARCHAR), ds_estado_civil(VARCHAR),
   ds_sit_tot_turno(VARCHAR=situação final: ELEITO/NÃO ELEITO/etc),
   nr_partido(BIGINT), tp_agremiacao(VARCHAR)
   ⚠️ NÃO EXISTE: ds_nacionalidade, nr_idade_data_posse, nm_bairro

2. my_db.bens_candidatos_YYYY_GO (anos: 2014-2024)
   Colunas: ano_eleicao(BIGINT), sg_uf(VARCHAR), sg_ue(BIGINT), nm_ue(VARCHAR),
   sq_candidato(BIGINT), nr_ordem_bem_candidato(BIGINT),
   ds_tipo_bem_candidato(VARCHAR), ds_bem_candidato(VARCHAR),
   vr_bem_candidato(VARCHAR! vírgula decimal, ex: '100000,00')
   ⚠️ Para somar: CAST(REPLACE(vr_bem_candidato, ',', '.') AS DOUBLE)
   ⚠️ NÃO TEM: nm_candidato, sg_partido, nr_turno (precisa JOIN com candidatos via sq_candidato)

3. my_db.votacao_munzona_YYYY_GO (anos: 2012-2024)
   Colunas: ano_eleicao, nr_turno, sg_uf, nm_ue, cd_municipio(BIGINT), nm_municipio(VARCHAR),
   nr_zona(BIGINT), cd_cargo, ds_cargo, sq_candidato, nr_candidato, nm_candidato,
   nm_urna_candidato, sg_partido, nm_partido, qt_votos_nominais(BIGINT),
   ds_sit_tot_turno, ds_situacao_candidatura

4. my_db.comparecimento_munzona_YYYY_GO (anos: 2014-2024)
   Colunas: ano_eleicao, nr_turno, nm_municipio, nr_zona, cd_cargo, ds_cargo,
   qt_aptos(BIGINT), qt_comparecimento(BIGINT), qt_abstencoes(BIGINT),
   qt_votos_brancos(BIGINT), qt_votos_nulos(BIGINT), qt_votos(BIGINT)
   ⚠️ NÃO TEM: nm_bairro, nm_local_votacao

5. my_db.comparecimento_abstencao_YYYY_GO (anos: 2018-2024)
   É perfil demográfico de comparecimento, NÃO tem bairro/local.
   Colunas: ano_eleicao, nr_turno, nm_municipio, nr_zona,
   ds_genero, ds_estado_civil, ds_faixa_etaria, ds_grau_escolaridade, ds_cor_raca,
   qt_aptos(BIGINT), qt_comparecimento(BIGINT), qt_abstencao(BIGINT)

6. my_db.eleitorado_local_YYYY_GO (anos: 2018-2024) — TEM BAIRRO!
   Colunas: aa_eleicao(BIGINT), nm_municipio, nr_zona, nr_secao,
   nr_local_votacao(BIGINT), nm_local_votacao(VARCHAR), ds_endereco(VARCHAR),
   nm_bairro(VARCHAR), nr_cep(VARCHAR), nr_latitude(DOUBLE), nr_longitude(DOUBLE),
   qt_eleitor_secao(BIGINT), qt_eleitor_eleicao_municipal(BIGINT)
   ⚠️ Campo ano é aa_eleicao (não ano_eleicao)

7. my_db.votacao_secao_YYYY_GO (anos: 2014-2024)
   Colunas: ano_eleicao, nr_turno, nm_municipio, nr_zona, nr_secao, ds_cargo,
   qt_aptos, qt_comparecimento, qt_abstencoes, qt_votos_nominais, qt_votos_brancos,
   qt_votos_nulos, qt_votos_legenda, nr_local_votacao, nm_local_votacao,
   ds_local_votacao_endereco
   ⚠️ NÃO TEM: nm_bairro (use eleitorado_local para bairro)

8. my_db.votacao_partido_munzona_YYYY_GO (anos: 2014-2024)
   Colunas: ano_eleicao, nr_turno, nm_municipio, nr_zona, cd_cargo, ds_cargo,
   nr_partido, sg_partido, nm_partido, qt_votos_nominais, qt_votos_legenda

9. my_db.perfil_eleitorado_YYYY_GO (anos: 2018-2024)
   Colunas: ano_eleicao, nm_municipio, nr_zona, ds_genero, ds_estado_civil,
   ds_faixa_etaria, ds_grau_escolaridade, ds_raca_cor,
   qt_eleitores_perfil(BIGINT), qt_eleitores_biometria(BIGINT)

REGRAS:
- Sempre especifique o ano na tabela (ex: my_db.candidatos_2024_GO)
- Para múltiplos anos, use UNION ALL
- Para bairros, use SEMPRE eleitorado_local, NUNCA comparecimento_abstencao
- vr_bem_candidato é VARCHAR com vírgula decimal
- NUNCA use colunas que não existem
- Calcule idade via: EXTRACT(YEAR FROM AGE(CURRENT_DATE, TRY_CAST(dt_nascimento AS DATE)))
- Use LIMIT máximo 200
- Contexto: Dados eleitorais do estado de Goiás (GO), Brasil
- Principais municípios: GOIÂNIA, APARECIDA DE GOIÂNIA, ANÁPOLIS
`;

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

    // Step 1: AI generates SQL + visualization config
    const systemPrompt = `Você é um analista de dados eleitorais especialista em Goiás.
O usuário quer GERAR RELATÓRIOS e VISUALIZAÇÕES personalizadas.
Interprete o pedido (pode ter erros de digitação) e gere a query SQL otimizada.

REGRAS CRÍTICAS:
- Use APENAS as tabelas e colunas descritas abaixo. NUNCA invente.
- Gere APENAS SELECT, nunca INSERT/UPDATE/DELETE
- Use LIMIT máximo de 200
- Escolha o tipo de gráfico MAIS ADEQUADO para os dados:
  * bar: rankings, comparativos, contagens
  * pie: distribuições percentuais (gênero, partido, etc.)
  * line: evolução temporal, séries históricas
  * area: evolução com ênfase em volume
  * table: listagens detalhadas, dados com muitas colunas
  * kpi: métricas resumidas (totais, médias, contagens)
- Use nomes de colunas descritivos no SELECT (AS "Nome Legível")
- Ordene dados de forma lógica (DESC para rankings, ASC para séries temporais)
- Responda APENAS JSON válido:
{"sql": "SELECT ...", "tipo_grafico": "bar|pie|line|area|table|kpi", "titulo": "...", "descricao": "..."}

${SCHEMA_COMPLETO}`;

    const rawText = await callLovableAI(systemPrompt, pergunta, lovableKey, 1500);

    if (!rawText) {
      return new Response(JSON.stringify({ erro: "Erro ao consultar IA — tente novamente" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (rawText.startsWith("ERROR:")) {
      const status = rawText.split(":")[1];
      if (status === "429") {
        return new Response(JSON.stringify({ erro: "Limite de requisições atingido. Aguarde alguns segundos e tente novamente." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === "402") {
        return new Response(JSON.stringify({ erro: "Créditos de IA esgotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ erro: `Erro na IA: ${rawText}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const forbidden = ["DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "TRUNCATE", "CREATE"];
    if (forbidden.some(f => sqlUpper.includes(f))) {
      return new Response(JSON.stringify({ erro: "Query contém operação proibida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Execute SQL via MotherDuck
    const mdToken = Deno.env.get("MOTHERDUCK_TOKEN");
    if (!mdToken) {
      return new Response(JSON.stringify({ erro: "MOTHERDUCK_TOKEN não configurado", sql_gerado: sql }), {
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
      connection: { application_name: "eleicoesgo-relatorios" },
      max: 1,
      idle_timeout: 5,
      connect_timeout: 15,
    });

    try {
      const rows = await pg.unsafe(sql);
      await pg.end();

      const dados = Array.isArray(rows) ? rows.map((r: any) => ({ ...r })) : [];
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
    } catch (queryErr: any) {
      await pg.end().catch(() => {});
      console.error("Query error:", queryErr.message, "SQL:", sql);

      // Auto-retry with error correction
      const retryPrompt = `O SQL anterior falhou. Corrija usando APENAS as colunas que existem.
${SCHEMA_COMPLETO}
Responda APENAS JSON: {"sql":"SELECT ...","tipo_grafico":"...","titulo":"...","descricao":"..."}`;

      const retryRaw = await callLovableAI(
        retryPrompt,
        `Pergunta original: "${pergunta}"\nSQL que falhou: ${sql}\nErro: ${queryErr.message}\n\nGere um SQL corrigido.`,
        lovableKey,
        1200
      );

      if (retryRaw && !retryRaw.startsWith("ERROR:")) {
        try {
          const retryMatch = retryRaw.match(/\{[\s\S]*\}/);
          if (retryMatch) {
            const retryParsed = JSON.parse(retryMatch[0]);
            if (retryParsed.sql) {
              const pg2 = postgres({
                hostname: "pg.us-east-1-aws.motherduck.com",
                port: 5432, username: "postgres", password: mdToken,
                database: "md:", ssl: "require",
                connection: { application_name: "eleicoesgo-relatorios-retry" },
                max: 1, idle_timeout: 5, connect_timeout: 15,
              });
              try {
                const rows2 = await pg2.unsafe(retryParsed.sql);
                await pg2.end();
                const dados2 = Array.isArray(rows2) ? rows2.map((r: any) => ({ ...r })) : [];
                const colunas2 = dados2.length > 0 ? Object.keys(dados2[0]) : [];
                return new Response(JSON.stringify({
                  sucesso: true,
                  tipo_grafico: retryParsed.tipo_grafico || "table",
                  titulo: retryParsed.titulo || titulo || "Resultado",
                  descricao: retryParsed.descricao || "",
                  colunas: colunas2,
                  dados: dados2,
                  sql_gerado: retryParsed.sql,
                  retry: true,
                }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
              } catch {
                await pg2.end().catch(() => {});
              }
            }
          }
        } catch {}
      }

      return new Response(JSON.stringify({
        sucesso: false,
        erro: `Erro na query: ${queryErr.message}`,
        sql_gerado: sql,
        tipo_grafico: tipo_grafico || "table",
        titulo: titulo || "Erro",
        descricao: descricao || "",
        colunas: [],
        dados: [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e: any) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ erro: e.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
