import { useParams, Link } from 'react-router-dom';
import { useDossieCandidato, useHistoricoCandidato, useEvolucaoPatrimonio } from '@/hooks/useEleicoes';
import { formatNumber, formatPercent, formatBRL, formatBRLCompact, getPartidoCor, getAvatarColor, getInitial } from '@/lib/eleicoes';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { GeoFilterBadge } from '@/components/eleicoes/GeoFilterBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, User, Briefcase, GraduationCap, MapPin, Calendar, DollarSign, Shield, Vote, TrendingUp, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFilterStore } from '@/stores/filterStore';

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

function maskCPF(cpf: string | null | undefined): string {
  if (!cpf || cpf.length < 11) return '***.***.***-**';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return '***.***.***-**';
  return `${clean.slice(0, 3)}.***.***.${clean.slice(9)}`;
}

function calcAge(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
    let d: Date;
    if (parts[0].length === 4) d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    else d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    const age = Math.floor((Date.now() - d.getTime()) / 31557600000);
    return age > 0 && age < 120 ? `${age} anos` : '—';
  } catch { return '—'; }
}

// ═══════════════════════════════════════════════════════
// Info Row
// ═══════════════════════════════════════════════════════

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium truncate">{value || '—'}</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Timeline de Partidos
// ═══════════════════════════════════════════════════════

function PartyTimeline({ historico }: { historico: any[] }) {
  if (!historico || historico.length === 0) return null;

  // Deduplica por ano
  const seen = new Set<number>();
  const unique = historico.filter((h: any) => {
    const ano = Number(h.ano);
    if (seen.has(ano)) return false;
    seen.add(ano);
    return true;
  }).sort((a: any, b: any) => Number(a.ano) - Number(b.ano));

  return (
    <div className="bg-card rounded-lg border border-border/40 p-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Trajetória Partidária</h3>
      <div className="relative flex items-center gap-0 overflow-x-auto pb-2">
        {/* Connecting line */}
        <div className="absolute top-5 left-4 right-4 h-px bg-border/60" />

        {unique.map((h: any, i: number) => {
          const partido = h.partido || h.sigla_partido || '?';
          const cor = getPartidoCor(partido);
          return (
            <div key={i} className="relative flex flex-col items-center min-w-[80px] px-2">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-bold z-10 border-2 border-background"
                style={{ backgroundColor: cor + '30', color: cor, borderColor: cor }}
              >
                {partido}
              </div>
              <p className="text-[10px] font-bold mt-1.5">{h.ano}</p>
              <p className="text-[9px] text-muted-foreground truncate max-w-[70px] text-center">{h.cargo}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Loading Skeleton
// ═══════════════════════════════════════════════════════

function ProfileSkeleton() {
  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="bg-card rounded-lg border border-border/40 p-6">
        <div className="flex gap-6">
          <Skeleton className="w-20 h-20 rounded-full shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40" />
            <div className="grid grid-cols-3 gap-4 mt-4">
              {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          </div>
        </div>
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════

export default function CandidatoPerfil() {
  const { id } = useParams<{ id: string }>();
  const { ano } = useFilterStore();

  const {
    perfil, bens, patrimonio, votacaoZona, votacaoTerritorial,
    isLoading, error,
  } = useDossieCandidato(id || null, ano);

  const cpf = perfil?.cpf;
  const { data: historico } = useHistoricoCandidato(cpf || null);
  const nomeUrna = perfil?.candidato || perfil?.nome_urna || '';
  const { data: evolucaoPatrimonio } = useEvolucaoPatrimonio(nomeUrna);

  if (isLoading) return <ProfileSkeleton />;
  if (error) return <div className="p-8 text-center text-destructive text-sm">Erro: {(error as Error).message}</div>;
  if (!perfil) return (
    <div className="p-12 text-center space-y-3">
      <p className="text-sm text-muted-foreground">Candidato não encontrado.</p>
      <Link to="/"><Button variant="outline" size="sm"><ArrowLeft className="w-3.5 h-3.5 mr-1" />Voltar</Button></Link>
    </div>
  );

  const patrimonioTotal = Number(patrimonio?.patrimonio_total || 0);
  const totalBens = Number(patrimonio?.total_bens || 0);
  const totalVotosZona = votacaoZona.reduce((s: number, r: any) => s + Number(r.total_votos || 0), 0);

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      {/* Back */}
      <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Painel
      </Link>

      {/* ── FICHA BIOGRÁFICA ── */}
      <div className="bg-card rounded-lg border border-border/40 p-5">
        <div className="flex flex-col md:flex-row gap-5">
          {/* Avatar */}
          <div className="shrink-0 flex flex-col items-center gap-2">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold border-2"
              style={{
                backgroundColor: getAvatarColor(nomeUrna) + '30',
                color: getAvatarColor(nomeUrna),
                borderColor: getAvatarColor(nomeUrna),
              }}
            >
              {getInitial(nomeUrna)}
            </div>
            <Badge variant="outline" className="text-[10px] font-mono">
              Nº {perfil.numero}
            </Badge>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3 flex-wrap">
              <div>
                <h1 className="text-xl font-bold leading-tight">{nomeUrna}</h1>
                <p className="text-xs text-muted-foreground">{perfil.nome_completo}</p>
              </div>
              <div className="flex gap-2 items-center">
                <span
                  className="text-xs font-bold px-2 py-1 rounded"
                  style={{ backgroundColor: getPartidoCor(perfil.partido) + '20', color: getPartidoCor(perfil.partido) }}
                >
                  {perfil.partido}
                </span>
                <SituacaoBadge situacao={perfil.situacao || perfil.situacao_candidatura} />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-1 mt-3">
              <InfoRow icon={Briefcase} label="Cargo" value={perfil.cargo} />
              <InfoRow icon={MapPin} label="Município" value={perfil.municipio} />
              <InfoRow icon={Calendar} label="Idade" value={calcAge(perfil.data_nascimento)} />
              <InfoRow icon={User} label="Gênero" value={perfil.genero} />
              <InfoRow icon={GraduationCap} label="Escolaridade" value={perfil.escolaridade} />
              <InfoRow icon={Briefcase} label="Ocupação" value={perfil.ocupacao} />
              <InfoRow icon={Shield} label="CPF" value={maskCPF(cpf)} />
              <InfoRow icon={MapPin} label="Naturalidade" value={perfil.uf_nascimento} />
            </div>

            {/* Patrimônio highlight */}
            <div className="mt-3 flex items-center gap-4 p-3 bg-muted/30 rounded-md border border-border/30">
              <DollarSign className="w-5 h-5 text-warning shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Patrimônio Total Declarado</p>
                <p className="text-lg font-bold text-warning">{patrimonioTotal > 0 ? formatBRL(patrimonioTotal) : 'Não declarado'}</p>
              </div>
              <Badge variant="outline" className="text-[10px] ml-auto">{totalBens} bens</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* ── TIMELINE DE PARTIDOS ── */}
      <PartyTimeline historico={historico || []} />

      {/* ── ABAS DE DADOS ── */}
      <Tabs defaultValue="historico" className="bg-card rounded-lg border border-border/40 overflow-hidden">
        <TabsList className="w-full justify-start bg-muted/30 border-b border-border/30 rounded-none px-2 h-10">
          <TabsTrigger value="historico" className="text-xs data-[state=active]:bg-background gap-1.5">
            <History className="w-3.5 h-3.5" /> Evolução Histórica
          </TabsTrigger>
          <TabsTrigger value="territorial" className="text-xs data-[state=active]:bg-background gap-1.5">
            <Vote className="w-3.5 h-3.5" /> Força Territorial
          </TabsTrigger>
          <TabsTrigger value="patrimonio" className="text-xs data-[state=active]:bg-background gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Evolução Patrimonial
          </TabsTrigger>
        </TabsList>

        {/* ── ABA: EVOLUÇÃO HISTÓRICA ── */}
        <TabsContent value="historico" className="p-0 mt-0">
          {!historico || historico.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {cpf ? 'Nenhum histórico encontrado para este CPF.' : 'CPF não disponível para consulta histórica.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/30">
                    <TableHead className="text-[10px] font-semibold text-muted-foreground w-[60px]">Ano</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground">Cargo</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground">Município</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground w-[80px]">Partido</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground text-center w-[100px]">Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.map((h: any, i: number) => (
                    <TableRow key={i} className="border-border/20 hover:bg-muted/30">
                      <TableCell className="text-sm font-bold tabular-nums py-1.5">{h.ano}</TableCell>
                      <TableCell className="text-xs py-1.5">{h.cargo}</TableCell>
                      <TableCell className="text-xs text-muted-foreground py-1.5">{h.municipio}</TableCell>
                      <TableCell className="py-1.5">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: getPartidoCor(h.partido || h.sigla_partido) + '20', color: getPartidoCor(h.partido || h.sigla_partido) }}
                        >
                          {h.partido || h.sigla_partido}
                        </span>
                      </TableCell>
                      <TableCell className="text-center py-1.5">
                        <SituacaoBadge situacao={h.situacao || h.situacao_final} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── ABA: FORÇA TERRITORIAL (com Zona + Bairro + Escola) ── */}
        <TabsContent value="territorial" className="p-0 mt-0">
          <div className="px-4 py-2 border-b border-border/30">
            <GeoFilterBadge />
          </div>
          {votacaoTerritorial.length === 0 && votacaoZona.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Sem dados de votação territorial.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/30">
                    <TableHead className="text-[10px] font-semibold text-muted-foreground w-[50px]">#</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground w-[70px]">Zona</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground">Bairro</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground">Local de Votação (Escola)</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground text-right w-[100px]">Votos</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground text-right w-[80px]">% do Total</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground w-[140px]">Dominância</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(votacaoTerritorial.length > 0 ? votacaoTerritorial : votacaoZona)
                    .sort((a: any, b: any) => Number(b.total_votos) - Number(a.total_votos))
                    .map((z: any, i: number) => {
                      const votos = Number(z.total_votos || 0);
                      const pct = totalVotosZona > 0 ? (votos / totalVotosZona) * 100 : 0;
                      const hasBairro = z.bairro && z.bairro.trim() !== '';
                      const hasEscola = z.escola && z.escola.trim() !== '';
                      return (
                        <TableRow key={i} className="border-border/20 hover:bg-muted/30">
                          <TableCell className="text-xs text-muted-foreground font-mono tabular-nums py-1.5">{i + 1}</TableCell>
                          <TableCell className="text-sm font-medium py-1.5 tabular-nums">
                            {z.zona}
                          </TableCell>
                          <TableCell className="text-xs py-1.5">
                            {hasBairro
                              ? <span className="font-medium">{z.bairro}</span>
                              : <span className="text-muted-foreground text-[10px] italic">Não informado</span>
                            }
                          </TableCell>
                          <TableCell className="text-xs py-1.5 max-w-[220px] truncate">
                            {hasEscola
                              ? <span>{z.escola}</span>
                              : <span className="text-muted-foreground text-[10px] italic">Não informado</span>
                            }
                          </TableCell>
                          <TableCell className="text-sm font-bold text-right tabular-nums py-1.5">{formatNumber(votos)}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums text-muted-foreground py-1.5">{formatPercent(pct, 1)}</TableCell>
                          <TableCell className="py-1.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary transition-all"
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{pct.toFixed(0)}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── ABA: EVOLUÇÃO PATRIMONIAL ── */}
        <TabsContent value="patrimonio" className="p-0 mt-0">
          {/* Evolução por ano */}
          {evolucaoPatrimonio && evolucaoPatrimonio.length > 0 && (
            <div className="px-4 py-3 border-b border-border/30">
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Evolução por Eleição</h4>
              <div className="flex items-end gap-3 h-16">
                {(evolucaoPatrimonio as any[]).map((ep: any, i: number) => {
                  const max = Math.max(...(evolucaoPatrimonio as any[]).map((e: any) => e.patrimonio));
                  const h = max > 0 ? (ep.patrimonio / max) * 100 : 0;
                  return (
                    <div key={i} className="flex flex-col items-center gap-1 min-w-[50px]">
                      <span className="text-[9px] font-mono text-muted-foreground">{formatBRLCompact(ep.patrimonio)}</span>
                      <div className="w-8 bg-primary/20 rounded-t relative" style={{ height: `${Math.max(h, 4)}%` }}>
                        <div className="absolute inset-0 bg-primary/60 rounded-t" />
                      </div>
                      <span className="text-[10px] font-bold">{ep.ano}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabela de bens */}
          {bens.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhum bem declarado.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/30">
                    <TableHead className="text-[10px] font-semibold text-muted-foreground w-[40px]">#</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground w-[160px]">Tipo</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground">Descrição</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground text-right w-[120px]">Valor</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground text-right w-[70px]">% Patri.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bens.map((b: any, i: number) => {
                    const valor = Number(b.valor || 0);
                    const pct = patrimonioTotal > 0 ? (valor / patrimonioTotal) * 100 : 0;
                    return (
                      <TableRow key={i} className="border-border/20 hover:bg-muted/30">
                        <TableCell className="text-xs text-muted-foreground font-mono tabular-nums py-1.5">{b.ordem || i + 1}</TableCell>
                        <TableCell className="text-xs font-medium py-1.5 truncate max-w-[160px]">{b.tipo}</TableCell>
                        <TableCell className="text-xs text-muted-foreground py-1.5 truncate max-w-[300px]" title={b.descricao}>{b.descricao}</TableCell>
                        <TableCell className="text-sm font-bold text-right tabular-nums py-1.5">
                          {valor > 0 ? formatBRL(valor) : '—'}
                        </TableCell>
                        <TableCell className="text-[10px] text-right tabular-nums text-muted-foreground py-1.5">
                          {pct > 0 ? formatPercent(pct, 1) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Total row */}
                  <TableRow className="border-border/30 bg-muted/20 hover:bg-muted/30">
                    <TableCell colSpan={3} className="text-xs font-semibold py-2">TOTAL ({totalBens} bens)</TableCell>
                    <TableCell className="text-sm font-bold text-right tabular-nums py-2 text-warning">
                      {formatBRL(patrimonioTotal)}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums py-2">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
