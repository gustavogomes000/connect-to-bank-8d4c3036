import { useState } from 'react';
import { usePartidoResumo, usePartidoDetalhe, useDataAvailability } from '@/hooks/useEleicoes';
import { formatNumber, formatPercent, getPartidoCor } from '@/lib/eleicoes';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { KPISkeleton } from '@/components/eleicoes/Skeletons';
import { ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PorPartido() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const navigate = useNavigate();
  const { data: availability } = useDataAvailability();

  const { data: resumoData, isLoading } = usePartidoResumo();
  const { data: detalhe } = usePartidoDetalhe(expanded);

  const partidos = resumoData?.partidos || [];
  const hasVotos = resumoData?.hasVotos || false;

  if (isLoading) return <KPISkeleton />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Por Partido</h1>

      {!hasVotos && (
        <div className="bg-secondary/10 border border-secondary/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-secondary shrink-0" />
          <span className="text-sm text-muted-foreground">
            Dados de votação pendentes. Ordenando por número de candidatos.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {partidos.map((p) => {
          const isExpanded = expanded === p.partido;
          const aproveitamento = p.candidatos > 0 ? (p.eleitos / p.candidatos) * 100 : 0;
          return (
            <div key={p.partido} className="bg-card rounded-xl border overflow-hidden">
              <button
                className="w-full p-5 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : p.partido)}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl font-bold" style={{ color: getPartidoCor(p.partido) }}>
                    {p.partido}
                  </span>
                  {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Candidatos</p>
                    <p className="font-semibold">{formatNumber(p.candidatos)}</p>
                  </div>
                  {hasVotos && (
                    <div>
                      <p className="text-muted-foreground">Votos</p>
                      <p className="font-semibold">{formatNumber(p.votos)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground">Eleitos</p>
                    <p className="font-semibold">{formatNumber(p.eleitos)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Aproveitamento</p>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      {formatPercent(aproveitamento)}
                    </span>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t p-4 max-h-[300px] overflow-auto">
                  <table className="w-full text-sm table-striped">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Nome</th>
                        <th className="pb-2 font-medium">Cargo</th>
                        <th className="pb-2 font-medium">Município</th>
                        <th className="pb-2 font-medium">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detalhe || []).map((d: any, i: number) => (
                        <tr
                          key={i}
                          className="border-b last:border-0 cursor-pointer hover:bg-primary/5"
                          onClick={() => {
                            // Try to find by name in candidatos
                          }}
                        >
                          <td className="py-1.5 font-medium">{d.nome_urna}</td>
                          <td className="py-1.5">{d.cargo}</td>
                          <td className="py-1.5">{d.municipio}</td>
                          <td className="py-1.5"><SituacaoBadge situacao={d.situacao_final} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(!detalhe || detalhe.length === 0) && (
                    <p className="text-center text-muted-foreground py-4 text-sm">Nenhum candidato encontrado.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {partidos.length === 0 && (
        <p className="text-center text-muted-foreground py-8">Nenhum partido encontrado no filtro atual.</p>
      )}
    </div>
  );
}
