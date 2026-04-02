import { useState, useMemo } from 'react';
import { useRanking } from '@/hooks/useEleicoes';
import { formatNumber } from '@/lib/eleicoes';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { TableSkeleton } from '@/components/eleicoes/Skeletons';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Ranking() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState('total_votos');
  const [sortAsc, setSortAsc] = useState(false);
  const navigate = useNavigate();

  const [timer, setTimer] = useState<any>(null);
  const handleSearch = (v: string) => {
    setSearch(v);
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => { setDebouncedSearch(v); setPage(0); }, 300));
  };

  const { data, isLoading } = useRanking(debouncedSearch, page, sortBy, sortAsc);
  const totalPages = Math.ceil((data?.count || 0) / (data?.pageSize || 20));

  const maxVotos = useMemo(() => {
    if (!data?.data?.length) return 1;
    return Math.max(...data.data.map((r: any) => r.total_votos || 0));
  }, [data]);

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortAsc(!sortAsc);
    else { setSortBy(col); setSortAsc(false); }
  };

  const SortHeader = ({ col, label }: { col: string; label: string }) => (
    <th
      className="pb-3 font-medium cursor-pointer hover:text-primary select-none"
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className="w-3 h-3" />
      </span>
    </th>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Ranking de Candidatos</h1>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar candidato por nome..."
          className="pl-9 h-10"
        />
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-striped">
              <thead>
                <tr className="border-b text-left bg-muted/50">
                  <th className="px-4 pb-3 pt-3 font-medium w-10">#</th>
                  <th className="pb-3 pt-3 font-medium w-12"></th>
                  <SortHeader col="nome_candidato" label="Nome" />
                  <SortHeader col="numero_urna" label="Número" />
                  <SortHeader col="sigla_partido" label="Partido" />
                  <SortHeader col="cargo" label="Cargo" />
                  <SortHeader col="municipio" label="Município" />
                  <SortHeader col="total_votos" label="Votos" />
                </tr>
              </thead>
              <tbody>
                {(data?.data || []).map((r: any, idx: number) => {
                  const pos = page * 20 + idx + 1;
                  const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos.toString();
                  return (
                    <tr
                      key={r.id}
                      className="border-b last:border-0 cursor-pointer hover:bg-primary/5 transition-colors"
                      onClick={() => navigate(`/candidato/${r.id}`)}
                    >
                      <td className="px-4 py-3 font-medium">{medal}</td>
                      <td className="py-3">
                        <CandidatoAvatar nome={r.nome_candidato} size={36} />
                      </td>
                      <td className="py-3 font-medium">{r.nome_candidato}</td>
                      <td className="py-3">{r.numero_urna}</td>
                      <td className="py-3">{r.sigla_partido}</td>
                      <td className="py-3">{r.cargo}</td>
                      <td className="py-3">{r.municipio}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium whitespace-nowrap">{formatNumber(r.total_votos)}</span>
                          <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${((r.total_votos || 0) / maxVotos) * 100}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-muted-foreground">
              {formatNumber(data?.count || 0)} resultados — Página {page + 1} de {totalPages || 1}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
