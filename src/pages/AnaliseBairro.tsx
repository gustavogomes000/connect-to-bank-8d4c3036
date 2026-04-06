import { useState, useMemo } from 'react';
import { useVotosPorBairro, useVotosPorLocal, useMunicipios, useDataAvailability } from '@/hooks/useEleicoes';
import { formatNumber, formatPercent } from '@/lib/eleicoes';
import { ANOS_DISPONIVEIS } from '@/lib/eleicoes';
import { KPISkeleton, TableSkeleton } from '@/components/eleicoes/Skeletons';
import { DataPendingCard } from '@/components/eleicoes/DataPendingCard';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Search, MapPin, School } from 'lucide-react';
import { Pagination } from '@/components/eleicoes/Pagination';

export default function AnaliseBairro() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string>('GOIÂNIA');
  const [anoFiltro, setAnoFiltro] = useState<number | null>(null);
  const [bairroSelecionado, setBairroSelecionado] = useState<string | null>(null);
  const [bairroPage, setBairroPage] = useState(0);
  const [bairroPageSize, setBairroPageSize] = useState(30);
  const [localPage, setLocalPage] = useState(0);
  const [localPageSize, setLocalPageSize] = useState(30);
  const { data: municipios } = useMunicipios();
  const { data: availability } = useDataAvailability();

  const filtered = (municipios || []).filter((m) =>
    m.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8);

  const hasSecaoData = availability?.comparecimentoSecao;

  const { data: bairros, isLoading: loadingBairros } = useVotosPorBairro(selected, anoFiltro || undefined);
  const { data: locais, isLoading: loadingLocais } = useVotosPorLocal(selected, anoFiltro || undefined, bairroSelecionado || undefined);

  const chartData = (bairros || []).slice(0, 15).map(b => ({
    bairro: b.bairro.length > 20 ? b.bairro.slice(0, 18) + '…' : b.bairro,
    eleitorado: b.apto,
    comparecimento: b.comp,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <h1 className="text-2xl font-bold">Análise por Bairro</h1>
        <div className="flex gap-2 ml-auto">
          <Select value={anoFiltro?.toString() || 'todos'} onValueChange={v => setAnoFiltro(v === 'todos' ? null : parseInt(v))}>
            <SelectTrigger className="w-[120px] h-9 text-sm">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {ANOS_DISPONIVEIS.map(a => <SelectItem key={a} value={a.toString()}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Município selector */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search || selected}
          onChange={e => { setSearch(e.target.value); }}
          onFocus={() => setSearch('')}
          placeholder="Buscar município..."
          className="pl-9"
        />
        {search && filtered.length > 0 && (
          <div className="absolute top-full mt-1 w-full bg-card border rounded-lg shadow-lg z-10 max-h-60 overflow-auto">
            {filtered.map(m => (
              <button key={m} className="w-full px-4 py-2 text-left hover:bg-muted text-sm" onClick={() => { setSelected(m); setSearch(''); setBairroSelecionado(null); }}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="text-sm text-muted-foreground flex items-center gap-1">
        <MapPin className="w-4 h-4" /> Analisando: <span className="font-semibold text-foreground">{selected}</span>
        {bairros && bairros.length > 0 && <span>— {bairros.length} bairros encontrados</span>}
      </div>

      {!hasSecaoData ? (
        <DataPendingCard
          titulo="Dados de bairro não disponíveis"
          tabela="bd_eleicoes_comparecimento_secao"
          descricao="Os dados de comparecimento por seção (bairro e local de votação) precisam ser importados para esta visualização funcionar."
        />
      ) : (
        <Tabs defaultValue="bairros" className="space-y-4">
          <TabsList>
            <TabsTrigger value="bairros"><MapPin className="w-4 h-4 mr-1" /> Por Bairro</TabsTrigger>
            <TabsTrigger value="locais"><School className="w-4 h-4 mr-1" /> Por Local de Votação</TabsTrigger>
          </TabsList>

          <TabsContent value="bairros">
            {loadingBairros ? <TableSkeleton /> : (
              <div className="space-y-4">
                {chartData.length > 0 && (
                  <div className="bg-card rounded-xl border p-5">
                    <h3 className="text-base font-semibold mb-4">Eleitorado por Bairro (Top 15)</h3>
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
                        <XAxis type="number" tickFormatter={(v: number) => formatNumber(v)} />
                        <YAxis type="category" dataKey="bairro" tick={{ fontSize: 11 }} width={110} />
                        <Tooltip formatter={(v: number) => formatNumber(v)} />
                        <Bar dataKey="eleitorado" name="Eleitorado Apto" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="comparecimento" name="Comparecimento" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="bg-card rounded-xl border overflow-hidden">
                  <div className="p-5 pb-0 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 font-medium">Bairro</th>
                          <th className="pb-2 font-medium text-right">Eleitorado</th>
                          <th className="pb-2 font-medium text-right">Comparecimento</th>
                          <th className="pb-2 font-medium text-right">Abstenções</th>
                          <th className="pb-2 font-medium text-right">% Comp.</th>
                          <th className="pb-2 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(bairros || []).slice(bairroPage * bairroPageSize, (bairroPage + 1) * bairroPageSize).map((b, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-2 font-medium">{b.bairro}</td>
                            <td className="py-2 text-right">{formatNumber(b.apto)}</td>
                            <td className="py-2 text-right">{formatNumber(b.comp)}</td>
                            <td className="py-2 text-right">{formatNumber(b.abst)}</td>
                            <td className="py-2 text-right">{b.apto > 0 ? formatPercent((b.comp / b.apto) * 100) : '-'}</td>
                            <td className="py-2">
                              <button className="text-xs text-primary hover:underline" onClick={() => { setBairroSelecionado(b.bairro); setLocalPage(0); }}>
                                Ver locais →
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(!bairros || bairros.length === 0) && (
                      <p className="text-center text-muted-foreground py-8">
                        Nenhum dado de bairro encontrado para {selected}.
                      </p>
                    )}
                  </div>
                  {bairros && bairros.length > 0 && (
                    <Pagination page={bairroPage} totalItems={bairros.length} pageSize={bairroPageSize} onPageChange={setBairroPage} onPageSizeChange={setBairroPageSize} />
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="locais">
            {bairroSelecionado && (
              <div className="text-sm text-muted-foreground mb-2">
                Filtrando por bairro: <span className="font-semibold text-foreground">{bairroSelecionado}</span>
                <button className="ml-2 text-primary hover:underline" onClick={() => setBairroSelecionado(null)}>limpar</button>
              </div>
            )}
            {loadingLocais ? <TableSkeleton /> : (
              <div className="bg-card rounded-xl border overflow-hidden">
                <div className="p-5 pb-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Local de Votação</th>
                        <th className="pb-2 font-medium">Bairro</th>
                        <th className="pb-2 font-medium text-right">Eleitorado</th>
                        <th className="pb-2 font-medium text-right">Comparecimento</th>
                        <th className="pb-2 font-medium text-right">% Comp.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(locais || []).slice(localPage * localPageSize, (localPage + 1) * localPageSize).map((l, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-2 font-medium">{l.local}</td>
                          <td className="py-2 text-muted-foreground">{l.bairro}</td>
                          <td className="py-2 text-right">{formatNumber(l.apto)}</td>
                          <td className="py-2 text-right">{formatNumber(l.comp)}</td>
                          <td className="py-2 text-right">{l.apto > 0 ? formatPercent((l.comp / l.apto) * 100) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(!locais || locais.length === 0) && (
                    <p className="text-center text-muted-foreground py-8">Nenhum dado de local de votação encontrado.</p>
                  )}
                </div>
                {locais && locais.length > 0 && (
                  <Pagination page={localPage} totalItems={locais.length} pageSize={localPageSize} onPageChange={setLocalPage} onPageSizeChange={setLocalPageSize} />
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
