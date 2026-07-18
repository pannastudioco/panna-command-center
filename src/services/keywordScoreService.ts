import type { CompetitorVideoSample } from '@/types';

/**
 * Transparent keyword "opportunity" score — the VidIQ/TubeBuddy-style single number,
 * but with a fully disclosed formula (their exact weightings are proprietary; ours are
 * printable). It answers "is this term worth chasing?" = high demand + low competition.
 *
 * All inputs are things the app ALREADY has locally after a competition analysis:
 *   - demand: the autocomplete heuristic score (0-100) already on each suggestion.
 *   - competition: derived from the top competitor videos' view counts — a niche where
 *     the top results already pull huge views is harder to break into.
 *
 * This is explicitly NOT a real search-volume figure and makes no ranking guarantee.
 * The Google Trends signal remains a manual link-out (no clean/legal numeric API), so
 * it is intentionally not folded into this number — we don't fake a precision we can't
 * source.
 */

export interface KeywordOpportunity {
  score: number; // 0-100
  demandComponent: number; // 0-100
  competitionStrength: number; // 0-100 (higher = more competitive = worse)
  avgCompetitorViews: number;
  sampleSize: number;
}

const DEMAND_WEIGHT = 0.6;
const COMPETITION_WEIGHT = 0.4;

/** Map average competitor view count to a 0-100 "how contested is this" strength on a
 * log scale: ~1k avg → low, ~100k → high, ~1M+ → saturated. */
function competitionStrengthFromViews(avgViews: number): number {
  if (avgViews <= 0) return 0;
  // log10(1_000_000) = 6 → treat 1M avg views as full saturation (100).
  const raw = (Math.log10(avgViews + 1) / 6) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function computeKeywordOpportunity(
  demandScore: number,
  competitorSample: CompetitorVideoSample[]
): KeywordOpportunity {
  const demand = Math.max(0, Math.min(100, Math.round(demandScore)));
  const sampleSize = competitorSample.length;
  const avgViews =
    sampleSize > 0 ? competitorSample.reduce((sum, v) => sum + (v.viewCount || 0), 0) / sampleSize : 0;
  const competitionStrength = competitionStrengthFromViews(avgViews);

  // Opportunity rewards demand and penalises competition. "Room to rank" = 100 - strength.
  const score = Math.round(DEMAND_WEIGHT * demand + COMPETITION_WEIGHT * (100 - competitionStrength));

  return {
    score: Math.max(0, Math.min(100, score)),
    demandComponent: demand,
    competitionStrength,
    avgCompetitorViews: Math.round(avgViews),
    sampleSize,
  };
}
