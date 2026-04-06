import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { mdQuery } from '@/lib/motherduck';
import { formatNumber } from '@/lib/eleicoes';
import { Database, Table2, Search, ChevronLeft, ChevronRight, ArrowUpDown, Loader2, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MDTable { name: string; count: number; }

function useMotherDuckTables() {
  return useQuery<MDTable[]>({
    queryKey: ['md-tables'],
    queryFn: async () => {
      const rows = await mdQuery<{table_name: string}>(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_catalog = 'my_db' ORDER BY table_name`);
      const tables: MDTable[] = [];
      for (const r of rows) {
        try {
          const [c] = await mdQuery<{total: string}>(`SELECT count(*) as total FROM my_db.${r.table_name}`);
          tables.push({ name: r.table_name, count: Number(c?.total || 0) });
        } catch {
          tables.push({ name: r.table_name, count: 0 });
        }
      }
      return tables.filter(t => t.count > 0).sort((a, b) => b.count - a.count);
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useMotherDuckSchema(table: string | null) {
  return useQuery({
    queryKey: ['md-schema', table],
    queryFn: async () => {
      if (!table) return [];
      const rows = await mdQuery<{column_name: string; data_type: string}>(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table}' AND table_catalog = 'my_db' ORDER BY ordinal_position`
      );
      return rows;
    },
    enabled: !!table,
    staleTime: 10 * 60 * 1000,
  });
}

function useMotherDuckData(table: string | null, limit: number, offset: number, orderBy: string | null, desc: boolean, searchCol: string, searchVal: string) {
  return useQuery({
    queryKey: ['md-data', table, limit, offset, orderBy, desc, searchCol, searchVal],
    queryFn: async () => {
      if (!table) return null;
      const where = searchCol && searchVal ? `WHERE CAST(${searchCol} AS VARCHAR) ILIKE '%${searchVal.replace(/'/g, "''")}%'` : '';
      const order = orderBy ? `ORDER BY ${orderBy} ${desc ? 'DESC' : 'ASC'}` : '';
      const [countRes, dataRes] = await Promise.all([
        mdQuery<{total: string}>(`SELECT count(*) as total FROM my_db.${table} ${where}`),
        mdQuery(`SELECT * FROM my_db.${table} ${where} ${order} LIMIT ${limit} OFFSET ${offset}`),
      ]);
      const total = Number(countRes[0]?.total || 0);
      const colunas = dataRes.length > 0 ? Object.keys(dataRes[0]) : [];
      return { total, colunas, linhas: dataRes };
    },
    enabled: !!table,
    staleTime: 60 * 1000,
  });
}

export default function Explorador() {
  const { data: tabelas, isLoading: loadingTabelas } = useMotherDuckTables();
  const [tabelaSelecionada, setTabelaSelecionada] = useState<string | null>(null);
  const [pagina, setPagina] = useState(0);
  const [limite, setLimite] = useState(50);
  const [ordenar, setOrdenar] = useState<string | null>(null);
  const [ordemDesc, setOrdemDesc] = useState(false);
  const [buscaColuna, setBuscaColuna] = useState('');
  const [buscaValor, setBuscaValor] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState<{coluna: string; valor: string} | undefined>();
  const [filtroTabela, setFiltroTabela] = useState('');

  const { data: schema } = useMotherDuckSchema(tabelaSelecionada);
  const { data: resultado, isLoading: loadingQuery, isFetching } = useMotherDuckData(
    tabelaSelecionada, limite, pagina * limite, ordenar, ordemDesc,
    buscaAtiva?.coluna || '', buscaAtiva?.valor || ''
  );

  const tabelasFiltradas = useMemo(() => {
    if (!tabelas) return [];
    if (!filtroTabela) return tabelas;
    return tabelas.filter(t => t.name.toLowerCase().includes(filtroTabela.toLowerCase()));
  }, [tabelas, filtroTabela]);

  const totalPaginas = resultado ? Math.ceil(resultado.total / limite) : 0;

  function selecionarTabela(nome: string) {
    setTabelaSelecionada(nome); setPagina(0); setOrdenar(null); setOrdemDesc(false);
    setBuscaAtiva(undefined); setBuscaColuna(''); setBuscaValor('');
  }

  function toggleOrdem(col: string) {
    if (ordenar === col) setOrdemDesc(!ordemDesc);
    else { setOrdenar(col); setOrdemDesc(false); }
    setPagina(0);
  }

  function executarBusca() {
    if (buscaColuna && buscaValor) { setBuscaAtiva({ coluna: buscaColuna, valor: buscaValor }); setPagina(0); }
  }

  function limparBusca() {
    setBuscaAtiva(undefined); setBuscaColuna(''); setBuscaValor(''); setPagina(0);
  }

  return (
    <div className="flex gap-3 h-[calc(100vh-7rem)]">
      <div className="w-64 shrink-0 bg-card rounded-lg border border-border/50 flex flex-col">
        <div className="p-3 border-b border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">MotherDuck Explorer</span>
          </div>
          <Input placeholder="Filtrar tabelas..." value={filtroTabela} onChange={e => setFiltroTabela(e.target.value)} className="h-7 text-xs" />
        </div>
        <ScrollArea className="flex-1">
          <div className="p-1">
            {loadingTabelas ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : (
              tabelasFiltradas.map(t => (
                <button key={t.name} onClick={() => selecionarTabela(t.name)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent/50 transition-colors flex items-center justify-between group ${tabelaSelecionada === t.name ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
                  <span className="flex items-center gap-1.5 truncate"><Table2 className="w-3 h-3 shrink-0" /><span className="truncate">{t.name}</span></span>
                  <span className="text-[10px] opacity-60 shrink-0">{formatNumber(t.count)}</span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
        <div className="p-2 border-t border-border/30 text-[10px] text-muted-foreground text-center">
          {tabelas?.length || 0} tabelas • {tabelas?.reduce((s, t) => s + t.count, 0)?.toLocaleString('pt-BR')} registros
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-card rounded-lg border border-border/50">
        {!tabelaSelecionada ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Database className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Selecione uma tabela</p>
              <p className="text-xs mt-1">Clique em uma tabela à esquerda para explorar os dados</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-3 border-b border-border/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Table2 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">{tabelaSelecionada}</span>
                  {resultado && <Badge variant="secondary" className="text-[10px]">{formatNumber(resultado.total)} registros</Badge>}
                  {isFetching && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                </div>
                <Select value={String(limite)} onValueChange={v => { setLimite(Number(v)); setPagina(0); }}>
                  <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[25, 50, 100, 200, 500].map(n => <SelectItem key={n} value={String(n)} className="text-xs">{n} linhas</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-3 h-3 text-muted-foreground shrink-0" />
                {schema && (
                  <Select value={buscaColuna} onValueChange={setBuscaColuna}>
                    <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="Coluna..." /></SelectTrigger>
                    <SelectContent>
                      {schema.map(c => <SelectItem key={c.column_name} value={c.column_name} className="text-xs">{c.column_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Input placeholder="Buscar valor..." value={buscaValor} onChange={e => setBuscaValor(e.target.value)} onKeyDown={e => e.key === 'Enter' && executarBusca()} className="h-7 text-xs flex-1 max-w-xs" />
                <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={executarBusca} disabled={!buscaColuna || !buscaValor}>
                  <Search className="w-3 h-3 mr-1" />Buscar
                </Button>
                {buscaAtiva && <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-destructive" onClick={limparBusca}><X className="w-3 h-3 mr-1" />Limpar</Button>}
              </div>

              {schema && (
                <div className="flex flex-wrap gap-1">
                  {schema.slice(0, 20).map(c => (
                    <Badge key={c.column_name} variant="outline" className="text-[9px] py-0 px-1.5 font-mono">
                      {c.column_name}<span className="ml-1 text-muted-foreground">{c.data_type}</span>
                    </Badge>
                  ))}
                  {schema.length > 20 && <Badge variant="outline" className="text-[9px] py-0 px-1.5">+{schema.length - 20}</Badge>}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto">
              {loadingQuery ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">Consultando MotherDuck...</span>
                </div>
              ) : resultado && resultado.linhas.length > 0 ? (
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground border-b border-border/30 w-10">#</th>
                      {resultado.colunas.map(col => (
                        <th key={col} className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground border-b border-border/30 cursor-pointer hover:text-foreground whitespace-nowrap" onClick={() => toggleOrdem(col)}>
                          <span className="flex items-center gap-1">{col}{ordenar === col && <ArrowUpDown className={`w-2.5 h-2.5 text-primary ${ordemDesc ? 'rotate-180' : ''}`} />}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.linhas.map((row: any, i: number) => (
                      <tr key={i} className="border-b border-border/10 hover:bg-accent/20 transition-colors">
                        <td className="px-2 py-1 text-[10px] text-muted-foreground">{pagina * limite + i + 1}</td>
                        {resultado.colunas.map(col => (
                          <td key={col} className="px-2 py-1 max-w-[200px] truncate" title={String(row[col] ?? '')}>
                            {row[col] != null ? String(row[col]) : <span className="text-muted-foreground/40">null</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Nenhum resultado encontrado</div>
              )}
            </div>

            {resultado && resultado.total > limite && (
              <div className="p-2 border-t border-border/30 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{formatNumber(pagina * limite + 1)}–{formatNumber(Math.min((pagina + 1) * limite, resultado.total))} de {formatNumber(resultado.total)}</span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-6 px-2" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}><ChevronLeft className="w-3 h-3" /></Button>
                  <span className="text-muted-foreground px-2">{pagina + 1} / {totalPaginas}</span>
                  <Button size="sm" variant="ghost" className="h-6 px-2" disabled={pagina >= totalPaginas - 1} onClick={() => setPagina(p => p + 1)}><ChevronRight className="w-3 h-3" /></Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
