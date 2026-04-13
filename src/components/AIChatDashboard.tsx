import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, BrainCircuit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

export const AIChatDashboard = ({ sqCandidato, nomeCandidato }: { sqCandidato?: string, nomeCandidato?: string }) => {
  const [messages, setMessages] = useState<{role: 'user'|'assistant', content: string}[]>([
    { 
      role: 'assistant', 
      content: `Olá! Sou a Sarelli Inteligência Artificial. \nPosso analisar o Dossiê 360º de **${nomeCandidato || 'este candidato'}** e cruzar informações sobre patrimônio, força territorial e histórico eleitoral. O que você gostaria de saber?` 
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setIsLoading(true);

    try {
      const promptContextual = sqCandidato 
        ? `[CONTEXTO: O usuário está visualizando o dossiê do candidato ${nomeCandidato} (SQ: ${sqCandidato}). Responda a pergunta com foco neste candidato.] ${userMsg}`
        : userMsg;

      const { data, error } = await supabase.functions.invoke('bd-eleicoes-chat', {
        body: { pergunta: promptContextual },
      });

      if (error) throw new Error(error.message || 'Erro na comunicação com a IA');
      if (data?.erro && !data?.sucesso) throw new Error(data.erro);

      const resposta = data?.resposta_texto || data?.config_visual?.descricao || 'Consulta realizada.';
      setMessages(prev => [...prev, { role: 'assistant', content: resposta }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Ocorreu um erro ao consultar os dados. Por favor, tente novamente.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border/40 shadow-sm flex flex-col h-[500px] overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border/40 bg-muted/30 flex items-center gap-2">
        <div className="bg-primary/20 p-1.5 rounded-md border border-primary/30">
          <BrainCircuit className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Sarelli AI</h3>
          <p className="text-[10px] text-muted-foreground uppercase">Assistente de Dossiê Político</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center border ${
              msg.role === 'user' 
                ? 'bg-muted border-border/50 text-muted-foreground' 
                : 'bg-primary/10 border-primary/30 text-primary'
            }`}>
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={`max-w-[80%] rounded-2xl p-3 text-sm ${
              msg.role === 'user'
                ? 'bg-muted text-foreground rounded-tr-sm'
                : 'bg-primary/5 border border-primary/10 text-foreground shadow-sm rounded-tl-sm'
            }`}>
              {msg.content.split('\n').map((line, j) => (
                <span key={j}>
                  {line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').split('<strong>').map((part, k) => {
                    const match = part.split('</strong>');
                    return match.length > 1 ? <React.Fragment key={k}><strong>{match[0]}</strong>{match[1]}</React.Fragment> : part;
                  })}
                  {j < msg.content.split('\n').length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/30 text-primary flex items-center justify-center relative overflow-hidden">
               <Bot className="w-4 h-4 z-10" />
               <div className="absolute inset-0 bg-primary/20 animate-pulse" />
            </div>
            <div className="bg-primary/5 border border-primary/10 rounded-2xl rounded-tl-sm p-4 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Analisando Dossiê e Cruzando Dados...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-border/40 bg-background/50">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isLoading}
            placeholder="Ex: Qual o colégio eleitoral onde ele mais cresceu?"
            className="w-full bg-muted border border-border/50 text-foreground text-sm rounded-full py-3 pl-4 pr-12 focus:outline-none focus:border-primary/50 transition-colors"
          />
          <Button
            type="submit"
            disabled={!input.trim() || isLoading}
            size="icon"
            className="absolute right-1.5 rounded-full w-8 h-8 bg-primary hover:bg-primary/90 text-white"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </Button>
        </div>
      </form>
    </div>
  );
};
