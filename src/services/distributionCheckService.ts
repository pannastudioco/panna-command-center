import type { EditableVideo } from '@/types';

/**
 * Pre-publish distribution check, built ONLY on YouTube's official taxonomy and officially
 * documented signals.
 *
 * WHY THIS EXISTS IN THIS SHAPE — read before editing:
 * We were asked to implement "The 4-Layer Distribution Test", "7 Discovery Surfaces",
 * "Signal Hierarchy — 5 Tiers" and a "2026 Gemini thumbnail signal". Live research (Jul 2026)
 * found ALL of them to be invented labels with zero provenance — no originator, no YouTube
 * doc, nothing on the web. So this module deliberately does NOT use those names. It uses
 * YouTube's real, official traffic-source names and its published recommendation signals.
 *
 * Hard rules encoded here:
 *  • Every check maps to something YouTube actually documents, or is marked official:false.
 *  • Tags are NOT scored — YouTube states they are "Not important", used mainly to correct
 *    common spelling mistakes.
 *  • Nothing here claims to measure CTR, retention, or viewer satisfaction: those don't exist
 *    before publish, and competitors' versions don't exist at all. Checks are limited to what
 *    a creator genuinely controls before hitting publish.
 *  • External and Notifications are excluded on purpose: YouTube officially does not count
 *    impressions there, so any CTR-style target for them would be fiction.
 *
 * Sources (official, evergreen):
 *  - Traffic source types: support.google.com/youtube/answer/9314355
 *  - Recommendation signals: support.google.com/youtube/answer/11914225
 *  - Search matching: title/description/video content vs the viewer's search
 *  - Tags "Not important": support.google.com/youtube/answer/141805
 *  - Impressions exclusions: support.google.com/youtube/answer/9314486
 */

/** YouTube's OFFICIAL traffic-source names — not invented labels. */
export type SurfaceId = 'browse' | 'suggested' | 'search' | 'playlists';

export type CheckStatus = 'pass' | 'fail' | 'manual';

export interface DistributionCheck {
  id: string;
  label: string;
  status: CheckStatus;
  /** What to actually do about it. */
  fix: string;
  /** True when the signal behind this check is documented by YouTube itself. */
  official: boolean;
}

export interface SurfaceReport {
  id: SurfaceId;
  /** YouTube's official name for this traffic source. */
  officialName: string;
  /** YouTube's verbatim definition. */
  definition: string;
  checks: DistributionCheck[];
  passed: number;
  failed: number;
  /** Overall: does the video clear every automatic check for this surface? */
  status: 'pass' | 'fail';
}

const YT_LINK_RE = /(youtube\.com\/(watch|playlist)|youtu\.be\/)/i;
const TIMESTAMP_RE = /(^|\n)\s*0:00(\s|\b)/;
/** Officially discouraged at the START of a title (answer/12340300): "Save episode numbers
 * and branding for the end." */
const LEADING_NOISE = /^\s*(?:ep(?:isode)?\.?\s*\d+|part\s*\d+|bagian\s*\d+|vol\.?\s*\d+|#\d+|\[[^\]]*\]|\([^)]*\))\s*[-–—|:]*\s*/i;

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.toLowerCase().split(needle.toLowerCase()).length - 1;
}

function check(
  id: string,
  label: string,
  ok: boolean | 'manual',
  fix: string,
  official: boolean
): DistributionCheck {
  return { id, label, status: ok === 'manual' ? 'manual' : ok ? 'pass' : 'fail', fix, official };
}

export interface DistributionInput {
  video: EditableVideo;
  targetKeyword?: string | null;
}

/**
 * BROWSE FEATURES — official: "Traffic from the Home, subscriptions, Watch Later,
 * Trending/Explore, and other browsing features."
 *
 * Officially documented drivers: what the viewer enjoyed before, whether viewers choose to
 * watch or select "not interested", average view duration and average percentage viewed,
 * likes, post-watch survey results. Of those, NOTHING is measurable pre-publish — the only
 * thing a creator controls up front is the impression unit itself: title + thumbnail.
 */
function browseChecks({ video, targetKeyword }: DistributionInput): DistributionCheck[] {
  const kw = (targetKeyword ?? '').trim();
  const titleKwCount = kw ? countOccurrences(video.title, kw) : 0;
  return [
    check(
      'browse-thumb',
      'Punya thumbnail',
      Boolean(video.thumbnailUrl),
      'Thumbnail + judul adalah SATU-SATUNYA hal yang dilihat penonton di Home. Tanpa thumbnail khusus, impression-mu terbuang.',
      true
    ),
    check(
      'browse-title-frontload',
      'Kata penting di depan judul (bukan nomor episode)',
      video.title.length > 0 && !LEADING_NOISE.test(video.title),
      'Panduan RESMI YouTube: "aim to keep it short and put the most important words near the beginning. Save episode numbers and branding for the end." Di Home penonton cuma lihat sebagian judul — kalau depannya nomor episode, janjinya tidak kebaca. (Catatan: YouTube TIDAK pernah menyebut angka karakter ideal — "50–60 karakter" itu karangan blog SEO. Yang resmi cuma batas keras 100 karakter, dan anjuran "taruh yang penting di depan". Jadi kami cek yang resmi saja.)',
      false
    ),
    check(
      'browse-no-stuffing',
      'Judul tidak keyword-stuffing',
      titleKwCount <= 1,
      'Keyword diulang lebih dari sekali di judul bikin bacaannya kaku buat penonton dingin di Home. Sekali saja.',
      false
    ),
    check(
      'browse-standalone',
      'Judul bisa berdiri sendiri',
      video.title.trim().split(/\s+/).length >= 3,
      'Di Home penonton belum kenal konteksmu. Judul harus masuk akal tanpa penjelasan tambahan.',
      false
    ),
    check(
      'browse-topic-fit',
      'Topik dekat dengan yang sudah ditonton audiensmu',
      'manual',
      'YouTube resmi memakai "apa yang pernah disukai penonton" dan "seberapa banyak sebuah channel/topik ditonton". Ini tidak bisa dicek otomatis — pastikan sendiri video ini masih satu lajur dengan yang sudah jalan di channelmu.',
      true
    ),
  ];
}

/**
 * SUGGESTED VIDEOS — official: "Traffic from suggestions that appear next to or after other
 * videos, and from links in video descriptions."
 *
 * The under-used part of that definition: description links OFFICIALLY count as Suggested
 * traffic. That makes this the one recommendation surface with a lever you can pull directly.
 * The core documented signal is "what videos are often watched together" (co-watch).
 */
function suggestedChecks({ video, targetKeyword }: DistributionInput): DistributionCheck[] {
  const kw = (targetKeyword ?? '').trim();
  return [
    check(
      'sug-desc-link',
      'Deskripsi berisi link ke video/playlist kamu',
      YT_LINK_RE.test(video.description),
      'Ini pengungkit paling nyata di sini: YouTube secara RESMI menghitung "link di deskripsi video" sebagai trafik Suggested. Tempel link video atau playlist kamu yang relevan.',
      true
    ),
    check(
      'sug-topic-overlap',
      'Topik/keyword nyambung dengan video lain',
      kw ? countOccurrences(video.title + ' ' + video.description, kw) >= 1 : false,
      kw
        ? 'Sinyal resmi Suggested adalah "video apa yang sering ditonton bersamaan". Pakai kata/topik yang sama dengan video populer di lajurmu supaya kamu jadi tontonan berikutnya yang wajar.'
        : 'Isi keyword target dulu supaya kecocokan topiknya bisa dicek.',
      true
    ),
    check(
      'sug-desc-depth',
      'Deskripsi cukup berisi (≥ 200 karakter)',
      video.description.length >= 200,
      'Deskripsi tipis bikin YouTube sulit menautkan video ini ke tontonan lain yang berdekatan.',
      false
    ),
    check(
      'sug-endscreen',
      'End screen menunjuk ke video berikutnya',
      'manual',
      'Tidak bisa dicek lewat API. Set di YouTube Studio — ini yang menyambung penonton ke video kamu berikutnya, bukan ke video orang lain.',
      false
    ),
  ];
}

/**
 * YOUTUBE SEARCH — official ranking statement: "How well the title, description, and video
 * content match the viewer's search." This is the ONE surface where keyword coverage is
 * officially, explicitly load-bearing.
 *
 * Note "video content" in that sentence: YouTube matches against the video itself, which is
 * why saying the keyword out loud early matters more than any tag.
 */
function searchChecks({ video, targetKeyword }: DistributionInput): DistributionCheck[] {
  const kw = (targetKeyword ?? '').trim();
  if (!kw) {
    return [
      check(
        'search-nokw',
        'Keyword target belum diisi',
        false,
        'Search adalah satu-satunya surface yang resmi mencocokkan judul/deskripsi dengan yang diketik penonton. Tanpa keyword target, tidak ada yang bisa dicek di sini.',
        true
      ),
    ];
  }
  const desc = video.description.toLowerCase();
  const occurrences = countOccurrences(desc, kw);
  return [
    check(
      'search-kw-title',
      'Keyword ada di judul',
      countOccurrences(video.title, kw) >= 1,
      'YouTube resmi mencocokkan JUDUL dengan pencarian penonton. Tanpa keyword-nya di judul, kamu tidak ikut dipertimbangkan.',
      true
    ),
    check(
      'search-kw-desc-early',
      'Keyword ada di awal deskripsi',
      desc.slice(0, 200).includes(kw.toLowerCase()),
      'Deskripsi resmi ikut dicocokkan dengan pencarian. Taruh keyword-nya di kalimat pertama — itu juga cuplikan yang muncul di hasil search.',
      true
    ),
    check(
      'search-kw-natural',
      'Keyword muncul wajar (1–4x), bukan stuffing',
      occurrences >= 1 && occurrences <= 4,
      occurrences === 0
        ? 'Keyword belum muncul di deskripsi sama sekali.'
        : 'Keyword diulang terlalu sering. Turunkan ke 1–4x supaya tetap terbaca manusia.',
      false
    ),
    check(
      'search-content-match',
      'Keyword diucapkan di dalam video',
      'manual',
      'Pernyataan resmi YouTube menyebut "video content" ikut dicocokkan dengan pencarian — jadi menyebut keyword-nya dengan suara di awal video itu sinyal nyata, dan jauh lebih kuat dari tag apa pun. Tidak bisa dicek dari sini.',
      true
    ),
  ];
}

/**
 * PLAYLISTS — official traffic source: "Traffic from playlists that include your video."
 * Distinct from Browse/Suggested; a video sitting in a playlist keeps getting pulled in.
 */
function playlistChecks({ video }: DistributionInput): DistributionCheck[] {
  return [
    check(
      'pl-link',
      'Deskripsi menautkan playlist',
      /youtube\.com\/playlist/i.test(video.description),
      'Tautkan playlist yang memuat video ini. Link deskripsi resmi terhitung trafik Suggested, dan playlist-nya sendiri jadi sumber trafik tersendiri.',
      true
    ),
    check(
      'pl-chapters',
      'Punya chapter (mulai 0:00)',
      TIMESTAMP_RE.test(video.description),
      'Chapter memudahkan penonton melompat dan bertahan. Aturan resmi YouTube: timestamp pertama WAJIB 0:00, minimal 3, tiap segmen ≥10 detik.',
      true
    ),
    check(
      'pl-membership',
      'Video sudah masuk playlist yang tepat',
      'manual',
      'Cek di modul Playlist Manager. Video yang tidak masuk playlist mana pun kehilangan sumber trafik ini sepenuhnya.',
      true
    ),
  ];
}

const SURFACE_META: Record<SurfaceId, { officialName: string; definition: string }> = {
  browse: {
    officialName: 'Browse features',
    definition:
      'Resmi YouTube: "Traffic from the Home, subscriptions, Watch Later, Trending/Explore, and other browsing features." Home & Subscriptions tidak dipisah di level atas — keduanya di dalam Browse features.',
  },
  suggested: {
    officialName: 'Suggested videos',
    definition:
      'Resmi YouTube: "Traffic from suggestions that appear next to or after other videos, and from links in video descriptions."',
  },
  search: {
    officialName: 'YouTube search',
    definition:
      'Resmi YouTube: video diranking dari "how well the title, description, and video content match the viewer\'s search", plus performa & relevansi ke audiens.',
  },
  playlists: {
    officialName: 'Playlists',
    definition: 'Resmi YouTube: "Traffic from playlists that include your video."',
  },
};

/**
 * Runs the check for the 4 traffic sources that are both officially documented AND have
 * something a creator can act on before publishing. External and Notifications are left out
 * deliberately — YouTube officially does not count impressions there.
 */
export function checkDistribution(input: DistributionInput): SurfaceReport[] {
  const builders: Record<SurfaceId, (i: DistributionInput) => DistributionCheck[]> = {
    browse: browseChecks,
    suggested: suggestedChecks,
    search: searchChecks,
    playlists: playlistChecks,
  };

  return (['browse', 'suggested', 'search', 'playlists'] as SurfaceId[]).map((id) => {
    const checks = builders[id](input);
    const passed = checks.filter((c) => c.status === 'pass').length;
    const failed = checks.filter((c) => c.status === 'fail').length;
    return {
      id,
      ...SURFACE_META[id],
      checks,
      passed,
      failed,
      // 'manual' items never fail the surface — we can't verify them, so we don't pretend to.
      status: failed === 0 ? 'pass' : 'fail',
    };
  });
}

/** The honest note the UI must show alongside these results. */
export const DISTRIBUTION_DISCLAIMER =
  'Cek ini dibangun dari taksonomi traffic source RESMI YouTube dan sinyal yang benar-benar didokumentasikan — ' +
  'bukan dari "framework" yang beredar di blog SEO. Lolos semua cek TIDAK menjamin views: yang menentukan ' +
  'ranking adalah kepuasan & retensi penonton, yang baru ada setelah publish dan tidak pernah dibuka YouTube ke ' +
  'publik. Yang bisa dijamin cek ini: kamu tidak kehilangan trafik gara-gara hal yang sebenarnya kamu kontrol.';

/**
 * Tags are deliberately not scored above. The honest picture is more subtle than the usual
 * "tags are dead" take, and BOTH halves come from YouTube's own docs:
 *  - The dedicated tags Help doc says tags play a minimal role, mainly for misspellings.
 *  - BUT the "How YouTube search works" doc still names tags among the search-relevance
 *    inputs: "how well the title, tags, description, and video content match your search query".
 * So: tags are a real but minor SEARCH input, and close to irrelevant elsewhere. We don't
 * score them because optimising them is a poor use of your attention — not because they are
 * literally zero.
 */
export const TAGS_NOTE =
  'Tag sengaja TIDAK dinilai di sini. Gambaran jujurnya (dua-duanya dari dokumen resmi YouTube): dokumen khusus ' +
  'tag menyebut perannya minimal dan terutama untuk membetulkan salah ketik — TAPI dokumen "How YouTube search ' +
  'works" masih menyebut tag sebagai salah satu input relevansi pencarian ("title, tags, description, and video ' +
  'content"). Jadi tag itu input Search yang nyata tapi kecil, dan nyaris tak berarti di surface lain. Pasang ' +
  '5–8 tag relevan lalu berhenti — bukan karena tag nol, tapi karena perhatianmu jauh lebih berharga di judul, ' +
  'thumbnail, dan deskripsi.';
