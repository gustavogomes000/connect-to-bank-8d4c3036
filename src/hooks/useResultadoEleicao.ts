import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FiltrosResultado {
  ano: number;
  turno: number;
  cargo: string | null;
  partido: string | null;
  genero: string | null;
  situacao: string | null;
}

/** Paginated fetch — overcomes the 1000-row Supabase limit */
async function fetchAll<T>(
  buildQuery: (from: number, to: number) => any,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// ── Fetch distinct filter options ──
export function useOpcoesResultado(ano: number) {
  return useQuery({
    queryKey: ['resultado-opcoes', ano],
    queryFn: async () => {
      const [cargos, partidos, situacoes, generos] = await Promise.all([
        supabase.from('bd_eleicoes_candidatos').select('cargo').eq('ano', ano).not('cargo', 'is', null).limit(1000),
        supabase.from('bd_eleicoes_candidatos').select('sigla_partido').eq('ano', ano).not('sigla_partido', 'is', null).limit(1000),
        supabase.from('bd_eleicoes_candidatos').select('situacao_final').eq('ano', ano).not('situacao_final', 'is', null).limit(1000),
        supabase.from('bd_eleicoes_candidatos').select('genero').eq('ano', ano).not('genero', 'is', null).limit(1000),
      ]);
      return {
        cargos: [...new Set((cargos.data || []).map(r => r.cargo as string))].sort(),
        partidos: [...new Set((partidos.data || []).map(r => r.sigla_partido as string))].sort(),
        situacoes: [...new Set((situacoes.data || []).map(r => r.situacao_final as string))].sort(),
        generos: [...new Set((generos.data || []).map(r => r.genero as string))].sort(),
      };
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ── Candidatos completos (paginado) ──
export function useCandidatosCompletos(f: FiltrosResultado) {
  return useQuery({
    queryKey: ['resultado-candidatos-full', f],
    queryFn: async () => {
      type Row = {
        nome_urna: string | null;
        nome_completo: string | null;
        sigla_partido: string | null;
        cargo: string | null;
        situacao_final: string | null;
        genero: string | null;
        grau_instrucao: string | null;
        ocupacao: string | null;
        sequencial_candidato: string | null;
      };
      const rows = await fetchAll<Row>((from, to) => {
        let q = supabase.from('bd_eleicoes_candidatos')
          .select('nome_urna, nome_completo, sigla_partido, cargo, situacao_final, genero, grau_instrucao, ocupacao, sequencial_candidato')
          .eq('ano', f.ano).eq('turno', f.turno)
          .range(from, to);
        if (f.cargo) q = q.eq('cargo', f.cargo);
        if (f.partido) q = q.eq('sigla_partido', f.partido);
        if (f.genero) q = q.eq('genero', f.genero);
        if (f.situacao) q = q.eq('situacao_final', f.situacao);
        return q;
      });
      return rows;
    },
    enabled: !!f.ano && !!f.turno,
  });
}

// ── Bens por sequencial (paginado) ──
export function useBensCandidatos(ano: number) {
  return useQuery({
    queryKey: ['resultado-bens', ano],
    queryFn: async () => {
      type Row = { sequencial_candidato: string | null; valor_bem: number | null };
      const rows = await fetchAll<Row>((from, to) =>
        supabase.from('bd_eleicoes_bens_candidatos')
          .select('sequencial_candidato, valor_bem')
          .eq('ano', ano)
          .range(from, to)
      );
      // Aggregate by sequencial
      const agg: Record<string, number> = {};
      rows.forEach(r => {
        if (r.sequencial_candidato) {
          agg[r.sequencial_candidato] = (agg[r.sequencial_candidato] || 0) + (r.valor_bem || 0);
        }
      });
      return agg;
    },
    staleTime: 10 * 60 * 1000,
  });
}
