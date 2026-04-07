import { useState, useRef } from 'react';
import { useConsultaIA, type ConsultaResultado } from '@/hooks/useConsultaIA';
import { useRelatoriosSalvos, type RelatorioSalvo } from '@/hooks/useRelatoriosSalvos';
import { formatNumber, CHART_COLORS } from '@/lib/eleicoes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend,
} from 'recharts';
import {
  BarChart3, Send, Loader2, History, Code2, X, Lightbulb,
  Save, FolderOpen, Trash2, AlertTriangle, RefreshCw, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const SUGESTOES = [
  'Top 10 candidatos mais votados em Goiânia em 2024',
  'Comparativo de votos por partido em 2024 para vereador',
  'Evolução do comparecimento eleitoral em Goiânia de 2012 a 2024',
  'Distribuição de gênero dos candidatos a prefeito em 2024',
  'Top 5 partidos com mais vereadores eleitos em 2024',
  'Patrimônio médio dos candidatos por partido em 2024',
  'Candidatos com maior patrimônio declarado em 2024',
  'Comparar votos entre PT e PL em 2024 para vereador',
  'Quantidade de candidatos por grau de instrução em 2024',
  'Abstenção por município em 2024',
];

// ── CHART RENDERER ──
function ChartRenderer({ resultado }: { resultado: ConsultaResultado }) {
  const { tipo_grafico, dados, colunas } = resultado;

  if (!dados || dados.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="w-8 h-8 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">Nenhum dado encontrado para esta consulta</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">Tente reformular sua solicitação</p>
      </div>
    );
  }

  const numericCols = colunas.filter(c => typeof dados[0]?.[c] === 'number' || !isNaN(Number(dados[0]?.[c])));
  const textCols = colunas.filter(c => !numericCols.includes(c));
  const labelCol = textCols[0] || colunas[0];
  const valueCols = numericCols.length > 0 ? numericCols : colunas.filter(c => c !== labelCol);

  const chartData = dados.map(row => {
    const converted: Record<string, any> = {};
    colunas.forEach(col => {
      const val = row[col];
      converted[col] = !isNaN(Number(val)) && val !== null && val !== '' ? Number(val) : val;
    });
    return converted;
  });

  const tooltipStyle = {
    background: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    fontSize: 11,
    boxShadow: '0 4px 12px hsl(var(--foreground) / 0.08)',
  };

  if (tipo_grafico === 'kpi') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {colunas.map(col => (
          <div key={col} className="bg-muted/20 rounded-xl p-5 text-center border border-border/20">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2 font-medium">{col.replace(/_/g, ' ')}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight">
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
          <Pie data={chartData} dataKey={valueCols[0] || colunas[1]} nameKey={labelCol} cx="50%" cy="50%" innerRadius={65} outerRadius={125} paddingAngle={2} strokeWidth={0}>
            {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (tipo_grafico === 'line') {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={chartData}>
          <XAxis dataKey={labelCol} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {valueCols.map((col, i) => (
            <Line key={col} type="monotone" dataKey={col} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2.5} dot={{ r: 4, strokeWidth: 2, fill: 'hsl(var(--background))' }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (tipo_grafico === 'area') {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <AreaChart data={chartData}>
          <XAxis dataKey={labelCol} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {valueCols.map((col, i) => (
            <Area key={col} type="monotone" dataKey={col} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.15} strokeWidth={2} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (tipo_grafico === 'bar') {
    const isHorizontal = chartData.length > 8;
    return (
      <ResponsiveContainer width="100%" height={isHorizontal ? Math.max(380, chartData.length * 32) : 380}>
        <BarChart data={chartData} layout={isHorizontal ? 'vertical' : 'horizontal'} margin={isHorizontal ? { left: 120 } : { bottom: 20 }}>
          {isHorizontal ? (
            <>
              <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey={labelCol} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={115} axisLine={false} tickLine={false} />
            </>
          ) : (
            <>
              <XAxis dataKey={labelCol} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            </>
          )}
          <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {valueCols.map((col, i) => (
            <Bar key={col} dataKey={col} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={isHorizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // Table
  return (
    <div className="overflow-x-auto max-h-[500px] rounded-lg border border-border/20">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm">
          <tr className="border-b border-border/30">
            <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">#</th>
            {colunas.map(col => (
              <th key={col} className="px-3 py-2.5 text-left font-semibold text-muted-foreground text-[10px] uppercase tracking-wider whitespace-nowrap">{col.replace(/_/g, ' ')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dados.map((row, i) => (
            <tr key={i} className={cn('border-b border-border/10 transition-colors hover:bg-muted/20', i % 2 === 0 && 'bg-muted/5')}>
              <td className="px-3 py-2 text-muted-foreground/50 font-mono text-[10px]">{i + 1}</td>
              {colunas.map(col => (
                <td key={col} className="px-3 py-2 max-w-[250px] truncate">
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

// ── SAVED REPORTS PANEL ──
function RelatoriosSalvosPanel({ salvos, onAbrir, onRemover, onFechar }: {
  salvos: RelatorioSalvo[];
  onAbrir: (s: RelatorioSalvo) => void;
  onRemover: (id: string) => void;
  onFechar: () => void;
}) {
  if (salvos.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border/30 p-6 text-center">
        <FolderOpen className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground font-medium">Nenhum relatório salvo</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">Gere um relatório e clique em "Salvar" para acessá-lo depois</p>
        <Button variant="ghost" size="sm" onClick={onFechar} className="mt-4 text-xs h-7">Fechar</Button>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border/30 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/20 bg-muted/10">
        <span className="text-xs font-semibold flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-primary" />
          Relatórios Salvos ({salvos.length})
        </span>
        <Button variant="ghost" size="icon" onClick={onFechar} className="h-6 w-6">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="max-h-[350px] overflow-y-auto divide-y divide-border/10">
        {salvos.map(s => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group transition-colors">
            <button onClick={() => onAbrir(s)} className="flex-1 text-left min-w-0">
              <p className="text-xs text-foreground font-medium truncate">{s.consulta}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-[8px] h-4">{s.resultado.tipo_grafico}</Badge>
                <span className="text-[9px] text-muted-foreground">{s.resultado.dados?.length || 0} registros</span>
                <span className="text-[9px] text-muted-foreground/50">•</span>
                <span className="text-[9px] text-muted-foreground/50">
                  {new Date(s.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                </span>
              </div>
            </button>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => onAbrir(s)} className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onRemover(s.id)} className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN ──
export default function ConsultaIA() {
  const { consultar, loading, resultado, historico, erro, limpar } = useConsultaIA();
  const { salvos, salvar, remover, isSalvo } = useRelatoriosSalvos();
  const [pergunta, setPergunta] = useState('');
  const [ultimaPergunta, setUltimaPergunta] = useState('');
  const [showSQL, setShowSQL] = useState(false);
  const [showSalvos, setShowSalvos] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  const [viewingSaved, setViewingSaved] = useState<RelatorioSalvo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function enviar(text?: string) {
    const q = text || pergunta.trim();
    if (!q) return;
    setUltimaPergunta(q);
    setViewingSaved(null);
    consultar(q);
    if (!text) setPergunta('');
  }

  function handleSalvar() {
    if (resultado && ultimaPergunta) {
      salvar(ultimaPergunta, resultado);
    }
  }

  function handleAbrirSalvo(s: RelatorioSalvo) {
    setViewingSaved(s);
    setShowSalvos(false);
  }

  const displayResult = viewingSaved ? viewingSaved.resultado : resultado;
  const displayQuery = viewingSaved ? viewingSaved.consulta : ultimaPergunta;
  const canSave = resultado && ultimaPergunta && !isSalvo(ultimaPergunta) && resultado.sucesso;

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">Relatórios Personalizados</h1>
            <p className="text-[10px] text-muted-foreground">Descreva o que deseja visualizar e o sistema gerará o relatório</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {salvos.length > 0 && (
            <Button
              variant={showSalvos ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setShowSalvos(!showSalvos); setShowHistorico(false); }}
              className="text-xs h-8"
            >
              <FolderOpen className="w-3 h-3 mr-1.5" />
              Salvos ({salvos.length})
            </Button>
          )}
          {historico.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowHistorico(!showHistorico); setShowSalvos(false); }}
              className="text-xs h-8 text-muted-foreground"
            >
              <History className="w-3 h-3 mr-1" />
              Recentes
            </Button>
          )}
        </div>
      </div>

      {/* Saved Reports Panel */}
      {showSalvos && (
        <RelatoriosSalvosPanel
          salvos={salvos}
          onAbrir={handleAbrirSalvo}
          onRemover={remover}
          onFechar={() => setShowSalvos(false)}
        />
      )}

      {/* Input */}
      <div className="bg-card rounded-xl border border-border/30 p-4 shadow-sm">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <BarChart3 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
            <Input
              ref={inputRef}
              value={pergunta}
              onChange={e => setPergunta(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && enviar()}
              placeholder="Ex: Top 10 candidatos mais votados para vereador em Goiânia em 2024"
              className="pl-10 h-11 text-sm bg-muted/20 border-border/30 rounded-lg"
              disabled={loading}
            />
          </div>
          <Button onClick={() => enviar()} disabled={loading || !pergunta.trim()} className="h-11 px-5 rounded-lg font-medium">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-1.5" /> Gerar</>}
          </Button>
        </div>

        {/* Suggestions */}
        {!displayResult && !loading && !showHistorico && (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Lightbulb className="w-3.5 h-3.5 text-warning" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Sugestões de Relatórios</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUGESTOES.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setPergunta(s); enviar(s); }}
                  className="text-[11px] px-3 py-1.5 rounded-lg border border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* History Panel */}
      {showHistorico && historico.length > 0 && (
        <div className="bg-card rounded-xl border border-border/30 p-4">
          <h3 className="text-xs font-semibold mb-3 flex items-center gap-2 text-muted-foreground uppercase tracking-widest">
            <History className="w-3.5 h-3.5" /> Consultas Recentes
          </h3>
          <div className="space-y-1">
            {historico.map((h, i) => (
              <button
                key={i}
                onClick={() => { setPergunta(h.consulta); enviar(h.consulta); setShowHistorico(false); }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors flex items-center gap-3"
              >
                <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-foreground truncate">{h.consulta}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">
                    {h.resultado.titulo} • {h.resultado.dados?.length || 0} registros
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-card rounded-xl border border-border/30 p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Gerando relatório...</p>
          <p className="text-[10px] text-muted-foreground">Analisando os dados e criando a visualização</p>
        </div>
      )}

      {/* Error */}
      {erro && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Não foi possível gerar o relatório</p>
              <p className="text-xs text-destructive/70 mt-1">{erro}</p>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => enviar(ultimaPergunta)}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Tentar novamente
                </Button>
                <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={limpar}>
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Viewing saved indicator */}
      {viewingSaved && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
          <FolderOpen className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] text-primary font-medium flex-1">Visualizando relatório salvo: "{viewingSaved.consulta}"</span>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setViewingSaved(null)}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Result */}
      {displayResult && !loading && (
        <div className="bg-card rounded-xl border border-border/30 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border/20 bg-muted/5">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-foreground tracking-tight">{displayResult.titulo}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{displayResult.descricao}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-3">
                <Badge variant="outline" className="text-[9px] h-5 border-border/30">{displayResult.tipo_grafico}</Badge>
                <Badge variant="secondary" className="text-[9px] h-5">{displayResult.dados?.length || 0} registros</Badge>
                {displayResult.sql_gerado && (
                  <Button variant="ghost" size="sm" className="h-6 text-[9px] px-2" onClick={() => setShowSQL(!showSQL)}>
                    <Code2 className="w-3 h-3 mr-1" /> SQL
                  </Button>
                )}
                {canSave && !viewingSaved && (
                  <Button variant="outline" size="sm" className="h-6 text-[9px] px-2.5 border-primary/30 text-primary hover:bg-primary/10" onClick={handleSalvar}>
                    <Save className="w-3 h-3 mr-1" /> Salvar
                  </Button>
                )}
                {isSalvo(displayQuery) && (
                  <Badge className="text-[9px] h-5 bg-primary/10 text-primary border-primary/20">
                    <Save className="w-2.5 h-2.5 mr-1" /> Salvo
                  </Badge>
                )}
              </div>
            </div>
            {showSQL && displayResult.sql_gerado && (
              <pre className="mt-3 p-3 bg-muted/30 rounded-lg text-[10px] font-mono text-muted-foreground overflow-x-auto border border-border/20">
                {displayResult.sql_gerado}
              </pre>
            )}
          </div>
          <div className="p-5">
            <ChartRenderer resultado={displayResult} />
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="text-[9px] text-muted-foreground/40 text-center">
        Dados eleitorais do TSE • Goiás 2012–2024
      </p>
    </div>
  );
}
