import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Mic, AlertCircle, Sparkles, Download, KeyRound } from 'lucide-react';
import type { NarrativeResult } from '@/services/geminiService';
import {
  synthesizeElevenLabs,
  synthesizeLmnt,
  synthesizeGeminiTts,
  GEMINI_TTS_VOICES,
  ELEVENLABS_MODELS,
  type VoiceoverProvider,
} from '@/services/voiceoverService';
import { useElevenLabsKey } from '@/hooks/useElevenLabsKey';
import { useLmntKey } from '@/hooks/useLmntKey';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { Loader } from '@/components/shared/Loader';
import { EmptyState } from '@/components/shared/ui/EmptyState';
import { HelpPanel } from '@/components/shared/ui/HelpPanel';

export interface VoiceoverResult {
  provider: VoiceoverProvider;
  blob: Blob;
  mimeExtension: 'mp3' | 'wav';
}

interface Props {
  geminiKeys: string[];
  narrative: NarrativeResult | null;
  onVoiceoverGenerated?: (v: VoiceoverResult) => void;
}

const PROVIDER_LABEL: Record<VoiceoverProvider, string> = {
  elevenlabs: 'ElevenLabs',
  lmnt: 'LMNT',
  gemini: 'Gemini TTS',
};

export const VoiceoverPanel: React.FC<Props> = ({ geminiKeys, narrative, onVoiceoverGenerated }) => {
  const { elevenLabsKey, saveKey: saveElevenLabsKey } = useElevenLabsKey();
  const { lmntKey, saveKey: saveLmntKey } = useLmntKey();

  const [provider, setProvider] = useState<VoiceoverProvider>('gemini');
  const [text, setText] = useState(narrative?.narrative ?? '');
  const [elevenLabsInput, setElevenLabsInput] = useState('');
  const [lmntInput, setLmntInput] = useState('');
  const [voiceId, setVoiceId] = useState(''); // ElevenLabs
  const [elevenLabsModel, setElevenLabsModel] = useState<string>(ELEVENLABS_MODELS[0].id);
  const [lmntVoice, setLmntVoice] = useState('leah'); // LMNT — "leah" is their own quickstart example
  const [geminiVoice, setGeminiVoice] = useState<string>(GEMINI_TTS_VOICES[3]); // 'Kore', Google's own example
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      let blob: Blob;
      if (provider === 'elevenlabs') {
        if (!elevenLabsKey) throw new Error('Isi & simpan API key ElevenLabs dulu.');
        if (!voiceId.trim()) throw new Error('Isi voice ID ElevenLabs dulu (dari dashboard akunmu).');
        blob = await synthesizeElevenLabs(elevenLabsKey, text.trim(), voiceId.trim(), { modelId: elevenLabsModel });
      } else if (provider === 'lmnt') {
        if (!lmntKey) throw new Error('Isi & simpan API key LMNT dulu.');
        blob = await synthesizeLmnt(lmntKey, text.trim(), lmntVoice.trim() || 'leah');
      } else {
        blob = await synthesizeGeminiTts(geminiKeys, text.trim(), geminiVoice);
      }
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      setAudioUrl(url);
      onVoiceoverGenerated?.({ provider, blob, mimeExtension: provider === 'gemini' ? 'wav' : 'mp3' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat voice over.');
    } finally {
      setIsLoading(false);
    }
  }, [provider, text, elevenLabsKey, voiceId, elevenLabsModel, lmntKey, lmntVoice, geminiKeys, geminiVoice, onVoiceoverGenerated]);

  if (!narrative) {
    return (
      <EmptyState
        icon={Mic}
        title="Belum ada narasi untuk dijadikan voice over"
        description='Selesaikan tab "Narasi" dulu, baru kembali ke sini.'
        tone="primary"
      />
    );
  }

  return (
    <div className="max-w-4xl space-y-5 animate-fade-in">
      <HelpPanel>
        <p>
          <strong>Voice Over</strong> — pilih salah satu dari 3 provider per video. ElevenLabs &amp;
          LMNT butuh API key sendiri-sendiri (akun berbayar, kamu isi di sini, tersimpan lokal di
          browser seperti key lainnya). Gemini TTS pakai key Gemini yang sudah ada.
        </p>
        <p className="text-xs text-text-muted">
          <strong>Catatan jujur:</strong> dokumentasi resmi ElevenLabs &amp; LMNT cuma menunjukkan
          contoh pakai lewat server (Python/Node dengan key disimpan sebagai secret) — bukan bukti
          panggilan langsung dari browser diblokir, tapi juga bukan konfirmasi itu didukung. Kalau
          muncul error &ldquo;Failed to fetch&rdquo; berulang, itu tandanya providernya butuh relay
          server (seperti suggest-proxy di app ini), bukan API key yang salah.
        </p>
      </HelpPanel>

      <Card padding="md" className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Provider</p>
        <div className="flex gap-2">
          {(Object.keys(PROVIDER_LABEL) as VoiceoverProvider[]).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`rounded-lg border px-3.5 py-2 text-sm transition-colors ${
                provider === p ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-muted hover:bg-surface-hover'
              }`}
            >
              {PROVIDER_LABEL[p]}
            </button>
          ))}
        </div>

        {provider === 'elevenlabs' && (
          <div className="space-y-2 pt-1">
            {!elevenLabsKey ? (
              <div className="flex gap-2">
                <input
                  value={elevenLabsInput}
                  onChange={(e) => setElevenLabsInput(e.target.value)}
                  placeholder="API key ElevenLabs"
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <Button size="sm" icon={<KeyRound className="w-3.5 h-3.5" />} disabled={!elevenLabsInput.trim()} onClick={() => saveElevenLabsKey(elevenLabsInput)}>
                  Simpan
                </Button>
              </div>
            ) : (
              <p className="text-xs text-success">API key ElevenLabs tersimpan.</p>
            )}
            <input
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              placeholder="Voice ID dari dashboard-mu (mis. JBFqnCBsd6RMkjVDRZzb — contoh resmi ElevenLabs)"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              value={elevenLabsModel}
              onChange={(e) => setElevenLabsModel(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {ELEVENLABS_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {provider === 'lmnt' && (
          <div className="space-y-2 pt-1">
            {!lmntKey ? (
              <div className="flex gap-2">
                <input
                  value={lmntInput}
                  onChange={(e) => setLmntInput(e.target.value)}
                  placeholder="API key LMNT"
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <Button size="sm" icon={<KeyRound className="w-3.5 h-3.5" />} disabled={!lmntInput.trim()} onClick={() => saveLmntKey(lmntInput)}>
                  Simpan
                </Button>
              </div>
            ) : (
              <p className="text-xs text-success">API key LMNT tersimpan.</p>
            )}
            <input
              value={lmntVoice}
              onChange={(e) => setLmntVoice(e.target.value)}
              placeholder="Nama voice LMNT (mis. leah)"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        )}

        {provider === 'gemini' && (
          <div className="pt-1">
            <select
              value={geminiVoice}
              onChange={(e) => setGeminiVoice(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {GEMINI_TTS_VOICES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        )}
      </Card>

      <Card padding="md" className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-text-faint">
          Teks (dari narasi, bisa diedit) — {text.trim().split(/\s+/).filter(Boolean).length} kata
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <p className="text-[11px] text-text-faint">
          Teks panjang bisa ditolak provider (LMNT resmi membatasi 5.000 karakter per panggilan) —
          potong narasi jadi beberapa bagian kalau perlu.
        </p>
      </Card>

      <Button icon={<Sparkles className="w-4 h-4" />} loading={isLoading} disabled={isLoading || !text.trim()} onClick={handleGenerate}>
        {isLoading ? 'Membuat voice over...' : 'Buat Voice Over'}
      </Button>

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger animate-slide-up">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {isLoading && <Loader label={`Menghasilkan audio via ${PROVIDER_LABEL[provider]}...`} />}

      {audioUrl && !isLoading && (
        <Card padding="md" className="space-y-3 animate-slide-up">
          <audio controls src={audioUrl} className="w-full" />
          <a
            href={audioUrl}
            download={`voiceover-${provider}.${provider === 'gemini' ? 'wav' : 'mp3'}`}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Download className="w-3.5 h-3.5" /> Unduh file audio
          </a>
        </Card>
      )}
    </div>
  );
};
