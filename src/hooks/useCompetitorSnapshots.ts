import { useCallback } from 'react';
import type { ChannelSnapshot, ChannelStats } from '@/types';
import { getDb } from '@/services/db';

/** YYYY-MM-DD in the browser's local timezone — snapshots are daily, not tied to
 * YouTube's own Pacific-Time quota-reset boundary (that distinction doesn't matter
 * here, this is just "did I already snapshot today"). */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Local history of watched channels' public stats over time. The YouTube API only
 * ever returns CURRENT totals for a channel that isn't yours — trend lines only exist
 * because this app takes and stores its own daily snapshot locally.
 */
export const useCompetitorSnapshots = () => {
  // Both must be useCallback-stable: getHistory is a useEffect dependency in
  // CompetitorTracker, and a fresh function reference on every render there would
  // re-fire that effect every render — setState inside it then triggers another
  // render, another fresh reference, another fire: an infinite loop (reproduced and
  // confirmed live — "Maximum update depth exceeded" — before this fix).
  const recordSnapshotIfNew = useCallback(async (stats: ChannelStats): Promise<boolean> => {
    const db = await getDb();
    const dateISO = todayISO();
    const existing = await db.get('channelSnapshots', [stats.channelId, dateISO]);
    if (existing) return false; // Already snapshotted today — don't overwrite.

    const snapshot: ChannelSnapshot = {
      channelId: stats.channelId,
      dateISO,
      subscriberCount: stats.subscriberCount,
      viewCount: stats.viewCount,
      videoCount: stats.videoCount,
    };
    await db.put('channelSnapshots', snapshot);
    return true;
  }, []);

  const getHistory = useCallback(async (channelId: string): Promise<ChannelSnapshot[]> => {
    const db = await getDb();
    const all = await db.getAllFromIndex('channelSnapshots', 'byChannel', channelId);
    return all.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  }, []);

  return { recordSnapshotIfNew, getHistory };
};
