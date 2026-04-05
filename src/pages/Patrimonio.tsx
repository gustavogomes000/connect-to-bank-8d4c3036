import { useState } from 'react';
import { useTopPatrimonio, useEvolucaoPatrimonio } from '@/hooks/useEleicoes';
import { formatNumber } from '@/lib/eleicoes';
import { ANOS_DISPONIVEIS } from '@/lib/eleicoes';
import { TableSkeleton, ChartSkeleton } from '@/components/eleicoes/Skeletons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { DollarSign, Search, TrendingUp } from 'lucide-react';

function formatBRL(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function Patrimonio() {
  const [candidatoSelecionado, setCandidatoSelecionado] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: topPatrimonio, isLoading } = useTopPatrimonio();
  const { data: evolucao, isLoading: loadingEvolucao } = useEvolucaoPatrimonio(candidatoSelecionado || '');

  const chartData = (topPatrimonio || []).slice(0, 10).map(c => ({
    nome: c.nome.length > 18 ? c.nome.slice(0, 16) + '…' : c.nome,
    patrimonio: c.patrimonio,
  }));

  const filteredTop = search
    ? (topPatrimonio || []).filter(c => c.nome.toLowerCase().includes(search.toLowerCase()))
    : topPatrimonio;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-primary" /> Patrimônio dos Candidatos
        </h1>
      </div>

      {isLoading ? <ChartSkeleton /> : chartData.length > 0 && (
        <div className="bg-card rounded-xl border p-5">
          <h3 className="text-base font-semibold mb-4">Top 10 — Maior Patrimônio Declarado</h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 130 }}>
              <XAxis type="number" tickFormatter={(v: number) => formatBRL(v)} />
              <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={120} />
              <Tooltip formatter={(v: number) => formatBRL(v)} />
              <Bar dataKey="patrimonio" name="Patrimônio" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {candidatoSelecionado && (
        <div className="bg-card rounded-xl border p-5">
          <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Evolução Patrimonial — {candidatoSelecionado}
          </h3>
          <button className="text-xs text-primary hover:underline mb-4" onClick={() => setCandidatoSelecionado(null)}>Fechar</button>
          {loadingEvolucao ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={evolucao || []}>
                <XAxis dataKey="ano" />
                <YAxis tickFormatter={(v: number) => formatBRL(v)} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Line type="monotone" dataKey="patrimonio" name="Patrimônio" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      <div className="bg-card rounded-xl border p-5">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-base font-semibold">Ranking de Patrimônio</h3>
          <div className="relative ml-auto max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar candidato..." className="pl-9 h-8 text-sm" />
          </div>
        </div>
        {isLoading ? <TableSkeleton /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Nome</th>
                  <th className="pb-2 font-medium">Partido</th>
                  <th className="pb-2 font-medium">Cargo</th>
                  <th className="pb-2 font-medium text-right">Patrimônio</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {(filteredTop || []).map((c, i) => (
                  <tr key={c.sequencial || i} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 font-medium">{c.nome}</td>
                    <td className="py-2">{c.partido}</td>
                    <td className="py-2">{c.cargo}</td>
                    <td className="py-2 text-right font-semibold">{formatBRL(c.patrimonio)}</td>
                    <td className="py-2">
                      <button className="text-xs text-primary hover:underline" onClick={() => setCandidatoSelecionado(c.nome)}>
                        Evolução →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!filteredTop || filteredTop.length === 0) && (
              <p className="text-center text-muted-foreground py-8">
                Nenhum dado de patrimônio encontrado.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
