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
      return new Response(
        JSON.stringify({ error: 'MOTHERDUCK_TOKEN não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const sql = body?.query
    const database = body?.database || 'md:'

    if (!sql || typeof sql !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Campo "query" (string SQL) é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Safety: only allow read-only statements
    const trimmed = sql.trim().toUpperCase()
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('DESCRIBE') && !trimmed.startsWith('SHOW') && !trimmed.startsWith('WITH') && !trimmed.startsWith('PRAGMA')) {
      return new Response(
        JSON.stringify({ error: 'Apenas queries SELECT/WITH/DESCRIBE/SHOW são permitidas' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Connect to MotherDuck via Postgres wire protocol
    const { default: postgres } = await import('https://deno.land/x/postgresjs@v3.4.5/mod.js')

    const pgSql = postgres({
      hostname: 'pg.us-east-1-aws.motherduck.com',
      port: 5432,
      username: 'postgres',
      password: token,
      database: database,
      ssl: 'require',
      connection: {
        application_name: 'eleicoesgo-edge',
      },
      max: 1,
      idle_timeout: 5,
      connect_timeout: 15,
    })

    try {
      const rows = await pgSql.unsafe(sql)
      const columns = rows.columns?.map((c: any) => ({ name: c.name, type: c.type })) || []

      await pgSql.end()

      return new Response(
        JSON.stringify({ columns, rows, rowCount: rows.length }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (queryErr) {
      await pgSql.end().catch(() => {})
      throw queryErr
    }
  } catch (err) {
    console.error('query-motherduck error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
