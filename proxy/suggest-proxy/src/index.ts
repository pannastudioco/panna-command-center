/**
 * Single-purpose relay for YouTube's unofficial autocomplete/suggest endpoint.
 *
 * Exists only because that endpoint doesn't send CORS headers permitting arbitrary
 * browser origins, so panna-command-center's client can't call it directly. This
 * worker is the ONE non-client-only piece of the app — deliberately isolated here.
 *
 * Known trade-off (disclosed, not hidden): this endpoint is not part of the official
 * YouTube Data API, and Google's Developer Policies broadly prohibit scraping YouTube
 * data. Practical risk is low at personal, single-user query volume — this is the
 * same technique TubeBuddy/VidIQ themselves rely on for "search volume" estimates.
 *
 * Origin allow-list (not a shared secret): a secret embedded in a public client-side
 * bundle isn't actually secret — anyone can read it from the network tab or the built
 * JS. Restricting Access-Control-Allow-Origin to known origins is the real available
 * defense here: it can't stop a determined attacker scripting curl directly, but it
 * does stop casual abuse (another website embedding this URL, browser-based scraping
 * from a random origin), which was the actual open-relay gap this fixes.
 */

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  // Browsers never send a trailing slash (or any path) in the Origin header — it must be
  // exactly scheme://host with nothing after, or this exact-match check silently never fires.
  'https://panna-command-center.ai.studio',
];

const MAX_QUERY_LENGTH = 100;

function corsHeadersFor(origin: string | null): Record<string, string> {
  const isAllowed = !!origin && ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin! : 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function jsonResponse(body: unknown, origin: string | null, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeadersFor(origin) },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = request.headers.get('Origin');
    const isAllowedOrigin = !!origin && ALLOWED_ORIGINS.includes(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeadersFor(origin) });
    }

    if (!isAllowedOrigin) {
      return jsonResponse({ error: 'Origin not allowed.' }, origin, 403);
    }

    const url = new URL(request.url);
    if (url.pathname !== '/suggest') {
      return jsonResponse({ error: 'Not found. Use /suggest?q=<term>.' }, origin, 404);
    }

    const q = url.searchParams.get('q')?.trim() ?? '';
    if (!q) {
      return jsonResponse({ error: 'Missing required query param "q".' }, origin, 400);
    }
    if (q.length > MAX_QUERY_LENGTH) {
      return jsonResponse({ error: `Query too long (max ${MAX_QUERY_LENGTH} chars).` }, origin, 400);
    }

    const upstreamUrl = `https://suggestqueries-clients6.youtube.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`;

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(upstreamUrl);
    } catch {
      return jsonResponse({ error: 'Upstream suggest endpoint unreachable.' }, origin, 502);
    }

    if (!upstreamResponse.ok) {
      return jsonResponse({ error: `Upstream returned ${upstreamResponse.status}.` }, origin, 502);
    }

    let parsed: unknown;
    try {
      parsed = await upstreamResponse.json();
    } catch {
      return jsonResponse({ error: 'Upstream response was not valid JSON.' }, origin, 502);
    }

    // Response shape: [query, [suggestion, suggestion, ...], [], {metadata}]
    const suggestions = Array.isArray(parsed) && Array.isArray(parsed[1]) ? (parsed[1] as unknown[]) : [];
    const cleanSuggestions = suggestions.filter((s): s is string => typeof s === 'string');

    return jsonResponse({ query: q, suggestions: cleanSuggestions }, origin);
  },
};
