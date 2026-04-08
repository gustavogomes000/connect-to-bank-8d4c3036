import { useState, useMemo } from 'react';
import { useVotosPorBairro, useEscolasPorBairro, useMunicipios, usePainelGeral } from '@/hooks/useEleicoes';
import { useFilterStore } from '@/stores/filterStore';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  MapPin, Search, ChevronDown, ChevronRight, School, Users, Box,
  ChevronLeft, ChevronRight as ChevronR, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const fmt = (n: number | string) => Number(n || 0).toLocaleString('pt-BR');
const PAGE_SIZE = 25;

// ── KPI Card ──
function KPI({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card rounded-lg border border-border/40 p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ── Expandable Row for Bairro ──
function BairroRow({ row, idx, municipio, sqCandidato }: {
  row: Record<string, any>; idx: number; municipio: string; sqCandidato?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <TableCell className="w-8 text-muted-foreground/50 font-mono text-[10px]">{idx}</TableCell>
        <TableCell className="font-medium text-sm">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="w-3.5 h-3.5 text-primary" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            <MapPin className="w-3.5 h-3.5 text-muted-foreground/50" />
            {row.bairro}
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums text-sm">{fmt(row.locais)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm">{fmt(row.secoes)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm font-semibold">{fmt(row.votos)}</TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={5} className="p-0">
            <EscolasSubTable bairro={row.bairro} municipio={municipio} sqCandidato={sqCandidato} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ── Sub-table: Escolas within a Bairro ──
function EscolasSubTable({ bairro, municipio, sqCandidato }: {
  bairro: string; municipio: string; sqCandidato?: string | null;
}) {
  const { data, isLoading } = useEscolasPorBairro(bairro, municipio, sqCandidato);

  if (isLoading) {
    return (
      <div className="px-8 py-3 space-y-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-3.5 w-[200px] rounded" />
            <Skeleton className="h-3.5 w-[150px] rounded" />
            <Skeleton className="h-3.5 w-[60px] rounded" />
            <Skeleton className="h-3.5 w-[80px] rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="px-8 py-4 text-xs text-muted-foreground/50">
        Nenhum local de votação encontrado para este bairro.
      </div>
    );
  }

  return (
    <div className="bg-muted/10 border-t border-border/20">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/20">
            <th className="px-8 py-2 text-left text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Local (Escola)</th>
            <th className="px-3 py-2 text-left text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Endereço</th>
            <th className="px-3 py-2 text-center text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Zona</th>
            <th className="px-3 py-2 text-right text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Seções</th>
            <th className="px-3 py-2 text-right text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Votos</th>
          </tr>
        </thead>
        <tbody>
          {data.map((esc: any, i: number) => (
            <tr key={i} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
              <td className="px-8 py-1.5 font-medium">
                <div className="flex items-center gap-1.5">
                  <School className="w-3 h-3 text-primary/40 shrink-0" />
                  <span className="truncate max-w-[220px]">{esc.local_votacao}</span>
                </div>
              </td>
              <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[200px]">{esc.endereco || '—'}</td>
              <td className="px-3 py-1.5 text-center">{esc.zona}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{fmt(esc.secoes)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmt(esc.votos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Skeleton Loader ──
function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-4 w-6 rounded" />
          <Skeleton className="h-4 w-[180px] rounded" />
          <Skeleton className="h-4 w-[60px] rounded" />
          <Skeleton className="h-4 w-[60px] rounded" />
          <Skeleton className="h-4 w-[80px] rounded" />
        </div>
      ))}
    </div>
  );
}

// ── MAIN ──
export default function InteligenciaGeografica() {
  const { municipio, setMunicipio } = useFilterStore();
  const [search, setSearch] = useState('');
  const [candidatoSearch, setCandidatoSearch] = useState('');
  const [selectedCandidato, setSelectedCandidato] = useState<{ sq: string; nome: string } | null>(null);
  const [page, setPage] = useState(0);

  const { data: municipios } = useMunicipios();
  const { data: candidatos } = usePainelGeral(500);

  const { data: bairrosRaw, isLoading, error } = useVotosPorBairro(municipio, selectedCandidato?.sq);

  // Filter bairros by search
  const bairros = useMemo(() => {
    if (!bairrosRaw) return [];
    if (!search) return bairrosRaw;
    const term = search.toUpperCase();
    return bairrosRaw.filter((b: any) => String(b.bairro || '').toUpperCase().includes(term));
  }, [bairrosRaw, search]);

  // Paginate
  const totalPages = Math.ceil(bairros.length / PAGE_SIZE);
  const paginated = bairros.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // KPIs
  const kpis = useMemo(() => {
    if (!bairrosRaw?.length) return { totalBairros: 0, totalLocais: 0, totalVotos: 0, totalSecoes: 0 };
    return {
      totalBairros: bairrosRaw.length,
      totalLocais: bairrosRaw.reduce((a: number, b: any) => a + Number(b.locais || 0), 0),
      totalVotos: bairrosRaw.reduce((a: number, b: any) => a + Number(b.votos || 0), 0),
      totalSecoes: bairrosRaw.reduce((a: number, b: any) => a + Number(b.secoes || 0), 0),
    };
  }, [bairrosRaw]);

  // Candidate autocomplete
  const candidatoOptions = useMemo(() => {
    if (!candidatos?.length || !candidatoSearch) return [];
    const term = candidatoSearch.toUpperCase();
    return candidatos
      .filter((c: any) => String(c.candidato || '').toUpperCase().includes(term))
      .slice(0, 8);
  }, [candidatos, candidatoSearch]);

  return (
    <div className="space-y-4 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
          <MapPin className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-bold text-foreground tracking-tight">Inteligência Geográfica</h1>
          <p className="text-[10px] text-muted-foreground">Votos por Bairro → Escola · Hierarquia expansível</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Município</label>
          <Select value={municipio} onValueChange={(v) => { setMunicipio(v); setPage(0); }}>
            <SelectTrigger className="w-[220px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(municipios || ['GOIÂNIA', 'APARECIDA DE GOIÂNIA']).map(m => (
                <SelectItem key={m} value={m} className="text-sm">{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 relative">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Candidato (opcional)</label>
          {selectedCandidato ? (
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-primary/30 bg-primary/5 text-sm">
              <span className="font-medium">{selectedCandidato.nome}</span>
              <button onClick={() => { setSelectedCandidato(null); setCandidatoSearch(''); setPage(0); }}>
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Input
                placeholder="Buscar candidato..."
                value={candidatoSearch}
                onChange={(e) => setCandidatoSearch(e.target.value)}
                className="w-[260px] h-9 text-sm pr-8"
              />
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
              {candidatoOptions.length > 0 && (
                <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-xl max-h-[200px] overflow-y-auto">
                  {candidatoOptions.map((c: any) => (
                    <button
                      key={c.sq_candidato}
                      onClick={() => {
                        setSelectedCandidato({ sq: c.sq_candidato, nome: c.candidato });
                        setCandidatoSearch('');
                        setPage(0);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/30 transition-colors flex justify-between"
                    >
                      <span className="font-medium">{c.candidato}</span>
                      <span className="text-muted-foreground">{c.partido} · {c.cargo}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Buscar Bairro</label>
          <div className="relative">
            <Input
              placeholder="Filtrar bairro..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="w-[200px] h-9 text-sm pr-8"
            />
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI icon={MapPin} label="Bairros" value={fmt(kpis.totalBairros)} sub={selectedCandidato ? `para ${selectedCandidato.nome}` : undefined} />
        <KPI icon={School} label="Locais de Votação" value={fmt(kpis.totalLocais)} />
        <KPI icon={Box} label="Seções" value={fmt(kpis.totalSecoes)} />
        <KPI icon={Users} label="Total de Votos" value={fmt(kpis.totalVotos)} />
      </div>

      {/* Selected candidate badge */}
      {selectedCandidato && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs border-primary/20 text-primary">
            Filtrando por: {selectedCandidato.nome}
          </Badge>
          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { setSelectedCandidato(null); setPage(0); }}>
            Limpar filtro
          </Button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 text-center">
          <p className="text-sm text-destructive">Erro ao carregar dados geográficos</p>
          <p className="text-xs text-muted-foreground mt-1">{(error as Error).message}</p>
        </div>
      ) : !bairros.length ? (
        <div className="bg-card border border-border/40 rounded-lg p-8 text-center">
          <MapPin className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum bairro encontrado{search ? ` para "${search}"` : ''}</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border/40 overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-8 text-[9px]">#</TableHead>
                  <TableHead className="text-[9px] uppercase tracking-wider">Bairro</TableHead>
                  <TableHead className="text-right text-[9px] uppercase tracking-wider">Locais</TableHead>
                  <TableHead className="text-right text-[9px] uppercase tracking-wider">Seções</TableHead>
                  <TableHead className="text-right text-[9px] uppercase tracking-wider">Votos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((row: any, i: number) => (
                  <BairroRow
                    key={row.bairro}
                    row={row}
                    idx={page * PAGE_SIZE + i + 1}
                    municipio={municipio}
                    sqCandidato={selectedCandidato?.sq}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] text-muted-foreground">
                {bairros.length} bairros · Página {page + 1} de {totalPages}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Anterior
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  Próxima <ChevronR className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
