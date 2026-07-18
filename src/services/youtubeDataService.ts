import type {
  CompetitorVideoSample,
  EditableVideo,
  ConnectedChannelInfo,
  ChannelStats,
  PlaylistSummary,
  PlaylistItem,
} from '@/types';

const BASE_URL_V3 = 'https://www.googleapis.com/youtube/v3';

interface FetchOpts {
  accessToken?: string;
  method?: 'GET' | 'PUT' | 'POST' | 'DELETE';
  body?: unknown;
  retries?: number;
}

/**
 * Adapted from Reality Architect's services/youtubeService.ts apiFetch: exponential
 * backoff on 5xx/429, typed errors for the specific YouTube reason codes that
 * services/apiExecutor.ts's rotation logic keys off of. Extended to support OAuth
 * bearer tokens (for write calls and any private-scope read) alongside API keys.
 */
async function apiFetch(url: string, opts: FetchOpts = {}): Promise<any> {
  const { accessToken, method = 'GET', body, retries = 3 } = opts;
  const headers: HeadersInit = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  if (body) headers['Content-Type'] = 'application/json';

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = errorData.error || {};
      const message = error.message || `HTTP error ${response.status}`;
      const reason = error.errors?.[0]?.reason || 'unknown';

      if (response.status === 401) {
        throw new Error(`Sesi OAuth kedaluwarsa atau tidak valid: ${message}`);
      }
      if (response.status === 403) {
        if (reason === 'quotaExceeded') throw new Error(`Quota Exceeded: ${message}`);
        if (reason === 'accessNotConfigured') throw new Error(`API Not Enabled: ${message}`);
        if (reason === 'insufficientPermissions') throw new Error(`Izin OAuth tidak cukup: ${message}`);
      }
      if (response.status === 400 && reason === 'keyInvalid') {
        throw new Error(`Invalid API Key: ${message}`);
      }

      if ((response.status >= 500 || response.status === 429) && attempt < retries) {
        const waitTime = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      throw new Error(`YouTube API Error (${response.status}): ${message}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }
}

interface SearchHit {
  videoId: string;
  title: string;
  channelTitle: string;
}

/**
 * Costs 1 call against the dedicated ~100/day search.list bucket (see constants/quotas.ts).
 * Only call this on an explicit user action ("Analyze Competition"), never automatically.
 */
export async function searchVideosByKeyword(keyword: string, apiKey: string, maxResults = 15): Promise<SearchHit[]> {
  const url = `${BASE_URL_V3}/search?part=snippet&type=video&q=${encodeURIComponent(keyword)}&maxResults=${maxResults}&key=${apiKey}`;
  const data = await apiFetch(url);
  return (data.items || [])
    .filter((item: any) => item.id?.videoId)
    .map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet?.title || 'Untitled',
      channelTitle: item.snippet?.channelTitle || 'Unknown channel',
    }));
}

/** Costs 1 unit per 50-ID chunk. */
export async function getVideoTagsAndStats(
  hits: SearchHit[],
  apiKey: string
): Promise<CompetitorVideoSample[]> {
  const results: CompetitorVideoSample[] = [];
  const hitById = new Map(hits.map((h) => [h.videoId, h]));

  for (let i = 0; i < hits.length; i += 50) {
    const chunk = hits.slice(i, i + 50);
    const ids = chunk.map((h) => h.videoId).join(',');
    const url = `${BASE_URL_V3}/videos?part=snippet,statistics&id=${ids}&key=${apiKey}`;
    const data = await apiFetch(url);

    for (const item of data.items || []) {
      const hit = hitById.get(item.id);
      results.push({
        videoId: item.id,
        title: item.snippet?.title || hit?.title || 'Untitled',
        channelTitle: item.snippet?.channelTitle || hit?.channelTitle || 'Unknown channel',
        viewCount: parseInt(item.statistics?.viewCount || '0', 10),
        tags: Array.isArray(item.snippet?.tags) ? item.snippet.tags : [],
      });
    }
  }
  return results;
}

// ---- Fase 2: Bulk metadata editing (all calls below need an OAuth access token) ----

/**
 * 1 unit. Identifies WHICH channel the current OAuth grant resolves to (mine=true always
 * picks a single "active" channel — see the ConnectedChannelInfo doc comment in types.ts)
 * so the UI can show it plainly before any bulk edit happens. uploadsPlaylistId is null
 * for a channel with zero uploads yet — that's a normal empty-catalog state, not a failure.
 */
export async function getMyChannelInfo(accessToken: string): Promise<ConnectedChannelInfo> {
  const url = `${BASE_URL_V3}/channels?part=snippet,contentDetails&mine=true`;
  const data = await apiFetch(url, { accessToken });
  const item = data.items?.[0];
  if (!item) throw new Error('Tidak menemukan channel untuk akun Google ini.');
  return {
    channelId: item.id,
    title: item.snippet?.title || 'Untitled channel',
    thumbnailUrl: item.snippet?.thumbnails?.default?.url || '',
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads || null,
  };
}

/** 1 unit. Current subscriber/view/video totals for the connected channel — for the
 * Channel Audit milestone targets. Uses the OAuth grant (mine=true), not an API key. */
export async function getMyChannelStatistics(
  accessToken: string
): Promise<{ subscriberCount: number; subscriberCountHidden: boolean; viewCount: number; videoCount: number }> {
  const url = `${BASE_URL_V3}/channels?part=statistics&mine=true`;
  const data = await apiFetch(url, { accessToken });
  const stats = data.items?.[0]?.statistics;
  if (!stats) throw new Error('Tidak bisa membaca statistik channel.');
  return {
    subscriberCount: parseInt(stats.subscriberCount || '0', 10),
    subscriberCountHidden: stats.hiddenSubscriberCount === true,
    viewCount: parseInt(stats.viewCount || '0', 10),
    videoCount: parseInt(stats.videoCount || '0', 10),
  };
}

/**
 * 1 unit per page (50 videos/page). No date filter — full catalog, unlike Fase 1's
 * competitor search. Returns pagesFetched separately from videoIds.length/50 because a
 * playlist with zero videos still costs exactly 1 real unit (one page is always fetched
 * to discover it's empty) — Math.ceil(0/50) would silently undercount that unit.
 */
export async function getAllVideoIdsFromPlaylist(
  playlistId: string,
  accessToken: string
): Promise<{ videoIds: string[]; pagesFetched: number }> {
  const videoIds: string[] = [];
  let pageToken: string | undefined;
  let pagesFetched = 0;
  const SAFETY_LIMIT = 5000;

  while (videoIds.length < SAFETY_LIMIT) {
    let url = `${BASE_URL_V3}/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=50`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const data = await apiFetch(url, { accessToken });
    pagesFetched += 1;

    for (const item of data.items || []) {
      if (item.contentDetails?.videoId) videoIds.push(item.contentDetails.videoId);
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return { videoIds, pagesFetched };
}

/** 1 unit per 50-ID chunk. Fetches the FULL editable snippet — required for the fetch-merge-send
 * update pattern in updateVideoMetadata, since videos.update overwrites the whole snippet object. */
export async function getEditableVideoDetails(videoIds: string[], accessToken: string): Promise<EditableVideo[]> {
  const results: EditableVideo[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const url = `${BASE_URL_V3}/videos?part=snippet&id=${chunk.join(',')}`;
    const data = await apiFetch(url, { accessToken });

    for (const item of data.items || []) {
      results.push({
        videoId: item.id,
        title: item.snippet?.title || '',
        description: item.snippet?.description || '',
        tags: Array.isArray(item.snippet?.tags) ? item.snippet.tags : [],
        categoryId: item.snippet?.categoryId || '',
        defaultLanguage: item.snippet?.defaultLanguage,
        thumbnailUrl: item.snippet?.thumbnails?.default?.url || '',
        publishedAt: item.snippet?.publishedAt || '',
      });
    }
  }
  return results;
}

/**
 * 50 units per call. Fetch-merge-send: re-fetches the CURRENT full snippet right before
 * writing (not the possibly-stale copy held in UI state) and merges only the intended
 * fields, so a field the UI never touched (categoryId, defaultLanguage, ...) never gets
 * nulled out by an incomplete overwrite.
 */
export async function updateVideoMetadata(
  videoId: string,
  patch: Partial<Pick<EditableVideo, 'title' | 'description' | 'tags' | 'defaultLanguage'>>,
  accessToken: string
): Promise<void> {
  const currentUrl = `${BASE_URL_V3}/videos?part=snippet&id=${videoId}`;
  const current = await apiFetch(currentUrl, { accessToken });
  const currentSnippet = current.items?.[0]?.snippet;
  if (!currentSnippet) throw new Error(`Video ${videoId} tidak ditemukan atau tidak bisa diakses.`);

  const mergedSnippet = { ...currentSnippet, ...patch };

  const updateUrl = `${BASE_URL_V3}/videos?part=snippet`;
  await apiFetch(updateUrl, {
    accessToken,
    method: 'PUT',
    body: { id: videoId, snippet: mergedSnippet },
  });
}

/**
 * Writable fields of videos.status. Anything NOT in this list is read-only (uploadStatus,
 * failureReason, rejectionReason, madeForKids) and must never be echoed back — the API
 * rejects or ignores them. Kept explicit because videos.update is destructive by design:
 * "If you are submitting an update request, and your request does not specify a value for a
 * property that already has a value, the property's existing value will be deleted."
 * That is why we re-read status and merge, rather than sending a bare containsSyntheticMedia.
 */
const WRITABLE_STATUS_FIELDS = [
  'privacyStatus',
  'publishAt',
  'license',
  'embeddable',
  'publicStatsViewable',
  'selfDeclaredMadeForKids',
] as const;

/**
 * 50 units. Discloses that a video contains realistic Altered or Synthetic (A/S) content by
 * setting `status.containsSyntheticMedia` (videos.update). Required since 2026 for AI-generated
 * music. Officially this costs nothing: "Disclosing AI content won't limit a video's audience
 * or impact its eligibility to earn money."
 *
 * IMPORTANT LIMITATION — `containsSyntheticMedia` is WRITE-ONLY. Unlike selfDeclaredMadeForKids
 * (which has the readable counterpart madeForKids), the Data API exposes NO way to read the
 * current disclosure state back. So the app can never tell you which videos are already
 * disclosed, and cannot verify this write beyond the 200 response. Check YouTube Studio to
 * confirm. Do not build any UI that claims to know a video's disclosure status.
 *
 * Safety: privacyStatus lives in the same object, so a careless write here could unpublish or
 * publish a video. We therefore re-read status immediately before writing and echo back only
 * the writable fields that were actually present — never a synthesised default.
 */
export async function discloseSyntheticMedia(
  videoId: string,
  accessToken: string,
  contains = true
): Promise<void> {
  const currentUrl = `${BASE_URL_V3}/videos?part=status&id=${videoId}`;
  const current = await apiFetch(currentUrl, { accessToken });
  const currentStatus = current.items?.[0]?.status;
  if (!currentStatus) throw new Error(`Video ${videoId} tidak ditemukan atau tidak bisa diakses.`);

  const preserved: Record<string, unknown> = {};
  for (const field of WRITABLE_STATUS_FIELDS) {
    if (currentStatus[field] !== undefined) preserved[field] = currentStatus[field];
  }

  await apiFetch(`${BASE_URL_V3}/videos?part=status`, {
    accessToken,
    method: 'PUT',
    body: { id: videoId, status: { ...preserved, containsSyntheticMedia: contains } },
  });
}

// ---- Fase 4a: Competitor tracking (API-key auth — public channel stats, no OAuth needed) ----

function toChannelStats(item: any): ChannelStats {
  const stats = item.statistics || {};
  return {
    channelId: item.id,
    title: item.snippet?.title || 'Untitled channel',
    thumbnailUrl: item.snippet?.thumbnails?.default?.url || '',
    subscriberCount: parseInt(stats.subscriberCount || '0', 10),
    subscriberCountHidden: stats.hiddenSubscriberCount === true,
    viewCount: parseInt(stats.viewCount || '0', 10),
    videoCount: parseInt(stats.videoCount || '0', 10),
  };
}

/**
 * 1 unit. Resolves a pasted channel URL/ID/@handle/legacy username to full channel
 * stats — deliberately NEVER uses search.list (that's the ~100/day-capped endpoint;
 * this whole feature is designed to spend zero of that budget). Handles the three
 * official lookup params (id / forHandle / forUsername) rather than guessing.
 */
export async function resolveChannel(input: string, apiKey: string): Promise<ChannelStats> {
  const trimmed = input.trim();
  let param: string;

  const channelUrlMatch = trimmed.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
  const handleUrlMatch = trimmed.match(/youtube\.com\/@([a-zA-Z0-9_.-]+)/);
  const userUrlMatch = trimmed.match(/youtube\.com\/(?:user|c)\/([a-zA-Z0-9_-]+)/);

  if (channelUrlMatch) {
    param = `id=${channelUrlMatch[1]}`;
  } else if (handleUrlMatch) {
    param = `forHandle=@${handleUrlMatch[1]}`;
  } else if (userUrlMatch) {
    param = `forUsername=${userUrlMatch[1]}`;
  } else if (/^UC[a-zA-Z0-9_-]{22}$/.test(trimmed)) {
    // Bare channel ID (YouTube's IDs are always "UC" + 22 chars).
    param = `id=${trimmed}`;
  } else if (trimmed.startsWith('@')) {
    param = `forHandle=${trimmed}`;
  } else {
    // Bare word with no recognizable format — most likely a handle typed without
    // the "@", since handles are YouTube's current standard. forUsername is tried
    // as a fallback only if forHandle finds nothing (see below).
    param = `forHandle=@${trimmed}`;
  }

  const url = `${BASE_URL_V3}/channels?part=snippet,statistics&${param}&key=${apiKey}`;
  const data = await apiFetch(url);
  let item = data.items?.[0];

  if (!item && !channelUrlMatch && !handleUrlMatch && !/^UC/.test(trimmed)) {
    // Last-resort fallback for legacy custom names that are usernames, not handles.
    const fallbackUrl = `${BASE_URL_V3}/channels?part=snippet,statistics&forUsername=${encodeURIComponent(trimmed.replace(/^@/, ''))}&key=${apiKey}`;
    const fallbackData = await apiFetch(fallbackUrl);
    item = fallbackData.items?.[0];
  }

  if (!item) {
    throw new Error(
      `Channel tidak ditemukan. Coba tempel link channel langsung (youtube.com/channel/... atau youtube.com/@handle) atau ID channel-nya.`
    );
  }
  return toChannelStats(item);
}

/** 1 unit per 50-ID chunk — the entire watchlist refreshes for ~1 unit total in
 * practice (watchlists are small), and never touches search.list. */
export async function getChannelStats(channelIds: string[], apiKey: string): Promise<ChannelStats[]> {
  const results: ChannelStats[] = [];
  for (let i = 0; i < channelIds.length; i += 50) {
    const chunk = channelIds.slice(i, i + 50);
    const url = `${BASE_URL_V3}/channels?part=snippet,statistics&id=${chunk.join(',')}&key=${apiKey}`;
    const data = await apiFetch(url);
    for (const item of data.items || []) {
      results.push(toChannelStats(item));
    }
  }
  return results;
}

// ---- Fase 7: Playlist management (OAuth write scope) ----

/** 1 unit/page. All playlists owned by the connected channel, paginated. */
export async function getMyPlaylists(accessToken: string): Promise<{ playlists: PlaylistSummary[]; pagesFetched: number }> {
  const playlists: PlaylistSummary[] = [];
  let pageToken: string | undefined;
  let pagesFetched = 0;
  do {
    const url =
      `${BASE_URL_V3}/playlists?part=snippet,contentDetails,status&mine=true&maxResults=50` +
      (pageToken ? `&pageToken=${pageToken}` : '');
    const data = await apiFetch(url, { accessToken });
    pagesFetched += 1;
    for (const item of data.items || []) {
      playlists.push({
        playlistId: item.id,
        title: item.snippet?.title || '(tanpa judul)',
        description: item.snippet?.description || '',
        itemCount: item.contentDetails?.itemCount ?? 0,
        privacyStatus: item.status?.privacyStatus || 'private',
        thumbnailUrl: item.snippet?.thumbnails?.default?.url || '',
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return { playlists, pagesFetched };
}

/** 1 unit/page. Items (videos) inside one playlist, in playlist order (position). */
export async function getPlaylistItems(playlistId: string, accessToken: string): Promise<{ items: PlaylistItem[]; pagesFetched: number }> {
  const items: PlaylistItem[] = [];
  let pageToken: string | undefined;
  let pagesFetched = 0;
  do {
    const url =
      `${BASE_URL_V3}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50` +
      (pageToken ? `&pageToken=${pageToken}` : '');
    const data = await apiFetch(url, { accessToken });
    pagesFetched += 1;
    for (const item of data.items || []) {
      items.push({
        playlistItemId: item.id,
        videoId: item.snippet?.resourceId?.videoId || '',
        title: item.snippet?.title || '',
        position: item.snippet?.position ?? 0,
        thumbnailUrl: item.snippet?.thumbnails?.default?.url || '',
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  items.sort((a, b) => a.position - b.position);
  return { items, pagesFetched };
}

/** 50 units. Creates a new playlist. */
export async function createPlaylist(
  title: string,
  description: string,
  privacyStatus: 'private' | 'unlisted' | 'public',
  accessToken: string
): Promise<PlaylistSummary> {
  const url = `${BASE_URL_V3}/playlists?part=snippet,status`;
  const data = await apiFetch(url, {
    accessToken,
    method: 'POST',
    body: { snippet: { title, description }, status: { privacyStatus } },
  });
  return {
    playlistId: data.id,
    title: data.snippet?.title || title,
    description: data.snippet?.description || description,
    itemCount: 0,
    privacyStatus: data.status?.privacyStatus || privacyStatus,
    thumbnailUrl: data.snippet?.thumbnails?.default?.url || '',
  };
}

/** 50 units. Appends a video to a playlist. */
export async function addVideoToPlaylist(playlistId: string, videoId: string, accessToken: string): Promise<void> {
  const url = `${BASE_URL_V3}/playlistItems?part=snippet`;
  await apiFetch(url, {
    accessToken,
    method: 'POST',
    body: { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } },
  });
}

/** 50 units. Removes one item (by playlistItemId, NOT videoId) from its playlist. */
export async function removePlaylistItem(playlistItemId: string, accessToken: string): Promise<void> {
  const url = `${BASE_URL_V3}/playlistItems?id=${playlistItemId}`;
  await apiFetch(url, { accessToken, method: 'DELETE' });
}

/** 50 units. Moves an item to a new zero-based position within its playlist. Requires
 * the video id + playlist id in the resource (playlistItems.update replaces the snippet). */
export async function movePlaylistItem(
  playlistItemId: string,
  playlistId: string,
  videoId: string,
  position: number,
  accessToken: string
): Promise<void> {
  const url = `${BASE_URL_V3}/playlistItems?part=snippet`;
  await apiFetch(url, {
    accessToken,
    method: 'PUT',
    body: { id: playlistItemId, snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId }, position } },
  });
}

// ---- Fase 7: Thumbnails ----

/**
 * 50 units. Uploads a custom thumbnail for a video. thumbnails.set is a media-upload
 * endpoint — the body is the raw image bytes (NOT JSON), so this bypasses apiFetch's
 * JSON path and posts the File/Blob directly. Caller must pre-validate type/size
 * (jpeg/png, ≤2MB) — YouTube rejects otherwise.
 */
export async function setVideoThumbnail(videoId: string, file: File | Blob, accessToken: string): Promise<void> {
  const url = `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal set thumbnail (HTTP ${response.status})`);
  }
}

// ---- Fase 8: Video localizations (translated title/description per language) ----

export interface VideoLocalizationData {
  defaultLanguage: string | null;
  localizations: Record<string, { title: string; description: string }>;
  /** The base snippet's title/description (the default-language version). */
  baseTitle: string;
  baseDescription: string;
}

/** 1 unit. Reads a video's current default language + existing per-language localizations
 * so a translate write can MERGE rather than clobber other languages. */
export async function getVideoLocalizations(videoId: string, accessToken: string): Promise<VideoLocalizationData> {
  const url = `${BASE_URL_V3}/videos?part=snippet,localizations&id=${videoId}`;
  const data = await apiFetch(url, { accessToken });
  const item = data.items?.[0];
  if (!item) throw new Error(`Video ${videoId} tidak ditemukan.`);
  return {
    defaultLanguage: item.snippet?.defaultLanguage ?? null,
    localizations: item.localizations ?? {},
    baseTitle: item.snippet?.title ?? '',
    baseDescription: item.snippet?.description ?? '',
  };
}

/**
 * 50 units. Writes translated localizations for a video using strict READ-MERGE-WRITE:
 * re-fetches the CURRENT snippet + localizations, sets snippet.defaultLanguage (required
 * or YouTube returns defaultLanguageNotSet), MERGES the new language entries over the
 * existing map, and sends the COMPLETE localizations map back (the API replaces the whole
 * map, so anything omitted would be deleted — hence the merge). Existing translations for
 * languages not in `newLocalizations` are preserved.
 */
export async function updateVideoLocalizations(
  videoId: string,
  defaultLanguage: string,
  newLocalizations: Record<string, { title: string; description: string }>,
  accessToken: string
): Promise<void> {
  const currentUrl = `${BASE_URL_V3}/videos?part=snippet,localizations&id=${videoId}`;
  const current = await apiFetch(currentUrl, { accessToken });
  const item = current.items?.[0];
  const snippet = item?.snippet;
  if (!snippet) throw new Error(`Video ${videoId} tidak ditemukan atau tidak bisa diakses.`);

  const mergedLocalizations = { ...(item.localizations ?? {}), ...newLocalizations };

  // snippet.update requires title + categoryId; keep everything current, only set the
  // default language (needed to enable localizations).
  const mergedSnippet = { ...snippet, defaultLanguage };

  const updateUrl = `${BASE_URL_V3}/videos?part=snippet,localizations`;
  await apiFetch(updateUrl, {
    accessToken,
    method: 'PUT',
    body: { id: videoId, snippet: mergedSnippet, localizations: mergedLocalizations },
  });
}

// ---- Fase 7: Keyword rank check ----

/**
 * 1 search.list call (dedicated ~100/day bucket). Searches a keyword and returns the
 * 1-based rank of the FIRST video belonging to `channelId`, or null if not found in the
 * top `maxResults`. Uses search.list part=snippet (channelId is on each result's snippet).
 */
export async function findVideoRankForKeyword(
  keyword: string,
  channelId: string,
  apiKey: string,
  maxResults = 50
): Promise<{ rank: number | null; foundVideoId: string | null; foundTitle: string | null }> {
  const url = `${BASE_URL_V3}/search?part=snippet&type=video&q=${encodeURIComponent(keyword)}&maxResults=${maxResults}&key=${apiKey}`;
  const data = await apiFetch(url);
  const items = data.items || [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].snippet?.channelId === channelId) {
      return { rank: i + 1, foundVideoId: items[i].id?.videoId || null, foundTitle: items[i].snippet?.title || null };
    }
  }
  return { rank: null, foundVideoId: null, foundTitle: null };
}
