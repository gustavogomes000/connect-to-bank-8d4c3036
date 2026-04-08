import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';

export interface VotoInteligenciaItem {
  setor: string;
  escola: string;
  zona: number;
  secao: number;
  votos: number;
  total_votos_secao: number;
  dominancia: number;
}

export const useInteligenciaMapa = (sq_candidato: string | null) => {
  const ano = useFilterStore((state) => state.ano);

  return useQuery<{ status: string; total: number; dados: VotoInteligenciaItem[] }, Error>({
    queryKey: ['inteligencia-mapa', sq_candidato, ano],
    queryFn: async () => {
      const resp = await fetch(`/api/inteligencia/mapa-votos?ano=${ano}&sq_candidato=${sq_candidato}`);
      if (!resp.ok) throw new Error('Falha ao carregar mapa de inteligência');
      return resp.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!sq_candidato,
  });
};
