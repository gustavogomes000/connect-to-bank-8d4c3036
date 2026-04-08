import { useState, useRef, useEffect } from 'react';
import { useConsultaIA, type ChatMessage } from '@/hooks/useConsultaIA';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  MessageSquare, Send, Loader2, Lightbulb, Trash2, Code2, X, User, Bot,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const SUGESTOES = [
  'Quem foram os candidatos mais votados para vereador em Goiânia em 2024?',
  'Quantos candidatos concorreram a prefeito em 2024 em Goiás?',
  'Qual o perfil de gênero dos candidatos em 2024?',
  'Qual partido teve mais vereadores eleitos em Goiânia em 2024?',
  'Como foi o comparecimento eleitoral em Goiânia em 2024?',
  'Quais candidatos declararam maior patrimônio em 2024?',
];

const ATALHOS_CONTEXTUAIS = [
  'Resuma os bens do candidato "Maguito Vilela"',
  'Compare abstenção em Aparecida vs Goiânia',
  'Top 10 vereadores mais ricos em 2024',
  'Evolução do comparecimento em Goiânia',
];

function formatMarkdown(text: string): string {
  if (!text) return '';
  let html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  html = html.replace(/(<li>.*?<\/li>)+/gs, (match) => `<ul>${match}</ul>`);

  // Table support with shadcn-like styling
  if (html.includes('|')) {
    html = html.replace(/(<p>)?\|(.+?)\|(<br\/>)?\|[-\s|]+\|((<br\/>)?\|.+?\|)+/gs, (match) => {
      const lines = match.replace(/<\/?p>/g, '').replace(/<br\/>/g, '\n').trim().split('\n').filter(l => l.includes('|'));
      if (lines.length < 2) return match;
      const headers = lines[0].split('|').filter(Boolean).map(h =>
        `<th class="h-8 px-3 text-left align-middle font-medium text-muted-foreground text-[10px] uppercase tracking-wider">${h.trim()}</th>`
      ).join('');
      const rows = lines.slice(2).map((line, i) => {
        const cells = line.split('|').filter(Boolean).map(c =>
          `<td class="px-3 py-2 align-middle text-xs">${c.trim()}</td>`
        ).join('');
        return `<tr class="border-b border-border/10 transition-colors hover:bg-muted/30 ${i % 2 === 0 ? 'bg-muted/5' : ''}">${cells}</tr>`;
      }).join('');
      return `<div class="my-3 overflow-x-auto rounded-lg border border-border/30"><table class="w-full caption-bottom text-sm"><thead><tr class="border-b border-border/20 bg-muted/40">${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
    });
  }

  return `<p>${html}</p>`;
}

function MessageBubble({ msg, onToggleSQL }: { msg: ChatMessage; onToggleSQL?: () => void }) {
  const isUser = msg.role === 'user';

  return (
    <div className={cn('flex gap-3 max-w-full', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0 mt-1">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}
      <div className={cn(
        'rounded-2xl px-4 py-3 max-w-[85%] text-sm leading-relaxed',
        isUser
          ? 'bg-primary text-primary-foreground rounded-br-md'
          : 'bg-card border border-border/30 text-foreground rounded-bl-md'
      )}>
        {msg.loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Consultando dados...</span>
          </div>
        ) : isUser ? (
          <p>{msg.content}</p>
        ) : (
          <div className="space-y-2">
            <div
              className="prose prose-sm max-w-none dark:prose-invert [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_strong]:text-foreground"
              dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
            />
            {msg.sql_gerado && onToggleSQL && (
              <button onClick={onToggleSQL} className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors mt-2">
                <Code2 className="w-3 h-3" />
                Ver SQL
              </button>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-lg bg-muted/50 border border-border/20 flex items-center justify-center shrink-0 mt-1">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

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
  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant' && !m.loading);

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
            <p className="text-[10px] text-muted-foreground">Pergunte sobre eleições de Goiás e receba respostas em texto</p>
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
              {SUGESTOES.map((s, i) => (
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
                  onToggleSQL={msg.sql_gerado ? () => setShowSQLFor(showSQLFor === msg.id ? null : msg.id) : undefined}
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

            {/* Contextual shortcuts after last response */}
            {lastAssistantMsg && !loading && (
              <div className="ml-11 flex flex-wrap gap-1.5">
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
          <Button onClick={() => enviar()} disabled={loading || !pergunta.trim()} className="h-11 px-5 rounded-lg font-medium">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
