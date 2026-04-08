import { useState, useMemo } from 'react';
import { useLocaisVotacao, useSecoesLocal } from '@/hooks/useEleicoes';
import { useFilterStore } from '@/stores/filterStore';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { School, MapPin, ChevronDown, ChevronRight, Search, LayoutGrid, Users, Box } from 'lucide-react';
import { cn } from '@/lib/utils';

const fmt = (n: number) => Number(n || 0).toLocaleString('pt-BR');

function KPICard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <Card className="bg-card border-border/50">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function SecoesExpandidas({ localVotacao }: { localVotacao: string }) {
  const { data, isLoading } = useSecoesLocal(localVotacao);

  if (isLoading) return (
    <tr><td colSpan={6} className="p-3"><Skeleton className="h-8 w-full" /></td></tr>
  );

  const secoes = (data || []) as any[];
  if (!secoes.length) return (
    <tr><td colSpan={6} className="p-3 text-xs text-muted-foreground">Nenhuma seção encontrada.</td></tr>
  );

  return (
    <tr>
      <td colSpan={6} className="p-0">
        <div className="bg-muted/30 border-t border-border/30 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">
            Seções deste local ({secoes.length} seções)
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {secoes.map((s: any, i: number) => (
              <div key={i} className="bg-card rounded border border-border/40 p-2 text-xs">
                <span className="font-mono font-bold text-foreground">Seção {s.secao}</span>
                <span className="text-muted-foreground ml-1">· Zona {s.zona}</span>
                <p className="text-primary font-semibold">{fmt(s.eleitores)} eleitores</p>
              </div>
            ))}
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function EscolasEleitorais() {
  const municipio = useFilterStore((s) => s.municipio);
  const { data, isLoading } = useLocaisVotacao();
  const [search, setSearch] = useState('');
  const [expandedLocal, setExpandedLocal] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'eleitores' | 'secoes' | 'local_votacao'>('eleitores');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const locais = useMemo(() => {
    let rows = (data || []) as any[];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r: any) =>
        (r.local_votacao || '').toLowerCase().includes(q) ||
        (r.bairro || '').toLowerCase().includes(q) ||
        (r.endereco || '').toLowerCase().includes(q)
      );
    }
    rows.sort((a: any, b: any) => {
      const av = sortKey === 'local_votacao' ? (a[sortKey] || '') : Number(a[sortKey] || 0);
      const bv = sortKey === 'local_votacao' ? (b[sortKey] || '') : Number(b[sortKey] || 0);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }, [data, search, sortKey, sortDir]);

  const totalEscolas = locais.length;
  const totalSecoes = locais.reduce((s: number, r: any) => s + Number(r.secoes || 0), 0);
  const totalEleitores = locais.reduce((s: number, r: any) => s + Number(r.eleitores || 0), 0);
  const mediaPorSecao = totalSecoes > 0 ? Math.round(totalEleitores / totalSecoes) : 0;

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const SortIcon = ({ col }: { col: string }) => (
    sortKey === col ? <span className="ml-1 text-primary">{sortDir === 'desc' ? '↓' : '↑'}</span> : null
  );

  if (!municipio) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
        <School className="w-10 h-10 opacity-30" />
        <p className="text-sm">Selecione um município nos filtros para ver os locais de votação.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <School className="w-5 h-5 text-primary" />
          Escolas & Locais de Votação
        </h1>
        <p className="text-xs text-muted-foreground">{municipio} — Raio-X estrutural da logística eleitoral</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard icon={School} label="Locais Mapeados" value={isLoading ? '...' : fmt(totalEscolas)} />
        <KPICard icon={Box} label="Total de Urnas (Seções)" value={isLoading ? '...' : fmt(totalSecoes)} />
        <KPICard icon={Users} label="Total de Eleitores" value={isLoading ? '...' : fmt(totalEleitores)} />
        <KPICard icon={LayoutGrid} label="Média Eleitores/Seção" value={isLoading ? '...' : fmt(mediaPorSecao)} />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar escola, bairro ou endereço..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm bg-card border-border/50"
        />
      </div>

      {/* Table */}
      <Card className="border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-8" />
                <TableHead className="cursor-pointer select-none text-xs" onClick={() => toggleSort('local_votacao')}>
                  Local de Votação <SortIcon col="local_votacao" />
                </TableHead>
                <TableHead className="text-xs">Zona</TableHead>
                <TableHead className="text-xs">Bairro</TableHead>
                <TableHead className="cursor-pointer select-none text-xs text-right" onClick={() => toggleSort('secoes')}>
                  Seções <SortIcon col="secoes" />
                </TableHead>
                <TableHead className="cursor-pointer select-none text-xs text-right" onClick={() => toggleSort('eleitores')}>
                  Eleitores <SortIcon col="eleitores" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : locais.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-8">
                    Nenhum local encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                locais.map((r: any, idx: number) => {
                  const isExpanded = expandedLocal === r.local_votacao;
                  return (
                    <>
                      <TableRow
                        key={r.local_votacao + idx}
                        className={cn(
                          'cursor-pointer transition-colors',
                          isExpanded && 'bg-primary/5'
                        )}
                        onClick={() => setExpandedLocal(isExpanded ? null : r.local_votacao)}
                      >
                        <TableCell className="w-8 px-2">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4 text-primary" />
                            : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          }
                        </TableCell>
                        <TableCell className="text-xs font-medium text-foreground max-w-[300px]">
                          <div className="flex items-start gap-1.5">
                            <School className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                            <div>
                              <p className="leading-tight">{r.local_votacao}</p>
                              {r.endereco && (
                                <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-3 h-3" />{r.endereco}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{r.zona}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.bairro || '—'}</TableCell>
                        <TableCell className="text-xs text-right font-semibold">{fmt(r.secoes)}</TableCell>
                        <TableCell className="text-xs text-right font-bold text-primary">{fmt(r.eleitores)}</TableCell>
                      </TableRow>
                      {isExpanded && <SecoesExpandidas localVotacao={r.local_votacao} />}
                    </>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Footer */}
      {!isLoading && locais.length > 0 && (
        <p className="text-[10px] text-muted-foreground text-right">
          Exibindo {locais.length} locais · Fonte: TSE — Eleitorado por Local de Votação
        </p>
      )}
    </div>
  );
}
