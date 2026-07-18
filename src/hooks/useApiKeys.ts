import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'pcc.youtubeApiKeys';

/**
 * Manages the YouTube Data API v3 key pool.
 *
 * Deviates from Reality Architect's useApiKeys.ts on purpose: this app ships with
 * NO pre-loaded keys (empty pool by default — Kharis provides his own), so the
 * pool is persisted to localStorage. Reality Architect never persists keys because
 * it always has a hardcoded fallback pool; this app has none, so losing the pool
 * on refresh would break the tool entirely.
 */
export const useApiKeys = () => {
  const [youtubeApiKeys, setYoutubeApiKeys] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [youtubeApiKeyIndex, setYoutubeApiKeyIndex] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(youtubeApiKeys));
    } catch (e) {
      console.warn('Failed to persist API key pool:', e);
    }
  }, [youtubeApiKeys]);

  const handleKeysSubmitted = useCallback((keys: { youtubeKeys: string[] }) => {
    setYoutubeApiKeys((prev) => [...new Set([...prev, ...keys.youtubeKeys])]);
  }, []);

  const removeKey = useCallback((key: string) => {
    setYoutubeApiKeys((prev) => prev.filter((k) => k !== key));
  }, []);

  return {
    youtubeApiKeys,
    youtubeApiKeyIndex,
    setYoutubeApiKeyIndex,
    handleKeysSubmitted,
    removeKey,
  };
};
