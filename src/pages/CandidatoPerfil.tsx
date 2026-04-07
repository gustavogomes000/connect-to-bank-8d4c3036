import { useParams, Link } from 'react-router-dom';
import { useCandidato, useCandidatoVotos, usePatrimonioCandidato, useEvolucaoPatrimonio, useDataAvailability } from '@/hooks/useEleicoes';
import { formatNumber, formatPercent, getPartidoCor, CHART_COLORS } from '@/lib/eleicoes';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { KPISkeleton } from '@/components/eleicoes/Skeletons';
import { DataPendingCard } from '@/components/eleicoes/DataPendingCard';
import { mdQuery, MD, COL } from '@/lib/motherduck';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, DollarSign, MapPin, Vote, Users, TrendingUp, Award, ArrowLeft } from 'lucide-react';

export default function CandidatoPerfil() {
  const { id } = useParams<{ id: string }>();
  const { data: candidato, isLoading } = useCandidato(id || '');
  const { data: availability } = useDataAvailability();
  const { data: votos } = useCandidatoVotos(candidato?.nome_urna || '', candidato?.ano || 0);
  const { data: bens } = usePatrimonioCandidato(candidato?.sequencial_candidato || '');
  const { data: evolucaoPatrimonio } = useEvolucaoPatrimonio(candidato?.nome_urna || '');
  const [votosPage, setVotosPage] = useState(0);
  const [activeTab, setActiveTab] = useState<'info' | 'votos' | 'patrimonio' | 'historico'>('info');

  // Histórico eleitoral via MotherDuck
  const { data: historico } = useQuery({
    queryKey: ['historicoCandidato', candidato?.nome_urna],
    queryFn: async () => {
      if (!candidato) return [];
      const nomeUrna = candidato.nome_urna?.replace(/'/g, "''") || '';
      const nomeCompleto = candidato.nome_completo?.replace(/'/g, "''") || '';
      return mdQuery(
        `SELECT ${COL.sequencial} as id, ${COL.ano} as ano, ${COL.cargo} as cargo, ${COL.partido} as sigla_partido,
          ${COL.municipio} as municipio, ${COL.numero} as numero_urna, ${COL.situacaoFinal} as situacao_final,
          ${COL.nomeUrna} as nome_urna
        FROM ${MD.candidatos(null)}
        WHERE ${COL.nomeUrna} = '${nomeUrna}' OR ${COL.nomeCompleto} = '${nomeCompleto}'
        ORDER BY ${COL.ano}`
      );
    },
    enabled: !!candidato,
  });

  // Votos por zona via MotherDuck
  const { data: votosPorZona } = useQuery({
    queryKey: ['votosPorZona', candidato?.nome_urna, candidato?.ano, candidato?.municipio],
    queryFn: async () => {
      if (!candidato) return [];
      const ano = Number(candidato.ano);
      const nomeUrna = candidato.nome_urna?.replace(/'/g, "''") || '';
      const mun = candidato.municipio?.replace(/'/g, "''") || '';
      try {
        return await mdQuery(
          `SELECT nr_zona as zona, sum(qt_votos_nominais) as total_votos
          FROM ${MD.votacao(ano)} WHERE nm_urna_candidato = '${nomeUrna}' AND nm_municipio = '${mun}'
          GROUP BY nr_zona ORDER BY zona`
        ).then(rows => rows.map((r: any) => ({ zona: Number(r.zona), total_votos: Number(r.total_votos) })));
      } catch { return []; }
    },
    enabled: !!candidato && !!availability?.votacao,
  });

  // Ranking no partido via MotherDuck
  const { data: rankingPartido } = useQuery({
    queryKey: ['rankingPartido', candidato?.sigla_partido, candidato?.cargo, candidato?.municipio, candidato?.ano],
    queryFn: async () => {
      if (!candidato) return null;
      const partido = candidato.sigla_partido?.replace(/'/g, "''") || '';
      const cargo = candidato.cargo?.replace(/'/g, "''") || '';
      const mun = candidato.municipio?.replace(/'/g, "''") || '';
      const ano = Number(candidato.ano);
      const colegas = await mdQuery(
        `SELECT ${COL.sequencial} as id, ${COL.nomeUrna} as nome_urna, ${COL.situacaoFinal} as situacao_final
        FROM ${MD.candidatos(ano)}
        WHERE ${COL.partido} = '${partido}' AND ${COL.cargo} = '${cargo}' AND ${COL.municipio} = '${mun}'`
      );
      return { total: colegas.length, colegas };
    },
    enabled: !!candidato,
  });

  // Comparecimento na zona do candidato via MotherDuck
  const { data: comparecimentoZona } = useQuery({
    queryKey: ['comparecimentoZona', candidato?.zona, candidato?.municipio, candidato?.ano],
    queryFn: async () => {
      if (!candidato?.zona) return null;
      const ano = Number(candidato.ano);
      const mun = candidato.municipio?.replace(/'/g, "''") || '';
      try {
        const [r] = await mdQuery<any>(
          `SELECT sum(qt_aptos) as eleitorado, sum(qt_comparecimento) as comparecimento,
            sum(qt_abstencoes) as abstencoes, sum(qt_votos_brancos) as brancos, sum(qt_votos_nulos) as nulos
          FROM ${MD.comparecimento(ano)} WHERE nm_municipio = '${mun}' AND nr_zona = ${candidato.zona}`
        );
        if (!r || Number(r.eleitorado) === 0) return null;
        return { eleitorado: Number(r.eleitorado), comparecimento: Number(r.comparecimento), abstencoes: Number(r.abstencoes), brancos: Number(r.brancos), nulos: Number(r.nulos) };
      } catch { return null; }
    },
    enabled: !!candidato?.zona && !!availability?.comparecimento,
  });

  // Concorrentes via MotherDuck
  const { data: totalMesmoCargo } = useQuery({
    queryKey: ['totalMesmoCargo', candidato?.cargo, candidato?.municipio, candidato?.ano],
    queryFn: async () => {
      if (!candidato) return 0;
      const cargo = candidato.cargo?.replace(/'/g, "''") || '';
      const mun = candidato.municipio?.replace(/'/g, "''") || '';
      const ano = Number(candidato.ano);
      const [r] = await mdQuery<{total: string}>(
        `SELECT count(*) as total FROM ${MD.candidatos(ano)}
        WHERE ${COL.cargo} = '${cargo}' AND ${COL.municipio} = '${mun}'`
      );
      return Number(r?.total || 0);
    },
    enabled: !!candidato,
  });

  if (isLoading) return <KPISkeleton />;
  if (!candidato) return <div className="text-center py-10 text-muted-foreground">Candidato não encontrado</div>;

  const hasVotacao = availability?.votacao;
  const totalVotos = (votos || []).reduce((s: number, v: any) => s + (v.total_votos || 0), 0);
  const totalPatrimonio = (bens || []).reduce((s: number, b: any) => s + (b.valor_bem || 0), 0);
  const formatBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // Votos por município
  const votosMun = new Map<string, number>();
  (votos || []).forEach((v: any) => votosMun.set(v.municipio, (votosMun.get(v.municipio) || 0) + (v.total_votos || 0)));
  const votosMunArr = Array.from(votosMun.entries()).map(([municipio, total]) => ({ municipio, votos: total })).sort((a, b) => b.votos - a.votos);
  const votosMunPageSize = 10;
  const votosMunPaged = votosMunArr.slice(votosPage * votosMunPageSize, (votosPage + 1) * votosMunPageSize);
  const totalVotosMunPages = Math.ceil(votosMunArr.length / votosMunPageSize);

  // Zona chart data
  const zonaChartData = (votosPorZona || []).map((z: any) => ({ zona: `Z${z.zona}`, votos: z.total_votos || 0 }));

  const tabs = [
    { id: 'info' as const, label: 'Informações', icon: Users },
    { id: 'votos' as const, label: 'Votação', icon: Vote },
    { id: 'patrimonio' as const, label: 'Patrimônio', icon: DollarSign },
    { id: 'historico' as const, label: 'Histórico', icon: TrendingUp },
  ];

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <Link to="/diretorio" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="w-3 h-3" /> Voltar ao diretório
      </Link>

      {/* Hero Card */}
      <div className="bg-card rounded-xl border p-5">
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          <CandidatoAvatar nome={candidato.nome_urna || candidato.nome_completo} fotoUrl={candidato.foto_url} size={100} />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{candidato.nome_completo || candidato.nome_urna}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-muted-foreground text-sm">{candidato.nome_urna}</span>
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-sm font-bold">{candidato.numero_urna}</span>
              <Badge variant="outline" style={{ borderColor: getPartidoCor(candidato.sigla_partido), color: getPartidoCor(candidato.sigla_partido) }}>
                {candidato.sigla_partido}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{candidato.cargo} · {candidato.municipio} · {candidato.ano}</p>
            <div className="mt-2"><SituacaoBadge situacao={candidato.situacao_final} /></div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {hasVotacao && (
          <div className="bg-card rounded-lg border p-3">
            <p className="text-[10px] text-muted-foreground uppercase">Total de Votos</p>
            <p className="text-xl font-bold text-primary metric-value">{formatNumber(totalVotos)}</p>
          </div>
        )}
        <div className="bg-card rounded-lg border p-3">
          <p className="text-[10px] text-muted-foreground uppercase flex items-center gap-1"><DollarSign className="w-3 h-3" /> Patrimônio</p>
          <p className="text-xl font-bold metric-value">{formatBRL(totalPatrimonio)}</p>
          <p className="text-[9px] text-muted-foreground">{(bens || []).length} bens declarados</p>
        </div>
        <div className="bg-card rounded-lg border p-3">
          <p className="text-[10px] text-muted-foreground uppercase">Concorrentes</p>
          <p className="text-xl font-bold metric-value">{formatNumber(totalMesmoCargo || 0)}</p>
          <p className="text-[9px] text-muted-foreground">mesmo cargo/cidade</p>
        </div>
        <div className="bg-card rounded-lg border p-3">
          <p className="text-[10px] text-muted-foreground uppercase flex items-center gap-1"><Award className="w-3 h-3" /> No Partido</p>
          <p className="text-xl font-bold metric-value">{rankingPartido?.total || 0} colegas</p>
          <p className="text-[9px] text-muted-foreground">{candidato.sigla_partido} · {candidato.cargo}</p>
        </div>
        {comparecimentoZona && (
          <div className="bg-card rounded-lg border p-3">
            <p className="text-[10px] text-muted-foreground uppercase flex items-center gap-1"><MapPin className="w-3 h-3" /> Zona {candidato.zona}</p>
            <p className="text-xl font-bold metric-value">{formatNumber(comparecimentoZona.eleitorado)}</p>
            <p className="text-[9px] text-muted-foreground">
              {comparecimentoZona.eleitorado > 0 ? formatPercent((comparecimentoZona.comparecimento / comparecimentoZona.eleitorado) * 100) : '—'} comparecimento
            </p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/50 pb-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Info */}
      {activeTab === 'info' && (
        <div className="space-y-4">
          <div className="bg-card rounded-xl border p-5">
            <h3 className="text-sm font-semibold mb-4">Informações Pessoais</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              {[
                ['Gênero', candidato.genero],
                ['Nascimento', candidato.data_nascimento],
                ['Escolaridade', candidato.grau_instrucao],
                ['Ocupação', candidato.ocupacao],
                ['UF Nascimento', candidato.uf_nascimento],
                ['Sit. Final', candidato.situacao_final],
                ['Turno', candidato.turno ? `${candidato.turno}º Turno` : null],
                ['Sequencial', candidato.sequencial_candidato],
                ['Nome Partido', candidato.nome_partido],
              ].map(([label, value], i) => (
                <div key={i}>
                  <span className="text-muted-foreground text-xs">{label}:</span>
                  <p className="font-medium text-sm">{value || '—'}</p>
                </div>
              ))}
            </div>
          </div>

          {comparecimentoZona && (
            <div className="bg-card rounded-xl border p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Zona Eleitoral {candidato.zona} — {candidato.municipio}</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <div><span className="text-muted-foreground text-xs">Eleitorado</span><p className="font-bold">{formatNumber(comparecimentoZona.eleitorado)}</p></div>
                <div><span className="text-muted-foreground text-xs">Comparecimento</span><p className="font-bold">{formatNumber(comparecimentoZona.comparecimento)}</p></div>
                <div><span className="text-muted-foreground text-xs">% Comp.</span><p className="font-bold">{comparecimentoZona.eleitorado > 0 ? formatPercent((comparecimentoZona.comparecimento / comparecimentoZona.eleitorado) * 100) : '—'}</p></div>
                <div><span className="text-muted-foreground text-xs">Abstenções</span><p className="font-bold">{formatNumber(comparecimentoZona.abstencoes)}</p></div>
                <div><span className="text-muted-foreground text-xs">Brancos + Nulos</span><p className="font-bold">{formatNumber(comparecimentoZona.brancos + comparecimentoZona.nulos)}</p></div>
              </div>
            </div>
          )}

          {rankingPartido && rankingPartido.colegas.length > 1 && (
            <div className="bg-card rounded-xl border p-5">
              <h3 className="text-sm font-semibold mb-3">Candidatos do {candidato.sigla_partido} — {candidato.cargo} — {candidato.municipio} ({candidato.ano})</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {rankingPartido.colegas.map((c: any) => (
                  <Link key={c.id} to={`/candidato/${c.id}`}
                    className={`text-xs p-2 rounded border transition-colors ${String(c.id) === id ? 'bg-primary/10 border-primary/30 font-bold' : 'hover:bg-muted'}`}>
                    {c.nome_urna} <SituacaoBadge situacao={c.situacao_final} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Votos */}
      {activeTab === 'votos' && (
        <div className="space-y-4">
          {!hasVotacao ? (
            <DataPendingCard titulo="Votação não disponível" tabela="bd_eleicoes_votacao" descricao="Dados de votos serão exibidos após importação." />
          ) : (
            <>
              {zonaChartData.length > 0 && (
                <div className="bg-card rounded-xl border p-5">
                  <h3 className="text-sm font-semibold mb-3">Votos por Zona — {candidato.municipio}</h3>
                  <ResponsiveContainer width="100%" height={Math.max(200, zonaChartData.length * 28)}>
                    <BarChart data={zonaChartData} layout="vertical" margin={{ left: 40 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="zona" tick={{ fontSize: 10 }} width={35} />
                      <Tooltip formatter={(v: number) => formatNumber(v)} />
                      <Bar dataKey="votos" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                        {zonaChartData.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {votosMunArr.length > 0 && (
                <div className="bg-card rounded-xl border p-5">
                  <h3 className="text-sm font-semibold mb-3">Votação por Município</h3>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left">
                      <th className="pb-2 font-medium">Município</th>
                      <th className="pb-2 font-medium text-right">Votos</th>
                      <th className="pb-2 font-medium text-right">% do Total</th>
                    </tr></thead>
                    <tbody>
                      {votosMunPaged.map((r, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 font-medium">{r.municipio}</td>
                          <td className="py-2 text-right metric-value">{formatNumber(r.votos)}</td>
                          <td className="py-2 text-right text-muted-foreground">{totalVotos > 0 ? formatPercent((r.votos / totalVotos) * 100) : '0%'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {totalVotosMunPages > 1 && (
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-muted-foreground">Pág. {votosPage + 1}/{totalVotosMunPages}</span>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" disabled={votosPage === 0} onClick={() => setVotosPage(votosPage - 1)}><ChevronLeft className="w-3 h-3" /></Button>
                        <Button variant="outline" size="sm" disabled={votosPage >= totalVotosMunPages - 1} onClick={() => setVotosPage(votosPage + 1)}><ChevronRight className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {votosMunArr.length === 0 && zonaChartData.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">Sem dados de votação para este candidato.</div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab: Patrimônio */}
      {activeTab === 'patrimonio' && (
        <div className="space-y-4">
          {(bens || []).length > 0 ? (
            <>
              <div className="bg-card rounded-xl border p-5">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> {bens?.length} Bens Declarados — {formatBRL(totalPatrimonio)}
                </h3>
                {(() => {
                  const tipoMap = new Map<string, number>();
                  (bens || []).forEach((b: any) => tipoMap.set(b.tipo_bem || 'Outros', (tipoMap.get(b.tipo_bem || 'Outros') || 0) + (b.valor_bem || 0)));
                  const tipoArr = Array.from(tipoMap.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
                  return tipoArr.length > 1 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={tipoArr.slice(0, 8)} dataKey="valor" nameKey="nome" cx="50%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={2} strokeWidth={0}>
                            {tipoArr.slice(0, 8).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => formatBRL(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1.5 flex flex-col justify-center">
                        {tipoArr.map((t, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 truncate flex-1">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                              {t.nome}
                            </span>
                            <span className="font-semibold ml-2">{formatBRL(t.valor)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                <div className="overflow-x-auto max-h-[350px]">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b text-left">
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">Tipo</th>
                      <th className="pb-2 font-medium">Descrição</th>
                      <th className="pb-2 font-medium text-right">Valor</th>
                    </tr></thead>
                    <tbody>
                      {(bens || []).map((b: any, i: number) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1.5 text-muted-foreground">{b.ordem_bem || i + 1}</td>
                          <td className="py-1.5">{b.tipo_bem || '-'}</td>
                          <td className="py-1.5 max-w-[300px] truncate">{b.descricao_bem || '-'}</td>
                          <td className="py-1.5 text-right font-medium">{formatBRL(b.valor_bem || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {(evolucaoPatrimonio || []).length > 1 && (
                <div className="bg-card rounded-xl border p-5">
                  <h3 className="text-sm font-semibold mb-3">Evolução Patrimonial</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={evolucaoPatrimonio || []}>
                      <XAxis dataKey="ano" />
                      <YAxis tickFormatter={(v: number) => formatBRL(v)} />
                      <Tooltip formatter={(v: number) => formatBRL(v)} />
                      <Line type="monotone" dataKey="patrimonio" name="Patrimônio" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">Sem bens declarados para este candidato.</div>
          )}
        </div>
      )}

      {/* Tab: Histórico */}
      {activeTab === 'historico' && (
        <div className="space-y-4">
          {(historico || []).length > 0 ? (
            <div className="bg-card rounded-xl border p-5">
              <h3 className="text-sm font-semibold mb-4">Histórico Eleitoral</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left">
                    <th className="pb-2 font-medium">Ano</th>
                    <th className="pb-2 font-medium">Cargo</th>
                    <th className="pb-2 font-medium">Partido</th>
                    <th className="pb-2 font-medium">Município</th>
                    <th className="pb-2 font-medium">Nº Urna</th>
                    <th className="pb-2 font-medium">Situação</th>
                    <th className="pb-2 font-medium"></th>
                  </tr></thead>
                  <tbody>
                    {(historico || []).map((h: any, i: number) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 font-medium">{h.ano}</td>
                        <td className="py-2">{h.cargo}</td>
                        <td className="py-2 font-semibold" style={{ color: getPartidoCor(h.sigla_partido) }}>{h.sigla_partido}</td>
                        <td className="py-2">{h.municipio}</td>
                        <td className="py-2 text-muted-foreground">{h.numero_urna}</td>
                        <td className="py-2"><SituacaoBadge situacao={h.situacao_final} /></td>
                        <td className="py-2">
                          {String(h.id) !== id && (
                            <Link to={`/candidato/${h.id}`} className="text-primary text-xs hover:underline">Ver →</Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">Sem histórico eleitoral adicional.</div>
          )}
        </div>
      )}
    </div>
  );
}
