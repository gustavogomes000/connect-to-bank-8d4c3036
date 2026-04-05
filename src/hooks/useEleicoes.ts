import { supabase } from '@/integrations/supabase/client';
import { useFilterStore } from '@/stores/filterStore';
import { useQuery } from '@tanstack/react-query';

const TABELA_CANDIDATOS = 'bd_eleicoes_candidatos' as any;
const TABELA_BENS = 'bd_eleicoes_bens_candidatos' as any;
const TABELA_VOTACAO = 'bd_eleicoes_votacao' as any;
const TABELA_VOTACAO_PARTIDO = 'bd_eleicoes_votacao_partido' as any;
const TABELA_COMPARECIMENTO = 'bd_eleicoes_comparecimento' as any;
const TABELA_COMPARECIMENTO_SECAO = 'bd_eleicoes_comparecimento_secao' as any;
const TABELA_LOCAIS = 'bd_eleicoes_locais_votacao' as any;

type Filters = { ano: number | null; turno: number | null; cargo: string | null; municipio: string | null; partido: string | null };

function applyFilters(query: any, f: Filters, skipMunicipio = false) {
  if (f.ano) query = query.eq('ano', f.ano);
  if (f.turno) query = query.eq('turno', f.turno);
  if (f.cargo) query = query.ilike('cargo', f.cargo);
  if (f.partido) query = query.eq('sigla_partido', f.partido);
  if (!skipMunicipio && f.municipio) query = query.eq('municipio', f.municipio);
  return query;
}

// ═══ HELPERS ═══
async function fetchAll(baseQuery: any, pageSize = 1000) {
  const results: any[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await baseQuery.range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < pageSize) break;
    page++;
  }
  return results;
}

async function tableHasData(table: string, filters?: { ano?: number }): Promise<boolean> {
  let q = (supabase.from(table as any) as any).select('id', { count: 'exact', head: true });
  if (filters?.ano) q = q.eq('ano', filters.ano);
  const { count } = await q;
  return (count || 0) > 0;
}

// ═══ DATA AVAILABILITY CHECK ═══
export function useDataAvailability() {
  return useQuery({
    queryKey: ['dataAvailability'],
    queryFn: async () => {
      const [candidatos, bens, votacao, votacaoPartido, comparecimento, comparecimentoSecao, locais] = await Promise.all([
        tableHasData('bd_eleicoes_candidatos'),
        tableHasData('bd_eleicoes_bens_candidatos'),
        tableHasData('bd_eleicoes_votacao'),
        tableHasData('bd_eleicoes_votacao_partido'),
        tableHasData('bd_eleicoes_comparecimento'),
        tableHasData('bd_eleicoes_comparecimento_secao'),
        tableHasData('bd_eleicoes_locais_votacao'),
      ]);
      return { candidatos, bens, votacao, votacaoPartido, comparecimento, comparecimentoSecao, locais };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ═══ CHECK EMPTY ═══
export function useCheckEmpty() {
  return useQuery({
    queryKey: ['checkEmpty'],
    queryFn: async () => {
      const { count } = await (supabase.from(TABELA_CANDIDATOS) as any).select('*', { count: 'exact', head: true });
      return (count || 0) === 0;
    },
  });
}

// ═══ KPIs DASHBOARD ═══
export function useKPIs() {
  const filters = useFilterStore();
  const f = { ano: filters.ano, turno: filters.turno, cargo: filters.cargo, municipio: filters.municipio, partido: filters.partido };

  return useQuery({
    queryKey: ['kpis', f],
    queryFn: async () => {
      const q = applyFilters(
        (supabase.from(TABELA_CANDIDATOS) as any).select('id, situacao_final, genero, sigla_partido'),
        f
      );
      const data = await fetchAll(q);

      const totalCandidatos = data.length;
      const totalEleitos = data.filter((c: any) => {
        const s = (c.situacao_final || '').toUpperCase();
        return (s.includes('ELEITO') || s.includes('MÉDIA') || s.includes('QP')) && !s.includes('NÃO ELEITO');
      }).length;
      const totalMulheres = data.filter((c: any) => (c.genero || '').toUpperCase() === 'FEMININO').length;
      const pctMulheres = totalCandidatos > 0 ? (totalMulheres / totalCandidatos) * 100 : 0;
      const totalPartidos = new Set(data.map((c: any) => c.sigla_partido).filter(Boolean)).size;

      return { totalCandidatos, totalEleitos, pctMulheres, totalPartidos, totalMulheres };
    },
  });
}

// ═══ CANDIDATOS POR PARTIDO ═══
export function useCandidatosPorPartido() {
  const filters = useFilterStore();
  const f = { ano: filters.ano, turno: filters.turno, cargo: filters.cargo, municipio: filters.municipio, partido: filters.partido };

  return useQuery({
    queryKey: ['candidatosPorPartido', f],
    queryFn: async () => {
      const q = applyFilters(
        (supabase.from(TABELA_CANDIDATOS) as any).select('sigla_partido'),
        f
      );
      const data = await fetchAll(q);
      const map = new Map<string, number>();
      data.forEach((r: any) => {
        const p = r.sigla_partido || 'OUTROS';
        map.set(p, (map.get(p) || 0) + 1);
      });
      return Array.from(map.entries())
        .map(([partido, total]) => ({ partido, total }))
        .sort((a, b) => b.total - a.total);
    },
  });
}

// ═══ DISTRIBUIÇÃO POR GÊNERO ═══
export function useDistribuicaoGenero() {
  const filters = useFilterStore();
  const f = { ano: filters.ano, turno: filters.turno, cargo: filters.cargo, municipio: filters.municipio, partido: filters.partido };

  return useQuery({
    queryKey: ['genero', f],
    queryFn: async () => {
      const q = applyFilters(
        (supabase.from(TABELA_CANDIDATOS) as any).select('genero'),
        f
      );
      const data = await fetchAll(q);
      const map = new Map<string, number>();
      data.forEach((r: any) => {
        const g = r.genero || 'NÃO INFORMADO';
        map.set(g, (map.get(g) || 0) + 1);
      });
      return Array.from(map.entries())
        .map(([nome, total]) => ({ nome, total }))
        .sort((a, b) => b.total - a.total);
    },
  });
}

// ═══ DISTRIBUIÇÃO POR ESCOLARIDADE ═══
export function useDistribuicaoEscolaridade() {
  const filters = useFilterStore();
  const f = { ano: filters.ano, turno: filters.turno, cargo: filters.cargo, municipio: filters.municipio, partido: filters.partido };

  return useQuery({
    queryKey: ['escolaridade', f],
    queryFn: async () => {
      const q = applyFilters(
        (supabase.from(TABELA_CANDIDATOS) as any).select('grau_instrucao'),
        f
      );
      const data = await fetchAll(q);
      const map = new Map<string, number>();
      data.forEach((r: any) => {
        const g = r.grau_instrucao || 'NÃO INFORMADO';
        map.set(g, (map.get(g) || 0) + 1);
      });
      return Array.from(map.entries())
        .map(([nome, total]) => ({ nome, total }))
        .sort((a, b) => b.total - a.total);
    },
  });
}

// ═══ TOP OCUPAÇÕES ═══
export function useTopOcupacoes() {
  const filters = useFilterStore();
  const f = { ano: filters.ano, turno: filters.turno, cargo: filters.cargo, municipio: filters.municipio, partido: filters.partido };

  return useQuery({
    queryKey: ['ocupacoes', f],
    queryFn: async () => {
      const q = applyFilters(
        (supabase.from(TABELA_CANDIDATOS) as any).select('ocupacao'),
        f
      );
      const data = await fetchAll(q);
      const map = new Map<string, number>();
      data.forEach((r: any) => {
        const o = r.ocupacao || 'NÃO INFORMADO';
        map.set(o, (map.get(o) || 0) + 1);
      });
      return Array.from(map.entries())
        .map(([nome, total]) => ({ nome, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 12);
    },
  });
}

// ═══ SITUAÇÃO FINAL (RESULTADO) ═══
export function useSituacaoFinal() {
  const filters = useFilterStore();
  const f = { ano: filters.ano, turno: filters.turno, cargo: filters.cargo, municipio: filters.municipio, partido: filters.partido };

  return useQuery({
    queryKey: ['situacao', f],
    queryFn: async () => {
      const q = applyFilters(
        (supabase.from(TABELA_CANDIDATOS) as any).select('situacao_final'),
        f
      );
      const data = await fetchAll(q);
      const map = new Map<string, number>();
      data.forEach((r: any) => {
        let s = (r.situacao_final || 'NÃO DEFINIDO').toUpperCase().trim();
        if (s === '#NULO' || s === 'NONE' || s === '') s = 'NÃO DEFINIDO';
        map.set(s, (map.get(s) || 0) + 1);
      });
      return Array.from(map.entries())
        .map(([nome, total]) => ({ nome, total }))
        .sort((a, b) => b.total - a.total);
    },
  });
}

// ═══ EVOLUÇÃO POR ANO ═══
export function useEvolucaoPorAno() {
  const filters = useFilterStore();
  const f = { ano: null, turno: filters.turno, cargo: filters.cargo, municipio: filters.municipio, partido: filters.partido };

  return useQuery({
    queryKey: ['evolucaoAno', f],
    queryFn: async () => {
      const q = applyFilters(
        (supabase.from(TABELA_CANDIDATOS) as any).select('ano, genero, situacao_final'),
        { ...f, ano: null }
      );
      const data = await fetchAll(q);

      const map = new Map<number, { total: number; mulheres: number; eleitos: number }>();
      data.forEach((r: any) => {
        const cur = map.get(r.ano) || { total: 0, mulheres: 0, eleitos: 0 };
        cur.total++;
        if ((r.genero || '').toUpperCase() === 'FEMININO') cur.mulheres++;
        const s = (r.situacao_final || '').toUpperCase();
        if ((s.includes('ELEITO') || s.includes('MÉDIA') || s.includes('QP')) && !s.includes('NÃO ELEITO')) cur.eleitos++;
        map.set(r.ano, cur);
      });

      return Array.from(map.entries())
        .map(([ano, v]) => ({ ano, ...v, pctMulheres: v.total > 0 ? Math.round(v.mulheres / v.total * 100) : 0 }))
        .sort((a, b) => a.ano - b.ano);
    },
  });
}

// ═══ TOP PATRIMÔNIO ═══
export function useTopPatrimonio() {
  const filters = useFilterStore();
  const f = { ano: filters.ano, turno: filters.turno, cargo: filters.cargo, municipio: filters.municipio, partido: filters.partido };

  return useQuery({
    queryKey: ['topPatrimonio', f],
    queryFn: async () => {
      let bensQ = (supabase.from(TABELA_BENS) as any).select('sequencial_candidato, valor_bem, ano');
      if (f.ano) bensQ = bensQ.eq('ano', f.ano);
      const bens = await fetchAll(bensQ);

      const patriMap = new Map<string, number>();
      bens.forEach((b: any) => {
        const key = b.sequencial_candidato;
        if (!key) return;
        patriMap.set(key, (patriMap.get(key) || 0) + (b.valor_bem || 0));
      });

      const topSeqs = Array.from(patriMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

      if (topSeqs.length === 0) return [];

      const seqIds = topSeqs.map(([s]) => s);
      const { data: cands } = await (supabase.from(TABELA_CANDIDATOS) as any)
        .select('sequencial_candidato, nome_urna, sigla_partido, cargo, foto_url')
        .in('sequencial_candidato', seqIds);

      const candMap = new Map<string, any>();
      (cands || []).forEach((c: any) => {
        if (!candMap.has(c.sequencial_candidato)) candMap.set(c.sequencial_candidato, c);
      });

      return topSeqs.map(([seq, total]) => {
        const c = candMap.get(seq) || {};
        return {
          sequencial: seq,
          nome: c.nome_urna || 'N/A',
          partido: c.sigla_partido || '',
          cargo: c.cargo || '',
          foto_url: c.foto_url || null,
          patrimonio: total,
        };
      });
    },
  });
}

// ═══ FAIXA ETÁRIA ═══
export function useFaixaEtaria() {
  const filters = useFilterStore();
  const f = { ano: filters.ano, turno: filters.turno, cargo: filters.cargo, municipio: filters.municipio, partido: filters.partido };

  return useQuery({
    queryKey: ['faixaEtaria', f],
    queryFn: async () => {
      const q = applyFilters(
        (supabase.from(TABELA_CANDIDATOS) as any).select('data_nascimento, ano'),
        f
      );
      const data = await fetchAll(q);

      const faixas: Record<string, number> = {
        '18-25': 0, '26-35': 0, '36-45': 0, '46-55': 0, '56-65': 0, '66+': 0,
      };

      data.forEach((r: any) => {
        if (!r.data_nascimento) return;
        const parts = r.data_nascimento.split('/');
        if (parts.length < 3) return;
        const birthYear = parseInt(parts[2]);
        const refYear = r.ano || 2024;
        const age = refYear - birthYear;
        if (age < 18) return;
        if (age <= 25) faixas['18-25']++;
        else if (age <= 35) faixas['26-35']++;
        else if (age <= 45) faixas['36-45']++;
        else if (age <= 55) faixas['46-55']++;
        else if (age <= 65) faixas['56-65']++;
        else faixas['66+']++;
      });

      return Object.entries(faixas).map(([faixa, total]) => ({ faixa, total }));
    },
  });
}

// ═══ CANDIDATOS POR CARGO ═══
export function useCandidatosPorCargo() {
  const filters = useFilterStore();
  const f = { ano: filters.ano, turno: filters.turno, cargo: null, municipio: filters.municipio, partido: filters.partido };

  return useQuery({
    queryKey: ['porCargo', f],
    queryFn: async () => {
      const q = applyFilters(
        (supabase.from(TABELA_CANDIDATOS) as any).select('cargo'),
        f
      );
      const data = await fetchAll(q);
      const map = new Map<string, number>();
      data.forEach((r: any) => {
        const c = r.cargo || 'NÃO DEFINIDO';
        map.set(c, (map.get(c) || 0) + 1);
      });
      return Array.from(map.entries())
        .map(([cargo, total]) => ({ cargo, total }))
        .sort((a, b) => b.total - a.total);
    },
  });
}

// ═══ ELEITOS TABLE ═══
export function useEleitos() {
  const filters = useFilterStore();
  const f = { ano: filters.ano, turno: filters.turno, cargo: filters.cargo, municipio: filters.municipio, partido: filters.partido };

  return useQuery({
    queryKey: ['eleitos', f],
    queryFn: async () => {
      let q = (supabase.from(TABELA_CANDIDATOS) as any)
        .select('*')
        .or('situacao_final.ilike.%ELEITO%,situacao_final.ilike.%MÉDIA%,situacao_final.ilike.%QP%')
        .not('situacao_final', 'ilike', '%NÃO ELEITO%')
        .order('nome_urna')
        .limit(20);
      q = applyFilters(q, f);
      const { data } = await q;
      return data || [];
    },
  });
}

// ═══ PATRIMÔNIO EVOLUÇÃO POR ANO ═══
export function usePatrimonioEvolucaoAno() {
  return useQuery({
    queryKey: ['patrimonioEvolucao'],
    queryFn: async () => {
      const bens = await fetchAll(
        (supabase.from(TABELA_BENS) as any).select('ano, valor_bem')
      );
      const map = new Map<number, { total: number; count: number }>();
      bens.forEach((b: any) => {
        const cur = map.get(b.ano) || { total: 0, count: 0 };
        cur.total += b.valor_bem || 0;
        cur.count++;
        map.set(b.ano, cur);
      });
      return Array.from(map.entries())
        .map(([ano, v]) => ({ ano, total: v.total, media: v.count > 0 ? v.total / v.count : 0, registros: v.count }))
        .sort((a, b) => a.ano - b.ano);
    },
  });
}

// ═══ PATRIMÔNIO DISTRIBUIÇÃO (FAIXAS) ═══
export function usePatrimonioDistribuicao() {
  const filters = useFilterStore();
  const f = { ano: filters.ano, turno: filters.turno, cargo: filters.cargo, municipio: filters.municipio, partido: filters.partido };

  return useQuery({
    queryKey: ['patrimonioDistrib', f],
    queryFn: async () => {
      let bensQ = (supabase.from(TABELA_BENS) as any).select('sequencial_candidato, valor_bem, ano');
      if (f.ano) bensQ = bensQ.eq('ano', f.ano);
      const bens = await fetchAll(bensQ);

      const candTotal = new Map<string, number>();
      bens.forEach((b: any) => {
        const k = b.sequencial_candidato;
        if (!k) return;
        candTotal.set(k, (candTotal.get(k) || 0) + (b.valor_bem || 0));
      });

      const faixas: Record<string, number> = {
        'Até R$ 10k': 0, 'R$ 10k - 50k': 0, 'R$ 50k - 100k': 0,
        'R$ 100k - 500k': 0, 'R$ 500k - 1M': 0, 'R$ 1M - 5M': 0, 'Acima R$ 5M': 0,
      };

      candTotal.forEach((total) => {
        if (total <= 10_000) faixas['Até R$ 10k']++;
        else if (total <= 50_000) faixas['R$ 10k - 50k']++;
        else if (total <= 100_000) faixas['R$ 50k - 100k']++;
        else if (total <= 500_000) faixas['R$ 100k - 500k']++;
        else if (total <= 1_000_000) faixas['R$ 500k - 1M']++;
        else if (total <= 5_000_000) faixas['R$ 1M - 5M']++;
        else faixas['Acima R$ 5M']++;
      });

      return Object.entries(faixas).map(([faixa, total]) => ({ faixa, total }));
    },
  });
}

// ═══ RANKING (candidatos + votos join) ═══
export function useRanking(search: string, page: number, sortBy: string, sortAsc: boolean) {
  const { ano, turno, cargo, municipio, partido } = useFilterStore();
  const f = { ano, turno, cargo, municipio, partido };
  const pageSize = 20;

  return useQuery({
    queryKey: ['ranking', f, search, page, sortBy, sortAsc],
    queryFn: async () => {
      // Use candidatos table directly - it has all the data we need
      let q = (supabase.from(TABELA_CANDIDATOS) as any).select('*', { count: 'exact' });
      q = applyFilters(q, f);
      if (search) q = q.ilike('nome_urna', `%${search}%`);

      // Sort - for votos we need to handle separately
      const validSorts = ['nome_urna', 'nome_completo', 'numero_urna', 'sigla_partido', 'cargo', 'municipio', 'ano'];
      const actualSort = validSorts.includes(sortBy) ? sortBy : 'nome_urna';
      q = q.order(actualSort, { ascending: sortAsc });
      q = q.range(page * pageSize, (page + 1) * pageSize - 1);
      const { data, count } = await q;

      // Try to get votos for these candidates
      const candidateNames = (data || []).map((c: any) => c.nome_urna).filter(Boolean);
      let votosMap = new Map<string, number>();

      if (candidateNames.length > 0) {
        try {
          const { data: votos } = await (supabase.from(TABELA_VOTACAO) as any)
            .select('nome_candidato, total_votos')
            .in('nome_candidato', candidateNames)
            .eq('ano', ano || 2024);
          (votos || []).forEach((v: any) => {
            votosMap.set(v.nome_candidato, (votosMap.get(v.nome_candidato) || 0) + (v.total_votos || 0));
          });
        } catch {
          // votacao table may be empty
        }
      }

      const enriched = (data || []).map((c: any) => ({
        ...c,
        total_votos: votosMap.get(c.nome_urna) || 0,
      }));

      return { data: enriched, count: count || 0, pageSize, hasVotos: votosMap.size > 0 };
    },
  });
}

// ═══ CANDIDATO PERFIL ═══
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

export function useEvolucaoPatrimonio(nomeUrna: string) {
  return useQuery({
    queryKey: ['evolucaoPatrimonio', nomeUrna],
    queryFn: async () => {
      if (!nomeUrna) return [];
      const { data: cands } = await (supabase.from(TABELA_CANDIDATOS) as any)
        .select('ano, sequencial_candidato, nome_urna')
        .eq('nome_urna', nomeUrna);
      if (!cands || cands.length === 0) return [];
      const seqs = cands.map((c: any) => c.sequencial_candidato).filter(Boolean);
      if (seqs.length === 0) return [];
      const { data: bens } = await (supabase.from(TABELA_BENS) as any)
        .select('ano, sequencial_candidato, valor_bem')
        .in('sequencial_candidato', seqs);
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

// ═══ CANDIDATO VOTOS (from real votacao table) ═══
export function useCandidatoVotos(nomeUrna: string, ano: number) {
  return useQuery({
    queryKey: ['candidatoVotos', nomeUrna, ano],
    queryFn: async () => {
      if (!nomeUrna || !ano) return [];
      const { data } = await (supabase.from(TABELA_VOTACAO) as any)
        .select('municipio, zona, total_votos, cargo')
        .eq('nome_candidato', nomeUrna)
        .eq('ano', ano)
        .order('total_votos', { ascending: false })
        .limit(500);
      return data || [];
    },
    enabled: !!nomeUrna && !!ano,
  });
}

// ═══ MUNICÍPIO — RESUMO COMPARECIMENTO ═══
export function useMunicipioResumo(municipio: string | null) {
  return useQuery({
    queryKey: ['municipioResumo', municipio],
    queryFn: async () => {
      if (!municipio) return null;
      const { data } = await (supabase.from(TABELA_COMPARECIMENTO) as any)
        .select('ano, turno, eleitorado_apto, comparecimento, abstencoes')
        .eq('municipio', municipio);

      if (!data || data.length === 0) return null;

      const totals = data.reduce((acc: any, r: any) => ({
        apto: acc.apto + (r.eleitorado_apto || 0),
        comp: acc.comp + (r.comparecimento || 0),
        abst: acc.abst + (r.abstencoes || 0),
      }), { apto: 0, comp: 0, abst: 0 });

      const map = new Map<number, any>();
      data.forEach((r: any) => {
        const cur = map.get(r.ano) || { ano: r.ano, apto: 0, comp: 0, abst: 0 };
        cur.apto += r.eleitorado_apto || 0;
        cur.comp += r.comparecimento || 0;
        cur.abst += r.abstencoes || 0;
        map.set(r.ano, cur);
      });

      return {
        totals,
        historico: Array.from(map.values()).sort((a: any, b: any) => a.ano - b.ano),
      };
    },
    enabled: !!municipio,
  });
}

// ═══ MUNICÍPIO — CANDIDATOS DO MUNICÍPIO ═══
export function useMunicipioCandidatos(municipio: string | null) {
  const { ano } = useFilterStore();
  return useQuery({
    queryKey: ['municipioCandidatos', municipio, ano],
    queryFn: async () => {
      if (!municipio) return [];
      let q = (supabase.from(TABELA_CANDIDATOS) as any)
        .select('id, nome_urna, sigla_partido, cargo, situacao_final, foto_url, numero_urna')
        .eq('municipio', municipio)
        .order('nome_urna')
        .limit(500);
      if (ano) q = q.eq('ano', ano);
      const { data } = await q;
      return data || [];
    },
    enabled: !!municipio,
  });
}

// ═══ MUNICÍPIO — VOTOS TOP ═══
export function useMunicipioVotos(municipio: string | null) {
  const { ano } = useFilterStore();
  return useQuery({
    queryKey: ['municipioVotos', municipio, ano],
    queryFn: async () => {
      if (!municipio) return [];
      let q = (supabase.from(TABELA_VOTACAO) as any)
        .select('nome_candidato, partido, cargo, total_votos, numero_urna')
        .eq('municipio', municipio)
        .order('total_votos', { ascending: false })
        .limit(200);
      if (ano) q = q.eq('ano', ano);
      const { data } = await q;
      return data || [];
    },
    enabled: !!municipio,
  });
}

// ═══ BAIRRO — COMPARECIMENTO POR SEÇÃO ═══
export function useVotosPorBairro(municipio: string, ano?: number) {
  return useQuery({
    queryKey: ['votosBairro', municipio, ano],
    queryFn: async () => {
      if (!municipio) return [];
      let q = (supabase.from(TABELA_COMPARECIMENTO_SECAO) as any)
        .select('bairro, eleitorado_apto, comparecimento, abstencoes')
        .eq('municipio', municipio);
      if (ano) q = q.eq('ano', ano);
      const data = await fetchAll(q);

      const map = new Map<string, { bairro: string; apto: number; comp: number; abst: number }>();
      data.forEach((r: any) => {
        const b = r.bairro || 'NÃO INFORMADO';
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

export function useVotosPorLocal(municipio: string, ano?: number, bairro?: string) {
  return useQuery({
    queryKey: ['votosLocal', municipio, ano, bairro],
    queryFn: async () => {
      if (!municipio) return [];
      let q = (supabase.from(TABELA_COMPARECIMENTO_SECAO) as any)
        .select('local_votacao, bairro, eleitorado_apto, comparecimento')
        .eq('municipio', municipio);
      if (ano) q = q.eq('ano', ano);
      if (bairro) q = q.eq('bairro', bairro);
      const data = await fetchAll(q);

      const map = new Map<string, { local: string; bairro: string; apto: number; comp: number }>();
      data.forEach((r: any) => {
        const key = `${r.local_votacao}|${r.bairro}`;
        const cur = map.get(key) || { local: r.local_votacao || '', bairro: r.bairro || '', apto: 0, comp: 0 };
        cur.apto += r.eleitorado_apto || 0;
        cur.comp += r.comparecimento || 0;
        map.set(key, cur);
      });

      return Array.from(map.values()).sort((a, b) => b.apto - a.apto);
    },
    enabled: !!municipio,
  });
}

// ═══ POR PARTIDO — RESUMO ═══
export function usePartidoResumo() {
  const { ano, turno, cargo, municipio } = useFilterStore();
  return useQuery({
    queryKey: ['partidosResumo', ano, turno, cargo, municipio],
    queryFn: async () => {
      // Candidatos
      let cq = (supabase.from(TABELA_CANDIDATOS) as any).select('sigla_partido, situacao_final');
      if (ano) cq = cq.eq('ano', ano);
      if (turno) cq = cq.eq('turno', turno);
      if (cargo) cq = cq.ilike('cargo', cargo);
      if (municipio) cq = cq.eq('municipio', municipio);
      const candidatos = await fetchAll(cq);

      // Votos from votacao_partido table
      let vq = (supabase.from(TABELA_VOTACAO_PARTIDO) as any).select('sigla_partido, total_votos');
      if (ano) vq = vq.eq('ano', ano);
      if (turno) vq = vq.eq('turno', turno);
      if (cargo) vq = vq.ilike('cargo', cargo);
      if (municipio) vq = vq.eq('municipio', municipio);

      let votos: any[] = [];
      try {
        votos = await fetchAll(vq);
      } catch {
        // table may be empty
      }

      const map = new Map<string, { candidatos: number; votos: number; eleitos: number }>();

      candidatos.forEach((c: any) => {
        const p = c.sigla_partido || 'OUTROS';
        const cur = map.get(p) || { candidatos: 0, votos: 0, eleitos: 0 };
        cur.candidatos++;
        const sit = (c.situacao_final || '').toUpperCase();
        if (sit.includes('ELEITO') && !sit.includes('NÃO')) cur.eleitos++;
        map.set(p, cur);
      });

      votos.forEach((v: any) => {
        const p = v.sigla_partido || 'OUTROS';
        const cur = map.get(p) || { candidatos: 0, votos: 0, eleitos: 0 };
        cur.votos += v.total_votos || 0;
        map.set(p, cur);
      });

      const hasVotos = votos.length > 0;

      return {
        partidos: Array.from(map.entries())
          .map(([partido, stats]) => ({ partido, ...stats }))
          .sort((a, b) => hasVotos ? b.votos - a.votos : b.candidatos - a.candidatos),
        hasVotos,
      };
    },
  });
}

// ═══ PARTIDO DETALHE — TOP CANDIDATOS ═══
export function usePartidoDetalhe(partido: string | null) {
  const { ano, turno, cargo, municipio } = useFilterStore();
  return useQuery({
    queryKey: ['partidoDetalhe', partido, ano, turno, cargo, municipio],
    queryFn: async () => {
      if (!partido) return [];
      // Use candidatos table instead of munzona
      let q = (supabase.from(TABELA_CANDIDATOS) as any)
        .select('nome_urna, cargo, municipio, sigla_partido, situacao_final')
        .eq('sigla_partido', partido)
        .order('nome_urna')
        .limit(50);
      if (ano) q = q.eq('ano', ano);
      if (turno) q = q.eq('turno', turno);
      if (cargo) q = q.ilike('cargo', cargo);
      if (municipio) q = q.eq('municipio', municipio);
      const { data } = await q;
      return data || [];
    },
    enabled: !!partido,
  });
}

// ═══ LISTS ═══
export function useMunicipios() {
  return useQuery({
    queryKey: ['municipiosLista'],
    queryFn: async () => {
      const { data } = await (supabase.from(TABELA_CANDIDATOS) as any)
        .select('municipio')
        .not('municipio', 'is', null)
        .limit(1000);
      const unique = [...new Set((data || []).map((r: any) => r.municipio).filter(Boolean))].sort();
      return unique as string[];
    },
  });
}

export function usePartidos() {
  return useQuery({
    queryKey: ['partidosLista'],
    queryFn: async () => {
      const { data } = await (supabase.from(TABELA_CANDIDATOS) as any)
        .select('sigla_partido')
        .not('sigla_partido', 'is', null)
        .limit(1000);
      const unique = [...new Set((data || []).map((r: any) => r.sigla_partido).filter(Boolean))].sort();
      return unique as string[];
    },
  });
}

export function useImportLogs() {
  return useQuery({
    queryKey: ['importLogs'],
    queryFn: async () => {
      const { data } = await (supabase.from('bd_eleicoes_importacoes_log' as any) as any)
        .select('*').order('created_at', { ascending: false }).limit(50);
      return data || [];
    },
  });
}

// ═══ PERFIL CANDIDATOS ═══
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
      const data = await fetchAll(q);
      const generos = new Map<string, number>();
      const instrucoes = new Map<string, number>();
      const ocupacoes = new Map<string, number>();
      data.forEach((r: any) => {
        generos.set(r.genero || 'NÃO INFORMADO', (generos.get(r.genero || 'NÃO INFORMADO') || 0) + 1);
        instrucoes.set(r.grau_instrucao || 'NÃO INFORMADO', (instrucoes.get(r.grau_instrucao || 'NÃO INFORMADO') || 0) + 1);
        ocupacoes.set(r.ocupacao || 'NÃO INFORMADO', (ocupacoes.get(r.ocupacao || 'NÃO INFORMADO') || 0) + 1);
      });
      return {
        generos: Array.from(generos.entries()).map(([k, v]) => ({ nome: k, total: v })).sort((a, b) => b.total - a.total),
        instrucoes: Array.from(instrucoes.entries()).map(([k, v]) => ({ nome: k, total: v })).sort((a, b) => b.total - a.total),
        ocupacoes: Array.from(ocupacoes.entries()).map(([k, v]) => ({ nome: k, total: v })).sort((a, b) => b.total - a.total).slice(0, 15),
      };
    },
  });
}

// ═══ PATRIMÔNIO POR PARTIDO ═══
export function usePatrimonioPorPartido() {
  const filters = useFilterStore();
  const f = { ano: filters.ano, turno: filters.turno, cargo: filters.cargo, municipio: filters.municipio, partido: filters.partido };

  return useQuery({
    queryKey: ['patrimonioPorPartido', f],
    queryFn: async () => {
      let bensQ = (supabase.from(TABELA_BENS) as any).select('sequencial_candidato, valor_bem, ano');
      if (f.ano) bensQ = bensQ.eq('ano', f.ano);
      const bens = await fetchAll(bensQ);

      const seqs = [...new Set(bens.map((b: any) => b.sequencial_candidato).filter(Boolean))];
      if (seqs.length === 0) return [];

      const candMap = new Map<string, string>();
      for (let i = 0; i < seqs.length; i += 500) {
        const batch = seqs.slice(i, i + 500);
        const { data } = await (supabase.from(TABELA_CANDIDATOS) as any)
          .select('sequencial_candidato, sigla_partido')
          .in('sequencial_candidato', batch);
        (data || []).forEach((c: any) => {
          if (!candMap.has(c.sequencial_candidato)) candMap.set(c.sequencial_candidato, c.sigla_partido);
        });
      }

      const partyMap = new Map<string, { total: number; count: number }>();
      bens.forEach((b: any) => {
        const partido = candMap.get(b.sequencial_candidato) || 'OUTROS';
        const cur = partyMap.get(partido) || { total: 0, count: 0 };
        cur.total += b.valor_bem || 0;
        cur.count++;
        partyMap.set(partido, cur);
      });

      return Array.from(partyMap.entries())
        .map(([partido, v]) => ({ partido, total: v.total, media: v.count > 0 ? v.total / v.count : 0 }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 15);
    },
  });
}
