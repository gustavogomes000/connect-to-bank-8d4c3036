import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000,      // 10 min
      gcTime: 24 * 60 * 60 * 1000,     // 24h (persist longer for cache)
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

export const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'eleicoes-go-cache',
  throttleTime: 2000,
  // Only persist successful queries under 500KB
  serialize: (data) => {
    try {
      const json = JSON.stringify(data);
      // Limit cache to ~4MB to avoid localStorage quota issues
      if (json.length > 4 * 1024 * 1024) {
        console.warn('[Cache] Dados muito grandes, ignorando persistência');
        return '{}';
      }
      return json;
    } catch {
      return '{}';
    }
  },
  deserialize: (data) => {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  },
});
