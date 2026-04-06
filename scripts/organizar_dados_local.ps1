<#
.SYNOPSIS
    Organiza TODOS os dados TSE locais em CSVs limpos por tabela, filtrados para Goiás.
    
.DESCRIPTION
    1. Varre C:\Users\Gustavo\Desktop\dados (ZIPs e CSVs)
    2. Extrai ZIPs para pasta temporária
    3. Identifica o tipo de cada CSV pelo nome do arquivo
    4. Filtra só registros de Goiás (SG_UF=GO ou código município 52*)
    5. Para receitas/despesas no mesmo ZIP, separa pelo nome do CSV
    6. Salva CSVs organizados em C:\Users\Gustavo\Desktop\dados_organizados\{tabela}\
    7. Gera relatório final

.NOTES
    Rodar: powershell -ExecutionPolicy Bypass -File organizar_dados_local.ps1
#>

param(
    [string]$PastaDados = "C:\Users\Gustavo\Desktop\dados",
    [string]$PastaSaida = "C:\Users\Gustavo\Desktop\dados_organizados",
    [string]$PastaTemp  = "C:\Users\Gustavo\Desktop\dados_temp"
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ============================================================
# MAPEAMENTO: padrão do nome do arquivo → pasta de destino
# ============================================================
$MAPEAMENTO = @(
    # Prioridade 1 - Core
    @{ Padrao = "consulta_cand_complementar"; Tabela = "candidatos_complementar"; ColunaUF = "SG_UF" }
    @{ Padrao = "consulta_cand";              Tabela = "candidatos";              ColunaUF = "SG_UF" }
    @{ Padrao = "bem_candidato";              Tabela = "bens_candidatos";          ColunaUF = "SG_UF" }
    @{ Padrao = "votacao_candidato_munzona";  Tabela = "votacao_munzona";          ColunaUF = "SG_UF" }
    @{ Padrao = "votacao_partido_munzona";    Tabela = "votacao_partido_munzona";  ColunaUF = "SG_UF" }
    @{ Padrao = "votacao_secao";             Tabela = "votacao_secao";            ColunaUF = "SG_UF" }
    @{ Padrao = "detalhe_votacao_munzona";   Tabela = "comparecimento_munzona";   ColunaUF = "SG_UF" }
    @{ Padrao = "detalhe_votacao_secao";     Tabela = "comparecimento_secao";     ColunaUF = "SG_UF" }
    @{ Padrao = "perfil_eleitorado";         Tabela = "perfil_eleitorado";        ColunaUF = "SG_UF" }
    @{ Padrao = "perfil_eleitor_secao";      Tabela = "perfil_eleitor_secao";     ColunaUF = "SG_UF" }
    @{ Padrao = "eleitorado_local_votacao";  Tabela = "eleitorado_local";         ColunaUF = "SG_UF" }
    
    # Prestação de contas - separar por nome do CSV
    @{ Padrao = "receitas_candidatos_doadores"; Tabela = "doadores_campanha";     ColunaUF = "SG_UF" }
    @{ Padrao = "despesas_contratadas";         Tabela = "despesas_contratadas";  ColunaUF = "SG_UF" }
    @{ Padrao = "despesas_pagas";               Tabela = "despesas_pagas";        ColunaUF = "SG_UF" }
    @{ Padrao = "receita";                      Tabela = "receitas";              ColunaUF = "SG_UF"; CsvFilter = "receita" }
    @{ Padrao = "despesa";                      Tabela = "despesas";              ColunaUF = "SG_UF"; CsvFilter = "despesa" }
    @{ Padrao = "prestacao_de_contas";          Tabela = "_prestacao_raw";        ColunaUF = "SG_UF" }
    
    # Prioridade 2
    @{ Padrao = "filiados";                  Tabela = "filiados";                 ColunaUF = "SG_UF" }
    @{ Padrao = "consulta_coligacao";        Tabela = "coligacoes";               ColunaUF = "SG_UF" }
    @{ Padrao = "consulta_vagas";            Tabela = "vagas";                    ColunaUF = "SG_UF" }
    @{ Padrao = "consulta_legendas";         Tabela = "legendas";                 ColunaUF = "SG_UF" }
    @{ Padrao = "rede_social_candidato";     Tabela = "redes_sociais";            ColunaUF = "SG_UF" }
    @{ Padrao = "boletim_urna";              Tabela = "boletim_urna";             ColunaUF = "SG_UF" }
    @{ Padrao = "bweb";                      Tabela = "boletim_urna";             ColunaUF = "SG_UF" }
    @{ Padrao = "pesquisa_eleitoral";        Tabela = "pesquisas";                ColunaUF = "SG_UF" }
    @{ Padrao = "motivo_cassacao";           Tabela = "cassacoes";                ColunaUF = "SG_UF" }
    @{ Padrao = "consulta_mesarios";         Tabela = "mesarios";                 ColunaUF = "SG_UF" }
    @{ Padrao = "transferencia_eleitoral";   Tabela = "transferencia_eleitoral";  ColunaUF = "SG_UF" }
    @{ Padrao = "comparecimento_abstencao";  Tabela = "comparecimento_abstencao"; ColunaUF = "SG_UF" }
    @{ Padrao = "consulta_orgao_partidario"; Tabela = "orgao_partidario";         ColunaUF = "SG_UF" }
    @{ Padrao = "fundo_partidario";          Tabela = "fundo_partidario";         ColunaUF = "SG_UF" }
    @{ Padrao = "prestacao_de_contas_eleitorais_orgaos"; Tabela = "prestacao_partidos"; ColunaUF = "SG_UF" }
)

# Extensões para ignorar
$IGNORAR = @(".sha1", ".sha512", ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".json", ".geojson", ".html", ".xml", ".md", ".py", ".sql", ".ps1", ".bat", ".exe", ".dll")

# ============================================================
# FUNÇÕES
# ============================================================

function Get-AnoDoArquivo([string]$nome) {
    if ($nome -match "(\d{4})") { return $Matches[1] }
    return "sem_ano"
}

function Get-TabelaParaCsv([string]$nomeCsv) {
    $nomeNorm = $nomeCsv.ToLower()
    foreach ($m in $MAPEAMENTO) {
        if ($nomeNorm -like "*$($m.Padrao)*") {
            return $m
        }
    }
    return $null
}

function Filtrar-CsvParaGO {
    param(
        [string]$CaminhoEntrada,
        [string]$CaminhoSaida,
        [string]$ColunaUF = "SG_UF",
        [string]$Encoding = "Latin1"
    )
    
    try {
        # Detectar separador e encoding
        $primeiraLinha = Get-Content $CaminhoEntrada -TotalCount 1 -Encoding ([System.Text.Encoding]::GetEncoding("iso-8859-1"))
        
        if (-not $primeiraLinha) {
            Write-Host "    [VAZIO] $CaminhoEntrada" -ForegroundColor DarkGray
            return 0
        }
        
        $separador = if ($primeiraLinha -match ";") { ";" } else { "," }
        
        # Encontrar índice da coluna UF
        $colunas = $primeiraLinha -split [regex]::Escape($separador)
        $colunas = $colunas | ForEach-Object { $_.Trim('"', ' ') }
        
        $idxUF = -1
        $possiveisUF = @($ColunaUF, "SG_UF", "SG_UE", "UF", "SIGLA_UF", "SG_UF_NASCIMENTO")
        foreach ($col in $possiveisUF) {
            $idx = [Array]::IndexOf($colunas, $col)
            if ($idx -ge 0) { $idxUF = $idx; break }
        }
        
        # Se não tem coluna UF, verificar se já é arquivo _GO
        if ($idxUF -lt 0) {
            if ($CaminhoEntrada -match "_GO[.\s_]" -or $CaminhoEntrada -match "GOIAS") {
                # Arquivo já é de GO, copiar tudo
                Copy-Item $CaminhoEntrada $CaminhoSaida -Force
                $linhas = (Get-Content $CaminhoSaida | Measure-Object).Count - 1
                return [Math]::Max(0, $linhas)
            }
            Write-Host "    [SEM UF] Nao encontrou coluna UF em: $($colunas -join ', ')" -ForegroundColor Yellow
            return 0
        }
        
        # Filtrar linha a linha (eficiente pra arquivos grandes)
        $reader = [System.IO.StreamReader]::new($CaminhoEntrada, [System.Text.Encoding]::GetEncoding("iso-8859-1"))
        $writer = [System.IO.StreamWriter]::new($CaminhoSaida, $false, [System.Text.Encoding]::UTF8)
        
        # Escrever cabeçalho
        $header = $reader.ReadLine()
        $writer.WriteLine($header)
        
        $contGO = 0
        $contTotal = 0
        
        while ($null -ne ($linha = $reader.ReadLine())) {
            $contTotal++
            $campos = $linha -split [regex]::Escape($separador)
            if ($campos.Count -gt $idxUF) {
                $valorUF = $campos[$idxUF].Trim('"', ' ')
                if ($valorUF -eq "GO" -or $valorUF -eq "GOIAS" -or $valorUF -eq "GOIÁS" -or $valorUF -like "52*") {
                    $writer.WriteLine($linha)
                    $contGO++
                }
            }
        }
        
        $reader.Close()
        $writer.Close()
        
        if ($contGO -eq 0 -and (Test-Path $CaminhoSaida)) {
            Remove-Item $CaminhoSaida -Force
        }
        
        return $contGO
    }
    catch {
        Write-Host "    [ERRO] $($_.Exception.Message)" -ForegroundColor Red
        return 0
    }
}

# ============================================================
# INÍCIO
# ============================================================
$inicio = Get-Date
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " ORGANIZADOR DE DADOS ELEITORAIS - GOIAS" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Pasta origem:  $PastaDados"
Write-Host "Pasta destino: $PastaSaida"
Write-Host "Inicio: $inicio"
Write-Host ""

# Criar pastas
if (Test-Path $PastaSaida) { 
    Write-Host "Limpando pasta de saida anterior..." -ForegroundColor Yellow
    Remove-Item $PastaSaida -Recurse -Force 
}
New-Item -ItemType Directory -Path $PastaSaida -Force | Out-Null
New-Item -ItemType Directory -Path $PastaTemp -Force | Out-Null

# Relatório
$relatorio = @{}

# ============================================================
# ETAPA 1: Listar todos os arquivos
# ============================================================
Write-Host "ETAPA 1: Escaneando arquivos..." -ForegroundColor Green

$todosArquivos = Get-ChildItem $PastaDados -Recurse -File
$zips = $todosArquivos | Where-Object { $_.Extension -eq ".zip" }
$csvsDiretos = $todosArquivos | Where-Object { $_.Extension -in @(".csv", ".txt") }
$jsonsDiretos = $todosArquivos | Where-Object { $_.Extension -eq ".json" -and $_.Name -like "raw_*" }

Write-Host "  ZIPs encontrados: $($zips.Count)" -ForegroundColor White
Write-Host "  CSVs diretos:     $($csvsDiretos.Count)" -ForegroundColor White
Write-Host "  JSONs (APIs):     $($jsonsDiretos.Count)" -ForegroundColor White
Write-Host ""

# ============================================================
# ETAPA 2: Extrair ZIPs e processar CSVs
# ============================================================
Write-Host "ETAPA 2: Processando ZIPs..." -ForegroundColor Green

$totalProcessados = 0
$totalRegistrosGO = 0

foreach ($zip in $zips) {
    $nomeZip = $zip.Name.ToLower()
    
    # Ignorar arquivos de checksum
    if ($nomeZip -match "\.(sha1|sha512)$") { continue }
    
    $ano = Get-AnoDoArquivo $zip.BaseName
    
    Write-Host "  [$($totalProcessados+1)/$($zips.Count)] $($zip.Name)" -ForegroundColor White -NoNewline
    
    # Extrair ZIP para temp
    $tempDir = Join-Path $PastaTemp $zip.BaseName
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
    
    try {
        Expand-Archive -Path $zip.FullName -DestinationPath $tempDir -Force -ErrorAction Stop
    }
    catch {
        Write-Host " [ERRO EXTRAIR]" -ForegroundColor Red
        continue
    }
    
    # Encontrar CSVs dentro do ZIP
    $csvsNoZip = Get-ChildItem $tempDir -Recurse -File | Where-Object { $_.Extension -in @(".csv", ".txt") }
    
    if ($csvsNoZip.Count -eq 0) {
        Write-Host " (sem CSVs)" -ForegroundColor DarkGray
        continue
    }
    
    $registrosZip = 0
    
    foreach ($csv in $csvsNoZip) {
        $nomeCsv = $csv.Name.ToLower()
        
        # Ignorar leia-me e similares
        if ($nomeCsv -match "leia.?me|readme|instruc") { continue }
        
        # Identificar tabela
        $mapeamento = Get-TabelaParaCsv $nomeCsv
        
        if (-not $mapeamento) {
            # Tentar pelo nome do ZIP
            $mapeamento = Get-TabelaParaCsv $nomeZip
        }
        
        if (-not $mapeamento) {
            Write-Host ""
            Write-Host "    [NAO MAPEADO] $nomeCsv" -ForegroundColor DarkYellow
            continue
        }
        
        $tabela = $mapeamento.Tabela
        
        # Para ZIPs de prestação de contas, separar receitas/despesas pelo nome do CSV
        if ($tabela -eq "_prestacao_raw") {
            if ($nomeCsv -match "receita") { $tabela = "receitas" }
            elseif ($nomeCsv -match "despesa") { $tabela = "despesas" }
            else { continue }
        }
        
        # Criar pasta destino
        $pastaTabela = Join-Path $PastaSaida $tabela
        if (-not (Test-Path $pastaTabela)) {
            New-Item -ItemType Directory -Path $pastaTabela -Force | Out-Null
        }
        
        # Nome do CSV de saída padronizado
        $nomeSaida = "${tabela}_${ano}_GO.csv"
        $caminhoSaida = Join-Path $pastaTabela $nomeSaida
        
        # Se já existe, criar com sufixo
        $sufixo = 1
        while (Test-Path $caminhoSaida) {
            $nomeSaida = "${tabela}_${ano}_GO_${sufixo}.csv"
            $caminhoSaida = Join-Path $pastaTabela $nomeSaida
            $sufixo++
        }
        
        # Filtrar para GO
        $registros = Filtrar-CsvParaGO -CaminhoEntrada $csv.FullName -CaminhoSaida $caminhoSaida -ColunaUF $mapeamento.ColunaUF
        
        if ($registros -gt 0) {
            $registrosZip += $registros
            
            if (-not $relatorio.ContainsKey($tabela)) {
                $relatorio[$tabela] = @{ Arquivos = 0; Registros = 0; Anos = @() }
            }
            $relatorio[$tabela].Arquivos++
            $relatorio[$tabela].Registros += $registros
            if ($ano -notin $relatorio[$tabela].Anos) {
                $relatorio[$tabela].Anos += $ano
            }
        }
    }
    
    $totalRegistrosGO += $registrosZip
    $totalProcessados++
    
    if ($registrosZip -gt 0) {
        Write-Host " -> $registrosZip registros GO" -ForegroundColor Green
    } else {
        Write-Host " (0 GO)" -ForegroundColor DarkGray
    }
    
    # Limpar temp deste ZIP
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

# ============================================================
# ETAPA 3: Processar CSVs soltos (não estavam em ZIP)
# ============================================================
Write-Host ""
Write-Host "ETAPA 3: Processando CSVs soltos..." -ForegroundColor Green

foreach ($csv in $csvsDiretos) {
    $nomeCsv = $csv.Name.ToLower()
    if ($nomeCsv -match "leia.?me|readme|instruc") { continue }
    
    $mapeamento = Get-TabelaParaCsv $nomeCsv
    if (-not $mapeamento) { continue }
    
    $tabela = $mapeamento.Tabela
    if ($tabela -eq "_prestacao_raw") {
        if ($nomeCsv -match "receita") { $tabela = "receitas" }
        elseif ($nomeCsv -match "despesa") { $tabela = "despesas" }
        else { continue }
    }
    
    $ano = Get-AnoDoArquivo $csv.BaseName
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
    
    Write-Host "  $($csv.Name)" -ForegroundColor White -NoNewline
    $registros = Filtrar-CsvParaGO -CaminhoEntrada $csv.FullName -CaminhoSaida $caminhoSaida -ColunaUF $mapeamento.ColunaUF
    
    if ($registros -gt 0) {
        Write-Host " -> $registros registros GO" -ForegroundColor Green
        $totalRegistrosGO += $registros
        if (-not $relatorio.ContainsKey($tabela)) {
            $relatorio[$tabela] = @{ Arquivos = 0; Registros = 0; Anos = @() }
        }
        $relatorio[$tabela].Arquivos++
        $relatorio[$tabela].Registros += $registros
        if ($ano -notin $relatorio[$tabela].Anos) { $relatorio[$tabela].Anos += $ano }
    } else {
        Write-Host " (0 GO)" -ForegroundColor DarkGray
    }
}

# ============================================================
# ETAPA 4: Copiar JSONs de APIs externas (já filtrados)
# ============================================================
Write-Host ""
Write-Host "ETAPA 4: Copiando JSONs de APIs..." -ForegroundColor Green

$pastaApis = Join-Path $PastaSaida "_apis_externas"
foreach ($json in $jsonsDiretos) {
    if (-not (Test-Path $pastaApis)) {
        New-Item -ItemType Directory -Path $pastaApis -Force | Out-Null
    }
    Copy-Item $json.FullName (Join-Path $pastaApis $json.Name) -Force
    Write-Host "  $($json.Name) copiado" -ForegroundColor Green
}

# ============================================================
# ETAPA 5: Limpar temp
# ============================================================
if (Test-Path $PastaTemp) {
    Remove-Item $PastaTemp -Recurse -Force -ErrorAction SilentlyContinue
}

# ============================================================
# RELATÓRIO FINAL
# ============================================================
$fim = Get-Date
$duracao = $fim - $inicio

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " RELATORIO FINAL" -ForegroundColor Cyan  
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host ("{0,-35} {1,10} {2,12} {3}" -f "TABELA", "ARQUIVOS", "REGISTROS", "ANOS") -ForegroundColor White
Write-Host ("-" * 75) -ForegroundColor DarkGray

$tabelasOrdenadas = $relatorio.Keys | Sort-Object
foreach ($t in $tabelasOrdenadas) {
    $r = $relatorio[$t]
    $anos = ($r.Anos | Sort-Object) -join ","
    $cor = if ($r.Registros -gt 10000) { "Green" } elseif ($r.Registros -gt 0) { "Yellow" } else { "Red" }
    Write-Host ("{0,-35} {1,10} {2,12:N0} {3}" -f $t, $r.Arquivos, $r.Registros, $anos) -ForegroundColor $cor
}

Write-Host ("-" * 75) -ForegroundColor DarkGray
Write-Host ""
Write-Host "Total tabelas:    $($relatorio.Count)" -ForegroundColor Cyan
Write-Host "Total registros:  $($totalRegistrosGO.ToString('N0'))" -ForegroundColor Cyan
Write-Host "ZIPs processados: $totalProcessados" -ForegroundColor Cyan
Write-Host "Duracao:          $($duracao.ToString('hh\:mm\:ss'))" -ForegroundColor Cyan
Write-Host "Saida em:         $PastaSaida" -ForegroundColor Green
Write-Host ""

# Salvar relatório em arquivo
$relatorioPath = Join-Path $PastaSaida "_RELATORIO.txt"
$relatorioTexto = @"
RELATORIO DE ORGANIZACAO - DADOS ELEITORAIS GOIAS
Gerado em: $fim
Duracao: $($duracao.ToString('hh\:mm\:ss'))
Origem: $PastaDados
Destino: $PastaSaida

TABELAS:
"@

foreach ($t in $tabelasOrdenadas) {
    $r = $relatorio[$t]
    $anos = ($r.Anos | Sort-Object) -join ","
    $relatorioTexto += "`n  $t — $($r.Arquivos) arquivo(s), $($r.Registros.ToString('N0')) registros, anos: $anos"
}

$relatorioTexto += "`n`nTotal: $($relatorio.Count) tabelas, $($totalRegistrosGO.ToString('N0')) registros"
Set-Content $relatorioPath $relatorioTexto -Encoding UTF8

Write-Host "Relatorio salvo em: $relatorioPath" -ForegroundColor Green
Write-Host ""
Write-Host "PROXIMO PASSO: Revisar os CSVs em $PastaSaida e depois subir pro banco." -ForegroundColor Yellow
Write-Host ""
