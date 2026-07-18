/**
 * Curated list of words/phrases YouTube's advertiser-friendly guidelines flag as
 * limited/no-ads risk, grouped by category. Sourced from YouTube's public
 * "Advertiser-friendly content guidelines" plus widely-circulated creator community
 * lists.
 *
 * HARD HONESTY LABEL (shown in UI): this is INDICATIVE only. It flags terms that CAN
 * trigger limited monetisation — it does NOT reproduce YouTube's actual classifier and
 * cannot decide the yellow/green icon. Context matters enormously (educational,
 * documentary, and musical uses are often fine). Treat hits as "worth a second look",
 * never as a verdict.
 */

export interface DemonetCategory {
  id: string;
  label: string;
  severity: 'high' | 'medium';
  words: string[];
}

export const DEMONETIZATION_CATEGORIES: DemonetCategory[] = [
  {
    id: 'violence',
    label: 'Kekerasan',
    severity: 'high',
    words: [
      'kill',
      'murder',
      'shooting',
      'gun',
      'weapon',
      'terrorist',
      'terrorism',
      'bomb',
      'attack',
      'assault',
      'blood',
      'gore',
      'death',
      'dead',
      'corpse',
      'massacre',
      'genocide',
      'war',
    ],
  },
  {
    id: 'profanity',
    label: 'Kata kasar',
    severity: 'medium',
    words: ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'damn', 'crap', 'dick', 'piss'],
  },
  {
    id: 'adult',
    label: 'Konten dewasa',
    severity: 'high',
    words: [
      'sex',
      'sexual',
      'porn',
      'nude',
      'naked',
      'nsfw',
      'onlyfans',
      'escort',
      'strip',
      'fetish',
      'xxx',
    ],
  },
  {
    id: 'substances',
    label: 'Obat & zat terlarang',
    severity: 'high',
    words: [
      'drug',
      'cocaine',
      'heroin',
      'meth',
      'weed',
      'marijuana',
      'cannabis',
      'vape',
      'cigarette',
      'alcohol',
      'drunk',
      'overdose',
    ],
  },
  {
    id: 'sensitive',
    label: 'Topik sensitif',
    severity: 'medium',
    words: [
      'suicide',
      'self harm',
      'self-harm',
      'depression',
      'abuse',
      'racist',
      'racism',
      'nazi',
      'slavery',
      'pandemic',
      'covid',
      'coronavirus',
    ],
  },
  {
    id: 'controversy',
    label: 'Kontroversi/tragedi',
    severity: 'medium',
    words: ['scandal', 'controversy', 'tragedy', 'disaster', 'crisis', 'protest', 'riot', 'scam', 'fraud'],
  },
];

export interface DemonetHit {
  word: string;
  category: string;
  severity: 'high' | 'medium';
  field: 'title' | 'description' | 'tags';
}

/** Flatten the categories once into a matcher list (word -> category/severity). */
const FLAT: { word: string; category: string; severity: 'high' | 'medium'; re: RegExp }[] =
  DEMONETIZATION_CATEGORIES.flatMap((cat) =>
    cat.words.map((word) => ({
      word,
      category: cat.label,
      severity: cat.severity,
      // Word-boundary, case-insensitive. Escape any regex-special chars in the term.
      re: new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
    }))
  );

/** Scan title/description/tags for risky terms. Returns each distinct hit with where it
 * was found. Purely local, zero network. */
export function scanDemonetization(input: {
  title?: string;
  description?: string;
  tags?: string[];
}): DemonetHit[] {
  const hits: DemonetHit[] = [];
  const seen = new Set<string>();

  const scanField = (text: string, field: DemonetHit['field']) => {
    if (!text) return;
    for (const entry of FLAT) {
      if (entry.re.test(text)) {
        const key = `${entry.word}|${field}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({ word: entry.word, category: entry.category, severity: entry.severity, field });
      }
    }
  };

  scanField(input.title ?? '', 'title');
  scanField(input.description ?? '', 'description');
  scanField((input.tags ?? []).join(' '), 'tags');

  // High severity first, then medium.
  return hits.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
}
