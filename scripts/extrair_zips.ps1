# Extrair todos os ZIPs e juntar CSV/XLS/XLSX em pasta unica
# Cole direto no PowerShell ou salve como .ps1

$pasta = "C:\Users\Gustavo\Desktop\dados"
$saida = "$pasta\dados_organizados"

if (!(Test-Path $saida)) { New-Item -ItemType Directory -Path $saida | Out-Null }

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Extraindo ZIPs de: $pasta" -ForegroundColor Cyan
Write-Host "Saida: $saida" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$zips = Get-ChildItem -Path $pasta -Filter "*.zip" | Sort-Object Name
$totalDados = 0
$totalIgnorados = 0
$erros = @()
$extensoesManter = @('.csv', '.xls', '.xlsx', '.tsv')

foreach ($zip in $zips) {
    $nomeZip = $zip.BaseName
    try {
        $tempDir = "$env:TEMP\extract_$nomeZip"
        if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
        
        Expand-Archive -Path $zip.FullName -DestinationPath $tempDir -Force
        
        $arquivos = Get-ChildItem -Path $tempDir -Recurse -File
        $dadosNoZip = 0
        
        foreach ($arq in $arquivos) {
            $ext = $arq.Extension.ToLower()
            if ($extensoesManter -contains $ext) {
                $destino = Join-Path $saida $arq.Name
                if (Test-Path $destino) {
                    $semExt = [System.IO.Path]::GetFileNameWithoutExtension($arq.Name)
                    $destino = Join-Path $saida "${semExt}__${nomeZip}${ext}"
                }
                Copy-Item $arq.FullName -Destination $destino
                $dadosNoZip++
                $totalDados++
            } else {
                $totalIgnorados++
            }
        }
        
        Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        
        $status = if ($dadosNoZip -gt 0) { "$dadosNoZip arquivos" } else { "vazio" }
        Write-Host "  $($zip.Name) -> $status" -ForegroundColor $(if ($dadosNoZip -gt 0) { "Green" } else { "Yellow" })
    }
    catch {
        $erros += "$($zip.Name): $_"
        Write-Host "  ERRO $($zip.Name): $_" -ForegroundColor Red
    }
}

# Copiar arquivos soltos (CSV/XLS fora de ZIP)
$soltos = 0
foreach ($ext in $extensoesManter) {
    Get-ChildItem -Path $pasta -Filter "*$ext" -File | Where-Object { $_.DirectoryName -ne $saida } | ForEach-Object {
        $destino = Join-Path $saida $_.Name
        if (!(Test-Path $destino)) {
            Copy-Item $_.FullName -Destination $destino
            $soltos++
            $totalDados++
        }
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "ZIPs processados:   $($zips.Count)" -ForegroundColor White
Write-Host "Arquivos extraidos: $totalDados" -ForegroundColor Green
Write-Host "Arquivos soltos:    $soltos" -ForegroundColor White
Write-Host "Ignorados:          $totalIgnorados" -ForegroundColor Gray
Write-Host "Erros:              $($erros.Count)" -ForegroundColor $(if ($erros.Count -gt 0) { "Red" } else { "White" })
Write-Host "Tudo em:            $saida" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($erros.Count -gt 0) {
    Write-Host "`nErros:" -ForegroundColor Red
    $erros | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
}

# Inventario por tipo de dataset
Write-Host "`nInventario por dataset:" -ForegroundColor Yellow
$arquivosSaida = Get-ChildItem -Path $saida -File | Sort-Object Name
$datasets = @{}
foreach ($f in $arquivosSaida) {
    $nome = $f.BaseName.ToLower()
    $tipo = "outro"
    $prefixos = @('votacao_secao','votacao_candidato','votacao_partido','consulta_cand','bem_candidato',
                   'consulta_coligacao','consulta_vagas','rede_social','motivo_cassacao',
                   'prestacao','receitas','despesas','perfil_eleitorado','perfil_eleitor_secao',
                   'detalhe_votacao','bweb','boletim_urna','filiados','pesquisa',
                   'eleitorado_local','local_votacao','extrato_campanha','orgao_partidario',
                   'delegado','historico_totalizacao','relatorio_resultado')
    foreach ($p in $prefixos) {
        if ($nome -like "*$p*") { $tipo = $p; break }
    }
    if (!$datasets.ContainsKey($tipo)) { $datasets[$tipo] = @() }
    $datasets[$tipo] += @{ Name = $f.Name; MB = [math]::Round($f.Length / 1MB, 1) }
}

foreach ($tipo in ($datasets.Keys | Sort-Object)) {
    $arqs = $datasets[$tipo]
    $totalMB = ($arqs | ForEach-Object { $_.MB } | Measure-Object -Sum).Sum
    $goCount = ($arqs | Where-Object { $_.Name -match '_GO' }).Count
    Write-Host "`n  $tipo ($($arqs.Count) arquivos, ${totalMB} MB, $goCount de GO)" -ForegroundColor Cyan
    $arqs | Select-Object -First 3 | ForEach-Object { Write-Host "     - $($_.Name) ($($_.MB) MB)" }
    if ($arqs.Count -gt 3) { Write-Host "     ... e mais $($arqs.Count - 3)" }
}

Write-Host "`nPronto! Cole o resultado aqui pro proximo passo!" -ForegroundColor Green
