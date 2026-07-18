import { useState, useCallback, useRef } from 'react';
import type {
  YoutubeAuthState,
  ConnectedChannelState,
  EditableVideo,
  ChannelTimeSeriesPoint,
  TopVideoRow,
  TrafficSourceRow,
  GeographyRow,
  RetentionPoint,
} from '@/types';
import { getMyChannelStatistics } from '@/services/youtubeDataService';
import {
  getChannelTimeSeries,
  getTopVideos,
  getTrafficSources,
  getGeography,
  getAudienceRetention,
} from '@/services/youtubeAnalyticsService';
import { QUOTA_COST } from '@/constants/quotas';
import type { OwnVideoCatalog } from './useOwnVideoCatalog';

export type RangeDays = 30 | 90;

export interface AuditData {
  stats: { subscriberCount: number; subscriberCountHidden: boolean; viewCount: number; videoCount: number };
  videos: EditableVideo[];
  timeSeries: ChannelTimeSeriesPoint[];
  topVideos: TopVideoRow[];
  traffic: TrafficSourceRow[];
  geography: GeographyRow[];
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Shared "load the channel audit ONCE" hook. Lifted to App level (same rationale as
 * useOwnVideoCatalog) so the expensive Analytics pull — time series, top videos, traffic,
 * geography — survives module unmount and is NOT re-fetched every time the user leaves and
 * returns to the Channel Audit tab. The video list itself is borrowed from the shared
 * catalog, so it costs nothing extra here.
 *
 * Idempotent: load(days) short-circuits if the current data already belongs to that range.
 * The retention drill-down is cached per video so re-opening a curve is instant too.
 *
 * Every returned function is useCallback-stable (the infinite-loop discipline).
 */
export const useChannelAudit = (
  auth: YoutubeAuthState,
  channel: ConnectedChannelState,
  recordUnits: (units: number) => void,
  catalog: OwnVideoCatalog
) => {
  const { accessToken } = auth;
  const { channelInfo } = channel;

  const [data, setData] = useState<AuditData | null>(null);
  const [range, setRange] = useState<RangeDays>(30);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronous mirrors for the idempotent guard, so `data`/`range` don't have to sit in
  // load()'s dependency list (which would rebuild the callback and risk the effect-loop bug).
  const dataRef = useRef<AuditData | null>(null);
  const loadedRangeRef = useRef<RangeDays | null>(null);

  // Retention drill-down (per video) — cached so re-selecting a video is instant and the
  // selection survives a tab switch.
  const [retentionVideoId, setRetentionVideoId] = useState<string | null>(null);
  const [retention, setRetention] = useState<RetentionPoint[] | null>(null);
  const [isLoadingRetention, setIsLoadingRetention] = useState(false);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const retentionCacheRef = useRef<Map<string, RetentionPoint[]>>(new Map());

  const load = useCallback(
    async (days: RangeDays, force = false) => {
      if (!accessToken || !channelInfo) return;
      setRange(days);
      // Cross-tab reuse: already have this exact range loaded → serve it, no network, no quota.
      if (!force && dataRef.current && loadedRangeRef.current === days) return;
      setError(null);
      setIsLoading(true);
      try {
        const startDate = isoDaysAgo(days);
        const endDate = today();

        // Data API: channel stats (1 unit). The video catalog comes from the shared
        // app-level catalog — loadCatalog() returns instantly if already loaded, so no
        // repeat fetch/quota here.
        const stats = await getMyChannelStatistics(accessToken);
        recordUnits(QUOTA_COST.channelsList);
        const videos = await catalog.loadCatalog();

        // Analytics API (0 Data API quota) — run in parallel.
        const [timeSeries, topVideos, traffic, geography] = await Promise.all([
          getChannelTimeSeries(startDate, endDate, accessToken),
          getTopVideos(startDate, endDate, accessToken),
          getTrafficSources(startDate, endDate, accessToken),
          getGeography(startDate, endDate, accessToken),
        ]);

        const next: AuditData = { stats, videos, timeSeries, topVideos, traffic, geography };
        setData(next);
        dataRef.current = next;
        loadedRangeRef.current = days;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal memuat audit channel.');
      } finally {
        setIsLoading(false);
      }
    },
    [accessToken, channelInfo, recordUnits, catalog]
  );

  /** Range toggle — reload only if an audit is already loaded (matches original UX: the
   * toggle doesn't kick off a first fetch, the main button does). */
  const selectRange = useCallback(
    (days: RangeDays) => {
      if (dataRef.current) load(days);
      else setRange(days);
    },
    [load]
  );

  const loadRetention = useCallback(
    async (videoId: string) => {
      if (!accessToken) return;
      setRetentionVideoId(videoId);
      setRetentionError(null);
      const cached = retentionCacheRef.current.get(videoId);
      if (cached) {
        setRetention(cached);
        return;
      }
      setRetention(null);
      setIsLoadingRetention(true);
      try {
        const points = await getAudienceRetention(videoId, accessToken);
        retentionCacheRef.current.set(videoId, points);
        setRetention(points);
      } catch (e) {
        setRetentionError(e instanceof Error ? e.message : 'Gagal memuat data retention.');
      } finally {
        setIsLoadingRetention(false);
      }
    },
    [accessToken]
  );

  const reset = useCallback(() => {
    setData(null);
    dataRef.current = null;
    loadedRangeRef.current = null;
    setError(null);
    setRetention(null);
    setRetentionVideoId(null);
    setRetentionError(null);
    retentionCacheRef.current = new Map();
  }, []);

  return {
    data,
    range,
    isLoading,
    error,
    hasLoaded: data !== null,
    retention,
    retentionVideoId,
    isLoadingRetention,
    retentionError,
    load,
    selectRange,
    loadRetention,
    reset,
  };
};

/** The shape modules receive when the audit state is passed down from App. */
export type ChannelAuditState = ReturnType<typeof useChannelAudit>;
