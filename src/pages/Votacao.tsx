import { useState } from 'react';
import { useDataAvailability } from '@/hooks/useEleicoes';
import { formatNumber, formatPercent, getPartidoCor, CHART_COLORS } from '@/lib/eleicoes';
import { ChartSkeleton, TableSkeleton } from '@/components/eleicoes/Skeletons';
import { DataPendingCard } from '@/components/eleicoes/DataPendingCard';
import { Pagination } from '@/components/eleicoes/Pagination';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Search, Trophy, Target, Vote } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';
import { useNavigate } from 'react-router-dom';

function useTopVotados() {
  const { ano, municipio, cargo } = useFilterStore();
  return useQuery({
    queryKey: ['topVotados', ano, municipio, cargo],
    queryFn: async () => {
      let q = (supabase.from('bd_eleicoes_votacao' as any) as any)
        .select('nome_candidato, partido, cargo, municipio, total_votos, numero_urna')
        .order('total_votos', { ascending: false })
        .limit(500);
      if (ano) q = q.eq('ano', ano);
      if (municipio) q = q.eq('municipio', municipio);
      if (cargo) q = q.ilike('cargo', cargo);
      const { data } = await q;
      // Aggregate by candidate name
      const map = new Map<string, any>();
      (data || []).forEach((r: any) => {
        const key = r.nome_candidato;
        if (!key) return;
        const cur = map.get(key) || { ...r, total_votos: 0 };
        cur.total_votos += r.total_votos || 0;
        map.set(key, cur);
      });
      return Array.from(map.values()).sort((a, b) => b.total_votos - a.total_votos);
    },
  });
}

function useVotosPorPartido() {
  const { ano, municipio, cargo } = useFilterStore();
  return useQuery({
    queryKey: ['votosPorPartido', ano, municipio, cargo],
    queryFn: async () => {
      let q = (supabase.from('bd_eleicoes_votacao_partido' as any) as any)
        .select('sigla_partido, total_votos, votos_nominais, votos_legenda')
        .limit(2000);
      if (ano) q = q.eq('ano', ano);
      if (municipio) q = q.eq('municipio', municipio);
      if (cargo) q = q.ilike('cargo', cargo);
      const { data } = await q;
      const map = new Map<string, { partido: string; total: number; nominais: number; legenda: number }>();
      (data || []).forEach((r: any) => {
        const p = r.sigla_partido || 'OUTROS';
        const cur = map.get(p) || { partido: p, total: 0, nominais: 0, legenda: 0 };
        cur.total += r.total_votos || 0;
        cur.nominais += r.votos_nominais || 0;
        cur.legenda += r.votos_legenda || 0;
        map.set(p, cur);
      });
      return Array.from(map.values()).sort((a, b) => b.total - a.total);
    },
  });
}

export default function Votacao() {
  const { data: availability } = useDataAvailability();
  const { data: topVotados, isLoading: loadingTop } = useTopVotados();
  const { data: votosPorPartido, isLoading: loadingPartido } = useVotosPorPartido();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(30);
  const navigate = useNavigate();

  if (!availability?.votacao) {
    return (
      <div className="max-w-[1600px] mx-auto space-y-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" /> Votação Detalhada
        </h1>
        <DataPendingCard titulo="Dados de votação não disponíveis" tabela="bd_eleicoes_votacao" descricao="Importe os dados de votação para visualizar esta análise." />
      </div>
    );
  }

  const totalVotos = (topVotados || []).reduce((s, r) => s + (r.total_votos || 0), 0);
  const filtered = search
    ? (topVotados || []).filter(r => r.nome_candidato.toLowerCase().includes(search.toLowerCase()))
    : topVotados || [];

  const tooltipStyle = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 };

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" /> Votação Detalhada
        </h1>
        <span className="text-xs text-muted-foreground">{formatNumber(totalVotos)} votos totais</span>
      </div>

      <Tabs defaultValue="ranking" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ranking"><Trophy className="w-3.5 h-3.5 mr-1" /> Mais Votados</TabsTrigger>
          <TabsTrigger value="partidos"><Target className="w-3.5 h-3.5 mr-1" /> Por Partido</TabsTrigger>
        </TabsList>

        <TabsContent value="ranking" className="space-y-4">
          {loadingTop ? <ChartSkeleton /> : (
            <>
              {/* Chart top 15 */}
              <div className="bg-card rounded-lg border border-border/50 p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Top 15 Mais Votados</h3>
                <ResponsiveContainer width="100%" height={Math.max(380, Math.min((topVotados || []).length, 15) * 28)}>
                  <BarChart data={(topVotados || []).slice(0, 15)} layout="vertical" margin={{ left: 140 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatNumber(v)} />
                    <YAxis type="category" dataKey="nome_candidato" tick={{ fontSize: 10 }} width={130} />
                    <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} />
                    <Bar dataKey="total_votos" name="Votos" radius={[0, 4, 4, 0]}>
                      {(topVotados || []).slice(0, 15).map((r: any, i: number) => (
                        <Cell key={i} fill={getPartidoCor(r.partido)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Full table */}
              <div className="flex items-center gap-2 mb-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Buscar candidato..." className="pl-9 h-8 text-xs" />
                </div>
              </div>

              <div className="bg-card rounded-lg border border-border/50 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs table-striped">
                    <thead>
                      <tr className="border-b border-border/30 text-left bg-muted/30">
                        <th className="px-2 py-2 font-medium text-muted-foreground">#</th>
                        <th className="px-2 py-2 font-medium text-muted-foreground">Nome</th>
                        <th className="px-2 py-2 font-medium text-muted-foreground">Nº</th>
                        <th className="px-2 py-2 font-medium text-muted-foreground">Partido</th>
                        <th className="px-2 py-2 font-medium text-muted-foreground">Cargo</th>
                        <th className="px-2 py-2 font-medium text-muted-foreground">Município</th>
                        <th className="px-2 py-2 font-medium text-muted-foreground text-right">Votos</th>
                        <th className="px-2 py-2 font-medium text-muted-foreground text-right">% Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(page * pageSize, (page + 1) * pageSize).map((r: any, i: number) => (
                        <tr key={r.nome_candidato + i} className="border-b border-border/20 last:border-0 hover:bg-primary/5">
                          <td className="px-2 py-1.5 text-muted-foreground">{page * pageSize + i + 1}</td>
                          <td className="px-2 py-1.5 font-medium">{r.nome_candidato}</td>
                          <td className="px-2 py-1.5 font-mono text-muted-foreground">{r.numero_urna}</td>
                          <td className="px-2 py-1.5 font-semibold" style={{ color: getPartidoCor(r.partido) }}>{r.partido}</td>
                          <td className="px-2 py-1.5">{r.cargo}</td>
                          <td className="px-2 py-1.5">{r.municipio}</td>
                          <td className="px-2 py-1.5 text-right font-semibold text-primary metric-value">{formatNumber(r.total_votos)}</td>
                          <td className="px-2 py-1.5 text-right text-muted-foreground">{totalVotos > 0 ? formatPercent((r.total_votos / totalVotos) * 100) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="partidos" className="space-y-4">
          {loadingPartido ? <ChartSkeleton /> : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="bg-card rounded-lg border border-border/50 p-4">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Votos por Partido (Top 15)</h3>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={(votosPorPartido || []).slice(0, 15)} layout="vertical" margin={{ left: 55 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatNumber(v)} />
                      <YAxis type="category" dataKey="partido" tick={{ fontSize: 10 }} width={50} />
                      <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} />
                      <Bar dataKey="total" name="Total" radius={[0, 3, 3, 0]}>
                        {(votosPorPartido || []).slice(0, 15).map((r: any, i: number) => (
                          <Cell key={i} fill={getPartidoCor(r.partido)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-card rounded-lg border border-border/50 p-4">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Nominais × Legenda (Top 10)</h3>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={(votosPorPartido || []).slice(0, 10)} layout="vertical" margin={{ left: 55 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatNumber(v)} />
                      <YAxis type="category" dataKey="partido" tick={{ fontSize: 10 }} width={50} />
                      <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="nominais" name="Nominais" fill="hsl(190, 80%, 45%)" radius={[0, 2, 2, 0]} />
                      <Bar dataKey="legenda" name="Legenda" fill="hsl(45, 93%, 50%)" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-card rounded-lg border border-border/50 p-4 overflow-x-auto">
                <table className="w-full text-xs table-striped">
                  <thead>
                    <tr className="border-b border-border/30 text-left">
                      <th className="pb-2 px-2 font-medium text-muted-foreground">#</th>
                      <th className="pb-2 px-2 font-medium text-muted-foreground">Partido</th>
                      <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Total</th>
                      <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Nominais</th>
                      <th className="pb-2 px-2 font-medium text-muted-foreground text-right">Legenda</th>
                      <th className="pb-2 px-2 font-medium text-muted-foreground text-right">% Legenda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(votosPorPartido || []).map((p: any, i: number) => (
                      <tr key={p.partido} className="border-b border-border/20">
                        <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-1.5 px-2 font-semibold" style={{ color: getPartidoCor(p.partido) }}>{p.partido}</td>
                        <td className="py-1.5 px-2 text-right font-semibold metric-value">{formatNumber(p.total)}</td>
                        <td className="py-1.5 px-2 text-right metric-value">{formatNumber(p.nominais)}</td>
                        <td className="py-1.5 px-2 text-right text-muted-foreground">{formatNumber(p.legenda)}</td>
                        <td className="py-1.5 px-2 text-right">{p.total > 0 ? formatPercent((p.legenda / p.total) * 100) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
