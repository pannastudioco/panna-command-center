/**
 * YouTube Data API v3 unit costs, verified against Google's quota calculator
 * (developers.google.com/youtube/v3/determine_quota_cost) as of 2026-07-09.
 *
 * IMPORTANT (2026-06-01 change): search.list no longer draws from the shared
 * 10,000-unit pool — it now has its own dedicated bucket capped at ~100 calls/day.
 * The two pools below must be tracked and displayed separately.
 */
export const DAILY_UNIT_POOL = 10_000;
export const SEARCH_LIST_DAILY_CAP = 100;

export const QUOTA_COST = {
  videosList: 1,
  channelsList: 1,
  playlistItemsList: 1,
  playlistsList: 1,
  searchList: 1, // costs 1 call against the dedicated ~100/day search bucket, not the 10k pool
  videosUpdate: 50,
  // Fase 7 writes — all 50 units each per Google's quota calculator.
  playlistsInsert: 50,
  playlistItemsInsert: 50,
  playlistItemsDelete: 50,
  playlistItemsUpdate: 50,
  thumbnailsSet: 50,
} as const;
