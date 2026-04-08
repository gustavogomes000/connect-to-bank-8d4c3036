import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';

export interface BemItem {
  DS_TIPO_BEM_CANDIDATO: string;
  DS_BEM_CANDIDATO: string;
  VR_BEM_CANDIDATO: number;
}

export interface ReceitaItem {
  NM_DOADOR: string;
  VR_RECEITA: number;
  DS_ORIGEM_RECEITA: string;
}

export const useBensCandidato = (sq_candidato: string) => {
  const ano = useFilterStore((state) => state.ano);

  return useQuery<{ status: string; total: number; dados: BemItem[] }, Error>({
    queryKey: ['bens', sq_candidato, ano],
    queryFn: async () => {
      const resp = await fetch(`/api/dados/candidato/${sq_candidato}/bens?ano=${ano}`);
      if (!resp.ok) throw new Error('Falha ao carregar bens do candidato');
      return resp.json();
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useReceitasCandidato = (sq_candidato: string) => {
  const ano = useFilterStore((state) => state.ano);

  return useQuery<{ status: string; total: number; dados: ReceitaItem[] }, Error>({
    queryKey: ['receitas', sq_candidato, ano],
    queryFn: async () => {
      const resp = await fetch(`/api/dados/candidato/${sq_candidato}/receitas?ano=${ano}`);
      if (!resp.ok) throw new Error('Falha ao carregar receitas do candidato');
      return resp.json();
    },
    staleTime: 5 * 60 * 1000,
  });
};
