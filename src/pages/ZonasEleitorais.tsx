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
  Hash, Search, School, X, GitCompareArrows, Plus, MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { mdQuery, getTableName, getAnosDisponiveis, sqlComposicaoVotosCandidato, sqlSafe } from '@/lib/motherduck';
import { useQuery } from '@tanstack/react-query';

const fmt = (n: number | string) => Number(n || 0).toLocaleString('pt-BR');

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
  municipio?: string;
  escola?: string;
  bairro?: string;
  [key: string]: any;
}

interface ComparativoCandidato {
  sq: string;
  ano: number;
  label: string;
  numero: number;
  cargo: string;
}

interface CandidatoSelecionado extends ComparativoCandidato {
  partido: string;
}

/** Hook: search candidates across ALL available years — searches ALL cities in GO */
function useBuscarCandidatos(search: string) {
  const anosDisponiveis = getAnosDisponiveis('candidatos');
  return useQuery({
    queryKey: ['busca-candidatos-comparativo-all', search],
    queryFn: async () => {
      if (!search || search.length < 3) return [];
      const searchUpper = sqlSafe(search.toUpperCase());

      const subqueries = anosDisponiveis.map(a => {
        const cand = getTableName('candidatos', a);
        const nameFilter = `(UPPER(c.NM_URNA_CANDIDATO) LIKE '%${searchUpper}%' OR UPPER(c.NM_CANDIDATO) LIKE '%${searchUpper}%')`;

        return `
          SELECT
            CAST(c.SQ_CANDIDATO AS VARCHAR) AS sq_candidato,
            c.NM_URNA_CANDIDATO AS candidato,
            c.NM_CANDIDATO AS nome_completo,
            c.SG_PARTIDO AS partido,
            c.DS_CARGO AS cargo,
            c.NR_CANDIDATO AS numero,
            ${a} AS ano,
            c.NM_UE AS municipio
          FROM ${cand} c
          WHERE ${nameFilter}
        `;
      });

      const sql = `SELECT DISTINCT * FROM (${subqueries.join('\nUNION ALL\n')}) sub ORDER BY candidato, ano DESC LIMIT 80`;
      return await mdQuery<CandidatoOption>(sql);
    },
    enabled: search.length >= 3,
    staleTime: 60_000,
  });
}

/** Hook: compare votes by municipio+zona for selected candidates — ALL cities */
function useComparativoZona(selecionados: ComparativoCandidato[]) {
  return useQuery({
    queryKey: ['comparativo-zona-all', selecionados.map(s => `${s.sq}_${s.ano}`)],
    queryFn: async () => {
      if (selecionados.length === 0) return [];
      const subqueries = selecionados.map((s, i) => {
        const vot = getTableName('votacao', s.ano);
        const sqSafe = sqlSafe(s.sq);
        return `
          SELECT
            v.NM_MUNICIPIO AS municipio,
            v.NR_ZONA AS zona,
            SUM(v.QT_VOTOS_NOMINAIS) AS votos,
            '${sqlSafe(s.label)}' AS candidato_label,
            ${i} AS idx
          FROM ${vot} v
          WHERE CAST(v.SQ_CANDIDATO AS VARCHAR) = '${sqSafe}'
          GROUP BY v.NM_MUNICIPIO, v.NR_ZONA
        `;
      });
      const sql = subqueries.join('\nUNION ALL\n') + '\nORDER BY municipio, zona, idx';
      const rows = await mdQuery<{ municipio: string; zona: number; votos: number; candidato_label: string; idx: number }>(sql);

      const map = new Map<string, any>();
      for (const r of rows) {
        const key = `${r.municipio}_${r.zona}`;
        if (!map.has(key)) map.set(key, { municipio: r.municipio, zona: r.zona });
        const entry = map.get(key)!;
        entry[`votos_${r.idx}`] = Number(r.votos);
      }
      return Array.from(map.values()).sort((a, b) => {
        const cmp = (a.municipio || '').localeCompare(b.municipio || '');
        return cmp !== 0 ? cmp : a.zona - b.zona;
      });
    },
    enabled: selecionados.length > 0,
    staleTime: 5 * 60_000,
  });
}

/** Hook: compare votes by escola for selected candidates — ALL cities */
function useComparativoEscola(selecionados: ComparativoCandidato[]) {
  return useQuery({
    queryKey: ['comparativo-escola-all', selecionados.map(s => `${s.sq}_${s.ano}`)],
    queryFn: async () => {
      if (selecionados.length === 0) return [];
      // For escola we need votacao_secao joined with eleitorado_local
      // Since sqlComposicaoVotosCandidato requires municipio, we query all municipios that have votes for each candidate first
      const subqueries = selecionados.map((s, i) => {
        const vot = getTableName('votacao_secao', s.ano);
        const anosLocal = getAnosDisponiveis('eleitorado_local');
        const anoLocal = anosLocal.includes(s.ano) ? s.ano : ([...anosLocal].sort((a, b) => Math.abs(a - s.ano) - Math.abs(b - s.ano))[0] || null);
        if (!anoLocal) return null;
        const loc = getTableName('eleitorado_local', anoLocal);
        const sqSafe = sqlSafe(s.sq);

        return `
          SELECT
            loc.NM_MUNICIPIO AS municipio,
            loc.NM_LOCAL_VOTACAO AS escola,
            loc.NM_BAIRRO AS bairro,
            v.NR_ZONA AS zona,
            SUM(v.QT_VOTOS_NOMINAIS) AS votos,
            ${i} AS idx
          FROM ${vot} v
          INNER JOIN ${loc} loc ON v.NR_ZONA = loc.NR_ZONA AND v.NR_SECAO = loc.NR_SECAO AND loc.SG_UF = 'GO'
          WHERE v.NR_VOTAVEL = ${s.numero}
          GROUP BY loc.NM_MUNICIPIO, loc.NM_LOCAL_VOTACAO, loc.NM_BAIRRO, v.NR_ZONA
        `;
      }).filter(Boolean);

      if (subqueries.length === 0) return [];
      const sql = subqueries.join('\nUNION ALL\n') + '\nORDER BY municipio, escola, idx';
      const rows = await mdQuery<{ municipio: string; escola: string; bairro: string; zona: number; votos: number; idx: number }>(sql);

      const map = new Map<string, any>();
      for (const r of rows) {
        const key = `${r.municipio}_${r.escola}_${r.bairro}_${r.zona}`;
        if (!map.has(key)) map.set(key, { municipio: r.municipio, escola: r.escola, bairro: r.bairro, zona: Number(r.zona) });
        const entry = map.get(key)!;
        entry[`votos_${r.idx}`] = Number(r.votos);
      }
      return Array.from(map.values()).sort((a, b) => {
        const cmp = (a.municipio || '').localeCompare(b.municipio || '');
        if (cmp !== 0) return cmp;
        const totalA = selecionados.reduce((s, _, i) => s + (a[`votos_${i}`] || 0), 0);
        const totalB = selecionados.reduce((s, _, i) => s + (b[`votos_${i}`] || 0), 0);
        return totalB - totalA;
      });
    },
    enabled: selecionados.length > 0,
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
  const [searchCandidato, setSearchCandidato] = useState('');
  const [selecionados, setSelecionados] = useState<CandidatoSelecionado[]>([]);

  const { data: resultadosBusca, isLoading: buscando } = useBuscarCandidatos(searchCandidato);

  const comparativoItems = useMemo(() =>
    selecionados.map(s => ({
      sq: s.sq,
      ano: s.ano,
      label: s.label,
      numero: s.numero,
      cargo: s.cargo,
    })),
    [selecionados]
  );

  const { data: dadosZona, isLoading: loadingZona, error: erroZona } = useComparativoZona(comparativoItems);
  const { data: dadosEscola, isLoading: loadingEscola, error: erroEscola } = useComparativoEscola(comparativoItems);

  const adicionarCandidato = useCallback((c: CandidatoOption) => {
    const key = `${c.sq_candidato}_${c.ano}`;
    if (selecionados.some(s => `${s.sq}_${s.ano}` === key)) return;
    if (selecionados.length >= 8) return;
    setSelecionados(prev => [...prev, {
      sq: c.sq_candidato,
      ano: c.ano,
      label: c.candidato,
      numero: c.numero,
      partido: c.partido,
      cargo: c.cargo,
    }]);
    setSearchCandidato('');
  }, [selecionados]);

  const removerCandidato = useCallback((idx: number) => {
    setSelecionados(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // Get unique municipalities from zona data for section headers
  const municipiosZona = useMemo(() => {
    if (!dadosZona) return [];
    return [...new Set(dadosZona.map((r: any) => r.municipio))].sort();
  }, [dadosZona]);

  const municipiosEscola = useMemo(() => {
    if (!dadosEscola) return [];
    return [...new Set(dadosEscola.map((r: any) => r.municipio))].sort();
  }, [dadosEscola]);

  return (
    <div className="space-y-3 sm:space-y-4 max-w-[1800px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
          <GitCompareArrows className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          Comparativo Eleitoral
        </h1>
        <p className="text-[10px] sm:text-xs text-muted-foreground">
          Compare candidatos por zona e escola em todas as cidades
        </p>
      </div>

      {/* Busca e seleção de candidatos */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Busque e adicione candidatos para comparar (máx. 8)
          </p>

          <div className="relative w-full sm:max-w-md">
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
                        'flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 cursor-pointer border-b border-border/20 last:border-0',
                        jaSelecionado && 'opacity-40 pointer-events-none'
                      )}
                      onClick={() => adicionarCandidato(c)}
                    >
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                        <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="text-xs font-medium truncate">{c.candidato}</span>
                        <Badge variant="secondary" className="text-[9px] h-5">{c.ano}</Badge>
                        <Badge variant="outline" className="text-[9px] h-5 hidden sm:inline-flex">{c.cargo}</Badge>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: getPartidoCor(c.partido) + '20', color: getPartidoCor(c.partido) }}>
                          {c.partido}
                        </span>
                        <span className="text-[9px] text-muted-foreground hidden sm:inline">
                          <MapPin className="w-3 h-3 inline mr-0.5" />{c.municipio}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] h-5 shrink-0 ml-1">{c.numero}</Badge>
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
                   <span className="text-[9px] opacity-60">{s.ano} · {s.partido}</span>
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
                  Comparativo de votos por Zona Eleitoral — Todas as cidades
                </h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="text-[10px] font-semibold w-[140px]">Município</TableHead>
                      <TableHead className="text-[10px] font-semibold w-[80px]">Zona</TableHead>
                       {selecionados.map((s, i) => (
                        <TableHead key={i} className="text-[10px] font-semibold text-right min-w-[120px]">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CORES_COMPARATIVO[i] }} />
                            <span className="truncate max-w-[100px]">{s.label}</span>
                            <span className="opacity-50">{s.ano}</span>
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
                          {Array.from({ length: selecionados.length + 3 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : erroZona ? (
                      <TableRow>
                        <TableCell colSpan={selecionados.length + 3} className="text-center text-destructive text-sm py-8">
                          Erro ao carregar dados: {erroZona.message}
                        </TableCell>
                      </TableRow>
                    ) : !dadosZona?.length ? (
                      <TableRow>
                        <TableCell colSpan={selecionados.length + 3} className="text-center text-muted-foreground text-sm py-8">
                          Sem dados de votação por zona para os candidatos selecionados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {/* Group by municipality */}
                        {municipiosZona.map((mun: string) => {
                          const rows = dadosZona.filter((r: any) => r.municipio === mun);
                          return rows.map((row: any, ri: number) => {
                            const votos = selecionados.map((_, i) => Number(row[`votos_${i}`] || 0));
                            const max = votos.length > 0 ? Math.max(...votos) : 0;
                            const positivos = votos.filter(v => v > 0);
                            const min = positivos.length > 0 ? Math.min(...positivos) : 0;
                            const diff = selecionados.length === 2 ? votos[0] - votos[1] : max - min;
                            return (
                              <TableRow key={`${mun}_${row.zona}`} className="border-border/20 hover:bg-muted/20">
                                {ri === 0 ? (
                                  <TableCell className="text-xs font-bold text-primary" rowSpan={rows.length}>
                                    <div className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      {mun}
                                    </div>
                                  </TableCell>
                                ) : null}
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
                          });
                        })}
                        {/* Totals row */}
                        <TableRow className="bg-muted/20 border-t-2 border-border font-bold">
                          <TableCell className="text-xs font-bold uppercase" colSpan={2}>Total</TableCell>
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
                  Comparativo de votos por Escola — Todas as cidades
                </h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="text-[10px] font-semibold w-[140px]">Município</TableHead>
                      <TableHead className="text-[10px] font-semibold">Escola</TableHead>
                      <TableHead className="text-[10px] font-semibold w-[80px]">Zona</TableHead>
                      <TableHead className="text-[10px] font-semibold">Bairro</TableHead>
                       {selecionados.map((s, i) => (
                        <TableHead key={i} className="text-[10px] font-semibold text-right min-w-[120px]">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CORES_COMPARATIVO[i] }} />
                            <span className="truncate max-w-[100px]">{s.label}</span>
                            <span className="opacity-50">{s.ano}</span>
                          </div>
                        </TableHead>
                       ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingEscola ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: selecionados.length + 4 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : erroEscola ? (
                      <TableRow>
                        <TableCell colSpan={selecionados.length + 4} className="text-center text-destructive text-sm py-8">
                          Erro ao carregar dados: {erroEscola.message}
                        </TableCell>
                      </TableRow>
                    ) : !dadosEscola?.length ? (
                      <TableRow>
                        <TableCell colSpan={selecionados.length + 4} className="text-center text-muted-foreground text-sm py-8">
                          Sem dados de votação por escola para os candidatos selecionados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {dadosEscola.map((row: any, ri: number) => {
                          const votos = selecionados.map((_, i) => Number(row[`votos_${i}`] || 0));
                          const max = votos.length > 0 ? Math.max(...votos) : 0;
                          return (
                            <TableRow key={ri} className="border-border/20 hover:bg-muted/20">
                              <TableCell className="text-xs font-medium text-primary">{row.municipio}</TableCell>
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
                          <TableCell className="text-xs font-bold uppercase" colSpan={4}>Total</TableCell>
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
            <p className="text-xs">Busque candidatos pelo nome e adicione-os à comparação — os votos de todas as cidades serão exibidos</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
