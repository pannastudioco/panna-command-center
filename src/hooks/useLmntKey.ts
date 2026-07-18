import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'pcc.lmntApiKey';

/**
 * Single LMNT API key, persisted to localStorage only — same rule as every other key in this
 * app (pasted into the UI, never written to source). One key, not a pool — paid-per-character
 * subscription like ElevenLabs, not a scarce free tier.
 */
export const useLmntKey = () => {
  const [lmntKey, setLmntKey] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (lmntKey) localStorage.setItem(STORAGE_KEY, lmntKey);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to persist LMNT key:', e);
    }
  }, [lmntKey]);

  const saveKey = useCallback((key: string) => setLmntKey(key.trim() || null), []);
  const clearKey = useCallback(() => setLmntKey(null), []);

  return { lmntKey, saveKey, clearKey };
};
