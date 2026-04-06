import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { formatNumber, getPartidoCor } from '@/lib/eleicoes';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { TableSkeleton } from '@/components/eleicoes/Skeletons';
import { Pagination } from '@/components/eleicoes/Pagination';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Users, Filter, Grid3x3, List, ArrowUpDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TABELA = 'bd_eleicoes_candidatos' as any;

function useDiretorio(cidade: string, search: string, cargo: string | null, partido: string | null, genero: string | null, situacao: string | null, page: number, pageSize: number, sortBy: string, sortAsc: boolean) {
  return useQuery({
    queryKey: ['diretorio', cidade, search, cargo, partido, genero, situacao, page, pageSize, sortBy, sortAsc],
    queryFn: async () => {
      let q = (supabase.from(TABELA) as any)
        .select('id, nome_urna, nome_completo, sigla_partido, cargo, municipio, ano, genero, grau_instrucao, ocupacao, situacao_final, numero_urna, foto_url, data_nascimento, nacionalidade', { count: 'exact' });

      if (cidade === 'GOIÂNIA') q = q.eq('municipio', 'GOIÂNIA');
      else if (cidade === 'APARECIDA DE GOIÂNIA') q = q.eq('municipio', 'APARECIDA DE GOIÂNIA');
      else q = q.in('municipio', ['GOIÂNIA', 'APARECIDA DE GOIÂNIA']);

      if (search) q = q.or(`nome_urna.ilike.%${search}%,nome_completo.ilike.%${search}%`);
      if (cargo) q = q.ilike('cargo', cargo);
      if (partido) q = q.eq('sigla_partido', partido);
      if (genero) q = q.eq('genero', genero);
      if (situacao) q = q.ilike('situacao_final', `%${situacao}%`);

      q = q.order(sortBy, { ascending: sortAsc });
      q = q.range(page * pageSize, (page + 1) * pageSize - 1);

      const { data, count, error } = await q;
      if (error) throw error;
      return { data: data || [], count: count || 0 };
    },
  });
}

function useFilterOptionsDiretorio() {
  return useQuery({
    queryKey: ['diretorioFilterOptions'],
    queryFn: async () => {
      const { data } = await (supabase.from(TABELA) as any)
        .select('cargo, sigla_partido, genero, situacao_final')
        .in('municipio', ['GOIÂNIA', 'APARECIDA DE GOIÂNIA'])
        .limit(5000);
      return {
        cargos: [...new Set((data || []).map((r: any) => r.cargo).filter(Boolean))].sort() as string[],
        partidos: [...new Set((data || []).map((r: any) => r.sigla_partido).filter(Boolean))].sort() as string[],
        generos: [...new Set((data || []).map((r: any) => r.genero).filter(Boolean))].sort() as string[],
        situacoes: [...new Set((data || []).map((r: any) => r.situacao_final).filter(Boolean))].sort() as string[],
      };
    },
    staleTime: 10 * 60 * 1000,
  });
}

export default function DiretorioCandidatos() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cidade, setCidade] = useState('TODOS');
  const [cargo, setCargo] = useState<string | null>(null);
  const [partido, setPartido] = useState<string | null>(null);
  const [genero, setGenero] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(24);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState('nome_urna');
  const [sortAsc, setSortAsc] = useState(true);
  const [timer, setTimer] = useState<any>(null);
  const navigate = useNavigate();

  const handleSearch = (v: string) => {
    setSearch(v);
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => { setDebouncedSearch(v); setPage(0); }, 300));
  };

  const { data, isLoading } = useDiretorio(cidade, debouncedSearch, cargo, partido, genero, situacao, page, pageSize, sortBy, sortAsc);
  const { data: filterOpts } = useFilterOptionsDiretorio();

  const clearFilters = () => {
    setCargo(null); setPartido(null); setGenero(null); setSituacao(null);
    setSearch(''); setDebouncedSearch(''); setPage(0);
  };

  const hasFilters = !!(cargo || partido || genero || situacao || debouncedSearch);

  return (
    <div className="space-y-3 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" /> Diretório de Candidatos
        </h1>
        <span className="text-xs text-muted-foreground">{formatNumber(data?.count || 0)} candidatos</span>
      </div>

      {/* Search + City Toggle */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar candidato por nome..."
            className="pl-10 h-9 text-sm"
          />
        </div>
        <div className="flex gap-1.5">
          {['TODOS', 'GOIÂNIA', 'APARECIDA DE GOIÂNIA'].map(c => (
            <button
              key={c}
              onClick={() => { setCidade(c); setPage(0); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                cidade === c ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {c === 'TODOS' ? 'Ambas' : c === 'GOIÂNIA' ? 'Goiânia' : 'Aparecida'}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
            <Grid3x3 className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        <Select value={cargo || 'todos'} onValueChange={v => { setCargo(v === 'todos' ? null : v); setPage(0); }}>
          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Cargo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos cargos</SelectItem>
            {(filterOpts?.cargos || []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={partido || 'todos'} onValueChange={v => { setPartido(v === 'todos' ? null : v); setPage(0); }}>
          <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue placeholder="Partido" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos partidos</SelectItem>
            {(filterOpts?.partidos || []).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={genero || 'todos'} onValueChange={v => { setGenero(v === 'todos' ? null : v); setPage(0); }}>
          <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="Gênero" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos gêneros</SelectItem>
            {(filterOpts?.generos || []).map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={situacao || 'todos'} onValueChange={v => { setSituacao(v === 'todos' ? null : v); setPage(0); }}>
          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Situação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas situações</SelectItem>
            {(filterOpts?.situacoes || []).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-destructive hover:underline ml-1">Limpar filtros</button>
        )}
      </div>

      {/* Results */}
      {isLoading ? <TableSkeleton /> : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {(data?.data || []).map((c: any) => (
            <button
              key={c.id}
              onClick={() => navigate(`/candidato/${c.id}`)}
              className="bg-card rounded-lg border border-border/50 p-3 hover:border-primary/30 hover:shadow-md transition-all text-left group"
            >
              <div className="flex justify-center mb-2">
                <CandidatoAvatar nome={c.nome_urna || c.nome_completo} fotoUrl={c.foto_url} size={56} />
              </div>
              <p className="text-xs font-semibold text-center truncate group-hover:text-primary transition-colors">{c.nome_urna}</p>
              <p className="text-[10px] text-muted-foreground text-center truncate">{c.nome_completo}</p>
              <div className="flex items-center justify-center gap-1 mt-1.5">
                <span className="text-[10px] font-bold" style={{ color: getPartidoCor(c.sigla_partido) }}>{c.sigla_partido}</span>
                <span className="text-[9px] text-muted-foreground">· {c.numero_urna}</span>
              </div>
              <p className="text-[9px] text-muted-foreground text-center mt-0.5">{c.cargo}</p>
              <div className="flex justify-center mt-1.5">
                <SituacaoBadge situacao={c.situacao_final} />
              </div>
              <p className="text-[9px] text-muted-foreground text-center mt-1">{c.municipio} · {c.ano}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left bg-muted/30">
                  <th className="p-2 w-8"></th>
                  <th className="p-2 font-medium cursor-pointer hover:text-primary" onClick={() => { if (sortBy === 'nome_urna') setSortAsc(!sortAsc); else { setSortBy('nome_urna'); setSortAsc(true); } }}>
                    Nome <ArrowUpDown className="w-2.5 h-2.5 inline ml-0.5" />
                  </th>
                  <th className="p-2 font-medium">Partido</th>
                  <th className="p-2 font-medium">Nº</th>
                  <th className="p-2 font-medium">Cargo</th>
                  <th className="p-2 font-medium">Município</th>
                  <th className="p-2 font-medium">Gênero</th>
                  <th className="p-2 font-medium">Escolaridade</th>
                  <th className="p-2 font-medium">Ocupação</th>
                  <th className="p-2 font-medium">Situação</th>
                  <th className="p-2 font-medium">Ano</th>
                </tr>
              </thead>
              <tbody>
                {(data?.data || []).map((c: any) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-primary/5 cursor-pointer" onClick={() => navigate(`/candidato/${c.id}`)}>
                    <td className="p-1.5"><CandidatoAvatar nome={c.nome_urna} fotoUrl={c.foto_url} size={24} /></td>
                    <td className="p-1.5 font-medium">{c.nome_urna}</td>
                    <td className="p-1.5 font-semibold" style={{ color: getPartidoCor(c.sigla_partido) }}>{c.sigla_partido}</td>
                    <td className="p-1.5 text-muted-foreground">{c.numero_urna}</td>
                    <td className="p-1.5">{c.cargo}</td>
                    <td className="p-1.5">{c.municipio}</td>
                    <td className="p-1.5 text-muted-foreground">{c.genero}</td>
                    <td className="p-1.5 text-muted-foreground text-[10px]">{c.grau_instrucao}</td>
                    <td className="p-1.5 text-muted-foreground text-[10px]">{c.ocupacao}</td>
                    <td className="p-1.5"><SituacaoBadge situacao={c.situacao_final} /></td>
                    <td className="p-1.5 text-muted-foreground">{c.ano}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(data?.data || []).length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum candidato encontrado com os filtros aplicados.</p>
        </div>
      )}

      {(data?.count || 0) > 0 && (
        <div className="bg-card rounded-lg border border-border/50">
          <Pagination page={page} totalItems={data?.count || 0} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </div>
      )}
    </div>
  );
}
