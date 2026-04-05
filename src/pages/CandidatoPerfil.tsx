import { useParams } from 'react-router-dom';
import { useCandidato, useCandidatoVotos, usePatrimonioCandidato, useEvolucaoPatrimonio, useDataAvailability } from '@/hooks/useEleicoes';
import { formatNumber, formatPercent } from '@/lib/eleicoes';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { KPISkeleton } from '@/components/eleicoes/Skeletons';
import { DataPendingCard } from '@/components/eleicoes/DataPendingCard';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, DollarSign } from 'lucide-react';

export default function CandidatoPerfil() {
  const { id } = useParams<{ id: string }>();
  const { data: candidato, isLoading } = useCandidato(id || '');
  const { data: availability } = useDataAvailability();
  const { data: votos } = useCandidatoVotos(candidato?.nome_urna || '', candidato?.ano || 0);
  const { data: bens } = usePatrimonioCandidato(candidato?.sequencial_candidato || '');
  const { data: evolucaoPatrimonio } = useEvolucaoPatrimonio(candidato?.nome_urna || '');
  const [votosPage, setVotosPage] = useState(0);

  const { data: historico } = useQuery({
    queryKey: ['historicoCandidato', candidato?.nome_urna],
    queryFn: async () => {
      if (!candidato) return [];
      const { data } = await (supabase.from('bd_eleicoes_candidatos' as any) as any)
        .select('*')
        .or(`nome_urna.eq.${candidato.nome_urna},nome_completo.eq.${candidato.nome_completo}`)
        .order('ano');
      return data || [];
    },
    enabled: !!candidato,
  });

  if (isLoading) return <KPISkeleton />;
  if (!candidato) return <div className="text-center py-10 text-muted-foreground">Candidato não encontrado</div>;

  const hasVotacao = availability?.votacao;
  const totalVotos = (votos || []).reduce((s: number, v: any) => s + (v.total_votos || 0), 0);
  const totalPatrimonio = (bens || []).reduce((s: number, b: any) => s + (b.valor_bem || 0), 0);
  const formatBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // Group votos by municipio
  const votosMun = new Map<string, number>();
  (votos || []).forEach((v: any) => {
    votosMun.set(v.municipio, (votosMun.get(v.municipio) || 0) + (v.total_votos || 0));
  });
  const votosMunArr = Array.from(votosMun.entries())
    .map(([municipio, total]) => ({ municipio, votos: total }))
    .sort((a, b) => b.votos - a.votos);

  const votosMunPageSize = 10;
  const votosMunPaged = votosMunArr.slice(votosPage * votosMunPageSize, (votosPage + 1) * votosMunPageSize);
  const totalVotosMunPages = Math.ceil(votosMunArr.length / votosMunPageSize);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-card rounded-xl border p-6">
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <CandidatoAvatar nome={candidato.nome_urna || candidato.nome_completo} fotoUrl={candidato.foto_url} size={120} />
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{candidato.nome_completo || candidato.nome_urna}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-muted-foreground">{candidato.nome_urna}</span>
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-sm font-bold">{candidato.numero_urna}</span>
            </div>
            <p className="text-muted-foreground mt-2">{candidato.sigla_partido || candidato.partido} • {candidato.cargo} • {candidato.municipio}</p>
            <div className="mt-3"><SituacaoBadge situacao={candidato.situacao_final} /></div>
          </div>
        </div>
      </div>

      {/* Mini KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Ano</p>
          <p className="text-2xl font-bold">{candidato.ano}</p>
        </div>
        <div className="bg-card rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Turno</p>
          <p className="text-2xl font-bold">{candidato.turno}º</p>
        </div>
        {hasVotacao && (
          <div className="bg-card rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">Total de Votos</p>
            <p className="text-2xl font-bold">{formatNumber(totalVotos)}</p>
          </div>
        )}
        <div className="bg-card rounded-xl border p-4">
          <p className="text-sm text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Patrimônio</p>
          <p className="text-2xl font-bold">{formatBRL(totalPatrimonio)}</p>
        </div>
      </div>

      {/* Info pessoal */}
      <div className="bg-card rounded-xl border p-5">
        <h3 className="text-base font-semibold mb-4">Informações Pessoais</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-muted-foreground">Gênero:</span> <span className="font-medium ml-1">{candidato.genero || '—'}</span></div>
          <div><span className="text-muted-foreground">Nascimento:</span> <span className="font-medium ml-1">{candidato.data_nascimento || '—'}</span></div>
          <div><span className="text-muted-foreground">Escolaridade:</span> <span className="font-medium ml-1">{candidato.grau_instrucao || '—'}</span></div>
          <div><span className="text-muted-foreground">Ocupação:</span> <span className="font-medium ml-1">{candidato.ocupacao || '—'}</span></div>
          <div><span className="text-muted-foreground">Nacionalidade:</span> <span className="font-medium ml-1">{candidato.nacionalidade || '—'}</span></div>
          <div><span className="text-muted-foreground">Situação:</span> <span className="font-medium ml-1">{candidato.situacao_candidatura || '—'}</span></div>
        </div>
      </div>

      {/* Histórico */}
      {(historico || []).length > 0 && (
        <div className="bg-card rounded-xl border p-5">
          <h3 className="text-base font-semibold mb-4">Histórico Eleitoral</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-striped">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Ano</th>
                  <th className="pb-2 font-medium">Cargo</th>
                  <th className="pb-2 font-medium">Partido</th>
                  <th className="pb-2 font-medium">Município</th>
                  <th className="pb-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {(historico || []).map((h: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2">{h.ano}</td>
                    <td className="py-2">{h.cargo}</td>
                    <td className="py-2">{h.sigla_partido || h.partido}</td>
                    <td className="py-2">{h.municipio}</td>
                    <td className="py-2"><SituacaoBadge situacao={h.situacao_final} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Votação por Município */}
      {hasVotacao && votosMunArr.length > 0 ? (
        <div className="bg-card rounded-xl border p-5">
          <h3 className="text-base font-semibold mb-4">Votação por Município</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-striped">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Município</th>
                  <th className="pb-2 font-medium text-right">Votos</th>
                  <th className="pb-2 font-medium text-right">% do Total</th>
                </tr>
              </thead>
              <tbody>
                {votosMunPaged.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium">{r.municipio}</td>
                    <td className="py-2 text-right">{formatNumber(r.votos)}</td>
                    <td className="py-2 text-right">{totalVotos > 0 ? formatPercent((r.votos / totalVotos) * 100) : '0%'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalVotosMunPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <span className="text-sm text-muted-foreground">Página {votosPage + 1} de {totalVotosMunPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={votosPage === 0} onClick={() => setVotosPage(votosPage - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={votosPage >= totalVotosMunPages - 1} onClick={() => setVotosPage(votosPage + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : !hasVotacao ? (
        <DataPendingCard titulo="Votação não disponível" tabela="bd_eleicoes_votacao" descricao="Dados de votos por município serão exibidos após importação." />
      ) : null}

      {/* Patrimônio */}
      {(bens || []).length > 0 && (
        <div className="bg-card rounded-xl border p-5">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Bens Declarados ({bens?.length} itens — {formatBRL(totalPatrimonio)})
          </h3>
          <div className="overflow-x-auto max-h-[300px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Tipo</th>
                  <th className="pb-2 font-medium">Descrição</th>
                  <th className="pb-2 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {(bens || []).map((b: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 text-muted-foreground">{b.ordem_bem || i + 1}</td>
                    <td className="py-2">{b.tipo_bem || '-'}</td>
                    <td className="py-2 max-w-[300px] truncate">{b.descricao_bem || '-'}</td>
                    <td className="py-2 text-right font-medium">{formatBRL(b.valor_bem || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Evolução patrimonial */}
      {(evolucaoPatrimonio || []).length > 1 && (
        <div className="bg-card rounded-xl border p-5">
          <h3 className="text-base font-semibold mb-4">Evolução Patrimonial</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={evolucaoPatrimonio || []}>
              <XAxis dataKey="ano" />
              <YAxis tickFormatter={(v: number) => formatBRL(v)} />
              <Tooltip formatter={(v: number) => formatBRL(v)} />
              <Line type="monotone" dataKey="patrimonio" name="Patrimônio" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
