import { useState, useRef, useEffect } from 'react';
import { useChatEleicoes, type ChatMessage, type ChatResultado } from '@/hooks/useChatEleicoes';
import { useChatFavoritos } from '@/hooks/useChatFavoritos';
import { formatNumber } from '@/lib/eleicoes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import DynamicChartRenderer from '@/components/eleicoes/DynamicChartRenderer';
import {
  MessageSquare, Send, Loader2, Code2, Trash2, Database,
  Lightbulb, BarChart3, Star, Bookmark, X, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ATALHOS_POS_RESPOSTA = [
  'Resuma os bens do candidato "Maguito Vilela"',
  'Compare abstenção em Aparecida vs Goiânia',
  'Top 5 partidos com mais votos em 2024',
  'Evolução do comparecimento em Goiânia',
];

// ── MESSAGE BUBBLE ──
function MessageBubble({ message, onSalvar, isSalvo }: { message: ChatMessage; onSalvar: (p: string) => void; isSalvo: boolean }) {
  const [showSQL, setShowSQL] = useState(false);
  const isUser = message.role === 'user';
  const isError = !isUser && (message.content.startsWith('Não foi possível') || message.content.startsWith('O sistema está') || message.content.startsWith('Erro') || message.content.startsWith('Serviço'));

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

            {message.resultado?.sucesso && message.resultado.dados_brutos?.length > 0 && (
              <>
                <div className="flex items-center gap-2 mt-3 mb-1">
                  <Badge variant="outline" className="text-[8px] h-5 border-primary/20 text-primary">
                    <BarChart3 className="w-2.5 h-2.5 mr-1" />
                    {message.resultado.config_visual.tipo_grafico}
                  </Badge>
                  <Badge variant="secondary" className="text-[8px] h-5">
                    {message.resultado.dados_brutos.length} registros
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
                <DynamicChartRenderer
                  configVisual={message.resultado.config_visual}
                  dadosBrutos={message.resultado.dados_brutos}
                  colunas={message.resultado.colunas}
                />
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
  "Comparar PT e PL para vereador em Goiânia 2024",
  "Evolução do comparecimento em Goiânia",
  "Top 10 vereadores mais votados em Goiânia 2024",
  "Abstenção por zona eleitoral em Goiânia 2024",
];

const SUGESTOES_EXTRAS = [
  "Distribuição de gênero dos candidatos 2024",
  "Candidatos com maior patrimônio em 2024",
  "Ranking de partidos em Aparecida de Goiânia 2024",
  "Votos por zona eleitoral em Goiânia 2024",
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

  function handleSend(text?: string) {
    const q = text || input.trim();
    if (!q || loading) return;
    enviar(q);
    if (!text) setInput('');
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
  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant' && !m.loading);

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
            <p className="text-[10px] text-muted-foreground">Gere gráficos e visualizações sobre dados eleitorais de Goiás</p>
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
              {[...SUGESTOES_RAPIDAS, ...SUGESTOES_EXTRAS].map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(s)}
                  className="text-[11px] text-left px-3 py-2 rounded-lg border border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/25 hover:bg-primary/5 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onSalvar={adicionar}
                isSalvo={msg.role === 'user' ? isFavorito(msg.content) : false}
              />
            ))}

            {/* Contextual shortcuts after last response */}
            {lastAssistantMsg && !loading && (
              <div className="ml-11 flex flex-wrap gap-1.5 pt-1">
                {ATALHOS_POS_RESPOSTA.map((a, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(a)}
                    className="text-[10px] px-2.5 py-1.5 rounded-full border border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all"
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border/20 pt-3 shrink-0">
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
            onClick={() => handleSend()}
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
