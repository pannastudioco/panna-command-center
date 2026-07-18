import type { TopVideoRow, EditableVideo } from '@/types';

/**
 * Client-side analysis over the raw Analytics rows — outlier scoring, best-publish-time
 * inference, and milestone targets. All transparent maths (formulas printable in the UI),
 * no hidden model.
 */

// ---- Outliers ----

export interface OutlierResult {
  videoId: string;
  views: number;
  /** views ÷ median(views of the set). 1 = typical, 3 = 3× the median, etc. */
  outlierScore: number;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Outlier score = a video's views ÷ the MEDIAN views of the set. Median (not mean) so a
 * couple of viral hits don't drag the baseline up and hide everything else — this mirrors
 * how VidIQ frames "outliers" (overperformance vs the channel's normal), stated with its
 * formula rather than as a mystery number.
 */
export function computeOutliers(videos: TopVideoRow[]): { median: number; results: OutlierResult[] } {
  const med = median(videos.map((v) => v.views));
  const results = videos.map((v) => ({
    videoId: v.videoId,
    views: v.views,
    outlierScore: med > 0 ? v.views / med : 0,
  }));
  return { median: med, results };
}

// ---- Best time to publish (from OWN historical performance) ----

export interface PublishBucket {
  /** Bucket key: hour 0-23, or day-of-week 0=Sun..6=Sat. */
  key: number;
  label: string;
  videoCount: number;
  medianViews: number;
}

const DOW_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/**
 * Group the channel's OWN videos by publish hour-of-day and day-of-week, then report the
 * MEDIAN views per bucket. This is explicitly "which publish slots have historically
 * performed", NOT "when your audience is online" (that Studio-only signal isn't in any
 * API). Buckets with too few videos are unreliable and flagged by videoCount so the UI
 * can grey them out.
 *
 * Joins each catalog video (has publishedAt) with its views from the Analytics top-videos
 * rows. Videos with no view row for the period are skipped.
 */
export function computeBestPublishTimes(
  catalog: Pick<EditableVideo, 'videoId' | 'publishedAt'>[],
  viewsByVideoId: Map<string, number>
): { byHour: PublishBucket[]; byDayOfWeek: PublishBucket[] } {
  const hourGroups = new Map<number, number[]>();
  const dowGroups = new Map<number, number[]>();
  const push = (map: Map<number, number[]>, key: number, val: number) => {
    const arr = map.get(key);
    if (arr) arr.push(val);
    else map.set(key, [val]);
  };

  for (const v of catalog) {
    const views = viewsByVideoId.get(v.videoId);
    if (views === undefined || !v.publishedAt) continue;
    const d = new Date(v.publishedAt);
    if (Number.isNaN(d.getTime())) continue;
    push(hourGroups, d.getHours(), views); // local time — matches the creator's own schedule intuition
    push(dowGroups, d.getDay(), views);
  }

  const byHour: PublishBucket[] = Array.from(hourGroups.entries())
    .map(([key, arr]) => ({
      key,
      label: `${String(key).padStart(2, '0')}:00`,
      videoCount: arr.length,
      medianViews: Math.round(median(arr)),
    }))
    .sort((a, b) => b.medianViews - a.medianViews);

  const byDayOfWeek: PublishBucket[] = Array.from(dowGroups.entries())
    .map(([key, arr]) => ({
      key,
      label: DOW_LABELS[key],
      videoCount: arr.length,
      medianViews: Math.round(median(arr)),
    }))
    .sort((a, b) => b.medianViews - a.medianViews);

  return { byHour, byDayOfWeek };
}

// ---- Milestones ----

export interface Milestone {
  metric: 'subscribers' | 'views';
  current: number;
  next: number;
  progress: number; // 0..1 toward next from previous milestone
}

/** Standard "nice number" milestone ladder (100, 1k, 10k, 100k, 1M, ...). */
function nextNiceMilestone(current: number): { prev: number; next: number } {
  const ladder = [100, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000, 100_000_000];
  for (let i = 0; i < ladder.length; i++) {
    if (current < ladder[i]) return { prev: i === 0 ? 0 : ladder[i - 1], next: ladder[i] };
  }
  // Beyond the ladder: next multiple of 100M.
  const next = Math.ceil((current + 1) / 100_000_000) * 100_000_000;
  return { prev: next - 100_000_000, next };
}

export function computeMilestone(metric: Milestone['metric'], current: number): Milestone {
  const { prev, next } = nextNiceMilestone(current);
  const span = next - prev;
  const progress = span > 0 ? Math.max(0, Math.min(1, (current - prev) / span)) : 0;
  return { metric, current, next, progress };
}

// ---- Labels ----

/** insightTrafficSourceType enum → human label (Indonesian). */
export const TRAFFIC_SOURCE_LABELS: Record<string, string> = {
  ADVERTISING: 'Iklan',
  ANNOTATION: 'Anotasi',
  CAMPAIGN_CARD: 'Kartu Kampanye',
  END_SCREEN: 'End Screen',
  EXT_URL: 'Situs Eksternal',
  NO_LINK_EMBEDDED: 'Tersemat (tanpa link)',
  NO_LINK_OTHER: 'Lainnya (tanpa link)',
  NOTIFICATION: 'Notifikasi',
  PLAYLIST: 'Playlist',
  PROMOTED: 'Dipromosikan',
  RELATED_VIDEO: 'Video Terkait (Suggested)',
  SHORTS: 'Shorts',
  SUBSCRIBER: 'Feed Langganan',
  YT_CHANNEL: 'Halaman Channel',
  YT_OTHER_PAGE: 'Halaman YouTube Lain',
  YT_PLAYLIST_PAGE: 'Halaman Playlist',
  YT_SEARCH: 'YouTube Search',
  HASHTAGS: 'Hashtag',
  SOUND_PAGE: 'Halaman Audio',
};

export function trafficSourceLabel(source: string): string {
  return TRAFFIC_SOURCE_LABELS[source] ?? source;
}

/** Common viewer countries for functional-music channels + fallback to the raw code. */
const COUNTRY_NAMES: Record<string, string> = {
  ID: 'Indonesia',
  US: 'Amerika Serikat',
  IN: 'India',
  BR: 'Brasil',
  GB: 'Inggris',
  DE: 'Jerman',
  FR: 'Prancis',
  RU: 'Rusia',
  JP: 'Jepang',
  KR: 'Korea Selatan',
  MX: 'Meksiko',
  PH: 'Filipina',
  VN: 'Vietnam',
  TH: 'Thailand',
  MY: 'Malaysia',
  CA: 'Kanada',
  AU: 'Australia',
  ES: 'Spanyol',
  IT: 'Italia',
  NL: 'Belanda',
  TR: 'Turki',
  PL: 'Polandia',
  SA: 'Arab Saudi',
  AE: 'Uni Emirat Arab',
  EG: 'Mesir',
  NG: 'Nigeria',
};

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}
