import { supabase } from '@/integrations/supabase/client';

/**
 * Execute a SQL query against MotherDuck via the query-motherduck edge function.
 * Returns typed rows array.
 */
export async function mdQuery<T = Record<string, any>>(sql: string): Promise<T[]> {
  const { data, error } = await supabase.functions.invoke('query-motherduck', {
    body: { query: sql },
  });
  if (error) throw new Error(error.message || 'Erro ao chamar MotherDuck');
  if (data?.error) throw new Error(data.error);
  return (data?.rows || []) as T[];
}

/**
 * MotherDuck table names follow TSE naming: candidatos_YYYY_GO, votacao_munzona_YYYY_GO, etc.
 * The consolidated table "candidatos" unions all years.
 * For year-specific tables, use the _YYYY_GO suffix.
 */
export const MD = {
  candidatos: 'my_db.candidatos',
  bens: 'my_db.bens_candidatos',
  votacao: (ano: number) => `my_db.votacao_munzona_${ano}_GO`,
  votacaoPartido: (ano: number) => `my_db.votacao_partido_munzona_${ano}_GO`,
  comparecimento: (ano: number) => `my_db.comparecimento_munzona_${ano}_GO`,
  comparecimentoSecao: (ano: number) => `my_db.comparecimento_secao_${ano}_GO`,
  perfilEleitorado: (ano: number) => `my_db.perfil_eleitorado_${ano}_GO`,
  eleitoradoLocal: (ano: number) => `my_db.eleitorado_local_${ano}_GO`,
  receitas: (ano: number) => `my_db.receitas_${ano}_GO`,
  despesas: (ano: number) => `my_db.despesas_${ano}_GO`,
  coligacoes: (ano: number) => `my_db.coligacoes_${ano}_GO`,
} as const;

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
  municipio: 'nm_ue',        // município de candidatura
  genero: 'ds_genero',
  escolaridade: 'ds_grau_instrucao',
  ocupacao: 'ds_ocupacao',
  situacaoFinal: 'ds_sit_tot_turno',
  sequencial: 'sq_candidato',
  numero: 'nr_candidato',
  cpf: 'nr_cpf_candidato',
  nascimento: 'dt_nascimento',
  nacionalidade: 'ds_nacionalidade',
  corRaca: 'ds_cor_raca',
  estadoCivil: 'ds_estado_civil',
  fotoUrl: 'nr_candidato', // we'll build URL from nr_candidato

  // bens
  tipoBem: 'ds_tipo_bem_candidato',
  descBem: 'ds_bem_candidato',
  valorBem: 'vr_bem_candidato',
  ordemBem: 'nr_ordem_bem_candidato',

  // votacao
  zona: 'nr_zona',
  votos: 'qt_votos_nominais',
  nmMunicipio: 'nm_municipio',
  nmCandidato: 'nm_urna_candidato',

  // comparecimento
  aptos: 'qt_aptos',
  comp: 'qt_comparecimento',
  abst: 'qt_abstencoes',
  brancos: 'qt_votos_brancos',
  nulos: 'qt_votos_nulos',
} as const;
