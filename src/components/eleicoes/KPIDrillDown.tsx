import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';
import { formatNumber, formatPercent, formatBRLCompact, getPartidoCor } from '@/lib/eleicoes';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/eleicoes/Pagination';
import { TableSkeleton } from '@/components/eleicoes/Skeletons';
import { X, Search, Download } from 'lucide-react';
import { Link } from 'react-router-dom';

const TABELA_CANDIDATOS = 'bd_eleicoes_candidatos' as any;
const TABELA_COMPARECIMENTO = 'bd_eleicoes_comparecimento' as any;

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

export type DrillDownType = 'candidatos' | 'eleitos' | 'mulheres' | 'partidos' | 'municipios' | 'cargos' | 'eleitorado' | 'comparecimento' | null;

function useKPIDrillDown(type: DrillDownType) {
  const store = useFilterStore();
  return useQuery({
    queryKey: ['kpiDrillDown', type, store.ano, store.turno, store.cargo, store.municipio, store.partido],
    queryFn: async () => {
      if (!type) return [];

      if (type === 'eleitorado' || type === 'comparecimento') {
        let q = (supabase.from(TABELA_COMPARECIMENTO) as any)
          .select('ano, turno, municipio, zona, eleitorado_apto, comparecimento, abstencoes, votos_brancos, votos_nulos');
        if (store.ano) q = q.eq('ano', store.ano);
        if (store.municipio) q = q.eq('municipio', store.municipio);
        return await fetchAll(q);
      }

      let q = (supabase.from(TABELA_CANDIDATOS) as any)
        .select('id, sequencial_candidato, nome_urna, nome_completo, sigla_partido, cargo, municipio, ano, genero, grau_instrucao, situacao_final, numero_urna, foto_url');
      if (store.ano) q = q.eq('ano', store.ano);
      if (store.turno) q = q.eq('turno', store.turno);
      if (store.cargo) q = q.ilike('cargo', store.cargo);
      if (store.municipio) q = q.eq('municipio', store.municipio);
      if (store.partido) q = q.eq('sigla_partido', store.partido);

      if (type === 'eleitos') {
        q = q.or('situacao_final.ilike.%ELEITO%,situacao_final.ilike.%MÉDIA%,situacao_final.ilike.%QP%')
          .not('situacao_final', 'ilike', '%NÃO ELEITO%');
      } else if (type === 'mulheres') {
        q = q.eq('genero', 'FEMININO');
      }

      return await fetchAll(q);
    },
    enabled: !!type,
  });
}

interface DrillDownPanelProps {
  type: DrillDownType;
  title: string;
  onClose: () => void;
}

export function KPIDrillDownPanel({ type, title, onClose }: DrillDownPanelProps) {
  const { data, isLoading } = useKPIDrillDown(type);
  const [search, setSearch] = useState('');
  const [filterPartido, setFilterPartido] = useState<string | null>(null);
  const [filterCargo, setFilterCargo] = useState<string | null>(null);
  const [filterMunicipio, setFilterMunicipio] = useState<string | null>(null);
  const [filterGenero, setFilterGenero] = useState<string | null>(null);
  const [filterSituacao, setFilterSituacao] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const isComparecimento = type === 'eleitorado' || type === 'comparecimento';

  // Extract unique values for filters
  const filterOptions = useMemo(() => {
    if (!data || data.length === 0) return { partidos: [], cargos: [], municipios: [], generos: [], situacoes: [] };
    if (isComparecimento) {
      return {
        partidos: [],
        cargos: [],
        municipios: [...new Set(data.map((r: any) => r.municipio).filter(Boolean))].sort() as string[],
        generos: [],
        situacoes: [],
      };
    }
    return {
      partidos: [...new Set(data.map((r: any) => r.sigla_partido).filter(Boolean))].sort() as string[],
      cargos: [...new Set(data.map((r: any) => r.cargo).filter(Boolean))].sort() as string[],
      municipios: [...new Set(data.map((r: any) => r.municipio).filter(Boolean))].sort() as string[],
      generos: [...new Set(data.map((r: any) => r.genero).filter(Boolean))].sort() as string[],
      situacoes: [...new Set(data.map((r: any) => r.situacao_final).filter(Boolean))].sort() as string[],
    };
  }, [data, isComparecimento]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data;
    if (isComparecimento) {
      if (filterMunicipio) list = list.filter((r: any) => r.municipio === filterMunicipio);
      return list;
    }
    if (search) list = list.filter((r: any) => (r.nome_urna || '').toLowerCase().includes(search.toLowerCase()) || (r.nome_completo || '').toLowerCase().includes(search.toLowerCase()));
    if (filterPartido) list = list.filter((r: any) => r.sigla_partido === filterPartido);
    if (filterCargo) list = list.filter((r: any) => r.cargo === filterCargo);
    if (filterMunicipio) list = list.filter((r: any) => r.municipio === filterMunicipio);
    if (filterGenero) list = list.filter((r: any) => r.genero === filterGenero);
    if (filterSituacao) list = list.filter((r: any) => r.situacao_final === filterSituacao);
    return list;
  }, [data, search, filterPartido, filterCargo, filterMunicipio, filterGenero, filterSituacao, isComparecimento]);

  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const handleExportCSV = () => {
    if (!filtered || filtered.length === 0) return;
    const keys = Object.keys(filtered[0]);
    const csv = [keys.join(','), ...filtered.map((r: any) => keys.map(k => `"${(r[k] ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${type}_dados.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-8 px-4" onClick={onClose}>
      <div className="bg-card border rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="text-xs text-muted-foreground">{formatNumber(filtered.length)} registros {data && filtered.length < data.length ? `(filtrado de ${formatNumber(data.length)})` : ''}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleExportCSV} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-xs font-medium">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 p-3 border-b bg-muted/20">
          {!isComparecimento && (
            <div className="relative flex-1 min-w-[150px] max-w-[250px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Buscar nome..." className="pl-8 h-8 text-xs" />
            </div>
          )}
          {filterOptions.partidos.length > 1 && (
            <Select value={filterPartido || 'todos'} onValueChange={v => { setFilterPartido(v === 'todos' ? null : v); setPage(0); }}>
              <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue placeholder="Partido" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos partidos</SelectItem>
                {filterOptions.partidos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {filterOptions.cargos.length > 1 && (
            <Select value={filterCargo || 'todos'} onValueChange={v => { setFilterCargo(v === 'todos' ? null : v); setPage(0); }}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Cargo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos cargos</SelectItem>
                {filterOptions.cargos.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {filterOptions.municipios.length > 1 && (
            <Select value={filterMunicipio || 'todos'} onValueChange={v => { setFilterMunicipio(v === 'todos' ? null : v); setPage(0); }}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Município" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos municípios</SelectItem>
                {filterOptions.municipios.slice(0, 50).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {filterOptions.generos.length > 1 && (
            <Select value={filterGenero || 'todos'} onValueChange={v => { setFilterGenero(v === 'todos' ? null : v); setPage(0); }}>
              <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="Gênero" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos gêneros</SelectItem>
                {filterOptions.generos.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {filterOptions.situacoes.length > 1 && (
            <Select value={filterSituacao || 'todos'} onValueChange={v => { setFilterSituacao(v === 'todos' ? null : v); setPage(0); }}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Situação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas situações</SelectItem>
                {filterOptions.situacoes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-3">
          {isLoading ? <TableSkeleton /> : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card z-10">
                {isComparecimento ? (
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Município</th>
                    <th className="pb-2 font-medium text-right">Ano</th>
                    <th className="pb-2 font-medium text-right">Turno</th>
                    <th className="pb-2 font-medium text-right">Zona</th>
                    <th className="pb-2 font-medium text-right">Eleitorado</th>
                    <th className="pb-2 font-medium text-right">Comparecimento</th>
                    <th className="pb-2 font-medium text-right">% Comp.</th>
                    <th className="pb-2 font-medium text-right">Abstenções</th>
                    <th className="pb-2 font-medium text-right">Brancos</th>
                    <th className="pb-2 font-medium text-right">Nulos</th>
                  </tr>
                ) : (
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Nome</th>
                    <th className="pb-2 font-medium">Partido</th>
                    <th className="pb-2 font-medium">Cargo</th>
                    <th className="pb-2 font-medium">Município</th>
                    <th className="pb-2 font-medium text-right">Nº Urna</th>
                    <th className="pb-2 font-medium">Gênero</th>
                    <th className="pb-2 font-medium">Instrução</th>
                    <th className="pb-2 font-medium">Situação</th>
                    <th className="pb-2 font-medium text-right">Ano</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                )}
              </thead>
              <tbody>
                {isComparecimento ? paged.map((r: any, i: number) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-1.5 font-medium">{r.municipio}</td>
                    <td className="py-1.5 text-right">{r.ano}</td>
                    <td className="py-1.5 text-right">{r.turno}º</td>
                    <td className="py-1.5 text-right">{r.zona}</td>
                    <td className="py-1.5 text-right">{formatNumber(r.eleitorado_apto)}</td>
                    <td className="py-1.5 text-right">{formatNumber(r.comparecimento)}</td>
                    <td className="py-1.5 text-right font-semibold">{r.eleitorado_apto > 0 ? formatPercent((r.comparecimento / r.eleitorado_apto) * 100) : '-'}</td>
                    <td className="py-1.5 text-right">{formatNumber(r.abstencoes)}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{formatNumber(r.votos_brancos)}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{formatNumber(r.votos_nulos)}</td>
                  </tr>
                )) : paged.map((r: any, i: number) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-1.5 font-medium">{r.nome_urna}</td>
                    <td className="py-1.5"><Badge variant="outline" className="text-[9px]" style={{ borderColor: getPartidoCor(r.sigla_partido) }}>{r.sigla_partido}</Badge></td>
                    <td className="py-1.5 text-muted-foreground">{r.cargo}</td>
                    <td className="py-1.5 text-muted-foreground">{r.municipio}</td>
                    <td className="py-1.5 text-right">{r.numero_urna}</td>
                    <td className="py-1.5 text-muted-foreground">{r.genero}</td>
                    <td className="py-1.5 text-muted-foreground text-[10px]">{r.grau_instrucao}</td>
                    <td className="py-1.5"><Badge variant="secondary" className="text-[9px]">{r.situacao_final || '-'}</Badge></td>
                    <td className="py-1.5 text-right">{r.ano}</td>
                    <td className="py-1.5"><Link to={`/candidatos/${r.sequencial_candidato || r.id}${r.ano ? `/${r.ano}` : ''}`} className="text-primary text-[10px] hover:underline">Ver →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {filtered.length === 0 && !isLoading && (
            <p className="text-center text-muted-foreground py-8 text-sm">Nenhum registro encontrado com os filtros aplicados.</p>
          )}
        </div>

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="border-t">
            <Pagination page={page} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </div>
        )}
      </div>
    </div>
  );
}
