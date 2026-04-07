import { useState, useRef } from 'react';
import { useConsultaIA, type ConsultaResultado } from '@/hooks/useConsultaIA';
import { formatNumber, CHART_COLORS } from '@/lib/eleicoes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend,
} from 'recharts';
import { Sparkles, Send, Loader2, History, Code2, X, Lightbulb } from 'lucide-react';

const SUGESTOES = [
  'Top 10 candidatos mais votados em Goiânia em 2024',
  'Comparativo de candidatos por partido em 2024 para vereador',
  'Evolução do comparecimento eleitoral em Goiânia de 2012 a 2024',
  'Distribuição de gênero dos candidatos a prefeito em 2024',
  'Top 5 partidos com mais vereadores eleitos em 2024',
  'Patrimônio médio dos candidatos por partido em 2024',
  'Bairros com maior abstenção em Goiânia em 2024',
  'Candidatos com maior patrimônio declarado em 2024',
  'Comparar votos entre PT e PL em 2022 para governador',
  'Quantidade de candidatos por grau de instrução em 2024',
];

function ChartRenderer({ resultado }: { resultado: ConsultaResultado }) {
  const { tipo_grafico, dados, colunas } = resultado;
  
  if (!dados || dados.length === 0) {
    return <p className="text-center text-muted-foreground py-8">Nenhum dado retornado</p>;
  }

  const numericCols = colunas.filter(c => typeof dados[0]?.[c] === 'number' || !isNaN(Number(dados[0]?.[c])));
  const textCols = colunas.filter(c => !numericCols.includes(c));
  const labelCol = textCols[0] || colunas[0];
  const valueCols = numericCols.length > 0 ? numericCols : colunas.filter(c => c !== labelCol);

  // Convert string numbers to actual numbers
  const chartData = dados.map(row => {
    const converted: Record<string, any> = {};
    colunas.forEach(col => {
      const val = row[col];
      converted[col] = !isNaN(Number(val)) && val !== null && val !== '' ? Number(val) : val;
    });
    return converted;
  });

  if (tipo_grafico === 'kpi') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {colunas.map((col, i) => (
          <div key={col} className="bg-muted/30 rounded-lg p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{col}</p>
            <p className="text-2xl font-bold text-foreground metric-value">
              {typeof chartData[0]?.[col] === 'number' ? formatNumber(chartData[0][col]) : chartData[0]?.[col]}
            </p>
          </div>
        ))}
      </div>
    );
  }

  if (tipo_grafico === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <PieChart>
          <Pie data={chartData} dataKey={valueCols[0] || colunas[1]} nameKey={labelCol} cx="50%" cy="50%" innerRadius={60} outerRadius={120} paddingAngle={2} strokeWidth={0}>
            {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => formatNumber(v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (tipo_grafico === 'line') {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={chartData}>
          <XAxis dataKey={labelCol} tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v: number) => formatNumber(v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {valueCols.map((col, i) => (
            <Line key={col} type="monotone" dataKey={col} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (tipo_grafico === 'area') {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <AreaChart data={chartData}>
          <XAxis dataKey={labelCol} tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v: number) => formatNumber(v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {valueCols.map((col, i) => (
            <Area key={col} type="monotone" dataKey={col} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.3} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (tipo_grafico === 'bar') {
    const isHorizontal = chartData.length > 8;
    if (isHorizontal) {
      return (
        <ResponsiveContainer width="100%" height={Math.max(380, chartData.length * 30)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey={labelCol} tick={{ fontSize: 10 }} width={110} />
            <Tooltip formatter={(v: number) => formatNumber(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {valueCols.map((col, i) => (
              <Bar key={col} dataKey={col} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[0, 3, 3, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }
    return (
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={chartData}>
          <XAxis dataKey={labelCol} tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v: number) => formatNumber(v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {valueCols.map((col, i) => (
            <Bar key={col} dataKey={col} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // table (default)
  return (
    <div className="overflow-x-auto max-h-[500px]">
      <table className="w-full text-xs table-striped">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border/30">
            <th className="px-2 py-2 text-left font-medium text-muted-foreground">#</th>
            {colunas.map(col => (
              <th key={col} className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dados.map((row, i) => (
            <tr key={i} className="border-b border-border/10">
              <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
              {colunas.map(col => (
                <td key={col} className="px-2 py-1.5 max-w-[250px] truncate">
                  {typeof row[col] === 'number' ? formatNumber(row[col]) : row[col] ?? <span className="text-muted-foreground/40">null</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ConsultaIA() {
  const { consultar, loading, resultado, historico, erro, limpar } = useConsultaIA();
  const [pergunta, setPergunta] = useState('');
  const [showSQL, setShowSQL] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function enviar(text?: string) {
    const q = text || pergunta.trim();
    if (!q) return;
    consultar(q);
    if (!text) setPergunta('');
  }

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Relatórios Personalizados
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Descreva o relatório que deseja e a IA gerará a visualização automaticamente
          </p>
        </div>
        {historico.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowHistorico(!showHistorico)} className="text-xs h-8">
            <History className="w-3 h-3 mr-1" /> Histórico ({historico.length})
          </Button>
        )}
      </div>

      {/* Input */}
      <div className="bg-card rounded-lg border border-border/50 p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
            <Input
              ref={inputRef}
              value={pergunta}
              onChange={e => setPergunta(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && enviar()}
              placeholder="Ex: Quais os 10 candidatos mais votados para vereador em Goiânia em 2024?"
              className="pl-10 h-10 text-sm bg-muted/30"
              disabled={loading}
            />
          </div>
          <Button onClick={() => enviar()} disabled={loading || !pergunta.trim()} className="h-10 px-4">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        {/* Suggestions */}
        {!resultado && !loading && (
          <div className="mt-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb className="w-3 h-3 text-warning" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Sugestões</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUGESTOES.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setPergunta(s); enviar(s); }}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-card rounded-lg border border-border/50 p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Analisando sua pergunta e gerando visualização...</p>
        </div>
      )}

      {/* Error */}
      {erro && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
          <p className="text-sm text-destructive font-medium">Erro na consulta</p>
          <p className="text-xs text-destructive/80 mt-1">{erro}</p>
          <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={limpar}>
            <X className="w-3 h-3 mr-1" /> Fechar
          </Button>
        </div>
      )}

      {/* Result */}
      {resultado && (
        <div className="bg-card rounded-lg border border-border/50 overflow-hidden">
          <div className="p-4 border-b border-border/30">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">{resultado.titulo}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{resultado.descricao}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{resultado.tipo_grafico}</Badge>
                <Badge variant="secondary" className="text-[10px]">{resultado.dados?.length || 0} registros</Badge>
                {resultado.sql_gerado && (
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setShowSQL(!showSQL)}>
                    <Code2 className="w-3 h-3 mr-1" /> SQL
                  </Button>
                )}
              </div>
            </div>
            {showSQL && resultado.sql_gerado && (
              <pre className="mt-3 p-3 bg-muted/50 rounded text-[10px] font-mono text-muted-foreground overflow-x-auto">
                {resultado.sql_gerado}
              </pre>
            )}
          </div>
          <div className="p-4">
            <ChartRenderer resultado={resultado} />
          </div>
        </div>
      )}

      {/* History */}
      {showHistorico && historico.length > 0 && (
        <div className="bg-card rounded-lg border border-border/50 p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <History className="w-4 h-4" /> Consultas Anteriores
          </h3>
          <div className="space-y-2">
            {historico.map((h, i) => (
              <button
                key={i}
                onClick={() => { setPergunta(h.consulta); enviar(h.consulta); setShowHistorico(false); }}
                className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors"
              >
                <p className="text-xs text-foreground">{h.consulta}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {h.resultado.titulo} • {h.resultado.dados?.length || 0} resultados
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
