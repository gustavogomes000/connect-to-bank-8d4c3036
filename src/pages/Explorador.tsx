import { useState, useMemo } from 'react';
import { useExplorador } from '@/hooks/useEleicoes';
import { formatNumber } from '@/lib/eleicoes';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { TableSkeleton } from '@/components/eleicoes/Skeletons';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ArrowUpDown, Database, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const COLUMNS = [
  { key: 'nome_urna', label: 'Nome Urna', width: 'min-w-[160px]' },
  { key: 'numero_urna', label: 'Nº', width: 'min-w-[60px]' },
  { key: 'sigla_partido', label: 'Partido', width: 'min-w-[80px]' },
  { key: 'cargo', label: 'Cargo', width: 'min-w-[120px]' },
  { key: 'municipio', label: 'Município', width: 'min-w-[140px]' },
  { key: 'ano', label: 'Ano', width: 'min-w-[60px]' },
  { key: 'genero', label: 'Gênero', width: 'min-w-[90px]' },
  { key: 'grau_instrucao', label: 'Escolaridade', width: 'min-w-[160px]' },
  { key: 'ocupacao', label: 'Ocupação', width: 'min-w-[160px]' },
  { key: 'situacao_final', label: 'Situação', width: 'min-w-[120px]' },
];

export default function Explorador() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState('nome_urna');
  const [sortAsc, setSortAsc] = useState(true);
  const [visibleCols, setVisibleCols] = useState<string[]>(COLUMNS.map(c => c.key));
  const navigate = useNavigate();

  const { data, isLoading } = useExplorador(page, pageSize, sortBy, sortAsc);
  const totalPages = Math.ceil((data?.count || 0) / pageSize);

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortAsc(!sortAsc);
    else { setSortBy(col); setSortAsc(col === 'nome_urna'); }
  };

  const toggleCol = (col: string) => {
    setVisibleCols(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  };

  const activeCols = COLUMNS.filter(c => visibleCols.includes(c.key));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Explorador de Dados
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatNumber(data?.count || 0)} registros — use os filtros globais para refinar
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={pageSize.toString()} onValueChange={v => { setPageSize(parseInt(v)); setPage(0); }}>
            <SelectTrigger className="w-[100px] h-8 text-xs bg-muted/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 / pág</SelectItem>
              <SelectItem value="25">25 / pág</SelectItem>
              <SelectItem value="50">50 / pág</SelectItem>
              <SelectItem value="100">100 / pág</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Column toggles */}
      <div className="flex flex-wrap gap-1">
        {COLUMNS.map(col => (
          <button
            key={col.key}
            onClick={() => toggleCol(col.key)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              visibleCols.includes(col.key)
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-muted/50 text-muted-foreground border border-border/30'
            }`}
          >
            {col.label}
          </button>
        ))}
      </div>

      {isLoading ? <TableSkeleton /> : (
        <div className="bg-card rounded-lg border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs table-striped">
              <thead>
                <tr className="border-b border-border/30 bg-muted/30">
                  <th className="px-3 py-2.5 font-medium text-muted-foreground w-8">#</th>
                  <th className="py-2.5 font-medium text-muted-foreground w-8"></th>
                  {activeCols.map(col => (
                    <th
                      key={col.key}
                      className={`py-2.5 px-2 font-medium text-muted-foreground cursor-pointer hover:text-primary select-none ${col.width}`}
                      onClick={() => toggleSort(col.key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <ArrowUpDown className={`w-3 h-3 ${sortBy === col.key ? 'text-primary' : 'opacity-30'}`} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.data || []).map((r: any, idx: number) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/20 last:border-0 cursor-pointer hover:bg-primary/5 transition-colors"
                    onClick={() => navigate(`/candidato/${r.id}`)}
                  >
                    <td className="px-3 py-2 text-muted-foreground">{page * pageSize + idx + 1}</td>
                    <td className="py-2"><CandidatoAvatar nome={r.nome_urna || r.nome_completo} fotoUrl={r.foto_url} size={24} /></td>
                    {activeCols.map(col => (
                      <td key={col.key} className="py-2 px-2">
                        {col.key === 'situacao_final' ? (
                          <SituacaoBadge situacao={r[col.key]} />
                        ) : (
                          <span className={col.key === 'nome_urna' ? 'font-medium' : ''}>
                            {r[col.key] ?? '—'}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
            <span className="text-xs text-muted-foreground">
              {formatNumber(data?.count || 0)} resultados — Página {page + 1} de {totalPages || 1}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(0)} className="h-7 text-xs px-2">
                ««
              </Button>
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} className="h-7 px-2">
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="h-7 px-2">
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)} className="h-7 text-xs px-2">
                »»
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
