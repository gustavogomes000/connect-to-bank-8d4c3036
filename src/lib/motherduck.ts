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
const CAND_ANOS = [2012, 2014, 2016, 2018, 2020, 2022, 2024];
const BENS_ANOS = [2014, 2016, 2018, 2020, 2022, 2024];
const COMP_ANOS = [2014, 2016, 2018, 2020, 2022, 2024];
const VOTACAO_ANOS = [2012, 2014, 2016, 2018, 2020, 2022, 2024];
const PERFIL_ANOS = [2018, 2020, 2022, 2024];

/**
 * Generate table reference for year-specific tables.
 * When ano is given: returns single table.
 * When ano is null: returns UNION ALL subquery.
 */
function yearTable(base: string, anos: number[], ano?: number | null): string {
  if (ano) return `my_db.${base}_${ano}_GO`;
  const union = anos.map(a => `SELECT * FROM my_db.${base}_${a}_GO`).join(' UNION ALL ');
  return `(${union})`;
}

/**
 * Table references — use these in SQL queries.
 * For year-specific tables, pass the ano parameter.
 */
export const MD = {
  /** Candidatos — year-specific or union */
  candidatos: (ano?: number | null) => yearTable('candidatos', CAND_ANOS, ano),
  /** Bens declarados */
  bens: (ano?: number | null) => yearTable('bens_candidatos', BENS_ANOS, ano),
  /** Votação por município/zona */
  votacao: (ano: number) => `my_db.votacao_munzona_${ano}_GO`,
  /** Votação por partido */
  votacaoPartido: (ano: number) => `my_db.votacao_partido_munzona_${ano}_GO`,
  /** Comparecimento por município/zona */
  comparecimento: (ano: number) => `my_db.comparecimento_munzona_${ano}_GO`,
  /** Comparecimento por seção */
  comparecimentoSecao: (ano: number) => `my_db.comparecimento_abstencao_${ano}_GO`,
  /** Perfil eleitorado */
  perfilEleitorado: (ano: number) => `my_db.perfil_eleitorado_${ano}_GO`,
  /** Eleitorado por local */
  eleitoradoLocal: (ano: number) => `my_db.eleitorado_local_${ano}_GO`,
  /** Receitas de campanha */
  receitas: (ano: number) => `my_db.receitas_${ano}_GO`,
  /** Despesas contratadas */
  despesas: (ano: number) => `my_db.despesas_contratadas_${ano}_GO`,
  /** Coligações */
  coligacoes: (ano: number) => `my_db.coligacoes_${ano}_GO`,
  /** Vagas */
  vagas: (ano: number) => `my_db.vagas_${ano}_GO`,
} as const;

// Re-export year lists
export { CAND_ANOS, BENS_ANOS, COMP_ANOS, VOTACAO_ANOS, PERFIL_ANOS };

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
  nacionalidade: 'ds_nacionalidade',
  corRaca: 'ds_cor_raca',
  estadoCivil: 'ds_estado_civil',

  // bens
  tipoBem: 'ds_tipo_bem_candidato',
  descBem: 'ds_bem_candidato',
  valorBem: 'vr_bem_candidato',         // VARCHAR in MotherDuck! Use CAST.
  valorBemNum: 'CAST(vr_bem_candidato AS DOUBLE)', // Use this for SUM/AVG
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
