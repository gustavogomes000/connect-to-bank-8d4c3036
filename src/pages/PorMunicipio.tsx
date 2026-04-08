import { useState } from 'react';
import { useMunicipios, useMunicipioResumo, useMunicipioCandidatos, useMunicipioVotos, useDataAvailability, useVotacaoPorZona } from '@/hooks/useEleicoes';
import { formatNumber, formatPercent } from '@/lib/eleicoes';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { KPISkeleton, TableSkeleton, ChartSkeleton } from '@/components/eleicoes/Skeletons';
import { DataPendingCard } from '@/components/eleicoes/DataPendingCard';
import { VotosRegionalTable } from '@/components/eleicoes/VotosRegionalTable';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';
import { Search, Trophy, Users, TrendingUp, MapPin, School } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFilterStore } from '@/stores/filterStore';
import { mdQuery, getTableName } from '@/lib/motherduck';
import { useQuery } from '@tanstack/react-query';

import { Pagination } from '@/components/eleicoes/Pagination';

export default function PorMunicipio() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [votosPage, setVotosPage] = useState(0);
  const [votosPageSize, setVotosPageSize] = useState(30);
  const { data: municipios } = useMunicipios();
  const { data: availability } = useDataAvailability();
  const { ano } = useFilterStore();
  const navigate = useNavigate();

  const filtered = (municipios || []).filter((m) =>
    m.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 10);

  const { data: resumo, isLoading: loadingResumo } = useMunicipioResumo(selected);
  const { data: candidatos, isLoading: loadingCandidatos } = useMunicipioCandidatos(selected);
  const { data: votos, isLoading: loadingVotos } = useMunicipioVotos(selected);
  const { data: zonas, isLoading: loadingZonas } = useVotacaoPorZona(selected || undefined);

  // Regional breakdown for selected municipality
  const { data: regional, isLoading: loadingRegional } = useQuery({
    queryKey: ['municipioRegional', selected, ano],
    queryFn: async () => {
      if (!selected) return [];
      const vot = getTableName('votacao_secao', ano);
      const loc = getTableName('eleitorado_local', ano);
      return mdQuery(`
        SELECT v.NR_ZONA AS zona, COALESCE(loc.NM_BAIRRO, '') AS bairro,
          COALESCE(loc.NM_LOCAL_VOTACAO, '') AS escola,
          COUNT(DISTINCT v.NR_SECAO) AS secoes,
          SUM(v.QT_VOTOS_NOMINAIS) AS total_votos
        FROM ${vot} v
        INNER JOIN ${loc} loc ON v.NR_ZONA = loc.NR_ZONA AND v.NR_SECAO = loc.NR_SECAO
          AND loc.SG_UF = 'GO' AND loc.NM_MUNICIPIO = '${selected}'
        WHERE v.NM_MUNICIPIO = '${selected}'
        GROUP BY v.NR_ZONA, loc.NM_BAIRRO, loc.NM_LOCAL_VOTACAO
        ORDER BY total_votos DESC LIMIT 300
      `);
    },
    enabled: !!selected,
    staleTime: 5 * 60 * 1000,
  });

  const hasComparecimento = availability?.comparecimento;
  const hasVotacao = availability?.votacao;

  const porCargo = (candidatos || []).reduce((acc: Record<string, any[]>, r: any) => {
    const cargo = r.cargo || 'Outros';
    if (!acc[cargo]) acc[cargo] = [];
    acc[cargo].push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <MapPin className="w-5 h-5 text-primary" /> Por Município
      </h1>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); if (selected) setSelected(null); }}
          placeholder="Buscar município..."
          className="pl-9 h-9 text-sm"
        />
        {search && !selected && filtered.length > 0 && (
          <div className="absolute top-full mt-1 w-full bg-card border rounded-lg shadow-lg z-10 max-h-60 overflow-auto">
            {filtered.map((m) => (
              <button key={m} className="w-full px-4 py-2 text-left hover:bg-muted text-sm" onClick={() => { setSelected(m); setSearch(m); }}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {!selected && (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Selecione um município para ver os dados</p>
        </div>
      )}

      {selected && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {hasComparecimento && resumo ? (
              loadingResumo ? <KPISkeleton /> : (
                <>
                  <div className="bg-card rounded-lg border border-border/50 p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Eleitorado Apto</p>
                    <p className="text-xl font-bold metric-value">{formatNumber(resumo.totals.apto)}</p>
                  </div>
                  <div className="bg-card rounded-lg border border-border/50 p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Comparecimento</p>
                    <p className="text-xl font-bold metric-value">{formatNumber(resumo.totals.comp)}</p>
                    <p className="text-[9px] text-success">{resumo.totals.apto ? formatPercent((resumo.totals.comp / resumo.totals.apto) * 100) : '—'}</p>
                  </div>
                  <div className="bg-card rounded-lg border border-border/50 p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Abstenções</p>
                    <p className="text-xl font-bold metric-value">{formatNumber(resumo.totals.abst)}</p>
                  </div>
                </>
              )
            ) : (
              <div className="col-span-3">
                <DataPendingCard titulo="Comparecimento não disponível" tabela="bd_eleicoes_comparecimento" descricao="KPIs após importação." />
              </div>
            )}
            <div className="bg-card rounded-lg border border-border/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Candidatos</p>
              <p className="text-xl font-bold metric-value">{formatNumber(candidatos?.length || 0)}</p>
            </div>
            <div className="bg-card rounded-lg border border-border/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Eleitos</p>
              <p className="text-xl font-bold text-success metric-value">
                {formatNumber((candidatos || []).filter((c: any) => {
                  const s = (c.situacao_final || '').toUpperCase();
                  return s.includes('ELEITO') && !s.includes('NÃO');
                }).length)}
              </p>
            </div>
          </div>

          <Tabs defaultValue="candidatos" className="space-y-3">
            <TabsList className="flex-wrap">
              <TabsTrigger value="candidatos"><Users className="w-3.5 h-3.5 mr-1" /> Candidatos</TabsTrigger>
              {hasVotacao && <TabsTrigger value="votados"><Trophy className="w-3.5 h-3.5 mr-1" /> Mais Votados</TabsTrigger>}
              {hasComparecimento && <TabsTrigger value="zonas"><MapPin className="w-3.5 h-3.5 mr-1" /> Por Zona</TabsTrigger>}
              <TabsTrigger value="regional"><School className="w-3.5 h-3.5 mr-1" /> Por Bairro/Escola</TabsTrigger>
              {hasComparecimento && <TabsTrigger value="historico"><TrendingUp className="w-3.5 h-3.5 mr-1" /> Histórico</TabsTrigger>}
            </TabsList>

            <TabsContent value="candidatos">
              {loadingCandidatos ? <TableSkeleton /> : (
                <div className="space-y-3">
                  {Object.entries(porCargo).map(([cargo, cands]) => (
                    <div key={cargo} className="bg-card rounded-lg border border-border/50 p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                        {cargo}
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{(cands as any[]).length}</span>
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs table-striped">
                          <thead>
                            <tr className="border-b border-border/30 text-left">
                              <th className="pb-1.5 font-medium w-8"></th>
                              <th className="pb-1.5 font-medium">Nome</th>
                              <th className="pb-1.5 font-medium">Nº</th>
                              <th className="pb-1.5 font-medium">Partido</th>
                              <th className="pb-1.5 font-medium">Situação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(cands as any[]).slice(0, 30).map((c: any) => (
                              <tr key={c.id} className="border-b border-border/20 last:border-0 cursor-pointer hover:bg-primary/5" onClick={() => navigate(`/candidato/${c.id}`)}>
                                <td className="py-1.5"><CandidatoAvatar nome={c.nome_urna} fotoUrl={c.foto_url} size={24} /></td>
                                <td className="py-1.5 font-medium">{c.nome_urna}</td>
                                <td className="py-1.5 font-mono text-muted-foreground">{c.numero_urna}</td>
                                <td className="py-1.5">{c.sigla_partido}</td>
                                <td className="py-1.5"><SituacaoBadge situacao={c.situacao_final} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {(cands as any[]).length > 30 && <p className="text-[10px] text-muted-foreground mt-1">Mostrando 30 de {(cands as any[]).length}</p>}
                      </div>
                    </div>
                  ))}
                  {(!candidatos || candidatos.length === 0) && <p className="text-center text-muted-foreground py-8 text-sm">Nenhum candidato encontrado.</p>}
                </div>
              )}
            </TabsContent>

            {hasVotacao && (
              <TabsContent value="votados">
                {loadingVotos ? <TableSkeleton /> : (
                  <div className="bg-card rounded-lg border border-border/50 overflow-hidden">
                    <div className="overflow-x-auto p-4 pb-0">
                      <table className="w-full text-xs table-striped">
                        <thead>
                          <tr className="border-b border-border/30 text-left">
                            <th className="pb-2 font-medium text-muted-foreground">#</th>
                            <th className="pb-2 font-medium text-muted-foreground">Nome</th>
                            <th className="pb-2 font-medium text-muted-foreground">Partido</th>
                            <th className="pb-2 font-medium text-muted-foreground">Cargo</th>
                            <th className="pb-2 font-medium text-muted-foreground text-right">Votos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(votos || []).slice(votosPage * votosPageSize, (votosPage + 1) * votosPageSize).map((r: any, i: number) => (
                            <tr key={i} className="border-b border-border/20 last:border-0">
                              <td className="py-1.5 text-muted-foreground">{votosPage * votosPageSize + i + 1}</td>
                              <td className="py-1.5 font-medium">{r.nome_candidato}</td>
                              <td className="py-1.5">{r.partido}</td>
                              <td className="py-1.5">{r.cargo}</td>
                              <td className="py-1.5 text-right font-semibold text-primary metric-value">{formatNumber(r.total_votos)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(!votos || votos.length === 0) && <p className="text-center text-muted-foreground py-8 text-xs">Nenhum dado de votação.</p>}
                    </div>
                    {votos && votos.length > 0 && (
                      <Pagination page={votosPage} totalItems={votos.length} pageSize={votosPageSize} onPageChange={setVotosPage} onPageSizeChange={setVotosPageSize} />
                    )}
                  </div>
                )}
              </TabsContent>
            )}

            {hasComparecimento && (
              <TabsContent value="zonas">
                {loadingZonas ? <ChartSkeleton /> : zonas && zonas.length > 0 ? (
                  <div className="space-y-3">
                    <div className="bg-card rounded-lg border border-border/50 p-4">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Eleitorado por Zona Eleitoral</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={zonas}>
                          <XAxis dataKey="zona" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatNumber(v)} />
                          <Tooltip formatter={(v: number) => formatNumber(v)} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar dataKey="apto" name="Eleitorado" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                          <Bar dataKey="comp" name="Comparecimento" fill="hsl(156, 72%, 40%)" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="bg-card rounded-lg border border-border/50 p-4 overflow-x-auto">
                      <table className="w-full text-xs table-striped">
                        <thead>
                          <tr className="border-b border-border/30 text-left">
                            <th className="pb-2 font-medium text-muted-foreground">Zona</th>
                            <th className="pb-2 font-medium text-muted-foreground text-right">Eleitorado</th>
                            <th className="pb-2 font-medium text-muted-foreground text-right">Comparecimento</th>
                            <th className="pb-2 font-medium text-muted-foreground text-right">Abstenções</th>
                            <th className="pb-2 font-medium text-muted-foreground text-right">Brancos</th>
                            <th className="pb-2 font-medium text-muted-foreground text-right">Nulos</th>
                            <th className="pb-2 font-medium text-muted-foreground text-right">% Comp.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {zonas.map((z: any) => (
                            <tr key={z.zona} className="border-b border-border/20 last:border-0">
                              <td className="py-1.5 font-semibold">Zona {z.zona}</td>
                              <td className="py-1.5 text-right metric-value">{formatNumber(z.apto)}</td>
                              <td className="py-1.5 text-right metric-value">{formatNumber(z.comp)}</td>
                              <td className="py-1.5 text-right text-muted-foreground">{formatNumber(z.abst)}</td>
                              <td className="py-1.5 text-right text-muted-foreground">{formatNumber(z.brancos)}</td>
                              <td className="py-1.5 text-right text-muted-foreground">{formatNumber(z.nulos)}</td>
                              <td className="py-1.5 text-right text-success">{z.apto > 0 ? formatPercent((z.comp / z.apto) * 100) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : <p className="text-center text-muted-foreground py-8 text-sm">Nenhum dado de zona eleitoral.</p>}
              </TabsContent>
            )}

            <TabsContent value="regional">
              <VotosRegionalTable
                data={regional || []}
                isLoading={loadingRegional}
                title={`Votos por Bairro/Escola — ${selected}`}
                emptyMessage="Selecione um município para ver a distribuição regional."
              />
            </TabsContent>


              <TabsContent value="historico">
                <div className="bg-card rounded-lg border border-border/50 p-4">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={resumo.historico || []}>
                      <XAxis dataKey="ano" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v: number) => formatNumber(v)} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => formatNumber(v)} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
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
