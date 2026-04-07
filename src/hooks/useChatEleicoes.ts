import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  resultado?: ChatResultado | null;
  loading?: boolean;
}

export interface ChatResultado {
  sucesso: boolean;
  tipo_grafico: 'bar' | 'pie' | 'line' | 'area' | 'table' | 'kpi';
  titulo: string;
  descricao: string;
  resposta_texto: string;
  colunas: string[];
  dados: Record<string, any>[];
  sql_gerado?: string;
  intent?: string;
  entities_encontradas?: Record<string, any>;
  erro?: string;
}

let msgCounter = 0;
function genId() {
  return `msg_${Date.now()}_${++msgCounter}`;
}

function parseErroAmigavel(msg: string): string {
  if (msg.includes('429') || msg.includes('RATE_LIMIT') || msg.includes('quota') || msg.includes('Resource has been exhausted'))
    return 'O sistema está processando muitas solicitações. Aguarde alguns segundos e tente novamente.';
  if (msg.includes('timeout') || msg.includes('TIMEOUT'))
    return 'A consulta demorou mais do que o esperado. Tente simplificar a pergunta.';
  if (msg.includes('MOTHERDUCK') || msg.includes('connection'))
    return 'Erro de conexão com o banco de dados. Tente novamente em alguns instantes.';
  if (msg.includes('GEMINI') || msg.includes('Gemini'))
    return 'Serviço temporariamente indisponível. Tente novamente em alguns instantes.';
  return 'Não foi possível processar sua consulta. Tente novamente.';
}

export function useChatEleicoes() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const lastRequestRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const COOLDOWN_MS = 4500;

  const startCooldown = useCallback((durationMs = COOLDOWN_MS) => {
    const end = Date.now() + durationMs;
    lastRequestRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, end - Date.now());
      setCooldownRemaining(Math.ceil(remaining / 1000));
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        setCooldownRemaining(0);
        setIsRateLimited(false);
      }
    }, 200);
    setCooldownRemaining(Math.ceil(durationMs / 1000));
  }, []);

  const enviar = useCallback(async (pergunta: string) => {
    const trimmed = pergunta.trim();
    if (!trimmed || loading) return;

    const timeSinceLast = Date.now() - lastRequestRef.current;
    if (timeSinceLast < COOLDOWN_MS && lastRequestRef.current > 0) {
      const wait = COOLDOWN_MS - timeSinceLast;
      startCooldown(wait);
      await new Promise(r => setTimeout(r, wait));
    }

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    const assistantId = genId();
    const loadingMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      loading: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setLoading(true);
    startCooldown();

    try {
      const { data, error } = await supabase.functions.invoke('bd-eleicoes-chat', {
        body: { pergunta: trimmed },
      });

      if (error) throw new Error(error.message);

      const errMsg = data?.erro || '';
      if (errMsg.includes('429') || errMsg.includes('RATE_LIMIT') || errMsg.includes('quota') || errMsg.includes('Resource has been exhausted')) {
        setIsRateLimited(true);
        startCooldown(30000);
        throw new Error(errMsg);
      }

      if (data?.erro && !data?.sucesso) throw new Error(data.erro);

      const resultado = data as ChatResultado;

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: resultado.resposta_texto || resultado.descricao || 'Consulta realizada com sucesso.',
                resultado,
                loading: false,
              }
            : m
        )
      );
    } catch (e: any) {
      const friendlyMsg = parseErroAmigavel(e.message || '');
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: friendlyMsg,
                loading: false,
              }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, [loading, startCooldown]);

  const limpar = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, loading, enviar, limpar, cooldownRemaining, isRateLimited };
}
