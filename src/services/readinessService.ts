/**
 * Per-surface READINESS estimate for Search / Suggested / Browse.
 *
 * HONESTY, up front: this is NOT a win probability. No public or private API returns a real
 * chance-to-rank — YouTube ranks on viewer satisfaction it never exposes, and nobody can see
 * a competitor's CTR or retention. What this computes is "how well-optimised and
 * competitively-positioned is this video on each surface", from signals we can genuinely
 * obtain, with every component shown so the number is auditable rather than a black box.
 *
 * Design validated against live 2026 research into how vidIQ/TubeBuddy actually compose
 * their scores and which signals map to which surface. The weights below are OUR published
 * design choice reflecting YouTube's stated signal emphasis — not YouTube's or vidIQ's
 * disclosed internals.
 *
 * WHY THIS IS NOT A CTR SCORE. YouTube's own A/B testing tool picks winners by watch time,
 * explicitly not clicks: "we optimize tests for overall watch time over other metrics, like
 * click-through-rate" (answer/13861714). And: "Great titles and thumbnails serve an important
 * purpose beyond getting viewers to click. They help a viewer understand what the video is
 * about so that they don't waste their time clicking on the wrong videos." A pre-publish tool
 * whose headline number is predicted CTR would be optimising for the one metric YouTube
 * deliberately declined to optimise for. So P (packaging) scores whether the promise is CLEAR
 * and DELIVERABLE, never how clickable it is. The only official CTR benchmark that exists is
 * "half of all channels and videos... between 2% and 10%" (answer/7628154) — every finer-grained
 * or niche-specific CTR figure in circulation is invented, and structurally must be: impressions
 * CTR is owner-only OAuth data, so no third party can run a large-sample CTR study.
 */

export type ComponentKey = 'M' | 'K' | 'P' | 'O' | 'R';
export type Surface = 'search' | 'suggested' | 'browse';

export interface ChecklistItem {
  label: string;
  ok: boolean;
  points: number;
  max: number;
}

export interface ComponentScore {
  key: ComponentKey;
  label: string;
  score: number; // 0..100
  /** False when the input was assumed rather than measured — drives the confidence band. */
  measured: boolean;
  detail: string;
}

export interface SurfaceScore {
  surface: Surface;
  label: string;
  score: number; // 0..100
  confidence: 'high' | 'medium' | 'low';
  /** Plain-language read of what's holding this surface back. */
  verdict: string;
}

export interface ReadinessInput {
  title: string;
  description: string;
  tags: string[];
  hasThumbnail: boolean;
  defaultLanguage?: string | null;
  targetKeyword?: string | null;
  /** Real view counts of the top results for the target keyword (search.list + videos.list). Enables O. */
  competitorViews?: number[] | null;
  /** Real averageViewPercentage 0-100 from the Analytics API. Enables R. */
  retentionPercent?: number | null;
}

export interface ReadinessResult {
  components: ComponentScore[];
  surfaces: SurfaceScore[];
  metadataChecklist: ChecklistItem[];
  keywordChecklist: ChecklistItem[];
}

/** Each row sums to 1.00. Search is the only surface where keywords genuinely dominate;
 * Browse is driven by packaging + retention, where keywords barely matter. */
const WEIGHTS: Record<Surface, Record<ComponentKey, number>> = {
  search: { M: 0.2, K: 0.35, P: 0.05, O: 0.25, R: 0.15 },
  suggested: { M: 0.15, K: 0.2, P: 0.25, O: 0.15, R: 0.25 },
  browse: { M: 0.1, K: 0.05, P: 0.35, O: 0.15, R: 0.35 },
};

const POWER_WORDS = /\b(secret|proven|shocking|exposed|nobody|never|truth|mistake|instantly|ultimate|free|new|cozy|deep)\b/i;
const TIMESTAMP_RE = /(^|\n)\s*0:00(\s|\b)/;
const ANY_TIMESTAMP_RE = /(^|\n)\s*\d{1,2}:\d{2}(:\d{2})?\s+\S/g;
/** Officially discouraged at the START of a title: "Save episode numbers and branding for
 * the end" (answer/12340300). */
const LEADING_NOISE = /^\s*(?:ep(?:isode)?\.?\s*\d+|part\s*\d+|bagian\s*\d+|vol\.?\s*\d+|#\d+|\[[^\]]*\]|\([^)]*\))\s*[-–—|:]*\s*/i;

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function sumChecklist(items: ChecklistItem[]): number {
  const earned = items.reduce((s, i) => s + i.points, 0);
  const max = items.reduce((s, i) => s + i.max, 0);
  return max > 0 ? clamp((earned / max) * 100) : 0;
}

/** M — metadata completeness. Only creator-controllable items we can actually verify from
 * the Data API are included; we don't score things we can't see (end screens, captions). */
function metadataChecklist(input: ReadinessInput): ChecklistItem[] {
  const { title, description, tags, hasThumbnail, defaultLanguage } = input;
  const hashtagCount = (description.match(/#\w+/g) ?? []).length;
  const timestampCount = (description.match(ANY_TIMESTAMP_RE) ?? []).length;
  const hasChapters = TIMESTAMP_RE.test(description) && timestampCount >= 3;
  // Official rule is the 100-char cap only (answer/57407) — YouTube publishes no
  // recommended title length. Front-loading IS official (answer/12340300), so we score
  // that instead of a made-up character window.
  const titleOk = title.length > 0 && title.length <= 100 && !LEADING_NOISE.test(title);

  return [
    { label: 'Judul ≤100 karakter & kata penting di depan', ok: titleOk, points: titleOk ? 20 : 0, max: 20 },
    {
      label: 'Deskripsi ≥ 1000 karakter',
      ok: description.length >= 1000,
      points: Math.round(Math.min(description.length / 1000, 1) * 20),
      max: 20,
    },
    {
      label: 'Tag 5–8 relevan',
      ok: tags.length >= 5,
      points: Math.round(Math.min(tags.length / 8, 1) * 15),
      max: 15,
    },
    { label: 'Hashtag 3–5', ok: hashtagCount >= 3 && hashtagCount <= 5, points: hashtagCount >= 3 && hashtagCount <= 5 ? 10 : 0, max: 10 },
    { label: 'Chapter mulai 0:00, min. 3', ok: hasChapters, points: hasChapters ? 20 : 0, max: 20 },
    { label: 'Bahasa default di-set', ok: !!defaultLanguage, points: defaultLanguage ? 10 : 0, max: 10 },
    { label: 'Thumbnail ada', ok: hasThumbnail, points: hasThumbnail ? 5 : 0, max: 5 },
  ];
}

/** K — keyword coverage. Mirrors what vidIQ/TubeBuddy actually check. */
function keywordChecklist(input: ReadinessInput): ChecklistItem[] {
  const kw = (input.targetKeyword ?? '').trim().toLowerCase();
  if (!kw) return [];
  const title = input.title.toLowerCase();
  const desc = input.description.toLowerCase();
  const tags = input.tags.map((t) => t.toLowerCase());

  const inTitle = title.includes(kw);
  const inTitleFront = title.slice(0, 60).includes(kw);
  const inDescFront = desc.slice(0, 200).includes(kw);
  const occurrences = desc.split(kw).length - 1;
  const repeated = occurrences >= 2 && occurrences <= 4;
  const inTags = tags.some((t) => t.includes(kw));
  // Semantic proxy: how many words of the keyword phrase appear across the metadata. We
  // can't read captions, so this stands in for topical coverage.
  const words = kw.split(/\s+/).filter((w) => w.length > 3);
  const covered = words.filter((w) => title.includes(w) || desc.includes(w) || tags.some((t) => t.includes(w)));
  const semanticRatio = words.length > 0 ? covered.length / words.length : 1;

  return [
    { label: 'Keyword ada di judul', ok: inTitle, points: inTitle ? 25 : 0, max: 25 },
    { label: 'Keyword di 60 karakter pertama judul', ok: inTitleFront, points: inTitleFront ? 10 : 0, max: 10 },
    { label: 'Keyword di 200 karakter pertama deskripsi', ok: inDescFront, points: inDescFront ? 20 : 0, max: 20 },
    { label: 'Keyword diulang 2–4x (tidak stuffing)', ok: repeated, points: repeated ? 10 : 0, max: 10 },
    { label: 'Keyword ada di tag', ok: inTags, points: inTags ? 15 : 0, max: 15 },
    {
      label: 'Kata-kata terkait tersebar di metadata',
      ok: semanticRatio >= 0.6,
      points: Math.round(semanticRatio * 20),
      max: 20,
    },
  ];
}

/** P — packaging. Objective proxies only; the genuinely subjective parts (is the thumbnail
 * striking? does the title spark curiosity?) are NOT scored — we say so rather than fake it. */
function packagingScore(input: ReadinessInput): { score: number; detail: string } {
  const { title, hasThumbnail } = input;
  let score = 0;
  const notes: string[] = [];

  if (hasThumbnail) score += 20;
  else notes.push('tidak ada thumbnail');

  if (title.length <= 60) score += 20;
  else notes.push('judul >60 karakter (kepotong di HP)');

  if (title.length >= 30) score += 15;
  else notes.push('judul terlalu pendek');

  if (/\d/.test(title)) score += 20;
  else notes.push('tidak ada angka spesifik');

  if (/[([]/.test(title)) score += 10;
  else notes.push('tidak ada kurung sebagai hook kedua');

  if (POWER_WORDS.test(title)) score += 15;
  else notes.push('tidak ada power word');

  return {
    score: clamp(score),
    detail: notes.length ? `Kurang: ${notes.join(', ')}.` : 'Semua sinyal packaging objektif terpenuhi.',
  };
}

/**
 * O — opportunity = 100 - competitor difficulty, computed from REAL fetched view counts of
 * the top results. log10-normalised against 10M views, median-based so one mega-video doesn't
 * distort it.
 */
function opportunityScore(views: number[]): number {
  const log7 = (x: number) => Math.min(Math.log10(x + 1) / 7, 1);
  const sorted = [...views].map(log7).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const difficulty = clamp(median * 100);
  return clamp(100 - difficulty);
}

function verdictFor(surface: Surface, c: Record<ComponentKey, number>, hasKeyword: boolean): string {
  if (surface === 'search') {
    if (!hasKeyword) return 'Set keyword target dulu — tanpa itu skor Search cuma menebak.';
    if (c.K < 50) return 'Keyword belum cukup masuk ke judul/deskripsi/tag. Ini pengungkit terbesar di Search.';
    if (c.O < 35) return 'Metadata sudah oke, tapi kata kuncinya diperebutkan video-video besar. Coba frasa yang lebih spesifik.';
    return 'Posisi Search sudah kuat; retensi yang menentukan sisanya.';
  }
  if (surface === 'suggested') {
    if (c.P < 50) return 'Packaging (judul+thumbnail) masih lemah, padahal itu yang bikin orang klik dari sidebar.';
    if (c.R < 40) return 'Retensi rendah menahan Suggested. Perbaiki 30 detik pertama.';
    return 'Cukup siap untuk Suggested; perkuat playlist & end screen biar sesi nyambung.';
  }
  if (c.P < 50) return 'Browse hampir seluruhnya soal packaging. Judul + thumbnail perlu digarap dulu.';
  if (c.R < 40) return 'Retensi rendah, dan Browse paling sensitif ke itu.';
  return 'Packaging & retensi mendukung; Browse tinggal soal seberapa cocok ke audiens.';
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const mList = metadataChecklist(input);
  const kList = keywordChecklist(input);
  const hasKeyword = kList.length > 0;

  const M = sumChecklist(mList);
  const K = hasKeyword ? sumChecklist(kList) : 0;
  const packaging = packagingScore(input);
  const P = packaging.score;

  const hasCompetitors = !!input.competitorViews && input.competitorViews.length > 0;
  const O = hasCompetitors ? opportunityScore(input.competitorViews!) : 50;

  const hasRetention = typeof input.retentionPercent === 'number';
  const R = hasRetention ? clamp(input.retentionPercent!) : 50;

  const c: Record<ComponentKey, number> = { M, K, P, O, R };

  const components: ComponentScore[] = [
    { key: 'M', label: 'Kelengkapan metadata', score: M, measured: true, detail: 'Dari checklist yang bisa dicek lewat API.' },
    {
      key: 'K',
      label: 'Cakupan keyword',
      score: K,
      measured: hasKeyword,
      detail: hasKeyword ? 'Dihitung terhadap keyword target kamu.' : 'Belum diukur — isi keyword target dulu.',
    },
    { key: 'P', label: 'Kekuatan packaging', score: P, measured: true, detail: `${packaging.detail} Sisi selera (thumbnail menarik/tidak) sengaja tidak dinilai.` },
    {
      key: 'O',
      label: 'Ruang peluang (vs kompetitor)',
      score: O,
      measured: hasCompetitors,
      detail: hasCompetitors
        ? 'Dari views asli video teratas untuk keyword ini.'
        : 'Belum diukur — dipakai nilai netral 50. Klik "Cek Kompetisi" untuk data asli.',
    },
    {
      key: 'R',
      label: 'Retensi',
      score: R,
      measured: hasRetention,
      detail: hasRetention
        ? 'Rata-rata persentase ditonton, dari YouTube Analytics (data asli kamu).'
        : 'Belum diukur — dipakai nilai netral 50.',
    },
  ];

  // Confidence follows how many of the two hard-to-get inputs (O, R) are real.
  const measuredCount = (hasCompetitors ? 1 : 0) + (hasRetention ? 1 : 0);
  const confidence: SurfaceScore['confidence'] = measuredCount >= 2 ? 'high' : measuredCount === 1 ? 'medium' : 'low';

  const labels: Record<Surface, string> = {
    search: 'Search (pencarian)',
    suggested: 'Suggested (video terkait)',
    browse: 'Browse (beranda)',
  };

  const surfaces: SurfaceScore[] = (['search', 'suggested', 'browse'] as Surface[]).map((surface) => {
    const w = WEIGHTS[surface];
    const score = Math.round(w.M * M + w.K * K + w.P * P + w.O * O + w.R * R);
    // Browse leans hardest on the two inputs we're least able to measure pre-publish, so it
    // never claims better than medium unless retention is real.
    const surfaceConfidence: SurfaceScore['confidence'] =
      surface === 'browse' && !hasRetention ? 'low' : confidence;
    return { surface, label: labels[surface], score, confidence: surfaceConfidence, verdict: verdictFor(surface, c, hasKeyword) };
  });

  return { components, surfaces, metadataChecklist: mList, keywordChecklist: kList };
}

/** The published weight matrix, so the UI can show exactly how each number was built. */
export const READINESS_WEIGHTS = WEIGHTS;
