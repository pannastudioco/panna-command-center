import { useState, useEffect, useCallback } from 'react';
import type { WatchedChannel } from '@/types';

const STORAGE_KEY = 'pcc.competitorWatchlist';

/** Persisted list of competitor channels being tracked — small (a handful of
 * entries), so plain localStorage is fine (matches the useApiKeys.ts pattern). */
export const useWatchlist = () => {
  const [watchlist, setWatchlist] = useState<WatchedChannel[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as WatchedChannel[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
    } catch (e) {
      console.warn('Failed to persist competitor watchlist:', e);
    }
  }, [watchlist]);

  const addChannel = useCallback((channel: WatchedChannel) => {
    setWatchlist((prev) => (prev.some((c) => c.channelId === channel.channelId) ? prev : [...prev, channel]));
  }, []);

  const removeChannel = useCallback((channelId: string) => {
    setWatchlist((prev) => prev.filter((c) => c.channelId !== channelId));
  }, []);

  return { watchlist, addChannel, removeChannel };
};
