/**
 * Browser-direct Gemini client. generativelanguage.googleapis.com sends CORS headers and
 * allowlists the x-goog-api-key header, so generateContent works straight from the page
 * (verified against the live API docs). The key is the user's own, pasted in the UI and
 * kept only in localStorage — NEVER written to a source file, same rule as the YouTube
 * keys.
 *
 * Free-tier rate limits vary per account and aren't reliably documented, so we don't
 * promise a number — quota/limit errors from Google are surfaced verbatim.
 */
import { MARKET_GUIDANCE } from '@/constants/languages';

/**
 * Model candidates in preference order (Kharis's actually-available models, July 2026).
 * Flash first — fast, cheap, free-tier — with the paid Pro model kept only as a last
 * resort so AI features never hard-fail if every Flash variant is momentarily unavailable.
 * Google rotates/retires model names fairly often (gemini-2.5-flash was pulled for new
 * users mid-2026), so we try each in order and cache the first that works — the client
 * self-heals across deprecations without a code change.
 */
const MODEL_CANDIDATES = [
  'gemini-3.5-flash',
  // Deliberately second: flash-lite is the cheap/high-quota escape hatch. When EVERY key is
  // rate-limited on the primary model, we drop to this rather than failing the user.
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
];
let cachedModel: string | null = null;

/**
 * Image-generation models (Nano Banana family). Kharis's pick — gemini-3.1-flash-lite-image
 * (Nano Banana 2 Lite, fast+cheap, 1K) — is first, with battle-tested + higher-quality
 * fallbacks. Same self-healing pattern as the text models: try in order, cache what works,
 * only fall through on model-availability errors. Verified via live docs: image output uses
 * the SAME generateContent endpoint with generationConfig.responseModalities:["IMAGE"] and
 * works from the browser (the newer Interactions API does NOT — its Api-Revision header
 * breaks CORS, so we deliberately avoid it).
 */
const IMAGE_MODEL_CANDIDATES = [
  'gemini-3.1-flash-lite-image',
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
  'gemini-3.1-flash-image-preview',
];
let cachedImageModel: string | null = null;

const endpointFor = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** Localisation clause injected into generator prompts so output is written NATIVELY for a
 * target market (not machine-translated) and never generic/templated. `null` = global English. */
function localeClause(market?: string | null): string {
  if (!market) {
    return (
      'Write for a global English-speaking audience. Be specific and human — strictly NO generic ' +
      'filler, NO template phrasing, NO "ultimate/best-ever" clichés.'
    );
  }
  const profile = MARKET_GUIDANCE[market];
  const base =
    `Write NATIVELY for the "${market}" market exactly as a local creator there would — do NOT ` +
    `machine-translate an English structure. Rebuild from the local search formula. STRICTLY ` +
    `anti-generic: no filler, no template phrasing, no clichés.`;
  return profile ? `${base}\n\nMarket profile to follow precisely:\n${profile}` : base;
}

interface GeminiSchema {
  type: string;
  properties?: Record<string, unknown>;
  items?: unknown;
  required?: string[];
  [k: string]: unknown;
}

class GeminiError extends Error {
  modelUnavailable: boolean;
  rateLimited: boolean;
  overloaded: boolean;
  invalidKey: boolean;
  /** The request reached the model fine but it returned no usable output — a safety/finish
   * block. Rotating keys or models will NOT help, so this must surface to the user rather
   * than be swallowed as an access/quota problem. */
  safetyBlock: boolean;
  constructor(
    message: string,
    modelUnavailable: boolean,
    rateLimited = false,
    overloaded = false,
    invalidKey = false,
    safetyBlock = false
  ) {
    super(message);
    this.modelUnavailable = modelUnavailable;
    this.rateLimited = rateLimited;
    this.overloaded = overloaded;
    this.invalidKey = invalidKey;
    this.safetyBlock = safetyBlock;
  }
}

/** True when the error means "this model name won't work" (retired/unknown/no access) —
 * the only case where trying a different model helps. Invalid-key and safety errors are NOT
 * model problems and must surface immediately. */
function isModelUnavailable(status: number, message: string): boolean {
  if (status === 404) return true;
  // Model-IDENTITY failures only (retired / unknown model name). Deliberately NOT bare
  // "is not available" or bare "not supported" — those phrases ALSO appear in TIER/billing
  // messages like "image generation is not available on the free tier", which must be handled
  // as an access block (enable billing), not mistaken for an unknown model name.
  return /no longer available|not found|unknown name|does not exist|update your code|is not supported for/i.test(
    message
  );
}

/** True when THIS KEY is out of quota / rate-limited — the case where rotating to another
 * key (from a different Google Cloud project) actually helps. */
function isRateLimited(status: number, message: string): boolean {
  if (status === 429) return true;
  return /quota|rate limit|rate-limit|resource[_ ]exhausted|exceeded your current quota|too many requests/i.test(
    message
  );
}

/** True when Google's side is momentarily busy ("This model is currently experiencing high
 * demand", 503 UNAVAILABLE, overloaded). NOT a key problem and NOT a model problem — the
 * request just needs retrying or a different model. Treating this as a bad key was a real
 * bug: it made every valid key look invalid whenever Gemini was under load. */
function isOverloaded(status: number, message: string): boolean {
  if (status === 503 || status === 500) return true;
  return /high demand|overloaded|currently unavailable|try again later|service unavailable|temporarily/i.test(
    message
  );
}

/** True ONLY when the key itself is rejected. Everything else (quota, overload) means the
 * key authenticated fine and the service is just busy or capped. */
function isInvalidKey(status: number, message: string): boolean {
  if (status === 401) return true;
  if (status === 400 || status === 403) {
    return /api[_ ]key[_ ]invalid|api key not valid|permission denied|unauthenticated|invalid authentication|caller does not have permission/i.test(
      message
    );
  }
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callModel<T>(
  model: string,
  apiKey: string,
  body: Record<string, unknown>,
  schema?: GeminiSchema
): Promise<T> {
  const response = await fetch(endpointFor(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const message = err.error?.message || `Gemini API Error (HTTP ${response.status})`;
    throw new GeminiError(
      message,
      isModelUnavailable(response.status, message),
      isRateLimited(response.status, message),
      isOverloaded(response.status, message),
      isInvalidKey(response.status, message)
    );
  }

  const data = await response.json();
  const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text === undefined) {
    const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason;
    throw new GeminiError(
      reason ? `Gemini tidak mengembalikan hasil (${reason}).` : 'Gemini tidak mengembalikan hasil.',
      false
    );
  }

  if (!schema) return text as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GeminiError('Gemini mengembalikan JSON yang tidak valid.', false);
  }
}

/**
 * Low-level call with TWO axes of resilience:
 *
 *  • KEYS (round-robin) — `keys` arrives already rotated by useGeminiKeys, so consecutive
 *    calls start on different keys and spread the load. Within a call, a rate-limited key
 *    falls straight through to the next one. This is what multiplies Gemini's tiny free
 *    tier (20 req/day per project) across several projects.
 *
 *  • MODELS (cheap fallback) — only once EVERY key is rate-limited on a model do we drop to
 *    the next, cheaper/higher-quota model rather than failing the user.
 *
 * Model-availability errors skip the model immediately (no point retrying other keys);
 * invalid-key and safety errors surface at once.
 */
async function geminiGenerate<T = string>(
  keys: string[],
  prompt: string,
  schema?: GeminiSchema
): Promise<T> {
  if (keys.length === 0) throw new Error('Belum ada Gemini API key. Tambahkan dulu di AI Studio.');

  const body: Record<string, unknown> = { contents: [{ parts: [{ text: prompt }] }] };
  if (schema) {
    body.generationConfig = { responseMimeType: 'application/json', responseSchema: schema };
  }

  const models = cachedModel
    ? [cachedModel, ...MODEL_CANDIDATES.filter((m) => m !== cachedModel)]
    : MODEL_CANDIDATES;
  let lastRateLimit: GeminiError | null = null;
  let lastModelError: GeminiError | null = null;

  let lastOverload: GeminiError | null = null;

  for (const model of models) {
    let everyKeyLimited = true;
    for (const key of keys) {
      // One retry on transient overload before giving up on this key/model pair — Gemini's
      // "high demand" spikes are usually seconds long.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await callModel<T>(model, key, body, schema);
          cachedModel = model;
          return result;
        } catch (e) {
          if (e instanceof GeminiError && e.overloaded) {
            lastOverload = e;
            if (attempt === 0) {
              await sleep(1200);
              continue; // retry the same key/model once
            }
            everyKeyLimited = false; // the model is busy, not the key — move to another model
            break;
          }
          if (e instanceof GeminiError && e.modelUnavailable) {
            lastModelError = e;
            everyKeyLimited = false;
            break;
          }
          if (e instanceof GeminiError && e.rateLimited) {
            lastRateLimit = e;
            break; // this key is spent — next key
          }
          throw e; // invalid key / safety / network — surface immediately
        }
      }
      if (!everyKeyLimited) break; // model-level problem: stop cycling keys, change model
    }
    if (!everyKeyLimited) continue;
    // Every key was rate-limited on this model → drop to the cheaper model.
  }

  cachedModel = null;
  if (lastRateLimit) {
    throw new Error(
      `Semua Gemini key kena limit. ${lastRateLimit.message} — tambah key dari project Google Cloud LAIN, atau tunggu kuota harian reset.`
    );
  }
  if (lastOverload) {
    throw new GeminiError(
      `Semua model Gemini lagi sibuk (bukan masalah key kamu). ${lastOverload.message}`,
      false,
      false,
      true
    );
  }
  throw lastModelError ?? new Error('Tidak ada model Gemini yang tersedia untuk key-key ini.');
}

/**
 * Validates ONE pasted key before it joins the pool.
 *
 * IMPORTANT: only a genuinely rejected key fails here. A quota cap (429) or a transient
 * "this model is experiencing high demand" (503) both mean the key AUTHENTICATED FINE — the
 * service is just busy or capped. Treating those as invalid was a real bug: it rejected 15
 * perfectly good keys in a row during a Gemini load spike.
 */
export async function validateGeminiKey(apiKey: string): Promise<void> {
  try {
    await geminiGenerate([apiKey], 'Reply with the single word: ok');
  } catch (e) {
    if (e instanceof GeminiError && e.invalidKey) throw e; // genuinely bad key
    if (e instanceof GeminiError && (e.rateLimited || e.overloaded)) return; // key is fine
    // Unknown/network error: accept rather than block the user. A bad key will fail loudly
    // the first time it's actually used, with Google's own message.
    return;
  }
}

// ---- Translate ----

export interface TranslationResult {
  languageCode: string;
  title: string;
  description: string;
}

/**
 * Translate one video's title+description into several target languages in a single
 * call. Returns structured results the UI can preview/edit before committing to YouTube
 * via localizations.
 */
export async function translateVideoMetadata(
  keys: string[],
  title: string,
  description: string,
  targetLanguages: { code: string; name: string }[]
): Promise<TranslationResult[]> {
  const prompt =
    `You are a professional YouTube localiser. Translate the following video title and description ` +
    `into these languages: ${targetLanguages.map((l) => `${l.name} (${l.code})`).join(', ')}.\n\n` +
    `Keep the meaning, tone, and any hashtags. Do NOT translate brand names, @handles, or URLs. ` +
    `Keep titles concise and natural for each language.\n\n` +
    `TITLE:\n${title}\n\nDESCRIPTION:\n${description}\n\n` +
    `Return one entry per requested language.`;

  const schema: GeminiSchema = {
    type: 'object',
    properties: {
      translations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            languageCode: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['languageCode', 'title', 'description'],
        },
      },
    },
    required: ['translations'],
  };

  const result = await geminiGenerate<{ translations: TranslationResult[] }>(keys, prompt, schema);
  return result.translations ?? [];
}

// ---- Generators ----

export interface TitleIdea {
  title: string;
  /** Which proven formula this title uses (e.g. "Curiosity gap", "Number + stakes"). */
  technique: string;
  reason: string;
}

/**
 * Title generation, grounded ONLY in YouTube's official title guidance (answer/12340300)
 * plus the 100-char hard cap (answer/57407).
 *
 * WHAT WAS REMOVED AND WHY — this block previously cited "vidIQ/SubSub large-sample
 * studies, Backlinko, Creator Hooks" and encoded "50-60 characters ideal" as a HARD RULE.
 * All of it is unsupported:
 *   - YouTube publishes NO recommended title length. Anywhere. The only official numbers
 *     are the 100-char cap (a technical limit) and the 2-10% CTR band. The one official
 *     page dedicated to title advice gives qualitative guidance only.
 *   - The cited CTR studies could not be verified and are structurally impossible:
 *     impressions CTR is owner-only OAuth data (yt-analytics.readonly), absent from the
 *     public Data API and unscrapeable. No third party can run a large-sample CTR study.
 * The DIRECTION is official ("be succinct", "put the most important words near the
 * beginning"); the NUMBER was invented. We now encode the direction and drop the number.
 */
export async function generateTitles(
  keys: string[],
  topic: string,
  opts: { market?: string | null; count?: number } = {}
): Promise<TitleIdea[]> {
  const { market = null, count = 6 } = opts;
  const prompt =
    `You are a top-tier YouTube packaging strategist. Generate ${count} titles for this ` +
    `topic/description: "${topic}".\n\n` +
    `OPTIMISE FOR WATCH TIME, NOT CLICKS. This is YouTube's own stated position, not a preference: ` +
    `its A/B testing tool "optimize[s] tests for overall watch time over other metrics, like ` +
    `click-through-rate", and it says "Great titles and thumbnails serve an important purpose beyond ` +
    `getting viewers to click. They help a viewer understand what the video is about so that they ` +
    `don't waste their time clicking on the wrong videos." So a title that wins the click but ` +
    `mis-sets expectations is a FAILURE, not a success — YouTube's documented clickbait signature is ` +
    `"high CTR but low average view duration". Every title must set an expectation the video ` +
    `actually pays off.\n\n` +
    `${localeClause(market)}\n\n` +
    `Use a DIFFERENT proven formula for each title, chosen from: Curiosity gap / open loop; ` +
    `Specific number + stakes; Compression (big value in a small time, e.g. "in 26 minutes"); ` +
    `Authority / credential-led; Transformation / result story; Blueprint / system; ` +
    `Warning / loss-aversion ("Stop doing X if..."); Identity / you-statement; Novelty / recency (2026).\n\n` +
    `Hard rules (these come from YouTube's own title guidance, not from folklore): stay under the ` +
    `100-character hard cap, and BE SUCCINCT — YouTube's guidance is "Viewers may only see part of ` +
    `your title. So aim to keep it short and put the most important words near the beginning. Save ` +
    `episode numbers and branding for the end." So front-load the main keyword AND the emotional hook, ` +
    `and never open with an episode number or channel brand. Do NOT pad a title to hit some character ` +
    `count — YouTube publishes no recommended length; shorter is fine if it still lands. ` +
    `Include at most ONE specific, believable number; ` +
    `build in exactly ONE curiosity element and never fully resolve the payoff in the title; use at most ` +
    `ONE bracket/parenthetical as a secondary hook; use 1-2 power words maximum (secret, proven, cozy, ` +
    `ultimate, nobody, truth, never) and do not stack more; prefer personal pronouns (you / your / I); ` +
    `never set the whole title in ALL CAPS; at most one emoji and none on the main clause; the promise ` +
    `must be TRUE and deliverable (clickbait that overpromises hurts retention and ranking).\n\n` +
    `Write the titles in the same language as the topic. For each, return the title, the technique name ` +
    `used, and a one-line reason it should perform.`;
  const schema: GeminiSchema = {
    type: 'object',
    properties: {
      titles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            technique: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['title', 'technique', 'reason'],
        },
      },
    },
    required: ['titles'],
  };
  const result = await geminiGenerate<{ titles: TitleIdea[] }>(keys, prompt, schema);
  return result.titles ?? [];
}

export interface DescriptionResult {
  description: string;
  /** One-line explanation of the structure choices, for the "why it works" toggle. */
  why: string;
}

/**
 * Description structure, grounded in official docs only:
 *   - Search officially matches "how well the title, tags, description, and video content
 *     match your search query" (answer/16090438) — so the description carries real search
 *     weight and the opening lines double as the snippet.
 *   - Suggested traffic officially includes "links in video descriptions" (answer/9314355)
 *     — the most under-used official lever there is, so we always build in a next-watch link.
 *   - Chapters and hashtags follow YouTube's own documented formats.
 *   - 5,000-char hard cap (answer/57407).
 * Vendor "best practice" (Backlinko/vidIQ) is deliberately NOT a source here — that corpus
 * was shown to fabricate both frameworks and statistics.
 */
export async function generateDescription(
  keys: string[],
  topic: string,
  opts: { market?: string | null; chosenTitle?: string | null } = {}
): Promise<DescriptionResult> {
  const { market = null, chosenTitle = null } = opts;
  const prompt =
    `You are a YouTube SEO copywriter. Write ONE video description for this topic: "${topic}".\n\n` +
    `${localeClause(market)}\n\n` +
    (chosenTitle
      ? `The video's chosen TITLE is: "${chosenTitle}". The description MUST be built around this exact ` +
        `title and its angle — the first line has to deliver on the promise the title makes, and reuse the ` +
        `title's main keyword verbatim. Title and description are ONE package, not two separate assets.\n\n`
      : '') +
    `Follow this exact structure:\n` +
    `1) First line (<=150 characters): the primary keyword + a concrete viewer payoff. This is the only ` +
    `text shown in search and suggested snippets, so make it earn the click.\n` +
    `2) Blank line, then a 2-4 sentence summary (~60-100 words) that repeats the primary keyword once plus ` +
    `2-3 natural related phrases (never keyword-stuff).\n` +
    `3) Blank line, then a "Chapters:" block whose first line is exactly "0:00 Intro" with at least 3 ` +
    `ascending placeholder timestamps.\n` +
    `4) Blank line, then 2-3 CTA link placeholders (Watch next / Subscribe / Playlist).\n` +
    `5) Blank line, then a 1-2 sentence closer reusing the primary keyword plus one long-tail variation.\n` +
    `6) Finally, 3-5 relevant hashtags on a single line (never more than 5).\n\n` +
    `Total 200-400 words, natural and human. Return the finished description text, and a one-line "why" ` +
    `explaining the key structure choices.`;
  const schema: GeminiSchema = {
    type: 'object',
    properties: {
      description: { type: 'string' },
      why: { type: 'string' },
    },
    required: ['description', 'why'],
  };
  return geminiGenerate<DescriptionResult>(keys, prompt, schema);
}

export interface KeywordCluster {
  theme: string;
  keywords: string[];
}

export async function clusterKeywords(keys: string[], keywords: string[]): Promise<KeywordCluster[]> {
  const prompt =
    `Group these YouTube keywords into a few themed clusters, and within each cluster order them from ` +
    `broad to specific. Keywords:\n${keywords.join(', ')}`;
  const schema: GeminiSchema = {
    type: 'object',
    properties: {
      clusters: {
        type: 'array',
        items: {
          type: 'object',
          properties: { theme: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } } },
          required: ['theme', 'keywords'],
        },
      },
    },
    required: ['clusters'],
  };
  const result = await geminiGenerate<{ clusters: KeywordCluster[] }>(keys, prompt, schema);
  return result.clusters ?? [];
}

export interface ContentIdea {
  title: string;
  /** The first spoken lines that open a loop within 5 seconds. */
  hook: string;
  /** Which ideation framework produced this idea (outlier, format-remix, etc.). */
  framework: string;
  /** The mechanism + evidence signal behind it (for the "why it works" toggle). */
  why: string;
}

/**
 * Ideas built from the frameworks top channels actually use (Paddy Galloway, Creator
 * Hooks, MrBeast, 1of10): outlier-mirroring, format-remix, packaging-first, search-gap,
 * series, and question-mining. Each idea comes back as a Title + Hook + framework + why,
 * so it's executable, not a vague "make a video about X".
 */
export async function generateContentIdeas(
  keys: string[],
  niche: string,
  opts: { market?: string | null; count?: number } = {}
): Promise<ContentIdea[]> {
  const { market = null, count = 6 } = opts;
  const prompt =
    `You are a YouTube ideation strategist. Suggest ${count} high-probability video ideas for a channel ` +
    `in this niche: "${niche}".\n\n` +
    `${localeClause(market)}\n\n` +
    `Use a MIX of these proven frameworks and tag each idea with the one used: ` +
    `Outlier (mirror a format that beat a channel baseline 3-10x); Format-remix (a proven format plus one ` +
    `unexpected twist); Packaging-first (a clear one-sentence promise turned into a title); ` +
    `Search-gap (a specific low-competition long-tail phrase); Series (Episode 1..N for binge sessions); ` +
    `Question-mine (a real audience question as the title).\n\n` +
    `For EACH idea return: a title (succinct, most important words first, under the 100-char hard cap — ` +
    `do not pad to a length target; containing a specific number or a contrast and at least ` +
    `one curiosity/fear/desire trigger); a 1-2 sentence hook (the opening spoken lines that open a loop ` +
    `within 5 seconds); the framework name; and a "why" that cites the mechanism plus an evidence signal ` +
    `(e.g. "mirrors a 10x outlier format") rather than "this will go viral". ` +
    `These are creative suggestions, not live trend data.`;
  const schema: GeminiSchema = {
    type: 'object',
    properties: {
      ideas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            hook: { type: 'string' },
            framework: { type: 'string' },
            why: { type: 'string' },
          },
          required: ['title', 'hook', 'framework', 'why'],
        },
      },
    },
    required: ['ideas'],
  };
  const result = await geminiGenerate<{ ideas: ContentIdea[] }>(keys, prompt, schema);
  return result.ideas ?? [];
}

// ---- Video Optimizer: real AI rewrite of an existing video's metadata ----

export interface OptimizedMetadata {
  title: string;
  description: string;
  tags: string[];
  /** 3-5 hashtags (without the leading #) to sit at the end of the description. */
  hashtags: string[];
  /** The single keyword this rewrite targets. */
  targetKeyword: string;
  /** What changed and why, for the "kenapa ini bekerja" toggle. */
  why: string;
}

/**
 * Rewrites a REAL existing video's metadata into an optimised set the user can apply
 * straight to YouTube. Unlike the generators (which invent from a topic), this reads the
 * video's current title/description/tags and improves them in place, keeping the video's
 * actual content honest — no promises the video doesn't deliver.
 */
export async function generateOptimizedMetadata(
  keys: string[],
  input: {
    currentTitle: string;
    currentDescription: string;
    currentTags: string[];
    niche: string;
    targetKeyword?: string | null;
    market?: string | null;
  }
): Promise<OptimizedMetadata> {
  const { currentTitle, currentDescription, currentTags, niche, targetKeyword = null, market = null } = input;
  const prompt =
    `You are a top-tier YouTube SEO + packaging strategist. Rewrite the metadata of this REAL, already-` +
    `published video so it performs better, without ever promising something the video does not deliver.\n\n` +
    `${localeClause(market)}\n\n` +
    `CHANNEL NICHE: ${niche}\n` +
    `CURRENT TITLE: ${currentTitle}\n` +
    `CURRENT DESCRIPTION:\n${currentDescription.slice(0, 1500)}\n` +
    `CURRENT TAGS: ${currentTags.join(', ') || '(none)'}\n` +
    (targetKeyword ? `TARGET KEYWORD (must be honoured verbatim): ${targetKeyword}\n` : '') +
    `\nGROUND EVERY CHOICE IN WHAT YOUTUBE ACTUALLY DOCUMENTS (these are official statements, not folklore):\n` +
    `• YOUTUBE SEARCH ranks on "how well the title, description, and video content match the viewer's search". ` +
    `This is the ONLY surface where keyword coverage is officially load-bearing — so the keyword belongs in the ` +
    `title and in the opening line of the description, phrased the way a person would actually search.\n` +
    `• SUGGESTED VIDEOS traffic is officially defined as "suggestions that appear next to or after other videos, ` +
    `AND from links in video descriptions". So a link to the creator's own related video/playlist inside the ` +
    `description is a real, documented lever — include a natural placeholder line for one.\n` +
    `• BROWSE FEATURES (Home) shows ONLY the title + thumbnail. The title must therefore make sense to a cold ` +
    `viewer with zero context, standing on its own.\n` +
    `• TAGS are officially "Not important" and are used mainly to correct common misspellings. Do NOT pad them.\n\n` +
    `Produce an optimised set:\n` +
    `TITLE — front-load the target keyword AND the hook early so the promise survives truncation in the feed. ` +
    `Keep it tight enough to read at a glance. At most ONE number, ONE curiosity element, ONE bracket, and ` +
    `1-2 power words. Never ALL CAPS. The promise MUST be true to the current video — an overpromise costs ` +
    `retention, which IS an officially documented ranking signal (average view duration / average percentage viewed).\n` +
    `DESCRIPTION — first line: the target keyword + a concrete payoff, phrased for a human (this line is the ` +
    `search/suggested snippet). Then a 2-4 sentence summary reusing the keyword once plus 2-3 related phrases, ` +
    `no stuffing. Include ONE "▶ Tonton juga: [link video/playlist kamu]" style line — officially this earns ` +
    `Suggested traffic. Keep any real timestamps/links already in the current description. ~200-400 words, human.\n` +
    `TAGS — 5-8 relevant tags only, then stop.\n` +
    `HASHTAGS — exactly 3-5, most important first, WITHOUT the leading '#'.\n` +
    `TARGET KEYWORD — the single phrase this rewrite targets.\n` +
    `WHY — 1-2 sentences naming exactly what you changed and which DOCUMENTED mechanism it improves ` +
    `(e.g. "put the keyword in the opening line because YouTube officially matches the description against the ` +
    `viewer's search"). Do not cite invented frameworks or made-up statistics.`;

  const schema: GeminiSchema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      hashtags: { type: 'array', items: { type: 'string' } },
      targetKeyword: { type: 'string' },
      why: { type: 'string' },
    },
    required: ['title', 'description', 'tags', 'hashtags', 'targetKeyword', 'why'],
  };
  return geminiGenerate<OptimizedMetadata>(keys, prompt, schema);
}

// ---- Thumbnail: concept brief + real image generation ----

export interface ThumbnailConcept {
  /** The scene to render (one clear, contained focal subject). */
  scene: string;
  /** 1-4 words of on-image text (may be empty for pure-ambience thumbnails). */
  text: string;
  palette: string;
  composition: string;
  /** Photoreal for real people/places; illustrated for lofi/ambience scenes. */
  style: 'photoreal' | 'illustrated';
  why: string;
}

/**
 * The dual-theme safety clause. YouTube's dark theme background is ~#0F0F0F and light is
 * #FFFFFF, so a thumbnail with near-white OR near-black edges dissolves into one of them.
 * Forcing a saturated mid-tone background + a contained subject fixes it at generation
 * time; thumbnailService then composites a hairline border as the belt-and-braces pass.
 */
const DUAL_THEME_CLAUSE =
  'CRITICAL rendering rules: 16:9 YouTube thumbnail. The background MUST be a single saturated MID-TONE ' +
  'colour (deep blue, teal, warm orange, or purple) with luminance roughly 0.3-0.6 — NEVER pure white and ' +
  'NEVER pure black, especially at the edges, because the thumbnail must stay clearly defined on BOTH ' +
  "YouTube's dark (#0F0F0F) and light (#FFFFFF) themes. One clearly-contained focal subject with a crisp " +
  'silhouette and a subtle rim light; it must never fade to white or black at the frame edge. Keep the outer ' +
  '10% margin and the top-right and bottom-right corners uncluttered (YouTube overlays icons there). High ' +
  'local contrast between background, subject, and any text. Any text must be 4 words max, very large, bold ' +
  'sans-serif with a thick outline, readable at 168x94 pixels.';

/** Designs the thumbnail concept AND the exact image prompt (dual-theme safe) in one call. */
export async function generateThumbnailConcept(
  keys: string[],
  input: { title: string; niche: string; market?: string | null }
): Promise<ThumbnailConcept> {
  const { title, niche, market = null } = input;
  const prompt =
    `You are a YouTube thumbnail art director for a ${niche} channel. Design ONE thumbnail concept for a ` +
    `video titled: "${title}".\n\n` +
    `${localeClause(market)}\n` +
    `Note: thumbnail text density is market-dependent — minimal 1-4 words for Western/Nordic/Dutch markets, ` +
    `denser bracket-tagged text for Japan, soft aesthetic mood for Korea/France. Follow the market profile.\n\n` +
    `${DUAL_THEME_CLAUSE}\n\n` +
    `Return ONLY the art direction — the app assembles the final image prompt itself, so do NOT restate the ` +
    `rendering rules:\n` +
    `- scene: one vivid English sentence describing the single contained focal subject and its setting.\n` +
    `- text: the on-image text, 1-4 words MAX, in the market's language — or an empty string if the concept ` +
    `is stronger with no text at all.\n` +
    `- palette: the colour palette in plain words (must be mid-tone, never pure white/black).\n` +
    `- composition: where the subject sits and where the eye goes.\n` +
    `- style: exactly "photoreal" for real people/places/sport, or "illustrated" for lofi/ambience/abstract scenes.\n` +
    `- why: the click psychology behind it.`;

  const schema: GeminiSchema = {
    type: 'object',
    properties: {
      scene: { type: 'string' },
      text: { type: 'string' },
      palette: { type: 'string' },
      composition: { type: 'string' },
      style: { type: 'string', enum: ['photoreal', 'illustrated'] },
      why: { type: 'string' },
    },
    required: ['scene', 'text', 'palette', 'composition', 'style', 'why'],
  };
  return geminiGenerate<ThumbnailConcept>(keys, prompt, schema);
}

interface InlineDataPart {
  inlineData?: { mimeType: string; data: string };
  text?: string;
}

async function callImageModel(model: string, apiKey: string, prompt: string): Promise<string> {
  const response = await fetch(endpointFor(model), {
    // Only content-type + x-goog-api-key: any extra header fails the CORS preflight on
    // generativelanguage.googleapis.com.
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '16:9' },
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const message = err.error?.message || `Gemini image error (HTTP ${response.status})`;
    throw new GeminiError(
      message,
      isModelUnavailable(response.status, message),
      isRateLimited(response.status, message),
      isOverloaded(response.status, message),
      isInvalidKey(response.status, message)
    );
  }

  const data = await response.json();
  const parts: InlineDataPart[] = data.candidates?.[0]?.content?.parts ?? [];
  const image = parts.find((p) => p.inlineData)?.inlineData;
  if (!image) {
    // Safety blocks / text-only fallback land here — not a model-availability problem, and
    // NOT an access/billing problem. Flag it so the rotation loop surfaces it instead of
    // mislabelling it "enable billing".
    const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason;
    throw new GeminiError(
      reason
        ? `Gemini tidak mengembalikan gambar (${reason}). Coba ubah deskripsi scene-nya.`
        : 'Gemini tidak mengembalikan gambar.',
      false,
      false,
      false,
      false,
      true
    );
  }
  return `data:${image.mimeType};base64,${image.data}`;
}

/**
 * Generates a real thumbnail image and returns it as a data URL. Same self-healing model
 * loop as the text client, so a retired/unavailable image model rolls to the next candidate
 * instead of hard-failing. The raw output is ~1MP 16:9 (not exactly 1280x720) — thumbnailService
 * normalises it to 1280x720 and adds the dual-theme border.
 */
export async function generateThumbnailImage(keys: string[], imagePrompt: string): Promise<string> {
  if (keys.length === 0) throw new Error('Belum ada Gemini API key. Tambahkan dulu di AI Studio.');
  const prompt = `${imagePrompt}\n\n${DUAL_THEME_CLAUSE}`;
  const models = cachedImageModel
    ? [cachedImageModel, ...IMAGE_MODEL_CANDIDATES.filter((m) => m !== cachedImageModel)]
    : IMAGE_MODEL_CANDIDATES;
  let lastAccessError: GeminiError | null = null; // quota/permission/billing — key OK, tier isn't
  let lastModelError: GeminiError | null = null; // model name unusable

  // Two-axis resilience: rotate keys, then drop model. CRITICAL: image generation is NOT
  // available on the Gemini free tier — EVERY image model (Nano Banana / Gemini Image) is
  // "Not available" on free tier and needs a billing-enabled project (verified against the
  // official pricing page; a free-tier dashboard shows these models at 0/0, i.e. limit zero).
  // So a free-tier key calling an image model returns EITHER 429 (quota exceeded — the limit
  // is literally 0) OR 403 (permission/billing). BOTH mean "this key's TIER can't use image
  // models", NOT "bad key" — the very same keys just succeeded on the text concept call. We
  // must therefore treat a 403/invalid here as an access-block and keep rotating, never abort
  // as if the key were bad (that was the bug: the loop had no invalidKey branch, so a 403 fell
  // through to `throw e` and killed the whole run before any fallback).
  for (const model of models) {
    let modelBroken = false;
    for (const key of keys) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const dataUrl = await callImageModel(model, key, prompt);
          cachedImageModel = model;
          return dataUrl;
        } catch (e) {
          if (!(e instanceof GeminiError)) throw e;
          if (e.safetyBlock) throw e; // model ran but refused output — keys/models won't fix it
          if (e.overloaded) {
            if (attempt === 0) {
              await sleep(1200);
              continue; // image models spike often — one retry is worth it
            }
            modelBroken = true;
            break;
          }
          if (e.modelUnavailable) {
            lastModelError = e;
            modelBroken = true;
            break;
          }
          // Everything else — 429 quota, 403 permission, 402/billing, or any other HTTP
          // failure — is treated as a TIER/access block, never as a bad key. These exact keys
          // just authenticated successfully on the text concept call, so the key is fine; the
          // free tier simply has no image quota. Record and keep rotating.
          lastAccessError = e;
          break; // next key, then next model
        }
      }
      if (modelBroken) break;
    }
  }
  cachedImageModel = null;
  if (lastAccessError) {
    throw new GeminiError(
      'Gagal membuat gambar. Penyebab paling umum bukan "limit harian" — pembuatan gambar ' +
        'TIDAK tersedia di free tier Gemini. Semua model gambar (Nano Banana / Gemini Image) ' +
        'butuh project Google Cloud dengan billing aktif. Free tier = 0 kuota gambar (dashboard ' +
        'menampilkan 0/0), jadi menambah key gratis tidak akan membantu. Solusi: aktifkan billing ' +
        `di satu project, lalu pakai key dari project itu. (Pesan Google: ${lastAccessError.message})`,
      false,
      true // flagged rateLimited so the UI degrades to concept-only rather than a red error
    );
  }
  throw lastModelError ?? new Error('Tidak ada model image Gemini yang tersedia untuk key-key ini.');
}

/** True when an error came from every key being out of quota — lets the UI degrade to
 * concept-only instead of showing a red failure. */
export function isQuotaError(e: unknown): boolean {
  return e instanceof GeminiError ? e.rateLimited : /limit|quota/i.test(String(e));
}
