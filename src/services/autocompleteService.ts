import type { KeywordSuggestion } from '@/types';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

interface ProxyResponse {
  query: string;
  suggestions: string[];
  error?: string;
}

const getProxyUrl = (): string => {
  const url = import.meta.env.VITE_SUGGEST_PROXY_URL as string | undefined;
  if (!url) {
    throw new Error(
      'VITE_SUGGEST_PROXY_URL belum diset. Deploy proxy/suggest-proxy dulu (lihat README-nya), lalu isi .env.local.'
    );
  }
  return url;
};

async function fetchSuggestions(query: string): Promise<string[]> {
  const proxyUrl = getProxyUrl();
  const response = await fetch(`${proxyUrl}/suggest?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error(`Suggest proxy error (${response.status})`);
  }
  const data = (await response.json()) as ProxyResponse;
  if (data.error) throw new Error(data.error);
  return data.suggestions;
}

/**
 * "Alphabet soup" harvesting: query the seed term plus seed+" a".."z", collect real
 * YouTube autocomplete strings. Free (no Data API quota spent). NOT a real search-volume
 * number — appearances/avgPosition are a heuristic proxy, same category of estimate
 * TubeBuddy/VidIQ themselves surface.
 */
export async function harvestKeywordSuggestions(seed: string): Promise<KeywordSuggestion[]> {
  const trimmedSeed = seed.trim();
  if (!trimmedSeed) return [];

  const queries = ['', ...ALPHABET].map((suffix) => (suffix ? `${trimmedSeed} ${suffix}` : trimmedSeed));

  const results = await Promise.allSettled(queries.map((q) => fetchSuggestions(q)));

  const allFailed = results.every((r) => r.status === 'rejected');
  if (allFailed) {
    const firstRejection = results.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );
    const reason = firstRejection?.reason;
    throw reason instanceof Error ? reason : new Error('Gagal mengambil suggestion dari proxy.');
  }

  const stats = new Map<string, { appearances: number; positionSum: number }>();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    result.value.forEach((term, idx) => {
      const position = idx + 1;
      const existing = stats.get(term);
      if (existing) {
        existing.appearances += 1;
        existing.positionSum += position;
      } else {
        stats.set(term, { appearances: 1, positionSum: position });
      }
    });
  }

  const maxAppearances = Math.max(1, ...[...stats.values()].map((s) => s.appearances));

  const suggestions: KeywordSuggestion[] = [...stats.entries()].map(([term, s]) => {
    const avgPosition = s.positionSum / s.appearances;
    // Heuristic: more appearances across letter-queries + higher (lower-numbered) average
    // position both push the score up. Purely relative, not a real demand figure.
    const appearanceScore = (s.appearances / maxAppearances) * 70;
    const positionScore = Math.max(0, 30 - (avgPosition - 1) * 3);
    return {
      term,
      appearances: s.appearances,
      avgPosition: Math.round(avgPosition * 10) / 10,
      estimatedDemandScore: Math.round(appearanceScore + positionScore),
    };
  });

  return suggestions.sort((a, b) => b.estimatedDemandScore - a.estimatedDemandScore);
}
