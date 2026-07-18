import React, { useState, useCallback } from 'react';
import type { EditableVideo } from '@/types';
import { updateVideoLocalizations } from '@/services/youtubeDataService';
import { translateVideoMetadata, type TranslationResult } from '@/services/geminiService';
import { QUOTA_COST } from '@/constants/quotas';
import {
  TARGET_LANGUAGES,
  DEFAULT_LANGUAGE_OPTIONS,
  LANGUAGES_BY_TIER,
  TIER_META,
  type CpmTier,
} from '@/constants/languages';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { EmptyState } from '@/components/shared/ui/EmptyState';
import { Loader } from '@/components/shared/Loader';
import { Languages, Sparkles, Check, AlertCircle, CheckCircle2, Globe, ListVideo } from 'lucide-react';

interface Props {
  videos: EditableVideo[];
  accessToken: string | null;
  geminiKeys: string[];
  remainingUnitsToday: number;
  recordUnits: (units: number) => void;
}

const TIER_BADGE: Record<CpmTier, string> = {
  S: 'bg-primary/15 text-primary',
  A: 'bg-accent/15 text-accent',
  B: 'bg-info-bg text-info',
  C: 'bg-surface-raised text-text-muted',
};

export const TranslatePanel: React.FC<Props> = ({ videos, accessToken, geminiKeys, remainingUnitsToday, recordUnits }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLangs, setSelectedLangs] = useState<Set<string>>(new Set(['en']));
  const [defaultLang, setDefaultLang] = useState<string>('id');
  const [needsDefaultLang, setNeedsDefaultLang] = useState(false);
  const [translations, setTranslations] = useState<TranslationResult[] | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedVideo = videos.find((v) => v.videoId === selectedId) ?? null;

  const toggleLang = useCallback((code: string) => {
    setSelectedLangs((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const handleTranslate = useCallback(async () => {
    if (!selectedVideo || selectedLangs.size === 0) return;
    setError(null);
    setSuccess(null);
    setTranslations(null);
    setIsTranslating(true);
    try {
      const langs = TARGET_LANGUAGES.filter((l) => selectedLangs.has(l.code));
      const results = await translateVideoMetadata(geminiKeys, selectedVideo.title, selectedVideo.description, langs);
      setTranslations(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menerjemahkan.');
    } finally {
      setIsTranslating(false);
    }
  }, [selectedVideo, selectedLangs, geminiKeys]);

  const updateTranslation = useCallback((index: number, patch: Partial<TranslationResult>) => {
    setTranslations((prev) => (prev ? prev.map((t, i) => (i === index ? { ...t, ...patch } : t)) : prev));
  }, []);

  const handleSelectVideo = useCallback(
    async (video: EditableVideo) => {
      setSelectedId(video.videoId);
      setTranslations(null);
      setError(null);
      setSuccess(null);
      // Peek at whether defaultLanguage is already set — if not, we'll require the user
      // to choose one before committing (YouTube errors otherwise).
      setNeedsDefaultLang(!video.defaultLanguage);
      if (video.defaultLanguage) setDefaultLang(video.defaultLanguage);
    },
    []
  );

  const handleCommit = useCallback(async () => {
    if (!accessToken || !selectedVideo || !translations) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const map: Record<string, { title: string; description: string }> = {};
      for (const t of translations) {
        map[t.languageCode] = { title: t.title, description: t.description };
      }
      // Resolve the base default language: use the video's if present, else the chosen one.
      const base = selectedVideo.defaultLanguage || defaultLang;
      await updateVideoLocalizations(selectedVideo.videoId, base, map, accessToken);
      recordUnits(QUOTA_COST.videosUpdate);
      setSuccess(
        `${translations.length} bahasa disimpan ke video (bahasa default: ${base}). Cek di YouTube Studio → tab terjemahan.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan terjemahan.');
    } finally {
      setIsSaving(false);
    }
  }, [accessToken, selectedVideo, translations, defaultLang, recordUnits]);

  if (videos.length === 0) {
    return (
      <Card padding="none">
        <EmptyState icon={ListVideo} tone="primary" title="Muat katalog dulu" description="Sambungkan akun & muat katalog untuk memilih video yang mau diterjemahkan." />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">
      {/* Video picker */}
      <Card padding="none" className="overflow-hidden lg:sticky lg:top-6">
        <div className="px-4 py-3 border-b border-border bg-surface-raised/60">
          <h3 className="text-sm font-semibold">Pilih Video</h3>
        </div>
        <div className="max-h-[520px] overflow-y-auto custom-scrollbar p-2 space-y-1">
          {videos.map((v) => (
            <button
              key={v.videoId}
              onClick={() => handleSelectVideo(v)}
              className={`w-full text-left rounded-lg p-2 flex gap-2.5 items-center transition-colors ${selectedId === v.videoId ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-surface-hover'}`}
            >
              <div className="w-16 aspect-video shrink-0 rounded-md overflow-hidden bg-surface-raised">
                {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium line-clamp-2 leading-snug">{v.title}</p>
                {v.defaultLanguage && <p className="text-[10px] text-text-faint mt-0.5">bahasa: {v.defaultLanguage}</p>}
              </div>
            </button>
          ))}
        </div>
      </Card>

      <div className="min-w-0 space-y-4">
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 flex items-start gap-2.5 text-sm text-danger">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-success/30 bg-success-bg px-4 py-3 flex items-start gap-2.5 text-sm text-success">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /><span>{success}</span>
          </div>
        )}

        {!selectedVideo ? (
          <Card padding="none">
            <EmptyState icon={Languages} tone="primary" title="Pilih video untuk diterjemahkan" description="Judul & deskripsi akan diterjemahkan ke bahasa pilihan lalu bisa langsung disimpan ke YouTube." />
          </Card>
        ) : (
          <>
            <Card padding="md" className="space-y-3">
              <p className="text-sm font-semibold line-clamp-1">{selectedVideo.title}</p>

              {needsDefaultLang && (
                <div className="rounded-lg border border-warning/30 bg-warning-bg px-3 py-2.5 space-y-2">
                  <p className="text-xs text-text-muted flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px text-warning" />
                    Video ini belum punya bahasa default. YouTube butuh itu di-set sebelum terjemahan
                    bisa disimpan. Pilih bahasa asli judul/deskripsi:
                  </p>
                  <div className="flex gap-2">
                    {DEFAULT_LANGUAGE_OPTIONS.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => setDefaultLang(l.code)}
                        className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${defaultLang === l.code ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-muted hover:bg-surface-hover'}`}
                      >
                        {l.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs text-text-faint flex items-center gap-1.5 flex-wrap">
                    <Globe className="w-3.5 h-3.5 shrink-0" /> Pilih bahasa target
                    <span className="text-text-faint/70">
                      ({TARGET_LANGUAGES.length} bahasa, negara CPM tinggi di atas)
                    </span>
                  </p>
                  <button
                    onClick={() => setSelectedLangs(new Set(LANGUAGES_BY_TIER[0].langs.map((l) => l.code)))}
                    className="text-[11px] text-primary hover:underline shrink-0 font-medium"
                  >
                    Pilih semua Tier S
                  </button>
                </div>
                <div className="space-y-2.5">
                  {LANGUAGES_BY_TIER.map(({ tier, langs }) => (
                    <div key={tier}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TIER_BADGE[tier]}`}>
                          {TIER_META[tier].label}
                        </span>
                        <span className="text-[10px] text-text-faint">{TIER_META[tier].hint}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {langs.map((l) => {
                          const picked = selectedLangs.has(l.code);
                          return (
                            <button
                              key={l.code}
                              onClick={() => toggleLang(l.code)}
                              title={l.markets}
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${picked ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-muted hover:bg-surface-hover'}`}
                            >
                              {picked && <Check className="w-3 h-3" />}
                              {l.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-text-faint mt-2">
                  Tips: English wajib (membuka 7 pasar termahal). CPM itu harga kotor pengiklan, BUKAN penghasilanmu —
                  YouTube sendiri menegaskan revenue-mu tidak sama dengan CPM x views. Pakai tier ini sebagai urutan
                  prioritas, bukan kalkulator uang. Arahkan kursor ke bahasa untuk lihat negaranya.
                </p>
              </div>

              <Button
                icon={<Sparkles className="w-4 h-4" />}
                loading={isTranslating}
                disabled={selectedLangs.size === 0 || isTranslating}
                onClick={handleTranslate}
              >
                Terjemahkan ({selectedLangs.size} bahasa)
              </Button>
            </Card>

            {isTranslating && <Loader label="Gemini menerjemahkan..." size="sm" />}

            {translations && translations.length > 0 && (
              <Card padding="md" className="space-y-4">
                <div className="flex items-center gap-2">
                  <Languages className="w-4 h-4 text-primary" strokeWidth={2} />
                  <h3 className="text-sm font-semibold">Pratinjau Terjemahan (bisa diedit)</h3>
                </div>
                <div className="space-y-4">
                  {translations.map((t, i) => (
                    <div key={t.languageCode} className="rounded-lg border border-border p-3 space-y-2">
                      <p className="text-xs font-mono text-primary uppercase">{t.languageCode}</p>
                      <input
                        value={t.title}
                        onChange={(e) => updateTranslation(i, { title: e.target.value })}
                        className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-primary"
                      />
                      <textarea
                        value={t.description}
                        onChange={(e) => updateTranslation(i, { description: e.target.value })}
                        rows={3}
                        className="w-full resize-none rounded-md border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-primary"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    icon={<Check className="w-4 h-4" />}
                    loading={isSaving}
                    disabled={isSaving || remainingUnitsToday < QUOTA_COST.videosUpdate}
                    onClick={handleCommit}
                  >
                    Simpan ke YouTube (50 unit)
                  </Button>
                  <span className="text-[11px] text-text-faint">
                    Terjemahan lama untuk bahasa lain tetap aman (read-merge-write).
                  </span>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};
