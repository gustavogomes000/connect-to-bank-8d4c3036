import { supabase } from '@/integrations/supabase/client';
import { useFilterStore } from '@/stores/filterStore';
import { useQuery } from '@tanstack/react-query';

const TABELA_VOTOS = 'bd_eleicoes_votacao_munzona' as any;
const TABELA_CANDIDATOS = 'bd_eleicoes_candidatos' as any;
const TABELA_COMPARECIMENTO = 'bd_eleicoes_comparecimento' as any;
const TABELA_BENS = 'bd_eleicoes_bens_candidatos' as any;
const TABELA_SECAO = 'bd_eleicoes_votacao_secao' as any;
const TABELA_COMP_SECAO = 'bd_eleicoes_comparecimento_secao' as any;

type TableType = 'votacao' | 'candidatos' | 'comparecimento';

function applyFilters(query: any, filters: { ano: number | null; turno: number | null; cargo: string | null; municipio: string | null; partido: string | null }, table: TableType) {
  if (filters.ano) query = query.eq('ano', filters.ano);
  if (filters.turno) query = query.eq('turno', filters.turno);
  if (table !== 'comparecimento') {
    if (filters.cargo) query = query.ilike('cargo', filters.cargo);
    if (filters.partido) query = query.eq('sigla_partido', filters.partido);
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
      // Count candidatos - fetch minimal data
      let cq = (supabase.from(TABELA_CANDIDATOS) as any).select('id, situacao_final').limit(1000);
      cq = applyFilters(cq, filters, 'candidatos');

      // Comparecimento
      let compQ = (supabase.from(TABELA_COMPARECIMENTO) as any).select('eleitorado_apto, comparecimento').limit(1000);
      compQ = applyFilters(compQ, filters, 'comparecimento');

      // Run in parallel
      const [candRes, compRes] = await Promise.all([cq, compQ]);

      const candData = candRes.data || [];
      const totalCandidatos = candData.length;
      const totalEleitos = candData.filter((c: any) => {
        const s = (c.situacao_final || '').toUpperCase();
        return s.includes('ELEITO') && !s.includes('NÃO ELEITO');
      }).length;

      let totalApto = 0, totalComp = 0;
      (compRes.data || []).forEach((r: any) => {
        totalApto += r.eleitorado_apto || 0;
        totalComp += r.comparecimento || 0;
      });
      const pctComparecimento = totalApto > 0 ? (totalComp / totalApto) * 100 : 0;

      // Total votos: use votacao_munzona with limit
      let vq = supabase.from(TABELA_VOTOS).select('total_votos').limit(1000);
      if (filters.ano) vq = vq.eq('ano', filters.ano);
      if (filters.turno) vq = vq.eq('turno', filters.turno);
      if (filters.cargo) vq = (vq as any).ilike('cargo', filters.cargo);
      if (filters.municipio) vq = vq.eq('municipio', filters.municipio);
      if (filters.partido) vq = vq.eq('sigla_partido', filters.partido);
      const { data: votosData } = await vq;
      const totalVotos = (votosData || []).reduce((sum: number, r: any) => sum + (r.total_votos || 0), 0);

      return { totalCandidatos, totalVotos, totalEleitos, pctComparecimento };
    },
  });
}

export function useTop10Votados() {
  const { ano, turno, cargo, municipio, partido } = useFilterStore();
  const filters = { ano, turno, cargo, municipio, partido };

  return useQuery({
    queryKey: ['top10', filters],
    queryFn: async () => {
      let q = supabase.from(TABELA_VOTOS).select('nome_candidato, sigla_partido, total_votos').order('total_votos', { ascending: false }).limit(100);
      q = applyFilters(q, filters, 'votacao');
      const { data } = await q;
      
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

      return Array.from(map.values()).sort((a, b) => b.total_votos - a.total_votos).slice(0, 10);
    },
  });
}

export function useVotosPorPartido() {
  const { ano, turno, cargo, municipio, partido } = useFilterStore();
  const filters = { ano, turno, cargo, municipio, partido };

  return useQuery({
    queryKey: ['votosPorPartido', filters],
    queryFn: async () => {
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

      return Array.from(map.entries()).map(([partido, votos]) => ({ partido, votos })).sort((a, b) => b.votos - a.votos);
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

      return Array.from(map.entries()).map(([ano, v]) => ({ ano, eleitorado: v.apto, comparecimento: v.comp })).sort((a, b) => a.ano - b.ano);
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

// Pull municipios from candidatos table (has data) + votacao_munzona as fallback
export function useMunicipios() {
  return useQuery({
    queryKey: ['municipiosLista'],
    queryFn: async () => {
      // Try candidatos first (always has data)
      const { data: d1 } = await (supabase.from(TABELA_CANDIDATOS) as any).select('municipio').not('municipio', 'is', null).limit(1000);
      const { data: d2 } = await (supabase.from(TABELA_VOTOS) as any).select('municipio').not('municipio', 'is', null).limit(1000);
      const all = [...(d1 || []), ...(d2 || [])].map((r: any) => r.municipio).filter(Boolean);
      const unique = [...new Set(all)].sort();
      return unique as string[];
    },
  });
}

// Pull partidos from candidatos table + votacao
export function usePartidos() {
  return useQuery({
    queryKey: ['partidosLista'],
    queryFn: async () => {
      const { data: d1 } = await (supabase.from(TABELA_CANDIDATOS) as any).select('sigla_partido').not('sigla_partido', 'is', null).limit(1000);
      const { data: d2 } = await (supabase.from(TABELA_VOTOS) as any).select('sigla_partido').not('sigla_partido', 'is', null).limit(1000);
      const all = [...(d1 || []), ...(d2 || [])].map((r: any) => r.sigla_partido).filter(Boolean);
      const unique = [...new Set(all)].sort();
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
      // Check candidatos (always imported first)
      const { count } = await (supabase.from(TABELA_CANDIDATOS) as any).select('*', { count: 'exact', head: true });
      return (count || 0) === 0;
    },
  });
}

// ═══════════════════════════════════════════
// NEW BI HOOKS
// ═══════════════════════════════════════════

// Patrimônio de candidato (bens declarados)
export function usePatrimonioCandidato(sequencialCandidato: string) {
  return useQuery({
    queryKey: ['patrimonio', sequencialCandidato],
    queryFn: async () => {
      const { data } = await (supabase.from(TABELA_BENS) as any)
        .select('*')
        .eq('sequencial_candidato', sequencialCandidato)
        .order('ordem_bem');
      return data || [];
    },
    enabled: !!sequencialCandidato,
  });
}

// Evolução patrimonial por candidato (agrupa por ano)
export function useEvolucaoPatrimonio(nomeUrna: string) {
  return useQuery({
    queryKey: ['evolucaoPatrimonio', nomeUrna],
    queryFn: async () => {
      if (!nomeUrna) return [];
      // Find all sequenciais for this candidate
      const { data: cands } = await (supabase.from(TABELA_CANDIDATOS) as any)
        .select('ano, sequencial_candidato, nome_urna')
        .eq('nome_urna', nomeUrna);
      
      if (!cands || cands.length === 0) return [];
      
      const seqs = cands.map((c: any) => c.sequencial_candidato).filter(Boolean);
      if (seqs.length === 0) return [];

      const { data: bens } = await (supabase.from(TABELA_BENS) as any)
        .select('ano, sequencial_candidato, valor_bem')
        .in('sequencial_candidato', seqs);
      
      // Aggregate by ano
      const map = new Map<number, number>();
      (bens || []).forEach((b: any) => {
        map.set(b.ano, (map.get(b.ano) || 0) + (b.valor_bem || 0));
      });

      return Array.from(map.entries())
        .map(([ano, total]) => ({ ano, patrimonio: total }))
        .sort((a, b) => a.ano - b.ano);
    },
    enabled: !!nomeUrna,
  });
}

// Votos por bairro (usando comparecimento_secao que tem bairro)
export function useVotosPorBairro(municipio: string, ano?: number) {
  return useQuery({
    queryKey: ['votosBairro', municipio, ano],
    queryFn: async () => {
      let q = (supabase.from(TABELA_COMP_SECAO) as any)
        .select('bairro, eleitorado_apto, comparecimento, abstencoes')
        .eq('municipio', municipio)
        .not('bairro', 'is', null);
      if (ano) q = q.eq('ano', ano);
      const { data } = await q.limit(1000);

      const map = new Map<string, { bairro: string; apto: number; comp: number; abst: number }>();
      (data || []).forEach((r: any) => {
        const b = (r.bairro || 'SEM BAIRRO').trim();
        const cur = map.get(b) || { bairro: b, apto: 0, comp: 0, abst: 0 };
        cur.apto += r.eleitorado_apto || 0;
        cur.comp += r.comparecimento || 0;
        cur.abst += r.abstencoes || 0;
        map.set(b, cur);
      });

      return Array.from(map.values()).sort((a, b) => b.apto - a.apto);
    },
    enabled: !!municipio,
  });
}

// Votos por local de votação (escola) em um município
export function useVotosPorLocal(municipio: string, ano?: number, bairro?: string) {
  return useQuery({
    queryKey: ['votosLocal', municipio, ano, bairro],
    queryFn: async () => {
      let q = (supabase.from(TABELA_COMP_SECAO) as any)
        .select('local_votacao, bairro, endereco, eleitorado_apto, comparecimento')
        .eq('municipio', municipio)
        .not('local_votacao', 'is', null);
      if (ano) q = q.eq('ano', ano);
      if (bairro) q = q.eq('bairro', bairro);
      const { data } = await q.limit(1000);

      const map = new Map<string, { local: string; bairro: string; endereco: string; apto: number; comp: number }>();
      (data || []).forEach((r: any) => {
        const key = r.local_votacao;
        const cur = map.get(key) || { local: key, bairro: r.bairro || '', endereco: r.endereco || '', apto: 0, comp: 0 };
        cur.apto += r.eleitorado_apto || 0;
        cur.comp += r.comparecimento || 0;
        map.set(key, cur);
      });

      return Array.from(map.values()).sort((a, b) => b.apto - a.apto);
    },
    enabled: !!municipio,
  });
}

// Votos de um candidato por seção (granular)
export function useVotosCandidatoSecao(nomeCandidato: string, municipio: string, ano: number) {
  return useQuery({
    queryKey: ['votosCandSecao', nomeCandidato, municipio, ano],
    queryFn: async () => {
      const { data } = await (supabase.from(TABELA_SECAO) as any)
        .select('zona, secao, total_votos')
        .eq('nome_candidato', nomeCandidato)
        .eq('municipio', municipio)
        .eq('ano', ano)
        .order('total_votos', { ascending: false })
        .limit(500);
      return data || [];
    },
    enabled: !!nomeCandidato && !!municipio && !!ano,
  });
}

// Perfil dos candidatos (faixa etária, gênero, instrução, ocupação)
export function usePerfilCandidatos() {
  const { ano, cargo, municipio, partido } = useFilterStore();
  
  return useQuery({
    queryKey: ['perfilCandidatos', ano, cargo, municipio, partido],
    queryFn: async () => {
      let q = (supabase.from(TABELA_CANDIDATOS) as any)
        .select('genero, grau_instrucao, ocupacao, data_nascimento');
      if (ano) q = q.eq('ano', ano);
      if (cargo) q = q.ilike('cargo', cargo);
      if (municipio) q = q.eq('municipio', municipio);
      if (partido) q = q.eq('sigla_partido', partido);
      const { data } = await q.limit(1000);

      // Aggregate by gender
      const generos = new Map<string, number>();
      const instrucoes = new Map<string, number>();
      const ocupacoes = new Map<string, number>();

      (data || []).forEach((r: any) => {
        const g = r.genero || 'NÃO INFORMADO';
        generos.set(g, (generos.get(g) || 0) + 1);
        const i = r.grau_instrucao || 'NÃO INFORMADO';
        instrucoes.set(i, (instrucoes.get(i) || 0) + 1);
        const o = r.ocupacao || 'NÃO INFORMADO';
        ocupacoes.set(o, (ocupacoes.get(o) || 0) + 1);
      });

      return {
        generos: Array.from(generos.entries()).map(([k, v]) => ({ nome: k, total: v })).sort((a, b) => b.total - a.total),
        instrucoes: Array.from(instrucoes.entries()).map(([k, v]) => ({ nome: k, total: v })).sort((a, b) => b.total - a.total),
        ocupacoes: Array.from(ocupacoes.entries()).map(([k, v]) => ({ nome: k, total: v })).sort((a, b) => b.total - a.total).slice(0, 15),
      };
    },
  });
}

// Bens: top candidatos mais ricos
export function useTopPatrimonio(ano?: number) {
  return useQuery({
    queryKey: ['topPatrimonio', ano],
    queryFn: async () => {
      let q = (supabase.from(TABELA_BENS) as any)
        .select('sequencial_candidato, nome_candidato, sigla_partido, cargo, valor_bem, ano');
      if (ano) q = q.eq('ano', ano);
      const { data } = await q.limit(1000);

      const map = new Map<string, { seq: string; nome: string; partido: string; cargo: string; total: number }>();
      (data || []).forEach((r: any) => {
        const key = r.sequencial_candidato || r.nome_candidato || '';
        const cur = map.get(key) || { seq: r.sequencial_candidato, nome: r.nome_candidato || 'N/A', partido: r.sigla_partido || '', cargo: r.cargo || '', total: 0 };
        cur.total += r.valor_bem || 0;
        map.set(key, cur);
      });

      return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 20);
    },
  });
}
