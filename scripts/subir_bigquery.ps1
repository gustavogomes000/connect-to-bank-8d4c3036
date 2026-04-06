# =============================================================
# SUBIDA ROBUSTA DOS 22 CSVs PARA BIGQUERY
# Rode no PowerShell
# =============================================================

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pyScript = Join-Path $scriptDir "subir_bigquery.py"

if (-not (Test-Path $pyScript)) {
    throw "Arquivo nao encontrado: $pyScript"
}

if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 $pyScript
}
elseif (Get-Command python -ErrorAction SilentlyContinue) {
    & python $pyScript
}
elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    & python3 $pyScript
}
else {
    throw "Python 3 nao encontrado. Instale o Python e rode novamente."
}

if ($LASTEXITCODE -ne 0) {
    throw "A carga falhou. Veja a ultima mensagem acima."
}
