-- ============================================================
-- 🧹 LIMPEZA BIGQUERY — silver-idea-389314.eleicoes_go_clean
-- Gerado: 2026-04-06 (CORRIGIDO com tabelas e colunas reais)
--
-- CÓDIGOS TSE (minúsculo):
--   Goiânia     = cd_municipio = '93734'
--   Aparecida   = cd_municipio = '91758'
--
-- REGRAS:
--   Estadual (2014, 2018, 2022) → GO inteiro (candidatos concorrem no estado todo)
--   Municipal (2012, 2016, 2020, 2024) → filtrar GYN+APA
--   Tabelas granulares (seção, boletim) → sempre GYN+APA
--
-- ⚠️  EXECUTE BLOCO A BLOCO, NÃO TUDO DE UMA VEZ
-- ============================================================


-- ============================================================
-- PARTE 0: DIAGNÓSTICO — ver tamanho de cada tabela
-- ============================================================

SELECT table_id, ROUND(size_bytes/1e6,1) AS mb, row_count
FROM `silver-idea-389314.eleicoes_go_clean.__TABLES__`
ORDER BY size_bytes DESC;


-- ============================================================
-- PARTE 1: TABELAS PARA VERIFICAR SE ESTÃO VAZIAS (possível DROP)
-- ============================================================
-- Rode o SELECT acima e confira row_count = 0 para estas:

-- raw_cassacoes_2016, raw_cassacoes_2018, raw_cassacoes_2020
-- raw_extrato_bancario_2014, raw_extrato_bancario_2018, raw_extrato_bancario_partido_2014
-- raw_extrato_campanha_2016
-- raw_cnpj_dir_partidario_2015
-- raw_perfil_comp_deficiente_2014, 2016, 2018, 2020, 2024
-- raw_perfil_comp_tte_2016
-- raw_perfil_comparecimento_2014
-- raw_prestacao_final_sup_2016
-- raw_boletim_urna_1412_t2, raw_boletim_urna_1413_t1

-- Se row_count = 0, rode:
/*
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_cassacoes_2016`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_cassacoes_2018`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_cassacoes_2020`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_extrato_bancario_2014`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_extrato_bancario_2018`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_extrato_bancario_partido_2014`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_extrato_campanha_2016`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_cnpj_dir_partidario_2015`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_perfil_comp_deficiente_2014`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_perfil_comp_deficiente_2016`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_perfil_comp_deficiente_2018`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_perfil_comp_deficiente_2020`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_perfil_comp_deficiente_2024`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_perfil_comp_tte_2016`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_perfil_comparecimento_2014`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_prestacao_final_sup_2016`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_1412_t2`;
DROP TABLE IF EXISTS `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_1413_t1`;
*/


-- ============================================================
-- PARTE 2: FILTRAR GYN+APA — tabelas grandes/médias
-- ============================================================

-- ── 2A. COMPARECIMENTO MUNZONA → GYN+APA ──

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_munzona_2016` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_munzona_2016`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_munzona_2018` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_munzona_2018`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_munzona_2020` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_munzona_2020`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_munzona_2022` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_munzona_2022`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_munzona_2024` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_munzona_2024`
WHERE cd_municipio IN ('93734', '91758');


-- ── 2B. COMPARECIMENTO SEÇÃO → GYN+APA ──

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_secao_2020` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_secao_2020`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_secao_2022` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_secao_2022`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_secao_2024` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_secao_2024`
WHERE cd_municipio IN ('93734', '91758');


-- ── 2C. BOLETIM DE URNA → GYN+APA ──

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_2018_t1` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_2018_t1`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_2018_t2` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_2018_t2`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_2020_t1` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_2020_t1`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_2020_t2` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_2020_t2`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_2022_t1` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_2022_t1`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_2022_t2` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_2022_t2`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_2024_t1` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_2024_t1`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_2024_t2` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_boletim_urna_2024_t2`
WHERE cd_municipio IN ('93734', '91758');


-- ── 2D. VOTAÇÃO SEÇÃO → GYN+APA ──

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_votacao_secao_2024` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_votacao_secao_2024`
WHERE cd_municipio IN ('93734', '91758');


-- ── 2E. DETALHE VOTAÇÃO SEÇÃO → GYN+APA ──

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_secao_2014` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_secao_2014`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_secao_2016` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_secao_2016`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_secao_2020` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_secao_2020`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_secao_2022` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_secao_2022`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_secao_2024` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_secao_2024`
WHERE cd_municipio IN ('93734', '91758');


-- ── 2F. PERFIL ELEITORADO → GYN+APA ──

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_perfil_eleitorado_2020` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_perfil_eleitorado_2020`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_perfil_eleitorado_2022` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_perfil_eleitorado_2022`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_perfil_eleitorado_2024` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_perfil_eleitorado_2024`
WHERE cd_municipio IN ('93734', '91758');


-- ── 2G. PERFIL ELEITOR SEÇÃO → GYN+APA ──

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_perfil_eleitor_secao_2020` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_perfil_eleitor_secao_2020`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_perfil_eleitor_secao_2022` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_perfil_eleitor_secao_2022`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_perfil_eleitor_secao_2024` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_perfil_eleitor_secao_2024`
WHERE cd_municipio IN ('93734', '91758');


-- ── 2H. ELEITORADO LOCAL → GYN+APA ──

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_eleitorado_local_2014` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_eleitorado_local_2014`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_eleitorado_local_2016` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_eleitorado_local_2016`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_eleitorado_local_2018` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_eleitorado_local_2018`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_eleitorado_local_2020` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_eleitorado_local_2020`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_eleitorado_local_2022` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_eleitorado_local_2022`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_eleitorado_local_2024` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_eleitorado_local_2024`
WHERE cd_municipio IN ('93734', '91758');


-- ── 2I. MESÁRIOS → GYN+APA ──

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_mesarios_2016` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_mesarios_2016`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_mesarios_2018` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_mesarios_2018`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_mesarios_2020` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_mesarios_2020`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_mesarios_2022` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_mesarios_2022`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_mesarios_2024` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_mesarios_2024`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_mesarios_especiais_2016` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_mesarios_especiais_2016`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_mesarios_especiais_2018` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_mesarios_especiais_2018`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_mesarios_especiais_2020` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_mesarios_especiais_2020`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_mesarios_especiais_2022` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_mesarios_especiais_2022`
WHERE cd_municipio IN ('93734', '91758');

CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_mesarios_especiais_2024` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_mesarios_especiais_2024`
WHERE cd_municipio IN ('93734', '91758');


-- ── 2J. RECEITAS — estaduais GO inteiro, municipais GYN+APA ──

-- 2018 estadual → GO inteiro (só comprimir)
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_receitas_2018` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_receitas_2018`;

-- 2022 estadual → GO inteiro
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_receitas_2022` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_receitas_2022`;

-- 2020 municipal → GYN+APA
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_receitas_2020` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_receitas_2020`
WHERE cd_municipio IN ('93734', '91758') OR sg_ue IN ('93734', '91758');

-- 2024 municipal → GYN+APA
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_receitas_2024` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_receitas_2024`
WHERE cd_municipio IN ('93734', '91758') OR sg_ue IN ('93734', '91758');


-- ── 2K. DESPESAS — estaduais GO inteiro, municipais GYN+APA ──

-- 2018 estadual → GO inteiro
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_despesas_2018` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_despesas_2018`;

-- 2022 estadual → GO inteiro
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_despesas_2022` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_despesas_2022`;

-- 2020 municipal → GYN+APA
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_despesas_2020` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_despesas_2020`
WHERE cd_municipio IN ('93734', '91758') OR sg_ue IN ('93734', '91758');

-- 2024 municipal → GYN+APA
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_despesas_2024` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_despesas_2024`
WHERE cd_municipio IN ('93734', '91758') OR sg_ue IN ('93734', '91758');


-- ── 2L. CNPJ CAMPANHA — estaduais GO, municipais GYN+APA ──

-- 2014 estadual → GO inteiro
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_cnpj_campanha_2014` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_cnpj_campanha_2014`;

-- 2022 estadual → GO inteiro
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_cnpj_campanha_2022` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_cnpj_campanha_2022`;

-- 2016 municipal → sem filtro (base sem cd_municipio/sg_ue)
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_cnpj_campanha_2016` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_cnpj_campanha_2016`;

-- 2020 municipal → sem filtro (base sem cd_municipio/sg_ue)
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_cnpj_campanha_2020` AS
SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_cnpj_campanha_2020`;


-- ============================================================
-- PARTE 3: COMPRIMIR TABELAS GO INTEIRO (sem filtro)
-- ============================================================

-- Candidatos
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_candidatos_2012` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_candidatos_2012`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_candidatos_complementar_2020` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_candidatos_complementar_2020`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_candidatos_complementar_2022` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_candidatos_complementar_2022`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_candidatos_complementar_2024` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_candidatos_complementar_2024`;

-- Bens 2014 (estadual, único existente)
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_bens_candidatos_2014` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_bens_candidatos_2014`;

-- Votação munzona
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_votacao_munzona_2012` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_votacao_munzona_2012`;

-- Detalhe votação munzona (GO inteiro)
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_munzona_2014` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_munzona_2014`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_munzona_2016` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_munzona_2016`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_munzona_2018` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_munzona_2018`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_munzona_2020` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_munzona_2020`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_munzona_2022` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_detalhe_votacao_munzona_2022`;

-- Coligações
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_coligacoes_2014` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_coligacoes_2014`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_coligacoes_2016` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_coligacoes_2016`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_coligacoes_2018` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_coligacoes_2018`;

-- Vagas
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_vagas_2014` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_vagas_2014`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_vagas_2016` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_vagas_2016`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_vagas_2018` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_vagas_2018`;

-- Câmara deputados
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_camara_deputados_go` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_camara_deputados_go`;

-- FEFC
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_fefc_fp_2020` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_fefc_fp_2020`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_fefc_fp_2022` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_fefc_fp_2022`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_fefc_fp_2024` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_fefc_fp_2024`;

-- Dados externos (manter tudo, só comprimir)
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_municipio_tse_ibge` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_municipio_tse_ibge`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_censo_alfabetizacao` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_censo_alfabetizacao`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_censo_cor_raca` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_censo_cor_raca`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_censo_piramide_etaria` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_censo_piramide_etaria`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_censo_sexo` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_censo_sexo`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_datasus_estab_aparecida` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_datasus_estab_aparecida`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_datasus_estab_goiania` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_datasus_estab_goiania`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_datasus_estabelecimentos_aparecida` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_datasus_estabelecimentos_aparecida`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_datasus_estabelecimentos_goiania` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_datasus_estabelecimentos_goiania`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_ibge_censo_alfabetizacao` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_ibge_censo_alfabetizacao`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_ibge_censo_cor_raca` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_ibge_censo_cor_raca`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_ibge_censo_pop` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_ibge_censo_pop`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_ibge_censo_saneamento` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_ibge_censo_saneamento`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_ibge_censo_sexo_idade` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_ibge_censo_sexo_idade`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_ibge_pib_impostos` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_ibge_pib_impostos`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_ibge_pib_percapita` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_ibge_pib_percapita`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_ibge_pib_total` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_ibge_pib_total`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_ibge_pib_va` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_ibge_pib_va`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_ibge_populacao_go` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_ibge_populacao_go`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_siconfi_rreo_aparecida` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_siconfi_rreo_aparecida`;
CREATE OR REPLACE TABLE `silver-idea-389314.eleicoes_go_clean.raw_siconfi_rreo_goiania` AS SELECT * FROM `silver-idea-389314.eleicoes_go_clean.raw_siconfi_rreo_goiania`;


-- ============================================================
-- PARTE 4: VERIFICAÇÃO FINAL
-- ============================================================

SELECT table_id, ROUND(size_bytes/1e6,1) AS mb, row_count
FROM `silver-idea-389314.eleicoes_go_clean.__TABLES__`
ORDER BY size_bytes DESC;

-- Verificar que GYN+APA têm dados:
/*
SELECT 'comparecimento_2024' as tabela, COUNT(*) as linhas 
FROM `silver-idea-389314.eleicoes_go_clean.raw_comparecimento_munzona_2024`
UNION ALL
SELECT 'votacao_secao_2024', COUNT(*) 
FROM `silver-idea-389314.eleicoes_go_clean.raw_votacao_secao_2024`
UNION ALL
SELECT 'receitas_2024', COUNT(*) 
FROM `silver-idea-389314.eleicoes_go_clean.raw_receitas_2024`;
*/
