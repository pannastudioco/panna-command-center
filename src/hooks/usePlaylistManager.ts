import { useState, useCallback, useRef } from 'react';
import type { YoutubeAuthState, PlaylistSummary, PlaylistItem } from '@/types';
import {
  getMyPlaylists,
  getPlaylistItems,
  createPlaylist,
  addVideoToPlaylist,
  removePlaylistItem,
  movePlaylistItem,
} from '@/services/youtubeDataService';
import { QUOTA_COST } from '@/constants/quotas';

/**
 * Shared "load my playlists ONCE" hook. Lifted to App level (same rationale as
 * useOwnVideoCatalog / useChannelAudit) so the playlist list AND each opened playlist's
 * items survive a tab switch and are not re-fetched (and re-billed) every time the user
 * returns to the Playlist Manager. Items are cached per playlist, so re-opening one you've
 * already viewed is instant.
 *
 * The hook owns the data + async mutations; the module keeps only ephemeral form state
 * (which video is ticked, the "create" form). Every returned function is useCallback-stable.
 */
export const usePlaylistManager = (auth: YoutubeAuthState, recordUnits: (units: number) => void) => {
  const { accessToken } = auth;

  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const playlistsRef = useRef<PlaylistSummary[]>([]);
  const itemsCacheRef = useRef<Map<string, PlaylistItem[]>>(new Map());

  const setItemsFor = useCallback((playlistId: string, next: PlaylistItem[]) => {
    itemsCacheRef.current.set(playlistId, next);
    setItems(next);
  }, []);

  const loadPlaylists = useCallback(
    async (force = false) => {
      if (!accessToken) return;
      // Cross-tab reuse: already have the list → no network, no quota.
      if (!force && playlistsRef.current.length > 0) return;
      setError(null);
      setIsLoadingPlaylists(true);
      try {
        const { playlists: pls, pagesFetched } = await getMyPlaylists(accessToken);
        recordUnits(pagesFetched * QUOTA_COST.playlistsList);
        setPlaylists(pls);
        playlistsRef.current = pls;
        setHasLoaded(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal memuat playlist.');
      } finally {
        setIsLoadingPlaylists(false);
      }
    },
    [accessToken, recordUnits]
  );

  const selectPlaylist = useCallback(
    async (playlistId: string, force = false) => {
      if (!accessToken) return;
      setSelectedId(playlistId);
      setError(null);
      setSuccess(null);
      // Serve cached items instantly (survives tab switches / re-selection).
      const cached = itemsCacheRef.current.get(playlistId);
      if (cached && !force) {
        setItems(cached);
        return;
      }
      setItems([]);
      setIsLoadingItems(true);
      try {
        const { items: its, pagesFetched } = await getPlaylistItems(playlistId, accessToken);
        recordUnits(pagesFetched * QUOTA_COST.playlistItemsList);
        itemsCacheRef.current.set(playlistId, its);
        setItems(its);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal memuat isi playlist.');
      } finally {
        setIsLoadingItems(false);
      }
    },
    [accessToken, recordUnits]
  );

  const create = useCallback(
    async (title: string, privacy: 'private' | 'unlisted' | 'public'): Promise<boolean> => {
      if (!accessToken || !title.trim()) return false;
      setBusy(true);
      setError(null);
      setSuccess(null);
      try {
        const created = await createPlaylist(title.trim(), '', privacy, accessToken);
        recordUnits(QUOTA_COST.playlistsInsert);
        const next = [created, ...playlistsRef.current];
        setPlaylists(next);
        playlistsRef.current = next;
        setSuccess(`Playlist "${created.title}" dibuat.`);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal membuat playlist.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [accessToken, recordUnits]
  );

  const removeItem = useCallback(
    async (item: PlaylistItem) => {
      if (!accessToken || !selectedId) return;
      setBusy(true);
      setError(null);
      try {
        await removePlaylistItem(item.playlistItemId, accessToken);
        recordUnits(QUOTA_COST.playlistItemsDelete);
        const nextItems = (itemsCacheRef.current.get(selectedId) ?? []).filter(
          (i) => i.playlistItemId !== item.playlistItemId
        );
        setItemsFor(selectedId, nextItems);
        const nextPlaylists = playlistsRef.current.map((p) =>
          p.playlistId === selectedId ? { ...p, itemCount: Math.max(0, p.itemCount - 1) } : p
        );
        setPlaylists(nextPlaylists);
        playlistsRef.current = nextPlaylists;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal menghapus item.');
      } finally {
        setBusy(false);
      }
    },
    [accessToken, selectedId, recordUnits, setItemsFor]
  );

  const moveItem = useCallback(
    async (index: number, direction: -1 | 1) => {
      if (!accessToken || !selectedId) return;
      const current = itemsCacheRef.current.get(selectedId) ?? items;
      const target = index + direction;
      if (target < 0 || target >= current.length) return;
      const item = current[index];
      setBusy(true);
      setError(null);
      try {
        await movePlaylistItem(item.playlistItemId, selectedId, item.videoId, target, accessToken);
        recordUnits(QUOTA_COST.playlistItemsUpdate);
        const next = [...current];
        const [moved] = next.splice(index, 1);
        next.splice(target, 0, moved);
        setItemsFor(
          selectedId,
          next.map((it, i) => ({ ...it, position: i }))
        );
      } catch (e) {
        const raw = e instanceof Error ? e.message : '';
        // YouTube rejects position writes unless the playlist's sort is "Manual" — the Data
        // API can't change that sort setting, so guide the user to flip it in Studio rather
        // than surfacing the raw "sort type need to be MANUAL" API error.
        setError(
          /manual/i.test(raw)
            ? 'Playlist ini masih pakai urutan otomatis, jadi urutannya belum bisa diatur di sini. Ubah dulu ke "Manual" di YouTube Studio: buka playlist → menu ⋮ / "Urutkan" → pilih Manual, lalu muat ulang di sini.'
            : raw || 'Gagal memindah item.'
        );
      } finally {
        setBusy(false);
      }
    },
    [accessToken, selectedId, items, recordUnits, setItemsFor]
  );

  const addVideos = useCallback(
    async (videoIds: string[]) => {
      if (!accessToken || !selectedId || videoIds.length === 0) return;
      setBusy(true);
      setError(null);
      setSuccess(null);
      let added = 0;
      const failures: string[] = [];
      for (const videoId of videoIds) {
        try {
          await addVideoToPlaylist(selectedId, videoId, accessToken);
          recordUnits(QUOTA_COST.playlistItemsInsert);
          added += 1;
        } catch (e) {
          failures.push(e instanceof Error ? e.message : videoId);
        }
      }
      setBusy(false);
      setSuccess(`${added} video ditambahkan${failures.length ? `, ${failures.length} gagal` : ''}.`);
      // Refresh the selected playlist's items to reflect additions (force re-fetch + re-cache).
      selectPlaylist(selectedId, true);
    },
    [accessToken, selectedId, recordUnits, selectPlaylist]
  );

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const reset = useCallback(() => {
    setPlaylists([]);
    playlistsRef.current = [];
    itemsCacheRef.current = new Map();
    setHasLoaded(false);
    setSelectedId(null);
    setItems([]);
    setError(null);
    setSuccess(null);
  }, []);

  return {
    playlists,
    hasLoaded,
    isLoadingPlaylists,
    selectedId,
    items,
    isLoadingItems,
    busy,
    error,
    success,
    loadPlaylists,
    selectPlaylist,
    create,
    removeItem,
    moveItem,
    addVideos,
    clearMessages,
    reset,
  };
};

/** The shape the module receives when the playlist state is passed down from App. */
export type PlaylistManagerState = ReturnType<typeof usePlaylistManager>;
