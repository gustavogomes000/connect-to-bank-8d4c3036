import { useState, useRef, useEffect } from 'react';
import { useFilterStore } from '@/stores/filterStore';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatEleicoes() {
  const ano = useFilterStore(state => state.ano);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Olá! Sou seu **Assistente Sarelli Inteligência**. \nEstou integrado à base de dados de **Logística e Finanças**.\n\nComo posso ajudar? Exemplos:\n- *Quais são as lideranças da escola X?*\n- *Quais são os maiores doadores neste setor?*'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta: userMessage, ano })
      });

      if (!res.ok) throw new Error('Falha na comunicação com nosso Data Warehouse.');
      
      const data = await res.json();
      
      setMessages(prev => [...prev, { role: 'assistant', content: data.resposta }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `**Falha técnica:** ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-5xl mx-auto rounded-3xl overflow-hidden border border-border shadow-sm bg-card">
      <div className="bg-card/80 backdrop-blur-md p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg border border-primary/20">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-foreground font-bold tracking-wide">Converse com a IA</h2>
            <p className="text-[10px] text-primary font-mono leading-none mt-1">Sarelli Inteligência Eleitoral</p>
          </div>
        </div>
        <span className="text-[10px] font-mono px-3 py-1.5 bg-primary/10 text-primary rounded-full border border-primary/30 uppercase tracking-wider flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          MotherDuck + Vector Search
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 md:gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0 shadow-lg">
                <Bot className="w-5 h-5 text-primary-foreground" />
              </div>
            )}
            
            <div className={`max-w-[85%] md:max-w-[75%] p-4 rounded-2xl ${
              msg.role === 'user' 
                ? 'bg-primary/10 text-foreground rounded-br-sm border border-primary/20 font-medium' 
                : 'bg-card text-foreground rounded-bl-sm border border-border shadow-sm'
            }`}>
              <div className="text-[10px] mb-2 opacity-70 font-bold uppercase tracking-wider flex items-center gap-1.5">
                {msg.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3 text-primary" />}
                {msg.role === 'user' ? 'Você' : 'Sarelli AI'}
              </div>
              
              <div className="prose prose-sm md:prose-base max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-muted flex items-center justify-center shrink-0 border border-border">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 md:gap-4 justify-start animate-in fade-in">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-primary-foreground animate-pulse" />
            </div>
            <div className="p-4 rounded-2xl bg-card rounded-bl-sm border border-border max-w-[200px]">
              <div className="flex space-x-2 items-center h-full">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-card/70 backdrop-blur-xl border-t border-border">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="relative flex items-center mx-auto w-full group">
          <input
            type="text"
            className="w-full bg-background border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/30 text-foreground placeholder-muted-foreground rounded-full py-4 pl-6 pr-16 outline-none transition-all duration-300"
            placeholder="Pergunte sobre setores eleitorais, lideranças ou finanças..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
          />
          <button 
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-50 hover:scale-105 transition-all duration-200 shadow-lg"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </form>
        <p className="text-center text-[10px] text-muted-foreground mt-3 font-mono">
          As consultas geram SQL Zero-IA executadas em alta-performance no <span className="text-primary">MotherDuck</span>.
        </p>
      </div>
    </div>
  );
}
