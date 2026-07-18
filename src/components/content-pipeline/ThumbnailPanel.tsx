import React, { useState, useCallback } from 'react';
import { Image, AlertCircle, Sparkles, Info } from 'lucide-react';
import {
  generateThumbnailConcept,
  generateThumbnailImage,
  isQuotaError,
  type ThumbnailConcept,
} from '@/services/geminiService';
import { buildThumbnailPrompt } from '@/services/thumbnailPrompt';
import { processThumbnail, type ProcessedThumbnail } from '@/services/thumbnailService';
import type { MetadataResult } from './MetadataPanel';
import { WhyToggle, CopyButton, MarketSelect } from '@/components/ai-studio/GeneratorBits';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { Loader } from '@/components/shared/Loader';
import { EmptyState } from '@/components/shared/ui/EmptyState';
import { HelpPanel } from '@/components/shared/ui/HelpPanel';

export interface ThumbnailStageResult {
  concept: ThumbnailConcept;
  imagePrompt: string;
  processed: ProcessedThumbnail | null;
}

interface Props {
  geminiKeys: string[];
  topic: string;
  metadata: MetadataResult | null;
  thumbnail: ThumbnailStageResult | null;
  onThumbnailGenerated: (t: ThumbnailStageResult) => void;
}

export const ThumbnailPanel: React.FC<Props> = ({ geminiKeys, topic, metadata, thumbnail, onThumbnailGenerated }) => {
  const [market, setMarket] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conceptOnly, setConceptOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!metadata) return;
    setBusy(true);
    setError(null);
    setConceptOnly(false);
    let concept: ThumbnailConcept;
    try {
      concept = await generateThumbnailConcept(geminiKeys, {
        title: metadata.title,
        niche: topic,
        market,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat konsep thumbnail.');
      setBusy(false);
      return;
    }
    // Assembled locally (not just restated by the concept call) so the dual-theme physics —
    // mid-tone background, contained subject, margin clearance — are guaranteed every time.
    const imagePrompt = buildThumbnailPrompt({ ...concept, market });
    try {
      const raw = await generateThumbnailImage(geminiKeys, imagePrompt);
      const processed = await processThumbnail(raw);
      onThumbnailGenerated({ concept, imagePrompt, processed });
    } catch (e) {
      // Free-tier Gemini keys have 0 image quota — expected, not an error. Keep the concept +
      // prompt (already paid for) so Kharis can paste it into any image tool himself.
      if (isQuotaError(e)) {
        setConceptOnly(true);
        onThumbnailGenerated({ concept, imagePrompt, processed: null });
      } else {
        setError(e instanceof Error ? e.message : 'Gagal menggambar thumbnail.');
      }
    } finally {
      setBusy(false);
    }
  }, [metadata, geminiKeys, topic, market, onThumbnailGenerated]);

  if (!metadata) {
    return (
      <EmptyState
        icon={Image}
        title="Belum ada metadata untuk dibuatkan thumbnail"
        description='Selesaikan tab "Metadata SEO" dulu — konsep thumbnail dibangun mengikuti judul yang sudah dipilih di sana.'
        tone="primary"
      />
    );
  }

  return (
    <div className="max-w-4xl space-y-5 animate-fade-in">
      <HelpPanel>
        <p>
          <strong>Konsep Thumbnail</strong> dirancang dari judul yang sudah dipilih. Prompt gambarnya
          dijamin aman dual-tema (latar mid-tone, subjek terkontain, margin bersih) — bagian fisik
          ini dikunci oleh app, bukan cuma diserahkan ke AI. Generate gambar butuh Gemini key dengan
          billing aktif (free tier = 0 kuota gambar); kalau tidak ada, kamu tetap dapat prompt-nya
          untuk dipakai di tool manapun.
        </p>
      </HelpPanel>

      <Card padding="md" className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Judul acuan</p>
        <p className="text-sm text-text">{metadata.title}</p>
      </Card>

      <Card padding="md" className="space-y-3">
        <MarketSelect value={market} onChange={setMarket} />
        <Button icon={<Sparkles className="w-4 h-4" />} loading={busy} disabled={busy || geminiKeys.length === 0} onClick={handleGenerate}>
          {thumbnail ? 'Buat Ulang Konsep' : 'Buat Konsep Thumbnail'}
        </Button>
      </Card>

      {geminiKeys.length === 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-text-muted">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
          <span>Tambahkan Gemini API key dulu di modul AI Studio.</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger animate-slide-up">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {busy && <Loader label="Merancang konsep & menggambar thumbnail..." />}

      {thumbnail && !busy && (
        <Card padding="md" className="space-y-3 animate-slide-up">
          {thumbnail.processed ? (
            <img
              src={thumbnail.processed.dataUrl}
              alt="Konsep thumbnail"
              className="w-full aspect-video rounded-lg object-cover border border-border"
            />
          ) : (
            conceptOnly && (
              <div className="flex items-start gap-2.5 rounded-lg border border-info/30 bg-info-bg px-4 py-3 text-xs text-text-muted">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-info" />
                <span>
                  Gambar tidak bisa digenerate (biasanya karena Gemini key belum billing aktif —
                  free tier = 0 kuota gambar). Konsep & prompt-nya tetap tersedia di bawah, siap
                  dipakai di tool gambar manapun.
                </span>
              </div>
            )
          )}

          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Prompt Gambar</p>
            <CopyButton text={thumbnail.imagePrompt} />
          </div>
          <p className="text-xs text-text-muted whitespace-pre-wrap leading-relaxed font-mono">
            {thumbnail.imagePrompt}
          </p>

          <WhyToggle label="Kenapa konsep ini dipilih">
            <p>{thumbnail.concept.why}</p>
          </WhyToggle>
        </Card>
      )}
    </div>
  );
};
