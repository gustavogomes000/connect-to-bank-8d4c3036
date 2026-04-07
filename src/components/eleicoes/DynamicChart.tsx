import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend,
} from 'recharts';
import { formatNumber, CHART_COLORS } from '@/lib/eleicoes';
import type { ConfigVisual } from '@/hooks/useChatEleicoes';
import { processDataWithMapping } from '@/hooks/useChatEleicoes';

interface DynamicChartProps {
  configVisual: ConfigVisual;
  dadosBrutos: Record<string, any>[];
  colunas: string[];
}

const tooltipStyle = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 11,
  boxShadow: '0 4px 12px hsl(var(--foreground) / 0.08)',
};

export default function DynamicChart({ configVisual, dadosBrutos, colunas }: DynamicChartProps) {
  const { tipo_grafico, mapping } = configVisual;

  const chartData = useMemo(() => {
    return processDataWithMapping(dadosBrutos, mapping);
  }, [dadosBrutos, mapping]);

  if (!chartData || chartData.length === 0) return null;

  const axisKey = mapping.axis || colunas[0] || '';
  const dataKeys = mapping.dataKeys?.length > 0
    ? mapping.dataKeys
    : colunas.filter(c => c !== axisKey && typeof chartData[0]?.[c] === 'number');

  // KPI
  if (tipo_grafico === 'kpi') {
    const displayCols = dataKeys.length > 0 ? dataKeys : colunas;
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
        {displayCols.map(col => (
          <div key={col} className="bg-background/50 rounded-xl p-3.5 text-center border border-border/20">
            <p className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1.5 font-medium">{col.replace(/_/g, ' ')}</p>
            <p className="text-xl font-bold text-foreground tracking-tight">
              {typeof chartData[0]?.[col] === 'number' ? formatNumber(chartData[0][col]) : chartData[0]?.[col]}
            </p>
          </div>
        ))}
      </div>
    );
  }

  // Pie
  if (tipo_grafico === 'pie') {
    return (
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={chartData} dataKey={dataKeys[0] || colunas[1]} nameKey={axisKey} cx="50%" cy="50%" innerRadius={50} outerRadius={100} paddingAngle={2} strokeWidth={0}>
              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Line / Area
  if (tipo_grafico === 'line' || tipo_grafico === 'area') {
    const ChartComp = tipo_grafico === 'line' ? LineChart : AreaChart;
    return (
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={280}>
          <ChartComp data={chartData}>
            <XAxis dataKey={axisKey} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {dataKeys.map((col, i) =>
              tipo_grafico === 'line'
                ? <Line key={col} type="monotone" dataKey={col} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2.5} dot={{ r: 3 }} name={col.replace(/_/g, ' ')} />
                : <Area key={col} type="monotone" dataKey={col} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.15} strokeWidth={2} name={col.replace(/_/g, ' ')} />
            )}
          </ChartComp>
        </ResponsiveContainer>
      </div>
    );
  }

  // Bar
  if (tipo_grafico === 'bar') {
    const isHorizontal = chartData.length > 8;
    return (
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={isHorizontal ? Math.max(280, chartData.length * 28) : 280}>
          <BarChart data={chartData} layout={isHorizontal ? 'vertical' : 'horizontal'} margin={isHorizontal ? { left: 100 } : undefined}>
            {isHorizontal ? (
              <>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey={axisKey} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={95} axisLine={false} tickLine={false} />
              </>
            ) : (
              <>
                <XAxis dataKey={axisKey} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              </>
            )}
            <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {dataKeys.map((col, i) => (
              <Bar key={col} dataKey={col} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} name={col.replace(/_/g, ' ')} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Table fallback
  const tableCols = colunas.length > 0 ? colunas : (chartData.length > 0 ? Object.keys(chartData[0]) : []);
  return (
    <div className="mt-3 overflow-x-auto max-h-[400px] rounded-lg border border-border/20">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm">
          <tr className="border-b border-border/30">
            <th className="px-2.5 py-2 text-left font-semibold text-muted-foreground text-[9px] uppercase tracking-wider">#</th>
            {tableCols.map(col => (
              <th key={col} className="px-2.5 py-2 text-left font-semibold text-muted-foreground text-[9px] uppercase tracking-wider whitespace-nowrap">{col.replace(/_/g, ' ')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chartData.map((row, i) => (
            <tr key={i} className={`border-b border-border/10 hover:bg-muted/20 ${i % 2 === 0 ? 'bg-muted/5' : ''}`}>
              <td className="px-2.5 py-1.5 text-muted-foreground/50 font-mono text-[9px]">{i + 1}</td>
              {tableCols.map(col => (
                <td key={col} className="px-2.5 py-1.5 max-w-[200px] truncate">
                  {typeof row[col] === 'number' ? formatNumber(row[col]) : row[col] ?? <span className="text-muted-foreground/30">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
