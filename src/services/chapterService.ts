/**
 * Parse, validate, and serialise YouTube video chapters (the timestamped list in a
 * description that YouTube turns into a chapter track). All local string work — the
 * only network touch is when the caller writes the edited description back via the
 * existing updateVideoMetadata (partial patch on description).
 *
 * YouTube's rules for chapters to activate:
 *   - first timestamp MUST be 0:00
 *   - at least 3 timestamps
 *   - listed in ascending order
 *   - each chapter at least 10 seconds long
 */

export interface Chapter {
  /** seconds from start */
  start: number;
  label: string;
}

export interface ChapterValidation {
  ok: boolean;
  errors: string[];
}

const CHAPTER_LINE = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.+?)\s*$/;

function parseTimestamp(ts: string): number {
  const parts = ts.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return NaN;
}

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Extract chapters from a description, in document order. Only lines that look like
 * "<timestamp> <label>" are treated as chapters. */
export function parseChapters(description: string): Chapter[] {
  const chapters: Chapter[] = [];
  for (const line of (description ?? '').split('\n')) {
    const m = line.match(CHAPTER_LINE);
    if (!m) continue;
    const start = parseTimestamp(m[1]);
    if (Number.isNaN(start)) continue;
    chapters.push({ start, label: m[2].trim() });
  }
  return chapters;
}

export function validateChapters(chapters: Chapter[]): ChapterValidation {
  const errors: string[] = [];
  if (chapters.length < 3) {
    errors.push('Butuh minimal 3 chapter agar YouTube mengaktifkannya.');
  }
  if (chapters.length > 0 && chapters[0].start !== 0) {
    errors.push('Chapter pertama wajib mulai di 0:00.');
  }
  for (let i = 1; i < chapters.length; i++) {
    if (chapters[i].start <= chapters[i - 1].start) {
      errors.push(`Timestamp harus urut naik (masalah di "${chapters[i].label || '(tanpa judul)'}").`);
      break;
    }
    if (chapters[i].start - chapters[i - 1].start < 10) {
      errors.push(`Tiap chapter minimal 10 detik (terlalu rapat di "${chapters[i].label || '(tanpa judul)'}").`);
      break;
    }
  }
  if (chapters.some((c) => !c.label)) {
    errors.push('Setiap chapter butuh judul.');
  }
  return { ok: errors.length === 0, errors };
}

/** Render chapters back into the timestamp block. */
export function serialiseChapters(chapters: Chapter[]): string {
  return chapters.map((c) => `${formatTimestamp(c.start)} ${c.label}`).join('\n');
}

/**
 * Replace the existing chapter block inside a description with a new one, preserving
 * the surrounding non-chapter text. If the description has a contiguous run of chapter
 * lines, that run is swapped in place; otherwise the new block is appended under a
 * blank line. This keeps the rest of the description (links, CTAs) intact — mirrors the
 * "only touch what changed" principle used in the bulk editor's computePatch.
 */
export function replaceChapterBlock(description: string, chapters: Chapter[]): string {
  const lines = (description ?? '').split('\n');
  const isChapter = (line: string) => CHAPTER_LINE.test(line);

  // Find the first contiguous run of chapter lines.
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isChapter(lines[i])) {
      if (start === -1) start = i;
      end = i;
    } else if (start !== -1) {
      break; // run ended
    }
  }

  const block = serialiseChapters(chapters);

  if (start === -1) {
    const trimmed = (description ?? '').replace(/\s+$/, '');
    return trimmed ? `${trimmed}\n\n${block}` : block;
  }

  const before = lines.slice(0, start);
  const after = lines.slice(end + 1);
  return [...before, ...block.split('\n'), ...after].join('\n');
}
