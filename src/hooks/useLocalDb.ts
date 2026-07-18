import { useCallback } from 'react';
import type { KeywordSuggestion, TagSuggestion, CompetitorVideoSample } from '@/types';
import { getDb } from '@/services/db';

const SUGGESTIONS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const COMPETITOR_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const isFresh = (fetchedAt: string, ttlMs: number) =>
  Date.now() - new Date(fetchedAt).getTime() < ttlMs;

/** Every function here is useCallback-stable — not just style: a plain function
 * recreated every render will change identity every time it's listed as a dependency
 * elsewhere, and if a future caller ever puts one in a useEffect dependency array (as
 * happened with the equivalent functions in useCompetitorSnapshots.ts), that's an
 * infinite render loop, not just a wasted allocation. */
export const useLocalDb = () => {
  const getCachedSuggestions = useCallback(async (seed: string): Promise<KeywordSuggestion[] | null> => {
    const db = await getDb();
    const entry = await db.get('suggestionsCache', seed);
    if (!entry || !isFresh(entry.fetchedAt, SUGGESTIONS_TTL_MS)) return null;
    return entry.suggestions;
  }, []);

  const setCachedSuggestions = useCallback(async (seed: string, suggestions: KeywordSuggestion[]) => {
    const db = await getDb();
    await db.put('suggestionsCache', { seed, fetchedAt: new Date().toISOString(), suggestions });
  }, []);

  const getCachedCompetitorAnalysis = useCallback(
    async (
      seed: string
    ): Promise<{ tagSuggestions: TagSuggestion[]; competitorSample: CompetitorVideoSample[] } | null> => {
      const db = await getDb();
      const entry = await db.get('competitorCache', seed);
      if (!entry || !isFresh(entry.fetchedAt, COMPETITOR_TTL_MS)) return null;
      return { tagSuggestions: entry.tagSuggestions, competitorSample: entry.competitorSample };
    },
    []
  );

  const setCachedCompetitorAnalysis = useCallback(
    async (seed: string, tagSuggestions: TagSuggestion[], competitorSample: CompetitorVideoSample[]) => {
      const db = await getDb();
      await db.put('competitorCache', {
        seed,
        fetchedAt: new Date().toISOString(),
        tagSuggestions,
        competitorSample,
      });
    },
    []
  );

  return {
    getCachedSuggestions,
    setCachedSuggestions,
    getCachedCompetitorAnalysis,
    setCachedCompetitorAnalysis,
  };
};
