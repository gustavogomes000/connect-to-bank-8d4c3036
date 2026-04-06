import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MotherDuckResponse {
  columns: { name: string; type: number }[];
  rows: Record<string, any>[];
  rowCount: number;
}

export function useMotherDuckQuery(sql: string, queryKey?: string[]) {
  const result = useQuery<MotherDuckResponse>({
    queryKey: queryKey || ['motherduck', sql],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('query-motherduck', {
        body: { query: sql },
      });

      if (error) throw new Error(error.message || 'Erro ao chamar query-motherduck');
      if (data?.error) throw new Error(data.error);

      return data as MotherDuckResponse;
    },
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: result.data,
    isLoading: result.isLoading,
    error: result.error as Error | null,
  };
}
