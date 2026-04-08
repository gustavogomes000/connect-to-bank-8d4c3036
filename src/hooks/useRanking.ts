import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/store/filterStore';

export interface RankingItem {
  SQ_CANDIDATO: string;
  NM_CANDIDATO: string;
  NM_PARTIDO: string;
  DS_CARGO: string;
  NM_MUNICIPIO_NASCIMENTO: string | null;
  DS_SIT_TOT_TURNO: string;
  total_votos: number;
}

export interface RankingResponse {
  status: string;
  total_registros: number;
  dados: RankingItem[];
}

export const useRanking = () => {
  // Lendo apenas os filtros que o backend de ranking suporta inicialmente
  const ano = useFilterStore((state) => state.ano);
  const municipio = useFilterStore((state) => state.municipio);
  const cargo = useFilterStore((state) => state.cargo);

  return useQuery<RankingResponse, Error>({
    queryKey: ['ranking', { ano, municipio, cargo }],
    queryFn: async () => {
      // payload baseado na classe RankingPayload (FastAPI)
      const payload: Record<string, string | number> = { ano };
      
      if (municipio) {
        payload.municipio = municipio;
      }
      if (cargo) {
        payload.cargo = cargo;
      }

      const response = await fetch('/api/dados/ranking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar dados do Motor Analítico');
      }

      return response.json();
    },
    // Executa a query de forma passiva se precisar, mas com staleTime pra cachear consultas iguais
    staleTime: 1000 * 60 * 5, // 5 minutos de cache front-end
  });
};
