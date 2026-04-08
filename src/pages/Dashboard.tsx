import { useState, useMemo } from 'react';
import { usePainelGeral, useKPIs, useComparecimento } from '@/hooks/useEleicoes';
import { useFilterStore } from '@/stores/filterStore';
import { formatNumber, formatPercent, getPartidoCor } from '@/lib/eleicoes';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { GeoFilterBadge } from '@/components/eleicoes/GeoFilterBadge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import {
  Users, Vote, XCircle, BarChart3,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════════════════════

function KPICard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-card rounded-lg border border-border/40 p-4 flex items-start gap-3">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold tracking-tight leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function KPISkeleton4() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[1,2,3,4].map(i => (
        <div key={i} className="bg-card rounded-lg border border-border/40 p-4 flex items-start gap-3">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Sortable Data Table
// ═══════════════════════════════════════════════════════

type SortKey = 'total_votos' | 'candidato' | 'partido';

const PAGE_SIZE = 30;

export default function Dashboard() {
  const { ano, municipio } = useFilterStore();
  const { data: painel, isLoading: loadingPainel } = usePainelGeral(500);
  const { data: kpis, isLoading: loadingKpis } = useKPIs();
  const { data: comparecimento } = useComparecimento();

  const [sortKey, setSortKey] = useState<SortKey>('total_votos');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);

  // Derived stats
  const comp = comparecimento?.[0] as any;
  const votosValidos = useMemo(() => {
    if (!painel) return 0;
    return painel.reduce((sum: number, r: any) => sum + Number(r.total_votos || 0), 0);
  }, [painel]);

  // Sort + paginate
  const sorted = useMemo(() => {
    if (!painel) return [];
    const arr = [...painel];
    arr.sort((a: any, b: any) => {
      let va: any, vb: any;
      if (sortKey === 'total_votos') { va = Number(a.total_votos || 0); vb = Number(b.total_votos || 0); }
      else if (sortKey === 'candidato') { va = a.candidato || ''; vb = b.candidato || ''; }
      else { va = a.partido || ''; vb = b.partido || ''; }
      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
    return arr;
  }, [painel, sortKey, sortAsc]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key !== 'total_votos'); }
    setPage(0);
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortAsc ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  };

  return (
    <div className="max-w-[1800px] mx-auto space-y-4">
      {/* ── HEADER ── */}
      <div className="flex items-baseline gap-2">
        <h1 className="text-lg font-bold">Painel de Resultados</h1>
        <span className="text-xs text-muted-foreground">{municipio} · {ano}</span>
      </div>

      {/* ── KPIs ── */}
      {loadingKpis ? <KPISkeleton4 /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard
            label="Total Candidatos"
            value={formatNumber(kpis?.totalCandidatos)}
            sub={`${formatNumber(kpis?.totalPartidos)} partidos`}
            icon={Users}
            color="bg-primary/15 text-primary"
          />
          <KPICard
            label="Votos Nominais"
            value={formatNumber(votosValidos)}
            sub={painel ? `${painel.length} candidatos listados` : undefined}
            icon={Vote}
            color="bg-chart-1/15 text-accent-foreground"
          />
          <KPICard
            label="Eleitos"
            value={formatNumber(kpis?.totalEleitos)}
            sub={kpis ? `${formatPercent(kpis.totalCandidatos > 0 ? (kpis.totalEleitos / kpis.totalCandidatos) * 100 : 0)} do total` : undefined}
            icon={BarChart3}
            color="bg-success/15 text-success"
          />
          <KPICard
            label="Comparecimento"
            value={comp ? formatNumber(Number(comp.comparecimento)) : '—'}
            sub={comp ? `${formatPercent(Number(comp.taxa_comparecimento))} dos aptos` : 'Sem dados'}
            icon={XCircle}
            color="bg-warning/15 text-warning"
          />
        </div>
      )}

      {/* ── DATA TABLE ── */}
      <div className="bg-card rounded-lg border border-border/40 overflow-hidden">
        {/* Table header info */}
        <div className="px-4 py-2.5 border-b border-border/30 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Ranking de Candidatos</h2>
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono">
                {sorted.length} resultados
              </Badge>
            </div>
            <div className="text-[10px] text-muted-foreground">
              Página {page + 1} de {totalPages || 1}
            </div>
          </div>
          <GeoFilterBadge />
        </div>

        {loadingPainel ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Nenhum candidato encontrado para os filtros selecionados.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/30">
                    <TableHead className="w-[50px] text-[10px] font-semibold text-muted-foreground">#</TableHead>
                    <TableHead
                      className="text-[10px] font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort('candidato')}
                    >
                      Candidato <SortIcon col="candidato" />
                    </TableHead>
                    <TableHead className="w-[60px] text-[10px] font-semibold text-muted-foreground text-center">Nº</TableHead>
                    <TableHead
                      className="w-[80px] text-[10px] font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort('partido')}
                    >
                      Partido <SortIcon col="partido" />
                    </TableHead>
                    <TableHead className="w-[120px] text-[10px] font-semibold text-muted-foreground">Cargo</TableHead>
                    <TableHead
                      className="w-[100px] text-[10px] font-semibold text-muted-foreground text-right cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort('total_votos')}
                    >
                      Votos <SortIcon col="total_votos" />
                    </TableHead>
                    <TableHead className="w-[60px] text-[10px] font-semibold text-muted-foreground text-right">%</TableHead>
                    <TableHead className="w-[100px] text-[10px] font-semibold text-muted-foreground text-center">Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageData.map((row: any, idx: number) => {
                    const votos = Number(row.total_votos || 0);
                    const pct = votosValidos > 0 ? (votos / votosValidos) * 100 : 0;
                    const pos = page * PAGE_SIZE + idx + 1;
                    const isEleito = row.situacao?.toUpperCase()?.includes('ELEITO') && !row.situacao?.toUpperCase()?.includes('NÃO ELEITO');

                    return (
                      <TableRow
                        key={row.sq_candidato || idx}
                        className={cn(
                          'border-border/20 hover:bg-muted/30 transition-colors',
                          isEleito && 'bg-success/5'
                        )}
                      >
                        <TableCell className="text-xs text-muted-foreground font-mono tabular-nums py-1.5">
                          {pos}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Link
                            to={`/candidato/${row.sq_candidato}`}
                            className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block max-w-[200px]"
                            title={row.candidato}
                          >
                            {row.candidato}
                          </Link>
                          {row.municipio && row.municipio !== municipio && (
                            <span className="text-[10px] text-muted-foreground">{row.municipio}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-center font-mono tabular-nums text-muted-foreground py-1.5">
                          {row.numero}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <span
                            className="text-xs font-semibold px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: getPartidoCor(row.partido) + '20',
                              color: getPartidoCor(row.partido),
                            }}
                          >
                            {row.partido}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[120px] py-1.5">
                          {row.cargo}
                        </TableCell>
                        <TableCell className="text-sm font-bold text-right tabular-nums py-1.5">
                          {votos > 0 ? formatNumber(votos) : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums text-muted-foreground py-1.5">
                          {pct > 0 ? formatPercent(pct, 2) : '—'}
                        </TableCell>
                        <TableCell className="text-center py-1.5">
                          <SituacaoBadge situacao={row.situacao || '—'} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-2 border-t border-border/30 flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} de {sorted.length}
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="ghost" size="sm"
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                    const p = totalPages <= 7 ? i : (page < 4 ? i : page > totalPages - 4 ? totalPages - 7 + i : page - 3 + i);
                    if (p < 0 || p >= totalPages) return null;
                    return (
                      <Button
                        key={p} variant={p === page ? 'default' : 'ghost'}
                        size="sm" onClick={() => setPage(p)}
                        className="h-7 w-7 p-0 text-xs"
                      >
                        {p + 1}
                      </Button>
                    );
                  })}
                  <Button
                    variant="ghost" size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
