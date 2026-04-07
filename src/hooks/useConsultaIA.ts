import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ConsultaResultado {
  sucesso: boolean;
  tipo_grafico: 'bar' | 'pie' | 'line' | 'area' | 'table' | 'kpi';
  titulo: string;
  descricao: string;
  colunas: string[];
  dados: Record<string, any>[];
  sql_gerado?: string;
  erro?: string;
}

function parseErroAmigavel(msg: string): string {
  if (msg.includes('429') || msg.includes('RATE_LIMIT') || msg.includes('quota'))
    return 'O sistema está processando muitas solicitações. Aguarde alguns segundos e tente novamente.';
  if (msg.includes('402'))
    return 'Serviço temporariamente indisponível. Tente novamente mais tarde.';
  if (msg.includes('timeout') || msg.includes('TIMEOUT'))
    return 'A consulta demorou mais do que o esperado. Tente simplificar a pergunta.';
  if (msg.includes('MOTHERDUCK') || msg.includes('connection'))
    return 'Erro de conexão com o banco de dados. Tente novamente em alguns instantes.';
  if (msg.includes('Query') || msg.includes('query') || msg.includes('SQL'))
    return 'Não foi possível processar essa consulta. Tente reformular de outra forma.';
  if (msg.includes('formato') || msg.includes('JSON'))
    return 'O sistema não conseguiu interpretar sua solicitação. Tente ser mais específico.';
  return 'Ocorreu um erro ao processar sua solicitação. Tente novamente.';
}

export function useConsultaIA() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ConsultaResultado | null>(null);
  const [historico, setHistorico] = useState<Array<{ consulta: string; resultado: ConsultaResultado }>>([]);
  const [erro, setErro] = useState<string | null>(null);

  async function consultar(pergunta: string) {
    setLoading(true);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke('bd-eleicoes-consulta-ia', {
        body: { pergunta },
      });
      if (error) throw new Error(error.message);
      if (data?.erro) throw new Error(data.erro);
      const res = data as ConsultaResultado;
      setResultado(res);
      setHistorico(prev => [{ consulta: pergunta, resultado: res }, ...prev].slice(0, 20));
    } catch (e: any) {
      setErro(parseErroAmigavel(e.message || ''));
      setResultado(null);
    } finally {
      setLoading(false);
    }
  }

  return { consultar, loading, resultado, historico, erro, limpar: () => { setResultado(null); setErro(null); } };
}
