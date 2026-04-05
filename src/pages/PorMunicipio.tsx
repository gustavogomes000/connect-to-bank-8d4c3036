import { useState } from 'react';
import { useMunicipios, useMunicipioResumo, useMunicipioCandidatos, useMunicipioVotos, useDataAvailability } from '@/hooks/useEleicoes';
import { formatNumber, formatPercent } from '@/lib/eleicoes';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { KPISkeleton, TableSkeleton, ChartSkeleton } from '@/components/eleicoes/Skeletons';
import { DataPendingCard } from '@/components/eleicoes/DataPendingCard';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Search, Trophy, Users, TrendingUp, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PorMunicipio() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const { data: municipios } = useMunicipios();
  const { data: availability } = useDataAvailability();
  const navigate = useNavigate();

  const filtered = (municipios || []).filter((m) =>
    m.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 10);

  const { data: resumo, isLoading: loadingResumo } = useMunicipioResumo(selected);
  const { data: candidatos, isLoading: loadingCandidatos } = useMunicipioCandidatos(selected);
  const { data: votos, isLoading: loadingVotos } = useMunicipioVotos(selected);

  const hasComparecimento = availability?.comparecimento;
  const hasVotacao = availability?.votacao;

  // Group candidatos by cargo
  const porCargo = (candidatos || []).reduce((acc: Record<string, any[]>, r: any) => {
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
          onChange={(e) => { setSearch(e.target.value); if (selected) setSelected(null); }}
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

      {!selected && (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Selecione um município para ver os dados</p>
        </div>
      )}

      {selected && (
        <>
          {/* KPIs comparecimento */}
          {hasComparecimento && resumo ? (
            loadingResumo ? <KPISkeleton /> : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-card rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">Eleitorado Apto</p>
                  <p className="text-2xl font-bold">{formatNumber(resumo.totals.apto)}</p>
                </div>
                <div className="bg-card rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">Comparecimento</p>
                  <p className="text-2xl font-bold">{formatNumber(resumo.totals.comp)}</p>
                </div>
                <div className="bg-card rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">Abstenções</p>
                  <p className="text-2xl font-bold">{formatNumber(resumo.totals.abst)}</p>
                </div>
                <div className="bg-card rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">% Comparecimento</p>
                  <p className="text-2xl font-bold">
                    {resumo.totals.apto ? formatPercent((resumo.totals.comp / resumo.totals.apto) * 100) : '—'}
                  </p>
                </div>
              </div>
            )
          ) : (
            <DataPendingCard
              titulo="Comparecimento não disponível"
              tabela="bd_eleicoes_comparecimento"
              descricao="Os KPIs de eleitorado apto, comparecimento e abstenções serão exibidos após a importação."
            />
          )}

          {/* KPIs de candidatos (sempre disponível) */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-card rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">Candidatos</p>
              <p className="text-2xl font-bold">{formatNumber(candidatos?.length || 0)}</p>
            </div>
            <div className="bg-card rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">Eleitos</p>
              <p className="text-2xl font-bold">
                {formatNumber((candidatos || []).filter((c: any) => {
                  const s = (c.situacao_final || '').toUpperCase();
                  return s.includes('ELEITO') && !s.includes('NÃO');
                }).length)}
              </p>
            </div>
            <div className="bg-card rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">Cargos</p>
              <p className="text-2xl font-bold">{Object.keys(porCargo).length}</p>
            </div>
          </div>

          <Tabs defaultValue="candidatos" className="space-y-4">
            <TabsList>
              <TabsTrigger value="candidatos"><Users className="w-4 h-4 mr-1" /> Candidatos</TabsTrigger>
              {hasVotacao && <TabsTrigger value="votados"><Trophy className="w-4 h-4 mr-1" /> Mais Votados</TabsTrigger>}
              {hasComparecimento && <TabsTrigger value="historico"><TrendingUp className="w-4 h-4 mr-1" /> Histórico</TabsTrigger>}
            </TabsList>

            <TabsContent value="candidatos">
              {loadingCandidatos ? <TableSkeleton /> : (
                <div className="space-y-4">
                  {Object.entries(porCargo).map(([cargo, cands]) => (
                    <div key={cargo} className="bg-card rounded-xl border p-5">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        {cargo}
                        <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{(cands as any[]).length}</span>
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm table-striped">
                          <thead>
                            <tr className="border-b text-left">
                              <th className="pb-2 font-medium w-10"></th>
                              <th className="pb-2 font-medium">Nome</th>
                              <th className="pb-2 font-medium">Nº</th>
                              <th className="pb-2 font-medium">Partido</th>
                              <th className="pb-2 font-medium">Situação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(cands as any[]).slice(0, 20).map((c: any) => (
                              <tr
                                key={c.id}
                                className="border-b last:border-0 cursor-pointer hover:bg-primary/5"
                                onClick={() => navigate(`/candidato/${c.id}`)}
                              >
                                <td className="py-2"><CandidatoAvatar nome={c.nome_urna} fotoUrl={c.foto_url} size={28} /></td>
                                <td className="py-2 font-medium">{c.nome_urna}</td>
                                <td className="py-2">{c.numero_urna}</td>
                                <td className="py-2">{c.sigla_partido}</td>
                                <td className="py-2"><SituacaoBadge situacao={c.situacao_final} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {(cands as any[]).length > 20 && (
                          <p className="text-xs text-muted-foreground mt-2">Mostrando 20 de {(cands as any[]).length}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {(!candidatos || candidatos.length === 0) && (
                    <p className="text-center text-muted-foreground py-8">Nenhum candidato encontrado neste município.</p>
                  )}
                </div>
              )}
            </TabsContent>

            {hasVotacao && (
              <TabsContent value="votados">
                {loadingVotos ? <TableSkeleton /> : (
                  <div className="bg-card rounded-xl border p-5 overflow-x-auto">
                    <table className="w-full text-sm table-striped">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 font-medium">#</th>
                          <th className="pb-2 font-medium">Nome</th>
                          <th className="pb-2 font-medium">Partido</th>
                          <th className="pb-2 font-medium">Cargo</th>
                          <th className="pb-2 font-medium text-right">Votos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(votos || []).slice(0, 50).map((r: any, i: number) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2 font-medium">{i + 1}</td>
                            <td className="py-2 font-medium">{r.nome_candidato}</td>
                            <td className="py-2">{r.partido}</td>
                            <td className="py-2">{r.cargo}</td>
                            <td className="py-2 text-right font-semibold">{formatNumber(r.total_votos)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(!votos || votos.length === 0) && (
                      <p className="text-center text-muted-foreground py-8">Nenhum dado de votação encontrado.</p>
                    )}
                  </div>
                )}
              </TabsContent>
            )}

            {hasComparecimento && resumo && (
              <TabsContent value="historico">
                <div className="bg-card rounded-xl border p-5">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={resumo.historico || []}>
                      <XAxis dataKey="ano" />
                      <YAxis tickFormatter={(v: number) => formatNumber(v)} />
                      <Tooltip formatter={(v: number) => formatNumber(v)} />
                      <Legend />
                      <Line type="monotone" dataKey="apto" name="Eleitorado Apto" stroke="hsl(338, 72%, 60%)" strokeWidth={2} />
                      <Line type="monotone" dataKey="comp" name="Comparecimento" stroke="hsl(156, 72%, 34%)" strokeWidth={2} />
                      <Line type="monotone" dataKey="abst" name="Abstenções" stroke="hsl(0, 79%, 52%)" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </>
      )}
    </div>
  );
}
