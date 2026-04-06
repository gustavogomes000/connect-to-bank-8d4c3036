<#
.SYNOPSIS
    Organiza dados TSE locais em CSVs limpos por tabela, filtrados para Goias.
    
.DESCRIPTION
    CORRECOES v3:
    - Se ZIP tem arquivo _GO.csv, usa SO ele (ignora _BRASIL e outros estados)
    - Se nao tem _GO, filtra _BRASIL por SG_UF=GO
    - Boletim de urna (bweb) reconhecido corretamente
    - Sem duplicatas, sem processar arquivos desnecessarios
    
.NOTES
    powershell -ExecutionPolicy Bypass -File organizar_dados_local.ps1
#>

param(
    [string]$PastaDados = "C:\Users\Gustavo\Desktop\dados",
    [string]$PastaSaida = "C:\Users\Gustavo\Desktop\dados_organizados",
    [string]$PastaTemp  = "C:\Users\Gustavo\Desktop\dados_temp"
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ============================================================
# IDENTIFICAR TABELA PELO NOME DO ARQUIVO
# ============================================================
function Identificar-Tabela([string]$nome) {
    $n = $nome.ToLower()
    
    if ($n -match "consulta_cand_complementar")                     { return "candidatos_complementar" }
    if ($n -match "rede_social_candidato")                          { return "redes_sociais" }
    if ($n -match "consulta_cand")                                  { return "candidatos" }
    if ($n -match "bem_candidato")                                  { return "bens_candidatos" }
    if ($n -match "votacao_candidato_munzona")                      { return "votacao_munzona" }
    if ($n -match "votacao_partido_munzona")                        { return "votacao_partido_munzona" }
    if ($n -match "votacao_secao")                                  { return "votacao_secao" }
    if ($n -match "detalhe_votacao_munzona")                        { return "comparecimento_munzona" }
    if ($n -match "detalhe_votacao_secao")                          { return "comparecimento_secao" }
    if ($n -match "perfil_eleitor_secao")                           { return "perfil_eleitor_secao" }
    if ($n -match "perfil_eleitorado")                              { return "perfil_eleitorado" }
    if ($n -match "eleitorado_local")                               { return "eleitorado_local" }
    if ($n -match "receitas_candidatos_doadores|receitas_doadores") { return "doadores_campanha" }
    if ($n -match "despesas_contratadas")                           { return "despesas_contratadas" }
    if ($n -match "despesas_pagas")                                 { return "despesas_pagas" }
    if ($n -match "receita")                                        { return "receitas" }
    if ($n -match "despesa")                                        { return "despesas" }
    if ($n -match "prestacao_de_contas_eleitorais_orgaos")          { return "prestacao_partidos" }
    if ($n -match "prestacao_de_contas")                            { return "prestacao_raw" }
    if ($n -match "filiados|filiacao_partidaria")                   { return "filiados" }
    if ($n -match "consulta_coligacao")                             { return "coligacoes" }
    if ($n -match "consulta_vagas")                                 { return "vagas" }
    if ($n -match "consulta_legendas|consulta_legenda")             { return "legendas" }
    if ($n -match "bweb|boletim_urna|bu_")                          { return "boletim_urna" }
    if ($n -match "pesquisa_eleitoral")                             { return "pesquisas" }
    if ($n -match "motivo_cassacao")                                { return "cassacoes" }
    if ($n -match "consulta_mesarios|convocacao_mesarios")          { return "mesarios" }
    if ($n -match "transferencia_eleitoral")                        { return "transferencia_eleitoral" }
    if ($n -match "comparecimento_abstencao")                       { return "comparecimento_abstencao" }
    if ($n -match "consulta_orgao_partidario|orgao_partidario")     { return "orgao_partidario" }
    if ($n -match "fundo_partidario")                               { return "fundo_partidario" }
    if ($n -match "certidao_criminal")                              { return "certidao_criminal" }
    if ($n -match "certidao_negativa")                              { return "certidao_negativa" }

    return $null
}

function Get-Ano([string]$nome) {
    if ($nome -match "(20\d{2})") { return $Matches[1] }
    if ($nome -match "(19\d{2})") { return $Matches[1] }
    return "sem_ano"
}

# ============================================================
# SELECIONAR MELHOR CSV DO ZIP (prioridade: _GO > _BRASIL > filtrar)
# ============================================================
function Selecionar-CsvsPrioritarios {
    param([System.IO.FileInfo[]]$Csvs, [string]$NomeZip)
    
    # Agrupar por tabela
    $porTabela = @{}
    foreach ($csv in $Csvs) {
        $nome = $csv.Name.ToLower()
        if ($nome -match "leia.?me|readme|instruc") { continue }
        
        $tabela = Identificar-Tabela $nome
        if (-not $tabela) { $tabela = Identificar-Tabela $NomeZip }
        if (-not $tabela) { continue }
        
        if (-not $porTabela.ContainsKey($tabela)) {
            $porTabela[$tabela] = @{ GO = @(); BRASIL = @(); Outros = @() }
        }
        
        if ($nome -match "_go[\._]|_go$") {
            $porTabela[$tabela].GO += $csv
        }
        elseif ($nome -match "_brasil[\._]|_brasil$") {
            $porTabela[$tabela].BRASIL += $csv
        }
        else {
            $porTabela[$tabela].Outros += $csv
        }
    }
    
    # Para cada tabela, retornar so o melhor
    $resultado = @()
    foreach ($tabela in $porTabela.Keys) {
        $grupo = $porTabela[$tabela]
        
        if ($grupo.GO.Count -gt 0) {
            # TEM arquivo _GO -> usar SO ele (ja filtrado!)
            foreach ($f in $grupo.GO) {
                $resultado += @{ Csv = $f; Tabela = $tabela; JaFiltrado = $true }
            }
        }
        elseif ($grupo.BRASIL.Count -gt 0) {
            # Sem _GO, usar _BRASIL e filtrar
            foreach ($f in $grupo.BRASIL) {
                $resultado += @{ Csv = $f; Tabela = $tabela; JaFiltrado = $false }
            }
        }
        else {
            # Sem _GO nem _BRASIL - verificar se eh arquivo unico ou por UF
            $temUF = $grupo.Outros | Where-Object { $_.Name -match "_[A-Z]{2}[\._]" }
            if ($temUF.Count -gt 0) {
                # Arquivos por UF sem _GO = nao tem GO neste ZIP
            }
            else {
                # Arquivo unico (ex: nacional) - filtrar
                foreach ($f in $grupo.Outros) {
                    $resultado += @{ Csv = $f; Tabela = $tabela; JaFiltrado = $false }
                }
            }
        }
    }
    
    return $resultado
}

# ============================================================
# COPIAR OU FILTRAR CSV
# ============================================================
function Processar-Csv {
    param(
        [string]$Entrada,
        [string]$Saida,
        [bool]$JaFiltrado = $false
    )
    
    try {
        if ($JaFiltrado) {
            # Arquivo ja eh de GO - converter encoding e copiar
            $enc = [System.Text.Encoding]::GetEncoding("iso-8859-1")
            $reader = [System.IO.StreamReader]::new($Entrada, $enc)
            $writer = [System.IO.StreamWriter]::new($Saida, $false, [System.Text.Encoding]::UTF8)
            
            $linhas = 0
            while ($null -ne ($linha = $reader.ReadLine())) {
                $writer.WriteLine($linha)
                $linhas++
            }
            $reader.Close()
            $writer.Close()
            
            return [Math]::Max(0, $linhas - 1)
        }
        
        # Precisa filtrar por SG_UF=GO
        $enc = [System.Text.Encoding]::GetEncoding("iso-8859-1")
        $reader = [System.IO.StreamReader]::new($Entrada, $enc)
        $header = $reader.ReadLine()
        
        if (-not $header -or $header.Length -lt 2) {
            $reader.Close()
            return 0
        }
        
        $separador = if (($header.ToCharArray() | Where-Object {$_ -eq ";"} | Measure-Object).Count -gt 2) { ";" } else { "," }
        $colunas = $header -split [regex]::Escape($separador)
        
        # Encontrar coluna UF
        $idxUF = -1
        $possveis = @("SG_UF", "SG_UE", "UF", "SIGLA_UF")
        for ($c = 0; $c -lt $colunas.Count; $c++) {
            $colNome = $colunas[$c].Trim('"', ' ').ToUpper()
            if ($colNome -in $possveis) { $idxUF = $c; break }
        }
        
        if ($idxUF -lt 0) {
            $reader.Close()
            # Se o arquivo tem GO no nome, copiar tudo
            if ($Entrada -match "(?i)_go[\._]") {
                Copy-Item $Entrada $Saida -Force
                return (Get-Content $Saida | Measure-Object).Count - 1
            }
            return 0
        }
        
        $writer = [System.IO.StreamWriter]::new($Saida, $false, [System.Text.Encoding]::UTF8)
        $writer.WriteLine($header)
        
        $contGO = 0
        $contTotal = 0
        
        while ($null -ne ($linha = $reader.ReadLine())) {
            $contTotal++
            $campos = $linha -split [regex]::Escape($separador)
            if ($campos.Count -gt $idxUF) {
                $val = $campos[$idxUF].Trim('"', ' ').ToUpper()
                if ($val -eq "GO" -or $val -eq "GOIAS" -or $val -match "^52\d{3,}") {
                    $writer.WriteLine($linha)
                    $contGO++
                }
            }
            if ($contTotal % 500000 -eq 0) { Write-Host "." -NoNewline }
        }
        
        $reader.Close()
        $writer.Close()
        
        if ($contGO -eq 0 -and (Test-Path $Saida)) {
            Remove-Item $Saida -Force
        }
        
        return $contGO
    }
    catch {
        Write-Host " [ERRO: $($_.Exception.Message)]" -ForegroundColor Red
        return 0
    }
}

# ============================================================
# INICIO
# ============================================================
$inicio = Get-Date

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " ORGANIZADOR DADOS ELEITORAIS - GOIAS v3" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Origem:  $PastaDados"
Write-Host "Destino: $PastaSaida"
Write-Host "Regra:   Arquivo _GO existe? Usa so ele. Senao filtra _BRASIL."
Write-Host ""

# Limpar e criar pastas
if (Test-Path $PastaSaida) { Remove-Item $PastaSaida -Recurse -Force }
New-Item -ItemType Directory -Path $PastaSaida -Force | Out-Null
New-Item -ItemType Directory -Path $PastaTemp -Force | Out-Null

$relatorio = @{}
$naoMapeados = [System.Collections.ArrayList]::new()
$totalRegistrosGO = 0

# Listar arquivos
$todosArquivos = Get-ChildItem $PastaDados -Recurse -File
$zips = @($todosArquivos | Where-Object { $_.Extension.ToLower() -eq ".zip" })
$csvsDiretos = @($todosArquivos | Where-Object { $_.Extension.ToLower() -in @(".csv", ".txt") })
$jsonsDiretos = @($todosArquivos | Where-Object { $_.Extension.ToLower() -eq ".json" -and $_.Name -like "raw_*" })

Write-Host "ZIPs: $($zips.Count) | CSVs soltos: $($csvsDiretos.Count) | JSONs: $($jsonsDiretos.Count)" -ForegroundColor White
Write-Host ""

# ============================================================
# PROCESSAR ZIPs
# ============================================================
$idx = 0
foreach ($zip in $zips) {
    $idx++
    $nomeZip = $zip.Name
    $ano = Get-Ano $nomeZip
    
    Write-Host "[$idx/$($zips.Count)] $nomeZip" -ForegroundColor White -NoNewline
    
    # Extrair
    $tempDir = Join-Path $PastaTemp "z_$idx"
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
    
    try {
        Expand-Archive -Path $zip.FullName -DestinationPath $tempDir -Force -ErrorAction Stop
    }
    catch {
        Write-Host " [ERRO EXTRAIR]" -ForegroundColor Red
        continue
    }
    
    # Encontrar todos CSVs/TXTs
    $csvsNoZip = @(Get-ChildItem $tempDir -Recurse -File | Where-Object { $_.Extension.ToLower() -in @(".csv", ".txt") })
    
    if ($csvsNoZip.Count -eq 0) {
        Write-Host " (vazio)" -ForegroundColor DarkGray
        Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        continue
    }
    
    # Selecionar os melhores CSVs (priorizar _GO sobre _BRASIL)
    $selecionados = Selecionar-CsvsPrioritarios -Csvs $csvsNoZip -NomeZip $nomeZip
    
    if ($selecionados.Count -eq 0) {
        # Nenhum mapeado - registrar
        foreach ($csv in $csvsNoZip) {
            if ($csv.Name -notmatch "(?i)leia.?me|readme") {
                [void]$naoMapeados.Add("$nomeZip -> $($csv.Name)")
            }
        }
        Write-Host " [NAO MAPEADO]" -ForegroundColor DarkYellow
        Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        continue
    }
    
    $registrosZip = 0
    
    foreach ($sel in $selecionados) {
        $tabela = $sel.Tabela
        $csv = $sel.Csv
        $jaFiltrado = $sel.JaFiltrado
        
        # Separar prestacao_raw
        if ($tabela -eq "prestacao_raw") {
            $nCsv = $csv.Name.ToLower()
            if ($nCsv -match "receita") { $tabela = "receitas" }
            elseif ($nCsv -match "despesa") { $tabela = "despesas" }
            else { continue }
        }
        
        # Criar pasta destino
        $pastaTabela = Join-Path $PastaSaida $tabela
        if (-not (Test-Path $pastaTabela)) {
            New-Item -ItemType Directory -Path $pastaTabela -Force | Out-Null
        }
        
        # Nome padronizado
        $nomeSaida = "${tabela}_${ano}_GO.csv"
        $caminhoSaida = Join-Path $pastaTabela $nomeSaida
        $sufixo = 1
        while (Test-Path $caminhoSaida) {
            $nomeSaida = "${tabela}_${ano}_GO_${sufixo}.csv"
            $caminhoSaida = Join-Path $pastaTabela $nomeSaida
            $sufixo++
        }
        
        $registros = Processar-Csv -Entrada $csv.FullName -Saida $caminhoSaida -JaFiltrado $jaFiltrado
        
        if ($registros -gt 0) {
            $registrosZip += $registros
            if (-not $relatorio.ContainsKey($tabela)) {
                $relatorio[$tabela] = @{ Arquivos = 0; Registros = 0; Anos = [System.Collections.ArrayList]::new() }
            }
            $relatorio[$tabela].Arquivos++
            $relatorio[$tabela].Registros += $registros
            if ($ano -notin $relatorio[$tabela].Anos) {
                [void]$relatorio[$tabela].Anos.Add($ano)
            }
        }
    }
    
    $totalRegistrosGO += $registrosZip
    
    $metodo = if ($selecionados[0].JaFiltrado) { "(_GO direto)" } else { "(filtrado)" }
    if ($registrosZip -gt 0) {
        Write-Host " -> $($registrosZip.ToString('N0')) regs $metodo" -ForegroundColor Green
    } else {
        Write-Host " (0 GO) $metodo" -ForegroundColor DarkGray
    }
    
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

# ============================================================
# PROCESSAR CSVs SOLTOS
# ============================================================
Write-Host ""
Write-Host "CSVs soltos..." -ForegroundColor Green

foreach ($csv in $csvsDiretos) {
    if ($csv.Name -match "(?i)leia.?me|readme|instruc") { continue }
    $tabela = Identificar-Tabela $csv.Name
    if (-not $tabela) { continue }
    if ($tabela -eq "prestacao_raw") {
        $n = $csv.Name.ToLower()
        if ($n -match "receita") { $tabela = "receitas" }
        elseif ($n -match "despesa") { $tabela = "despesas" }
        else { continue }
    }
    
    $ano = Get-Ano $csv.BaseName
    $pastaTabela = Join-Path $PastaSaida $tabela
    if (-not (Test-Path $pastaTabela)) { New-Item -ItemType Directory -Path $pastaTabela -Force | Out-Null }
    
    $nomeSaida = "${tabela}_${ano}_GO.csv"
    $caminhoSaida = Join-Path $pastaTabela $nomeSaida
    $sufixo = 1
    while (Test-Path $caminhoSaida) {
        $nomeSaida = "${tabela}_${ano}_GO_${sufixo}.csv"
        $caminhoSaida = Join-Path $pastaTabela $nomeSaida
        $sufixo++
    }
    
    $jaFiltrado = ($csv.Name -match "(?i)_go[\._]")
    Write-Host "  $($csv.Name)" -ForegroundColor White -NoNewline
    $registros = Processar-Csv -Entrada $csv.FullName -Saida $caminhoSaida -JaFiltrado $jaFiltrado
    
    if ($registros -gt 0) {
        Write-Host " -> $($registros.ToString('N0')) GO" -ForegroundColor Green
        $totalRegistrosGO += $registros
        if (-not $relatorio.ContainsKey($tabela)) {
            $relatorio[$tabela] = @{ Arquivos = 0; Registros = 0; Anos = [System.Collections.ArrayList]::new() }
        }
        $relatorio[$tabela].Arquivos++
        $relatorio[$tabela].Registros += $registros
        if ($ano -notin $relatorio[$tabela].Anos) { [void]$relatorio[$tabela].Anos.Add($ano) }
    } else {
        Write-Host " (0 GO)" -ForegroundColor DarkGray
    }
}

# ============================================================
# COPIAR JSONs
# ============================================================
if ($jsonsDiretos.Count -gt 0) {
    $pastaApis = Join-Path $PastaSaida "_apis_externas"
    New-Item -ItemType Directory -Path $pastaApis -Force | Out-Null
    foreach ($json in $jsonsDiretos) {
        Copy-Item $json.FullName (Join-Path $pastaApis $json.Name) -Force
        Write-Host "  JSON: $($json.Name)" -ForegroundColor Green
    }
}

# Limpar temp
if (Test-Path $PastaTemp) { Remove-Item $PastaTemp -Recurse -Force -ErrorAction SilentlyContinue }

# ============================================================
# RELATORIO FINAL
# ============================================================
$fim = Get-Date
$duracao = $fim - $inicio

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " RELATORIO FINAL" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host ("{0,-35} {1,8} {2,12} {3}" -f "TABELA", "ARQS", "REGISTROS", "ANOS") -ForegroundColor White
Write-Host ("-" * 75) -ForegroundColor DarkGray

foreach ($t in ($relatorio.Keys | Sort-Object)) {
    $r = $relatorio[$t]
    $anos = ($r.Anos | Sort-Object) -join ","
    $cor = if ($r.Registros -gt 10000) { "Green" } elseif ($r.Registros -gt 0) { "Yellow" } else { "Red" }
    Write-Host ("{0,-35} {1,8} {2,12:N0} {3}" -f $t, $r.Arquivos, $r.Registros, $anos) -ForegroundColor $cor
}

Write-Host ("-" * 75) -ForegroundColor DarkGray
Write-Host ""
Write-Host "TOTAL: $($relatorio.Count) tabelas | $($totalRegistrosGO.ToString('N0')) registros GO" -ForegroundColor Cyan
Write-Host "Duracao: $($duracao.ToString('hh\:mm\:ss'))" -ForegroundColor Cyan

if ($naoMapeados.Count -gt 0) {
    Write-Host ""
    Write-Host "NAO MAPEADOS ($($naoMapeados.Count)):" -ForegroundColor Yellow
    $naoMapeados | Select-Object -Unique | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkYellow }
}

# Salvar relatorio
$relPath = Join-Path $PastaSaida "_RELATORIO.txt"
$txt = "RELATORIO ORGANIZACAO DADOS ELEITORAIS GO`nGerado: $fim`nDuracao: $($duracao.ToString('hh\:mm\:ss'))`n`n"
$txt += "ESTRUTURA DA PASTA dados_organizados:`n"
$txt += "  Cada subpasta = 1 tabela do banco`n"
$txt += "  Cada CSV = dados de 1 ano, ja filtrados para GO`n"
$txt += "  Encoding: UTF-8, Separador: ; (ponto-e-virgula)`n`n"
foreach ($t in ($relatorio.Keys | Sort-Object)) {
    $r = $relatorio[$t]
    $txt += "$t | $($r.Arquivos) arqs | $($r.Registros.ToString('N0')) regs | $(($r.Anos | Sort-Object) -join ',')`n"
}
$txt += "`nTotal: $($relatorio.Count) tabelas, $($totalRegistrosGO.ToString('N0')) registros"
if ($naoMapeados.Count -gt 0) {
    $txt += "`n`nNAO MAPEADOS:`n"
    $naoMapeados | Select-Object -Unique | ForEach-Object { $txt += "  $_`n" }
}
Set-Content $relPath $txt -Encoding UTF8

Write-Host ""
Write-Host "Relatorio: $relPath" -ForegroundColor Green
Write-Host "Saida:     $PastaSaida" -ForegroundColor Green
Write-Host ""
