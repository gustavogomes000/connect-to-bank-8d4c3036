import { useState } from 'react';
import { useRanking } from '@/hooks/useEleicoes';
import { formatNumber } from '@/lib/eleicoes';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { TableSkeleton } from '@/components/eleicoes/Skeletons';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Ranking() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState('nome_urna');
  const [sortAsc, setSortAsc] = useState(true);
  const navigate = useNavigate();

  const [timer, setTimer] = useState<any>(null);
  const handleSearch = (v: string) => {
    setSearch(v);
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => { setDebouncedSearch(v); setPage(0); }, 300));
  };

  const { data, isLoading } = useRanking(debouncedSearch, page, sortBy, sortAsc);
  const totalPages = Math.ceil((data?.count || 0) / (data?.pageSize || 20));
  const hasVotos = data?.hasVotos || false;

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortAsc(!sortAsc);
    else { setSortBy(col); setSortAsc(col === 'nome_urna'); }
  };

  const SortHeader = ({ col, label, className = '' }: { col: string; label: string; className?: string }) => (
    <th
      className={`pb-2.5 pt-2.5 px-2 font-medium text-muted-foreground cursor-pointer hover:text-primary select-none text-xs ${className}`}
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sortBy === col ? 'text-primary' : 'opacity-30'}`} />
      </span>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          Ranking de Candidatos
        </h1>
        <span className="text-xs text-muted-foreground">{formatNumber(data?.count || 0)} registros</span>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar por nome..."
          className="pl-9 h-9 text-sm bg-muted/50 border-border/50"
        />
      </div>

      {isLoading ? <TableSkeleton /> : (
        <div className="bg-card rounded-lg border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs table-striped">
              <thead>
                <tr className="border-b border-border/30 text-left bg-muted/30">
                  <th className="px-3 pb-2.5 pt-2.5 font-medium text-muted-foreground w-8">#</th>
                  <th className="pb-2.5 pt-2.5 font-medium text-muted-foreground w-8"></th>
                  <SortHeader col="nome_urna" label="Nome" />
                  <SortHeader col="numero_urna" label="Nº" />
                  <SortHeader col="sigla_partido" label="Partido" />
                  <SortHeader col="cargo" label="Cargo" />
                  <SortHeader col="municipio" label="Município" />
                  <th className="pb-2.5 pt-2.5 px-2 font-medium text-muted-foreground text-xs">Situação</th>
                  {hasVotos && <SortHeader col="nome_urna" label="Votos" />}
                </tr>
              </thead>
              <tbody>
                {(data?.data || []).map((r: any, idx: number) => {
                  const pos = page * 20 + idx + 1;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border/20 last:border-0 cursor-pointer hover:bg-primary/5 transition-colors"
                      onClick={() => navigate(`/candidato/${r.id}`)}
                    >
                      <td className="px-3 py-2 font-medium text-muted-foreground">{pos}</td>
                      <td className="py-2"><CandidatoAvatar nome={r.nome_urna || r.nome_completo} fotoUrl={r.foto_url} size={28} /></td>
                      <td className="py-2 px-2 font-medium">{r.nome_urna || r.nome_completo}</td>
                      <td className="py-2 px-2">{r.numero_urna}</td>
                      <td className="py-2 px-2">{r.sigla_partido}</td>
                      <td className="py-2 px-2">{r.cargo}</td>
                      <td className="py-2 px-2">{r.municipio}</td>
                      <td className="py-2 px-2"><SituacaoBadge situacao={r.situacao_final} /></td>
                      {hasVotos && <td className="py-2 px-2 font-semibold text-primary">{formatNumber(r.total_votos)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
            <span className="text-xs text-muted-foreground">
              Página {page + 1} de {totalPages || 1}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} className="h-7 px-2">
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="h-7 px-2">
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
