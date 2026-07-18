import { executeApiCallWithRotation } from './apiExecutor';

/**
 * Voice-over synthesis — 3 providers, Kharis picks one per video in the UI. All 3 verified
 * against official docs (ElevenLabs: elevenlabs.io/docs/eleven-api/quickstart +
 * .../choosing-the-right-model + .../guides/cookbooks/text-to-speech; LMNT: docs.lmnt.com/
 * api-reference/speech/synthesize-speech-bytes + docs.lmnt.com/; Gemini: ai.google.dev/
 * gemini-api/docs/generate-content/speech-generation) — re-checked 2026-07-18.
 *
 * HONEST CAVEAT, STRENGTHENED after re-reading the docs directly: ElevenLabs' own quickstart
 * AND cookbook show ONLY server-side SDK examples (Python/TypeScript with an API-key-holding
 * backend), explicitly instructing "store the key as a managed secret" — never a raw browser
 * fetch() example. Same for LMNT's docs hub (Python/TypeScript/Go/cURL SDKs, no browser
 * mention). Neither is proof CORS is blocked (SDKs are commonly demoed server-side purely for
 * key-safety framing even when the underlying REST API is CORS-open), but it's a real signal
 * this app's direct-from-browser approach is NOT these providers' documented intended path —
 * unlike Gemini's API, which this app already knows sends browser-permitting CORS headers (see
 * geminiService.ts). If a browser blocks either call, fetch throws a generic "Failed to fetch"
 * with no HTTP status — that signature is called out in the error message below so it's
 * diagnosable rather than a mystery. If that happens, the fix is a Cloudflare Worker relay (the
 * same pattern suggest-proxy already uses for YouTube's autocomplete endpoint), not a code bug.
 */

export type VoiceoverProvider = 'elevenlabs' | 'lmnt' | 'gemini';

/** Gemini TTS's confirmed, exact prebuilt voice names — verified against the official Gemini
 * API speech-generation doc (not invented; picking anything outside this list is a real API
 * error, so this list must stay this exact, official set, no filler entries). */
export const GEMINI_TTS_VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
  'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome',
  'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima',
  'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
] as const;

const GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';

/** ElevenLabs model_id options — verified against the official "choosing the right model" doc.
 * `eleven_v3` is their current highest-fidelity/most-expressive model (used as the example in
 * both the official quickstart and cookbook) — default here since narration quality matters
 * more for pre-recorded video than the ~75ms latency `eleven_flash_v2_5` is optimised for
 * (that one is aimed at real-time conversational agents, a different use case). `eleven_multi
 * lingual_v2` (this app's earlier default, before this doc re-check) is NOT in the current
 * official model list — likely stale, replaced by these. */
export const ELEVENLABS_MODELS = [
  { id: 'eleven_v3', label: 'Eleven v3 — kualitas & ekspresi tertinggi (Recommended)' },
  { id: 'eleven_flash_v2_5', label: 'Eleven Flash v2.5 — seimbang, lebih cepat' },
  { id: 'eleven_flash_v2', label: 'Eleven Flash v2 — real-time, fokus Inggris' },
] as const;

function networkErrorHint(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return `${msg} — kemungkinan diblokir CORS browser (provider ini belum dikonfirmasi mendukung panggilan langsung dari browser). Kalau ini terus terjadi, providernya butuh relay seperti suggest-proxy, bukan bug di app.`;
  }
  return msg;
}

export async function synthesizeElevenLabs(
  apiKey: string,
  text: string,
  voiceId: string,
  opts: { modelId?: string } = {}
): Promise<Blob> {
  const { modelId = 'eleven_v3' } = opts;
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify({ text, model_id: modelId }),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`ElevenLabs API error (HTTP ${response.status}): ${errText || 'gagal membuat voice over.'}`);
    }
    return await response.blob();
  } catch (e) {
    throw new Error(networkErrorHint(e));
  }
}

export async function synthesizeLmnt(apiKey: string, text: string, voice: string): Promise<Blob> {
  try {
    const response = await fetch('https://api.lmnt.com/v1/ai/speech/bytes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey, 'lmnt-version': '1.2' },
      body: JSON.stringify({ text, voice }),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`LMNT API error (HTTP ${response.status}): ${errText || 'gagal membuat voice over.'}`);
    }
    return await response.blob();
  } catch (e) {
    throw new Error(networkErrorHint(e));
  }
}

/** Wraps raw PCM (16-bit, mono, given sample rate) in a standard 44-byte WAV header so the
 * browser's <audio> element and any download can play/open it directly. Gemini TTS returns
 * bare PCM — verified against the official doc, "PCM, 24kHz sample rate, 1-channel, 16-bit". */
function pcmToWavBlob(base64Pcm: string, sampleRate = 24000, channels = 1, bitsPerSample = 16): Blob {
  const binary = atob(base64Pcm);
  const pcmBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) pcmBytes[i] = binary.charCodeAt(i);

  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBytes.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  new Uint8Array(buffer, 44).set(pcmBytes);
  return new Blob([buffer], { type: 'audio/wav' });
}

async function callGeminiTts(text: string, voiceName: string, apiKey: string): Promise<Blob> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini TTS API error (HTTP ${response.status})`);
  }
  const data = await response.json();
  const base64: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64) throw new Error('Gemini TTS tidak mengembalikan audio.');
  return pcmToWavBlob(base64);
}

export async function synthesizeGeminiTts(geminiKeys: string[], text: string, voiceName: string): Promise<Blob> {
  if (geminiKeys.length === 0) throw new Error('Belum ada Gemini API key. Tambahkan dulu di AI Studio.');
  const { result } = await executeApiCallWithRotation(
    (key) => callGeminiTts(text, voiceName, key),
    geminiKeys,
    0,
    'gemini-tts'
  );
  return result;
}
