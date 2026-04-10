import { useState, useMemo } from 'react';
import { useEscolas, EscolaItem } from '@/hooks/useEscolas';
import { useFilterStore } from '@/stores/filterStore';
import { useComparecimento } from '@/hooks/useEleicoes';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import {
  Building2, MapPin, Search, Users, School, Hash, Vote,
} from 'lucide-react';
import { formatNumber, formatPercent } from '@/lib/eleicoes';
import { cn } from '@/lib/utils';

const fmt = (n: number | string) => Number(n || 0).toLocaleString('pt-BR');

function KPI({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <Card className="bg-card border-border/50">
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-foreground">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/** Hook: locais de votação do Supabase para complementar dados */
function useLocaisVotacaoSupa(ano: number, municipio: string) {
  return useQuery({
    queryKey: ['locais-votacao-supa', ano, municipio],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bd_eleicoes_locais_votacao')
        .select('zona, secao, local_votacao, bairro, endereco_local, eleitorado_apto')
        .eq('ano', ano)
        .eq('municipio', municipio)
        .limit(5000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!municipio,
    staleTime: 5 * 60 * 1000,
  });
}

export default function EscolasEleitorais() {
  const { data, isLoading, isError, error } = useEscolas();
  const { data: comparecimento } = useComparecimento();
  const { municipio, ano } = useFilterStore();
  const [busca, setBusca] = useState('');

  const { data: locaisSupa } = useLocaisVotacaoSupa(ano, municipio);

  const escolas = data?.dados || [];

  // Enrich escolas with endereco from Supabase locais
  const escolasEnriquecidas = useMemo(() => {
    if (!locaisSupa || locaisSupa.length === 0) return escolas;
    const enderecoMap = new Map<string, string>();
    locaisSupa.forEach((l: any) => {
      if (l.local_votacao && l.endereco_local) {
        enderecoMap.set(l.local_votacao.toUpperCase(), l.endereco_local);
      }
    });
    return escolas.map(e => ({
      ...e,
      endereco: enderecoMap.get(e.escola.toUpperCase()) || '',
    }));
  }, [escolas, locaisSupa]);

  const filtered = useMemo(() => {
    if (!busca) return escolasEnriquecidas;
    const q = busca.toLowerCase();
    return escolasEnriquecidas.filter(e =>
      e.escola.toLowerCase().includes(q) ||
      e.setor?.toLowerCase().includes(q) ||
      e.zona.toString().includes(q) ||
      (e as any).endereco?.toLowerCase().includes(q)
    );
  }, [escolasEnriquecidas, busca]);

  const totalEscolas = escolas.length;
  const totalSecoes = escolas.reduce((s, e) => s + e.qtd_secoes, 0);
  const totalEleitores = escolas.reduce((s, e) => s + (e.eleitores || 0), 0);
  const totalZonas = new Set(escolas.map(e => e.zona)).size;
  const comp = comparecimento?.[0] as any;

  if (!municipio) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
        <School className="w-10 h-10 opacity-30" />
        <p className="text-sm">Selecione um município nos filtros.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[1800px] mx-auto">
      <div>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <School className="w-5 h-5 text-primary" />
          Escolas Eleitorais
        </h1>
        <p className="text-xs text-muted-foreground">{municipio} · {ano} — Locais de votação, seções e eleitores</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KPI icon={School} label="Escolas" value={isLoading ? '...' : fmt(totalEscolas)} />
        <KPI icon={Hash} label="Zonas" value={isLoading ? '...' : fmt(totalZonas)} />
        <KPI icon={Building2} label="Seções" value={isLoading ? '...' : fmt(totalSecoes)} />
        <KPI icon={Users} label="Eleitores" value={isLoading ? '...' : fmt(totalEleitores)} />
        <KPI icon={Vote} label="Comparecimento" value={comp ? formatPercent(Number(comp.taxa_comparecimento)) : '—'}
          sub={comp ? `${fmt(Number(comp.comparecimento))} presentes` : undefined} />
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar escola, bairro, zona ou endereço..."
          className="pl-9 h-8 text-xs bg-card border-border/50"
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar escolas</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border/50 p-4 h-32 flex flex-col justify-between">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground bg-card rounded-xl border border-border/50">
          Nenhuma escola encontrada.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((escola, idx) => {
            const pct = totalEleitores > 0 ? (escola.eleitores / totalEleitores) * 100 : 0;
            return (
              <div key={idx} className="bg-card rounded-xl border border-border/50 shadow-sm p-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold leading-tight uppercase text-foreground">{escola.escola}</h3>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>{escola.setor || 'Bairro não informado'}</span>
                    <span className="mx-1">•</span>
                    <span>Zona {escola.zona}</span>
                  </div>
                  {(escola as any).endereco && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      📍 {(escola as any).endereco}
                    </p>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2 flex-wrap border-t border-border/20 pt-2">
                  <Badge variant="outline" className="text-[9px] h-5">{escola.qtd_secoes} seções</Badge>
                  {escola.eleitores > 0 && (
                    <Badge variant="secondary" className="text-[9px] h-5">{fmt(escola.eleitores)} eleitores</Badge>
                  )}
                  <Badge variant="outline" className="text-[9px] h-5 text-muted-foreground">
                    {formatPercent(pct, 1)} do total
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && escolas.length > 0 && (
        <p className="text-[10px] text-muted-foreground text-right">
          {totalEscolas} escolas · {totalSecoes} seções · {fmt(totalEleitores)} eleitores · Fonte: TSE/MotherDuck + Supabase
        </p>
      )}
    </div>
  );
}
