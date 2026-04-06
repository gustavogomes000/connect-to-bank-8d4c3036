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
      setErro(e.message || 'Erro ao consultar');
      setResultado(null);
    } finally {
      setLoading(false);
    }
  }

  return { consultar, loading, resultado, historico, erro, limpar: () => { setResultado(null); setErro(null); } };
}
