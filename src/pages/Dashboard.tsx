import {
  useKPIs, useCheckEmpty, useEleitos,
  useCandidatosPorPartido, useDistribuicaoGenero, useDistribuicaoEscolaridade,
  useTopOcupacoes, useSituacaoFinal, useEvolucaoPorAno,
  useTopPatrimonio, useFaixaEtaria, useCandidatosPorCargo,
  usePatrimonioEvolucaoAno, usePatrimonioDistribuicao,
} from '@/hooks/useEleicoes';
import { formatNumber, formatPercent, getPartidoCor } from '@/lib/eleicoes';
import { KPISkeleton, ChartSkeleton, TableSkeleton } from '@/components/eleicoes/Skeletons';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { EmptyState } from '@/components/eleicoes/EmptyState';
import { Users, CheckCircle, BarChart3, Landmark, UserCheck, Building } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area,
} from 'recharts';
import { Link } from 'react-router-dom';

const COLORS = [
  'hsl(338, 72%, 60%)', 'hsl(38, 60%, 58%)', 'hsl(156, 72%, 34%)',
  'hsl(280, 50%, 55%)', 'hsl(200, 70%, 50%)', 'hsl(20, 80%, 55%)',
  'hsl(160, 50%, 45%)', 'hsl(320, 60%, 50%)', 'hsl(50, 70%, 50%)',
  'hsl(240, 50%, 55%)', 'hsl(0, 65%, 50%)', 'hsl(100, 50%, 40%)',
];

const SITUACAO_CORES: Record<string, string> = {
  'ELEITO': 'hsl(156, 72%, 34%)',
  'ELEITO POR QP': 'hsl(156, 60%, 45%)',
  'ELEITO POR MÉDIA': 'hsl(156, 50%, 55%)',
  'SUPLENTE': 'hsl(38, 60%, 58%)',
  'NÃO ELEITO': 'hsl(0, 50%, 60%)',
  '2º TURNO': 'hsl(200, 70%, 50%)',
  'NÃO DEFINIDO': 'hsl(0, 0%, 70%)',
  '#NULO': 'hsl(0, 0%, 80%)',
};

function formatBRL(val: number): string {
  if (val >= 1_000_000_000) return `R$ ${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `R$ ${(val / 1_000).toFixed(0)}k`;
  return `R$ ${val.toFixed(0)}`;
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card rounded-xl border p-5 ${className}`}>{children}</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold mb-4 text-foreground">{children}</h3>;
}

export default function Dashboard() {
  const { data: isEmpty, isLoading: loadingEmpty } = useCheckEmpty();
  const { data: kpis, isLoading: loadingKPIs } = useKPIs();
  const { data: porPartido, isLoading: loadingPartido } = useCandidatosPorPartido();
  const { data: genero, isLoading: loadingGenero } = useDistribuicaoGenero();
  const { data: escolaridade, isLoading: loadingEscol } = useDistribuicaoEscolaridade();
  const { data: ocupacoes, isLoading: loadingOcup } = useTopOcupacoes();
  const { data: situacao, isLoading: loadingSit } = useSituacaoFinal();
  const { data: evolucao, isLoading: loadingEvol } = useEvolucaoPorAno();
  const { data: topPatri, isLoading: loadingPatri } = useTopPatrimonio();
  const { data: faixaEtaria, isLoading: loadingFaixa } = useFaixaEtaria();
  const { data: porCargo, isLoading: loadingCargo } = useCandidatosPorCargo();
  const { data: eleitos, isLoading: loadingEleitos } = useEleitos();
  const { data: patriEvolucao, isLoading: loadingPatriEvol } = usePatrimonioEvolucaoAno();
  const { data: patriDistrib, isLoading: loadingPatriDist } = usePatrimonioDistribuicao();

  if (loadingEmpty) return <KPISkeleton />;
  if (isEmpty) return <EmptyState />;

  const kpiCards = [
    { icon: Users, label: 'Candidatos', value: formatNumber(kpis?.totalCandidatos), sub: 'no filtro atual', color: 'text-primary' },
    { icon: CheckCircle, label: 'Eleitos', value: formatNumber(kpis?.totalEleitos), sub: 'eleitos/média/QP', color: 'text-[hsl(var(--success))]' },
    { icon: UserCheck, label: 'Mulheres', value: formatPercent(kpis?.pctMulheres), sub: `${formatNumber(kpis?.totalMulheres)} candidatas`, color: 'text-secondary' },
    { icon: Building, label: 'Partidos', value: formatNumber(kpis?.totalPartidos), sub: 'partidos ativos', color: 'text-[hsl(var(--warning))]' },
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* ═══ KPIs ═══ */}
      {loadingKPIs ? <KPISkeleton /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map((kpi, i) => (
            <div key={i} className="bg-card rounded-xl border p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                <span className="text-sm text-muted-foreground font-medium">{kpi.label}</span>
              </div>
              <p className="text-3xl font-bold text-foreground">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ═══ ROW 1: Partido + Gênero + Situação ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Candidatos por Partido */}
        {loadingPartido ? <ChartSkeleton className="lg:col-span-5" /> : (
          <Card className="lg:col-span-5">
            <SectionTitle>Candidatos por Partido</SectionTitle>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={(porPartido || []).slice(0, 12)} layout="vertical" margin={{ left: 60 }}>
                <XAxis type="number" />
                <YAxis type="category" dataKey="partido" tick={{ fontSize: 11 }} width={55} />
                <Tooltip />
                <Bar dataKey="total" name="Candidatos" radius={[0, 4, 4, 0]}>
                  {(porPartido || []).slice(0, 12).map((e: any, i: number) => (
                    <Cell key={i} fill={getPartidoCor(e.partido)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Gênero */}
        {loadingGenero ? <ChartSkeleton className="lg:col-span-3" /> : (
          <Card className="lg:col-span-3">
            <SectionTitle>Distribuição por Gênero</SectionTitle>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={genero || []} dataKey="total" nameKey="nome" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {(genero || []).map((_, i) => (
                    <Cell key={i} fill={i === 0 ? 'hsl(200, 70%, 50%)' : i === 1 ? 'hsl(338, 72%, 60%)' : COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Situação Final */}
        {loadingSit ? <ChartSkeleton className="lg:col-span-4" /> : (
          <Card className="lg:col-span-4">
            <SectionTitle>Resultado Eleitoral</SectionTitle>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={situacao || []} dataKey="total" nameKey="nome" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {(situacao || []).map((e: any, i: number) => (
                    <Cell key={i} fill={SITUACAO_CORES[e.nome] || COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* ═══ ROW 2: Evolução + Faixa Etária ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Evolução por Ano */}
        {loadingEvol ? <ChartSkeleton /> : (
          <Card>
            <SectionTitle>Evolução por Ano Eleitoral</SectionTitle>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={evolucao || []}>
                <XAxis dataKey="ano" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" name="Candidatos" fill="hsl(338, 72%, 60%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="mulheres" name="Mulheres" fill="hsl(200, 70%, 50%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="eleitos" name="Eleitos" fill="hsl(156, 72%, 34%)" radius={[4, 4, 0, 0]} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Faixa Etária */}
        {loadingFaixa ? <ChartSkeleton /> : (
          <Card>
            <SectionTitle>Faixa Etária dos Candidatos</SectionTitle>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={faixaEtaria || []}>
                <XAxis dataKey="faixa" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" name="Candidatos" fill="hsl(280, 50%, 55%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* ═══ ROW 3: Escolaridade + Ocupações ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Escolaridade */}
        {loadingEscol ? <ChartSkeleton /> : (
          <Card>
            <SectionTitle>Grau de Instrução</SectionTitle>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={escolaridade || []} layout="vertical" margin={{ left: 160 }}>
                <XAxis type="number" />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={155} />
                <Tooltip />
                <Bar dataKey="total" name="Candidatos" fill="hsl(38, 60%, 58%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Ocupações */}
        {loadingOcup ? <ChartSkeleton /> : (
          <Card>
            <SectionTitle>Top 12 Ocupações</SectionTitle>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ocupacoes || []} layout="vertical" margin={{ left: 160 }}>
                <XAxis type="number" />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={155} />
                <Tooltip />
                <Bar dataKey="total" name="Candidatos" fill="hsl(200, 70%, 50%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* ═══ ROW 4: Por Cargo + Patrimônio Distribuição ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Candidatos por Cargo */}
        {loadingCargo ? <ChartSkeleton /> : (
          <Card>
            <SectionTitle>Candidatos por Cargo</SectionTitle>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={porCargo || []} dataKey="total" nameKey="cargo" cx="50%" cy="50%" outerRadius={100} paddingAngle={2}>
                  {(porCargo || []).map((_, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Patrimônio Distribuição por Faixa */}
        {loadingPatriDist ? <ChartSkeleton /> : (
          <Card>
            <SectionTitle>Distribuição Patrimonial (por candidato)</SectionTitle>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={patriDistrib || []}>
                <XAxis dataKey="faixa" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" name="Candidatos" fill="hsl(156, 72%, 34%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* ═══ ROW 5: Patrimônio Evolução + Top Patrimônio Table ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Patrimônio Evolução por Ano */}
        {loadingPatriEvol ? <ChartSkeleton /> : (
          <Card>
            <SectionTitle>Patrimônio Total Declarado por Ano</SectionTitle>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={patriEvolucao || []}>
                <XAxis dataKey="ano" />
                <YAxis tickFormatter={(v: number) => formatBRL(v)} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Area type="monotone" dataKey="total" name="Patrimônio Total" stroke="hsl(338, 72%, 60%)" fill="hsl(338, 72%, 60%)" fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="media" name="Média por Bem" stroke="hsl(38, 60%, 58%)" fill="hsl(38, 60%, 58%)" fillOpacity={0.1} strokeWidth={2} />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Top 10 Patrimônio */}
        {loadingPatri ? <TableSkeleton /> : (
          <Card>
            <SectionTitle>Top 10 Maior Patrimônio</SectionTitle>
            <div className="overflow-auto max-h-[280px]">
              <table className="w-full text-sm table-striped">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium"></th>
                    <th className="pb-2 font-medium">Nome</th>
                    <th className="pb-2 font-medium">Partido</th>
                    <th className="pb-2 font-medium text-right">Patrimônio</th>
                  </tr>
                </thead>
                <tbody>
                  {(topPatri || []).slice(0, 10).map((c, i) => (
                    <tr key={c.sequencial || i} className="border-b last:border-0">
                      <td className="py-2 text-muted-foreground text-xs">{i + 1}</td>
                      <td className="py-2"><CandidatoAvatar nome={c.nome} fotoUrl={c.foto_url} size={28} /></td>
                      <td className="py-2 font-medium text-xs">{c.nome}</td>
                      <td className="py-2 text-xs">{c.partido}</td>
                      <td className="py-2 text-right font-semibold text-xs">{formatBRL(c.patrimonio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-right">
              <Link to="/patrimonio" className="text-sm text-primary hover:underline font-medium">Ver ranking completo →</Link>
            </div>
          </Card>
        )}
      </div>

      {/* ═══ ROW 6: Eleitos Table ═══ */}
      {loadingEleitos ? <TableSkeleton /> : (eleitos && eleitos.length > 0) && (
        <Card>
          <SectionTitle>Eleitos no Filtro Atual</SectionTitle>
          <div className="overflow-auto max-h-[300px]">
            <table className="w-full text-sm table-striped">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium"></th>
                  <th className="pb-2 font-medium">Nome</th>
                  <th className="pb-2 font-medium">Partido</th>
                  <th className="pb-2 font-medium">Cargo</th>
                  <th className="pb-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {(eleitos || []).map((c: any) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2"><CandidatoAvatar nome={c.nome_urna} fotoUrl={c.foto_url} size={32} /></td>
                    <td className="py-2 font-medium">{c.nome_urna}</td>
                    <td className="py-2">{c.sigla_partido}</td>
                    <td className="py-2">{c.cargo}</td>
                    <td className="py-2"><SituacaoBadge situacao={c.situacao_final} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-right">
            <Link to="/ranking" className="text-sm text-primary hover:underline font-medium">Ver todos →</Link>
          </div>
        </Card>
      )}
    </div>
  );
}
