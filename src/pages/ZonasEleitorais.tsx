import { useState, useMemo, useCallback } from 'react';
import { useFilterStore } from '@/stores/filterStore';
import { formatNumber, getPartidoCor } from '@/lib/eleicoes';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Hash, Search, School, X, GitCompareArrows, Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { mdQuery, getTableName, getAnosDisponiveis } from '@/lib/motherduck';
import { useQuery } from '@tanstack/react-query';

const fmt = (n: number | string) => Number(n || 0).toLocaleString('pt-BR');

const TODOS_ANOS = [2024, 2022, 2020, 2018, 2016, 2014] as const;

interface CandidatoOption {
  sq_candidato: string;
  candidato: string;
  nome_completo: string;
  partido: string;
  cargo: string;
  numero: number;
  ano: number;
  municipio: string;
}

interface ComparativoRow {
  zona: number;
  escola?: string;
  bairro?: string;
  [key: string]: any; // votos_CANDIDATO_ANO
}

/** Hook: search candidates across selected years */
function useBuscarCandidatos(municipio: string, search: string, anosAtivos: number[]) {
  return useQuery({
    queryKey: ['busca-candidatos-comparativo', municipio, search, anosAtivos],
    queryFn: async () => {
      if (!search || search.length < 3 || anosAtivos.length === 0) return [];
      const searchUpper = search.toUpperCase().replace(/'/g, "''");
      const queries = anosAtivos.map((ano, idx) => {
        if (!getAnosDisponiveis('candidatos').includes(ano)) return null;
        const cand = getTableName('candidatos', ano);
        const isGeral = [2014, 2018, 2022].includes(ano);
        const munFilter = isGeral ? '' : `AND c.NM_UE = '${municipio}'`;
        return `
          SELECT DISTINCT
            CAST(c.SQ_CANDIDATO AS VARCHAR) AS sq_candidato,
            c.NM_URNA_CANDIDATO AS candidato,
            c.NM_CANDIDATO AS nome_completo,
            c.SG_PARTIDO AS partido,
            c.DS_CARGO AS cargo,
            c.NR_CANDIDATO AS numero,
            ${ano} AS ano,
            c.NM_UE AS municipio
          FROM ${cand} c
          WHERE (UPPER(c.NM_URNA_CANDIDATO) LIKE '%${searchUpper}%'
              OR UPPER(c.NM_CANDIDATO) LIKE '%${searchUpper}%')
            ${munFilter}
        `;
      }).filter(Boolean);
      if (queries.length === 0) return [];
      const sql = 'SELECT * FROM (\n' + queries.join('\nUNION ALL\n') + '\n) sub\nORDER BY candidato, ano DESC\nLIMIT 50';
      return await mdQuery<CandidatoOption>(sql);
    },
    enabled: !!municipio && search.length >= 3 && anosAtivos.length > 0,
    staleTime: 60_000,
  });
}

/** Hook: compare votes by zona for selected candidates */
function useComparativoZona(
  municipio: string,
  selecionados: { sq: string; ano: number; label: string; mun?: string }[]
) {
  return useQuery({
    queryKey: ['comparativo-zona', municipio, selecionados.map(s => `${s.sq}_${s.ano}`)],
    queryFn: async () => {
      if (selecionados.length === 0) return [];
      const subqueries = selecionados.map((s, i) => {
        const vot = getTableName('votacao', s.ano);
        return `
          SELECT
            v.NR_ZONA AS zona,
            SUM(v.QT_VOTOS_NOMINAIS) AS votos,
            '${s.label.replace(/'/g, "''")}' AS candidato_label,
            ${i} AS idx
          FROM ${vot} v
          WHERE CAST(v.SQ_CANDIDATO AS VARCHAR) = '${s.sq}'
          GROUP BY v.NR_ZONA
        `;
      });
      const sql = subqueries.join('\nUNION ALL\n') + '\nORDER BY zona, idx';
      const rows = await mdQuery<{ zona: number; votos: number; candidato_label: string; idx: number }>(sql);

      // Pivot: zona → { zona, votos_LABEL1, votos_LABEL2, ... }
      const map = new Map<number, any>();
      for (const r of rows) {
        if (!map.has(r.zona)) map.set(r.zona, { zona: r.zona });
        const entry = map.get(r.zona)!;
        entry[`votos_${r.idx}`] = Number(r.votos);
      }
      return Array.from(map.values()).sort((a, b) => a.zona - b.zona);
    },
    enabled: selecionados.length > 0 && !!municipio,
    staleTime: 5 * 60_000,
  });
}

/** Hook: compare votes by escola for selected candidates */
function useComparativoEscola(
  municipio: string,
  selecionados: { sq: string; ano: number; label: string; mun?: string }[]
) {
  return useQuery({
    queryKey: ['comparativo-escola', municipio, selecionados.map(s => `${s.sq}_${s.ano}`)],
    queryFn: async () => {
      if (selecionados.length === 0) return [];
      const subqueries = selecionados.map((s, i) => {
        const votSecao = getTableName('votacao_secao', s.ano);
        const anosLocal = getAnosDisponiveis('eleitorado_local');
        const sorted = [...anosLocal].sort((a, b) => Math.abs(a - s.ano) - Math.abs(b - s.ano));
        const anoLocal = sorted[0] || 2024;
        const loc = getTableName('eleitorado_local', anoLocal);
        const mun = s.mun || municipio;
        return `
          SELECT
            COALESCE(loc.NM_LOCAL_VOTACAO, 'NÃO INFORMADO') AS escola,
            COALESCE(loc.NM_BAIRRO, 'NÃO INFORMADO') AS bairro,
            vs.NR_ZONA AS zona,
            SUM(vs.QT_VOTOS_NOMINAIS) AS votos,
            '${s.label.replace(/'/g, "''")}' AS candidato_label,
            ${i} AS idx
          FROM ${votSecao} vs
          INNER JOIN (
            SELECT NM_MUNICIPIO, NR_ZONA, NR_SECAO,
              MAX(NM_BAIRRO) AS NM_BAIRRO,
              MAX(NM_LOCAL_VOTACAO) AS NM_LOCAL_VOTACAO
            FROM ${loc}
            WHERE SG_UF = 'GO' AND NM_MUNICIPIO = '${mun}'
            GROUP BY NM_MUNICIPIO, NR_ZONA, NR_SECAO
          ) loc ON vs.NR_ZONA = loc.NR_ZONA AND vs.NR_SECAO = loc.NR_SECAO
          WHERE vs.NR_VOTAVEL = (
            SELECT NR_CANDIDATO FROM ${getTableName('candidatos', s.ano)}
            WHERE CAST(SQ_CANDIDATO AS VARCHAR) = '${s.sq}' LIMIT 1
          )
            AND vs.NM_MUNICIPIO = '${mun}'
          GROUP BY loc.NM_LOCAL_VOTACAO, loc.NM_BAIRRO, vs.NR_ZONA
        `;
      });
      const sql = subqueries.join('\nUNION ALL\n') + '\nORDER BY escola, idx';
      const rows = await mdQuery<{ escola: string; bairro: string; zona: number; votos: number; idx: number }>(sql);

      const map = new Map<string, any>();
      for (const r of rows) {
        const key = `${r.escola}_${r.zona}`;
        if (!map.has(key)) map.set(key, { escola: r.escola, bairro: r.bairro, zona: r.zona });
        const entry = map.get(key)!;
        entry[`votos_${r.idx}`] = Number(r.votos);
      }
      return Array.from(map.values()).sort((a, b) => {
        const totalA = selecionados.reduce((s, _, i) => s + (a[`votos_${i}`] || 0), 0);
        const totalB = selecionados.reduce((s, _, i) => s + (b[`votos_${i}`] || 0), 0);
        return totalB - totalA;
      });
    },
    enabled: selecionados.length > 0 && !!municipio,
    staleTime: 5 * 60_000,
  });
}

// Color palette for comparison columns
const CORES_COMPARATIVO = [
  'hsl(var(--primary))',
  '#e02424',
  '#16a34a',
  '#f97316',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#f59e0b',
];

export default function ZonasEleitorais() {
  const { municipio } = useFilterStore();
  const [anosAtivos, setAnosAtivos] = useState<number[]>([2024]);
  const [searchCandidato, setSearchCandidato] = useState('');
  const [selecionados, setSelecionados] = useState<{ sq: string; ano: number; label: string; partido: string; cargo: string; mun: string }[]>([]);

  const { data: resultadosBusca, isLoading: buscando } = useBuscarCandidatos(municipio, searchCandidato, anosAtivos);

  const comparativoItems = useMemo(() =>
    selecionados.map(s => ({ sq: s.sq, ano: s.ano, label: s.label, mun: s.mun })),
    [selecionados]
  );

  const { data: dadosZona, isLoading: loadingZona } = useComparativoZona(municipio, comparativoItems);
  const { data: dadosEscola, isLoading: loadingEscola } = useComparativoEscola(municipio, comparativoItems);

  const toggleAno = useCallback((ano: number) => {
    setAnosAtivos(prev => prev.includes(ano) ? prev.filter(a => a !== ano) : [...prev, ano]);
  }, []);

  const adicionarCandidato = useCallback((c: CandidatoOption) => {
    const key = `${c.sq_candidato}_${c.ano}`;
    if (selecionados.some(s => `${s.sq}_${s.ano}` === key)) return;
    if (selecionados.length >= 8) return;
    setSelecionados(prev => [...prev, {
      sq: c.sq_candidato,
      ano: c.ano,
      label: `${c.candidato} (${c.ano})`,
      partido: c.partido,
      cargo: c.cargo,
      mun: c.municipio || municipio,
    }]);
    setSearchCandidato('');
  }, [selecionados]);

  const removerCandidato = useCallback((idx: number) => {
    setSelecionados(prev => prev.filter((_, i) => i !== idx));
  }, []);

  if (!municipio) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
        <Hash className="w-10 h-10 opacity-30" />
        <p className="text-sm">Selecione um município nos filtros para comparar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[1800px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <GitCompareArrows className="w-5 h-5 text-primary" />
          Comparativo Eleitoral por Zona e Escola
        </h1>
        <p className="text-xs text-muted-foreground">
          {municipio} — Compare candidatos entre diferentes anos, zonas eleitorais e escolas
        </p>
      </div>

      {/* Seleção de anos */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            1. Selecione os anos para busca
          </p>
          <div className="flex flex-wrap gap-2">
            {TODOS_ANOS.map(ano => (
              <Button
                key={ano}
                variant={anosAtivos.includes(ano) ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-8"
                onClick={() => toggleAno(ano)}
              >
                {ano}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Busca e seleção de candidatos */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            2. Busque e adicione candidatos para comparar (máx. 8)
          </p>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Digite o nome do candidato..."
              value={searchCandidato}
              onChange={e => setSearchCandidato(e.target.value)}
              className="pl-9 h-9 text-sm bg-card border-border/50"
            />
          </div>

          {/* Search results */}
          {searchCandidato.length >= 3 && (
            <div className="mt-2 border border-border/50 rounded-lg max-h-64 overflow-y-auto bg-card">
              {buscando ? (
                <div className="p-3 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : !resultadosBusca?.length ? (
                <p className="text-xs text-muted-foreground p-3">Nenhum candidato encontrado.</p>
              ) : (
                resultadosBusca.map((c, i) => {
                  const key = `${c.sq_candidato}_${c.ano}`;
                  const jaSelecionado = selecionados.some(s => `${s.sq}_${s.ano}` === key);
                  return (
                    <div
                      key={`${key}_${i}`}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 hover:bg-muted/30 cursor-pointer border-b border-border/20 last:border-0',
                        jaSelecionado && 'opacity-40 pointer-events-none'
                      )}
                      onClick={() => adicionarCandidato(c)}
                    >
                      <div className="flex items-center gap-2">
                        <Plus className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-medium">{c.candidato}</span>
                        <Badge variant="outline" className="text-[9px] h-5">{c.cargo}</Badge>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: getPartidoCor(c.partido) + '20', color: getPartidoCor(c.partido) }}>
                          {c.partido}
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-[10px] h-5">{c.ano}</Badge>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Selected candidates chips */}
          {selecionados.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {selecionados.map((s, i) => (
                <Badge
                  key={`${s.sq}_${s.ano}`}
                  className="text-xs py-1 px-2.5 gap-1.5 cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: CORES_COMPARATIVO[i] + '20', color: CORES_COMPARATIVO[i], borderColor: CORES_COMPARATIVO[i] + '40' }}
                  variant="outline"
                  onClick={() => removerCandidato(i)}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CORES_COMPARATIVO[i] }} />
                  {s.label}
                  <span className="text-[9px] opacity-60">{s.partido}</span>
                  <X className="w-3 h-3 ml-1" />
                </Badge>
              ))}
              <Button variant="ghost" size="sm" className="text-xs h-6 text-destructive" onClick={() => setSelecionados([])}>
                Limpar todos
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {selecionados.length > 0 && (
        <Tabs defaultValue="zonas">
          <TabsList className="bg-muted/30 border border-border/30">
            <TabsTrigger value="zonas" className="text-xs gap-1.5"><Hash className="w-3.5 h-3.5" /> Por Zona Eleitoral</TabsTrigger>
            <TabsTrigger value="escolas" className="text-xs gap-1.5"><School className="w-3.5 h-3.5" /> Por Escola</TabsTrigger>
          </TabsList>

          {/* --- Tab: Por Zona --- */}
          <TabsContent value="zonas" className="mt-3">
            <Card className="border-border/50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/30">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Comparativo de votos por Zona Eleitoral — {municipio}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="text-[10px] font-semibold w-[80px]">Zona</TableHead>
                      {selecionados.map((s, i) => (
                        <TableHead key={i} className="text-[10px] font-semibold text-right min-w-[120px]">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CORES_COMPARATIVO[i] }} />
                            <span className="truncate max-w-[100px]">{s.label}</span>
                          </div>
                        </TableHead>
                      ))}
                      <TableHead className="text-[10px] font-semibold text-right">Diferença</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingZona ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: selecionados.length + 2 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : !dadosZona?.length ? (
                      <TableRow>
                        <TableCell colSpan={selecionados.length + 2} className="text-center text-muted-foreground text-sm py-8">
                          Sem dados de votação por zona para os candidatos selecionados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {dadosZona.map((row: any) => {
                          const votos = selecionados.map((_, i) => Number(row[`votos_${i}`] || 0));
                          const max = votos.length > 0 ? Math.max(...votos) : 0;
                          const positivos = votos.filter(v => v > 0);
                          const min = positivos.length > 0 ? Math.min(...positivos) : 0;
                          const diff = selecionados.length === 2 ? votos[0] - votos[1] : max - min;
                          return (
                            <TableRow key={row.zona} className="border-border/20 hover:bg-muted/20">
                              <TableCell className="text-sm font-bold">Zona {row.zona}</TableCell>
                              {selecionados.map((_, i) => {
                                const v = votos[i];
                                const isMax = v === max && v > 0;
                                return (
                                  <TableCell key={i} className="text-right">
                                    <span className={cn('text-sm font-mono', isMax ? 'font-bold' : 'text-muted-foreground')}
                                      style={isMax ? { color: CORES_COMPARATIVO[i] } : undefined}>
                                      {v > 0 ? formatNumber(v) : '—'}
                                    </span>
                                  </TableCell>
                                );
                              })}
                              <TableCell className="text-right">
                                <span className={cn('text-xs font-bold', diff > 0 ? 'text-green-500' : diff < 0 ? 'text-red-500' : 'text-muted-foreground')}>
                                  {diff > 0 ? '+' : ''}{formatNumber(diff)}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {/* Totals row */}
                        <TableRow className="bg-muted/20 border-t-2 border-border font-bold">
                          <TableCell className="text-xs font-bold uppercase">Total</TableCell>
                          {selecionados.map((_, i) => {
                            const total = dadosZona.reduce((s: number, r: any) => s + Number(r[`votos_${i}`] || 0), 0);
                            return (
                              <TableCell key={i} className="text-right">
                                <span className="text-sm font-bold" style={{ color: CORES_COMPARATIVO[i] }}>
                                  {formatNumber(total)}
                                </span>
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-right">
                            {selecionados.length === 2 && (() => {
                              const t0 = dadosZona.reduce((s: number, r: any) => s + Number(r.votos_0 || 0), 0);
                              const t1 = dadosZona.reduce((s: number, r: any) => s + Number(r.votos_1 || 0), 0);
                              const d = t0 - t1;
                              return (
                                <span className={cn('text-xs font-bold', d > 0 ? 'text-green-500' : 'text-red-500')}>
                                  {d > 0 ? '+' : ''}{formatNumber(d)}
                                </span>
                              );
                            })()}
                          </TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          {/* --- Tab: Por Escola --- */}
          <TabsContent value="escolas" className="mt-3">
            <Card className="border-border/50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/30">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Comparativo de votos por Escola — {municipio}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="text-[10px] font-semibold">Escola</TableHead>
                      <TableHead className="text-[10px] font-semibold w-[80px]">Zona</TableHead>
                      <TableHead className="text-[10px] font-semibold">Bairro</TableHead>
                      {selecionados.map((s, i) => (
                        <TableHead key={i} className="text-[10px] font-semibold text-right min-w-[120px]">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CORES_COMPARATIVO[i] }} />
                            <span className="truncate max-w-[100px]">{s.label}</span>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingEscola ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: selecionados.length + 3 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : !dadosEscola?.length ? (
                      <TableRow>
                        <TableCell colSpan={selecionados.length + 3} className="text-center text-muted-foreground text-sm py-8">
                          Sem dados de votação por escola para os candidatos selecionados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {dadosEscola.map((row: any, ri: number) => {
                          const votos = selecionados.map((_, i) => Number(row[`votos_${i}`] || 0));
                          const max = Math.max(...votos);
                          return (
                            <TableRow key={ri} className="border-border/20 hover:bg-muted/20">
                              <TableCell className="text-xs font-medium max-w-[250px] truncate">{row.escola}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{row.zona}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{row.bairro}</TableCell>
                              {selecionados.map((_, i) => {
                                const v = votos[i];
                                const isMax = v === max && v > 0;
                                return (
                                  <TableCell key={i} className="text-right">
                                    <span className={cn('text-sm font-mono', isMax ? 'font-bold' : 'text-muted-foreground')}
                                      style={isMax ? { color: CORES_COMPARATIVO[i] } : undefined}>
                                      {v > 0 ? formatNumber(v) : '—'}
                                    </span>
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          );
                        })}
                        {/* Totals */}
                        <TableRow className="bg-muted/20 border-t-2 border-border font-bold">
                          <TableCell className="text-xs font-bold uppercase" colSpan={3}>Total</TableCell>
                          {selecionados.map((_, i) => {
                            const total = dadosEscola.reduce((s: number, r: any) => s + Number(r[`votos_${i}`] || 0), 0);
                            return (
                              <TableCell key={i} className="text-right">
                                <span className="text-sm font-bold" style={{ color: CORES_COMPARATIVO[i] }}>
                                  {formatNumber(total)}
                                </span>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {selecionados.length === 0 && (
        <Card className="border-border/50 border-dashed">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <GitCompareArrows className="w-12 h-12 opacity-20" />
            <p className="text-sm font-medium">Selecione candidatos acima para gerar o comparativo</p>
            <p className="text-xs">Escolha os anos, busque candidatos pelo nome e adicione-os à comparação</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
