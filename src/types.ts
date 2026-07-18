export type KeyStatus = 'validating' | 'valid' | 'invalid';

export interface ValidatedKey {
  id: string;
  key: string;
  status: KeyStatus;
  error?: string;
}

export type ModuleId =
  | 'keyword-research'
  | 'bulk-editor'
  | 'analytics'
  | 'channel-audit'
  | 'playlists'
  | 'ai-studio'
  | 'competitors'
  | 'toolbox'
  | 'content-pipeline';

export interface ModuleDef {
  id: ModuleId;
  label: string;
  description: string;
  available: boolean;
}

/** One harvested autocomplete suggestion, with a heuristic (not real) demand score. */
export interface KeywordSuggestion {
  term: string;
  /** How many of the 27 alphabet-soup queries (blank + a-z) surfaced this term. */
  appearances: number;
  /** Average position across the queries it appeared in (1 = top suggestion, lower is stronger). */
  avgPosition: number;
  /** 0-100 heuristic score derived from appearances + position. NOT a real search-volume figure. */
  estimatedDemandScore: number;
}

export interface TagSuggestion {
  tag: string;
  /** How many competitor videos in the sample used this tag. */
  usedByCount: number;
  sourceVideoTitles: string[];
}

export interface CompetitorVideoSample {
  videoId: string;
  title: string;
  channelTitle: string;
  viewCount: number;
  tags: string[];
}

export interface KeywordResearchResult {
  seed: string;
  fetchedAt: string;
  suggestions: KeywordSuggestion[];
  tagSuggestions: TagSuggestion[];
  competitorSample: CompetitorVideoSample[];
}

export interface QuotaState {
  /** YYYY-MM-DD in America/Los_Angeles, the timezone YouTube's quota resets in. */
  resetDay: string;
  dataApiUnitsUsed: number;
  searchListCallsUsed: number;
}

/** Full editable snippet for one video — must carry every field videos.update needs, or an
 * omitted field (e.g. tags, categoryId) gets nulled out server-side on write. */
export interface EditableVideo {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  defaultLanguage?: string;
  thumbnailUrl: string;
  publishedAt: string;
}

export type EditableField = 'title' | 'description' | 'tags';

export interface BulkFindReplaceRule {
  field: EditableField;
  find: string;
  replace: string;
  caseSensitive: boolean;
}

export interface PendingEdit {
  videoId: string;
  before: Pick<EditableVideo, 'title' | 'description' | 'tags'>;
  after: Pick<EditableVideo, 'title' | 'description' | 'tags'>;
}

/** Identity of whichever channel the current OAuth grant resolves to. YouTube's API has
 * no reliable way to list every Brand Account channel under one login for a regular
 * (non-CMS) user — mine=true always resolves to a single "active" channel, decided by
 * the session's active-channel state on youtube.com, not by anything our app controls. */
export interface ConnectedChannelInfo {
  channelId: string;
  title: string;
  thumbnailUrl: string;
  uploadsPlaylistId: string | null;
}

/** Shape of useYoutubeAuth()'s return value — typed once so every OAuth-gated module
 * (Bulk Editor, Analytics, ...) takes it as a single prop instead of six loose ones. */
export interface YoutubeAuthState {
  accessToken: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
}

/** Shape of useConnectedChannel()'s return value. */
export interface ConnectedChannelState {
  channelInfo: ConnectedChannelInfo | null;
  isLoadingChannel: boolean;
  error: string | null;
}

/** One video's views/watch-time for one day, from YouTube Analytics API v2. Fase 3
 * reads this — it does NOT run its own A/B test; YouTube Studio's native "Test and
 * Compare" already does that. This is a read-only lens on top of it.
 *
 * NOTE: thumbnail impressions/CTR are deliberately not modeled here — confirmed via
 * research that those metrics only exist in the separate bulk YouTube Reporting API v1,
 * not this interactive endpoint. Real thumbnail CTR is visible today only in YouTube
 * Studio's own Reach tab. */
export interface DailyVideoAnalytics {
  date: string; // YYYY-MM-DD
  videoId: string;
  views: number;
  averageViewDuration: number; // seconds
}

export interface AnalyzedVideoOption {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
}

// ---- Fase 6: Channel Audit ----

export interface ChannelTimeSeriesPoint {
  date: string; // YYYY-MM-DD
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number; // seconds
  subscribersGained: number;
  subscribersLost: number;
  subscribersNet: number;
}

export interface TopVideoRow {
  videoId: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
}

export interface TrafficSourceRow {
  source: string; // insightTrafficSourceType enum value
  views: number;
}

export interface GeographyRow {
  country: string; // ISO 3166-1 alpha-2
  views: number;
}

/** One sample along a video's audience-retention curve (owner-only data). */
export interface RetentionPoint {
  elapsedRatio: number; // 0..1 through the video
  audienceWatchRatio: number; // share still watching at this point
  relativeRetentionPerformance: number; // vs similar YouTube videos (0.5 = median)
}

// ---- Fase 7: Playlists, rank tracking ----

export interface PlaylistSummary {
  playlistId: string;
  title: string;
  description: string;
  itemCount: number;
  privacyStatus: string;
  thumbnailUrl: string;
}

export interface PlaylistItem {
  playlistItemId: string;
  videoId: string;
  title: string;
  position: number;
  thumbnailUrl: string;
}

/** A keyword the user is tracking their own ranking for (localStorage). */
export interface TrackedKeyword {
  keyword: string;
  addedAt: string; // ISO
}

/** One rank check result over time (IndexedDB, keyed [keyword, dateISO]). */
export interface RankSnapshot {
  keyword: string;
  dateISO: string; // YYYY-MM-DD
  rank: number | null; // 1-based position, or null if not found in top results
  foundVideoId: string | null;
  foundTitle: string | null;
}

/** A saved metadata template (localStorage) applied to selected videos in Bulk Editor. */
export interface MetadataTemplate {
  id: string;
  name: string;
  /** Appended to the end of each target video's description. */
  descriptionBlock: string;
  /** Tags merged (deduped) into each target video's tags. */
  tags: string[];
}

/** One channel on the competitor watchlist. Added once via channel ID/@handle/legacy
 * username (id/forHandle/forUsername) — deliberately NOT via search.list, which is
 * capped at ~100/day; this whole feature is designed to spend zero search.list calls
 * in steady state. */
export interface WatchedChannel {
  channelId: string;
  title: string;
  thumbnailUrl: string;
  addedAt: string; // ISO timestamp
}

export interface ChannelStats {
  channelId: string;
  title: string;
  thumbnailUrl: string;
  subscriberCount: number;
  /** true if the channel owner has hidden their subscriber count — YouTube returns 0
   * with hiddenSubscriberCount=true in that case, which must not be confused with a
   * real zero. */
  subscriberCountHidden: boolean;
  viewCount: number;
  videoCount: number;
}

/**
 * One point-in-time snapshot of a watched channel's public stats. The API only ever
 * returns CURRENT totals for a channel that isn't yours — there is no historical-series
 * endpoint for other channels' stats. Trend lines are only possible because this app
 * takes its own daily snapshot and stores it locally (IndexedDB) — the history is
 * built here, not fetched from Google.
 */
export interface ChannelSnapshot {
  channelId: string;
  dateISO: string; // YYYY-MM-DD, the day this snapshot was taken
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
}
