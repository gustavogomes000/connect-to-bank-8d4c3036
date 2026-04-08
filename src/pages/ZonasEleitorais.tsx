import { useState, useMemo } from 'react';
import { useFilterStore } from '@/stores/filterStore';
import { useLocaisVotacao, useComparecimento, usePainelGeral } from '@/hooks/useEleicoes';
import { formatNumber, formatPercent, getPartidoCor } from '@/lib/eleicoes';
import { GeoFilterBadge } from '@/components/eleicoes/GeoFilterBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Link } from 'react-router-dom';
import {
  Hash, MapPin, School, Users, Vote, Search, ChevronDown, ChevronRight, BarChart3, Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { mdQuery, getTableName, getAnosDisponiveis } from '@/lib/motherduck';
import { useQuery } from '@tanstack/react-query';

const fmt = (n: number | string) => Number(n || 0).toLocaleString('pt-BR');

function KPI({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
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

/** Hook: top candidatos por zona selecionada */
function useVotosPorZona(zona: number | null) {
  const { ano, municipio } = useFilterStore();
  return useQuery({
    queryKey: ['votosPorZona', ano, municipio, zona],
    queryFn: async () => {
      if (!zona || !getAnosDisponiveis('votacao').includes(ano)) return [];
      const vot = getTableName('votacao', ano);
      const cand = getTableName('candidatos', ano);
      const rows = await mdQuery<any>(`
        SELECT
          c.NM_URNA_CANDIDATO AS candidato,
          c.SG_PARTIDO AS partido,
          c.DS_CARGO AS cargo,
          c.SQ_CANDIDATO AS sq_candidato,
          c.NR_CANDIDATO AS numero,
          SUM(v.QT_VOTOS_NOMINAIS) AS total_votos
        FROM ${vot} v
        JOIN ${cand} c ON v.SQ_CANDIDATO = c.SQ_CANDIDATO
        WHERE v.NM_MUNICIPIO = '${municipio}'
          AND v.NR_ZONA = ${zona}
        GROUP BY c.NM_URNA_CANDIDATO, c.SG_PARTIDO, c.DS_CARGO, c.SQ_CANDIDATO, c.NR_CANDIDATO
        ORDER BY total_votos DESC
        LIMIT 30
      `);
      return rows;
    },
    enabled: !!zona && !!municipio,
    staleTime: 5 * 60 * 1000,
  });
}

export default function ZonasEleitorais() {
  const { municipio, ano } = useFilterStore();
  const { data: locais, isLoading: loadingLocais } = useLocaisVotacao();
  const { data: comparecimento } = useComparecimento();
  const { data: painel, isLoading: loadingPainel } = usePainelGeral(500);
  const [search, setSearch] = useState('');
  const [expandedZona, setExpandedZona] = useState<number | null>(null);

  const { data: votosDaZona, isLoading: loadingVotosZona } = useVotosPorZona(expandedZona);

  const zonas = useMemo(() => {
    if (!locais) return [];
    const map = new Map<number, { zona: number; locais: number; secoes: number; eleitores: number; bairros: Set<string> }>();
    (locais as any[]).forEach((r: any) => {
      const z = Number(r.zona);
      if (!map.has(z)) map.set(z, { zona: z, locais: 0, secoes: 0, eleitores: 0, bairros: new Set() });
      const entry = map.get(z)!;
      entry.locais++;
      entry.secoes += Number(r.secoes || 0);
      entry.eleitores += Number(r.eleitores || 0);
      if (r.bairro) entry.bairros.add(r.bairro);
    });
    return Array.from(map.values())
      .map(z => ({ ...z, totalBairros: z.bairros.size }))
      .sort((a, b) => b.eleitores - a.eleitores);
  }, [locais]);

  const locaisZona = useMemo(() => {
    if (!locais || expandedZona === null) return [];
    return (locais as any[]).filter((r: any) => Number(r.zona) === expandedZona)
      .sort((a: any, b: any) => Number(b.eleitores || 0) - Number(a.eleitores || 0));
  }, [locais, expandedZona]);

  const topCandidatos = useMemo(() => {
    if (!painel) return [];
    return (painel as any[])
      .filter((r: any) => Number(r.total_votos || 0) > 0)
      .sort((a: any, b: any) => Number(b.total_votos) - Number(a.total_votos))
      .slice(0, 20);
  }, [painel]);

  const totalZonas = zonas.length;
  const totalLocais = zonas.reduce((s, z) => s + z.locais, 0);
  const totalSecoes = zonas.reduce((s, z) => s + z.secoes, 0);
  const totalEleitores = zonas.reduce((s, z) => s + z.eleitores, 0);
  const comp = comparecimento?.[0] as any;

  const filteredZonas = search
    ? zonas.filter(z => z.zona.toString().includes(search))
    : zonas;

  if (!municipio) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
        <Hash className="w-10 h-10 opacity-30" />
        <p className="text-sm">Selecione um município nos filtros para ver as zonas eleitorais.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[1800px] mx-auto">
      <div>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Hash className="w-5 h-5 text-primary" />
          Zonas Eleitorais
        </h1>
        <p className="text-xs text-muted-foreground">{municipio} · {ano} — Análise unificada por zona eleitoral</p>
      </div>

      <GeoFilterBadge />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KPI icon={Hash} label="Zonas" value={loadingLocais ? '...' : fmt(totalZonas)} />
        <KPI icon={School} label="Locais de Votação" value={loadingLocais ? '...' : fmt(totalLocais)} />
        <KPI icon={Building2} label="Seções (Urnas)" value={loadingLocais ? '...' : fmt(totalSecoes)} />
        <KPI icon={Users} label="Eleitores Aptos" value={loadingLocais ? '...' : fmt(totalEleitores)} />
        <KPI icon={Vote} label="Comparecimento" value={comp ? `${formatPercent(Number(comp.taxa_comparecimento))}` : '—'}
          sub={comp ? `${fmt(Number(comp.comparecimento))} de ${fmt(Number(comp.eleitores))}` : undefined} />
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar zona..." value={search} onChange={e => setSearch(e.target.value)}
          className="pl-9 h-8 text-xs bg-card border-border/50" />
      </div>

      <Tabs defaultValue="zonas">
        <TabsList className="bg-muted/30 border border-border/30">
          <TabsTrigger value="zonas" className="text-xs gap-1.5"><Hash className="w-3.5 h-3.5" /> Por Zona</TabsTrigger>
          <TabsTrigger value="candidatos" className="text-xs gap-1.5"><Vote className="w-3.5 h-3.5" /> Top Candidatos</TabsTrigger>
        </TabsList>

        <TabsContent value="zonas" className="mt-3">
          <Card className="border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-8" />
                    <TableHead className="text-xs font-semibold">Zona</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Bairros</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Locais</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Seções</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Eleitores</TableHead>
                    <TableHead className="text-xs font-semibold w-[160px]">Representatividade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingLocais ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredZonas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-8">
                        Nenhuma zona encontrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredZonas.map((z) => {
                      const isExpanded = expandedZona === z.zona;
                      const pct = totalEleitores > 0 ? (z.eleitores / totalEleitores) * 100 : 0;
                      return (
                        <>{/* Zone row */}
                          <TableRow
                            key={z.zona}
                            className={cn('cursor-pointer transition-colors', isExpanded && 'bg-primary/5')}
                            onClick={() => setExpandedZona(isExpanded ? null : z.zona)}
                          >
                            <TableCell className="w-8 px-2">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                            </TableCell>
                            <TableCell>
                              <span className="text-sm font-bold text-foreground">Zona {z.zona}</span>
                            </TableCell>
                            <TableCell className="text-xs text-right font-medium">{z.totalBairros}</TableCell>
                            <TableCell className="text-xs text-right font-medium">{fmt(z.locais)}</TableCell>
                            <TableCell className="text-xs text-right font-medium">{fmt(z.secoes)}</TableCell>
                            <TableCell className="text-sm text-right font-bold text-primary">{fmt(z.eleitores)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={pct} className="h-1.5 flex-1" />
                                <span className="text-[10px] text-muted-foreground w-10 text-right">{formatPercent(pct, 1)}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                          {/* Expanded: locais + top candidatos da zona */}
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={7} className="p-0">
                                <div className="bg-muted/20 border-t border-border/30 p-4">
                                  {/* Colégios */}
                                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
                                    Colégios eleitorais da Zona {z.zona} ({locaisZona.length} locais)
                                  </p>
                                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 mb-4">
                                    {locaisZona.map((l: any, i: number) => (
                                      <div key={i} className="bg-card rounded-lg border border-border/40 p-3">
                                        <div className="flex items-start gap-2">
                                          <School className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                          <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold leading-tight truncate">{l.local_votacao}</p>
                                            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                              <MapPin className="w-3 h-3" />{l.bairro || 'Bairro não informado'}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/20">
                                          <Badge variant="outline" className="text-[9px] h-5">{fmt(l.secoes)} seções</Badge>
                                          <span className="text-xs font-bold text-primary">{fmt(l.eleitores)} eleitores</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Top candidatos da zona */}
                                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                                    Top candidatos na Zona {z.zona}
                                  </p>
                                  {loadingVotosZona ? (
                                    <div className="space-y-1">
                                      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
                                    </div>
                                  ) : !votosDaZona?.length ? (
                                    <p className="text-xs text-muted-foreground">Sem dados de votação por zona.</p>
                                  ) : (
                                    <div className="overflow-x-auto rounded-lg border border-border/30">
                                      <Table>
                                        <TableHeader>
                                          <TableRow className="bg-muted/20 hover:bg-muted/20">
                                            <TableHead className="text-[10px] w-8">#</TableHead>
                                            <TableHead className="text-[10px]">Candidato</TableHead>
                                            <TableHead className="text-[10px]">Nº</TableHead>
                                            <TableHead className="text-[10px]">Partido</TableHead>
                                            <TableHead className="text-[10px]">Cargo</TableHead>
                                            <TableHead className="text-[10px] text-right">Votos</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {votosDaZona.map((c: any, i: number) => (
                                            <TableRow key={i} className="border-border/20">
                                              <TableCell className="text-[10px] text-muted-foreground">{i + 1}</TableCell>
                                              <TableCell>
                                                <Link to={`/candidato/${c.sq_candidato}`} className="text-xs font-medium hover:text-primary transition-colors">
                                                  {c.candidato}
                                                </Link>
                                              </TableCell>
                                              <TableCell className="text-xs font-mono text-muted-foreground">{c.numero}</TableCell>
                                              <TableCell>
                                                <span className="text-[10px] font-bold px-1 py-0.5 rounded"
                                                  style={{ backgroundColor: getPartidoCor(c.partido) + '20', color: getPartidoCor(c.partido) }}>
                                                  {c.partido}
                                                </span>
                                              </TableCell>
                                              <TableCell className="text-xs text-muted-foreground">{c.cargo}</TableCell>
                                              <TableCell className="text-sm font-bold text-right text-primary">{formatNumber(Number(c.total_votos))}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="candidatos" className="mt-3">
          <Card className="border-border/50 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/30">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Top Candidatos por Votos — {municipio} {ano}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-[40px] text-[10px]">#</TableHead>
                    <TableHead className="text-[10px]">Candidato</TableHead>
                    <TableHead className="text-[10px] w-[60px] text-center">Nº</TableHead>
                    <TableHead className="text-[10px] w-[80px]">Partido</TableHead>
                    <TableHead className="text-[10px]">Cargo</TableHead>
                    <TableHead className="text-[10px] text-right">Votos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingPainel ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : topCandidatos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-8">
                        Sem dados de votação.
                      </TableCell>
                    </TableRow>
                  ) : (
                    topCandidatos.map((c: any, i: number) => (
                      <TableRow key={i} className="border-border/20 hover:bg-muted/30">
                        <TableCell className="text-xs text-muted-foreground font-mono">{i + 1}</TableCell>
                        <TableCell>
                          <Link to={`/candidato/${c.sq_candidato}`}
                            className="text-xs font-medium hover:text-primary transition-colors">
                            {c.candidato}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-center font-mono text-muted-foreground">{c.numero}</TableCell>
                        <TableCell>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: getPartidoCor(c.partido) + '20', color: getPartidoCor(c.partido) }}>
                            {c.partido}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.cargo}</TableCell>
                        <TableCell className="text-sm font-bold text-right text-primary">{formatNumber(Number(c.total_votos))}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {!loadingLocais && zonas.length > 0 && (
        <p className="text-[10px] text-muted-foreground text-right">
          {totalZonas} zonas · {totalLocais} locais · {fmt(totalEleitores)} eleitores · Fonte: TSE
        </p>
      )}
    </div>
  );
}
