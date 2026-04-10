import React, { useState, useMemo } from 'react';
import { useInteligenciaMapa } from '@/hooks/useInteligencia';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Search, Trophy } from 'lucide-react';
import { formatNumber, formatPercent } from '@/lib/eleicoes';

export const CentralInteligencia = ({ sqCandidato }: { sqCandidato: string }) => {
  const { data, isLoading, isError } = useInteligenciaMapa(sqCandidato);
  const [busca, setBusca] = useState('');

  const dadosFiltrados = useMemo(() => {
    if (!data?.dados) return [];
    if (!busca) return data.dados;
    const lowerBusca = busca.toLowerCase();
    return data.dados.filter(d => 
      (d.setor && d.setor.toLowerCase().includes(lowerBusca)) || 
      (d.escola && d.escola.toLowerCase().includes(lowerBusca))
    );
  }, [data?.dados, busca]);

  if (isError) {
    return (
      <div className="bg-destructive/10 text-destructive p-4 rounded-xl flex items-center gap-2 text-sm font-semibold">
        <AlertCircle className="w-5 h-5" /> Erro ao carregar a Central de Inteligência.
      </div>
    );
  }

  return (
    <div 
      className="bg-card rounded-2xl p-4 shadow-xl border border-border/40 relative overflow-hidden flex flex-col"
      style={{ animation: 'borderPulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
    >
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes borderPulse {
          0%, 100% { border-color: hsl(330 81% 60% / 0.1); box-shadow: 0 0 0 hsl(330 81% 60% / 0); }
          50% { border-color: hsl(330 81% 60% / 0.4); box-shadow: 0 0 20px hsl(330 81% 60% / 0.1); }
        }
      `}} />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/20 rounded-lg border border-primary/30">
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-lg leading-tight uppercase tracking-wide">Central de Inteligência</h3>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Capivara Geográfica Deep Drill-Down</p>
          </div>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            className="w-full bg-muted border border-border focus:border-primary/60 text-foreground text-sm rounded-xl py-2 pl-9 pr-4 outline-none transition-colors"
            placeholder="Filtrar por setor ou escola..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="flex-1 overflow-x-auto border border-border/30 rounded-xl bg-background/50 backdrop-blur-sm">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-muted/80 sticky top-0 z-10 backdrop-blur-md">
            <tr>
              <th className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider w-[20%]">Setor</th>
              <th className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider w-[40%]">Local de Votação</th>
              <th className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center w-[10%]">Zona / Seção</th>
              <th className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right w-[10%]">Votos</th>
              <th className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider w-[20%]">Dominância</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-full max-w-[120px]" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-full" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-16 mx-auto" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-8 ml-auto" /></td>
                  <td className="px-3 py-1.5"><Skeleton className="h-4 w-full" /></td>
                </tr>
              ))
            ) : dadosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  Nenhum registro de voto encontrado com os filtros atuais.
                </td>
              </tr>
            ) : (
              dadosFiltrados.map((item, idx) => (
                <tr key={`${item.zona}-${item.secao}`} className="hover:bg-primary/5 transition-colors cursor-default">
                  <td className="px-3 py-1.5 text-xs font-bold uppercase text-accent truncate max-w-[150px]" title={item.setor || item.escola}>
                    {item.setor || item.escola}
                  </td>
                  <td className="px-3 py-1.5 text-xs font-bold uppercase text-foreground truncate max-w-[300px]" title={item.escola}>
                    {item.escola}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-center font-mono text-muted-foreground tabular-nums">
                    {item.zona} / {item.secao}
                  </td>
                  <td className="px-3 py-1.5 text-sm font-bold text-right tabular-nums text-foreground">
                    {formatNumber(item.votos)}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                       <div className="w-full bg-muted rounded-full h-2 overflow-hidden border border-border/5">
                         <div 
                           className="bg-primary h-full rounded-full" 
                           style={{ width: `${Math.min(item.dominancia, 100)}%` }} 
                         />
                       </div>
                       <span className="text-[10px] font-bold font-mono w-9 text-right text-muted-foreground">
                         {formatPercent(item.dominancia, 1)}
                       </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
