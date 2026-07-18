import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'pcc.geminiApiKey';

/**
 * Single Gemini API key, persisted to localStorage only — same rule as the YouTube keys:
 * the key is pasted into the running app's UI and NEVER written to a source file. One key
 * (not a rotated pool) since Gemini is called far less often than the YouTube endpoints.
 */
export const useGeminiKey = () => {
  const [geminiKey, setGeminiKey] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (geminiKey) localStorage.setItem(STORAGE_KEY, geminiKey);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to persist Gemini key:', e);
    }
  }, [geminiKey]);

  const saveKey = useCallback((key: string) => setGeminiKey(key.trim() || null), []);
  const clearKey = useCallback(() => setGeminiKey(null), []);

  return { geminiKey, saveKey, clearKey };
};
