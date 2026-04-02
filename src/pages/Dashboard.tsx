import { useKPIs, useTop10Votados, useVotosPorPartido, useComparecimentoPorAno, useEleitos, useCheckEmpty } from '@/hooks/useEleicoes';
import { formatNumber, formatPercent, getPartidoCor } from '@/lib/eleicoes';
import { KPISkeleton, ChartSkeleton, TableSkeleton } from '@/components/eleicoes/Skeletons';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { EmptyState } from '@/components/eleicoes/EmptyState';
import { Users, Vote, CheckCircle, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { data: isEmpty, isLoading: loadingEmpty } = useCheckEmpty();
  const { data: kpis, isLoading: loadingKPIs } = useKPIs();
  const { data: top10, isLoading: loadingTop10 } = useTop10Votados();
  const { data: votosPorPartido, isLoading: loadingPartidos } = useVotosPorPartido();
  const { data: comparecimento, isLoading: loadingComp } = useComparecimentoPorAno();
  const { data: eleitos, isLoading: loadingEleitos } = useEleitos();

  if (loadingEmpty) return <KPISkeleton />;
  if (isEmpty) return <EmptyState />;

  const kpiCards = [
    { icon: Users, label: 'Candidatos', value: formatNumber(kpis?.totalCandidatos), sub: 'no filtro atual', color: 'text-primary' },
    { icon: Vote, label: 'Votos Válidos', value: formatNumber(kpis?.totalVotos), sub: 'total apurados', color: 'text-secondary' },
    { icon: CheckCircle, label: 'Eleitos', value: formatNumber(kpis?.totalEleitos), sub: 'no filtro atual', color: 'text-[hsl(var(--success))]' },
    { icon: BarChart3, label: 'Comparecimento', value: formatPercent(kpis?.pctComparecimento), sub: 'do eleitorado', color: 'text-[hsl(var(--warning))]' },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      {loadingKPIs ? (
        <KPISkeleton />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {loadingTop10 ? (
          <ChartSkeleton className="lg:col-span-3" />
        ) : (
          <div className="bg-card rounded-xl border p-5 lg:col-span-3">
            <h3 className="text-base font-semibold mb-4">Top 10 Mais Votados</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={top10} layout="vertical" margin={{ left: 120 }}>
                <XAxis type="number" tickFormatter={(v: number) => formatNumber(v)} />
                <YAxis type="category" dataKey="nome_candidato" tick={{ fontSize: 12 }} width={110} />
                <Tooltip formatter={(v: number) => formatNumber(v)} />
                <Bar dataKey="total_votos" name="Votos" radius={[0, 4, 4, 0]}>
                  {(top10 || []).map((entry: any, idx: number) => (
                    <Cell key={idx} fill={getPartidoCor(entry.partido)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {loadingPartidos ? (
          <ChartSkeleton className="lg:col-span-2" />
        ) : (
          <div className="bg-card rounded-xl border p-5 lg:col-span-2">
            <h3 className="text-base font-semibold mb-4">Votos por Partido</h3>
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={(votosPorPartido || []).slice(0, 10)}
                  dataKey="votos"
                  nameKey="partido"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                >
                  {(votosPorPartido || []).slice(0, 10).map((entry: any, idx: number) => (
                    <Cell key={idx} fill={getPartidoCor(entry.partido)} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatNumber(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {loadingComp ? (
          <ChartSkeleton />
        ) : (
          <div className="bg-card rounded-xl border p-5">
            <h3 className="text-base font-semibold mb-4">Comparecimento por Ano</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={comparecimento}>
                <XAxis dataKey="ano" />
                <YAxis tickFormatter={(v: number) => formatNumber(v)} />
                <Tooltip formatter={(v: number) => formatNumber(v)} />
                <Bar dataKey="eleitorado" name="Eleitorado Apto" fill="hsl(221, 83%, 48%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="comparecimento" name="Comparecimento" fill="hsl(156, 72%, 34%)" radius={[4, 4, 0, 0]} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {loadingEleitos ? (
          <TableSkeleton />
        ) : (
          <div className="bg-card rounded-xl border p-5">
            <h3 className="text-base font-semibold mb-4">Eleitos Neste Filtro</h3>
            <div className="overflow-auto max-h-[280px]">
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
                      <td className="py-2">{c.sigla_partido || c.partido}</td>
                      <td className="py-2">{c.cargo}</td>
                      <td className="py-2"><SituacaoBadge situacao={c.situacao_final} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-right">
              <Link to="/ranking" className="text-sm text-primary hover:underline font-medium">Ver ranking completo →</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
