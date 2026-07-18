import type { EditableVideo } from '@/types';
import { scoreVideoSeo } from './seoScoreService';

/**
 * Turns a video's metadata into a PRIORITISED, actionable optimisation plan mapped to
 * the discovery surfaces creators actually care about — YouTube Search, Suggested
 * videos, and Browse (home/subscriptions). Grounded ONLY in what YouTube officially
 * documents:
 *   - Search  → "how well the title, tags, description, and video content match your
 *               search query" + engagement (watch time for that query) + quality
 *               (answer/16090438).
 *   - Suggested → officially "suggestions that appear next to or after other videos, AND
 *                 from links in video descriptions" (answer/9314355). The description-link
 *                 route is a real, officially-stated, under-used lever.
 *   - Browse  → the impression unit (title + thumbnail) is the only pre-publish control;
 *               everything else YouTube names is viewer-side history/preference.
 *
 * KILLED — "session contribution": there is NO official source for this term or for any
 * formula like "watch time + satisfaction = session contribution". Domain-restricted
 * searches across support.google.com / blog.youtube / blog.google return nothing, and it
 * appears in none of the official recommendation or search docs. It is a vendor invention
 * that we previously repeated. Playlists/end screens ARE still recommended below — but on
 * their real official basis (answer/16533387), not this fabricated rationale.
 *
 * HONESTY DISCIPLINE (this is what separates a real tool from snake oil):
 *   - Impact is weighted by what YouTube has ACTUALLY said matters. Title/thumbnail/
 *     satisfaction/session are HIGH impact. Tags are LOW impact (YouTube has repeatedly
 *     said tags play a minimal role, mainly for misspellings/disambiguation) — we say so
 *     rather than overselling them.
 *   - No recommendation claims a guaranteed view increase or guaranteed placement. These
 *     are levers that improve the ODDS, applied to things you control (metadata). The
 *     biggest levers (actual content quality, first-30-seconds hook, thumbnail design)
 *     are flagged but cannot be auto-applied — they're your creative work.
 */

export type Surface = 'search' | 'suggested' | 'browse' | 'satisfaction';
export type Impact = 'high' | 'medium' | 'low';

/** Machine-actionable fix the UI can execute directly against the video. */
export type AutoFix =
  | { kind: 'add-hashtags'; hashtags: string[] } // append to description
  | { kind: 'add-tags'; tags: string[] } // append to tags
  | { kind: 'set-default-language'; note: string } // enables localisation/translate
  | { kind: 'append-description'; block: string; note: string };

export interface Recommendation {
  id: string;
  surface: Surface;
  impact: Impact;
  title: string;
  detail: string;
  /** Present when the fix can be executed in-app. Absent = it's creative/manual work. */
  autoFix?: AutoFix;
  /** For manual recs, which in-app tool helps (routing hint for the UI). */
  toolHint?: 'chapters' | 'thumbnail' | 'keyword-research' | 'analytics' | 'studio';
}

const SURFACE_LABEL: Record<Surface, string> = {
  search: 'YouTube Search',
  suggested: 'Suggested Videos',
  browse: 'Browse (Beranda/Langganan)',
  satisfaction: 'Kepuasan & Sesi',
};

const IMPACT_RANK: Record<Impact, number> = { high: 0, medium: 1, low: 2 };

/** Pull candidate keyword-ish tokens from a title: words 3+ chars, minus stopwords, plus
 * adjacent bigrams (bigrams are often the real search phrases). */
const STOPWORDS = new Set([
  'the','and','for','you','your','with','how','this','that','are','was','from','out','get',
  'dan','yang','untuk','dengan','ini','itu','di','ke','dari','buat','biar','aku','kamu','ada',
]);

function keywordTokensFromTitle(title: string): string[] {
  const words = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) bigrams.push(`${words[i]} ${words[i + 1]}`);
  // Prefer bigrams (more specific) then unigrams; dedupe, cap.
  return [...new Set([...bigrams, ...words])].slice(0, 8);
}

function toHashtag(phrase: string): string {
  return '#' + phrase.replace(/[^\p{L}\p{N}]/gu, '');
}

const URL_RE = /https?:\/\/[^\s]+/i;
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

/** Leading episode numbers / bracketed branding — officially discouraged: YouTube says to
 * "Save episode numbers and branding for the end" (answer/12340300). */
const LEADING_NOISE = /^\s*(?:ep(?:isode)?\.?\s*\d+|part\s*\d+|bagian\s*\d+|vol\.?\s*\d+|#\d+|\[[^\]]*\]|\([^)]*\))\s*[-–—|:]*\s*/i;

export function buildRecommendations(
  video: Pick<EditableVideo, 'title' | 'description' | 'tags' | 'defaultLanguage'>,
  opts?: { competitorTags?: string[] }
): Recommendation[] {
  const recs: Recommendation[] = [];
  const title = video.title ?? '';
  const description = video.description ?? '';
  const tags = video.tags ?? [];
  const titleKeywords = keywordTokensFromTitle(title);

  // ---- HIGH impact: title, thumbnail, hook (satisfaction/browse/search) ----

  // Only the 100-char cap is an official rule. The old "30–70 ideal" advice here had no
  // official basis and is gone; front-loading below is the officially-grounded replacement.
  if (title.length > 100) {
    recs.push({
      id: 'title-length',
      surface: 'browse',
      impact: 'high',
      title: 'Judul lewat batas keras 100 karakter',
      detail: `Judul ${title.length} karakter. Batas resmi YouTube 100 — di atas itu upload ditolak. Ini satu-satunya angka judul yang benar-benar resmi.`,
      toolHint: 'studio',
    });
  }

  if (LEADING_NOISE.test(title)) {
    recs.push({
      id: 'title-frontload',
      surface: 'browse',
      impact: 'high',
      title: 'Nomor episode/branding di depan judul',
      detail:
        'Panduan resmi YouTube: "aim to keep it short and put the most important words near the beginning. Save episode numbers and branding for the end." Di Browse penonton cuma lihat sebagian judul — kalau bagian depannya nomor episode, janji videonya tidak kebaca.',
      toolHint: 'studio',
    });
  }

  recs.push({
    id: 'thumbnail-ctr',
    surface: 'browse',
    impact: 'high',
    title: 'Pastikan thumbnail menang CTR',
    detail:
      'Browse adalah sumber trafik terkuat YouTube dan dipilih terutama oleh click-through. Uji keterbacaan thumbnail di ukuran kecil (mockup di tab Mockup Thumbnail), pastikan kontras tinggi, wajah/ekspresi atau subjek jelas, dan selaras dengan judul.',
    toolHint: 'thumbnail',
  });

  recs.push({
    id: 'hook-30s',
    surface: 'satisfaction',
    impact: 'high',
    title: 'Kunci 30 detik pertama',
    detail:
      'Di 2026, YouTube menilai kepuasan lebih dari watch-time mentah, dan 30 detik pertama jadi input inti. Buka dengan menepati janji judul/thumbnail langsung, tanpa intro basa-basi. (Ini kerja kreatif — tidak bisa di-apply otomatis, tapi dampaknya paling besar.)',
    toolHint: 'analytics',
  });

  // ---- MEDIUM: description depth, hashtags, session contribution ----

  if (description.length < 250) {
    recs.push({
      id: 'desc-depth',
      surface: 'search',
      impact: 'medium',
      title: 'Perdalam deskripsi',
      detail:
        'Deskripsi tipis memberi sedikit sinyal ke Search. Tulis 2–3 kalimat pembuka kaya kata kunci (bukan keyword stuffing), lalu detail isi. Target 250+ karahter.',
      autoFix:
        titleKeywords.length > 0
          ? {
              kind: 'append-description',
              note: 'Menyisipkan kerangka deskripsi berbasis kata kunci judul (silakan edit isinya).',
              block:
                `\n\nTentang video ini: ${title}. ` +
                `Di video ini kamu akan dapat ${titleKeywords.slice(0, 3).join(', ')}. ` +
                `Simak sampai habis untuk bagian pentingnya.`,
            }
          : undefined,
    });
  }

  const existingHashtags = (description.match(HASHTAG_RE) ?? []).map((h) => h.toLowerCase());
  if (existingHashtags.length < 3 && titleKeywords.length > 0) {
    const candidates = titleKeywords
      .map(toHashtag)
      .filter((h) => h.length > 2 && !existingHashtags.includes(h.toLowerCase()))
      .slice(0, 3);
    if (candidates.length > 0) {
      recs.push({
        id: 'hashtags',
        surface: 'search',
        impact: 'medium',
        title: 'Tambah hashtag relevan',
        detail:
          'Hingga 3 hashtag pertama di deskripsi tampil di atas judul dan bisa membawa trafik pencarian/topik. Pakai yang benar-benar relevan dengan isi, bukan asal ramai.',
        autoFix: { kind: 'add-hashtags', hashtags: candidates },
      });
    }
  }

  if (!URL_RE.test(description)) {
    recs.push({
      id: 'session-links',
      surface: 'suggested',
      impact: 'medium',
      title: 'Arahkan ke video/playlist kamu lagi',
      detail:
        'YouTube resmi mendefinisikan trafik Suggested sebagai saran di samping/sesudah video lain "AND from links in video descriptions" — jadi link di deskripsi itu jalur Suggested RESMI, bukan tebakan. Halaman Recommendation System juga menganjurkan langsung: "use clear calls to action (example: If you liked this, then watch...), playlists, and end screens". Tautkan playlist/video terkait di deskripsi, lalu pasang end screen lewat Studio.',
      autoFix: {
        kind: 'append-description',
        note: 'Menambah blok "Tonton berikutnya" — ganti tautan placeholder dengan playlist/video kamu.',
        block: '\n\n▶ Tonton berikutnya: (tempel link playlist/video terkait kamu di sini)',
      },
      toolHint: 'studio',
    });
  }

  // ---- Chapters (satisfaction + session) ----
  const hasChapters = (description.match(/(?:^|\n)\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\b/g) ?? []).length >= 3;
  if (!hasChapters) {
    recs.push({
      id: 'chapters',
      surface: 'satisfaction',
      impact: 'medium',
      title: 'Tambahkan chapter',
      detail:
        'Chapter (mulai 0:00, min 3) menaikkan navigasi & retensi — sinyal kepuasan. Buat di tab Editor Chapter, langsung tersimpan ke video.',
      toolHint: 'chapters',
    });
  }

  // ---- LOW: tags (honestly labelled as minor) ----
  if (tags.length < 8) {
    const candidateTags = [
      ...titleKeywords,
      ...(opts?.competitorTags ?? []),
    ]
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !tags.some((existing) => existing.toLowerCase() === t.toLowerCase()));
    const uniqueCandidates = [...new Set(candidateTags.map((t) => t.toLowerCase()))]
      .map((low) => candidateTags.find((t) => t.toLowerCase() === low)!)
      .slice(0, Math.max(0, 12 - tags.length));

    recs.push({
      id: 'tags',
      surface: 'search',
      impact: 'low',
      title: 'Lengkapi tag (dampak kecil)',
      detail:
        'Jujur: tag berperan kecil di algoritma modern (terutama untuk salah ketik/disambiguasi topik), bukan pengungkit utama. Tetap layak diisi 8–12 tag relevan selama tidak mengorbankan waktu dari judul/thumbnail.',
      autoFix: uniqueCandidates.length > 0 ? { kind: 'add-tags', tags: uniqueCandidates } : undefined,
    });
  }

  if (!video.defaultLanguage) {
    recs.push({
      id: 'default-language',
      surface: 'search',
      impact: 'low',
      title: 'Set bahasa default video',
      detail:
        'Menetapkan bahasa default membantu YouTube mengindeks bahasa yang benar dan MEMBUKA fitur terjemahan judul/deskripsi ke bahasa lain (memperluas jangkauan Search/Browse internasional). Ini prasyarat fitur Translate.',
      autoFix: {
        kind: 'set-default-language',
        note: 'Menetapkan bahasa default (mis. Indonesia) — bisa diubah nanti.',
      },
    });
  }

  return recs.sort((a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact]);
}

export { SURFACE_LABEL };

/** Convenience: current score + the plan in one call. */
export function auditVideo(
  video: Pick<EditableVideo, 'title' | 'description' | 'tags' | 'thumbnailUrl' | 'defaultLanguage'>,
  opts?: { competitorTags?: string[]; focusKeyword?: string }
) {
  return {
    score: scoreVideoSeo(video, opts?.focusKeyword),
    recommendations: buildRecommendations(video, opts),
  };
}
