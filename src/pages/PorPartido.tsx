import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFilterStore } from '@/stores/filterStore';
import { formatNumber, formatPercent, getPartidoCor } from '@/lib/eleicoes';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { KPISkeleton } from '@/components/eleicoes/Skeletons';
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function PorPartido() {
  const { ano, turno, cargo, municipio } = useFilterStore();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: partidos, isLoading } = useQuery({
    queryKey: ['partidosResumo', ano, turno, cargo, municipio],
    queryFn: async () => {
      // Get candidatos
      let cq = (supabase.from('bd_eleicoes_candidatos' as any) as any).select('sigla_partido, situacao_final');
      if (ano) cq = cq.eq('ano', ano);
      if (turno) cq = cq.eq('turno', turno);
      if (cargo) cq = cq.ilike('cargo', cargo);
      if (municipio) cq = cq.eq('municipio', municipio);
      const { data: candidatos } = await cq.limit(1000);

      // Get votos from partido table
      let vq = (supabase.from('bd_eleicoes_votacao_partido' as any) as any).select('sigla_partido, total_votos');
      if (ano) vq = vq.eq('ano', ano);
      if (turno) vq = vq.eq('turno', turno);
      if (cargo) vq = vq.ilike('cargo', cargo);
      if (municipio) vq = vq.eq('municipio', municipio);
      const { data: votos } = await vq.limit(1000);

      const map = new Map<string, { candidatos: number; votos: number; eleitos: number }>();
      
      (candidatos || []).forEach((c: any) => {
        const p = c.sigla_partido || 'OUTROS';
        const cur = map.get(p) || { candidatos: 0, votos: 0, eleitos: 0 };
        cur.candidatos++;
        const sit = (c.situacao_final || '').toUpperCase();
        if (sit.includes('ELEITO') && !sit.includes('NÃO')) cur.eleitos++;
        map.set(p, cur);
      });

      (votos || []).forEach((v: any) => {
        const p = v.sigla_partido || 'OUTROS';
        const cur = map.get(p) || { candidatos: 0, votos: 0, eleitos: 0 };
        cur.votos += v.total_votos || 0;
        map.set(p, cur);
      });

      return Array.from(map.entries())
        .map(([partido, stats]) => ({ partido, ...stats }))
        .sort((a, b) => b.votos - a.votos);
    },
  });

  const { data: detalhe } = useQuery({
    queryKey: ['partidoDetalhe', expanded, ano, turno, cargo, municipio],
    queryFn: async () => {
      if (!expanded) return [];
      let q = (supabase.from('bd_eleicoes_votacao_munzona' as any) as any)
        .select('nome_candidato, cargo, municipio, total_votos, sigla_partido')
        .eq('sigla_partido', expanded)
        .order('total_votos', { ascending: false })
        .limit(50);
      if (ano) q = q.eq('ano', ano);
      if (turno) q = q.eq('turno', turno);
      if (cargo) q = q.ilike('cargo', cargo);
      if (municipio) q = q.eq('municipio', municipio);
      const { data } = await q;
      return data || [];
    },
    enabled: !!expanded,
  });

  if (isLoading) return <KPISkeleton />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Por Partido</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(partidos || []).map((p) => {
          const isExpanded = expanded === p.partido;
          const aproveitamento = p.candidatos > 0 ? (p.eleitos / p.candidatos) * 100 : 0;
          return (
            <div key={p.partido} className="bg-card rounded-xl border overflow-hidden">
              <button
                className="w-full p-5 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : p.partido)}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="text-2xl font-bold"
                    style={{ color: getPartidoCor(p.partido) }}
                  >
                    {p.partido}
                  </span>
                  {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Candidatos</p>
                    <p className="font-semibold">{formatNumber(p.candidatos)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Votos</p>
                    <p className="font-semibold">{formatNumber(p.votos)}</p>
                  </div>
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
                        <th className="pb-2 font-medium">Votos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detalhe || []).map((d: any, i: number) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1.5 font-medium">{d.nome_candidato}</td>
                          <td className="py-1.5">{d.cargo}</td>
                          <td className="py-1.5">{d.municipio}</td>
                          <td className="py-1.5">{formatNumber(d.total_votos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
