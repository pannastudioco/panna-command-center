import type { EditableVideo } from '@/types';

/**
 * Transparent, checklist-based SEO scoring — deliberately NOT a black box like
 * TubeBuddy's/VidIQ's undisclosed formulas. Every point is traceable to a rule the
 * UI can show verbatim, so the number is auditable rather than mysterious.
 *
 * This is 100% client-side heuristic over metadata the app already has. It is NOT a
 * ranking prediction and makes no claim about YouTube's actual algorithm — it just
 * flags the well-known on-page hygiene checks (title length, description depth,
 * timestamps, tag coverage, custom thumbnail) that every SEO tool checks.
 */

export type SeoCheckStatus = 'pass' | 'warn' | 'fail';

export interface SeoCheck {
  id: string;
  label: string;
  status: SeoCheckStatus;
  /** Points awarded by THIS check (0..weight). */
  points: number;
  /** Max points this check can contribute. */
  weight: number;
  /** Short, actionable hint shown when not a full pass. */
  hint: string;
}

export interface SeoScore {
  /** 0-100, sum of check points (weights total 100). */
  total: number;
  grade: 'A' | 'B' | 'C' | 'D';
  checks: SeoCheck[];
}

/** Rough "does the title share meaningful words with a focus keyword" test. Falls back
 * to neutral-pass when no focus keyword is supplied (we can't judge relevance then). */
function keywordInText(text: string, keyword: string | undefined): boolean {
  if (!keyword) return true;
  const words = keyword
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return true;
  const hay = text.toLowerCase();
  return words.some((w) => hay.includes(w));
}

/** YouTube treats lines like "0:00 Intro" / "1:23:45 Part" in the description as
 * chapters when the first is 0:00 and there are >=3 of them. */
const TIMESTAMP_LINE = /(?:^|\n)\s*(\d{1,2}:)?\d{1,2}:\d{2}\b/g;

function countTimestamps(description: string): number {
  const matches = description.match(TIMESTAMP_LINE);
  return matches ? matches.length : 0;
}

const URL_RE = /https?:\/\/[^\s]+/i;

/** Leading episode numbers / bracketed branding — YouTube officially says to move these
 * to the END ("Save episode numbers and branding for the end"). */
const LEADING_NOISE = /^\s*(?:ep(?:isode)?\.?\s*\d+|part\s*\d+|bagian\s*\d+|vol\.?\s*\d+|#\d+|\[[^\]]*\]|\([^)]*\))\s*[-–—|:]*\s*/i;

/** Where the focus keyword starts, as a 0..1 fraction of title length. Returns null when
 * the keyword isn't found at all (a different check covers keyword presence). */
function frontLoadPosition(title: string, keyword: string): number | null {
  const hay = title.toLowerCase();
  const words = keyword
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length === 0 || hay.length === 0) return null;
  const positions = words.map((w) => hay.indexOf(w)).filter((i) => i >= 0);
  if (positions.length === 0) return null;
  return Math.min(...positions) / hay.length;
}

/**
 * Score one video's metadata. `focusKeyword` is optional — when present, title/tag
 * relevance checks become meaningful; when absent they pass neutrally so the score
 * isn't unfairly penalised for information the caller didn't provide.
 */
export function scoreVideoSeo(
  video: Pick<EditableVideo, 'title' | 'description' | 'tags' | 'thumbnailUrl'>,
  focusKeyword?: string
): SeoScore {
  const title = video.title ?? '';
  const description = video.description ?? '';
  const tags = video.tags ?? [];

  const checks: SeoCheck[] = [];

  // Title length — ONLY the official 100-char hard cap is a real rule (answer/57407).
  // The "50-60" / "30-70 ideal" convention has NO official basis: YouTube publishes no
  // recommended title length, and never says where truncation occurs (it varies by
  // surface). We check the cap, and label the rest honestly rather than inventing a target.
  {
    const len = title.length;
    let status: SeoCheckStatus;
    let points: number;
    let hint: string;
    if (len === 0) {
      status = 'fail';
      points = 0;
      hint = 'Judul kosong.';
    } else if (len > 100) {
      status = 'fail';
      points = 0;
      hint = `Judul ${len} karakter — lewat batas keras resmi YouTube (100). Upload akan ditolak.`;
    } else if (len > 90) {
      status = 'warn';
      points = 5;
      hint = `Judul ${len}/100 karakter — mepet batas keras. Sisakan ruang.`;
    } else {
      status = 'pass';
      points = 8;
      hint = `${len}/100 karakter — aman.`;
    }
    checks.push({ id: 'title-length', label: 'Judul di bawah batas 100 karakter', status, points, weight: 8, hint });
  }

  // Front-loading — this one IS official: "aim to keep it short and put the most important
  // words near the beginning. Save episode numbers and branding for the end."
  // (answer/12340300). This replaces the fabricated character-count target.
  {
    const lead = LEADING_NOISE.exec(title);
    const kwPos = focusKeyword ? frontLoadPosition(title, focusKeyword) : null;
    let status: SeoCheckStatus;
    let points: number;
    let hint: string;
    if (lead) {
      status = 'warn';
      points = 6;
      hint = `Judul dibuka dengan "${lead[0].trim()}". Panduan resmi YouTube: "Save episode numbers and branding for the end" — taruh kata terpentingnya di depan.`;
    } else if (kwPos === null) {
      status = 'pass';
      points = 12;
      hint = 'Tidak ada nomor episode/branding di depan.';
    } else if (kwPos <= 0.4) {
      status = 'pass';
      points = 12;
      hint = 'Kata kunci utama sudah di depan — sesuai panduan resmi.';
    } else {
      status = 'warn';
      points = 6;
      hint = 'Kata kunci utama ada di belakang judul. Resmi: "put the most important words near the beginning" — geser ke depan.';
    }
    checks.push({ id: 'title-frontload', label: 'Kata penting di depan judul', status, points, weight: 12, hint });
  }

  // Keyword in title.
  {
    const ok = keywordInText(title, focusKeyword);
    checks.push({
      id: 'title-keyword',
      label: focusKeyword ? 'Kata kunci di judul' : 'Kata kunci di judul (tak dicek)',
      status: focusKeyword ? (ok ? 'pass' : 'fail') : 'warn',
      points: focusKeyword ? (ok ? 15 : 0) : 9,
      weight: 15,
      hint: focusKeyword
        ? ok
          ? 'Kata kunci utama muncul di judul.'
          : 'Sisipkan kata kunci utama di judul, idealnya di awal.'
        : 'Isi kata kunci fokus untuk mengecek relevansi judul.',
    });
  }

  // Description depth.
  {
    const len = description.length;
    let status: SeoCheckStatus;
    let points: number;
    if (len >= 250) {
      status = 'pass';
      points = 20;
    } else if (len >= 100) {
      status = 'warn';
      points = 12;
    } else {
      status = 'fail';
      points = len === 0 ? 0 : 5;
    }
    checks.push({
      id: 'desc-length',
      label: 'Kedalaman deskripsi',
      status,
      points,
      weight: 20,
      hint:
        len < 100
          ? 'Deskripsi terlalu tipis — target 250+ karakter, jelaskan isi video dengan kata kunci relevan.'
          : len < 250
            ? 'Tambah konteks — 250+ karakter memberi lebih banyak sinyal.'
            : 'Deskripsi cukup dalam.',
    });
  }

  // Timestamps / chapters in description.
  {
    const ts = countTimestamps(description);
    const hasChapters = ts >= 3;
    checks.push({
      id: 'desc-chapters',
      label: 'Chapter/timestamp',
      status: hasChapters ? 'pass' : ts > 0 ? 'warn' : 'fail',
      points: hasChapters ? 10 : ts > 0 ? 5 : 0,
      weight: 10,
      hint: hasChapters
        ? 'Chapter terdeteksi (bagus untuk navigasi & retensi).'
        : 'Tambah minimal 3 timestamp (mulai 0:00) untuk mengaktifkan chapter.',
    });
  }

  // Link in description.
  {
    const hasLink = URL_RE.test(description);
    checks.push({
      id: 'desc-link',
      label: 'Link di deskripsi',
      status: hasLink ? 'pass' : 'warn',
      points: hasLink ? 5 : 0,
      weight: 5,
      hint: hasLink ? 'Ada tautan (playlist/sosial/CTA).' : 'Tambah tautan relevan (playlist, channel, CTA).',
    });
  }

  // Tag count / coverage.
  {
    const n = tags.length;
    let status: SeoCheckStatus;
    let points: number;
    if (n >= 8) {
      status = 'pass';
      points = 15;
    } else if (n >= 3) {
      status = 'warn';
      points = 9;
    } else {
      status = 'fail';
      points = n === 0 ? 0 : 4;
    }
    checks.push({
      id: 'tag-count',
      label: 'Jumlah tag',
      status,
      points,
      weight: 15,
      hint:
        n < 3
          ? 'Terlalu sedikit tag — target 8+ tag relevan (campur luas & spesifik).'
          : n < 8
            ? 'Tambah tag — 8+ memberi cakupan kata kunci lebih baik.'
            : 'Cakupan tag baik.',
    });
  }

  // Keyword in tags.
  {
    const ok = focusKeyword ? tags.some((t) => keywordInText(t, focusKeyword)) : true;
    checks.push({
      id: 'tag-keyword',
      label: focusKeyword ? 'Kata kunci di tag' : 'Kata kunci di tag (tak dicek)',
      status: focusKeyword ? (ok ? 'pass' : 'fail') : 'warn',
      points: focusKeyword ? (ok ? 10 : 0) : 6,
      weight: 10,
      hint: focusKeyword
        ? ok
          ? 'Kata kunci utama ada di tag.'
          : 'Tambahkan tag yang mengandung kata kunci utama.'
        : 'Isi kata kunci fokus untuk mengecek tag.',
    });
  }

  // Custom thumbnail — default YouTube thumbnails come from i.ytimg.com auto-generated
  // frames; a custom one still lives on ytimg but we can't reliably distinguish. We only
  // fail when there's literally no thumbnail URL. (Soft check, low weight.)
  {
    const hasThumb = Boolean(video.thumbnailUrl);
    checks.push({
      id: 'thumbnail',
      label: 'Thumbnail tersedia',
      status: hasThumb ? 'pass' : 'fail',
      points: hasThumb ? 5 : 0,
      weight: 5,
      hint: hasThumb
        ? 'Thumbnail ada — pastikan custom & jelas terbaca di ukuran kecil.'
        : 'Belum ada thumbnail.',
    });
  }

  const total = Math.round(checks.reduce((sum, c) => sum + c.points, 0));
  const grade: SeoScore['grade'] = total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 50 ? 'C' : 'D';

  return { total, grade, checks };
}
