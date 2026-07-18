import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'pcc.geminiApiKeys';
/** The old single-key slot — migrated into the pool on first load, then removed. */
const LEGACY_STORAGE_KEY = 'pcc.geminiApiKey';

function loadInitial(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((k): k is string => typeof k === 'string' && k.length > 0);
    }
    // Migrate a previously-saved single key so the user doesn't have to re-paste it.
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) return [legacy];
  } catch {
    /* storage unavailable — start empty */
  }
  return [];
}

/**
 * Rotating pool of Gemini API keys, persisted to localStorage only — same rule as the
 * YouTube keys: pasted into the running app's UI, NEVER written to a source file.
 *
 * Why a pool: Gemini's free tier is brutally small (Kharis's dashboard: 20 requests/DAY on
 * gemini-3.5-flash), and one optimisation pass burns several calls. Round-robin across keys
 * multiplies the usable quota.
 *
 * IMPORTANT CAVEAT (surfaced in the UI, not hidden): the free-tier quota is metered per
 * Google Cloud PROJECT, not per key. Several keys from the SAME project share one quota and
 * buy you nothing — the keys must come from different projects/accounts to actually add
 * headroom.
 */
export const useGeminiKeys = () => {
  const [geminiKeys, setGeminiKeys] = useState<string[]>(loadInitial);
  // Round-robin cursor. A ref (not state) so advancing it never triggers a re-render — the
  // rotation is a side-effect of calling, not something the UI renders.
  const cursorRef = useRef(0);

  useEffect(() => {
    try {
      if (geminiKeys.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(geminiKeys));
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to persist Gemini keys:', e);
    }
  }, [geminiKeys]);

  const addKey = useCallback((key: string) => {
    const trimmed = key.trim();
    if (!trimmed) return;
    // Dedupe: re-adding the same key would skew the round-robin toward it.
    setGeminiKeys((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  }, []);

  const removeKey = useCallback((key: string) => {
    setGeminiKeys((prev) => {
      const next = prev.filter((k) => k !== key);
      // Keep the cursor inside the new bounds.
      if (cursorRef.current >= next.length) cursorRef.current = 0;
      return next;
    });
  }, []);

  const clearKeys = useCallback(() => {
    cursorRef.current = 0;
    setGeminiKeys([]);
  }, []);

  /** Returns the keys ordered starting at the round-robin cursor, and advances it by one.
   * The caller tries them in order, so a limited key falls through to the next immediately. */
  const nextKeyOrder = useCallback((): string[] => {
    if (geminiKeys.length === 0) return [];
    const start = cursorRef.current % geminiKeys.length;
    cursorRef.current = (start + 1) % geminiKeys.length;
    return [...geminiKeys.slice(start), ...geminiKeys.slice(0, start)];
  }, [geminiKeys]);

  return { geminiKeys, addKey, removeKey, clearKeys, nextKeyOrder, hasKeys: geminiKeys.length > 0 };
};

export type GeminiKeyPool = ReturnType<typeof useGeminiKeys>;
