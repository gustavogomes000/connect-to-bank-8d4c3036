import { useState, useMemo } from 'react';
import { Pagination } from '@/components/eleicoes/Pagination';
import { usePartidoResumo, usePartidoDetalhe, useDataAvailability, usePatrimonioPorPartido } from '@/hooks/useEleicoes';
import { formatNumber, formatPercent, getPartidoCor, formatBRLCompact, CHART_COLORS } from '@/lib/eleicoes';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { KPISkeleton, ChartSkeleton } from '@/components/eleicoes/Skeletons';
import { ChevronDown, ChevronUp, AlertCircle, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ScatterChart, Scatter,
} from 'recharts';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-popover border border-border rounded-md px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-semibold">{typeof p.value === 'number' && p.value > 1000 ? formatNumber(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function PorPartido() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [partidoPage, setPartidoPage] = useState(0);
  const [partidoPageSize, setPartidoPageSize] = useState(20);
  const navigate = useNavigate();

  const { data: resumoData, isLoading } = usePartidoResumo();
  const { data: detalhe } = usePartidoDetalhe(expanded);
  const { data: patrimPartido, isLoading: loadingPatrim } = usePatrimonioPorPartido();
  const { data: availability } = useDataAvailability();

  const partidos = resumoData?.partidos || [];
  const hasVotos = resumoData?.hasVotos || false;

  if (isLoading) return <KPISkeleton />;

  // Charts data
  const topPartidos = partidos.slice(0, 15);
  const chartCandidatos = topPartidos.map(p => ({ partido: p.partido, candidatos: p.candidatos, eleitos: p.eleitos, mulheres: p.mulheres }));
  const chartVotos = hasVotos ? topPartidos.filter(p => p.votos > 0).map(p => ({ partido: p.partido, votos: p.votos })) : [];
  const chartAproveitamento = topPartidos.filter(p => p.candidatos >= 3).map(p => ({
    partido: p.partido, aproveitamento: p.candidatos > 0 ? Math.round((p.eleitos / p.candidatos) * 100) : 0,
  })).sort((a, b) => b.aproveitamento - a.aproveitamento);

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Target className="w-5 h-5 text-primary" /> Análise por Partido
      </h1>

      {!hasVotos && (
        <div className="bg-secondary/10 border border-secondary/30 rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
          <AlertCircle className="w-3.5 h-3.5 text-secondary shrink-0" />
          <span className="text-muted-foreground">Dados de votação pendentes. Ordenando por candidatos.</span>
        </div>
      )}

      <Tabs defaultValue="visao" className="space-y-4">
        <TabsList>
          <TabsTrigger value="visao">Visão Geral</TabsTrigger>
          <TabsTrigger value="candidatos">Candidatos</TabsTrigger>
          <TabsTrigger value="votos" disabled={!hasVotos}>Votos</TabsTrigger>
          <TabsTrigger value="patrimonio" disabled={!availability?.bens}>Patrimônio</TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="space-y-4">
          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-card rounded-lg border border-border/50 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Candidatos por Partido</h3>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartCandidatos} layout="vertical" margin={{ left: 55 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="partido" tick={{ fontSize: 10 }} width={50} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="candidatos" name="Total" fill="hsl(190, 80%, 45%)" radius={[0, 2, 2, 0]} />
                  <Bar dataKey="eleitos" name="Eleitos" fill="hsl(156, 72%, 40%)" radius={[0, 2, 2, 0]} />
                  <Bar dataKey="mulheres" name="Mulheres" fill="hsl(338, 72%, 60%)" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card rounded-lg border border-border/50 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Taxa de Aproveitamento (%)</h3>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartAproveitamento} layout="vertical" margin={{ left: 55 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="partido" tick={{ fontSize: 10 }} width={50} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="aproveitamento" name="Aproveitamento" radius={[0, 3, 3, 0]}>
                    {chartAproveitamento.map((e, i) => (
                      <Cell key={i} fill={getPartidoCor(e.partido)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Summary table with pagination */}
          <div className="bg-card rounded-lg border border-border/50 overflow-hidden">
            <div className="p-4 pb-0">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resumo Completo</h3>
            </div>
            <div className="overflow-x-auto px-4">
              <table className="w-full text-xs table-striped">
                <thead>
                  <tr className="border-b border-border/30 text-left">
                    <th className="pb-2 px-2 font-medium text-muted-foreground">#</th>
                    <th className="pb-2 px-2 font-medium text-muted-foreground">Partido</th>
                    <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Candidatos</th>
                    <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Eleitos</th>
                    <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Mulheres</th>
                    <th className="pb-2 px-2 font-medium text-muted-foreground text-right">% Aprov.</th>
                    {hasVotos && <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Votos</th>}
                  </tr>
                </thead>
                <tbody>
                  {partidos.slice(partidoPage * partidoPageSize, (partidoPage + 1) * partidoPageSize).map((p, i) => {
                    const aprov = p.candidatos > 0 ? (p.eleitos / p.candidatos) * 100 : 0;
                    return (
                      <tr key={p.partido} className="border-b border-border/20 last:border-0">
                        <td className="py-1.5 px-2 text-muted-foreground">{partidoPage * partidoPageSize + i + 1}</td>
                        <td className="py-1.5 px-2 font-semibold" style={{ color: getPartidoCor(p.partido) }}>{p.partido}</td>
                        <td className="py-1.5 px-2 text-right metric-value">{formatNumber(p.candidatos)}</td>
                        <td className="py-1.5 px-2 text-right text-success metric-value">{formatNumber(p.eleitos)}</td>
                        <td className="py-1.5 px-2 text-right text-secondary metric-value">{formatNumber(p.mulheres)}</td>
                        <td className="py-1.5 px-2 text-right">{formatPercent(aprov)}</td>
                        {hasVotos && <td className="py-1.5 px-2 text-right font-semibold metric-value">{formatNumber(p.votos)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={partidoPage} totalItems={partidos.length} pageSize={partidoPageSize} onPageChange={setPartidoPage} onPageSizeChange={setPartidoPageSize} />
          </div>
        </TabsContent>

        <TabsContent value="candidatos">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {partidos.map((p) => {
              const isExpanded = expanded === p.partido;
              const aproveitamento = p.candidatos > 0 ? (p.eleitos / p.candidatos) * 100 : 0;
              return (
                <div key={p.partido} className="bg-card rounded-lg border border-border/50 overflow-hidden">
                  <button className="w-full p-4 text-left hover:bg-muted/30 transition-colors" onClick={() => setExpanded(isExpanded ? null : p.partido)}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xl font-bold" style={{ color: getPartidoCor(p.partido) }}>{p.partido}</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      <div><p className="text-muted-foreground">Candidatos</p><p className="font-semibold">{formatNumber(p.candidatos)}</p></div>
                      <div><p className="text-muted-foreground">Eleitos</p><p className="font-semibold">{formatNumber(p.eleitos)}</p></div>
                      {hasVotos && <div><p className="text-muted-foreground">Votos</p><p className="font-semibold">{formatNumber(p.votos)}</p></div>}
                      <div><p className="text-muted-foreground">Aproveitamento</p><span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">{formatPercent(aproveitamento)}</span></div>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border/30 p-3 max-h-[280px] overflow-auto">
                      <table className="w-full text-xs table-striped">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="pb-1.5 font-medium text-muted-foreground">Nome</th>
                            <th className="pb-1.5 font-medium text-muted-foreground">Cargo</th>
                            <th className="pb-1.5 font-medium text-muted-foreground">Município</th>
                            <th className="pb-1.5 font-medium text-muted-foreground">Situação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detalhe || []).map((d: any, i: number) => (
                            <tr key={i} className="border-b last:border-0 cursor-pointer hover:bg-primary/5" onClick={() => navigate(`/candidato/${d.id}`)}>
                              <td className="py-1 font-medium">{d.nome_urna}</td>
                              <td className="py-1">{d.cargo}</td>
                              <td className="py-1">{d.municipio}</td>
                              <td className="py-1"><SituacaoBadge situacao={d.situacao_final} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(!detalhe || detalhe.length === 0) && <p className="text-center text-muted-foreground py-3 text-xs">Carregando...</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="votos" className="space-y-4">
          {chartVotos.length > 0 && (
            <div className="bg-card rounded-lg border border-border/50 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Votos por Partido</h3>
              <ResponsiveContainer width="100%" height={450}>
                <BarChart data={chartVotos} layout="vertical" margin={{ left: 55 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatNumber(v)} />
                  <YAxis type="category" dataKey="partido" tick={{ fontSize: 10 }} width={50} />
                  <Tooltip formatter={(v: number) => formatNumber(v)} />
                  <Bar dataKey="votos" name="Total de Votos" radius={[0, 3, 3, 0]}>
                    {chartVotos.map((e, i) => <Cell key={i} fill={getPartidoCor(e.partido)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </TabsContent>

        <TabsContent value="patrimonio" className="space-y-4">
          {loadingPatrim ? <ChartSkeleton /> : patrimPartido && patrimPartido.length > 0 ? (
            <div className="bg-card rounded-lg border border-border/50 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Patrimônio Total por Partido</h3>
              <ResponsiveContainer width="100%" height={450}>
                <BarChart data={patrimPartido} layout="vertical" margin={{ left: 55 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatBRLCompact(v)} />
                  <YAxis type="category" dataKey="partido" tick={{ fontSize: 10 }} width={50} />
                  <Tooltip formatter={(v: number) => formatBRLCompact(v)} />
                  <Bar dataKey="total" name="Patrimônio Total" radius={[0, 3, 3, 0]}>
                    {(patrimPartido || []).map((e: any, i: number) => <Cell key={i} fill={getPartidoCor(e.partido)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-center text-muted-foreground py-8 text-sm">Dados de patrimônio ainda não importados.</p>}
        </TabsContent>
      </Tabs>

      {partidos.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum partido encontrado.</p>}
    </div>
  );
}
