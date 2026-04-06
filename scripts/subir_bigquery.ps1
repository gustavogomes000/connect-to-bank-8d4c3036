# =============================================================
# SUBIR TODOS OS 22 CSVs PARA BIGQUERY
# Cole no PowerShell e rode
# =============================================================

$PROJECT = "eleicoesgo20182024"
$DATASET = "bd_eleicoes"
$PASTA   = "C:\Users\Gustavo\Desktop\dados_organizados\banco_de_dados"

# Recriar dataset limpo
Write-Host "Recriando dataset $DATASET..." -ForegroundColor Yellow
bq rm -r -f "${PROJECT}:${DATASET}" 2>$null
bq mk --dataset "${PROJECT}:${DATASET}"

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

$ok = 0; $falha = 0
$inicio = Get-Date

foreach ($t in $tabelas) {
    $arquivo = Join-Path $PASTA "bd_eleicoes_$t.csv"
    
    if (-not (Test-Path $arquivo)) {
        Write-Host "AUSENTE $t" -ForegroundColor Red
        $falha++
        continue
    }

    $tamanho = [math]::Round((Get-Item $arquivo).Length / 1MB, 1)
    Write-Host "`nSubindo $t ($tamanho MB)..." -ForegroundColor Cyan

    $destino = "${PROJECT}:${DATASET}.$t"

    if ($t -eq "boletim_urna") {
        $skip = 0
    } else {
        $skip = 1
    }

    bq load --source_format=CSV --field_delimiter=";" --quote="`"" --allow_quoted_newlines --skip_leading_rows=$skip --autodetect --replace $destino $arquivo

    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK  $t" -ForegroundColor Green
        $ok++
    } else {
        Write-Host "ERRO $t" -ForegroundColor Red
        $falha++
    }
}

$duracao = [math]::Round(((Get-Date) - $inicio).TotalMinutes, 1)
Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "RESULTADO: $ok OK | $falha erros | $duracao min" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

# Validar contagens
Write-Host "`nValidando contagens..." -ForegroundColor Cyan
foreach ($t in $tabelas) {
    $q = "SELECT COUNT(*) as total FROM $DATASET.$t"
    $result = bq query --nouse_legacy_sql --format=csv $q 2>$null | Select-Object -Last 1
    Write-Host "$t -> $result registros" -ForegroundColor Gray
}
