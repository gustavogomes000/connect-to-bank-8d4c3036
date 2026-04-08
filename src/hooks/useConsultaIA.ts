import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ═══════════════════════════════════════════════════════════════
// TYPES — strict contract with bd-eleicoes-consulta-ia
// ═══════════════════════════════════════════════════════════════

export interface ConsultaIAResponse {
  sucesso: boolean;
  resposta?: string;
  sql_gerado?: string;
  erro?: string;
}

export type MessageStatus = 'idle' | 'loading' | 'success' | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sql_gerado?: string;
  status: MessageStatus;
  errorType?: 'rate_limit' | 'intent_unknown' | 'query_error' | 'network' | 'generic';
}

// ═══════════════════════════════════════════════════════════════
// ERROR CLASSIFIER
// ═══════════════════════════════════════════════════════════════

interface ParsedError {
  message: string;
  type: ChatMessage['errorType'];
  suggestions: string[];
}

function classifyError(raw: string): ParsedError {
  const msg = raw.toLowerCase();

  if (msg.includes('429') || msg.includes('rate_limit') || msg.includes('quota') || msg.includes('resource has been exhausted')) {
    return {
      message: 'O sistema está processando muitas solicitações.',
      type: 'rate_limit',
      suggestions: [
        'Aguarde 10 segundos e tente novamente',
        'Tente uma pergunta mais simples',
      ],
    };
  }

  if (msg.includes('não entendi') || msg.includes('intenção') || msg.includes('reformul')) {
    return {
      message: 'Não consegui formular essa busca.',
      type: 'intent_unknown',
      suggestions: [
        'Quem foram os vereadores mais votados em Goiânia 2024?',
        'Qual o patrimônio declarado dos candidatos a prefeito?',
        'Compare abstenção em Aparecida vs Goiânia',
      ],
    };
  }

  if (msg.includes('timeout') || msg.includes('demorou')) {
    return {
      message: 'A consulta demorou mais do que o esperado.',
      type: 'query_error',
      suggestions: [
        'Tente simplificar a pergunta',
        'Busque por um município ou cargo específico',
      ],
    };
  }

  if (msg.includes('motherduck') || msg.includes('connection') || msg.includes('fetch')) {
    return {
      message: 'Erro de conexão com o banco de dados.',
      type: 'network',
      suggestions: ['Tente novamente em alguns instantes'],
    };
  }

  return {
    message: 'Ocorreu um erro ao processar sua solicitação.',
    type: 'generic',
    suggestions: [
      'Top 10 candidatos mais votados em 2024',
      'Resumo geral da eleição de 2024',
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════

let _counter = 0;
const genId = () => `msg_${Date.now()}_${++_counter}`;

const COOLDOWN_MS = 4500;

export function useConsultaIA() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const lastRequestRef = useRef(0);

  const consultar = useCallback(async (pergunta: string) => {
    const trimmed = pergunta.trim();
    if (!trimmed || loading) return;

    // Cooldown
    const elapsed = Date.now() - lastRequestRef.current;
    if (elapsed < COOLDOWN_MS && lastRequestRef.current > 0) {
      await new Promise(r => setTimeout(r, COOLDOWN_MS - elapsed));
    }

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
      status: 'idle',
    };

    const assistantId = genId();
    const loadingMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      status: 'loading',
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setLoading(true);
    lastRequestRef.current = Date.now();

    try {
      const { data, error } = await supabase.functions.invoke<ConsultaIAResponse>(
        'bd-eleicoes-consulta-ia',
        { body: { pergunta: trimmed } },
      );

      if (error) throw new Error(error.message);
      if (data?.erro && !data?.sucesso) throw new Error(data.erro);

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: data?.resposta || 'Consulta realizada com sucesso.',
                sql_gerado: data?.sql_gerado,
                status: 'success' as const,
              }
            : m
        )
      );
    } catch (e: unknown) {
      const rawMsg = e instanceof Error ? e.message : String(e);
      const parsed = classifyError(rawMsg);

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: parsed.message,
                status: 'error' as const,
                errorType: parsed.type,
              }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const limpar = useCallback(() => setMessages([]), []);

  // Derive last error for suggestion rendering
  const lastError = [...messages].reverse().find(m => m.status === 'error');
  const errorSuggestions = lastError ? classifyError(lastError.content).suggestions : [];

  return { messages, loading, consultar, limpar, errorSuggestions };
}
