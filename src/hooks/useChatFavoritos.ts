import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'eleicoes_chat_favoritos';
const MAX_FAVORITOS = 30;

export interface ChatFavorito {
  id: string;
  pergunta: string;
  criadoEm: string;
}

function load(): ChatFavorito[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(favs: ChatFavorito[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
}

export function useChatFavoritos() {
  const [favoritos, setFavoritos] = useState<ChatFavorito[]>(load);

  useEffect(() => { save(favoritos); }, [favoritos]);

  const adicionar = useCallback((pergunta: string) => {
    const trimmed = pergunta.trim();
    if (!trimmed) return;
    setFavoritos(prev => {
      if (prev.some(f => f.pergunta === trimmed)) return prev;
      const novo: ChatFavorito = { id: `fav_${Date.now()}`, pergunta: trimmed, criadoEm: new Date().toISOString() };
      return [novo, ...prev].slice(0, MAX_FAVORITOS);
    });
  }, []);

  const remover = useCallback((id: string) => {
    setFavoritos(prev => prev.filter(f => f.id !== id));
  }, []);

  const isFavorito = useCallback((pergunta: string) => {
    return favoritos.some(f => f.pergunta === pergunta.trim());
  }, [favoritos]);

  return { favoritos, adicionar, remover, isFavorito };
}
