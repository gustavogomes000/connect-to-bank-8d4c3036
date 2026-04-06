import { useState } from 'react';
import { useVotosBrancosNulos, useMunicipios, useDataAvailability, useVotacaoPorZona } from '@/hooks/useEleicoes';
import { formatNumber, formatPercent, CHART_COLORS, ANOS_DISPONIVEIS } from '@/lib/eleicoes';
import { ChartSkeleton, TableSkeleton } from '@/components/eleicoes/Skeletons';
import { DataPendingCard } from '@/components/eleicoes/DataPendingCard';
import { Pagination } from '@/components/eleicoes/Pagination';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import { Search, TrendingUp, Vote, MapPin, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';

function useComparecimentoGeral() {
  return useQuery({
    queryKey: ['comparecimentoGeralFull'],
    queryFn: async () => {
      const { data } = await (supabase.from('bd_eleicoes_comparecimento' as any) as any)
        .select('ano, municipio, zona, eleitorado_apto, comparecimento, abstencoes, votos_brancos, votos_nulos')
        .limit(5000);
      return data || [];
    },
  });
}

function useComparecimentoPorMunicipio() {
  const { ano } = useFilterStore();
  return useQuery({
    queryKey: ['comparecimentoPorMunicipio', ano],
    queryFn: async () => {
      let q = (supabase.from('bd_eleicoes_comparecimento' as any) as any)
        .select('municipio, eleitorado_apto, comparecimento, abstencoes');
      if (ano) q = q.eq('ano', ano);
      const { data } = await q.limit(5000);
      const map = new Map<string, { municipio: string; apto: number; comp: number; abst: number }>();
      (data || []).forEach((r: any) => {
        const m = r.municipio || 'N/A';
        const cur = map.get(m) || { municipio: m, apto: 0, comp: 0, abst: 0 };
        cur.apto += r.eleitorado_apto || 0;
        cur.comp += r.comparecimento || 0;
        cur.abst += r.abstencoes || 0;
        map.set(m, cur);
      });
      return Array.from(map.values()).sort((a, b) => b.apto - a.apto);
    },
  });
}

export default function Comparecimento() {
  const { data: availability } = useDataAvailability();
  const { data: dadosGerais, isLoading: loadingGeral } = useComparecimentoGeral();
  const { data: brancosNulos, isLoading: loadingBN } = useVotosBrancosNulos();
  const { data: porMunicipio, isLoading: loadingMuni } = useComparecimentoPorMunicipio();
  const [muniPage, setMuniPage] = useState(0);
  const [muniPageSize, setMuniPageSize] = useState(30);
  const [muniSearch, setMuniSearch] = useState('');

  if (!availability?.comparecimento) {
    return (
      <div className="max-w-[1600px] mx-auto space-y-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Vote className="w-5 h-5 text-primary" /> Comparecimento & Abstenção
        </h1>
        <DataPendingCard titulo="Dados de comparecimento não disponíveis" tabela="bd_eleicoes_comparecimento" descricao="Importe os dados de comparecimento para visualizar esta análise." />
      </div>
    );
  }

  // Aggregate by year
  const porAno = new Map<number, { apto: number; comp: number; abst: number; brancos: number; nulos: number }>();
  (dadosGerais || []).forEach((r: any) => {
    const cur = porAno.get(r.ano) || { apto: 0, comp: 0, abst: 0, brancos: 0, nulos: 0 };
    cur.apto += r.eleitorado_apto || 0;
    cur.comp += r.comparecimento || 0;
    cur.abst += r.abstencoes || 0;
    cur.brancos += r.votos_brancos || 0;
    cur.nulos += r.votos_nulos || 0;
    porAno.set(r.ano, cur);
  });
  const evolucao = Array.from(porAno.entries()).map(([ano, v]) => ({
    ano, ...v,
    pctComp: v.apto > 0 ? (v.comp / v.apto) * 100 : 0,
    pctAbst: v.apto > 0 ? (v.abst / v.apto) * 100 : 0,
  })).sort((a, b) => a.ano - b.ano);

  // Total
  const total = evolucao.reduce((acc, r) => ({
    apto: acc.apto + r.apto, comp: acc.comp + r.comp, abst: acc.abst + r.abst,
    brancos: acc.brancos + r.brancos, nulos: acc.nulos + r.nulos,
  }), { apto: 0, comp: 0, abst: 0, brancos: 0, nulos: 0 });

  const filteredMuni = muniSearch
    ? (porMunicipio || []).filter(m => m.municipio.toLowerCase().includes(muniSearch.toLowerCase()))
    : porMunicipio || [];

  const tooltipStyle = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 };

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Vote className="w-5 h-5 text-primary" /> Comparecimento & Abstenção
      </h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Eleitorado Total', value: formatNumber(total.apto), color: 'text-[hsl(var(--chart-1))]' },
          { label: 'Comparecimento', value: formatNumber(total.comp), color: 'text-success' },
          { label: 'Abstenções', value: formatNumber(total.abst), color: 'text-destructive' },
          { label: '% Comparecimento', value: total.apto > 0 ? formatPercent((total.comp / total.apto) * 100) : '—', color: 'text-success' },
          { label: 'Votos Nulos', value: formatNumber(total.nulos), color: 'text-warning' },
        ].map((kpi, i) => (
          <div key={i} className="bg-card rounded-lg border border-border/50 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
            <p className={`text-xl font-bold metric-value ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="evolucao" className="space-y-4">
        <TabsList>
          <TabsTrigger value="evolucao"><TrendingUp className="w-3.5 h-3.5 mr-1" /> Evolução</TabsTrigger>
          <TabsTrigger value="brancos"><Vote className="w-3.5 h-3.5 mr-1" /> Brancos/Nulos</TabsTrigger>
          <TabsTrigger value="municipios"><MapPin className="w-3.5 h-3.5 mr-1" /> Por Município</TabsTrigger>
        </TabsList>

        <TabsContent value="evolucao" className="space-y-4">
          {loadingGeral ? <ChartSkeleton /> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="bg-card rounded-lg border border-border/50 p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Eleitorado × Comparecimento</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={evolucao}>
                    <XAxis dataKey="ano" tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} tickFormatter={(v: number) => formatNumber(v)} />
                    <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Area type="monotone" dataKey="apto" name="Eleitorado" fill="hsl(190, 80%, 45%)" stroke="hsl(190, 80%, 45%)" fillOpacity={0.15} />
                    <Area type="monotone" dataKey="comp" name="Comparecimento" fill="hsl(156, 72%, 40%)" stroke="hsl(156, 72%, 40%)" fillOpacity={0.15} />
                    <Area type="monotone" dataKey="abst" name="Abstenções" fill="hsl(0, 50%, 55%)" stroke="hsl(0, 50%, 55%)" fillOpacity={0.15} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-card rounded-lg border border-border/50 p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">% Comparecimento × Abstenção</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={evolucao}>
                    <XAxis dataKey="ano" tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} />
                    <YAxis unit="%" tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="pctComp" name="% Comparecimento" stroke="hsl(156, 72%, 40%)" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="pctAbst" name="% Abstenção" stroke="hsl(0, 50%, 55%)" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {/* Table */}
          <div className="bg-card rounded-lg border border-border/50 p-4 overflow-x-auto">
            <table className="w-full text-xs table-striped">
              <thead>
                <tr className="border-b border-border/30 text-left">
                  <th className="pb-2 px-2 font-medium text-muted-foreground">Ano</th>
                  <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Eleitorado</th>
                  <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Comparec.</th>
                  <th className="pb-2 px-2 font-medium text-muted-foreground text-right">% Comp.</th>
                  <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Abstenções</th>
                  <th className="pb-2 px-2 font-medium text-muted-foreground text-right">% Abst.</th>
                  <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Brancos</th>
                  <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Nulos</th>
                </tr>
              </thead>
              <tbody>
                {evolucao.map(r => (
                  <tr key={r.ano} className="border-b border-border/20">
                    <td className="py-1.5 px-2 font-semibold">{r.ano}</td>
                    <td className="py-1.5 px-2 text-right metric-value">{formatNumber(r.apto)}</td>
                    <td className="py-1.5 px-2 text-right metric-value">{formatNumber(r.comp)}</td>
                    <td className="py-1.5 px-2 text-right text-success">{formatPercent(r.pctComp)}</td>
                    <td className="py-1.5 px-2 text-right metric-value">{formatNumber(r.abst)}</td>
                    <td className="py-1.5 px-2 text-right text-destructive">{formatPercent(r.pctAbst)}</td>
                    <td className="py-1.5 px-2 text-right text-muted-foreground">{formatNumber(r.brancos)}</td>
                    <td className="py-1.5 px-2 text-right text-muted-foreground">{formatNumber(r.nulos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="brancos" className="space-y-4">
          {loadingBN ? <ChartSkeleton /> : brancosNulos && brancosNulos.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="bg-card rounded-lg border border-border/50 p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Brancos e Nulos por Ano</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={brancosNulos}>
                    <XAxis dataKey="ano" tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} tickFormatter={(v: number) => formatNumber(v)} />
                    <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="brancos" name="Brancos" fill="hsl(45, 93%, 50%)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="nulos" name="Nulos" fill="hsl(0, 50%, 55%)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-card rounded-lg border border-border/50 p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">% sobre Comparecimento</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={brancosNulos}>
                    <XAxis dataKey="ano" tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} />
                    <YAxis unit="%" tick={{ fontSize: 10, fill: 'hsl(210, 15%, 55%)' }} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="pctBrancos" name="% Brancos" stroke="hsl(45, 93%, 50%)" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="pctNulos" name="% Nulos" stroke="hsl(0, 50%, 55%)" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : <p className="text-center text-muted-foreground py-8">Dados não disponíveis.</p>}
        </TabsContent>

        <TabsContent value="municipios" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={muniSearch} onChange={e => { setMuniSearch(e.target.value); setMuniPage(0); }} placeholder="Buscar município..." className="pl-9 h-8 text-xs" />
          </div>
          {loadingMuni ? <TableSkeleton /> : (
            <>
              {(porMunicipio || []).length > 0 && (
                <div className="bg-card rounded-lg border border-border/50 p-4">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Top 15 Municípios por Eleitorado</h3>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={(porMunicipio || []).slice(0, 15)} layout="vertical" margin={{ left: 120 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatNumber(v)} />
                      <YAxis type="category" dataKey="municipio" tick={{ fontSize: 10 }} width={115} />
                      <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="apto" name="Eleitorado" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="comp" name="Comparecimento" fill="hsl(156, 72%, 40%)" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="bg-card rounded-lg border border-border/50 overflow-hidden">
                <div className="overflow-x-auto p-4 pb-0">
                  <table className="w-full text-xs table-striped">
                    <thead>
                      <tr className="border-b border-border/30 text-left">
                        <th className="pb-2 px-2 font-medium text-muted-foreground">#</th>
                        <th className="pb-2 px-2 font-medium text-muted-foreground">Município</th>
                        <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Eleitorado</th>
                        <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Comparecimento</th>
                        <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Abstenções</th>
                        <th className="pb-2 px-2 font-medium text-muted-foreground text-right">% Comp.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMuni.slice(muniPage * muniPageSize, (muniPage + 1) * muniPageSize).map((m, i) => (
                        <tr key={m.municipio} className="border-b border-border/20 last:border-0">
                          <td className="py-1.5 px-2 text-muted-foreground">{muniPage * muniPageSize + i + 1}</td>
                          <td className="py-1.5 px-2 font-medium">{m.municipio}</td>
                          <td className="py-1.5 px-2 text-right metric-value">{formatNumber(m.apto)}</td>
                          <td className="py-1.5 px-2 text-right metric-value">{formatNumber(m.comp)}</td>
                          <td className="py-1.5 px-2 text-right text-muted-foreground">{formatNumber(m.abst)}</td>
                          <td className="py-1.5 px-2 text-right text-success">{m.apto > 0 ? formatPercent((m.comp / m.apto) * 100) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredMuni.length > 0 && (
                  <Pagination page={muniPage} totalItems={filteredMuni.length} pageSize={muniPageSize} onPageChange={setMuniPage} onPageSizeChange={setMuniPageSize} />
                )}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
