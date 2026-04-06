import { useState } from 'react';
import { useEleitos, useDataAvailability } from '@/hooks/useEleicoes';
import { formatNumber, formatPercent, getPartidoCor, CHART_COLORS } from '@/lib/eleicoes';
import { ChartSkeleton, TableSkeleton } from '@/components/eleicoes/Skeletons';
import { CandidatoAvatar } from '@/components/eleicoes/CandidatoAvatar';
import { SituacaoBadge } from '@/components/eleicoes/SituacaoBadge';
import { Pagination } from '@/components/eleicoes/Pagination';
import { Input } from '@/components/ui/input';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { CheckCircle, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';
import { useNavigate } from 'react-router-dom';

function useEleitosDetalhado() {
  const f = useFilterStore();
  return useQuery({
    queryKey: ['eleitosDetalhado', f.ano, f.turno, f.cargo, f.municipio, f.partido, f.genero],
    queryFn: async () => {
      let q = (supabase.from('bd_eleicoes_candidatos' as any) as any)
        .select('id, nome_urna, nome_completo, sigla_partido, cargo, municipio, genero, grau_instrucao, ocupacao, situacao_final, foto_url, numero_urna, ano')
        .or('situacao_final.ilike.%ELEITO%,situacao_final.ilike.%MÉDIA%,situacao_final.ilike.%QP%')
        .not('situacao_final', 'ilike', '%NÃO ELEITO%')
        .order('nome_urna')
        .limit(2000);
      if (f.ano) q = q.eq('ano', f.ano);
      if (f.turno) q = q.eq('turno', f.turno);
      if (f.cargo) q = q.ilike('cargo', f.cargo);
      if (f.municipio) q = q.eq('municipio', f.municipio);
      if (f.partido) q = q.eq('sigla_partido', f.partido);
      if (f.genero) q = q.eq('genero', f.genero);
      const { data } = await q;
      return data || [];
    },
  });
}

export default function Eleitos() {
  const { data: eleitos, isLoading } = useEleitosDetalhado();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(30);
  const navigate = useNavigate();

  const filtered = search
    ? (eleitos || []).filter((c: any) => (c.nome_urna || '').toLowerCase().includes(search.toLowerCase()))
    : eleitos || [];

  // Charts data
  const porPartido = new Map<string, number>();
  const porCargo = new Map<string, number>();
  const porGenero = new Map<string, number>();
  const porMunicipio = new Map<string, number>();

  (eleitos || []).forEach((c: any) => {
    porPartido.set(c.sigla_partido || 'OUTROS', (porPartido.get(c.sigla_partido || 'OUTROS') || 0) + 1);
    porCargo.set(c.cargo || 'N/A', (porCargo.get(c.cargo || 'N/A') || 0) + 1);
    porGenero.set(c.genero || 'N/I', (porGenero.get(c.genero || 'N/I') || 0) + 1);
    porMunicipio.set(c.municipio || 'N/A', (porMunicipio.get(c.municipio || 'N/A') || 0) + 1);
  });

  const chartPartido = Array.from(porPartido.entries()).map(([partido, total]) => ({ partido, total })).sort((a, b) => b.total - a.total).slice(0, 15);
  const chartCargo = Array.from(porCargo.entries()).map(([cargo, total]) => ({ cargo, total })).sort((a, b) => b.total - a.total);
  const chartGenero = Array.from(porGenero.entries()).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
  const chartMunicipio = Array.from(porMunicipio.entries()).map(([municipio, total]) => ({ municipio, total })).sort((a, b) => b.total - a.total).slice(0, 15);

  const totalEleitos = (eleitos || []).length;
  const totalMulheres = (eleitos || []).filter((c: any) => (c.genero || '').toUpperCase() === 'FEMININO').length;
  const totalPartidos = porPartido.size;

  const tooltipStyle = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 };

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <CheckCircle className="w-5 h-5 text-success" /> Eleitos
      </h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-lg border border-border/50 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Eleitos</p>
          <p className="text-xl font-bold text-success metric-value">{formatNumber(totalEleitos)}</p>
        </div>
        <div className="bg-card rounded-lg border border-border/50 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Mulheres Eleitas</p>
          <p className="text-xl font-bold text-secondary metric-value">{formatNumber(totalMulheres)}</p>
          <p className="text-[9px] text-muted-foreground">{totalEleitos > 0 ? formatPercent((totalMulheres / totalEleitos) * 100) : '—'}</p>
        </div>
        <div className="bg-card rounded-lg border border-border/50 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Partidos</p>
          <p className="text-xl font-bold text-warning metric-value">{formatNumber(totalPartidos)}</p>
        </div>
        <div className="bg-card rounded-lg border border-border/50 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Municípios</p>
          <p className="text-xl font-bold metric-value">{formatNumber(porMunicipio.size)}</p>
        </div>
      </div>

      {isLoading ? <ChartSkeleton /> : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-card rounded-lg border border-border/50 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Eleitos por Partido</h3>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={chartPartido} layout="vertical" margin={{ left: 55 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="partido" tick={{ fontSize: 10 }} width={50} />
                  <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} />
                  <Bar dataKey="total" name="Eleitos" radius={[0, 3, 3, 0]}>
                    {chartPartido.map((r, i) => <Cell key={i} fill={getPartidoCor(r.partido)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card rounded-lg border border-border/50 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Por Cargo</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={chartCargo} dataKey="total" nameKey="cargo" cx="50%" cy="50%" innerRadius={50} outerRadius={100} paddingAngle={2} strokeWidth={0}>
                    {chartCargo.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card rounded-lg border border-border/50 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Por Gênero</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={chartGenero} dataKey="total" nameKey="nome" cx="50%" cy="50%" innerRadius={50} outerRadius={100} paddingAngle={3} strokeWidth={0}>
                    {chartGenero.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? 'hsl(190, 80%, 45%)' : i === 1 ? 'hsl(338, 72%, 60%)' : CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Buscar eleito..." className="pl-9 h-8 text-xs" />
            </div>
            <span className="text-xs text-muted-foreground">{formatNumber(filtered.length)} registros</span>
          </div>

          <div className="bg-card rounded-lg border border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs table-striped">
                <thead>
                  <tr className="border-b border-border/30 text-left bg-muted/30">
                    <th className="px-2 py-2 font-medium text-muted-foreground">#</th>
                    <th className="py-2 font-medium text-muted-foreground w-8"></th>
                    <th className="px-2 py-2 font-medium text-muted-foreground">Nome</th>
                    <th className="px-2 py-2 font-medium text-muted-foreground">Nº</th>
                    <th className="px-2 py-2 font-medium text-muted-foreground">Partido</th>
                    <th className="px-2 py-2 font-medium text-muted-foreground">Cargo</th>
                    <th className="px-2 py-2 font-medium text-muted-foreground">Município</th>
                    <th className="px-2 py-2 font-medium text-muted-foreground">Gênero</th>
                    <th className="px-2 py-2 font-medium text-muted-foreground">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(page * pageSize, (page + 1) * pageSize).map((c: any, i: number) => (
                    <tr key={c.id} className="border-b border-border/20 last:border-0 cursor-pointer hover:bg-primary/5" onClick={() => navigate(`/candidato/${c.id}`)}>
                      <td className="px-2 py-1.5 text-muted-foreground">{page * pageSize + i + 1}</td>
                      <td className="py-1.5"><CandidatoAvatar nome={c.nome_urna} fotoUrl={c.foto_url} size={24} /></td>
                      <td className="px-2 py-1.5 font-medium">{c.nome_urna}</td>
                      <td className="px-2 py-1.5 font-mono text-muted-foreground">{c.numero_urna}</td>
                      <td className="px-2 py-1.5 font-semibold" style={{ color: getPartidoCor(c.sigla_partido) }}>{c.sigla_partido}</td>
                      <td className="px-2 py-1.5">{c.cargo}</td>
                      <td className="px-2 py-1.5">{c.municipio}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{c.genero}</td>
                      <td className="px-2 py-1.5"><SituacaoBadge situacao={c.situacao_final} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </div>
        </>
      )}
    </div>
  );
}
