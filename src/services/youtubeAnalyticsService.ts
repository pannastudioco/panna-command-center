import type {
  DailyVideoAnalytics,
  ChannelTimeSeriesPoint,
  TopVideoRow,
  TrafficSourceRow,
  GeographyRow,
  RetentionPoint,
} from '@/types';

const ANALYTICS_BASE_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';

interface ColumnHeader {
  name: string;
}

interface ReportsQueryResponse {
  columnHeaders: ColumnHeader[];
  rows?: (string | number)[][];
}

/**
 * Shared reports.query runner with the same exponential-backoff-on-5xx/429 contract the
 * rest of the app uses. Every Fase-6 report below goes through this so retry behaviour
 * and error surfacing are identical everywhere. Analytics API calls do NOT draw on the
 * Data API 10,000-unit pool (confirmed against Google's live docs), so no recordUnits.
 */
async function runAnalyticsQuery(
  params: URLSearchParams,
  accessToken: string,
  retries = 3
): Promise<ReportsQueryResponse> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(`${ANALYTICS_BASE_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.ok) return response.json();

    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || `HTTP error ${response.status}`;

    if ((response.status >= 500 || response.status === 429) && attempt < retries) {
      const waitTime = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      continue;
    }

    throw new Error(`YouTube Analytics API Error (${response.status}): ${message}`);
  }
  // Unreachable — loop either returns or throws — but satisfies the type checker.
  throw new Error('YouTube Analytics API: gagal setelah beberapa percobaan.');
}

/** Build a column-name → index resolver for one response. */
function columnResolver(report: ReportsQueryResponse) {
  return (name: string) => report.columnHeaders.findIndex((c) => c.name === name);
}

/**
 * Reads per-day views/watch-time for ONE video (our UI only ever analyzes one at a
 * time). Deliberately does NOT attempt videoThumbnailImpressions /
 * videoThumbnailImpressionsClickRate — confirmed via a multi-source research pass
 * (official Analytics API metrics reference, channel_reports, data_model, and the
 * Discovery Document all fetched and checked directly) that those metrics live
 * ONLY in the separate YouTube Reporting API v1 (bulk, job-based CSV export;
 * snake_case names video_thumbnail_impressions / video_thumbnail_impressions_ctr
 * inside fixed report tables like channel_reach_basic_a1), not in this interactive
 * reports.query endpoint at all. No metrics/dimensions/filters combination on this
 * endpoint will ever return that data — it's not a parameter bug, the vocabulary
 * simply doesn't include it here. Real thumbnail CTR is visible today only in
 * YouTube Studio's own Reach tab, or via a materially separate integration against
 * the Reporting API's job/download flow (out of scope for this call).
 */
export async function getVideoPerformanceReport(
  videoId: string,
  startDate: string,
  endDate: string,
  accessToken: string,
  retries = 3
): Promise<DailyVideoAnalytics[]> {
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'views,averageViewDuration',
    dimensions: 'day',
    filters: `video==${videoId}`,
    sort: 'day',
  });

  const report = await runAnalyticsQuery(params, accessToken, retries);
  if (!report?.rows) return [];

  const colIndex = columnResolver(report);
  const dayIdx = colIndex('day');
  const viewsIdx = colIndex('views');
  const durationIdx = colIndex('averageViewDuration');

  // dimensions=day is always explicitly requested above, so Google's contract
  // guarantees this column exists — but if that contract were ever violated, skip the
  // row instead of silently producing the literal string 'undefined' as a date, which
  // would sort after every real date and quietly corrupt the before/after comparison.
  if (dayIdx === -1) {
    throw new Error('Respons YouTube Analytics tidak berisi kolom tanggal yang diharapkan.');
  }

  return report.rows.map((row) => ({
    date: String(row[dayIdx]),
    videoId,
    views: Number(row[viewsIdx] ?? 0),
    averageViewDuration: Number(row[durationIdx] ?? 0),
  }));
}

// ---- Fase 6: Channel Audit reports (all channel==MINE, all free of Data API quota) ----

/** Daily channel time series: views, watch time, avg view duration, subs gained/lost.
 * Powers the headline audit charts. */
export async function getChannelTimeSeries(
  startDate: string,
  endDate: string,
  accessToken: string
): Promise<ChannelTimeSeriesPoint[]> {
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost',
    dimensions: 'day',
    sort: 'day',
  });

  const report = await runAnalyticsQuery(params, accessToken);
  if (!report?.rows) return [];

  const col = columnResolver(report);
  const dayIdx = col('day');
  if (dayIdx === -1) throw new Error('Respons YouTube Analytics tidak berisi kolom tanggal.');
  const vI = col('views');
  const mwI = col('estimatedMinutesWatched');
  const avdI = col('averageViewDuration');
  const sgI = col('subscribersGained');
  const slI = col('subscribersLost');

  return report.rows.map((row) => {
    const gained = Number(row[sgI] ?? 0);
    const lost = Number(row[slI] ?? 0);
    return {
      date: String(row[dayIdx]),
      views: Number(row[vI] ?? 0),
      estimatedMinutesWatched: Number(row[mwI] ?? 0),
      averageViewDuration: Number(row[avdI] ?? 0),
      subscribersGained: gained,
      subscribersLost: lost,
      subscribersNet: gained - lost,
    };
  });
}

/** Per-video views for the period, sorted by views desc. Used both for the "top videos"
 * card and for the outlier calculation (score vs the median of this set). */
export async function getTopVideos(
  startDate: string,
  endDate: string,
  accessToken: string,
  maxResults = 200
): Promise<TopVideoRow[]> {
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'views,estimatedMinutesWatched,averageViewDuration',
    dimensions: 'video',
    sort: '-views',
    maxResults: String(maxResults),
  });

  const report = await runAnalyticsQuery(params, accessToken);
  if (!report?.rows) return [];

  const col = columnResolver(report);
  const vidIdx = col('video');
  if (vidIdx === -1) throw new Error('Respons YouTube Analytics tidak berisi kolom video.');
  const vI = col('views');
  const mwI = col('estimatedMinutesWatched');
  const avdI = col('averageViewDuration');

  return report.rows.map((row) => ({
    videoId: String(row[vidIdx]),
    views: Number(row[vI] ?? 0),
    estimatedMinutesWatched: Number(row[mwI] ?? 0),
    averageViewDuration: Number(row[avdI] ?? 0),
  }));
}

/** Views by traffic source type (Browse / Suggested / Search / etc.). */
export async function getTrafficSources(
  startDate: string,
  endDate: string,
  accessToken: string
): Promise<TrafficSourceRow[]> {
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'views',
    dimensions: 'insightTrafficSourceType',
    sort: '-views',
  });

  const report = await runAnalyticsQuery(params, accessToken);
  if (!report?.rows) return [];

  const col = columnResolver(report);
  const srcIdx = col('insightTrafficSourceType');
  const vI = col('views');
  if (srcIdx === -1) throw new Error('Respons YouTube Analytics tidak berisi kolom sumber trafik.');

  return report.rows.map((row) => ({
    source: String(row[srcIdx]),
    views: Number(row[vI] ?? 0),
  }));
}

/** Views by viewer country (ISO code), top-N by views. */
export async function getGeography(
  startDate: string,
  endDate: string,
  accessToken: string,
  maxResults = 15
): Promise<GeographyRow[]> {
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'views',
    dimensions: 'country',
    sort: '-views',
    maxResults: String(maxResults),
  });

  const report = await runAnalyticsQuery(params, accessToken);
  if (!report?.rows) return [];

  const col = columnResolver(report);
  const cIdx = col('country');
  const vI = col('views');
  if (cIdx === -1) throw new Error('Respons YouTube Analytics tidak berisi kolom negara.');

  return report.rows.map((row) => ({
    country: String(row[cIdx]),
    views: Number(row[vI] ?? 0),
  }));
}

/**
 * REAL per-moment audience-retention curve for one of YOUR OWN videos (owner-only data;
 * this is exactly what YouTube Studio's retention graph shows). `elapsedVideoTimeRatio`
 * is 0..1 across the video's duration; `audienceWatchRatio` is the share still watching
 * at that point; `relativeRetentionPerformance` compares it to similar YouTube videos.
 *
 * Not available for anyone else's videos — that data is never served to non-owners, by
 * any endpoint. (Confirmed against the live Analytics API docs.)
 */
export async function getAudienceRetention(
  videoId: string,
  accessToken: string,
  startDate = '2005-02-14', // YouTube's launch — effectively "lifetime"
  endDate?: string
): Promise<RetentionPoint[]> {
  const end = endDate ?? new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate: end,
    metrics: 'audienceWatchRatio,relativeRetentionPerformance',
    dimensions: 'elapsedVideoTimeRatio',
    filters: `video==${videoId};audienceType==ORGANIC`,
    sort: 'elapsedVideoTimeRatio',
  });

  const report = await runAnalyticsQuery(params, accessToken);
  if (!report?.rows) return [];

  const col = columnResolver(report);
  const ratioIdx = col('elapsedVideoTimeRatio');
  if (ratioIdx === -1) throw new Error('Respons retention tidak berisi kolom posisi video.');
  const awrIdx = col('audienceWatchRatio');
  const rrpIdx = col('relativeRetentionPerformance');

  return report.rows.map((row) => ({
    elapsedRatio: Number(row[ratioIdx] ?? 0),
    audienceWatchRatio: Number(row[awrIdx] ?? 0),
    relativeRetentionPerformance: Number(row[rrpIdx] ?? 0),
  }));
}
