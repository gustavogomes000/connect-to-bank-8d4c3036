const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const token = Deno.env.get('MOTHERDUCK_TOKEN')
    if (!token) {
      return new Response(JSON.stringify({ error: 'MOTHERDUCK_TOKEN não configurado' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()
    const sql = body?.query
    const database = body?.database || 'md:'

    if (!sql || typeof sql !== 'string') {
      return new Response(JSON.stringify({ error: 'Campo "query" obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { default: postgres } = await import('https://deno.land/x/postgresjs@v3.4.5/mod.js')

    const pgSql = postgres({
      hostname: 'pg.us-east-1-aws.motherduck.com',
      port: 5432,
      username: 'postgres',
      password: token,
      database: database,
      ssl: 'require',
      connection: { application_name: 'eleicoesgo-upload' },
      max: 1,
      idle_timeout: 5,
      connect_timeout: 30,
    })

    try {
      const rows = await pgSql.unsafe(sql)
      await pgSql.end()
      return new Response(JSON.stringify({ rows: rows || [], rowCount: rows?.length || 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } catch (queryErr) {
      await pgSql.end().catch(() => {})
      throw queryErr
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
