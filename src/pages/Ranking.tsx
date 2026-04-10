import { useNavigate } from 'react-router-dom';
import { useRankingMD } from '@/hooks/useRanking';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { formatNumber, formatBRLCompact, getPartidoCor, getSituacaoBadge } from '@/lib/eleicoes';
import { Trophy, TrendingUp, Users, Landmark } from 'lucide-react';
import { useFilterStore } from '@/stores/filterStore';
import { Card, CardContent } from '@/components/ui/card';
import { useMemo } from 'react';
import { LoadingKPIs, LoadingTable } from '@/components/eleicoes/LoadingSection';

function KPI({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <Card className="bg-card border-border/50">
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-foreground">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Ranking() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useRankingMD();
  const { ano, municipio } = useFilterStore();

  const stats = useMemo(() => {
    if (!data?.length) return null;
    const totalVotos = data.reduce((s, d) => s + d.total_votos, 0);
    const totalPatrimonio = data.reduce((s, d) => s + d.patrimonio_total, 0);
    const partidos = new Set(data.map(d => d.SG_PARTIDO)).size;
    const eleitos = data.filter(d => {
      const s = (d.DS_SIT_TOT_TURNO || '').toUpperCase();
      return s.includes('ELEITO') && !s.includes('NÃO');
    }).length;
    return { totalVotos, totalPatrimonio, partidos, eleitos, total: data.length };
  }, [data]);

  return (
    <div className="space-y-4 max-w-[1800px] mx-auto">
      <div>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          Ranking de Candidatos
        </h1>
        <p className="text-xs text-muted-foreground">{municipio} · {ano} — Ranking por votos com patrimônio e situação</p>
      </div>

      {isLoading ? (
        <LoadingKPIs count={4} />
      ) : stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPI icon={Users} label="Candidatos" value={formatNumber(stats.total)} sub={`${stats.partidos} partidos`} />
          <KPI icon={TrendingUp} label="Total de Votos" value={formatNumber(stats.totalVotos)} />
          <KPI icon={Landmark} label="Patrimônio Total" value={formatBRLCompact(stats.totalPatrimonio)} />
          <KPI icon={Trophy} label="Eleitos" value={formatNumber(stats.eleitos)} sub={`de ${stats.total} candidatos`} />
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{(error as Error).message || 'Falha ao carregar ranking.'}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <LoadingTable rows={15} cols={8} />
      ) : (
        <div className="bg-card rounded-lg border border-border/50 overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <Table className="w-full text-sm table-auto">
              <TableHeader>
                <TableRow className="bg-muted/30 border-b border-border/30 text-left">
                  <TableHead className="px-2 py-2 w-8 text-[10px] uppercase tracking-wider">#</TableHead>
                  <TableHead className="px-2 py-2 text-[10px] uppercase tracking-wider">Candidato</TableHead>
                  <TableHead className="px-2 py-2 text-[10px] uppercase tracking-wider">Partido</TableHead>
                  <TableHead className="px-2 py-2 text-[10px] uppercase tracking-wider">Cargo</TableHead>
                  <TableHead className="px-2 py-2 text-[10px] uppercase tracking-wider">Município</TableHead>
                  <TableHead className="px-2 py-2 text-[10px] uppercase tracking-wider">Situação</TableHead>
                  <TableHead className="px-2 py-2 text-[10px] uppercase tracking-wider text-right">Patrimônio</TableHead>
                  <TableHead className="px-2 py-2 text-[10px] uppercase tracking-wider text-right">Votos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data && data.map((item, idx) => {
                  const sit = getSituacaoBadge(item.DS_SIT_TOT_TURNO);
                  return (
                    <TableRow
                      key={item.SQ_CANDIDATO ?? idx}
                      className="border-b border-border/20 hover:bg-primary/5 cursor-pointer transition-colors"
                      onClick={() => navigate(`/candidatos/${item.SQ_CANDIDATO}/${ano}`)}
                    >
                      <TableCell className="px-2 py-1.5 text-muted-foreground font-mono text-xs">{idx + 1}</TableCell>
                      <TableCell className="px-2 py-1.5">
                        <div>
                          <span className="font-semibold text-foreground">{item.NM_URNA_CANDIDATO}</span>
                          <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{item.NM_CANDIDATO}</p>
                          {item.tem_segundo_turno && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium">
                                1º T: {formatNumber(item.votos_turno1)}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">
                                2º T: {formatNumber(item.votos_turno2)}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
                                Total: {formatNumber(item.total_votos)}
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-1.5">
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: getPartidoCor(item.SG_PARTIDO) + '20', color: getPartidoCor(item.SG_PARTIDO) }}>
                          {item.SG_PARTIDO}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">{item.DS_CARGO}</TableCell>
                      <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">{item.NM_UE}</TableCell>
                      <TableCell className="px-2 py-1.5">
                        <Badge className={`text-[9px] ${sit.bg} ${sit.text} border-0`}>{sit.label}</Badge>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-right text-xs font-mono text-muted-foreground">
                        {item.patrimonio_total > 0 ? formatBRLCompact(item.patrimonio_total) : '—'}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-right font-bold text-primary">
                        {formatNumber(item.total_votos)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {data && data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhum candidato encontrado com os filtros atuais.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {data && data.length > 0 && (
        <p className="text-[10px] text-muted-foreground text-right">
          {data.length} candidatos · Fonte: TSE/MotherDuck · {ano}
        </p>
      )}
    </div>
  );
}
