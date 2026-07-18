import { useState, useCallback, useRef } from 'react';
import type { EditableVideo, YoutubeAuthState, ConnectedChannelState } from '@/types';
import {
  getAllVideoIdsFromPlaylist,
  getEditableVideoDetails,
} from '@/services/youtubeDataService';
import { QUOTA_COST } from '@/constants/quotas';

/**
 * Shared "load my own channel's videos ONCE" hook. Lifted to App level so the catalog is
 * fetched a single time and reused across EVERY module that needs it (Bulk Editor, Channel
 * Audit, Playlist Manager, AI Studio, Toolbox) — instead of each module (and each tab)
 * re-fetching and re-spending Data API quota on every switch.
 *
 * Every returned function is useCallback-stable — the same discipline that fixed the
 * earlier infinite-render loop; these are handed to child components that may list them
 * in effect deps.
 */
export const useOwnVideoCatalog = (
  auth: YoutubeAuthState,
  channel: ConnectedChannelState,
  recordUnits: (units: number) => void
) => {
  const { accessToken } = auth;
  const { channelInfo } = channel;

  const [videos, setVideos] = useState<EditableVideo[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mirror of the latest loaded videos, readable synchronously inside loadCatalog's
  // idempotent guard without adding `videos` to its dependency list (which would rebuild
  // the callback every load and risk the effect-loop class of bug).
  const videosRef = useRef<EditableVideo[]>([]);

  /**
   * Loads the catalog and RETURNS the videos (so callers that compose it into a larger
   * async flow — e.g. Channel Audit joining views by videoId — get them directly). Skips
   * the network entirely if already loaded, unless `force` is passed (the "Muat Ulang"
   * buttons). Returning + skipping is what makes cross-module sharing free.
   */
  const loadCatalog = useCallback(
    async (force = false): Promise<EditableVideo[]> => {
      if (!accessToken || !channelInfo) return [];
      if (!force && videosRef.current.length > 0) return videosRef.current;
      setError(null);
      setIsLoading(true);
      try {
        if (!channelInfo.uploadsPlaylistId) {
          setVideos([]);
          videosRef.current = [];
          setHasLoaded(true);
          return [];
        }
        const { videoIds, pagesFetched } = await getAllVideoIdsFromPlaylist(channelInfo.uploadsPlaylistId, accessToken);
        recordUnits(pagesFetched * QUOTA_COST.playlistItemsList);
        const details = await getEditableVideoDetails(videoIds, accessToken);
        recordUnits(Math.ceil(videoIds.length / 50) * QUOTA_COST.videosList);
        setVideos(details);
        videosRef.current = details;
        setHasLoaded(true);
        return details;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal memuat katalog video.');
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [accessToken, channelInfo, recordUnits]
  );

  /** Patch one video in the in-memory catalog after a successful write, so the score /
   * recommendations recompute against the new state without a refetch. */
  const applyLocalPatch = useCallback((videoId: string, patch: Partial<EditableVideo>) => {
    setVideos((prev) => {
      const next = prev.map((v) => (v.videoId === videoId ? { ...v, ...patch } : v));
      videosRef.current = next;
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setVideos([]);
    videosRef.current = [];
    setHasLoaded(false);
    setError(null);
  }, []);

  return { videos, hasLoaded, isLoading, error, loadCatalog, applyLocalPatch, reset };
};

/** The shape modules receive when the catalog is passed down from App. */
export type OwnVideoCatalog = ReturnType<typeof useOwnVideoCatalog>;
