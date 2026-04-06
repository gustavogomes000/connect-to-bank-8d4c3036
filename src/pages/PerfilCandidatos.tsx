import { usePerfilCandidatos, useFaixaEtaria, useDistribuicaoEscolaridade, useTopOcupacoes, useNacionalidade } from '@/hooks/useEleicoes';
import { formatNumber, formatPercent, CHART_COLORS } from '@/lib/eleicoes';
import { ChartSkeleton } from '@/components/eleicoes/Skeletons';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Legend } from 'recharts';
import { Users, Globe } from 'lucide-react';

export default function PerfilCandidatos() {
  const { data: perfil, isLoading } = usePerfilCandidatos();
  const { data: faixaEtaria, isLoading: loadingIdade } = useFaixaEtaria();
  const { data: escolaridade, isLoading: loadingEsc } = useDistribuicaoEscolaridade();
  const { data: ocupacoes, isLoading: loadingOcup } = useTopOcupacoes();
  const { data: nacionalidade, isLoading: loadingNac } = useNacionalidade();

  if (isLoading) return <ChartSkeleton />;

  const generoData = (perfil?.generos || []).map((g, i) => ({ ...g, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  const instrucaoData = (escolaridade || perfil?.instrucoes || []).slice(0, 10);
  const ocupacaoData = (ocupacoes || perfil?.ocupacoes || []).slice(0, 15);
  const totalCandidatos = perfil?.total || 0;

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" /> Perfil dos Candidatos
        </h1>
        <span className="text-xs text-muted-foreground">{formatNumber(totalCandidatos)} candidatos no filtro</span>
      </div>

      {/* Row 1: Gender + Age */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-card rounded-lg border border-border/50 p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Gênero</h3>
          <div className="grid grid-cols-2 gap-4">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={generoData} dataKey="total" nameKey="nome" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} strokeWidth={0}>
                  {generoData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatNumber(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col justify-center space-y-3">
              {generoData.map((g, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: g.fill }} />
                      {g.nome}
                    </span>
                    <span className="font-semibold metric-value">{formatNumber(g.total)}</span>
                  </div>
                  <div className="w-full bg-muted/50 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full" style={{ backgroundColor: g.fill, width: `${totalCandidatos > 0 ? (g.total / totalCandidatos) * 100 : 0}%` }} />
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{totalCandidatos > 0 ? formatPercent((g.total / totalCandidatos) * 100) : '0%'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border/50 p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Faixa Etária</h3>
          {loadingIdade ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={faixaEtaria || []}>
                <XAxis dataKey="faixa" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => formatNumber(v)} />
                <Bar dataKey="total" name="Candidatos" fill="hsl(280, 60%, 55%)" radius={[3, 3, 0, 0]}>
                  {(faixaEtaria || []).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Row 2: Education */}
      <div className="bg-card rounded-lg border border-border/50 p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Grau de Instrução</h3>
        {loadingEsc ? <ChartSkeleton /> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={instrucaoData} layout="vertical" margin={{ left: 160 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={150} />
                <Tooltip formatter={(v: number) => formatNumber(v)} />
                <Bar dataKey="total" fill="hsl(var(--secondary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="space-y-1.5">
              {instrucaoData.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 truncate">{item.nome}</span>
                  <div className="w-32 bg-muted/50 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-secondary" style={{ width: `${totalCandidatos > 0 ? (item.total / totalCandidatos) * 100 : 0}%` }} />
                  </div>
                  <span className="w-12 text-right font-semibold metric-value">{formatNumber(item.total)}</span>
                  <span className="w-10 text-right text-muted-foreground">{totalCandidatos > 0 ? formatPercent((item.total / totalCandidatos) * 100) : '0%'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Row 3: Occupation + Nacionalidade */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-card rounded-lg border border-border/50 p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Top Ocupações</h3>
          {loadingOcup ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={Math.max(350, (ocupacaoData.length || 0) * 25)}>
              <BarChart data={ocupacaoData} layout="vertical" margin={{ left: 200 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={190} />
                <Tooltip formatter={(v: number) => formatNumber(v)} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                  {(ocupacaoData || []).map((_: any, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card rounded-lg border border-border/50 p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Globe className="w-3 h-3" /> Nacionalidade
          </h3>
          {loadingNac ? <ChartSkeleton /> : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={(nacionalidade || []).slice(0, 6)} dataKey="total" nameKey="nome" cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={2} strokeWidth={0}>
                    {(nacionalidade || []).slice(0, 6).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatNumber(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1">
                {(nacionalidade || []).map((n: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      {n.nome}
                    </span>
                    <span className="font-semibold metric-value">{formatNumber(n.total)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
