import { supabase } from '@/integrations/supabase/client';
import { useFilterStore } from '@/stores/filterStore';
import { useQuery } from '@tanstack/react-query';

// Tabela principal de votos agora é bd_eleicoes_votacao_munzona
const TABELA_VOTOS = 'bd_eleicoes_votacao_munzona' as any;
const TABELA_CANDIDATOS = 'bd_eleicoes_candidatos' as any;
const TABELA_COMPARECIMENTO = 'bd_eleicoes_comparecimento' as any;

type TableType = 'votacao' | 'candidatos' | 'comparecimento';

function applyFilters(query: any, filters: { ano: number | null; turno: number | null; cargo: string | null; municipio: string | null; partido: string | null }, table: TableType) {
  if (filters.ano) query = query.eq('ano', filters.ano);
  if (filters.turno) query = query.eq('turno', filters.turno);
  if (table !== 'comparecimento') {
    if (filters.cargo) query = query.ilike('cargo', filters.cargo);
    if (filters.partido) {
      // votacao_munzona usa sigla_partido, candidatos usa sigla_partido
      query = query.eq('sigla_partido', filters.partido);
    }
  }
  if (filters.municipio) query = query.eq('municipio', filters.municipio);
  return query;
}

export function useKPIs() {
  const { ano, turno, cargo, municipio, partido } = useFilterStore();
  const filters = { ano, turno, cargo, municipio, partido };

  return useQuery({
    queryKey: ['kpis', filters],
    queryFn: async () => {
      // Count candidates
      let cq = supabase.from(TABELA_CANDIDATOS).select('id', { count: 'exact', head: true });
      cq = applyFilters(cq, filters, 'candidatos');
      const { count: totalCandidatos } = await cq;

      // Total votes - paginate through all results
      let totalVotos = 0;
      let page = 0;
      const pageSize = 1000;
      while (true) {
        let q = supabase.from(TABELA_VOTOS).select('total_votos').range(page * pageSize, (page + 1) * pageSize - 1);
        q = applyFilters(q, filters, 'votacao');
        const { data } = await q;
        if (!data || data.length === 0) break;
        totalVotos += data.reduce((sum: number, r: any) => sum + (r.total_votos || 0), 0);
        if (data.length < pageSize) break;
        page++;
      }

      // Count elected
      let eq2 = supabase.from(TABELA_CANDIDATOS).select('id', { count: 'exact', head: true }).ilike('situacao_final', '%ELEITO%').not('situacao_final', 'ilike', '%NÃO ELEITO%');
      eq2 = applyFilters(eq2, filters, 'candidatos');
      const { count: totalEleitos } = await eq2;

      // Comparecimento - paginate
      let totalApto = 0;
      let totalComp = 0;
      let compPage = 0;
      while (true) {
        let compQ = supabase.from(TABELA_COMPARECIMENTO).select('eleitorado_apto, comparecimento').range(compPage * pageSize, (compPage + 1) * pageSize - 1);
        compQ = applyFilters(compQ, filters, 'comparecimento');
        const { data: compData } = await compQ;
        if (!compData || compData.length === 0) break;
        totalApto += compData.reduce((s: number, r: any) => s + (r.eleitorado_apto || 0), 0);
        totalComp += compData.reduce((s: number, r: any) => s + (r.comparecimento || 0), 0);
        if (compData.length < pageSize) break;
        compPage++;
      }
      const pctComparecimento = totalApto > 0 ? (totalComp / totalApto) * 100 : 0;

      return {
        totalCandidatos: totalCandidatos || 0,
        totalVotos,
        totalEleitos: totalEleitos || 0,
        pctComparecimento,
      };
    },
  });
}

export function useTop10Votados() {
  const { ano, turno, cargo, municipio, partido } = useFilterStore();
  const filters = { ano, turno, cargo, municipio, partido };

  return useQuery({
    queryKey: ['top10', filters],
    queryFn: async () => {
      // Aggregate votes by candidate from munzona table
      let q = supabase.from(TABELA_VOTOS).select('nome_candidato, sigla_partido, total_votos').order('total_votos', { ascending: false }).limit(100);
      q = applyFilters(q, filters, 'votacao');
      const { data } = await q;
      
      // Aggregate by candidate name
      const map = new Map<string, { nome_candidato: string; partido: string; total_votos: number }>();
      (data || []).forEach((r: any) => {
        const key = r.nome_candidato;
        const cur = map.get(key);
        if (cur) {
          cur.total_votos += r.total_votos || 0;
        } else {
          map.set(key, { nome_candidato: r.nome_candidato, partido: r.sigla_partido, total_votos: r.total_votos || 0 });
        }
      });

      return Array.from(map.values())
        .sort((a, b) => b.total_votos - a.total_votos)
        .slice(0, 10);
    },
  });
}

export function useVotosPorPartido() {
  const { ano, turno, cargo, municipio, partido } = useFilterStore();
  const filters = { ano, turno, cargo, municipio, partido };

  return useQuery({
    queryKey: ['votosPorPartido', filters],
    queryFn: async () => {
      // Use votacao_partido table for accurate party totals
      let q = supabase.from('bd_eleicoes_votacao_partido' as any).select('sigla_partido, total_votos');
      if (filters.ano) q = q.eq('ano', filters.ano);
      if (filters.turno) q = q.eq('turno', filters.turno);
      if (filters.cargo) q = q.ilike('cargo', filters.cargo);
      if (filters.municipio) q = q.eq('municipio', filters.municipio);
      if (filters.partido) q = q.eq('sigla_partido', filters.partido);
      const { data } = await q.limit(1000);
      
      const map = new Map<string, number>();
      (data || []).forEach((r: any) => {
        const p = r.sigla_partido || 'OUTROS';
        map.set(p, (map.get(p) || 0) + (r.total_votos || 0));
      });

      return Array.from(map.entries())
        .map(([partido, votos]) => ({ partido, votos }))
        .sort((a, b) => b.votos - a.votos);
    },
  });
}

export function useComparecimentoPorAno() {
  const { municipio } = useFilterStore();

  return useQuery({
    queryKey: ['comparecimentoAno', municipio],
    queryFn: async () => {
      let q = supabase.from(TABELA_COMPARECIMENTO).select('ano, eleitorado_apto, comparecimento');
      if (municipio) q = q.eq('municipio', municipio);
      const { data } = await q.limit(1000);

      const map = new Map<number, { apto: number; comp: number }>();
      (data || []).forEach((r: any) => {
        const cur = map.get(r.ano) || { apto: 0, comp: 0 };
        cur.apto += r.eleitorado_apto || 0;
        cur.comp += r.comparecimento || 0;
        map.set(r.ano, cur);
      });

      return Array.from(map.entries())
        .map(([ano, v]) => ({ ano, eleitorado: v.apto, comparecimento: v.comp }))
        .sort((a, b) => a.ano - b.ano);
    },
  });
}

export function useEleitos() {
  const { ano, turno, cargo, municipio, partido } = useFilterStore();
  const filters = { ano, turno, cargo, municipio, partido };

  return useQuery({
    queryKey: ['eleitos', filters],
    queryFn: async () => {
      let q = supabase.from(TABELA_CANDIDATOS).select('*').ilike('situacao_final', '%ELEITO%').not('situacao_final', 'ilike', '%NÃO ELEITO%').order('nome_urna').limit(8);
      q = applyFilters(q, filters, 'candidatos');
      const { data } = await q;
      return data || [];
    },
  });
}

export function useRanking(search: string, page: number, sortBy: string, sortAsc: boolean) {
  const { ano, turno, cargo, municipio, partido } = useFilterStore();
  const filters = { ano, turno, cargo, municipio, partido };
  const pageSize = 20;

  return useQuery({
    queryKey: ['ranking', filters, search, page, sortBy, sortAsc],
    queryFn: async () => {
      let q = supabase.from(TABELA_VOTOS).select('*', { count: 'exact' });
      q = applyFilters(q, filters, 'votacao');
      if (search) q = q.ilike('nome_candidato', `%${search}%`);
      q = q.order(sortBy, { ascending: sortAsc });
      q = q.range(page * pageSize, (page + 1) * pageSize - 1);
      const { data, count } = await q;
      return { data: data || [], count: count || 0, pageSize };
    },
  });
}

export function useCandidato(id: string) {
  return useQuery({
    queryKey: ['candidato', id],
    queryFn: async () => {
      const { data } = await (supabase.from(TABELA_CANDIDATOS) as any).select('*').eq('id', parseInt(id)).single();
      return data;
    },
    enabled: !!id,
  });
}

export function useCandidatoVotos(nomeCandidato: string, ano: number) {
  return useQuery({
    queryKey: ['candidatoVotos', nomeCandidato, ano],
    queryFn: async () => {
      const { data } = await (supabase.from(TABELA_VOTOS) as any).select('*').eq('nome_candidato', nomeCandidato).eq('ano', ano).order('total_votos', { ascending: false });
      return data || [];
    },
    enabled: !!nomeCandidato,
  });
}

export function useCandidatoHistorico(nomeUrna: string, numeroUrna: number, partido: string) {
  return useQuery({
    queryKey: ['candidatoHistorico', nomeUrna, numeroUrna],
    queryFn: async () => {
      const { data } = await (supabase.from(TABELA_CANDIDATOS) as any).select('*').or(`nome_urna.eq.${nomeUrna},nome_completo.eq.${nomeUrna}`).order('ano');
      return data || [];
    },
    enabled: !!nomeUrna,
  });
}

export function useMunicipios() {
  return useQuery({
    queryKey: ['municipiosLista'],
    queryFn: async () => {
      const { data } = await (supabase.from(TABELA_VOTOS) as any).select('municipio').limit(1000);
      const unique = [...new Set((data || []).map((r: any) => r.municipio).filter(Boolean))].sort();
      return unique as string[];
    },
  });
}

export function usePartidos() {
  return useQuery({
    queryKey: ['partidosLista'],
    queryFn: async () => {
      const { data } = await (supabase.from(TABELA_VOTOS) as any).select('sigla_partido').limit(1000);
      const unique = [...new Set((data || []).map((r: any) => r.sigla_partido).filter(Boolean))].sort();
      return unique as string[];
    },
  });
}

export function useImportLogs() {
  return useQuery({
    queryKey: ['importLogs'],
    queryFn: async () => {
      const { data } = await (supabase.from('bd_eleicoes_importacoes_log' as any) as any).select('*').order('created_at', { ascending: false }).limit(50);
      return data || [];
    },
  });
}

export function useCheckEmpty() {
  return useQuery({
    queryKey: ['checkEmpty'],
    queryFn: async () => {
      const { count } = await (supabase.from(TABELA_VOTOS) as any).select('id', { count: 'exact', head: true });
      return (count || 0) === 0;
    },
  });
}
