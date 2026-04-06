import { useState } from 'react';
import { useRanking, useDataAvailability } from '@/hooks/useEleicoes';
import { formatNumber } from '@/lib/eleicoes';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { TableSkeleton } from '@/components/eleicoes/Skeletons';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, Trophy, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getPartidoCor } from '@/lib/eleicoes';

export default function Ranking() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState('nome_urna');
  const [sortAsc, setSortAsc] = useState(true);
  const [pageSize, setPageSize] = useState(30);
  const navigate = useNavigate();
  const { data: availability } = useDataAvailability();

  const [timer, setTimer] = useState<any>(null);
  const handleSearch = (v: string) => {
    setSearch(v);
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => { setDebouncedSearch(v); setPage(0); }, 300));
  };

  const { data, isLoading } = useRanking(debouncedSearch, page, sortBy, sortAsc);
  const totalPages = Math.ceil((data?.count || 0) / pageSize);
  const hasVotos = data?.hasVotos || false;

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortAsc(!sortAsc);
    else { setSortBy(col); setSortAsc(col === 'nome_urna'); }
  };

  const SortHeader = ({ col, label, className = '' }: { col: string; label: string; className?: string }) => (
    <th
      className={`pb-2 pt-2 px-2 font-medium text-muted-foreground cursor-pointer hover:text-primary select-none text-[10px] uppercase tracking-wider whitespace-nowrap ${className}`}
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <ArrowUpDown className={`w-2.5 h-2.5 ${sortBy === col ? 'text-primary' : 'opacity-30'}`} />
      </span>
    </th>
  );

  return (
    <div className="space-y-3 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          Ranking de Candidatos
        </h1>
        <span className="text-xs text-muted-foreground">{formatNumber(data?.count || 0)} registros</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar por nome..."
            className="pl-9 h-8 text-xs bg-muted/50 border-border/50"
          />
        </div>
        <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(0); }}>
          <SelectTrigger className="w-24 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[20, 30, 50, 100].map(n => <SelectItem key={n} value={String(n)} className="text-xs">{n} por pág</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <TableSkeleton /> : (
        <div className="bg-card rounded-lg border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs table-striped">
              <thead>
                <tr className="border-b border-border/30 text-left bg-muted/30">
                  <th className="px-2 pb-2 pt-2 font-medium text-muted-foreground w-8 text-[10px]">#</th>
                  <th className="pb-2 pt-2 font-medium text-muted-foreground w-8"></th>
                  <SortHeader col="nome_urna" label="Nome" />
                  <SortHeader col="numero_urna" label="Nº" />
                  <SortHeader col="sigla_partido" label="Partido" />
                  <SortHeader col="cargo" label="Cargo" />
                  <SortHeader col="municipio" label="Município" />
                  <SortHeader col="ano" label="Ano" />
                  <th className="pb-2 pt-2 px-2 font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Situação</th>
                  {hasVotos && <SortHeader col="nome_urna" label="Votos" className="text-right" />}
                </tr>
              </thead>
              <tbody>
                {(data?.data || []).map((r: any, idx: number) => {
                  const pos = page * pageSize + idx + 1;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border/20 last:border-0 cursor-pointer hover:bg-primary/5 transition-colors"
                      onClick={() => navigate(`/candidato/${r.id}`)}
                    >
                      <td className="px-2 py-1.5 font-medium text-muted-foreground">{pos}</td>
                      <td className="py-1.5"><CandidatoAvatar nome={r.nome_urna || r.nome_completo} fotoUrl={r.foto_url} size={26} /></td>
                      <td className="py-1.5 px-2 font-medium">{r.nome_urna || r.nome_completo}</td>
                      <td className="py-1.5 px-2 font-mono text-muted-foreground">{r.numero_urna}</td>
                      <td className="py-1.5 px-2 font-semibold" style={{ color: getPartidoCor(r.sigla_partido) }}>{r.sigla_partido}</td>
                      <td className="py-1.5 px-2">{r.cargo}</td>
                      <td className="py-1.5 px-2">{r.municipio}</td>
                      <td className="py-1.5 px-2 text-muted-foreground">{r.ano}</td>
                      <td className="py-1.5 px-2"><SituacaoBadge situacao={r.situacao_final} /></td>
                      {hasVotos && <td className="py-1.5 px-2 text-right font-semibold text-primary metric-value">{formatNumber(r.total_votos)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-3 py-2 border-t border-border/30">
            <span className="text-[10px] text-muted-foreground">
              {formatNumber(page * pageSize + 1)}–{formatNumber(Math.min((page + 1) * pageSize, data?.count || 0))} de {formatNumber(data?.count || 0)}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} className="h-6 px-2">
                <ChevronLeft className="w-3 h-3" />
              </Button>
              <span className="text-[10px] text-muted-foreground px-2 flex items-center">
                {page + 1} / {totalPages || 1}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="h-6 px-2">
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
