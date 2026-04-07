import { useState, useMemo } from 'react';
import {
  useKPIs, useCheckEmpty,
  useCandidatosPorPartido, useDistribuicaoGenero,
  useSituacaoFinal, useEvolucaoPorAno,
  useTopPatrimonio, useCandidatosPorCargo, useMunicipiosRanking,
  useFaixaEtaria, useVotosBrancosNulos, useComparativoAnos,
  useDistribuicaoEscolaridade, useTopOcupacoes,
} from '@/hooks/useEleicoes';
import { useMotherDuckQuery } from '@/hooks/useMotherDuckQuery';
import { formatNumber, formatPercent, getPartidoCor, CHART_COLORS, formatBRLCompact, formatBRL } from '@/lib/eleicoes';
import { KPISkeleton, TableSkeleton } from '@/components/eleicoes/Skeletons';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { EmptyState } from '@/components/eleicoes/EmptyState';
import { KPIDrillDownPanel, type DrillDownType } from '@/components/eleicoes/KPIDrillDown';
import {
  Users, CheckCircle, UserCheck, Building, MapPin, BarChart3, Vote, TrendingUp,
  DollarSign, Calendar, Target, Database, MessageSquare, Sparkles, Trophy,
  GraduationCap, Briefcase,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useFilterStore } from '@/stores/filterStore';
import { mdQuery, MD } from '@/lib/motherduck';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';

// ── MotherDuck Status ──
function MotherDuckStatusCard() {
  const { data, isLoading, error } = useMotherDuckQuery(
    "SELECT count(*) as total FROM my_db.candidatos_2024_GO",
    ['motherduck-status']
  );
  const total = data?.rows?.[0]?.total ?? null;
  return (
    <div className="bg-card rounded-lg border border-border/50 p-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
        <Database className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">MotherDuck</p>
        {isLoading ? <Skeleton className="h-5 w-24 mt-0.5" /> : error ? (
          <p className="text-xs text-destructive truncate">{error.message}</p>
        ) : (
          <p className="text-lg font-bold">{Number(total).toLocaleString('pt-BR')} <span className="text-xs font-normal text-muted-foreground">candidatos 2024</span></p>
        )}
      </div>
      <span className={`w-2 h-2 rounded-full ${error ? 'bg-destructive' : isLoading ? 'bg-warning animate-pulse' : 'bg-success'}`} />
    </div>
  );
}

// ── Data Table component ──
function DataTable({ data, columns, maxRows = 30 }: { data: Record<string, any>[]; columns: { key: string; label: string; align?: 'right' | 'left'; format?: (v: any) => string }[]; maxRows?: number }) {
  const sliced = data.slice(0, maxRows);
  if (sliced.length === 0) return <p className="text-xs text-muted-foreground p-4 text-center">Sem dados</p>;
  return (
    <ScrollArea className="h-[400px]">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border/30">
            <th className="text-left py-2 px-2 text-muted-foreground font-medium w-8">#</th>
            {columns.map(c => (
              <th key={c.key} className={cn("py-2 px-2 text-muted-foreground font-medium", c.align === 'right' ? 'text-right' : 'text-left')}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sliced.map((row, i) => (
            <tr key={i} className="border-b border-border/10 hover:bg-muted/30 transition-colors">
              <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
              {columns.map(c => (
                <td key={c.key} className={cn("py-1.5 px-2", c.align === 'right' ? 'text-right font-mono font-semibold' : '')}>
                  {c.format ? c.format(row[c.key]) : (typeof row[c.key] === 'number' && row[c.key] > 999 ? formatNumber(row[c.key]) : row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

function Card({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <div className={`bg-card rounded-lg border border-border/50 p-4 ${className}`}>
      {title && <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</h3>}
      {children}
    </div>
  );
}

// ── Tab Navigation ──
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
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all',
            active === t.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          <t.icon className="w-3.5 h-3.5" />
          {t.label}
        </button>
      ))}
    </nav>
  );
}

// ── Comparecimento hook ──
function useComparecimentoGeral() {
  const { ano } = useFilterStore();
  return useQuery({
    queryKey: ['comparecimentoGeral', ano],
    queryFn: async () => {
      const anos = ano ? [ano] : [2016, 2018, 2020, 2022, 2024];
      let totalApto = 0, totalComp = 0, totalAbst = 0, totalBrancos = 0, totalNulos = 0;
      for (const a of anos) {
        try {
          const [r] = await mdQuery<any>(
            `SELECT sum(qt_aptos) as apto, sum(qt_comparecimento) as comp, sum(qt_abstencoes) as abst,
              sum(qt_votos_brancos) as brancos, sum(qt_votos_nulos) as nulos
            FROM ${MD.comparecimento(a)}`
          );
          totalApto += Number(r?.apto || 0);
          totalComp += Number(r?.comp || 0);
          totalAbst += Number(r?.abst || 0);
          totalBrancos += Number(r?.brancos || 0);
          totalNulos += Number(r?.nulos || 0);
        } catch {}
      }
      if (totalApto === 0) return null;
      return { apto: totalApto, comp: totalComp, abst: totalAbst, brancos: totalBrancos, nulos: totalNulos };
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
            <p className="text-xl font-bold text-foreground">{kpi.value}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5 group-hover:text-primary transition-colors">
              {kpi.sub} <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
            </p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { to: '/consulta', label: 'Consulta por IA', desc: 'Pergunte sobre eleições em linguagem natural', icon: MessageSquare },
          { to: '/relatorios', label: 'Relatórios Personalizados', desc: 'Gere gráficos e visualizações com IA', icon: Sparkles },
          { to: '/ranking', label: 'Ranking Candidatos', desc: 'Busque e ordene todos os candidatos', icon: Trophy },
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

// ── Tab: Partidos (DATA-FIRST) ──
function TabPartidos({ porPartido, loadingPartido, situacao, loadingSit }: any) {
  return loadingPartido || loadingSit ? <TableSkeleton /> : (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card title="Candidatos por Partido">
        <DataTable
          data={(porPartido || []).map((r: any) => r)}
          columns={[
            { key: 'partido', label: 'Partido' },
            { key: 'total', label: 'Candidatos', align: 'right' },
          ]}
        />
      </Card>
      <Card title="Resultado Eleitoral">
        <DataTable
          data={(situacao || []).map((s: any) => ({ situacao: s.nome, total: s.total }))}
          columns={[
            { key: 'situacao', label: 'Situação' },
            { key: 'total', label: 'Qtd', align: 'right' },
          ]}
        />
      </Card>
    </div>
  );
}

// ── Tab: Demográfico (DATA-FIRST) ──
function TabDemografico({ genero, loadingGenero, faixaEtaria, loadingIdade, porCargo, loadingCargo }: any) {
  const { data: escolaridades, isLoading: loadingEsc } = useDistribuicaoEscolaridade();
  const { data: ocupacoes, isLoading: loadingOcup } = useTopOcupacoes();

  const isLoading = loadingGenero || loadingIdade || loadingCargo || loadingEsc || loadingOcup;
  if (isLoading) return <TableSkeleton />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <Card title="Gênero">
        <DataTable
          data={(genero || []).map((g: any) => g)}
          columns={[
            { key: 'nome', label: 'Gênero' },
            { key: 'total', label: 'Qtd', align: 'right' },
          ]}
        />
      </Card>
      <Card title="Faixa Etária">
        <DataTable
          data={(faixaEtaria || []).map((f: any) => f)}
          columns={[
            { key: 'faixa', label: 'Faixa' },
            { key: 'total', label: 'Qtd', align: 'right' },
          ]}
        />
      </Card>
      <Card title="Por Cargo">
        <DataTable
          data={(porCargo || []).map((c: any) => c)}
          columns={[
            { key: 'cargo', label: 'Cargo' },
            { key: 'total', label: 'Qtd', align: 'right' },
          ]}
        />
      </Card>
      <Card title="Escolaridade">
        <DataTable
          data={(escolaridades || []).map((e: any) => e)}
          columns={[
            { key: 'nome', label: 'Escolaridade' },
            { key: 'total', label: 'Qtd', align: 'right' },
          ]}
        />
      </Card>
      <Card title="Top Ocupações">
        <DataTable
          data={(ocupacoes || []).map((o: any) => o)}
          columns={[
            { key: 'nome', label: 'Ocupação' },
            { key: 'total', label: 'Qtd', align: 'right' },
          ]}
        />
      </Card>
    </div>
  );
}

// ── Tab: Evolução (DATA-FIRST) ──
function TabEvolucao({ evolucao, loadingEvol, comparativoAnos, loadingComp }: any) {
  if (loadingEvol || loadingComp) return <TableSkeleton />;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card title="Evolução por Ano (Candidatos)">
        <DataTable
          data={(evolucao || []).map((r: any) => r)}
          columns={[
            { key: 'ano', label: 'Ano' },
            { key: 'total', label: 'Total', align: 'right' },
            { key: 'mulheres', label: 'Mulheres', align: 'right' },
            { key: 'eleitos', label: 'Eleitos', align: 'right' },
            { key: 'pctMulheres', label: '% Mulh.', align: 'right', format: (v: any) => `${v}%` },
          ]}
        />
      </Card>
      <Card title="Comparativo entre Eleições">
        <DataTable
          data={(comparativoAnos || []).map((a: any) => a)}
          columns={[
            { key: 'ano', label: 'Ano' },
            { key: 'total', label: 'Total', align: 'right' },
            { key: 'eleitos', label: 'Eleitos', align: 'right' },
            { key: 'mulheres', label: 'Mulheres', align: 'right' },
            { key: 'pctMulheres', label: '% Mulh.', align: 'right', format: (v: any) => `${v}%` },
            { key: 'cargos', label: 'Cargos', align: 'right' },
          ]}
        />
      </Card>
    </div>
  );
}

// ── Tab: Geográfico (DATA-FIRST) ──
function TabGeografico({ muniRanking, loadingMuni }: any) {
  if (loadingMuni) return <TableSkeleton />;
  return (
    <Card title="Ranking de Municípios">
      <DataTable
        data={(muniRanking || []).map((m: any) => ({
          ...m,
          pctMulheres: m.total > 0 ? Math.round((m.mulheres / m.total) * 100) : 0,
        }))}
        columns={[
          { key: 'municipio', label: 'Município' },
          { key: 'total', label: 'Candidatos', align: 'right' },
          { key: 'eleitos', label: 'Eleitos', align: 'right' },
          { key: 'mulheres', label: 'Mulheres', align: 'right' },
          { key: 'pctMulheres', label: '% Mulh.', align: 'right', format: (v: any) => `${v}%` },
        ]}
        maxRows={50}
      />
    </Card>
  );
}

// ── Tab: Patrimônio (DATA-FIRST) ──
function TabPatrimonio({ topPatri, loadingPatri }: any) {
  if (loadingPatri) return <TableSkeleton />;
  return (
    <Card title="Ranking de Patrimônio Declarado">
      <DataTable
        data={(topPatri || []).map((c: any) => c)}
        columns={[
          { key: 'nome', label: 'Candidato' },
          { key: 'partido', label: 'Partido' },
          { key: 'cargo', label: 'Cargo' },
          { key: 'patrimonio', label: 'Patrimônio', align: 'right', format: (v: any) => formatBRLCompact(v) },
        ]}
      />
      <div className="mt-3 text-right">
        <Link to="/patrimonio" className="text-xs text-primary hover:underline">Análise completa →</Link>
      </div>
    </Card>
  );
}

// ── Tab: Votos (DATA-FIRST) ──
function TabVotos({ brancosNulos, loadingBN }: any) {
  if (loadingBN) return <TableSkeleton />;
  if (!brancosNulos || brancosNulos.length === 0) {
    return <Card><p className="text-center text-muted-foreground py-12 text-sm">Dados de comparecimento ainda não importados.</p></Card>;
  }
  return (
    <Card title="Votos Brancos e Nulos por Ano">
      <DataTable
        data={brancosNulos}
        columns={[
          { key: 'ano', label: 'Ano' },
          { key: 'comp', label: 'Comparecimento', align: 'right' },
          { key: 'brancos', label: 'Brancos', align: 'right' },
          { key: 'pctBrancos', label: '% Brancos', align: 'right', format: (v: any) => `${v.toFixed(2)}%` },
          { key: 'nulos', label: 'Nulos', align: 'right' },
          { key: 'pctNulos', label: '% Nulos', align: 'right', format: (v: any) => `${v.toFixed(2)}%` },
        ]}
      />
    </Card>
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
  const { data: comparativoAnos, isLoading: loadingComp } = useComparativoAnos();

  if (loadingEmpty) return <KPISkeleton />;
  if (isEmpty) return <EmptyState />;

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">EleiçõesGO — Painel de Dados</h1>
      </div>

      <MotherDuckStatusCard />
      <DashboardNav active={activeTab} onChange={setActiveTab} />

      {activeTab === 'resumo' && (
        <TabResumo kpis={kpis} loadingKPIs={loadingKPIs} comparecimento={comparecimento} onDrillDown={(type: DrillDownType, title: string) => setDrillDown({ type, title })} />
      )}
      {activeTab === 'partidos' && (
        <TabPartidos porPartido={porPartido} loadingPartido={loadingPartido} situacao={situacao} loadingSit={loadingSit} />
      )}
      {activeTab === 'demografico' && (
        <TabDemografico genero={genero} loadingGenero={loadingGenero} faixaEtaria={faixaEtaria} loadingIdade={loadingIdade} porCargo={porCargo} loadingCargo={loadingCargo} />
      )}
      {activeTab === 'evolucao' && (
        <TabEvolucao evolucao={evolucao} loadingEvol={loadingEvol} comparativoAnos={comparativoAnos} loadingComp={loadingComp} />
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

      {drillDown && (
        <KPIDrillDownPanel type={drillDown.type} title={drillDown.title} onClose={() => setDrillDown(null)} />
      )}
    </div>
  );
}
