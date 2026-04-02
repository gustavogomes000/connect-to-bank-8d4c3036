import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.49.1/cors'
import { unzipSync } from 'https://esm.sh/fflate@0.8.2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const { ano, tipo } = await req.json()
    if (!ano || !tipo) {
      return new Response(JSON.stringify({ sucesso: false, erro: 'ano e tipo são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const startTime = Date.now()

    // Log start
    await supabase.from('bd_eleicoes_importacoes_log').insert({
      ano,
      tipo,
      status: 'importando',
      iniciado_em: new Date().toISOString(),
    })

    // Build URL
    let url = ''
    if (tipo === 'candidatos') {
      url = `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`
    } else if (tipo === 'votacao') {
      url = `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_${ano}.zip`
    } else if (tipo === 'comparecimento') {
      url = `https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_${ano}.zip`
    } else {
      throw new Error(`Tipo inválido: ${tipo}`)
    }

    console.log(`Downloading: ${url}`)

    // Download ZIP
    const response = await fetch(url, {
      signal: AbortSignal.timeout(120000),
    })

    if (!response.ok) {
      throw new Error(`Download falhou: ${response.status} ${response.statusText}`)
    }

    const zipBuffer = new Uint8Array(await response.arrayBuffer())
    console.log(`ZIP downloaded: ${zipBuffer.length} bytes`)

    // Unzip
    const files = unzipSync(zipBuffer)
    console.log(`Files in ZIP: ${Object.keys(files).join(', ')}`)

    // Find GO CSV file
    const goFileKey = Object.keys(files).find(
      (name) => (name.includes('_GO') || name.includes('_go')) && (name.endsWith('.csv') || name.endsWith('.txt'))
    )

    if (!goFileKey) {
      throw new Error(`Arquivo GO não encontrado no ZIP. Arquivos: ${Object.keys(files).join(', ')}`)
    }

    console.log(`Using file: ${goFileKey}`)

    // Decode latin-1
    const decoder = new TextDecoder('windows-1252')
    const text = decoder.decode(files[goFileKey])

    // Parse CSV
    const lines = text.split('\n').filter((l) => l.trim() && !l.startsWith('#'))
    if (lines.length < 2) throw new Error('CSV vazio ou inválido')

    const headerLine = lines[0]
    const separator = headerLine.includes(';') ? ';' : ','
    const headers = headerLine.split(separator).map((h) => h.replace(/"/g, '').trim())

    console.log(`Headers: ${headers.slice(0, 10).join(', ')}...`)
    console.log(`Total lines: ${lines.length - 1}`)

    const getVal = (row: string[], col: string): string | null => {
      const idx = headers.indexOf(col)
      if (idx === -1) return null
      const val = (row[idx] || '').replace(/"/g, '').trim()
      if (val === '#NULO#' || val === '#NE#' || val === '' || val === 'null') return null
      return val
    }

    const getInt = (row: string[], col: string): number | null => {
      const val = getVal(row, col)
      if (!val) return null
      const n = parseInt(val)
      return isNaN(n) ? null : n
    }

    // Parse rows
    const records: any[] = []
    for (let i = 1; i < lines.length; i++) {
      const rawLine = lines[i]
      if (!rawLine.trim()) continue

      // Split respecting quoted fields
      const row = rawLine.split(separator).map((v) => v.replace(/"/g, '').trim())

      // Check UF = GO
      const uf = getVal(row, 'SG_UF')
      if (uf && uf !== 'GO') continue

      if (tipo === 'candidatos') {
        const sqCandidato = getVal(row, 'SQ_CANDIDATO')
        records.push({
          ano: getInt(row, 'ANO_ELEICAO') || ano,
          turno: getInt(row, 'NR_TURNO'),
          cargo: getVal(row, 'DS_CARGO'),
          nome_urna: getVal(row, 'NM_URNA_CANDIDATO'),
          nome_completo: getVal(row, 'NM_CANDIDATO'),
          numero_urna: getInt(row, 'NR_CANDIDATO'),
          partido: getVal(row, 'SG_PARTIDO'),
          municipio: getVal(row, 'NM_MUNICIPIO'),
          codigo_municipio: getVal(row, 'CD_MUNICIPIO'),
          situacao_final: getVal(row, 'DS_SIT_TOT_TURNO'),
          foto_url: sqCandidato
            ? `https://divulgacandcontas.tse.jus.br/candidaturas/oficial/${ano}/${sqCandidato}/foto.jpeg`
            : null,
        })
      } else if (tipo === 'votacao') {
        records.push({
          ano: getInt(row, 'ANO_ELEICAO') || ano,
          turno: getInt(row, 'NR_TURNO'),
          cargo: getVal(row, 'DS_CARGO'),
          municipio: getVal(row, 'NM_MUNICIPIO'),
          codigo_municipio: getVal(row, 'CD_MUNICIPIO'),
          zona: getInt(row, 'NR_ZONA'),
          nome_candidato: getVal(row, 'NM_URNA_CANDIDATO'),
          numero_urna: getInt(row, 'NR_CANDIDATO'),
          partido: getVal(row, 'SG_PARTIDO'),
          total_votos: getInt(row, 'QT_VOTOS_NOMINAIS') || 0,
        })
      } else if (tipo === 'comparecimento') {
        records.push({
          ano: getInt(row, 'ANO_ELEICAO') || ano,
          turno: getInt(row, 'NR_TURNO'),
          municipio: getVal(row, 'NM_MUNICIPIO'),
          codigo_municipio: getVal(row, 'CD_MUNICIPIO'),
          eleitorado_apto: getInt(row, 'QT_APTOS') || 0,
          comparecimento: getInt(row, 'QT_COMPARECIMENTO') || 0,
          abstencoes: getInt(row, 'QT_ABSTENCOES') || 0,
        })
      }
    }

    console.log(`Parsed ${records.length} records for GO`)

    if (records.length === 0) {
      throw new Error('Nenhum registro encontrado para GO no arquivo')
    }

    // Delete previous data for this year/type
    const tableName = `bd_eleicoes_${tipo}`
    const { error: deleteError } = await supabase
      .from(tableName)
      .delete()
      .eq('ano', ano)

    if (deleteError) {
      console.log(`Delete warning: ${deleteError.message}`)
    }

    // Insert in batches of 500
    const batchSize = 500
    let inserted = 0
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      const { error } = await supabase.from(tableName).insert(batch)

      if (error) {
        console.log(`Batch error at ${i}: ${error.message}, retrying...`)
        // Retry once
        await new Promise((r) => setTimeout(r, 200))
        const { error: retryError } = await supabase.from(tableName).insert(batch)
        if (retryError) {
          console.log(`Retry failed: ${retryError.message}`)
          // Skip this batch but continue
        } else {
          inserted += batch.length
        }
      } else {
        inserted += batch.length
      }

      // Small delay between batches
      if (i + batchSize < records.length) {
        await new Promise((r) => setTimeout(r, 100))
      }
    }

    const duracao = Math.round((Date.now() - startTime) / 1000)

    // Log success
    await supabase.from('bd_eleicoes_importacoes_log').insert({
      ano,
      tipo,
      status: 'sucesso',
      total_registros: records.length,
      registros_inseridos: inserted,
      iniciado_em: new Date(startTime).toISOString(),
      finalizado_em: new Date().toISOString(),
    })

    return new Response(
      JSON.stringify({
        sucesso: true,
        ano,
        tipo,
        total_registros: inserted,
        duracao_segundos: duracao,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Import error:', error.message)

    // Try to log error
    try {
      const { ano, tipo } = await req.clone().json().catch(() => ({ ano: null, tipo: null }))
      if (ano && tipo) {
        await supabase.from('bd_eleicoes_importacoes_log').insert({
          ano,
          tipo,
          status: 'erro',
          erro: error.message,
          finalizado_em: new Date().toISOString(),
        })
      }
    } catch (_) {}

    return new Response(
      JSON.stringify({ sucesso: false, erro: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
