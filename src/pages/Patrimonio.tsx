import { useState } from 'react';
import { useTopPatrimonio, useEvolucaoPatrimonio, usePatrimonioDistribuicao, usePatrimonioPorPartido, usePatrimonioEvolucaoAno, usePatrimonioVsVotos } from '@/hooks/useEleicoes';
import { formatNumber, formatBRL, formatBRLCompact, getPartidoCor, CHART_COLORS } from '@/lib/eleicoes';
import { TableSkeleton, ChartSkeleton } from '@/components/eleicoes/Skeletons';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend, ScatterChart, Scatter, ZAxis } from 'recharts';
import { DollarSign, Search, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Patrimonio() {
  const [candidatoSelecionado, setCandidatoSelecionado] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const { data: topPatrimonio, isLoading } = useTopPatrimonio();
  const { data: evolucao, isLoading: loadingEvolucao } = useEvolucaoPatrimonio(candidatoSelecionado || '');
  const { data: distribuicao, isLoading: loadingDist } = usePatrimonioDistribuicao();
  const { data: porPartido, isLoading: loadingPartido } = usePatrimonioPorPartido();
  const { data: evolucaoAno, isLoading: loadingEvolAno } = usePatrimonioEvolucaoAno();
  const { data: scatterData, isLoading: loadingScatter } = usePatrimonioVsVotos();

  const chartData = (topPatrimonio || []).slice(0, 12).map(c => ({
    nome: c.nome.length > 18 ? c.nome.slice(0, 16) + '…' : c.nome,
    patrimonio: c.patrimonio,
  }));

  const filteredTop = search
    ? (topPatrimonio || []).filter(c => c.nome.toLowerCase().includes(search.toLowerCase()))
    : topPatrimonio;

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-primary" /> Patrimônio dos Candidatos
      </h1>

      <Tabs defaultValue="ranking" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="distribuicao">Distribuição</TabsTrigger>
          <TabsTrigger value="partido">Por Partido</TabsTrigger>
          <TabsTrigger value="evolucao">Evolução Anual</TabsTrigger>
          <TabsTrigger value="correlacao">Patrimônio vs Votos</TabsTrigger>
        </TabsList>

        <TabsContent value="ranking" className="space-y-4">
          {isLoading ? <ChartSkeleton /> : chartData.length > 0 && (
            <div className="bg-card rounded-lg border border-border/50 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Top 12 — Maior Patrimônio Declarado</h3>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 130 }}>
                  <XAxis type="number" tickFormatter={(v: number) => formatBRLCompact(v)} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Bar dataKey="patrimonio" name="Patrimônio" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {candidatoSelecionado && (
            <div className="bg-card rounded-lg border border-border/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp className="w-3 h-3" /> Evolução — {candidatoSelecionado}
                </h3>
                <button className="text-xs text-primary hover:underline" onClick={() => setCandidatoSelecionado(null)}>Fechar</button>
              </div>
              {loadingEvolucao ? <ChartSkeleton /> : (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={evolucao || []}>
                    <XAxis dataKey="ano" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(v: number) => formatBRLCompact(v)} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => formatBRL(v)} />
                    <Line type="monotone" dataKey="patrimonio" name="Patrimônio" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          <div className="bg-card rounded-lg border border-border/50 p-4">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ranking Completo</h3>
              <div className="relative ml-auto max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar candidato..." className="pl-8 h-7 text-xs" />
              </div>
            </div>
            {isLoading ? <TableSkeleton /> : (
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-xs table-striped">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border/30 text-left">
                      <th className="pb-2 px-2 font-medium text-muted-foreground">#</th>
                      <th className="pb-2 px-2 font-medium text-muted-foreground w-8"></th>
                      <th className="pb-2 px-2 font-medium text-muted-foreground">Nome</th>
                      <th className="pb-2 px-2 font-medium text-muted-foreground">Partido</th>
                      <th className="pb-2 px-2 font-medium text-muted-foreground">Cargo</th>
                      <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Patrimônio</th>
                      <th className="pb-2 px-2 font-medium text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(filteredTop || []).map((c, i) => (
                      <tr key={c.sequencial || i} className="border-b border-border/20 last:border-0 hover:bg-muted/50">
                        <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-1.5 px-2"><CandidatoAvatar nome={c.nome} fotoUrl={c.foto_url} size={24} /></td>
                        <td className="py-1.5 px-2 font-medium">{c.nome}</td>
                        <td className="py-1.5 px-2" style={{ color: getPartidoCor(c.partido) }}>{c.partido}</td>
                        <td className="py-1.5 px-2 text-muted-foreground">{c.cargo}</td>
                        <td className="py-1.5 px-2 text-right font-semibold text-primary metric-value">{formatBRL(c.patrimonio)}</td>
                        <td className="py-1.5 px-2">
                          <button className="text-[10px] text-primary hover:underline" onClick={() => setCandidatoSelecionado(c.nome)}>Evolução</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(!filteredTop || filteredTop.length === 0) && <p className="text-center text-muted-foreground py-8 text-xs">Nenhum dado encontrado.</p>}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="distribuicao" className="space-y-4">
          {loadingDist ? <ChartSkeleton /> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="bg-card rounded-lg border border-border/50 p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Distribuição por Faixa</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={distribuicao || []}>
                    <XAxis dataKey="faixa" tick={{ fontSize: 10 }} angle={-20} height={50} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="total" name="Candidatos" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-card rounded-lg border border-border/50 p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Proporção</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie data={distribuicao || []} dataKey="total" nameKey="faixa" cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={2} strokeWidth={0}>
                      {(distribuicao || []).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="partido" className="space-y-4">
          {loadingPartido ? <ChartSkeleton /> : porPartido && porPartido.length > 0 ? (
            <div className="bg-card rounded-lg border border-border/50 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Patrimônio Total por Partido</h3>
              <ResponsiveContainer width="100%" height={450}>
                <BarChart data={porPartido} layout="vertical" margin={{ left: 55 }}>
                  <XAxis type="number" tickFormatter={(v: number) => formatBRLCompact(v)} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="partido" tick={{ fontSize: 10 }} width={50} />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Bar dataKey="total" name="Total" radius={[0, 3, 3, 0]}>
                    {porPartido.map((e: any, i: number) => <Cell key={i} fill={getPartidoCor(e.partido)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs table-striped">
                  <thead>
                    <tr className="border-b border-border/30 text-left">
                      <th className="pb-2 px-2 font-medium text-muted-foreground">Partido</th>
                      <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Total</th>
                      <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Média/Bem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porPartido.map((p: any, i: number) => (
                      <tr key={i} className="border-b border-border/20">
                        <td className="py-1.5 px-2 font-semibold" style={{ color: getPartidoCor(p.partido) }}>{p.partido}</td>
                        <td className="py-1.5 px-2 text-right metric-value">{formatBRL(p.total)}</td>
                        <td className="py-1.5 px-2 text-right text-muted-foreground">{formatBRL(p.media)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <p className="text-center text-muted-foreground py-8">Dados não disponíveis.</p>}
        </TabsContent>

        <TabsContent value="evolucao" className="space-y-4">
          {loadingEvolAno ? <ChartSkeleton /> : evolucaoAno && evolucaoAno.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="bg-card rounded-lg border border-border/50 p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Patrimônio Total por Ano</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={evolucaoAno}>
                    <XAxis dataKey="ano" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(v: number) => formatBRLCompact(v)} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => formatBRL(v)} />
                    <Bar dataKey="total" name="Total" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-card rounded-lg border border-border/50 p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Média por Bem Declarado</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={evolucaoAno}>
                    <XAxis dataKey="ano" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(v: number) => formatBRLCompact(v)} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => formatBRL(v)} />
                    <Line type="monotone" dataKey="media" name="Média" stroke="hsl(var(--secondary))" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : <p className="text-center text-muted-foreground py-8">Dados não disponíveis.</p>}
        </TabsContent>

        <TabsContent value="correlacao" className="space-y-4">
          {loadingScatter ? <ChartSkeleton /> : scatterData && scatterData.length > 0 ? (
            <div className="bg-card rounded-lg border border-border/50 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Correlação: Patrimônio × Votos</h3>
              <p className="text-[10px] text-muted-foreground mb-3">Cada ponto é um candidato. Hover para ver detalhes.</p>
              <ResponsiveContainer width="100%" height={450}>
                <ScatterChart margin={{ left: 20 }}>
                  <XAxis type="number" dataKey="patrimonio" name="Patrimônio" tickFormatter={(v: number) => formatBRLCompact(v)} tick={{ fontSize: 10 }} />
                  <YAxis type="number" dataKey="votos" name="Votos" tickFormatter={(v: number) => formatNumber(v)} tick={{ fontSize: 10 }} />
                  <ZAxis range={[30, 120]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.[0]) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border border-border rounded-md px-3 py-2 shadow-lg text-xs">
                          <p className="font-semibold">{d.nome}</p>
                          <p className="text-muted-foreground">{d.partido}</p>
                          <p>Patrimônio: <span className="font-semibold">{formatBRL(d.patrimonio)}</span></p>
                          <p>Votos: <span className="font-semibold">{formatNumber(d.votos)}</span></p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterData} fill="hsl(var(--primary))" fillOpacity={0.6} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-center text-muted-foreground py-8 text-sm">Dados de patrimônio e/ou votação ainda não importados.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
