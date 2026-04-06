import { useTabelas } from '@/hooks/useBigQuery';
import {
  useKPIs, useCheckEmpty,
  useCandidatosPorPartido, useDistribuicaoGenero,
  useSituacaoFinal, useEvolucaoPorAno,
  useTopPatrimonio, useCandidatosPorCargo, useMunicipiosRanking,
  useFaixaEtaria, useDataAvailability,
} from '@/hooks/useEleicoes';
import { formatNumber, formatPercent, getPartidoCor, CHART_COLORS, SITUACAO_CORES, formatBRLCompact } from '@/lib/eleicoes';
import { KPISkeleton, ChartSkeleton, TableSkeleton } from '@/components/eleicoes/Skeletons';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { EmptyState } from '@/components/eleicoes/EmptyState';
import { Users, CheckCircle, UserCheck, Building, MapPin, BarChart3, Database, Loader2, Vote, TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';

function Card({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <div className={`bg-card rounded-lg border border-border/50 p-4 ${className}`}>
      {title && <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</h3>}
      {children}
    </div>
  );
}

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

function useComparecimentoGeral() {
  const { ano } = useFilterStore();
  return useQuery({
    queryKey: ['comparecimentoGeral', ano],
    queryFn: async () => {
      let q = (supabase.from('bd_eleicoes_comparecimento' as any) as any)
        .select('ano, eleitorado_apto, comparecimento, abstencoes, votos_brancos, votos_nulos');
      if (ano) q = q.eq('ano', ano);
      const { data } = await q.limit(1000);
      if (!data || data.length === 0) return null;
      const totals = (data as any[]).reduce((acc: any, r: any) => ({
        apto: acc.apto + (r.eleitorado_apto || 0),
        comp: acc.comp + (r.comparecimento || 0),
        abst: acc.abst + (r.abstencoes || 0),
        brancos: acc.brancos + (r.votos_brancos || 0),
        nulos: acc.nulos + (r.votos_nulos || 0),
      }), { apto: 0, comp: 0, abst: 0, brancos: 0, nulos: 0 });
      return totals;
    },
  });
}

function BigQueryStatus() {
  const { data: tabelas, isLoading } = useTabelas();
  if (isLoading) return (
    <Card className="col-span-full">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Loader2 className="w-3 h-3 animate-spin" />Conectando ao BigQuery...
      </div>
    </Card>
  );
  if (!tabelas) return null;
  const totalLinhas = tabelas.reduce((s, t) => s + Number(t.linhas), 0);
  const totalMB = tabelas.reduce((s, t) => s + Number(t.tamanho_mb), 0);
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Database className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground">BigQuery Conectado</p>
          <p className="text-[10px] text-muted-foreground">
            {tabelas.length} tabelas • {totalLinhas.toLocaleString('pt-BR')} registros • {totalMB.toFixed(0)} MB
          </p>
        </div>
        <Link to="/explorador" className="ml-auto text-xs text-primary hover:underline">Explorar →</Link>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { data: isEmpty, isLoading: loadingEmpty } = useCheckEmpty();
  const { data: kpis, isLoading: loadingKPIs } = useKPIs();
  const { data: porPartido, isLoading: loadingPartido } = useCandidatosPorPartido();
  const { data: genero, isLoading: loadingGenero } = useDistribuicaoGenero();
  const { data: situacao, isLoading: loadingSit } = useSituacaoFinal();
  const { data: evolucao, isLoading: loadingEvol } = useEvolucaoPorAno();
  const { data: topPatri, isLoading: loadingPatri } = useTopPatrimonio();
  const { data: porCargo, isLoading: loadingCargo } = useCandidatosPorCargo();
  const { data: muniRanking, isLoading: loadingMuni } = useMunicipiosRanking();
  const { data: faixaEtaria, isLoading: loadingIdade } = useFaixaEtaria();
  const { data: comparecimento } = useComparecimentoGeral();
  const { data: availability } = useDataAvailability();

  if (loadingEmpty) return <KPISkeleton />;
  if (isEmpty) return <EmptyState />;

  const kpiCards = [
    { icon: Users, label: 'Candidatos', value: formatNumber(kpis?.totalCandidatos), sub: 'registrados', color: 'text-[hsl(var(--chart-1))]', bgColor: 'bg-[hsl(var(--chart-1))]/10' },
    { icon: CheckCircle, label: 'Eleitos', value: formatNumber(kpis?.totalEleitos), sub: 'eleitos/QP/média', color: 'text-success', bgColor: 'bg-success/10' },
    { icon: UserCheck, label: 'Mulheres', value: formatPercent(kpis?.pctMulheres), sub: `${formatNumber(kpis?.totalMulheres)} candidatas`, color: 'text-secondary', bgColor: 'bg-secondary/10' },
    { icon: Building, label: 'Partidos', value: formatNumber(kpis?.totalPartidos), sub: 'siglas', color: 'text-warning', bgColor: 'bg-warning/10' },
    { icon: MapPin, label: 'Municípios', value: formatNumber(kpis?.totalMunicipios), sub: 'com candidatos', color: 'text-[hsl(var(--chart-5))]', bgColor: 'bg-[hsl(var(--chart-5))]/10' },
    { icon: BarChart3, label: 'Cargos', value: formatNumber(kpis?.totalCargos), sub: 'disputados', color: 'text-[hsl(var(--chart-6))]', bgColor: 'bg-[hsl(var(--chart-6))]/10' },
  ];

  // Add comparecimento KPIs if available
  if (comparecimento) {
    kpiCards.push(
      { icon: Vote, label: 'Eleitorado', value: formatNumber(comparecimento.apto), sub: 'aptos a votar', color: 'text-[hsl(var(--info))]', bgColor: 'bg-[hsl(var(--info))]/10' },
      { icon: TrendingUp, label: 'Comparecimento', value: comparecimento.apto > 0 ? formatPercent((comparecimento.comp / comparecimento.apto) * 100) : '—', sub: `${formatNumber(comparecimento.comp)} votos`, color: 'text-success', bgColor: 'bg-success/10' },
    );
  }

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      <BigQueryStatus />

      {/* KPIs */}
      {loadingKPIs ? <KPISkeleton /> : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {kpiCards.map((kpi, i) => (
            <div key={i} className="bg-card rounded-lg border border-border/50 p-3 kpi-glow hover:border-primary/30 transition-all">
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`w-6 h-6 rounded-md ${kpi.bgColor} flex items-center justify-center`}>
                  <kpi.icon className={`w-3 h-3 ${kpi.color}`} />
                </div>
                <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">{kpi.label}</span>
              </div>
              <p className="text-xl font-bold text-foreground metric-value">{kpi.value}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{kpi.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ROW 1: Partido + Gênero + Situação */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {loadingPartido ? <ChartSkeleton className="lg:col-span-5" /> : (
          <Card className="lg:col-span-5" title="Candidatos por Partido (Top 15)">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={(porPartido || []).slice(0, 15)} layout="vertical" margin={{ left: 55 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} />
                <YAxis type="category" dataKey="partido" tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} width={50} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name="Candidatos" radius={[0, 3, 3, 0]}>
                  {(porPartido || []).slice(0, 15).map((e: any, i: number) => (
                    <Cell key={i} fill={getPartidoCor(e.partido)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {loadingGenero ? <ChartSkeleton className="lg:col-span-3" /> : (
          <Card className="lg:col-span-3" title="Gênero">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={genero || []} dataKey="total" nameKey="nome" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} strokeWidth={0}>
                  {(genero || []).map((_, i) => (
                    <Cell key={i} fill={i === 0 ? 'hsl(190, 80%, 45%)' : i === 1 ? 'hsl(338, 72%, 60%)' : CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            {/* Summary below chart */}
            <div className="grid grid-cols-2 gap-2 mt-2 text-center">
              {(genero || []).slice(0, 2).map((g: any, i) => (
                <div key={i} className="bg-muted/30 rounded p-2">
                  <p className="text-lg font-bold metric-value">{formatNumber(g.total)}</p>
                  <p className="text-[9px] text-muted-foreground">{g.nome}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {loadingSit ? <ChartSkeleton className="lg:col-span-4" /> : (
          <Card className="lg:col-span-4" title="Resultado Eleitoral">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={situacao || []} dataKey="total" nameKey="nome" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2} strokeWidth={0}>
                  {(situacao || []).map((e: any, i: number) => (
                    <Cell key={i} fill={SITUACAO_CORES[e.nome] || CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
            {/* Top situations table */}
            <div className="mt-2 space-y-1">
              {(situacao || []).slice(0, 4).map((s: any, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SITUACAO_CORES[s.nome] || CHART_COLORS[i] }} />
                    {s.nome}
                  </span>
                  <span className="font-semibold metric-value">{formatNumber(s.total)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* ROW 2: Evolução + Faixa Etária + Cargo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {loadingEvol ? <ChartSkeleton /> : (
          <Card title="Evolução por Ano">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={evolucao || []}>
                <XAxis dataKey="ano" tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="total" name="Total" fill="hsl(190, 80%, 45%)" stroke="hsl(190, 80%, 45%)" fillOpacity={0.15} />
                <Area type="monotone" dataKey="mulheres" name="Mulheres" fill="hsl(338, 72%, 60%)" stroke="hsl(338, 72%, 60%)" fillOpacity={0.15} />
                <Area type="monotone" dataKey="eleitos" name="Eleitos" fill="hsl(156, 72%, 40%)" stroke="hsl(156, 72%, 40%)" fillOpacity={0.15} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        )}

        {loadingIdade ? <ChartSkeleton /> : (
          <Card title="Faixa Etária">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={faixaEtaria || []}>
                <XAxis dataKey="faixa" tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name="Candidatos" fill="hsl(280, 60%, 55%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {loadingCargo ? <ChartSkeleton /> : (
          <Card title="Por Cargo">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={porCargo || []} dataKey="total" nameKey="cargo" cx="50%" cy="50%" outerRadius={85} paddingAngle={2} strokeWidth={0}>
                  {(porCargo || []).map((_, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* ROW 3: Municípios + Top Patrimônio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {loadingMuni ? <TableSkeleton /> : (
          <Card title="Top Municípios por Candidatos">
            <div className="overflow-auto max-h-[320px]">
              <table className="w-full text-xs table-striped">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border/30 text-left">
                    <th className="pb-2 font-medium text-muted-foreground">#</th>
                    <th className="pb-2 font-medium text-muted-foreground">Município</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Total</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Eleitos</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">% Mulh.</th>
                  </tr>
                </thead>
                <tbody>
                  {(muniRanking || []).slice(0, 20).map((m, i) => (
                    <tr key={m.municipio} className="border-b border-border/20 last:border-0">
                      <td className="py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 font-medium">
                        <Link to={`/municipio?m=${m.municipio}`} className="text-primary hover:underline">{m.municipio}</Link>
                      </td>
                      <td className="py-1.5 text-right metric-value">{formatNumber(m.total)}</td>
                      <td className="py-1.5 text-right text-success metric-value">{formatNumber(m.eleitos)}</td>
                      <td className="py-1.5 text-right">{m.total > 0 ? formatPercent((m.mulheres / m.total) * 100) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-right">
              <Link to="/municipio" className="text-xs text-primary hover:underline">Ver todos →</Link>
            </div>
          </Card>
        )}

        {loadingPatri ? <TableSkeleton /> : (
          <Card title="Top 15 Maior Patrimônio">
            <div className="overflow-auto max-h-[320px]">
              <table className="w-full text-xs table-striped">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border/30 text-left">
                    <th className="pb-2 font-medium text-muted-foreground">#</th>
                    <th className="pb-2 font-medium text-muted-foreground"></th>
                    <th className="pb-2 font-medium text-muted-foreground">Nome</th>
                    <th className="pb-2 font-medium text-muted-foreground">Partido</th>
                    <th className="pb-2 font-medium text-muted-foreground">Cargo</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Patrimônio</th>
                  </tr>
                </thead>
                <tbody>
                  {(topPatri || []).slice(0, 15).map((c, i) => (
                    <tr key={c.sequencial || i} className="border-b border-border/20 last:border-0">
                      <td className="py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5"><CandidatoAvatar nome={c.nome} fotoUrl={c.foto_url} size={24} /></td>
                      <td className="py-1.5 font-medium">{c.nome}</td>
                      <td className="py-1.5" style={{ color: getPartidoCor(c.partido) }}>{c.partido}</td>
                      <td className="py-1.5 text-muted-foreground">{c.cargo}</td>
                      <td className="py-1.5 text-right font-semibold text-primary metric-value">{formatBRLCompact(c.patrimonio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-right">
              <Link to="/patrimonio" className="text-xs text-primary hover:underline">Ver todos →</Link>
            </div>
          </Card>
        )}
      </div>

      {/* Quick access to AI */}
      <Card className="border-primary/20 bg-primary/5">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Consulta Inteligente</p>
            <p className="text-xs text-muted-foreground">Descreva os dados que precisa e a IA gera a visualização automaticamente</p>
          </div>
          <Link to="/consulta" className="text-xs text-primary hover:underline font-medium">Experimentar →</Link>
        </div>
      </Card>
    </div>
  );
}
