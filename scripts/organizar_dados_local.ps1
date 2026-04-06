<#
.SYNOPSIS
    Organiza dados TSE locais em CSVs limpos por tabela, filtrados para Goias.
    Cria pasta "banco_de_dados" com CSVs prontos para subir ao Supabase.
    
.DESCRIPTION
    v4 - MELHORIAS:
    - Busca GO em TODAS colunas possiveis (SG_UF, SG_UE, UF, SIGLA_UF, UF_CANDIDATO, CD_MUNICIPIO com prefixo 52xxx)
    - Se nao achar coluna UF mas arquivo tem dados nacionais, tenta CD_MUNICIPIO (52xxx = GO)
    - Tenta NM_UE, NM_MUNICIPIO contra lista de municipios de GO
    - Cria pasta banco_de_dados/ com CSVs consolidados por tabela
    
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

# Municipios de Goias (para fallback)
$municipiosGO = @(
    "GOIANIA","APARECIDA DE GOIANIA","ANAPOLIS","RIO VERDE","LUZIANIA",
    "AGUAS LINDAS DE GOIAS","VALPARAISO DE GOIAS","TRINDADE","FORMOSA","NOVO GAMA",
    "ITUMBIARA","SENADOR CANEDO","CATALAO","JATAI","PLANALTINA","GOIANESIA",
    "CALDAS NOVAS","INHUMAS","MINEIROS","CIDADE OCIDENTAL","SANTO ANTONIO DO DESCOBERTO",
    "PORANGATU","URUACU","GOIANIRA","NIQUELANDIA","JARAGUA","MORRINHOS",
    "CRISTALINA","PADRE BERNARDO","IPAMERI","CERES","PIRES DO RIO",
    "GOIATUBA","QUIRINOPOLIS","ALEXANIA","SAO LUIS DE MONTES BELOS",
    "ITABERAI","POSSE","URUACU","PALMEIRAS DE GOIAS","SILVANIA",
    "NEROPOLIS","BELA VISTA DE GOIAS","PIRENOPOLIS","ANICUNS","CAMPOS BELOS",
    "IPORA","RUBIATABA","ITAPURANGA","COCALZINHO DE GOIAS","SANTA HELENA DE GOIAS",
    "DOVERLANDIA","MONTIVIDIU","ACREUNA","EDEIA","PONTALINA","ARAGARÇAS",
    "PIRACANJUBA","FIRMINOPOLIS","SANTA TEREZINHA DE GOIAS","GOIAS","HIDROLINA"
)

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
    if ($n -match "local_votacao|eleitorado_local_votacao")         { return "locais_votacao" }
    if ($n -match "zona_eleitoral|secoes_eleitorais")               { return "zonas_secoes" }
    if ($n -match "resultado_elei")                                 { return "resultados" }

    return $null
}

function Get-Ano([string]$nome) {
    if ($nome -match "(20\d{2})") { return $Matches[1] }
    if ($nome -match "(19\d{2})") { return $Matches[1] }
    return "sem_ano"
}

# ============================================================
# ENCONTRAR COLUNA UF (busca agressiva)
# ============================================================
function Encontrar-ColunaUF {
    param([string[]]$Colunas)
    
    $colunasUF = @("SG_UF","UF","SIGLA_UF","UF_CANDIDATO","SG_UF_NASCIMENTO","DS_UF","SG_UE")
    $colunasMunicipio = @("NM_UE","NM_MUNICIPIO","NM_LOCALIDADE","DS_MUNICIPIO")
    $colunasCodMunicipio = @("CD_MUNICIPIO","CD_MUN_NASCIMENTO","SQ_CANDIDATO","CD_LOCALIDADE")
    
    for ($i = 0; $i -lt $Colunas.Count; $i++) {
        $col = $Colunas[$i].Trim('"', ' ').ToUpper()
        if ($col -in $colunasUF) {
            return @{ Indice = $i; Tipo = "UF" }
        }
    }
    
    for ($i = 0; $i -lt $Colunas.Count; $i++) {
        $col = $Colunas[$i].Trim('"', ' ').ToUpper()
        if ($col -in $colunasMunicipio) {
            return @{ Indice = $i; Tipo = "MUNICIPIO" }
        }
    }
    
    for ($i = 0; $i -lt $Colunas.Count; $i++) {
        $col = $Colunas[$i].Trim('"', ' ').ToUpper()
        if ($col -eq "CD_MUNICIPIO") {
            return @{ Indice = $i; Tipo = "CD_MUNICIPIO" }
        }
    }
    
    return $null
}

function Eh-GO {
    param([string]$Valor, [string]$Tipo)
    
    $val = $Valor.Trim('"', ' ').ToUpper()
    
    switch ($Tipo) {
        "UF" {
            return ($val -eq "GO" -or $val -eq "GOIAS" -or $val -eq "GOIÁS")
        }
        "MUNICIPIO" {
            return ($val -in $script:municipiosGO)
        }
        "CD_MUNICIPIO" {
            # Codigos de municipio de GO comecam com 52
            return ($val -match "^52\d{3,}")
        }
    }
    return $false
}

# ============================================================
# SELECIONAR MELHOR CSV DO ZIP
# ============================================================
function Selecionar-CsvsPrioritarios {
    param([System.IO.FileInfo[]]$Csvs, [string]$NomeZip)
    
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
    
    $resultado = @()
    foreach ($tabela in $porTabela.Keys) {
        $grupo = $porTabela[$tabela]
        
        if ($grupo.GO.Count -gt 0) {
            foreach ($f in $grupo.GO) {
                $resultado += @{ Csv = $f; Tabela = $tabela; JaFiltrado = $true }
            }
        }
        elseif ($grupo.BRASIL.Count -gt 0) {
            foreach ($f in $grupo.BRASIL) {
                $resultado += @{ Csv = $f; Tabela = $tabela; JaFiltrado = $false }
            }
        }
        else {
            $temUF = $grupo.Outros | Where-Object { $_.Name -match "_[A-Z]{2}[\._]" }
            if ($temUF.Count -gt 0) {
                # Outros estados, sem GO
            }
            else {
                foreach ($f in $grupo.Outros) {
                    $resultado += @{ Csv = $f; Tabela = $tabela; JaFiltrado = $false }
                }
            }
        }
    }
    
    return $resultado
}

# ============================================================
# PROCESSAR CSV (com busca agressiva de GO)
# ============================================================
function Processar-Csv {
    param(
        [string]$Entrada,
        [string]$Saida,
        [bool]$JaFiltrado = $false
    )
    
    try {
        if ($JaFiltrado) {
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
        
        # Precisa filtrar - abrir e detectar coluna UF
        $enc = [System.Text.Encoding]::GetEncoding("iso-8859-1")
        $reader = [System.IO.StreamReader]::new($Entrada, $enc)
        $header = $reader.ReadLine()
        
        if (-not $header -or $header.Length -lt 2) {
            $reader.Close()
            return 0
        }
        
        $separador = if (($header.ToCharArray() | Where-Object {$_ -eq ";"} | Measure-Object).Count -gt 2) { ";" } else { "," }
        $colunas = $header -split [regex]::Escape($separador)
        
        # Busca agressiva de coluna UF
        $infoUF = Encontrar-ColunaUF -Colunas $colunas
        
        if (-not $infoUF) {
            $reader.Close()
            # Sem coluna UF nenhuma - se tem GO no nome, copiar tudo
            if ($Entrada -match "(?i)_go[\._]") {
                $encIn = [System.Text.Encoding]::GetEncoding("iso-8859-1")
                $readerCopy = [System.IO.StreamReader]::new($Entrada, $encIn)
                $writerCopy = [System.IO.StreamWriter]::new($Saida, $false, [System.Text.Encoding]::UTF8)
                $l = 0
                while ($null -ne ($ln = $readerCopy.ReadLine())) { $writerCopy.WriteLine($ln); $l++ }
                $readerCopy.Close(); $writerCopy.Close()
                return [Math]::Max(0, $l - 1)
            }
            # Copiar tudo se arquivo parece pequeno (< 50MB, provavelmente ja filtrado)
            $tamanho = (Get-Item $Entrada).Length
            if ($tamanho -lt 50MB) {
                $encIn = [System.Text.Encoding]::GetEncoding("iso-8859-1")
                $readerCopy = [System.IO.StreamReader]::new($Entrada, $encIn)
                $writerCopy = [System.IO.StreamWriter]::new($Saida, $false, [System.Text.Encoding]::UTF8)
                $l = 0
                while ($null -ne ($ln = $readerCopy.ReadLine())) { $writerCopy.WriteLine($ln); $l++ }
                $readerCopy.Close(); $writerCopy.Close()
                return [Math]::Max(0, $l - 1)
            }
            return 0
        }
        
        $idxUF = $infoUF.Indice
        $tipoUF = $infoUF.Tipo
        
        $writer = [System.IO.StreamWriter]::new($Saida, $false, [System.Text.Encoding]::UTF8)
        $writer.WriteLine($header)
        
        $contGO = 0
        $contTotal = 0
        
        while ($null -ne ($linha = $reader.ReadLine())) {
            $contTotal++
            $campos = $linha -split [regex]::Escape($separador)
            if ($campos.Count -gt $idxUF) {
                if (Eh-GO -Valor $campos[$idxUF] -Tipo $tipoUF) {
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
Write-Host " ORGANIZADOR DADOS ELEITORAIS - GOIAS v4" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Origem:  $PastaDados"
Write-Host "Destino: $PastaSaida"
Write-Host "Regra:   _GO direto > _BRASIL filtrado > fallback municipio/codigo"
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
    
    $tempDir = Join-Path $PastaTemp "z_$idx"
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
    
    try {
        Expand-Archive -Path $zip.FullName -DestinationPath $tempDir -Force -ErrorAction Stop
    }
    catch {
        Write-Host " [ERRO EXTRAIR]" -ForegroundColor Red
        continue
    }
    
    $csvsNoZip = @(Get-ChildItem $tempDir -Recurse -File | Where-Object { $_.Extension.ToLower() -in @(".csv", ".txt") })
    
    if ($csvsNoZip.Count -eq 0) {
        Write-Host " (vazio)" -ForegroundColor DarkGray
        Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        continue
    }
    
    $selecionados = Selecionar-CsvsPrioritarios -Csvs $csvsNoZip -NomeZip $nomeZip
    
    if ($selecionados.Count -eq 0) {
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
        
        if ($tabela -eq "prestacao_raw") {
            $nCsv = $csv.Name.ToLower()
            if ($nCsv -match "receita") { $tabela = "receitas" }
            elseif ($nCsv -match "despesa") { $tabela = "despesas" }
            else { continue }
        }
        
        $pastaTabela = Join-Path $PastaSaida $tabela
        if (-not (Test-Path $pastaTabela)) {
            New-Item -ItemType Directory -Path $pastaTabela -Force | Out-Null
        }
        
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
# CRIAR PASTA banco_de_dados (CSVs consolidados por tabela)
# ============================================================
Write-Host ""
Write-Host "Criando pasta banco_de_dados (CSVs consolidados)..." -ForegroundColor Cyan

$pastaBD = Join-Path $PastaSaida "banco_de_dados"
New-Item -ItemType Directory -Path $pastaBD -Force | Out-Null

# Mapeamento tabela organizada -> tabela Supabase
$mapSupabase = @{
    "candidatos"              = "bd_eleicoes_candidatos"
    "bens_candidatos"         = "bd_eleicoes_bens_candidatos"
    "votacao_munzona"         = "bd_eleicoes_votacao"
    "votacao_partido_munzona" = "bd_eleicoes_votacao_partido"
    "comparecimento_munzona"  = "bd_eleicoes_comparecimento"
    "comparecimento_secao"    = "bd_eleicoes_comparecimento_secao"
    "locais_votacao"          = "bd_eleicoes_locais_votacao"
}

foreach ($tabela in $relatorio.Keys | Sort-Object) {
    $pastaOrigem = Join-Path $PastaSaida $tabela
    if (-not (Test-Path $pastaOrigem)) { continue }
    
    $csvs = @(Get-ChildItem $pastaOrigem -Filter "*.csv" | Sort-Object Name)
    if ($csvs.Count -eq 0) { continue }
    
    # Nome no banco
    $nomeBD = if ($mapSupabase.ContainsKey($tabela)) { $mapSupabase[$tabela] } else { "bd_eleicoes_$tabela" }
    $arquivoBD = Join-Path $pastaBD "${nomeBD}.csv"
    
    # Consolidar todos CSVs da tabela em 1 arquivo
    $writerBD = [System.IO.StreamWriter]::new($arquivoBD, $false, [System.Text.Encoding]::UTF8)
    $headerEscrito = $false
    $totalLinhas = 0
    
    foreach ($csv in $csvs) {
        $readerBD = [System.IO.StreamReader]::new($csv.FullName, [System.Text.Encoding]::UTF8)
        $headerCSV = $readerBD.ReadLine()
        
        if (-not $headerEscrito -and $headerCSV) {
            $writerBD.WriteLine($headerCSV)
            $headerEscrito = $true
        }
        
        while ($null -ne ($ln = $readerBD.ReadLine())) {
            if ($ln.Trim()) {
                $writerBD.WriteLine($ln)
                $totalLinhas++
            }
        }
        $readerBD.Close()
    }
    $writerBD.Close()
    
    Write-Host "  $nomeBD.csv -> $($totalLinhas.ToString('N0')) registros ($($csvs.Count) arquivos)" -ForegroundColor Green
}

# ============================================================
# RELATORIO FINAL
# ============================================================
$fim = Get-Date
$duracao = $fim - $inicio

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " RELATORIO FINAL v4" -ForegroundColor Cyan
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
$txt = "RELATORIO ORGANIZACAO DADOS ELEITORAIS GO v4`nGerado: $fim`nDuracao: $($duracao.ToString('hh\:mm\:ss'))`n`n"
$txt += "ESTRUTURA:`n"
$txt += "  dados_organizados/<tabela>/  = CSVs separados por ano`n"
$txt += "  dados_organizados/banco_de_dados/  = CSVs consolidados prontos para subir`n"
$txt += "  Encoding: UTF-8`n`n"
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
Write-Host "Relatorio:      $relPath" -ForegroundColor Green
Write-Host "Dados por ano:  $PastaSaida" -ForegroundColor Green
Write-Host "BANCO DE DADOS: $pastaBD" -ForegroundColor Cyan
Write-Host ""
Write-Host "Proximos passos: subir os CSVs de banco_de_dados/ para o Supabase" -ForegroundColor Yellow
Write-Host ""
