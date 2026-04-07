import { supabase } from '@/integrations/supabase/client';

/**
 * Execute a SQL query against MotherDuck via the query-motherduck edge function.
 */
export async function mdQuery<T = Record<string, any>>(sql: string): Promise<T[]> {
  const { data, error } = await supabase.functions.invoke('query-motherduck', {
    body: { query: sql },
  });
  if (error) throw new Error(error.message || 'Erro ao chamar MotherDuck');
  if (data?.error) throw new Error(data.error);
  return (data?.rows || []) as T[];
}

// ── Available years per dataset ──
const CAND_ANOS = [2014, 2016, 2018, 2020, 2022, 2024];
const BENS_ANOS = [2014, 2016, 2018, 2020, 2022, 2024];
const VOTACAO_MUNZONA_ANOS = [2014, 2016, 2018, 2020, 2022, 2024];
const VOTACAO_PARTIDO_ANOS = [2014, 2016, 2018, 2020, 2022, 2024];
const VOTACAO_SECAO_ANOS = [2014, 2016, 2018, 2020, 2022];
const DETALHE_VOTACAO_MUNZONA_ANOS = [2014, 2016, 2018, 2020, 2022, 2024];
const DETALHE_VOTACAO_SECAO_ANOS = [2014, 2016, 2020, 2022, 2024];
const COLIGACAO_ANOS = [2014, 2016, 2018, 2020, 2024];
const VAGAS_ANOS = [2014, 2016, 2018, 2020, 2022, 2024];
const PERFIL_ELEITORADO_ANOS = [2014, 2016, 2018, 2020, 2024];
const PERFIL_ELEITOR_SECAO_ANOS = [2014, 2016, 2018, 2020, 2024];
const ELEITORADO_LOCAL_ANOS = [2014, 2016, 2018, 2020, 2024];
const RECEITAS_CAND_ANOS = [2014, 2016, 2018, 2020, 2022, 2024];
const DESPESAS_CONTRATADAS_ANOS = [2018, 2020, 2022, 2024];
const DESPESAS_PAGAS_ANOS = [2018, 2020, 2022, 2024];
const PESQUISA_ELEITORAL_ANOS = [2024];
const PESQUISA_CONTRATANTE_ANOS = [2024];

// Common columns for safe UNION ALL
const CAND_COMMON_COLS = 'ano_eleicao, nr_turno, nm_candidato, nm_urna_candidato, sg_partido, nm_partido, ds_cargo, nm_ue, ds_genero, ds_grau_instrucao, ds_ocupacao, ds_sit_tot_turno, sq_candidato, nr_candidato, nr_cpf_candidato, dt_nascimento, ds_cor_raca, ds_estado_civil, sg_uf_nascimento, ds_situacao_candidatura';
const BENS_COMMON_COLS = 'ano_eleicao, sq_candidato, nr_ordem_bem_candidato, ds_tipo_bem_candidato, ds_bem_candidato, vr_bem_candidato';

function yearTable(base: string, anos: number[], ano?: number | null, commonCols?: string): string {
  if (ano) return `my_db.${base}_${ano}_GO`;
  const cols = commonCols || '*';
  const union = anos.map(a => `SELECT ${cols} FROM my_db.${base}_${a}_GO`).join(' UNION ALL ');
  return `(${union})`;
}

function yearTableNacional(base: string, anos: number[], ano?: number | null): string {
  if (ano) return `my_db.${base}_${ano}`;
  const union = anos.map(a => `SELECT * FROM my_db.${base}_${a}`).join(' UNION ALL ');
  return `(${union})`;
}

/**
 * Table references — use these in SQL queries.
 * Naming: {dataset}_{ano}_GO for state-level, {dataset}_{ano} for national aggregated.
 */
export const MD = {
  // ── Candidatos ──
  candidatos: (ano?: number | null) => yearTable('consulta_cand', CAND_ANOS, ano, CAND_COMMON_COLS),
  candidatosComplementar: (ano: number) => `my_db.consulta_cand_complementar_${ano}_GO`,
  bens: (ano?: number | null) => yearTable('bem_candidato', BENS_ANOS, ano, BENS_COMMON_COLS),
  coligacoes: (ano?: number | null) => yearTable('consulta_coligacao', COLIGACAO_ANOS, ano),
  vagas: (ano?: number | null) => yearTable('consulta_vagas', VAGAS_ANOS, ano),
  redeSocial: () => `my_db.rede_social_candidato_2024_GO`,
  motivoCassacao: () => `my_db.motivo_cassacao_2022_GO`,

  // ── Votação ──
  votacao: (ano?: number | null) => yearTable('votacao_candidato_munzona', VOTACAO_MUNZONA_ANOS, ano),
  votacaoPartido: (ano?: number | null) => yearTable('votacao_partido_munzona', VOTACAO_PARTIDO_ANOS, ano),
  votacaoSecao: (ano: number) => `my_db.votacao_secao_${ano}_GO`,
  detalheVotacaoMunzona: (ano?: number | null) => yearTable('detalhe_votacao_munzona', DETALHE_VOTACAO_MUNZONA_ANOS, ano),
  detalheVotacaoSecao: (ano?: number | null) => yearTable('detalhe_votacao_secao', DETALHE_VOTACAO_SECAO_ANOS, ano),

  // ── Eleitorado ──
  perfilEleitorado: (ano?: number | null) => yearTableNacional('perfil_eleitorado', PERFIL_ELEITORADO_ANOS, ano),
  perfilEleitorSecao: (ano: number) => `my_db.perfil_eleitor_secao_${ano}_GO`,
  eleitoradoLocal: (ano?: number | null) => yearTableNacional('eleitorado_local_votacao', ELEITORADO_LOCAL_ANOS, ano),
  filiacaoPartidaria: () => `my_db.perfil_filiacao_partidaria`,

  // ── Finanças de Campanha ──
  receitas: (ano?: number | null) => yearTable('receitas_candidatos', RECEITAS_CAND_ANOS, ano),
  receitasDoadorOriginario: (ano: number) => `my_db.receitas_candidatos_doador_originario_${ano}_GO`,
  receitasOrgaosPartidarios: (ano: number) => `my_db.receitas_orgaos_partidarios_${ano}_GO`,
  despesasContratadas: (ano?: number | null) => yearTable('despesas_contratadas_candidatos', DESPESAS_CONTRATADAS_ANOS, ano),
  despesasPagas: (ano?: number | null) => yearTable('despesas_pagas_candidatos', DESPESAS_PAGAS_ANOS, ano),
  despesasContratOrgaos: (ano: number) => `my_db.despesas_contratadas_orgaos_partidarios_${ano}_GO`,
  despesasPagasOrgaos: (ano: number) => `my_db.despesas_pagas_orgaos_partidarios_${ano}_GO`,
  receitaAnual: (ano: number) => `my_db.receita_anual_${ano}_GO`,
  despesaAnual: (ano: number) => `my_db.despesa_anual_${ano}_GO`,

  // ── Pesquisas Eleitorais ──
  pesquisaEleitoral: (ano: number) => `my_db.pesquisa_eleitoral_${ano}_GO`,
  pesquisaContratante: (ano: number) => `my_db.pesquisa_contratante_${ano}_GO`,
  pesquisaPagante: (ano: number) => `my_db.pesquisa_pagante_${ano}_GO`,

  // ── Boletim de Urna ──
  boletimUrna2022_1t: () => `my_db.bweb_1t_GO_051020221321`,
  boletimUrna2022_2t: () => `my_db.bweb_2t_GO_311020221535`,
  boletimUrna2024_1t: () => `my_db.bweb_1t_GO_091020241636`,
  boletimUrna2024_2t: () => `my_db.bweb_2t_GO_281020241046`,

  // ── Partidos / Delegados / Órgãos ──
  delegadoPartidario: (partido: string) => `my_db.delegado_partidario_${partido}`,
} as const;

// Re-export year lists
export {
  CAND_ANOS, BENS_ANOS,
  VOTACAO_MUNZONA_ANOS, VOTACAO_PARTIDO_ANOS, VOTACAO_SECAO_ANOS,
  DETALHE_VOTACAO_MUNZONA_ANOS, DETALHE_VOTACAO_SECAO_ANOS,
  COLIGACAO_ANOS, VAGAS_ANOS,
  PERFIL_ELEITORADO_ANOS, PERFIL_ELEITOR_SECAO_ANOS, ELEITORADO_LOCAL_ANOS,
  RECEITAS_CAND_ANOS, DESPESAS_CONTRATADAS_ANOS, DESPESAS_PAGAS_ANOS,
  PESQUISA_ELEITORAL_ANOS, PESQUISA_CONTRATANTE_ANOS,
};

/**
 * Column mapping: MotherDuck (TSE raw) → our app concepts
 */
export const COL = {
  // candidatos
  ano: 'ano_eleicao',
  turno: 'nr_turno',
  nomeCompleto: 'nm_candidato',
  nomeUrna: 'nm_urna_candidato',
  partido: 'sg_partido',
  nomePartido: 'nm_partido',
  cargo: 'ds_cargo',
  municipio: 'nm_ue',
  genero: 'ds_genero',
  escolaridade: 'ds_grau_instrucao',
  ocupacao: 'ds_ocupacao',
  situacaoFinal: 'ds_sit_tot_turno',
  sequencial: 'sq_candidato',
  numero: 'nr_candidato',
  cpf: 'nr_cpf_candidato',
  nascimento: 'dt_nascimento',
  ufNascimento: 'sg_uf_nascimento',
  corRaca: 'ds_cor_raca',
  situacaoCandidatura: 'ds_situacao_candidatura',
  estadoCivil: 'ds_estado_civil',

  // bens
  tipoBem: 'ds_tipo_bem_candidato',
  descBem: 'ds_bem_candidato',
  valorBem: 'vr_bem_candidato',
  valorBemNum: "CAST(REPLACE(vr_bem_candidato, ',', '.') AS DOUBLE)",
  ordemBem: 'nr_ordem_bem_candidato',

  // votacao
  zona: 'nr_zona',
  secao: 'nr_secao',
  votos: 'qt_votos_nominais',
  nmMunicipio: 'nm_municipio',
  nmCandidato: 'nm_urna_candidato',

  // comparecimento / detalhe
  aptos: 'qt_aptos',
  comp: 'qt_comparecimento',
  abst: 'qt_abstencoes',
  brancos: 'qt_votos_brancos',
  nulos: 'qt_votos_nulos',

  // finanças
  valorReceita: 'vr_receita',
  valorDespesaContratada: 'vr_despesa_contratada',
  valorDespesaPaga: 'vr_pagto',
  nomeDoador: 'nm_doador',
  nomeFornecedor: 'nm_fornecedor',
} as const;
