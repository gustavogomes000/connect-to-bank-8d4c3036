import { useState, useMemo } from 'react';
import { formatNumber, formatPercent } from '@/lib/eleicoes';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, MapPin, Hash, School } from 'lucide-react';

export interface VotosRegionalRow {
  zona: number | string;
  bairro?: string;
  escola?: string;
  total_votos: number | string;
  secoes?: number | string;
  [key: string]: any;
}

type VotosRegionalRowInput = Record<string, any>;

interface VotosRegionalTableProps {
  data: VotosRegionalRowInput[];
  isLoading?: boolean;
  title?: string;
  showBairro?: boolean;
  showEscola?: boolean;
  pageSize?: number;
  emptyMessage?: string;
}

const PAGE_SIZE_DEFAULT = 25;

function NaoInformado() {
  return <span className="text-muted-foreground text-[10px] italic">Não informado</span>;
}

export function VotosRegionalTable({
  data,
  isLoading,
  title = 'Distribuição Regional de Votos',
  showBairro = true,
  showEscola = true,
  pageSize = PAGE_SIZE_DEFAULT,
  emptyMessage = 'Nenhum dado regional disponível.',
}: VotosRegionalTableProps) {
  const [page, setPage] = useState(0);

  const sorted = useMemo(
    () => [...data].sort((a, b) => Number(b.total_votos) - Number(a.total_votos)),
    [data]
  );

  const totalVotos = useMemo(
    () => sorted.reduce((s, r) => s + Number(r.total_votos || 0), 0),
    [sorted]
  );

  const totalPages = Math.ceil(sorted.length / pageSize);
  const pageData = sorted.slice(page * pageSize, (page + 1) * pageSize);

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg border border-border/40 p-4 space-y-2">
        <Skeleton className="h-4 w-48" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border/40 p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border/40 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-primary" />
          <h3 className="text-sm font-semibold">{title}</h3>
          <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono">
            {sorted.length} regiões
          </Badge>
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-mono bg-primary/10 text-primary">
            {formatNumber(totalVotos)} votos
          </Badge>
        </div>
        {totalPages > 1 && (
          <span className="text-[10px] text-muted-foreground">
            Pág. {page + 1}/{totalPages}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/30">
              <TableHead className="text-[10px] font-semibold text-muted-foreground w-[40px]">#</TableHead>
              <TableHead className="text-[10px] font-semibold text-muted-foreground w-[70px]">
                <span className="inline-flex items-center gap-1"><Hash className="w-3 h-3" />Zona</span>
              </TableHead>
              {showBairro && (
                <TableHead className="text-[10px] font-semibold text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />Bairro</span>
                </TableHead>
              )}
              {showEscola && (
                <TableHead className="text-[10px] font-semibold text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><School className="w-3 h-3" />Local de Votação</span>
                </TableHead>
              )}
              {data.some(r => r.secoes) && (
                <TableHead className="text-[10px] font-semibold text-muted-foreground text-center w-[60px]">Seções</TableHead>
              )}
              <TableHead className="text-[10px] font-semibold text-muted-foreground text-right w-[90px]">Votos</TableHead>
              <TableHead className="text-[10px] font-semibold text-muted-foreground text-right w-[60px]">%</TableHead>
              <TableHead className="text-[10px] font-semibold text-muted-foreground w-[120px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.map((row, idx) => {
              const votos = Number(row.total_votos || 0);
              const pct = totalVotos > 0 ? (votos / totalVotos) * 100 : 0;
              const pos = page * pageSize + idx + 1;
              const hasBairro = row.bairro && row.bairro.trim() !== '';
              const hasEscola = row.escola && row.escola.trim() !== '';

              return (
                <TableRow key={idx} className="border-border/20 hover:bg-muted/30 transition-colors">
                  <TableCell className="text-xs text-muted-foreground font-mono tabular-nums py-1.5">{pos}</TableCell>
                  <TableCell className="text-sm font-semibold tabular-nums py-1.5">{row.zona}</TableCell>
                  {showBairro && (
                    <TableCell className="text-xs py-1.5">
                      {hasBairro ? <span className="font-medium">{row.bairro}</span> : <NaoInformado />}
                    </TableCell>
                  )}
                  {showEscola && (
                    <TableCell className="text-xs py-1.5 max-w-[200px] truncate" title={hasEscola ? row.escola : undefined}>
                      {hasEscola ? row.escola : <NaoInformado />}
                    </TableCell>
                  )}
                  {data.some(r => r.secoes) && (
                    <TableCell className="text-xs text-center tabular-nums text-muted-foreground py-1.5">
                      {row.secoes || '—'}
                    </TableCell>
                  )}
                  <TableCell className="text-sm font-bold text-right tabular-nums py-1.5">
                    {formatNumber(votos)}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-muted-foreground py-1.5">
                    {formatPercent(pct, 1)}
                  </TableCell>
                  <TableCell className="py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-muted-foreground w-7 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-2 border-t border-border/30 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} de {sorted.length}
          </p>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7 w-7 p-0">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-7 w-7 p-0">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
