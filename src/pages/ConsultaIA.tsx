import { useState, useRef, useEffect, type ComponentPropsWithoutRef } from 'react';
import { useConsultaIA, type ChatMessage } from '@/hooks/useConsultaIA';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  MessageSquare, Send, Loader2, Lightbulb, Trash2, Code2, X,
  User, Bot, AlertTriangle, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const SUGESTOES_INICIAIS = [
  'Quem foram os candidatos mais votados para vereador em Goiânia em 2024?',
  'Quantos candidatos concorreram a prefeito em 2024 em Goiás?',
  'Qual o perfil de gênero dos candidatos em 2024?',
  'Qual partido teve mais vereadores eleitos em Goiânia em 2024?',
  'Compare abstenção em Aparecida de Goiânia vs Goiânia',
  'Quais candidatos declararam maior patrimônio em 2024?',
];

const ATALHOS_CONTEXTUAIS = [
  'Resuma os bens do candidato "Maguito Vilela"',
  'Compare abstenção em Aparecida vs Goiânia',
  'Top 10 vereadores mais ricos em 2024',
  'Evolução do comparecimento em Goiânia',
];

// ═══════════════════════════════════════════════════════════════
// MARKDOWN COMPONENTS — shadcn-styled overrides for react-markdown
// ═══════════════════════════════════════════════════════════════

const mdComponents: ComponentPropsWithoutRef<typeof ReactMarkdown>['components'] = {
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border/30">
      <table className="w-full caption-bottom text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted/40 [&_tr]:border-b">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="[&_tr:last-child]:border-0">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="border-b border-border/10 transition-colors hover:bg-muted/30">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="h-8 px-3 text-left align-middle font-medium text-muted-foreground text-[10px] uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 align-middle text-xs">{children}</td>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="my-1.5 ml-4 list-disc [&>li]:mt-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 ml-4 list-decimal [&>li]:mt-0.5">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm leading-relaxed">{children}</li>
  ),
  p: ({ children }) => (
    <p className="my-1 text-sm leading-relaxed">{children}</p>
  ),
  h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
  code: ({ children }) => (
    <code className="text-[11px] bg-muted/50 rounded px-1 py-0.5 font-mono">{children}</code>
  ),
};

// ═══════════════════════════════════════════════════════════════
// SKELETON LOADER — simulates text + table while loading
// ═══════════════════════════════════════════════════════════════

function MessageSkeleton() {
  return (
    <div className="space-y-3 w-full max-w-[85%]">
      {/* Simulated text lines */}
      <Skeleton className="h-3.5 w-[90%] rounded" />
      <Skeleton className="h-3.5 w-[75%] rounded" />
      <Skeleton className="h-3.5 w-[60%] rounded" />
      {/* Simulated table */}
      <div className="mt-3 rounded-lg border border-border/20 overflow-hidden">
        <div className="bg-muted/30 px-3 py-2 flex gap-6">
          <Skeleton className="h-3 w-20 rounded" />
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-3 w-14 rounded" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-3 py-2 flex gap-6 border-t border-border/10">
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-3 w-14 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ERROR BANNER — styled with shadcn Alert + suggestion chips
// ═══════════════════════════════════════════════════════════════

function ErrorBanner({
  message,
  suggestions,
  onSuggestionClick,
}: {
  message: string;
  suggestions: string[];
  onSuggestionClick: (s: string) => void;
}) {
  return (
    <Alert variant="destructive" className="bg-destructive/5 border-destructive/20">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="space-y-2">
        <p className="text-sm font-medium">{message}</p>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="text-[10px] text-muted-foreground mr-1">Tente:</span>
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick(s)}
                className="text-[10px] px-2 py-1 rounded-full border border-border/40 text-foreground/70 hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE BUBBLE
// ═══════════════════════════════════════════════════════════════

function MessageBubble({
  msg,
  showSQL,
  onToggleSQL,
  onSuggestionClick,
}: {
  msg: ChatMessage;
  showSQL: boolean;
  onToggleSQL: () => void;
  onSuggestionClick: (s: string) => void;
}) {
  const isUser = msg.role === 'user';

  return (
    <div className={cn('flex gap-3 max-w-full', isUser ? 'justify-end' : 'justify-start')}>
      {/* Avatar */}
      {!isUser && (
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1 border',
          msg.status === 'error'
            ? 'bg-destructive/10 border-destructive/20'
            : 'bg-primary/15 border-primary/20'
        )}>
          {msg.status === 'error'
            ? <AlertTriangle className="w-4 h-4 text-destructive/70" />
            : <Bot className="w-4 h-4 text-primary" />
          }
        </div>
      )}

      {/* Bubble */}
      <div className={cn(
        'rounded-2xl px-4 py-3 max-w-[85%] text-sm leading-relaxed',
        isUser
          ? 'bg-primary text-primary-foreground rounded-br-md'
          : msg.status === 'error'
            ? 'bg-card border border-destructive/20 rounded-bl-md'
            : 'bg-card border border-border/30 text-foreground rounded-bl-md'
      )}>
        {msg.status === 'loading' ? (
          <MessageSkeleton />
        ) : isUser ? (
          <p>{msg.content}</p>
        ) : msg.status === 'error' ? (
          <ErrorBanner
            message={msg.content}
            suggestions={
              msg.errorType === 'intent_unknown'
                ? ['Quem foram os vereadores mais votados em Goiânia 2024?', 'Patrimônio dos candidatos a prefeito 2024']
                : msg.errorType === 'rate_limit'
                  ? ['Aguarde 10s e tente novamente']
                  : ['Top 10 candidatos mais votados em 2024', 'Resumo geral da eleição de 2024']
            }
            onSuggestionClick={onSuggestionClick}
          />
        ) : (
          <div className="space-y-1">
            <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:my-1 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {msg.content}
              </ReactMarkdown>
            </div>
            {msg.sql_gerado && (
              <button
                onClick={onToggleSQL}
                className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors mt-2"
              >
                <Code2 className="w-3 h-3" />
                {showSQL ? 'Ocultar SQL' : 'Ver SQL'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-lg bg-muted/50 border border-border/20 flex items-center justify-center shrink-0 mt-1">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function ConsultaIA() {
  const { messages, loading, consultar, limpar } = useConsultaIA();
  const [pergunta, setPergunta] = useState('');
  const [showSQLFor, setShowSQLFor] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function enviar(text?: string) {
    const q = text || pergunta.trim();
    if (!q) return;
    consultar(q);
    if (!text) setPergunta('');
  }

  const isEmpty = messages.length === 0;
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const showContextualChips = lastMsg?.role === 'assistant' && lastMsg.status === 'success';

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">Consulta por IA</h1>
            <p className="text-[10px] text-muted-foreground">
              Pergunte sobre eleições de Goiás — respostas em texto com dados do TSE
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={limpar} className="text-xs h-8 text-muted-foreground">
            <Trash2 className="w-3 h-3 mr-1" /> Limpar
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 min-h-0">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-primary/60" />
            </div>
            <h2 className="text-base font-semibold text-foreground mb-1">O que você quer saber?</h2>
            <p className="text-xs text-muted-foreground mb-6 max-w-md">
              Faça perguntas sobre eleições de Goiás e receba respostas detalhadas baseadas nos dados oficiais do TSE.
            </p>
            <div className="flex items-center gap-1.5 mb-3">
              <Lightbulb className="w-3.5 h-3.5 text-yellow-500" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Sugestões</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {SUGESTOES_INICIAIS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => enviar(s)}
                  className="text-left text-[11px] px-3 py-2.5 rounded-lg border border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <div key={msg.id}>
                <MessageBubble
                  msg={msg}
                  showSQL={showSQLFor === msg.id}
                  onToggleSQL={() => setShowSQLFor(showSQLFor === msg.id ? null : msg.id)}
                  onSuggestionClick={enviar}
                />
                {showSQLFor === msg.id && msg.sql_gerado && (
                  <div className="ml-11 mt-2 mb-1">
                    <div className="bg-muted/30 rounded-lg p-3 border border-border/20 relative">
                      <button onClick={() => setShowSQLFor(null)} className="absolute top-2 right-2">
                        <X className="w-3 h-3 text-muted-foreground" />
                      </button>
                      <pre className="text-[10px] text-muted-foreground font-mono whitespace-pre-wrap overflow-x-auto">
                        {msg.sql_gerado}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Contextual shortcut chips */}
            {showContextualChips && !loading && (
              <div className="ml-11 flex flex-wrap gap-1.5">
                <Zap className="w-3 h-3 text-muted-foreground/40 mt-1" />
                {ATALHOS_CONTEXTUAIS.map((a, i) => (
                  <button
                    key={i}
                    onClick={() => enviar(a)}
                    className="text-[10px] px-2.5 py-1.5 rounded-full border border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all"
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 pt-2 border-t border-border/20">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
            <Input
              ref={inputRef}
              value={pergunta}
              onChange={e => setPergunta(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && enviar()}
              placeholder="Faça uma pergunta sobre eleições..."
              className="pl-10 h-11 text-sm bg-muted/20 border-border/30 rounded-lg"
              disabled={loading}
            />
          </div>
          <Button
            onClick={() => enviar()}
            disabled={loading || !pergunta.trim()}
            className="h-11 px-5 rounded-lg font-medium"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-[9px] text-muted-foreground/40 text-center mt-2">
          Dados eleitorais do TSE • Goiás 2014–2024 • SQL 100% determinístico
        </p>
      </div>
    </div>
  );
}
