import { useState, useMemo } from 'react';
import { useVotacaoZonaCidade, useTopVotadosCidade, useBairrosCidade } from '@/hooks/useInteligenciaTerritorial';
import { useFilterStore } from '@/stores/filterStore';
import { formatNumber, formatPercent, getPartidoCor } from '@/lib/eleicoes';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { MapPin, Users, BarChart3, Target, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

const CIDADES = ['GOIÂNIA', 'APARECIDA DE GOIÂNIA'] as const;

// ═══════════════════════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════════════════════

function KPI({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: React.ElementType }) {
  return (
    <div className="bg-card rounded-lg border border-border/40 p-3 flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-xl font-bold tabular-nums tracking-tight">{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Heatmap scatter
// ═══════════════════════════════════════════════════════

function ZonaHeatmap({ data }: { data: { zona: number; apto: number; comp: number; abst: number }[] }) {
  const scatterData = data.map(d => ({
    x: d.zona,
    y: d.comp,
    z: d.apto,
    abstPct: d.apto > 0 ? (d.abst / d.apto) * 100 : 0,
  }));

  const maxComp = Math.max(...scatterData.map(d => d.y), 1);

  return (
    <div className="bg-card rounded-lg border border-border/40 p-3">
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Mapa de Calor — Zonas × Comparecimento
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{ top: 8, right: 8, bottom: 20, left: 24 }}>
          <XAxis dataKey="x" name="Zona" type="number" tick={{ fontSize: 10 }} label={{ value: 'Zona', position: 'bottom', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis dataKey="y" name="Comparecimento" type="number" tick={{ fontSize: 10 }} tickFormatter={v => (v / 1000).toFixed(0) + 'k'} label={{ value: 'Comp.', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
          <Tooltip
            formatter={(value: number, name: string) => [formatNumber(value), name === 'y' ? 'Comparecimento' : name]}
            labelFormatter={v => `Zona ${v}`}
            contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
          />
          <Scatter data={scatterData} shape="circle">
            {scatterData.map((entry, i) => {
              const intensity = entry.y / maxComp;
              const hue = 220 - intensity * 180; // blue → red
              return <Cell key={i} fill={`hsl(${hue}, 70%, 50%)`} r={Math.max(6, (entry.z / Math.max(...scatterData.map(s => s.z))) * 18)} />;
            })}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <p className="text-[9px] text-muted-foreground text-center mt-1">Tamanho = Eleitores aptos · Cor = Intensidade de comparecimento</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

export default function InteligenciaZonal() {
  const { ano } = useFilterStore();
  const [cidade, setCidade] = useState<string>('GOIÂNIA');
  const [zonaSelecionada, setZonaSelecionada] = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<'zona' | 'apto' | 'comp' | 'abst'>('apto');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: zonas, isLoading: loadingZonas } = useVotacaoZonaCidade(cidade, ano);
  const { data: topVotados } = useTopVotadosCidade(cidade, ano, null);
  const { data: bairros } = useBairrosCidade(cidade, ano);

  // KPIs agregados
  const kpis = useMemo(() => {
    if (!zonas || zonas.length === 0) return { totalZonas: 0, totalApto: 0, totalComp: 0, totalAbst: 0, pctAbst: 0 };
    const totalApto = zonas.reduce((s, z) => s + z.apto, 0);
    const totalComp = zonas.reduce((s, z) => s + z.comp, 0);
    const totalAbst = zonas.reduce((s, z) => s + z.abst, 0);
    return { totalZonas: zonas.length, totalApto, totalComp, totalAbst, pctAbst: totalApto > 0 ? (totalAbst / totalApto) * 100 : 0 };
  }, [zonas]);

  // Partido e candidato mais votado por zona (aproximação: global top)
  const topCandidatoGlobal = topVotados?.[0];
  const topPartidoPorZona = useMemo(() => {
    if (!topVotados) return {};
    const map: Record<number, { partido: string; candidato: string; votos: number }> = {};
    // Simple: attribute the globally top candidate's party to each zone they appeared in
    topVotados.forEach((c: any) => {
      // We don't have per-zone breakdown here, so we show global top
    });
    return map;
  }, [topVotados]);

  // Sort zonas
  const sortedZonas = useMemo(() => {
    if (!zonas) return [];
    return [...zonas].sort((a, b) => {
      const va = a[sortCol], vb = b[sortCol];
      return sortDir === 'desc' ? vb - va : va - vb;
    });
  }, [zonas, sortCol, sortDir]);

  function handleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const SortIcon = ({ col }: { col: typeof sortCol }) => (
    <span className={cn('text-[9px] ml-0.5', sortCol === col ? 'text-primary' : 'text-muted-foreground/40')}>
      {sortCol === col ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}
    </span>
  );

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" /> Inteligência Zonal
          </h1>
          <p className="text-[11px] text-muted-foreground">Análise por zona eleitoral · {ano}</p>
        </div>

        {/* Toggle Cidade */}
        <div className="flex bg-muted/40 rounded-lg border border-border/40 p-0.5">
          {CIDADES.map(c => (
            <button
              key={c}
              onClick={() => { setCidade(c); setZonaSelecionada(null); }}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                cidade === c ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <MapPin className="w-3 h-3 inline mr-1" />{c === 'GOIÂNIA' ? 'Goiânia' : 'Aparecida'}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI icon={Target} label="Zonas Eleitorais" value={String(kpis.totalZonas)} />
        <KPI icon={Users} label="Eleitores Aptos" value={formatNumber(kpis.totalApto)} />
        <KPI icon={Activity} label="Comparecimento" value={formatNumber(kpis.totalComp)} sub={kpis.totalApto > 0 ? formatPercent((kpis.totalComp / kpis.totalApto) * 100) : ''} />
        <KPI icon={BarChart3} label="Abstenção" value={formatPercent(kpis.pctAbst)} sub={formatNumber(kpis.totalAbst) + ' eleitores'} />
      </div>

      {/* ── BODY: TABELA + HEATMAP ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tabela Principal */}
        <div className="lg:col-span-2 bg-card rounded-lg border border-border/40 overflow-hidden">
          <div className="px-3 py-2 border-b border-border/30">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ranking de Zonas — {cidade === 'GOIÂNIA' ? 'Goiânia' : 'Aparecida de Goiânia'}</h2>
          </div>

          {loadingZonas ? (
            <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : sortedZonas.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Sem dados de zonas.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/30">
                    <TableHead className="text-[10px] font-semibold text-muted-foreground cursor-pointer w-[70px]" onClick={() => handleSort('zona')}>
                      Zona <SortIcon col="zona" />
                    </TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground cursor-pointer text-right" onClick={() => handleSort('apto')}>
                      Eleitores <SortIcon col="apto" />
                    </TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground cursor-pointer text-right" onClick={() => handleSort('comp')}>
                      Comparecimento <SortIcon col="comp" />
                    </TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground cursor-pointer text-right" onClick={() => handleSort('abst')}>
                      Abstenção <SortIcon col="abst" />
                    </TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground text-right w-[80px]">% Abst.</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground w-[110px]">Brancos/Nulos</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground w-[140px]">Participação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedZonas.map(z => {
                    const pctAbst = z.apto > 0 ? (z.abst / z.apto) * 100 : 0;
                    const pctComp = z.apto > 0 ? (z.comp / z.apto) * 100 : 0;
                    const isSelected = zonaSelecionada === z.zona;
                    return (
                      <TableRow
                        key={z.zona}
                        className={cn(
                          'border-border/20 cursor-pointer transition-colors',
                          isSelected ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-muted/30'
                        )}
                        onClick={() => setZonaSelecionada(isSelected ? null : z.zona)}
                      >
                        <TableCell className="py-1.5">
                          <Badge variant="outline" className="text-xs font-mono tabular-nums">{z.zona}</Badge>
                        </TableCell>
                        <TableCell className="text-sm font-bold text-right tabular-nums py-1.5">{formatNumber(z.apto)}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums py-1.5">{formatNumber(z.comp)}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums py-1.5">{formatNumber(z.abst)}</TableCell>
                        <TableCell className={cn('text-xs text-right tabular-nums py-1.5 font-medium', pctAbst > 25 ? 'text-destructive' : 'text-muted-foreground')}>
                          {formatPercent(pctAbst)}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground tabular-nums py-1.5">
                          {formatNumber(z.brancos)} / {formatNumber(z.nulos)}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${Math.min(pctComp, 100)}%` }} />
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground w-9 text-right">{pctComp.toFixed(0)}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Painel Lateral */}
        <div className="space-y-4">
          {/* Heatmap */}
          {zonas && zonas.length > 0 && <ZonaHeatmap data={zonas} />}

          {/* Detalhes da zona selecionada */}
          {zonaSelecionada && (
            <div className="bg-card rounded-lg border border-border/40 p-3">
              <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-primary" />
                Zona {zonaSelecionada} — Detalhes
              </h3>
              {(() => {
                const z = zonas?.find(z => z.zona === zonaSelecionada);
                if (!z) return <p className="text-xs text-muted-foreground">Sem dados.</p>;
                const pctComp = z.apto > 0 ? (z.comp / z.apto) * 100 : 0;
                const pctAbst = z.apto > 0 ? (z.abst / z.apto) * 100 : 0;
                return (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-muted/20 rounded p-2">
                        <p className="text-[9px] text-muted-foreground uppercase">Eleitores</p>
                        <p className="text-sm font-bold tabular-nums">{formatNumber(z.apto)}</p>
                      </div>
                      <div className="bg-muted/20 rounded p-2">
                        <p className="text-[9px] text-muted-foreground uppercase">Comparec.</p>
                        <p className="text-sm font-bold tabular-nums">{formatPercent(pctComp)}</p>
                      </div>
                      <div className="bg-muted/20 rounded p-2">
                        <p className="text-[9px] text-muted-foreground uppercase">Abstenção</p>
                        <p className={cn('text-sm font-bold tabular-nums', pctAbst > 25 ? 'text-destructive' : '')}>{formatPercent(pctAbst)}</p>
                      </div>
                      <div className="bg-muted/20 rounded p-2">
                        <p className="text-[9px] text-muted-foreground uppercase">Brancos/Nulos</p>
                        <p className="text-sm font-bold tabular-nums">{formatNumber(z.brancos + z.nulos)}</p>
                      </div>
                    </div>

                    {/* Candidato mais votado (global) */}
                    {topCandidatoGlobal && (
                      <div className="bg-muted/20 rounded p-2 mt-1">
                        <p className="text-[9px] text-muted-foreground uppercase">Mais votado (cidade)</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-bold">{topCandidatoGlobal.nome}</span>
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: getPartidoCor(topCandidatoGlobal.partido) + '20', color: getPartidoCor(topCandidatoGlobal.partido) }}
                          >
                            {topCandidatoGlobal.partido}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{formatNumber(topCandidatoGlobal.votos)} votos</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Bairros accordion */}
          {bairros && bairros.length > 0 && (
            <div className="bg-card rounded-lg border border-border/40 p-3">
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Bairros com mais eleitores
              </h3>
              <Accordion type="single" collapsible>
                {bairros.slice(0, 8).map((b, i) => (
                  <AccordionItem key={i} value={`b-${i}`} className="border-border/20">
                    <AccordionTrigger className="py-1.5 text-xs hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-2">
                        <span className="font-medium truncate max-w-[140px]">{b.bairro}</span>
                        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">{formatNumber(b.apto)}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-2">
                      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                        <div><span className="text-muted-foreground">Comparec.: </span><span className="font-bold tabular-nums">{formatNumber(b.comp)}</span></div>
                        <div><span className="text-muted-foreground">Abstenção: </span><span className="font-bold tabular-nums">{formatNumber(b.abst)}</span></div>
                        <div><span className="text-muted-foreground">Locais: </span><span className="font-bold">{b.locais}</span></div>
                        <div><span className="text-muted-foreground">Seções: </span><span className="font-bold">{b.secoes}</span></div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
