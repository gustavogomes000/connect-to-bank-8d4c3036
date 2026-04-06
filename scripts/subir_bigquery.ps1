# =============================================================
# SUBIR TODOS OS 22 CSVs PARA BIGQUERY - SEM AUTODETECT
# Cole no PowerShell e rode
# =============================================================

Add-Type -AssemblyName Microsoft.VisualBasic

$PROJECT  = "eleicoesgo20182024"
$DATASET  = "bd_eleicoes"
$LOCATION = "US"
$PASTA    = "C:\Users\Gustavo\Desktop\dados_organizados\banco_de_dados"

$esperado = @{
    "bens_candidatos"         = 292883
    "boletim_urna"            = 8603127
    "candidatos"              = 180882
    "candidatos_complementar" = 46235
    "cassacoes"               = 3885
    "coligacoes"              = 39427
    "comparecimento"          = 8693
    "comparecimento_abstencao"= 2712632
    "despesas"                = 1155856
    "despesas_contratadas"    = 1180678
    "despesas_pagas"          = 929074
    "eleitorado_local"        = 217387
    "mesarios"                = 346188
    "perfil_eleitor_secao"    = 22352332
    "perfil_eleitorado"       = 1807952
    "pesquisas"               = 34457
    "receitas"                = 865446
    "redes_sociais"           = 44402
    "vagas"                   = 3758
    "votacao"                 = 1751886
    "votacao_partido"         = 124632
    "votacao_secao"           = 25375357
}

$tabelas = @(
    "bens_candidatos",
    "boletim_urna",
    "candidatos",
    "candidatos_complementar",
    "cassacoes",
    "coligacoes",
    "comparecimento",
    "comparecimento_abstencao",
    "despesas",
    "despesas_contratadas",
    "despesas_pagas",
    "eleitorado_local",
    "mesarios",
    "perfil_eleitor_secao",
    "perfil_eleitorado",
    "pesquisas",
    "receitas",
    "redes_sociais",
    "vagas",
    "votacao",
    "votacao_partido",
    "votacao_secao"
)

function Get-CsvFirstFields {
    param([string]$Arquivo)

    $encodings = @(
        [System.Text.UTF8Encoding]::new($false, $true),
        [System.Text.Encoding]::UTF8,
        [System.Text.Encoding]::GetEncoding("iso-8859-1")
    )

    foreach ($enc in $encodings) {
        $parser = $null
        try {
            $parser = New-Object Microsoft.VisualBasic.FileIO.TextFieldParser($Arquivo, $enc)
            $parser.TextFieldType = [Microsoft.VisualBasic.FileIO.FieldType]::Delimited
            $parser.SetDelimiters(";")
            $parser.HasFieldsEnclosedInQuotes = $true
            $fields = $parser.ReadFields()
            if ($fields -and $fields.Count -gt 0) {
                $parser.Close()
                return $fields
            }
        }
        catch {
        }
        finally {
            if ($parser) {
                try { $parser.Close() } catch {}
            }
        }
    }

    throw "Nao foi possivel ler a primeira linha de $Arquivo"
}

function Normalize-BqColumn {
    param(
        [string]$Nome,
        [hashtable]$Usados
    )

    if ($null -eq $Nome) { $Nome = "" }

    $Nome = $Nome.Trim().Trim('"')
    $Nome = $Nome -replace "^\uFEFF", ""

    $formD = $Nome.Normalize([Text.NormalizationForm]::FormD)
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $formD.ToCharArray()) {
        $cat = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
        if ($cat -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$sb.Append($ch)
        }
    }

    $Nome = $sb.ToString().ToLowerInvariant()
    $Nome = $Nome -replace "[^a-z0-9]+", "_"
    $Nome = $Nome -replace "_+", "_"
    $Nome = $Nome.Trim("_")

    if ([string]::IsNullOrWhiteSpace($Nome)) { $Nome = "coluna" }
    if ($Nome -match "^[0-9]") { $Nome = "col_$Nome" }

    $base = $Nome
    $i = 2
    while ($Usados.ContainsKey($Nome)) {
        $Nome = "${base}_$i"
        $i++
    }

    $Usados[$Nome] = $true
    return $Nome
}

function Get-BqSchema {
    param(
        [string]$Arquivo,
        [bool]$TemHeader = $true
    )

    $fields = Get-CsvFirstFields -Arquivo $Arquivo
    $colunas = @()

    if ($TemHeader) {
        $usados = @{}
        foreach ($field in $fields) {
            $colunas += (Normalize-BqColumn -Nome $field -Usados $usados)
        }
    }
    else {
        for ($i = 1; $i -le $fields.Count; $i++) {
            $colunas += ("col_{0:d3}" -f $i)
        }
    }

    return ($colunas | ForEach-Object { "$_:STRING" }) -join ","
}

Write-Host "Recriando dataset $DATASET..." -ForegroundColor Yellow
& bq rm -r -f "${PROJECT}:${DATASET}" 2>$null
& bq mk "--location=$LOCATION" --dataset "${PROJECT}:${DATASET}"
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao criar dataset ${PROJECT}:${DATASET}"
}

$ok = 0
$falha = 0
$inicio = Get-Date

foreach ($t in $tabelas) {
    $arquivo = Join-Path $PASTA "bd_eleicoes_$t.csv"

    if (-not (Test-Path $arquivo)) {
        Write-Host "AUSENTE $t" -ForegroundColor Red
        $falha++
        continue
    }

    $tamanho = [math]::Round((Get-Item $arquivo).Length / 1MB, 1)
    $temHeader = $t -ne "boletim_urna"
    $skip = if ($temHeader) { 1 } else { 0 }

    try {
        $schema = Get-BqSchema -Arquivo $arquivo -TemHeader $temHeader
        $qtdCampos = ($schema -split ",").Count
    }
    catch {
        Write-Host "ERRO $t -> $($_.Exception.Message)" -ForegroundColor Red
        $falha++
        continue
    }

    Write-Host "`nSubindo $t ($tamanho MB | $qtdCampos colunas)..." -ForegroundColor Cyan

    $destino = "${PROJECT}:${DATASET}.$t"
    $args = @(
        "load",
        "--location=$LOCATION",
        "--source_format=CSV",
        "--field_delimiter=;",
        "--encoding=UTF-8",
        "--allow_quoted_newlines",
        "--allow_jagged_rows",
        "--skip_leading_rows=$skip",
        "--replace",
        $destino,
        $arquivo,
        $schema
    )

    & bq @args

    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK  $t" -ForegroundColor Green
        $ok++
    }
    else {
        Write-Host "ERRO $t" -ForegroundColor Red
        $falha++
    }
}

$duracao = [math]::Round(((Get-Date) - $inicio).TotalMinutes, 1)
Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "RESULTADO CARGA: $ok OK | $falha erros | $duracao min" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

Write-Host "`nValidando contagens..." -ForegroundColor Cyan
$okValidacao = 0
$falhaValidacao = 0

foreach ($t in $tabelas) {
    $q = "SELECT COUNT(*) as total FROM $DATASET.$t"
    $result = (& bq query "--location=$LOCATION" "--nouse_legacy_sql" "--format=csv" $q 2>$null | Select-Object -Last 1)

    if (-not $result) {
        Write-Host "FALHA $t -> sem retorno da consulta" -ForegroundColor Red
        $falhaValidacao++
        continue
    }

    $real = [int64]$result
    $exp = [int64]$esperado[$t]

    if ($real -eq $exp) {
        Write-Host "OK  $t -> $real / $exp" -ForegroundColor Green
        $okValidacao++
    }
    else {
        $diff = $real - $exp
        Write-Host "FALHA $t -> $real / $exp (diff $diff)" -ForegroundColor Red
        $falhaValidacao++
    }
}

Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "VALIDACAO: $okValidacao OK | $falhaValidacao com diferenca" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
