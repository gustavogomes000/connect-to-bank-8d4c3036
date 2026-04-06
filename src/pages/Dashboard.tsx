import { useState } from 'react';
import {
  useKPIs, useCheckEmpty,
  useCandidatosPorPartido, useDistribuicaoGenero,
  useSituacaoFinal, useEvolucaoPorAno,
  useTopPatrimonio, useCandidatosPorCargo, useMunicipiosRanking,
  useFaixaEtaria, useDataAvailability,
  useVotosBrancosNulos, useTaxaReeleicao, useComparativoAnos,
} from '@/hooks/useEleicoes';
import { useMotherDuckQuery } from '@/hooks/useMotherDuckQuery';
import { formatNumber, formatPercent, getPartidoCor, CHART_COLORS, SITUACAO_CORES, formatBRLCompact } from '@/lib/eleicoes';
import { KPISkeleton, ChartSkeleton, TableSkeleton } from '@/components/eleicoes/Skeletons';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { EmptyState } from '@/components/eleicoes/EmptyState';
import { KPIDrillDownPanel, type DrillDownType } from '@/components/eleicoes/KPIDrillDown';
import {
  Users, CheckCircle, UserCheck, Building, MapPin, BarChart3, Vote, TrendingUp,
  PieChart as PieIcon, DollarSign, Calendar, Target, Database,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, LineChart, Line,
} from 'recharts';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

// ── MotherDuck Status Card ──
function MotherDuckStatusCard() {
  const { data, isLoading, error } = useMotherDuckQuery(
    "SELECT count(*) as total FROM my_db.candidatos",
    ['motherduck-status']
  );

  const total = data?.result_sets?.[0]?.rows?.[0]?.[0] ?? data?.rows?.[0]?.total ?? null;

  return (
    <div className="bg-card rounded-lg border border-border/50 p-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
        <Database className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">MotherDuck</p>
        {isLoading ? (
          <Skeleton className="h-5 w-24 mt-0.5" />
        ) : error ? (
          <p className="text-xs text-destructive truncate">{error.message}</p>
        ) : (
          <p className="text-lg font-bold metric-value">{Number(total).toLocaleString('pt-BR')} <span className="text-xs font-normal text-muted-foreground">candidatos</span></p>
        )}
      </div>
      <span className={`w-2 h-2 rounded-full ${error ? 'bg-destructive' : isLoading ? 'bg-warning animate-pulse' : 'bg-success'}`} />
    </div>
  );
}

// ── Shared UI ──
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

// ── Nav tabs ──
const TABS = [
  { id: 'resumo', label: 'Resumo', icon: BarChart3 },
  { id: 'partidos', label: 'Partidos', icon: Target },
  { id: 'demografico', label: 'Demográfico', icon: Users },
  { id: 'evolucao', label: 'Evolução', icon: Calendar },
  { id: 'geografico', label: 'Geográfico', icon: MapPin },
  { id: 'patrimonio', label: 'Patrimônio', icon: DollarSign },
  { id: 'votos', label: 'Votos', icon: Vote },
] as const;

type TabId = typeof TABS[number]['id'];

function DashboardNav({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
      {TABS.map(t => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

// ── Data hooks ──
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

// ── Tab: Resumo ──
function TabResumo({ kpis, loadingKPIs, comparecimento, onDrillDown }: any) {
  const kpiCards = [
    { icon: Users, label: 'Candidatos', value: formatNumber(kpis?.totalCandidatos), sub: 'registrados', color: 'text-[hsl(var(--chart-1))]', bgColor: 'bg-[hsl(var(--chart-1))]/10', drillDown: 'candidatos' as DrillDownType },
    { icon: CheckCircle, label: 'Eleitos', value: formatNumber(kpis?.totalEleitos), sub: 'eleitos/QP/média', color: 'text-success', bgColor: 'bg-success/10', drillDown: 'eleitos' as DrillDownType },
    { icon: UserCheck, label: 'Mulheres', value: formatPercent(kpis?.pctMulheres), sub: `${formatNumber(kpis?.totalMulheres)} candidatas`, color: 'text-secondary', bgColor: 'bg-secondary/10', drillDown: 'mulheres' as DrillDownType },
    { icon: Building, label: 'Partidos', value: formatNumber(kpis?.totalPartidos), sub: 'siglas', color: 'text-warning', bgColor: 'bg-warning/10', drillDown: 'partidos' as DrillDownType },
    { icon: MapPin, label: 'Municípios', value: formatNumber(kpis?.totalMunicipios), sub: 'com candidatos', color: 'text-[hsl(var(--chart-5))]', bgColor: 'bg-[hsl(var(--chart-5))]/10', drillDown: 'municipios' as DrillDownType },
    { icon: BarChart3, label: 'Cargos', value: formatNumber(kpis?.totalCargos), sub: 'disputados', color: 'text-[hsl(var(--chart-6))]', bgColor: 'bg-[hsl(var(--chart-6))]/10', drillDown: 'cargos' as DrillDownType },
  ];
  if (comparecimento) {
    kpiCards.push(
      { icon: Vote, label: 'Eleitorado', value: formatNumber(comparecimento.apto), sub: 'aptos a votar', color: 'text-[hsl(var(--info))]', bgColor: 'bg-[hsl(var(--info))]/10', drillDown: 'eleitorado' as DrillDownType },
      { icon: TrendingUp, label: 'Comparecimento', value: comparecimento.apto > 0 ? formatPercent((comparecimento.comp / comparecimento.apto) * 100) : '—', sub: `${formatNumber(comparecimento.comp)} votos`, color: 'text-success', bgColor: 'bg-success/10', drillDown: 'comparecimento' as DrillDownType },
    );
  }

  return loadingKPIs ? <KPISkeleton /> : (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpiCards.map((kpi, i) => (
          <button
            key={i}
            onClick={() => onDrillDown(kpi.drillDown, kpi.label)}
            className="bg-card rounded-lg border border-border/50 p-3 kpi-glow hover:border-primary/30 transition-all text-left cursor-pointer group"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`w-6 h-6 rounded-md ${kpi.bgColor} flex items-center justify-center`}>
                <kpi.icon className={`w-3 h-3 ${kpi.color}`} />
              </div>
              <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">{kpi.label}</span>
            </div>
            <p className="text-xl font-bold text-foreground metric-value">{kpi.value}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5 group-hover:text-primary transition-colors">
              {kpi.sub} <span className="opacity-0 group-hover:opacity-100 transition-opacity">· clique para ver →</span>
            </p>
          </button>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { to: '/ranking', label: 'Ranking Candidatos', desc: 'Busque e ordene todos os candidatos', icon: Users },
          { to: '/consulta', label: 'Consulta IA', desc: 'Gere visualizações com linguagem natural', icon: BarChart3 },
          { to: '/chat', label: 'Chat Eleições', desc: 'Pergunte qualquer coisa sobre os dados', icon: Vote },
          { to: '/territorial', label: 'Goiânia & Aparecida', desc: 'Inteligência territorial detalhada', icon: MapPin },
        ].map((link) => (
          <Link key={link.to} to={link.to} className="bg-card rounded-lg border border-border/50 p-4 hover:border-primary/30 transition-all group">
            <link.icon className="w-5 h-5 text-primary mb-2 group-hover:scale-110 transition-transform" />
            <p className="text-sm font-semibold text-foreground">{link.label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{link.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Partidos ──
function TabPartidos({ porPartido, loadingPartido, situacao, loadingSit }: any) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {loadingPartido ? <ChartSkeleton /> : (
        <Card title="Candidatos por Partido (Top 15)">
          <ResponsiveContainer width="100%" height={400}>
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
          <div className="mt-2 text-right">
            <Link to="/partido" className="text-xs text-primary hover:underline">Ver análise completa →</Link>
          </div>
        </Card>
      )}

      {loadingSit ? <ChartSkeleton /> : (
        <Card title="Resultado Eleitoral">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={situacao || []} dataKey="total" nameKey="nome" cx="50%" cy="50%" innerRadius={50} outerRadius={100} paddingAngle={2} strokeWidth={0}>
                {(situacao || []).map((e: any, i: number) => (
                  <Cell key={i} fill={SITUACAO_CORES[e.nome] || CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 space-y-1">
            {(situacao || []).slice(0, 6).map((s: any, i: number) => (
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
  );
}

// ── Tab: Demográfico ──
function TabDemografico({ genero, loadingGenero, faixaEtaria, loadingIdade, porCargo, loadingCargo }: any) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {loadingGenero ? <ChartSkeleton /> : (
          <Card title="Gênero">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={genero || []} dataKey="total" nameKey="nome" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} strokeWidth={0}>
                  {(genero || []).map((_: any, i: number) => (
                    <Cell key={i} fill={i === 0 ? 'hsl(190, 80%, 45%)' : i === 1 ? 'hsl(338, 72%, 60%)' : CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-2 text-center">
              {(genero || []).slice(0, 2).map((g: any, i: number) => (
                <div key={i} className="bg-muted/30 rounded p-2">
                  <p className="text-lg font-bold metric-value">{formatNumber(g.total)}</p>
                  <p className="text-[9px] text-muted-foreground">{g.nome}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {loadingIdade ? <ChartSkeleton /> : (
          <Card title="Faixa Etária">
            <ResponsiveContainer width="100%" height={320}>
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
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={porCargo || []} dataKey="total" nameKey="cargo" cx="50%" cy="50%" outerRadius={100} paddingAngle={2} strokeWidth={0}>
                  {(porCargo || []).map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>
      <div className="text-right">
        <Link to="/perfil-candidatos" className="text-xs text-primary hover:underline">Perfil completo dos candidatos →</Link>
      </div>
    </div>
  );
}

// ── Tab: Evolução ──
function TabEvolucao({ evolucao, loadingEvol, reeleicao, loadingReeleicao, comparativoAnos, loadingComp }: any) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {loadingEvol ? <ChartSkeleton /> : (
          <Card title="Evolução por Ano">
            <ResponsiveContainer width="100%" height={320}>
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

        {loadingReeleicao ? <ChartSkeleton /> : reeleicao && reeleicao.recandidatos > 0 && (
          <Card title="Taxa de Reeleição">
            <div className="flex flex-col items-center justify-center py-6">
              <div className="relative w-36 h-36">
                <svg className="w-36 h-36 -rotate-90" viewBox="0 0 128 128">
                  <circle cx="64" cy="64" r="56" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
                  <circle cx="64" cy="64" r="56" fill="none" stroke="hsl(var(--primary))" strokeWidth="12"
                    strokeDasharray={`${(reeleicao.taxa / 100) * 352} 352`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold metric-value">{formatPercent(reeleicao.taxa, 0)}</span>
                  <span className="text-[9px] text-muted-foreground">reeleição</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6 mt-6 text-center text-xs">
                <div>
                  <p className="text-2xl font-bold metric-value">{formatNumber(reeleicao.recandidatos)}</p>
                  <p className="text-muted-foreground">Recandidatos</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-success metric-value">{formatNumber(reeleicao.reeleitos)}</p>
                  <p className="text-muted-foreground">Reeleitos</p>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {loadingComp ? <ChartSkeleton /> : comparativoAnos && comparativoAnos.length > 1 && (
        <Card title="Comparativo entre Eleições">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={comparativoAnos}>
                <XAxis dataKey="ano" tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="pctMulheres" name="% Mulheres" stroke="hsl(338, 72%, 60%)" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="pctEleitos" name="% Eleitos" stroke="hsl(156, 72%, 40%)" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="pb-2 text-left text-muted-foreground font-medium">Ano</th>
                    <th className="pb-2 text-right text-muted-foreground font-medium">Total</th>
                    <th className="pb-2 text-right text-muted-foreground font-medium">Eleitos</th>
                    <th className="pb-2 text-right text-muted-foreground font-medium">Mulheres</th>
                    <th className="pb-2 text-right text-muted-foreground font-medium">% Mulh.</th>
                    <th className="pb-2 text-right text-muted-foreground font-medium">Cargos</th>
                  </tr>
                </thead>
                <tbody>
                  {comparativoAnos.map((a: any) => (
                    <tr key={a.ano} className="border-b border-border/10">
                      <td className="py-1.5 font-semibold">{a.ano}</td>
                      <td className="py-1.5 text-right metric-value">{formatNumber(a.total)}</td>
                      <td className="py-1.5 text-right text-success metric-value">{formatNumber(a.eleitos)}</td>
                      <td className="py-1.5 text-right text-secondary metric-value">{formatNumber(a.mulheres)}</td>
                      <td className="py-1.5 text-right">{a.pctMulheres}%</td>
                      <td className="py-1.5 text-right text-muted-foreground">{a.cargos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Tab: Geográfico ──
function TabGeografico({ muniRanking, loadingMuni }: any) {
  return (
    <div className="space-y-3">
      {loadingMuni ? <TableSkeleton /> : (
        <Card title="Ranking de Municípios por Candidatos">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={(muniRanking || []).slice(0, 15)} layout="vertical" margin={{ left: 120 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="municipio" tick={{ fontSize: 10 }} width={115} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="total" name="Total" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
                <Bar dataKey="eleitos" name="Eleitos" fill="hsl(156, 72%, 40%)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <div className="overflow-auto max-h-[400px]">
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
                  {(muniRanking || []).slice(0, 30).map((m: any, i: number) => (
                    <tr key={m.municipio} className="border-b border-border/20 last:border-0">
                      <td className="py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 font-medium">
                        <Link to={`/municipio`} className="text-primary hover:underline">{m.municipio}</Link>
                      </td>
                      <td className="py-1.5 text-right metric-value">{formatNumber(m.total)}</td>
                      <td className="py-1.5 text-right text-success metric-value">{formatNumber(m.eleitos)}</td>
                      <td className="py-1.5 text-right">{m.total > 0 ? formatPercent((m.mulheres / m.total) * 100) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-3 text-right">
            <Link to="/municipio" className="text-xs text-primary hover:underline">Ver análise detalhada por município →</Link>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Tab: Patrimônio ──
function TabPatrimonio({ topPatri, loadingPatri }: any) {
  return (
    <div className="space-y-3">
      {loadingPatri ? <TableSkeleton /> : (
        <>
          <Card title="Top 12 — Maior Patrimônio Declarado">
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={(topPatri || []).slice(0, 12).map((c: any) => ({
                nome: c.nome.length > 18 ? c.nome.slice(0, 16) + '…' : c.nome,
                patrimonio: c.patrimonio,
              }))} layout="vertical" margin={{ left: 130 }}>
                <XAxis type="number" tickFormatter={(v: number) => formatBRLCompact(v)} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={120} />
                <Tooltip formatter={(v: number) => formatBRLCompact(v)} />
                <Bar dataKey="patrimonio" name="Patrimônio" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Ranking Completo">
            <div className="overflow-auto max-h-[400px]">
              <table className="w-full text-xs table-striped">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border/30 text-left">
                    <th className="pb-2 px-2 font-medium text-muted-foreground">#</th>
                    <th className="pb-2 px-2 font-medium text-muted-foreground w-8"></th>
                    <th className="pb-2 px-2 font-medium text-muted-foreground">Nome</th>
                    <th className="pb-2 px-2 font-medium text-muted-foreground">Partido</th>
                    <th className="pb-2 px-2 font-medium text-muted-foreground">Cargo</th>
                    <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Patrimônio</th>
                  </tr>
                </thead>
                <tbody>
                  {(topPatri || []).slice(0, 20).map((c: any, i: number) => (
                    <tr key={c.sequencial || i} className="border-b border-border/20 last:border-0">
                      <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 px-2"><CandidatoAvatar nome={c.nome} fotoUrl={c.foto_url} size={24} /></td>
                      <td className="py-1.5 px-2 font-medium">{c.nome}</td>
                      <td className="py-1.5 px-2" style={{ color: getPartidoCor(c.partido) }}>{c.partido}</td>
                      <td className="py-1.5 px-2 text-muted-foreground">{c.cargo}</td>
                      <td className="py-1.5 px-2 text-right font-semibold text-primary metric-value">{formatBRLCompact(c.patrimonio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-right">
              <Link to="/patrimonio" className="text-xs text-primary hover:underline">Análise completa de patrimônio →</Link>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ── Tab: Votos ──
function TabVotos({ brancosNulos, loadingBN }: any) {
  return (
    <div className="space-y-3">
      {loadingBN ? <ChartSkeleton /> : brancosNulos && brancosNulos.length > 0 ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card title="Votos Brancos e Nulos por Ano">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={brancosNulos}>
                  <XAxis dataKey="ano" tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} tickFormatter={(v: number) => formatNumber(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="brancos" name="Brancos" fill="hsl(45, 93%, 50%)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="nulos" name="Nulos" fill="hsl(0, 50%, 55%)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Percentual sobre o Comparecimento">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={brancosNulos}>
                  <XAxis dataKey="ano" tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} unit="%" />
                  <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="pctBrancos" name="% Brancos" stroke="hsl(45, 93%, 50%)" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="pctNulos" name="% Nulos" stroke="hsl(0, 50%, 55%)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card title="Resumo por Ano">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30 text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Ano</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Comparecimento</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Brancos</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">% Brancos</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Nulos</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">% Nulos</th>
                </tr>
              </thead>
              <tbody>
                {brancosNulos.map((r: any) => (
                  <tr key={r.ano} className="border-b border-border/10">
                    <td className="py-1.5 font-semibold">{r.ano}</td>
                    <td className="py-1.5 text-right metric-value">{formatNumber(r.comp)}</td>
                    <td className="py-1.5 text-right metric-value">{formatNumber(r.brancos)}</td>
                    <td className="py-1.5 text-right text-warning">{r.pctBrancos.toFixed(2)}%</td>
                    <td className="py-1.5 text-right metric-value">{formatNumber(r.nulos)}</td>
                    <td className="py-1.5 text-right text-destructive">{r.pctNulos.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : (
        <Card>
          <p className="text-center text-muted-foreground py-12 text-sm">Dados de comparecimento/votação ainda não importados.</p>
        </Card>
      )}
    </div>
  );
}

// ── Main ──
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('resumo');
  const [drillDown, setDrillDown] = useState<{ type: DrillDownType; title: string } | null>(null);

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
  const { data: brancosNulos, isLoading: loadingBN } = useVotosBrancosNulos();
  const { data: reeleicao, isLoading: loadingReeleicao } = useTaxaReeleicao();
  const { data: comparativoAnos, isLoading: loadingComp } = useComparativoAnos();

  const handleDrillDown = (type: DrillDownType, title: string) => {
    setDrillDown({ type, title });
  };

  if (loadingEmpty) return <KPISkeleton />;
  if (isEmpty) return <EmptyState />;

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">EleiçõesGO — Visão Geral</h1>
      </div>

      <DashboardNav active={activeTab} onChange={setActiveTab} />

      {activeTab === 'resumo' && (
        <TabResumo kpis={kpis} loadingKPIs={loadingKPIs} comparecimento={comparecimento} onDrillDown={handleDrillDown} />
      )}

      {activeTab === 'partidos' && (
        <TabPartidos porPartido={porPartido} loadingPartido={loadingPartido} situacao={situacao} loadingSit={loadingSit} />
      )}

      {activeTab === 'demografico' && (
        <TabDemografico genero={genero} loadingGenero={loadingGenero} faixaEtaria={faixaEtaria} loadingIdade={loadingIdade} porCargo={porCargo} loadingCargo={loadingCargo} />
      )}

      {activeTab === 'evolucao' && (
        <TabEvolucao evolucao={evolucao} loadingEvol={loadingEvol} reeleicao={reeleicao} loadingReeleicao={loadingReeleicao} comparativoAnos={comparativoAnos} loadingComp={loadingComp} />
      )}

      {activeTab === 'geografico' && (
        <TabGeografico muniRanking={muniRanking} loadingMuni={loadingMuni} />
      )}

      {activeTab === 'patrimonio' && (
        <TabPatrimonio topPatri={topPatri} loadingPatri={loadingPatri} />
      )}

      {activeTab === 'votos' && (
        <TabVotos brancosNulos={brancosNulos} loadingBN={loadingBN} />
      )}

      {/* Drill-down modal */}
      {drillDown && (
        <KPIDrillDownPanel
          type={drillDown.type}
          title={drillDown.title}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}
