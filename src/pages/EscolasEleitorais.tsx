import { useState, useMemo } from 'react';
import { useEscolas } from '@/hooks/useEscolas';
import { useFilterStore } from '@/stores/filterStore';
import { useComparecimento } from '@/hooks/useEleicoes';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, MapPin, Search, Users, School, Hash, Vote } from 'lucide-react';
import { formatNumber, formatPercent } from '@/lib/eleicoes';

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

export default function EscolasEleitorais() {
  const { data, isLoading, isError, error } = useEscolas();
  const { data: comparecimento } = useComparecimento();
  const { municipio, ano } = useFilterStore();
  const [busca, setBusca] = useState('');
  const [tab, setTab] = useState('cards');

  const escolas = data?.dados || [];

  const filtered = useMemo(() => {
    if (!busca) return escolas;
    const q = busca.toLowerCase();
    return escolas.filter(e =>
      e.escola.toLowerCase().includes(q) ||
      e.setor?.toLowerCase().includes(q) ||
      e.zona.toString().includes(q)
    );
  }, [escolas, busca]);

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
          placeholder="Buscar escola, bairro ou zona..."
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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/30 border border-border/30">
          <TabsTrigger value="cards" className="text-xs gap-1.5"><School className="w-3.5 h-3.5" /> Cards</TabsTrigger>
          <TabsTrigger value="tabela" className="text-xs gap-1.5"><Building2 className="w-3.5 h-3.5" /> Tabela</TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="mt-3">
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
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((escola, idx) => (
                <div key={idx} className="bg-card rounded-xl border border-border/50 p-4 shadow-sm flex flex-col">
                  <div className="mb-2">
                    <h3 className="text-sm font-bold leading-tight uppercase text-foreground">{escola.escola}</h3>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{escola.setor || 'Bairro não informado'}</span>
                      <span className="mx-1">•</span>
                      <span>Zona {escola.zona}</span>
                    </div>
                  </div>
                  <div className="mt-auto pt-3 flex items-center justify-between border-t border-border/20">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px] h-5">{escola.qtd_secoes} seções</Badge>
                      {escola.eleitores > 0 && (
                        <Badge variant="secondary" className="text-[9px] h-5">{fmt(escola.eleitores)} eleitores</Badge>
                      )}
                    </div>
                    <span className="text-xs font-bold text-primary">Zona {escola.zona}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tabela" className="mt-3">
          <Card className="border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-[10px] font-semibold">Escola</TableHead>
                    <TableHead className="text-[10px] font-semibold">Bairro</TableHead>
                    <TableHead className="text-[10px] font-semibold text-center">Zona</TableHead>
                    <TableHead className="text-[10px] font-semibold text-right">Seções</TableHead>
                    <TableHead className="text-[10px] font-semibold text-right">Eleitores</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 5 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhuma escola encontrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((e, i) => (
                      <TableRow key={i} className="border-border/20 hover:bg-muted/30">
                        <TableCell className="text-xs font-medium max-w-[300px] truncate">{e.escola}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.setor || '—'}</TableCell>
                        <TableCell className="text-xs text-center font-mono">{e.zona}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{e.qtd_secoes}</TableCell>
                        <TableCell className="text-sm text-right font-bold text-primary">{fmt(e.eleitores)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {!isLoading && escolas.length > 0 && (
        <p className="text-[10px] text-muted-foreground text-right">
          {totalEscolas} escolas · {totalSecoes} seções · {fmt(totalEleitores)} eleitores · Fonte: TSE/MotherDuck
        </p>
      )}
    </div>
  );
}
