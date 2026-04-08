import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';
import { mdQuery, getTableName, getAnosDisponiveis } from '@/lib/motherduck';

export interface BemItem {
  DS_TIPO_BEM_CANDIDATO: string;
  DS_BEM_CANDIDATO: string;
  VR_BEM_CANDIDATO: string | number;
}

export interface ReceitaItem {
  NM_DOADOR: string;
  VR_RECEITA: string | number;
  DS_ORIGEM_RECEITA: string;
}

export const useBensCandidato = (sq_candidato: string) => {
  const ano = useFilterStore((state) => state.ano);

  return useQuery<{ rows: BemItem[] }, Error>({
    queryKey: ['bens-md', sq_candidato, ano],
    enabled: !!sq_candidato && getAnosDisponiveis('bens').includes(ano),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const t = getTableName('bens', ano);
      const rows = await mdQuery<BemItem>(`SELECT * FROM ${t} WHERE SQ_CANDIDATO = '${sq_candidato}'`);
      return { rows };
    },
  });
};

export const useReceitasCandidato = (sq_candidato: string) => {
  const ano = useFilterStore((state) => state.ano);

  return useQuery<{ rows: ReceitaItem[] }, Error>({
    queryKey: ['receitas-md', sq_candidato, ano],
    enabled: !!sq_candidato && getAnosDisponiveis('receitas').includes(ano),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const t = getTableName('receitas', ano);
      const rows = await mdQuery<ReceitaItem>(`SELECT * FROM ${t} WHERE SQ_CANDIDATO = '${sq_candidato}'`);
      return { rows };
    },
  });
};
