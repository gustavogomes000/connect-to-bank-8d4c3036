import { useParams } from 'react-router-dom';
import { useCandidato, useCandidatoVotos } from '@/hooks/useEleicoes';
import { formatNumber, formatPercent } from '@/lib/eleicoes';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { KPISkeleton, TableSkeleton } from '@/components/eleicoes/Skeletons';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function CandidatoPerfil() {
  const { id } = useParams<{ id: string }>();
  const { data: candidato, isLoading } = useCandidato(id || '');
  const { data: votos, isLoading: loadingVotos } = useCandidatoVotos(candidato?.nome_urna || '', candidato?.ano || 0);
  const [votosPage, setVotosPage] = useState(0);

  // Historical
  const { data: historico } = useQuery({
    queryKey: ['historicoCandidato', candidato?.nome_urna, candidato?.numero_urna],
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

  // Votos by municipality aggregated - using munzona table
  const { data: votosMun } = useQuery({
    queryKey: ['votosMunicipio', candidato?.nome_urna, candidato?.ano],
    queryFn: async () => {
      if (!candidato) return [];
      const { data } = await (supabase.from('bd_eleicoes_votacao_munzona' as any) as any)
        .select('municipio, zona, total_votos')
        .eq('nome_candidato', candidato.nome_urna)
        .eq('ano', candidato.ano)
        .order('total_votos', { ascending: false });
      
      const map = new Map<string, { municipio: string; votos: number; zonas: Set<number> }>();
      (data || []).forEach((r: any) => {
        const cur = map.get(r.municipio) || { municipio: r.municipio, votos: 0, zonas: new Set() };
        cur.votos += r.total_votos || 0;
        if (r.zona) cur.zonas.add(r.zona);
        map.set(r.municipio, cur);
      });
      return Array.from(map.values()).sort((a, b) => b.votos - a.votos);
    },
    enabled: !!candidato,
  });

  if (isLoading) return <KPISkeleton />;
  if (!candidato) return <div className="text-center py-10 text-muted-foreground">Candidato não encontrado</div>;

  const totalVotos = (votos || []).reduce((s: number, v: any) => s + (v.total_votos || 0), 0);
  const totalMunicipios = votosMun?.length || 0;
  const votosMunPageSize = 10;
  const votosMunPaged = (votosMun || []).slice(votosPage * votosMunPageSize, (votosPage + 1) * votosMunPageSize);
  const totalVotosMunPages = Math.ceil((votosMun || []).length / votosMunPageSize);

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
          <p className="text-sm text-muted-foreground">Total de Votos</p>
          <p className="text-2xl font-bold">{formatNumber(totalVotos)}</p>
        </div>
        <div className="bg-card rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Ano</p>
          <p className="text-2xl font-bold">{candidato.ano}</p>
        </div>
        <div className="bg-card rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Turno</p>
          <p className="text-2xl font-bold">{candidato.turno}º</p>
        </div>
        <div className="bg-card rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Municípios c/ Votos</p>
          <p className="text-2xl font-bold">{totalMunicipios}</p>
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
      <div className="bg-card rounded-xl border p-5">
        <h3 className="text-base font-semibold mb-4">Votação por Município</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-striped">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium">Município</th>
                <th className="pb-2 font-medium">Votos</th>
                <th className="pb-2 font-medium">% do Total</th>
              </tr>
            </thead>
            <tbody>
              {votosMunPaged.map((r: any, i: number) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 font-medium">{r.municipio}</td>
                  <td className="py-2">{formatNumber(r.votos)}</td>
                  <td className="py-2">{totalVotos > 0 ? formatPercent((r.votos / totalVotos) * 100) : '0%'}</td>
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
    </div>
  );
}
