import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FiltrosResultado {
  ano: number;
  turno: number;
  cargo: string | null;
  municipio: string | null;
  candidato: string | null;
  partido: string | null;
  zona: number | null;
}

// ── Fetch distinct filter options ──
export function useOpcoesResultado(ano: number) {
  return useQuery({
    queryKey: ['resultado-opcoes', ano],
    queryFn: async () => {
      const [cidades, cargos, partidos, zonas] = await Promise.all([
        supabase.from('bd_eleicoes_votacao').select('municipio').eq('ano', ano).not('municipio', 'is', null),
        supabase.from('bd_eleicoes_votacao').select('cargo').eq('ano', ano).not('cargo', 'is', null),
        supabase.from('bd_eleicoes_votacao').select('partido').eq('ano', ano).not('partido', 'is', null),
        supabase.from('bd_eleicoes_votacao').select('zona').eq('ano', ano).not('zona', 'is', null),
      ]);
      return {
        cidades: [...new Set((cidades.data || []).map(r => r.municipio as string))].sort(),
        cargos: [...new Set((cargos.data || []).map(r => r.cargo as string))].sort(),
        partidos: [...new Set((partidos.data || []).map(r => r.partido as string))].sort(),
        zonas: [...new Set((zonas.data || []).map(r => r.zona as number))].sort((a, b) => a - b),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ── Fetch candidates for autocomplete ──
export function useCandidatosOpcoes(ano: number, municipio: string | null) {
  return useQuery({
    queryKey: ['resultado-candidatos', ano, municipio],
    queryFn: async () => {
      let q = supabase.from('bd_eleicoes_votacao').select('nome_candidato').eq('ano', ano).not('nome_candidato', 'is', null);
      if (municipio) q = q.eq('municipio', municipio);
      const { data } = await q;
      return [...new Set((data || []).map(r => r.nome_candidato as string))].sort();
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ── Votação por Município ──
export function useVotacaoPorMunicipio(f: FiltrosResultado) {
  return useQuery({
    queryKey: ['resultado-municipio', f],
    queryFn: async () => {
      let q = supabase.from('bd_eleicoes_votacao')
        .select('municipio, total_votos')
        .eq('ano', f.ano).eq('turno', f.turno);
      if (f.cargo) q = q.eq('cargo', f.cargo);
      if (f.partido) q = q.eq('partido', f.partido);
      if (f.candidato) q = q.eq('nome_candidato', f.candidato);
      if (f.zona) q = q.eq('zona', f.zona);
      const { data, error } = await q;
      if (error) throw error;
      const agg: Record<string, number> = {};
      (data || []).forEach(r => {
        if (r.municipio) agg[r.municipio] = (agg[r.municipio] || 0) + (r.total_votos || 0);
      });
      return Object.entries(agg).map(([municipio, votos]) => ({ municipio, votos }))
        .sort((a, b) => b.votos - a.votos);
    },
    enabled: !!f.ano && !!f.turno,
  });
}

// ── Votação por Candidato (top N) ──
export function useVotacaoPorCandidato(f: FiltrosResultado) {
  return useQuery({
    queryKey: ['resultado-candidato', f],
    queryFn: async () => {
      let q = supabase.from('bd_eleicoes_votacao')
        .select('nome_candidato, partido, total_votos')
        .eq('ano', f.ano).eq('turno', f.turno);
      if (f.cargo) q = q.eq('cargo', f.cargo);
      if (f.municipio) q = q.eq('municipio', f.municipio);
      if (f.partido) q = q.eq('partido', f.partido);
      if (f.zona) q = q.eq('zona', f.zona);
      const { data, error } = await q;
      if (error) throw error;
      const agg: Record<string, { votos: number; partido: string }> = {};
      (data || []).forEach(r => {
        if (!r.nome_candidato) return;
        if (!agg[r.nome_candidato]) agg[r.nome_candidato] = { votos: 0, partido: r.partido || '' };
        agg[r.nome_candidato].votos += r.total_votos || 0;
      });
      return Object.entries(agg)
        .map(([nome, d]) => ({ nome, votos: d.votos, partido: d.partido }))
        .sort((a, b) => b.votos - a.votos);
    },
    enabled: !!f.ano && !!f.turno,
  });
}

// ── Votação por Zona ──
export function useVotacaoPorZona(f: FiltrosResultado) {
  return useQuery({
    queryKey: ['resultado-zona', f],
    queryFn: async () => {
      let q = supabase.from('bd_eleicoes_votacao')
        .select('zona, total_votos')
        .eq('ano', f.ano).eq('turno', f.turno);
      if (f.cargo) q = q.eq('cargo', f.cargo);
      if (f.municipio) q = q.eq('municipio', f.municipio);
      if (f.candidato) q = q.eq('nome_candidato', f.candidato);
      if (f.partido) q = q.eq('partido', f.partido);
      const { data, error } = await q;
      if (error) throw error;
      const agg: Record<number, number> = {};
      (data || []).forEach(r => {
        if (r.zona != null) agg[r.zona] = (agg[r.zona] || 0) + (r.total_votos || 0);
      });
      return Object.entries(agg)
        .map(([z, votos]) => ({ zona: Number(z), votos }))
        .sort((a, b) => a.zona - b.zona);
    },
    enabled: !!f.ano && !!f.turno,
  });
}

// ── Votação por Bairro (via comparecimento_secao) ──
export function useVotacaoPorBairro(f: FiltrosResultado) {
  return useQuery({
    queryKey: ['resultado-bairro', f],
    queryFn: async () => {
      let q = supabase.from('bd_eleicoes_comparecimento_secao')
        .select('bairro, comparecimento, eleitorado_apto')
        .eq('ano', f.ano).eq('turno', f.turno);
      if (f.municipio) q = q.eq('municipio', f.municipio);
      if (f.zona) q = q.eq('zona', f.zona);
      const { data, error } = await q;
      if (error) throw error;
      const agg: Record<string, { votos: number; aptos: number }> = {};
      (data || []).forEach(r => {
        const b = r.bairro || 'SEM BAIRRO';
        if (!agg[b]) agg[b] = { votos: 0, aptos: 0 };
        agg[b].votos += r.comparecimento || 0;
        agg[b].aptos += r.eleitorado_apto || 0;
      });
      return Object.entries(agg)
        .map(([bairro, d]) => ({
          bairro,
          votos: d.votos,
          percentual: d.aptos > 0 ? ((d.votos / d.aptos) * 100).toFixed(1) : '0',
        }))
        .sort((a, b) => b.votos - a.votos);
    },
    enabled: !!f.ano && !!f.turno,
  });
}

// ── Votação por Local de Votação ──
export function useVotacaoPorLocal(f: FiltrosResultado) {
  return useQuery({
    queryKey: ['resultado-local', f],
    queryFn: async () => {
      let q = supabase.from('bd_eleicoes_comparecimento_secao')
        .select('local_votacao, comparecimento')
        .eq('ano', f.ano).eq('turno', f.turno);
      if (f.municipio) q = q.eq('municipio', f.municipio);
      if (f.zona) q = q.eq('zona', f.zona);
      const { data, error } = await q;
      if (error) throw error;
      const agg: Record<string, number> = {};
      (data || []).forEach(r => {
        const l = r.local_votacao || 'DESCONHECIDO';
        agg[l] = (agg[l] || 0) + (r.comparecimento || 0);
      });
      return Object.entries(agg)
        .map(([local, votos]) => ({ local, votos }))
        .sort((a, b) => b.votos - a.votos);
    },
    enabled: !!f.ano && !!f.turno,
  });
}

// ── Votação por Partido ──
export function useVotacaoPorPartido(f: FiltrosResultado) {
  return useQuery({
    queryKey: ['resultado-partido', f],
    queryFn: async () => {
      let q = supabase.from('bd_eleicoes_votacao_partido')
        .select('sigla_partido, total_votos, votos_nominais, votos_legenda')
        .eq('ano', f.ano).eq('turno', f.turno);
      if (f.municipio) q = q.eq('municipio', f.municipio);
      if (f.cargo) q = q.eq('cargo', f.cargo);
      if (f.zona) q = q.eq('zona', f.zona);
      const { data, error } = await q;
      if (error) throw error;
      const agg: Record<string, { total: number; nominais: number; legenda: number }> = {};
      (data || []).forEach(r => {
        const p = r.sigla_partido || '?';
        if (!agg[p]) agg[p] = { total: 0, nominais: 0, legenda: 0 };
        agg[p].total += r.total_votos || 0;
        agg[p].nominais += r.votos_nominais || 0;
        agg[p].legenda += r.votos_legenda || 0;
      });
      return Object.entries(agg)
        .map(([partido, d]) => ({ partido, ...d }))
        .sort((a, b) => b.total - a.total);
    },
    enabled: !!f.ano && !!f.turno,
  });
}

// ── Comparecimento geral ──
export function useComparecimento(f: FiltrosResultado) {
  return useQuery({
    queryKey: ['resultado-comparecimento', f],
    queryFn: async () => {
      let q = supabase.from('bd_eleicoes_comparecimento')
        .select('eleitorado_apto, comparecimento, abstencoes, votos_brancos, votos_nulos')
        .eq('ano', f.ano).eq('turno', f.turno);
      if (f.municipio) q = q.eq('municipio', f.municipio);
      if (f.zona) q = q.eq('zona', f.zona);
      const { data, error } = await q;
      if (error) throw error;
      const totals = { aptos: 0, comp: 0, abst: 0, brancos: 0, nulos: 0 };
      (data || []).forEach(r => {
        totals.aptos += r.eleitorado_apto || 0;
        totals.comp += r.comparecimento || 0;
        totals.abst += r.abstencoes || 0;
        totals.brancos += r.votos_brancos || 0;
        totals.nulos += r.votos_nulos || 0;
      });
      return totals;
    },
    enabled: !!f.ano && !!f.turno,
  });
}
