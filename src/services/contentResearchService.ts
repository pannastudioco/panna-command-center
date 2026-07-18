import { executeApiCallWithRotation } from './apiExecutor';

/**
 * Grounded content research — Gemini + Google Search grounding (real, live web results with
 * citations), verified against the current REST shape (ai.google.dev/gemini-api/docs/generate-
 * content/google-search, checked 2026-07-18): `tools: [{ google_search: {} }]` on the classic
 * generateContent endpoint, citations come back in `candidates[0].groundingMetadata.groundingChunks`.
 *
 * Deliberately does NOT scrape or auto-download anything from Facebook/Instagram/TikTok — those
 * platforms' ToS prohibit automated scraping, and reusing someone else's downloaded photo/video in
 * a monetised upload is a real copyright/Content-ID risk to the channel regardless of edits applied
 * afterward. Instead this returns: (1) real cited source links from the grounded search itself, and
 * (2) ready-to-click search URLs (Google Images, YouTube, and each social platform's own public
 * search) so Kharis reviews and picks material himself — the same link-out pattern already used by
 * TrendLinkOut.tsx for Google Trends.
 */

const MODEL = 'gemini-3.5-flash';
const endpointUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export interface ResearchSource {
  title: string;
  url: string;
}

export interface ResearchResult {
  /** The written briefing (ringkasan, fakta kunci, angle, hal yang perlu diverifikasi). */
  briefing: string;
  /** Real cited pages from Gemini's own grounded search — not invented. */
  sources: ResearchSource[];
  /** The actual queries Gemini ran, for transparency. */
  searchQueries: string[];
  /** Ready-to-click search URLs — Kharis opens these himself, nothing is auto-fetched. */
  links: { label: string; url: string }[];
}

interface GroundedCallResult {
  text: string;
  sources: ResearchSource[];
  searchQueries: string[];
}

function buildPrompt(topic: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return (
    `Kamu asisten riset untuk kreator YouTube. Riset topik berikut memakai Google Search LANGSUNG ` +
    `(bukan dari memori/pengetahuan lama), lalu susun briefing siap pakai sebagai bahan narasi video.\n\n` +
    `TOPIK: ${topic}\n` +
    `TANGGAL HARI INI: ${today} — prioritaskan sumber tahun 2026 kecuali memang butuh konteks ` +
    `latar belakang/sejarah, dan tandai jelas kalau itu latar belakang bukan berita terkini.\n\n` +
    `ATURAN SUMBER (wajib diikuti ketat):\n` +
    `- Prioritaskan sumber resmi/media kredibel (media besar, lembaga resmi, dokumentasi resmi).\n` +
    `- Kalau sebuah klaim HANYA ada di sumber tidak resmi (blog, forum, medsos tanpa verifikasi), ` +
    `tulis eksplisit "(klaim, belum terverifikasi)" di sebelahnya — jangan sajikan sebagai fakta pasti.\n` +
    `- JANGAN mengarang detail, angka, kutipan, atau URL yang tidak benar-benar muncul dari hasil pencarian.\n` +
    `- JANGAN menyebut URL gambar/video spesifik kecuali benar-benar muncul di hasil pencarianmu sendiri — ` +
    `kalau tidak yakin, jangan sebut linknya sama sekali.\n\n` +
    `FORMAT OUTPUT (Bahasa Indonesia):\n` +
    `1. RINGKASAN (3-5 kalimat): inti topik, kenapa relevan sekarang.\n` +
    `2. FAKTA & DETAIL KUNCI (poin-poin, tandai "(klaim, belum terverifikasi)" bila perlu).\n` +
    `3. SUDUT PANDANG/ANGLE YANG BISA DIANGKAT (2-4 opsi berbeda dari topik yang sama).\n` +
    `4. HAL YANG PERLU DIVERIFIKASI LEBIH LANJUT sebelum dipakai (apa yang masih belum jelas/kontroversial).`
  );
}

async function callGrounded(topic: string, apiKey: string): Promise<GroundedCallResult> {
  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(topic) }] }],
      tools: [{ google_search: {} }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API Error (HTTP ${response.status})`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const text: string | undefined = candidate?.content?.parts
    ?.map((p: { text?: string }) => p.text)
    .filter(Boolean)
    .join('\n');

  if (!text) {
    const reason = candidate?.finishReason || data.promptFeedback?.blockReason;
    throw new Error(reason ? `Gemini tidak mengembalikan hasil (${reason}).` : 'Gemini tidak mengembalikan hasil.');
  }

  const groundingMetadata = candidate?.groundingMetadata ?? {};
  const rawChunks: unknown[] = groundingMetadata.groundingChunks ?? [];
  const sources: ResearchSource[] = rawChunks
    .map((c) => {
      const web = (c as { web?: { uri?: string; title?: string } })?.web;
      if (!web?.uri) return null;
      return { title: web.title || web.uri, url: web.uri };
    })
    .filter((s): s is ResearchSource => s !== null);

  const searchQueries: string[] = groundingMetadata.webSearchQueries ?? [];

  return { text, sources, searchQueries };
}

function dedupeSources(sources: ResearchSource[]): ResearchSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

/** Public search URLs only — no login, no scraping, no auto-download. Kharis clicks through and
 * picks material himself; only the destination URL is constructed here. */
function buildLinks(topic: string): { label: string; url: string }[] {
  const q = encodeURIComponent(topic);
  return [
    { label: 'Gambar (Google Images)', url: `https://www.google.com/search?q=${q}&tbm=isch` },
    { label: 'Video (YouTube)', url: `https://www.youtube.com/results?search_query=${q}` },
    { label: 'Facebook', url: `https://www.facebook.com/search/top?q=${q}` },
    { label: 'Instagram', url: `https://www.instagram.com/explore/search/keyword/?q=${q}` },
    { label: 'TikTok', url: `https://www.tiktok.com/search?q=${q}` },
  ];
}

export async function researchTopic(geminiKeys: string[], topic: string): Promise<ResearchResult> {
  const trimmed = topic.trim();
  if (!trimmed) throw new Error('Isi topik dulu.');
  if (geminiKeys.length === 0) throw new Error('Belum ada Gemini API key. Tambahkan dulu di AI Studio.');

  const { result } = await executeApiCallWithRotation(
    (key) => callGrounded(trimmed, key),
    geminiKeys,
    0,
    'gemini-research'
  );

  return {
    briefing: result.text,
    sources: dedupeSources(result.sources),
    searchQueries: result.searchQueries,
    links: buildLinks(trimmed),
  };
}
