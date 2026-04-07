import { useState, useRef, useEffect } from 'react';
import { useChatEleicoes, type ChatMessage, type ChatResultado } from '@/hooks/useChatEleicoes';
import { useChatFavoritos } from '@/hooks/useChatFavoritos';
import { formatNumber, CHART_COLORS } from '@/lib/eleicoes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend,
} from 'recharts';
import {
  MessageSquare, Send, Loader2, Code2, Trash2, Database,
  Lightbulb, BarChart3, Star, Bookmark, X, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── INLINE CHART ──
function InlineChart({ resultado }: { resultado: ChatResultado }) {
  const { tipo_grafico, dados, colunas } = resultado;
  if (!dados || dados.length === 0) return null;

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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
        {colunas.map(col => (
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

  if (tipo_grafico === 'pie') {
    return (
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={chartData} dataKey={valueCols[0] || colunas[1]} nameKey={labelCol} cx="50%" cy="50%" innerRadius={50} outerRadius={100} paddingAngle={2} strokeWidth={0}>
              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (tipo_grafico === 'line' || tipo_grafico === 'area') {
    const ChartComp = tipo_grafico === 'line' ? LineChart : AreaChart;
    return (
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={280}>
          <ChartComp data={chartData}>
            <XAxis dataKey={labelCol} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} />
            {valueCols.map((col, i) =>
              tipo_grafico === 'line'
                ? <Line key={col} type="monotone" dataKey={col} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2.5} dot={{ r: 3 }} />
                : <Area key={col} type="monotone" dataKey={col} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.15} strokeWidth={2} />
            )}
          </ChartComp>
        </ResponsiveContainer>
      </div>
    );
  }

  if (tipo_grafico === 'bar') {
    const isHorizontal = chartData.length > 8;
    return (
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={isHorizontal ? Math.max(280, chartData.length * 28) : 280}>
          <BarChart data={chartData} layout={isHorizontal ? 'vertical' : 'horizontal'} margin={isHorizontal ? { left: 100 } : undefined}>
            {isHorizontal ? (
              <>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey={labelCol} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={95} axisLine={false} tickLine={false} />
              </>
            ) : (
              <>
                <XAxis dataKey={labelCol} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              </>
            )}
            <Tooltip formatter={(v: number) => formatNumber(v)} contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
            {valueCols.map((col, i) => (
              <Bar key={col} dataKey={col} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Table fallback
  return (
    <div className="mt-3 overflow-x-auto max-h-[400px] rounded-lg border border-border/20">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm">
          <tr className="border-b border-border/30">
            <th className="px-2.5 py-2 text-left font-semibold text-muted-foreground text-[9px] uppercase tracking-wider">#</th>
            {colunas.map(col => (
              <th key={col} className="px-2.5 py-2 text-left font-semibold text-muted-foreground text-[9px] uppercase tracking-wider whitespace-nowrap">{col.replace(/_/g, ' ')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dados.map((row, i) => (
            <tr key={i} className={cn('border-b border-border/10 hover:bg-muted/20', i % 2 === 0 && 'bg-muted/5')}>
              <td className="px-2.5 py-1.5 text-muted-foreground/50 font-mono text-[9px]">{i + 1}</td>
              {colunas.map(col => (
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

// ── MESSAGE BUBBLE ──
function MessageBubble({ message, onSalvar, isSalvo }: { message: ChatMessage; onSalvar: (p: string) => void; isSalvo: boolean }) {
  const [showSQL, setShowSQL] = useState(false);
  const isUser = message.role === 'user';
  const isError = !isUser && message.content.startsWith('Não foi possível') || message.content.startsWith('O sistema está') || message.content.startsWith('Erro') || message.content.startsWith('Serviço');

  return (
    <div className={cn('flex gap-3 max-w-full', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0 mt-1">
          {isError ? <AlertTriangle className="w-4 h-4 text-destructive/70" /> : <Database className="w-4 h-4 text-primary" />}
        </div>
      )}
      <div className={cn(
        'rounded-2xl px-4 py-3 max-w-[85%] min-w-[60px]',
        isUser
          ? 'bg-primary text-primary-foreground rounded-br-md'
          : isError
            ? 'bg-destructive/5 border border-destructive/15 rounded-bl-md'
            : 'bg-card border border-border/30 rounded-bl-md shadow-sm'
      )}>
        {message.loading ? (
          <div className="flex items-center gap-2.5 text-muted-foreground py-1">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-xs">Processando sua pergunta...</span>
          </div>
        ) : (
          <>
            <div className={cn('text-sm leading-relaxed whitespace-pre-wrap', isError && 'text-destructive/80')}>
              {message.content.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                part.startsWith('**') && part.endsWith('**')
                  ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
                  : <span key={i}>{part}</span>
              )}
            </div>

            {message.resultado?.sucesso && message.resultado.dados?.length > 0 && (
              <>
                <div className="flex items-center gap-2 mt-3 mb-1">
                  <Badge variant="outline" className="text-[8px] h-5 border-primary/20 text-primary">
                    <BarChart3 className="w-2.5 h-2.5 mr-1" />
                    {message.resultado.tipo_grafico}
                  </Badge>
                  <Badge variant="secondary" className="text-[8px] h-5">
                    {message.resultado.dados.length} registros
                  </Badge>
                  {message.resultado.sql_gerado && (
                    <button onClick={() => setShowSQL(!showSQL)} className="text-[8px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                      <Code2 className="w-3 h-3" /> SQL
                    </button>
                  )}
                </div>
                {showSQL && message.resultado.sql_gerado && (
                  <pre className="mt-2 p-2.5 bg-background/50 rounded-lg text-[10px] font-mono text-muted-foreground overflow-x-auto border border-border/20">
                    {message.resultado.sql_gerado}
                  </pre>
                )}
                <InlineChart resultado={message.resultado} />
              </>
            )}

            {message.resultado?.entities_encontradas && !isUser && (
              <div className="flex flex-wrap gap-1 mt-2.5">
                {message.resultado.entities_encontradas.anos?.map((a: number) => (
                  <Badge key={a} variant="outline" className="text-[7px] h-4 border-border/30">{a}</Badge>
                ))}
                {message.resultado.entities_encontradas.municipios?.map((m: string) => (
                  <Badge key={m} variant="outline" className="text-[7px] h-4 border-border/30">{m}</Badge>
                ))}
                {message.resultado.entities_encontradas.partidos?.map((p: string) => (
                  <Badge key={p} variant="outline" className="text-[7px] h-4 border-border/30">{p}</Badge>
                ))}
                {message.resultado.entities_encontradas.cargos?.map((c: string) => (
                  <Badge key={c} variant="outline" className="text-[7px] h-4 border-border/30">{c}</Badge>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {isUser && !message.loading && (
        <div className="flex flex-col items-center gap-1.5 mt-1">
          <div className="w-8 h-8 rounded-xl bg-muted border border-border/30 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-muted-foreground">Eu</span>
          </div>
          <button
            onClick={() => onSalvar(message.content)}
            title={isSalvo ? 'Salvo nos favoritos' : 'Salvar pergunta'}
            className={cn(
              'w-6 h-6 rounded-md flex items-center justify-center transition-all',
              isSalvo ? 'text-warning' : 'text-muted-foreground/30 hover:text-warning'
            )}
          >
            {isSalvo ? <Star className="w-3.5 h-3.5 fill-current" /> : <Star className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {isUser && message.loading && (
        <div className="w-8 h-8 rounded-xl bg-muted border border-border/30 flex items-center justify-center shrink-0 mt-1">
          <span className="text-[10px] font-bold text-muted-foreground">Eu</span>
        </div>
      )}
    </div>
  );
}

// ── FAVORITES PANEL ──
function FavoritosPanel({ onUsar, onFechar }: { onUsar: (p: string) => void; onFechar: () => void }) {
  const { favoritos, remover } = useChatFavoritos();

  if (favoritos.length === 0) {
    return (
      <div className="bg-card border border-border/30 rounded-xl p-5 text-center">
        <Bookmark className="w-7 h-7 text-muted-foreground/20 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground font-medium">Nenhum favorito salvo</p>
        <p className="text-[10px] text-muted-foreground/50 mt-1">Clique na ★ ao lado de uma pergunta para salvar</p>
        <Button variant="ghost" size="sm" onClick={onFechar} className="mt-3 text-xs h-7">Fechar</Button>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border/30 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20 bg-muted/10">
        <span className="text-xs font-semibold flex items-center gap-2">
          <Bookmark className="w-3.5 h-3.5 text-warning" />
          Favoritos ({favoritos.length})
        </span>
        <Button variant="ghost" size="icon" onClick={onFechar} className="h-6 w-6">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="max-h-[300px] overflow-y-auto divide-y divide-border/10">
        {favoritos.map(fav => (
          <div key={fav.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/20 group transition-colors">
            <button
              onClick={() => onUsar(fav.pergunta)}
              className="flex-1 text-left text-xs text-foreground/80 hover:text-foreground truncate"
            >
              {fav.pergunta}
            </button>
            <button
              onClick={() => remover(fav.id)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN ──
const SUGESTOES_RAPIDAS = [
  "Top 10 vereadores mais votados em Goiânia 2024",
  "Resumo geral da eleição de 2024",
  "Distribuição de gênero dos candidatos 2024",
  "Comparar PT e PL para vereador em Goiânia 2024",
  "Evolução do comparecimento em Goiânia",
  "Candidatos com maior patrimônio em 2024",
  "Escolaridade dos candidatos a prefeito 2024",
  "Abstenção por município em 2024",
  "Ranking de partidos em Aparecida de Goiânia 2024",
  "Votos por zona eleitoral em Goiânia 2024",
  "Ocupações mais comuns dos vereadores 2024",
  "Bairros com maior comparecimento em Goiânia 2024",
];

export default function ChatEleicoes() {
  const { messages, loading, enviar, limpar, cooldownRemaining, isRateLimited } = useChatEleicoes();
  const { favoritos, adicionar, isFavorito } = useChatFavoritos();
  const [input, setInput] = useState('');
  const [showFavoritos, setShowFavoritos] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  function handleSend() {
    if (!input.trim() || loading) return;
    enviar(input);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleUsarFavorito(pergunta: string) {
    setShowFavoritos(false);
    setInput(pergunta);
    enviar(pergunta);
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground tracking-tight">Relatórios Personalizados</h1>
            <p className="text-[10px] text-muted-foreground">Gere visualizações e gráficos sobre dados eleitorais de Goiás</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={showFavoritos ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setShowFavoritos(!showFavoritos)}
            className="text-xs h-7"
          >
            <Bookmark className="w-3 h-3 mr-1" />
            Favoritos
            {favoritos.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[8px] h-4 px-1">{favoritos.length}</Badge>
            )}
          </Button>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={limpar} className="text-xs h-7 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3 h-3 mr-1" /> Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Favoritos panel */}
      {showFavoritos && (
        <div className="py-3 shrink-0">
          <FavoritosPanel onUsar={handleUsarFavorito} onFechar={() => setShowFavoritos(false)} />
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/8 border border-primary/15 flex items-center justify-center mb-4">
              <Database className="w-8 h-8 text-primary/50" />
            </div>
             <h2 className="text-lg font-semibold text-foreground mb-1 tracking-tight">Relatórios Personalizados</h2>
             <p className="text-xs text-muted-foreground max-w-md mb-6">
               Gere relatórios com gráficos, tabelas e visualizações sobre candidatos, votos, partidos e mais.
             </p>
            </p>

            {favoritos.length > 0 && (
              <div className="w-full max-w-lg mb-5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Star className="w-3.5 h-3.5 text-warning fill-warning" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Suas consultas salvas</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {favoritos.slice(0, 6).map(fav => (
                    <button
                      key={fav.id}
                      onClick={() => handleUsarFavorito(fav.pergunta)}
                      className="text-[11px] text-left px-3 py-2 rounded-lg border border-warning/15 bg-warning/5 text-foreground/80 hover:text-foreground hover:border-warning/30 transition-all flex items-center gap-2"
                    >
                      <Star className="w-2.5 h-2.5 text-warning fill-warning shrink-0" />
                      <span className="truncate">{fav.pergunta}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-1.5 mb-3">
              <Lightbulb className="w-3.5 h-3.5 text-warning" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Experimente perguntar</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-w-lg w-full">
              {SUGESTOES_RAPIDAS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(s); enviar(s); }}
                  className="text-[11px] text-left px-3 py-2 rounded-lg border border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/25 hover:bg-primary/5 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onSalvar={adicionar}
              isSalvo={msg.role === 'user' ? isFavorito(msg.content) : false}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border/20 pt-3 shrink-0">
        {/* Rate limit warning */}
        {(isRateLimited || cooldownRemaining > 0) && (
          <div className="mb-2 px-3 py-2 rounded-xl bg-warning/8 border border-warning/20 text-center">
            <p className="text-xs text-warning font-medium">
              {isRateLimited
                ? `Aguarde ${cooldownRemaining}s — o sistema está processando solicitações anteriores`
                : `Próxima consulta disponível em ${cooldownRemaining}s`}
            </p>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre candidatos, votos, partidos, comparecimento..."
              className="min-h-[44px] max-h-[120px] resize-none pr-12 text-sm bg-muted/20 border-border/30 rounded-xl"
              disabled={loading || isRateLimited}
              rows={1}
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={loading || !input.trim() || isRateLimited}
            size="icon"
            className="h-[44px] w-[44px] shrink-0 rounded-xl"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-[9px] text-muted-foreground/40 text-center mt-2">
          Dados eleitorais do TSE • Goiás 2012–2024
        </p>
      </div>
    </div>
  );
}
