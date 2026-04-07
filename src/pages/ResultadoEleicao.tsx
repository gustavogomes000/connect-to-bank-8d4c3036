import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Vote, Users, MapPin, Building2, Trophy, TrendingUp, Filter, Search } from 'lucide-react';
import {
  useOpcoesResultado, useCandidatosOpcoes,
  useVotacaoPorMunicipio, useVotacaoPorCandidato,
  useVotacaoPorZona, useVotacaoPorBairro,
  useVotacaoPorLocal, useVotacaoPorPartido,
  useComparecimento,
  type FiltrosResultado,
} from '@/hooks/useResultadoEleicao';

const ANOS = [2024, 2022, 2020, 2018, 2016, 2014, 2012];
const TURNOS = [1, 2];
const COLORS = ['#1a56db', '#16bdca', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#f97316', '#6366f1', '#ec4899', '#14b8a6'];

function fmt(n: number) {
  return n.toLocaleString('pt-BR');
}

function KPICard({ title, value, icon: Icon, sub }: { title: string; value: string; icon: any; sub?: string }) {
  return (
    <Card className="bg-card border-border/50">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{title}</p>
          <p className="text-lg font-bold text-foreground">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function RankingTable({ data, colLabel, colValue, maxRows = 25 }: { data: { label: string; value: number; extra?: string }[]; colLabel: string; colValue: string; maxRows?: number }) {
  const sliced = data.slice(0, maxRows);
  const max = sliced[0]?.value || 1;
  return (
    <ScrollArea className="h-[400px]">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border/30">
            <th className="text-left py-2 px-2 text-muted-foreground font-medium">#</th>
            <th className="text-left py-2 px-2 text-muted-foreground font-medium">{colLabel}</th>
            <th className="text-right py-2 px-2 text-muted-foreground font-medium">{colValue}</th>
          </tr>
        </thead>
        <tbody>
          {sliced.map((r, i) => (
            <tr key={i} className="border-b border-border/10 hover:bg-muted/30 transition-colors">
              <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
              <td className="py-1.5 px-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-foreground font-medium truncate max-w-[200px]">{r.label}</span>
                  {r.extra && <span className="text-[10px] text-muted-foreground">{r.extra}</span>}
                </div>
                <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary/60" style={{ width: `${(r.value / max) * 100}%` }} />
                </div>
              </td>
              <td className="py-1.5 px-2 text-right font-mono font-semibold text-foreground">{fmt(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

export default function ResultadoEleicao() {
  const [ano, setAno] = useState(2024);
  const [turno, setTurno] = useState(1);
  const [cargo, setCargo] = useState<string | null>(null);
  const [municipio, setMunicipio] = useState<string | null>(null);
  const [candidato, setCandidato] = useState<string | null>(null);
  const [partido, setPartido] = useState<string | null>(null);
  const [zona, setZona] = useState<number | null>(null);
  const [searchCand, setSearchCand] = useState('');

  const filtros: FiltrosResultado = { ano, turno, cargo, municipio, candidato, partido, zona };

  const { data: opcoes, isLoading: loadOpcoes } = useOpcoesResultado(ano);
  const { data: candOpcoes } = useCandidatosOpcoes(ano, municipio);
  const { data: votMunicipio, isLoading: l1 } = useVotacaoPorMunicipio(filtros);
  const { data: votCandidato, isLoading: l2 } = useVotacaoPorCandidato(filtros);
  const { data: votZona, isLoading: l3 } = useVotacaoPorZona(filtros);
  const { data: votBairro, isLoading: l4 } = useVotacaoPorBairro(filtros);
  const { data: votLocal, isLoading: l5 } = useVotacaoPorLocal(filtros);
  const { data: votPartido, isLoading: l6 } = useVotacaoPorPartido(filtros);
  const { data: comp, isLoading: l7 } = useComparecimento(filtros);

  const totalVotos = useMemo(() => (votCandidato || []).reduce((s, r) => s + r.votos, 0), [votCandidato]);
  const filteredCandOpcoes = useMemo(() => {
    if (!candOpcoes) return [];
    if (!searchCand) return candOpcoes.slice(0, 50);
    return candOpcoes.filter(c => c.toLowerCase().includes(searchCand.toLowerCase())).slice(0, 50);
  }, [candOpcoes, searchCand]);

  const isLoading = l1 || l2 || l3 || l4 || l5 || l6 || l7;

  const limparFiltros = () => { setCargo(null); setMunicipio(null); setCandidato(null); setPartido(null); setZona(null); };
  const activeCount = [cargo, municipio, candidato, partido, zona].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Resultado por Eleição</h1>
          <p className="text-xs text-muted-foreground">Visualize resultados detalhados com filtros avançados</p>
        </div>
        {activeCount > 0 && (
          <button onClick={limparFiltros} className="text-xs text-primary hover:underline">
            Limpar filtros ({activeCount})
          </button>
        )}
      </div>

      {/* Filters */}
      <Card className="bg-card border-border/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Filtros</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {/* Ano */}
            <Select value={String(ano)} onValueChange={v => { setAno(Number(v)); limparFiltros(); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Ano" /></SelectTrigger>
              <SelectContent>{ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
            </Select>
            {/* Turno */}
            <Select value={String(turno)} onValueChange={v => setTurno(Number(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Turno" /></SelectTrigger>
              <SelectContent>{TURNOS.map(t => <SelectItem key={t} value={String(t)}>{t}º Turno</SelectItem>)}</SelectContent>
            </Select>
            {/* Cargo */}
            <Select value={cargo || '_all'} onValueChange={v => setCargo(v === '_all' ? null : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Cargo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos os cargos</SelectItem>
                {(opcoes?.cargos || []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Município */}
            <Select value={municipio || '_all'} onValueChange={v => { setMunicipio(v === '_all' ? null : v); setCandidato(null); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Município" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos os municípios</SelectItem>
                {(opcoes?.cidades || []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Partido */}
            <Select value={partido || '_all'} onValueChange={v => setPartido(v === '_all' ? null : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Partido" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos os partidos</SelectItem>
                {(opcoes?.partidos || []).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Zona */}
            <Select value={zona ? String(zona) : '_all'} onValueChange={v => setZona(v === '_all' ? null : Number(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Zona" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todas as zonas</SelectItem>
                {(opcoes?.zonas || []).map(z => <SelectItem key={z} value={String(z)}>Zona {z}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Candidato */}
            <Select value={candidato || '_all'} onValueChange={v => setCandidato(v === '_all' ? null : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Candidato" /></SelectTrigger>
              <SelectContent>
                <div className="p-1">
                  <div className="flex items-center gap-1 px-2 pb-1 border-b border-border/30">
                    <Search className="w-3 h-3 text-muted-foreground" />
                    <input
                      className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground/50"
                      placeholder="Buscar candidato..."
                      value={searchCand}
                      onChange={e => setSearchCand(e.target.value)}
                    />
                  </div>
                </div>
                <SelectItem value="_all">Todos os candidatos</SelectItem>
                {filteredCandOpcoes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Active filter badges */}
          {activeCount > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {cargo && <Badge variant="secondary" className="text-[10px]">Cargo: {cargo}</Badge>}
              {municipio && <Badge variant="secondary" className="text-[10px]">Município: {municipio}</Badge>}
              {partido && <Badge variant="secondary" className="text-[10px]">Partido: {partido}</Badge>}
              {zona && <Badge variant="secondary" className="text-[10px]">Zona: {zona}</Badge>}
              {candidato && <Badge variant="secondary" className="text-[10px]">Candidato: {candidato}</Badge>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard title="Total de Votos" value={isLoading ? '...' : fmt(totalVotos)} icon={Vote} />
        <KPICard title="Eleitores Aptos" value={l7 ? '...' : fmt(comp?.aptos || 0)} icon={Users} />
        <KPICard title="Comparecimento" value={l7 ? '...' : `${comp?.aptos ? ((comp.comp / comp.aptos) * 100).toFixed(1) : 0}%`} icon={TrendingUp} sub={l7 ? '' : fmt(comp?.comp || 0)} />
        <KPICard title="Abstenções" value={l7 ? '...' : fmt(comp?.abst || 0)} icon={Users} sub={l7 ? '' : `${comp?.aptos ? ((comp.abst / comp.aptos) * 100).toFixed(1) : 0}%`} />
        <KPICard title="Brancos + Nulos" value={l7 ? '...' : fmt((comp?.brancos || 0) + (comp?.nulos || 0))} icon={Vote} />
      </div>

      {/* Main content tabs */}
      <Tabs defaultValue="candidatos" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border/50 h-9">
          <TabsTrigger value="candidatos" className="text-xs">Candidatos</TabsTrigger>
          <TabsTrigger value="municipios" className="text-xs">Municípios</TabsTrigger>
          <TabsTrigger value="bairros" className="text-xs">Bairros</TabsTrigger>
          <TabsTrigger value="locais" className="text-xs">Locais de Votação</TabsTrigger>
          <TabsTrigger value="zonas" className="text-xs">Zonas</TabsTrigger>
          <TabsTrigger value="partidos" className="text-xs">Partidos</TabsTrigger>
        </TabsList>

        {/* ── Candidatos ── */}
        <TabsContent value="candidatos" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="bg-card border-border/50">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-sm flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" />Ranking de Candidatos</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {l2 ? <Skeleton className="h-[400px]" /> : (
                  <RankingTable
                    data={(votCandidato || []).map(r => ({ label: r.nome, value: r.votos, extra: r.partido }))}
                    colLabel="Candidato" colValue="Votos"
                  />
                )}
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-sm">Top 15 Candidatos</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {l2 ? <Skeleton className="h-[400px]" /> : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={(votCandidato || []).slice(0, 15)} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <XAxis type="number" tickFormatter={v => fmt(v)} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="nome" width={120} tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Bar dataKey="votos" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Municípios ── */}
        <TabsContent value="municipios" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="bg-card border-border/50">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" />Votação por Município</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {l1 ? <Skeleton className="h-[400px]" /> : (
                  <RankingTable
                    data={(votMunicipio || []).map(r => ({ label: r.municipio, value: r.votos }))}
                    colLabel="Município" colValue="Votos"
                  />
                )}
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-sm">Top 20 Municípios</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {l1 ? <Skeleton className="h-[400px]" /> : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={(votMunicipio || []).slice(0, 20)} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <XAxis type="number" tickFormatter={v => fmt(v)} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="municipio" width={130} tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Bar dataKey="votos" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Bairros ── */}
        <TabsContent value="bairros" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card className="bg-card border-border/50">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-sm flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" />Bairro - Votos</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {l4 ? <Skeleton className="h-[400px]" /> : (
                  <RankingTable
                    data={(votBairro || []).map(r => ({ label: r.bairro, value: r.votos }))}
                    colLabel="Bairro" colValue="Comparecimento"
                  />
                )}
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-sm">Bairro - % Comparecimento</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {l4 ? <Skeleton className="h-[400px]" /> : (
                  <RankingTable
                    data={(votBairro || []).map(r => ({ label: r.bairro, value: Number(r.percentual) }))}
                    colLabel="Bairro" colValue="%"
                  />
                )}
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-sm">Top 20 Bairros</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {l4 ? <Skeleton className="h-[400px]" /> : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={(votBairro || []).slice(0, 20)} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <XAxis type="number" tickFormatter={v => fmt(v)} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="bairro" width={130} tick={{ fontSize: 8 }} />
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Bar dataKey="votos" fill="#16bdca" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Locais ── */}
        <TabsContent value="locais" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="bg-card border-border/50">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" />Local de Votação</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {l5 ? <Skeleton className="h-[400px]" /> : (
                  <RankingTable
                    data={(votLocal || []).map(r => ({ label: r.local, value: r.votos }))}
                    colLabel="Local" colValue="Comparecimento"
                  />
                )}
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-sm">Top 20 Locais</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {l5 ? <Skeleton className="h-[400px]" /> : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={(votLocal || []).slice(0, 20)} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <XAxis type="number" tickFormatter={v => fmt(v)} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="local" width={180} tick={{ fontSize: 8 }} />
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Bar dataKey="votos" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Zonas ── */}
        <TabsContent value="zonas" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="bg-card border-border/50">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-sm">Votos por Zona Eleitoral</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {l3 ? <Skeleton className="h-[400px]" /> : (
                  <RankingTable
                    data={(votZona || []).map(r => ({ label: `Zona ${r.zona}`, value: r.votos }))}
                    colLabel="Zona" colValue="Votos"
                  />
                )}
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-sm">Distribuição por Zona</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {l3 ? <Skeleton className="h-[400px]" /> : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={votZona || []} margin={{ left: 10, right: 20 }}>
                      <XAxis dataKey="zona" tickFormatter={v => `Z${v}`} tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={l => `Zona ${l}`} />
                      <Bar dataKey="votos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Partidos ── */}
        <TabsContent value="partidos" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="bg-card border-border/50">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-sm">Votação por Partido</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {l6 ? <Skeleton className="h-[400px]" /> : (
                  <RankingTable
                    data={(votPartido || []).map(r => ({ label: r.partido, value: r.total, extra: `Nominais: ${fmt(r.nominais)} | Legenda: ${fmt(r.legenda)}` }))}
                    colLabel="Partido" colValue="Total"
                  />
                )}
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-sm">Distribuição Partidária</CardTitle>
              </CardHeader>
              <CardContent className="p-3 flex items-center justify-center">
                {l6 ? <Skeleton className="h-[400px] w-full" /> : (
                  <ResponsiveContainer width="100%" height={400}>
                    <PieChart>
                      <Pie
                        data={(votPartido || []).slice(0, 10).map(r => ({ name: r.partido, value: r.total }))}
                        cx="50%" cy="50%" outerRadius={140} innerRadius={60}
                        dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {(votPartido || []).slice(0, 10).map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
