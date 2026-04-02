import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatNumber, formatPercent } from '@/lib/eleicoes';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { KPISkeleton, TableSkeleton, ChartSkeleton } from '@/components/eleicoes/Skeletons';
import { useMunicipios } from '@/hooks/useEleicoes';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Search, Trophy, List, TrendingUp } from 'lucide-react';

export default function PorMunicipio() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const { data: municipios } = useMunicipios();

  const filtered = (municipios || []).filter((m) =>
    m.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 10);

  // Summary data
  const { data: resumo, isLoading: loadingResumo } = useQuery({
    queryKey: ['municipioResumo', selected],
    queryFn: async () => {
      const { data } = await (supabase.from('bd_eleicoes_comparecimento' as any) as any)
        .select('ano, eleitorado_apto, comparecimento, abstencoes')
        .eq('municipio', selected);
      
      const totals = (data || []).reduce((acc: any, r: any) => ({
        apto: acc.apto + (r.eleitorado_apto || 0),
        comp: acc.comp + (r.comparecimento || 0),
        abst: acc.abst + (r.abstencoes || 0),
      }), { apto: 0, comp: 0, abst: 0 });

      // Historical
      const map = new Map<number, any>();
      (data || []).forEach((r: any) => {
        const cur = map.get(r.ano) || { ano: r.ano, apto: 0, comp: 0, abst: 0 };
        cur.apto += r.eleitorado_apto || 0;
        cur.comp += r.comparecimento || 0;
        cur.abst += r.abstencoes || 0;
        map.set(r.ano, cur);
      });

      return {
        totals,
        historico: Array.from(map.values()).sort((a, b) => a.ano - b.ano),
      };
    },
    enabled: !!selected,
  });

  // Votação data
  const { data: votacao, isLoading: loadingVotacao } = useQuery({
    queryKey: ['municipioVotacao', selected],
    queryFn: async () => {
      const { data } = await (supabase.from('bd_eleicoes_votacao' as any) as any)
        .select('*')
        .eq('municipio', selected)
        .order('total_votos', { ascending: false })
        .limit(200);
      return data || [];
    },
    enabled: !!selected,
  });

  // Group by cargo
  const porCargo = (votacao || []).reduce((acc: Record<string, any[]>, r: any) => {
    const cargo = r.cargo || 'Outros';
    if (!acc[cargo]) acc[cargo] = [];
    acc[cargo].push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Por Município</h1>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar município..."
          className="pl-9"
        />
        {search && !selected && filtered.length > 0 && (
          <div className="absolute top-full mt-1 w-full bg-card border rounded-lg shadow-lg z-10 max-h-60 overflow-auto">
            {filtered.map((m) => (
              <button
                key={m}
                className="w-full px-4 py-2 text-left hover:bg-muted text-sm"
                onClick={() => { setSelected(m); setSearch(m); }}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <>
          {loadingResumo ? (
            <KPISkeleton />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-card rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">Eleitorado Apto</p>
                <p className="text-2xl font-bold">{formatNumber(resumo?.totals.apto)}</p>
              </div>
              <div className="bg-card rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">Comparecimento</p>
                <p className="text-2xl font-bold">{formatNumber(resumo?.totals.comp)}</p>
              </div>
              <div className="bg-card rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">Abstenções</p>
                <p className="text-2xl font-bold">{formatNumber(resumo?.totals.abst)}</p>
              </div>
              <div className="bg-card rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">% Comparecimento</p>
                <p className="text-2xl font-bold">
                  {resumo?.totals.apto ? formatPercent((resumo.totals.comp / resumo.totals.apto) * 100) : '0%'}
                </p>
              </div>
            </div>
          )}

          <Tabs defaultValue="votados" className="space-y-4">
            <TabsList>
              <TabsTrigger value="votados"><Trophy className="w-4 h-4 mr-1" /> Mais Votados</TabsTrigger>
              <TabsTrigger value="cargo"><List className="w-4 h-4 mr-1" /> Por Cargo</TabsTrigger>
              <TabsTrigger value="historico"><TrendingUp className="w-4 h-4 mr-1" /> Histórico</TabsTrigger>
            </TabsList>

            <TabsContent value="votados">
              {loadingVotacao ? (
                <TableSkeleton />
              ) : (
                <div className="bg-card rounded-xl border p-5 overflow-x-auto">
                  <table className="w-full text-sm table-striped">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">#</th>
                        <th className="pb-2 font-medium">Nome</th>
                        <th className="pb-2 font-medium">Partido</th>
                        <th className="pb-2 font-medium">Cargo</th>
                        <th className="pb-2 font-medium">Votos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(votacao || []).slice(0, 50).map((r: any, i: number) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="py-2 font-medium">{i + 1}</td>
                          <td className="py-2 font-medium">{r.nome_candidato}</td>
                          <td className="py-2">{r.partido}</td>
                          <td className="py-2">{r.cargo}</td>
                          <td className="py-2">{formatNumber(r.total_votos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="cargo">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(porCargo).map(([cargo, candidatos]) => (
                  <div key={cargo} className="bg-card rounded-xl border p-4">
                    <h4 className="font-semibold mb-3">{cargo}</h4>
                    <div className="space-y-2">
                      {(candidatos as any[]).slice(0, 5).map((c: any, i: number) => (
                        <div key={c.id} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <span className="text-muted-foreground w-5">{i + 1}.</span>
                            <span className="font-medium">{c.nome_candidato}</span>
                            <span className="text-muted-foreground">{c.partido}</span>
                          </span>
                          <span className="font-medium">{formatNumber(c.total_votos)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="historico">
              <div className="bg-card rounded-xl border p-5">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={resumo?.historico || []}>
                    <XAxis dataKey="ano" />
                    <YAxis tickFormatter={(v: number) => formatNumber(v)} />
                    <Tooltip formatter={(v: number) => formatNumber(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="apto" name="Eleitorado Apto" stroke="hsl(221, 83%, 48%)" strokeWidth={2} />
                    <Line type="monotone" dataKey="comp" name="Comparecimento" stroke="hsl(156, 72%, 34%)" strokeWidth={2} />
                    <Line type="monotone" dataKey="abst" name="Abstenções" stroke="hsl(0, 79%, 52%)" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>

                <table className="w-full text-sm mt-4 table-striped">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium">Ano</th>
                      <th className="pb-2 font-medium">Eleitorado</th>
                      <th className="pb-2 font-medium">Comparecimento</th>
                      <th className="pb-2 font-medium">Abstenções</th>
                    </tr>
                  </thead>
                  <tbody>
                {((resumo?.historico as any[]) || []).map((h: any) => (
                      <tr key={h.ano} className="border-b last:border-0">
                        <td className="py-2">{h.ano}</td>
                        <td className="py-2">{formatNumber(h.apto)}</td>
                        <td className="py-2">{formatNumber(h.comp)}</td>
                        <td className="py-2">{formatNumber(h.abst)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
