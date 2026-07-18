/**
 * OAuth 2.0 scopes needed for the phases that require write/private access.
 * API-key-only calls (Fase 1) never touch these.
 *
 * youtube.force-ssl (not the bare "youtube" scope) per Google's own guidance for
 * read+write video metadata access — see developers.google.com/youtube/v3/guides/auth/installed-apps.
 * yt-analytics.readonly (not yt-analytics-monetary.readonly — no need for the sensitive
 * revenue scope) for Fase 3's thumbnail/CTR dashboard.
 */
export const OAUTH_SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl', 'https://www.googleapis.com/auth/yt-analytics.readonly'].join(
  ' '
);
