import { useState, useCallback, useRef } from 'react';

const COOLDOWN_MS = 4500; // 4.5s entre requests (Gemini free = 15 RPM)
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5000;

export function useRateLimit() {
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const lastRequestRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

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

  const canRequest = useCallback(() => {
    return Date.now() - lastRequestRef.current >= COOLDOWN_MS;
  }, []);

  const handleRateLimitError = useCallback((error: string) => {
    if (error.includes('429') || error.includes('RATE_LIMIT') || error.includes('quota') || error.includes('Resource has been exhausted')) {
      setIsRateLimited(true);
      startCooldown(30000); // 30s cooldown on rate limit
      return true;
    }
    return false;
  }, [startCooldown]);

  const executeWithRetry = useCallback(async <T>(
    fn: () => Promise<T>,
    onRetry?: (attempt: number) => void
  ): Promise<T> => {
    if (!canRequest()) {
      const wait = COOLDOWN_MS - (Date.now() - lastRequestRef.current);
      await new Promise(r => setTimeout(r, wait));
    }

    startCooldown();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (e: any) {
        const msg = e?.message || '';
        if (handleRateLimitError(msg)) {
          if (attempt < MAX_RETRIES) {
            onRetry?.(attempt + 1);
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
            continue;
          }
        }
        throw e;
      }
    }
    throw new Error('Limite de tentativas excedido');
  }, [canRequest, startCooldown, handleRateLimitError]);

  return {
    cooldownRemaining,
    isRateLimited,
    canRequest,
    startCooldown,
    handleRateLimitError,
    executeWithRetry,
  };
}
