import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { unzipSync } from 'https://esm.sh/fflate@0.8.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
  'Referer': 'https://dadosabertos.tse.jus.br/',
  'Connection': 'keep-alive',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { ano } = await req.json()
    if (!ano) throw new Error('ano é obrigatório')

    const startTime = Date.now()
    const tipo = 'secao'
    const tableName = 'bd_eleicoes_votacao_secao'

    await supabase.from('bd_eleicoes_importacoes_log').insert({
      ano, tipo, status: 'importando', iniciado_em: new Date().toISOString()
    })

    const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao/votacao_secao_${ano}_GO.zip`
    console.log(`Downloading: ${url}`)

    const response = await fetch(url, { signal: AbortSignal.timeout(180000), headers: FETCH_HEADERS })
    if (!response.ok) throw new Error(`Download falhou: ${response.status} ${response.statusText}`)

    const zipBuffer = new Uint8Array(await response.arrayBuffer())
    console.log(`ZIP: ${zipBuffer.length} bytes`)

    const files = unzipSync(zipBuffer)

    const csvFile = Object.keys(files).find(n =>
      (n.includes('_GO') || n.includes('_go')) && (n.endsWith('.csv') || n.endsWith('.txt'))
    ) || Object.keys(files).find(n => n.endsWith('.csv') || n.endsWith('.txt'))

    if (!csvFile) throw new Error(`CSV não encontrado. Arquivos: ${Object.keys(files).join(', ')}`)

    const text = new TextDecoder('windows-1252').decode(files[csvFile])
    const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'))
    if (lines.length < 2) throw new Error('CSV vazio')

    const sep = lines[0].includes(';') ? ';' : ','
    const headers = lines[0].split(sep).map(h => h.replace(/"/g, '').trim())

    const getVal = (row: string[], col: string): string | null => {
      const idx = headers.indexOf(col)
      if (idx === -1) return null
      const val = (row[idx] || '').replace(/"/g, '').trim()
      return (val === '#NULO#' || val === '#NE#' || val === '') ? null : val
    }

    const getInt = (row: string[], col: string): number | null => {
      const val = getVal(row, col)
      if (!val) return null
      const n = parseInt(val)
      return isNaN(n) ? null : n
    }

    const records: any[] = []
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(sep).map(v => v.replace(/"/g, '').trim())
      const uf = getVal(row, 'SG_UF')
      if (uf && uf !== 'GO') continue

      const nomeCand = getVal(row, 'NM_VOTAVEL') || getVal(row, 'NM_URNA_CANDIDATO')
      const numUrna = getInt(row, 'NR_VOTAVEL') || getInt(row, 'NR_CANDIDATO')

      records.push({
        ano: getInt(row, 'ANO_ELEICAO') || ano,
        turno: getInt(row, 'NR_TURNO'),
        cargo: getVal(row, 'DS_CARGO'),
        municipio: getVal(row, 'NM_MUNICIPIO'),
        codigo_municipio: getVal(row, 'CD_MUNICIPIO'),
        zona: getInt(row, 'NR_ZONA'),
        secao: getInt(row, 'NR_SECAO'),
        nome_candidato: nomeCand,
        numero_urna: numUrna,
        sigla_partido: getVal(row, 'SG_PARTIDO'),
        total_votos: getInt(row, 'QT_VOTOS') || 0,
        sequencial_candidato: getVal(row, 'SQ_CANDIDATO'),
      })
    }

    console.log(`Parsed ${records.length} registros secao GO`)
    if (records.length === 0) throw new Error('Nenhum registro GO encontrado')

    await supabase.from(tableName).delete().eq('ano', ano)

    const batchSize = 1000
    let inserted = 0
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      const { error } = await supabase.from(tableName).insert(batch)
      if (error) {
        await new Promise(r => setTimeout(r, 200))
        const { error: e2 } = await supabase.from(tableName).insert(batch)
        if (!e2) inserted += batch.length
      } else {
        inserted += batch.length
      }
      if (i + batchSize < records.length) await new Promise(r => setTimeout(r, 20))
      if (i % 10000 === 0 && i > 0) console.log(`Progress: ${i}/${records.length}`)
    }

    const duracao = Math.round((Date.now() - startTime) / 1000)

    await supabase.from('bd_eleicoes_importacoes_log').insert({
      ano, tipo, status: 'sucesso',
      total_registros: records.length, registros_inseridos: inserted,
      iniciado_em: new Date(startTime).toISOString(),
      finalizado_em: new Date().toISOString(),
      duracao_segundos: duracao
    })

    return new Response(JSON.stringify({
      sucesso: true, ano, tipo, total_registros: inserted, duracao_segundos: duracao
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error('Import error:', error.message)
    try {
      const { ano } = await req.clone().json().catch(() => ({ ano: null }))
      if (ano) {
        await supabase.from('bd_eleicoes_importacoes_log').insert({
          ano, tipo: 'secao', status: 'erro', erro: error.message,
          finalizado_em: new Date().toISOString()
        })
      }
    } catch (_) {}

    return new Response(JSON.stringify({ sucesso: false, erro: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
