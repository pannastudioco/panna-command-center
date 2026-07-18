import { useState, useEffect, useCallback } from 'react';
import type { TrackedKeyword, RankSnapshot } from '@/types';
import { getDb } from '@/services/db';

const STORAGE_KEY = 'pcc.trackedKeywords';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Manages the list of keywords the user tracks their own ranking for. The keyword list
 * itself is small and lives in localStorage; the rank-over-time history lives in
 * IndexedDB (rankHistory store) because it grows one row per keyword per check.
 *
 * Both async functions are useCallback-stable — same discipline as useCompetitorSnapshots
 * (a fresh reference in an effect dep list would loop).
 */
export const useRankTracker = () => {
  const [keywords, setKeywords] = useState<TrackedKeyword[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as TrackedKeyword[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keywords));
    } catch (e) {
      console.warn('Failed to persist tracked keywords:', e);
    }
  }, [keywords]);

  const addKeyword = useCallback((keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    setKeywords((prev) =>
      prev.some((k) => k.keyword.toLowerCase() === trimmed.toLowerCase())
        ? prev
        : [...prev, { keyword: trimmed, addedAt: new Date().toISOString() }]
    );
  }, []);

  const removeKeyword = useCallback((keyword: string) => {
    setKeywords((prev) => prev.filter((k) => k.keyword !== keyword));
  }, []);

  /** Persist one rank result for today (overwrites an earlier check the same day). */
  const recordRank = useCallback(async (snapshot: Omit<RankSnapshot, 'dateISO'>): Promise<void> => {
    const db = await getDb();
    await db.put('rankHistory', { ...snapshot, dateISO: todayISO() });
  }, []);

  const getHistory = useCallback(async (keyword: string): Promise<RankSnapshot[]> => {
    const db = await getDb();
    const all = await db.getAllFromIndex('rankHistory', 'byKeyword', keyword);
    return all.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  }, []);

  return { keywords, addKeyword, removeKeyword, recordRank, getHistory };
};
