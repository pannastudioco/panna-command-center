import { useCallback } from 'react';
import type { ModuleId } from '@/types';

const STORAGE_KEY = 'pcc.session';

interface SessionState {
  activeModule: ModuleId;
  theme: 'light' | 'dark';
}

/**
 * Versioned-JSON-blob localStorage pattern, adapted from Reality Architect's
 * hooks/useSessionPersistence.ts, scoped down to this app's UI-preference state.
 */
export const useSessionPersistence = () => {
  const saveSession = useCallback((state: SessionState) => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: '1.0', timestamp: new Date().toISOString(), ...state })
      );
    } catch (e) {
      console.warn('Failed to save session to localStorage:', e);
    }
  }, []);

  const loadSession = useCallback((): SessionState | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data.version) return null;
      return {
        activeModule: data.activeModule || 'keyword-research',
        theme: data.theme || 'dark',
      };
    } catch (e) {
      console.warn('Failed to load session from localStorage:', e);
      return null;
    }
  }, []);

  return { saveSession, loadSession };
};
