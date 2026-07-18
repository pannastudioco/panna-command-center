import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'pcc.elevenLabsApiKey';

/**
 * Single ElevenLabs API key, persisted to localStorage only — pasted into the running app's
 * UI, NEVER written to a source file, same rule as every other key in this app. One key (not a
 * rotated pool) since ElevenLabs is a paid-per-character subscription, not a scarce free tier
 * that benefits from spreading load across several accounts.
 */
export const useElevenLabsKey = () => {
  const [elevenLabsKey, setElevenLabsKey] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (elevenLabsKey) localStorage.setItem(STORAGE_KEY, elevenLabsKey);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to persist ElevenLabs key:', e);
    }
  }, [elevenLabsKey]);

  const saveKey = useCallback((key: string) => setElevenLabsKey(key.trim() || null), []);
  const clearKey = useCallback(() => setElevenLabsKey(null), []);

  return { elevenLabsKey, saveKey, clearKey };
};
