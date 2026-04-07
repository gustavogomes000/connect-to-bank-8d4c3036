import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'eleicoes_relatorios_salvos';
const MAX_SALVOS = 50;

export interface RelatorioSalvo {
  id: string;
  consulta: string;
  resposta: string;
  criadoEm: string;
}

function load(): RelatorioSalvo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(items: RelatorioSalvo[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useRelatoriosSalvos() {
  const [salvos, setSalvos] = useState<RelatorioSalvo[]>(load);

  useEffect(() => { save(salvos); }, [salvos]);

  const salvar = useCallback((consulta: string, resposta: string) => {
    setSalvos(prev => {
      if (prev.some(s => s.consulta === consulta.trim())) return prev;
      const novo: RelatorioSalvo = {
        id: `rel_${Date.now()}`,
        consulta: consulta.trim(),
        resposta,
        criadoEm: new Date().toISOString(),
      };
      return [novo, ...prev].slice(0, MAX_SALVOS);
    });
  }, []);

  const remover = useCallback((id: string) => {
    setSalvos(prev => prev.filter(s => s.id !== id));
  }, []);

  const isSalvo = useCallback((consulta: string) => {
    return salvos.some(s => s.consulta === consulta.trim());
  }, [salvos]);

  return { salvos, salvar, remover, isSalvo };
}
