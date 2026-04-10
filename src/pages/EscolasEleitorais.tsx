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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Building2, MapPin, Search, Users, School, Hash, Vote, ChevronDown, ChevronRight,
  UserCheck, Shield, Phone, Mail, Eye, EyeOff,
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

/** Hook: comparecimento por seção de uma escola (Supabase) */
function useComparecimentoSecao(escola: string | null, ano: number, municipio: string) {
  return useQuery({
    queryKey: ['comparecimento-secao-escola', escola, ano, municipio],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bd_eleicoes_comparecimento_secao')
        .select('zona, secao, eleitorado_apto, comparecimento, abstencoes, votos_brancos, votos_nulos, local_votacao, bairro, turno')
        .eq('ano', ano)
        .eq('municipio', municipio)
        .ilike('local_votacao', `%${escola}%`)
        .order('zona', { ascending: true })
        .order('secao', { ascending: true })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!escola && !!municipio,
    staleTime: 5 * 60 * 1000,
  });
}

/** Hook: fiscais vinculados a uma zona (Supabase) */
function useFiscaisEscola(zona: number | null) {
  return useQuery({
    queryKey: ['fiscais-escola', zona],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fiscais')
        .select(`
          id, zona_fiscal, secao_fiscal, colegio_eleitoral, status, observacoes,
          pessoa_id, pessoas!fiscais_pessoa_id_fkey(nome, telefone, whatsapp, email, zona_eleitoral, secao_eleitoral, colegio_eleitoral)
        `)
        .eq('zona_fiscal', String(zona))
        .eq('status', 'Ativo')
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!zona,
    staleTime: 5 * 60 * 1000,
  });
}

/** Hook: lideranças que atuam numa zona (Supabase) */
function useLiderancasZona(zona: number | null) {
  return useQuery({
    queryKey: ['liderancas-zona', zona],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('liderancas')
        .select(`
          id, zona_atuacao, tipo_lideranca, nivel, nivel_comprometimento, meta_votos, apoiadores_estimados,
          regiao_atuacao, bairros_influencia, status, observacoes,
          pessoa_id, pessoas!liderancas_pessoa_id_fkey(nome, telefone, whatsapp, email)
        `)
        .eq('zona_atuacao', String(zona))
        .eq('status', 'Ativa')
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!zona,
    staleTime: 5 * 60 * 1000,
  });
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

/** Escola expandida com detalhes */
function EscolaExpandida({ escola, ano, municipio }: { escola: EscolaItem; ano: number; municipio: string }) {
  const { data: secoes, isLoading: loadingSecoes } = useComparecimentoSecao(escola.escola, ano, municipio);
  const { data: fiscais, isLoading: loadingFiscais } = useFiscaisEscola(escola.zona);
  const { data: liderancas, isLoading: loadingLiderancas } = useLiderancasZona(escola.zona);

  // Filter fiscais que atuam nesta escola (por colegio_eleitoral ou seção)
  const escolaSecoes = escola.secoes?.split(',').map(s => s.trim()) || [];
  const fiscaisEscola = useMemo(() => {
    if (!fiscais) return [];
    return fiscais.filter((f: any) => {
      if (f.colegio_eleitoral && escola.escola.toUpperCase().includes(f.colegio_eleitoral.toUpperCase())) return true;
      if (f.secao_fiscal && escolaSecoes.includes(f.secao_fiscal.trim())) return true;
      return false;
    });
  }, [fiscais, escola, escolaSecoes]);

  // Turno 1 comparecimento
  const secoesTurno1 = useMemo(() => {
    if (!secoes) return [];
    return secoes.filter((s: any) => !s.turno || s.turno === 1);
  }, [secoes]);

  const totalAptos = secoesTurno1.reduce((s: number, r: any) => s + (r.eleitorado_apto || 0), 0);
  const totalComp = secoesTurno1.reduce((s: number, r: any) => s + (r.comparecimento || 0), 0);
  const totalAbst = secoesTurno1.reduce((s: number, r: any) => s + (r.abstencoes || 0), 0);
  const totalBrancos = secoesTurno1.reduce((s: number, r: any) => s + (r.votos_brancos || 0), 0);
  const totalNulos = secoesTurno1.reduce((s: number, r: any) => s + (r.votos_nulos || 0), 0);
  const taxaComp = totalAptos > 0 ? (totalComp / totalAptos) * 100 : 0;

  return (
    <div className="bg-muted/20 border-t border-border/30 p-4 space-y-4">
      {/* KPIs de comparecimento da escola */}
      {secoesTurno1.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            📊 Comparecimento — {escola.escola}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="bg-card rounded-lg border border-border/40 p-2 text-center">
              <p className="text-[9px] text-muted-foreground">Eleitores Aptos</p>
              <p className="text-sm font-bold">{fmt(totalAptos)}</p>
            </div>
            <div className="bg-card rounded-lg border border-border/40 p-2 text-center">
              <p className="text-[9px] text-muted-foreground">Comparecimento</p>
              <p className="text-sm font-bold text-green-600">{fmt(totalComp)}</p>
            </div>
            <div className="bg-card rounded-lg border border-border/40 p-2 text-center">
              <p className="text-[9px] text-muted-foreground">Abstenções</p>
              <p className="text-sm font-bold text-red-500">{fmt(totalAbst)}</p>
            </div>
            <div className="bg-card rounded-lg border border-border/40 p-2 text-center">
              <p className="text-[9px] text-muted-foreground">Brancos / Nulos</p>
              <p className="text-sm font-bold text-amber-500">{fmt(totalBrancos)} / {fmt(totalNulos)}</p>
            </div>
            <div className="bg-card rounded-lg border border-border/40 p-2 text-center">
              <p className="text-[9px] text-muted-foreground">Taxa Comparecimento</p>
              <p className="text-sm font-bold text-primary">{formatPercent(taxaComp, 1)}</p>
              <Progress value={taxaComp} className="h-1 mt-1" />
            </div>
          </div>
        </div>
      )}

      {/* Tabela de seções */}
      {loadingSecoes ? (
        <div className="space-y-1">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
      ) : secoesTurno1.length > 0 ? (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            📋 Seções ({secoesTurno1.length})
          </p>
          <div className="overflow-x-auto rounded-lg border border-border/30 max-h-60 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableHead className="text-[10px]">Zona</TableHead>
                  <TableHead className="text-[10px]">Seção</TableHead>
                  <TableHead className="text-[10px] text-right">Aptos</TableHead>
                  <TableHead className="text-[10px] text-right">Comparecimento</TableHead>
                  <TableHead className="text-[10px] text-right">Abstenção</TableHead>
                  <TableHead className="text-[10px] text-right">Brancos</TableHead>
                  <TableHead className="text-[10px] text-right">Nulos</TableHead>
                  <TableHead className="text-[10px] text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {secoesTurno1.map((s: any, i: number) => {
                  const pct = s.eleitorado_apto > 0 ? (s.comparecimento / s.eleitorado_apto) * 100 : 0;
                  return (
                    <TableRow key={i} className="border-border/20">
                      <TableCell className="text-xs font-mono">{s.zona}</TableCell>
                      <TableCell className="text-xs font-mono">{s.secao}</TableCell>
                      <TableCell className="text-xs text-right">{fmt(s.eleitorado_apto)}</TableCell>
                      <TableCell className="text-xs text-right font-medium text-green-600">{fmt(s.comparecimento)}</TableCell>
                      <TableCell className="text-xs text-right text-red-500">{fmt(s.abstencoes)}</TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">{fmt(s.votos_brancos)}</TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">{fmt(s.votos_nulos)}</TableCell>
                      <TableCell className="text-xs text-right font-bold">{formatPercent(pct, 1)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Sem dados de comparecimento por seção para esta escola.</p>
      )}

      {/* Fiscais */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          🛡️ Fiscais na Zona {escola.zona} ({loadingFiscais ? '...' : fiscaisEscola.length})
        </p>
        {loadingFiscais ? (
          <div className="space-y-1">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
        ) : fiscaisEscola.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {fiscaisEscola.map((f: any, i: number) => {
              const pessoa = f.pessoas;
              return (
                <div key={i} className="bg-card rounded-lg border border-border/40 p-3">
                  <div className="flex items-start gap-2">
                    <Shield className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{pessoa?.nome || 'Nome não informado'}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-muted-foreground">
                        {f.secao_fiscal && <span>Seção: {f.secao_fiscal}</span>}
                        {f.colegio_eleitoral && <span>Colégio: {f.colegio_eleitoral}</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-muted-foreground">
                        {pessoa?.telefone && (
                          <span className="flex items-center gap-0.5"><Phone className="w-3 h-3" />{pessoa.telefone}</span>
                        )}
                        {pessoa?.whatsapp && pessoa.whatsapp !== pessoa.telefone && (
                          <span className="flex items-center gap-0.5 text-green-600">WhatsApp: {pessoa.whatsapp}</span>
                        )}
                        {pessoa?.email && (
                          <span className="flex items-center gap-0.5"><Mail className="w-3 h-3" />{pessoa.email}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Nenhum fiscal cadastrado para esta zona/seção.</p>
        )}
      </div>

      {/* Lideranças */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          👥 Lideranças na Zona {escola.zona} ({loadingLiderancas ? '...' : liderancas?.length || 0})
        </p>
        {loadingLiderancas ? (
          <div className="space-y-1">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
        ) : liderancas && liderancas.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {liderancas.map((l: any, i: number) => {
              const pessoa = l.pessoas;
              return (
                <div key={i} className="bg-card rounded-lg border border-border/40 p-3">
                  <div className="flex items-start gap-2">
                    <UserCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{pessoa?.nome || 'Nome não informado'}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-muted-foreground">
                        {l.tipo_lideranca && <Badge variant="outline" className="text-[8px] h-4">{l.tipo_lideranca}</Badge>}
                        {l.nivel && <Badge variant="outline" className="text-[8px] h-4">{l.nivel}</Badge>}
                        {l.nivel_comprometimento && (
                          <Badge variant="secondary" className="text-[8px] h-4">{l.nivel_comprometimento}</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-muted-foreground">
                        {l.meta_votos && <span>Meta: {fmt(l.meta_votos)} votos</span>}
                        {l.apoiadores_estimados && <span>Apoiadores: ~{fmt(l.apoiadores_estimados)}</span>}
                        {l.regiao_atuacao && <span>Região: {l.regiao_atuacao}</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-muted-foreground">
                        {pessoa?.telefone && (
                          <span className="flex items-center gap-0.5"><Phone className="w-3 h-3" />{pessoa.telefone}</span>
                        )}
                        {pessoa?.whatsapp && pessoa.whatsapp !== pessoa.telefone && (
                          <span className="flex items-center gap-0.5 text-green-600">WhatsApp: {pessoa.whatsapp}</span>
                        )}
                      </div>
                      {l.bairros_influencia && (
                        <p className="text-[10px] text-muted-foreground mt-1">Bairros: {l.bairros_influencia}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Nenhuma liderança cadastrada para esta zona.</p>
        )}
      </div>
    </div>
  );
}

export default function EscolasEleitorais() {
  const { data, isLoading, isError, error } = useEscolas();
  const { data: comparecimento } = useComparecimento();
  const { municipio, ano } = useFilterStore();
  const [busca, setBusca] = useState('');
  const [expandedEscola, setExpandedEscola] = useState<string | null>(null);

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
        <p className="text-xs text-muted-foreground">{municipio} · {ano} — Locais de votação, seções, eleitores, fiscais e lideranças</p>
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
        <div className="space-y-2">
          {filtered.map((escola, idx) => {
            const isExpanded = expandedEscola === escola.escola;
            const pct = totalEleitores > 0 ? (escola.eleitores / totalEleitores) * 100 : 0;
            return (
              <div key={idx} className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
                <div
                  className={cn("p-4 cursor-pointer transition-colors hover:bg-muted/30", isExpanded && "bg-primary/5")}
                  onClick={() => setExpandedEscola(isExpanded ? null : escola.escola)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
                      <div className="min-w-0 flex-1">
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
                    </div>
                    <span className="text-xs font-bold text-primary whitespace-nowrap">Zona {escola.zona}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border/20 pt-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px] h-5">{escola.qtd_secoes} seções</Badge>
                      {escola.eleitores > 0 && (
                        <Badge variant="secondary" className="text-[9px] h-5">{fmt(escola.eleitores)} eleitores</Badge>
                      )}
                      <Badge variant="outline" className="text-[9px] h-5 text-muted-foreground">
                        {formatPercent(pct, 1)} do total
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {isExpanded ? 'Clique para fechar' : 'Clique para detalhes'}
                    </span>
                  </div>
                </div>
                {isExpanded && <EscolaExpandida escola={escola} ano={ano} municipio={municipio} />}
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
