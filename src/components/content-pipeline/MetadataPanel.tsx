import React, { useState, useCallback } from 'react';
import { Tag, AlertCircle, Sparkles, Check, FileText, Type } from 'lucide-react';
import type { NarrativeResult } from '@/services/geminiService';
import { generateTitles, generateDescription, generateTags, type TitleIdea } from '@/services/geminiService';
import { WhyToggle, CopyButton, MarketSelect } from '@/components/ai-studio/GeneratorBits';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { Loader } from '@/components/shared/Loader';
import { EmptyState } from '@/components/shared/ui/EmptyState';
import { HelpPanel } from '@/components/shared/ui/HelpPanel';

export interface MetadataResult {
  title: string;
  description: string;
  why: string;
  tags: string[];
}

interface Props {
  geminiKeys: string[];
  topic: string;
  narrative: NarrativeResult | null;
  metadata: MetadataResult | null;
  onMetadataGenerated: (m: MetadataResult) => void;
}

/** Combines the seed topic with a narrative excerpt so title/description/tags are grounded in
 * what the video ACTUALLY says, not just the original seed phrase. generateTitles/generateDescription/
 * generateTags all just interpolate this into their prompt as free text — no signature change
 * needed, so their other callers (GeneratorPanel, PackageGenerator) are untouched. */
function buildEffectiveTopic(topic: string, narrative: string): string {
  const excerpt = narrative.trim().slice(0, 600);
  return `${topic}\n\nKonteks isi video (kutipan narasi):\n${excerpt}${narrative.length > 600 ? '...' : ''}`;
}

export const MetadataPanel: React.FC<Props> = ({ geminiKeys, topic, narrative, metadata, onMetadataGenerated }) => {
  const [market, setMarket] = useState<string | null>(null);
  const [titles, setTitles] = useState<TitleIdea[] | null>(null);
  const [chosenTitle, setChosenTitle] = useState<string | null>(metadata?.title ?? null);
  const [busyTitles, setBusyTitles] = useState(false);
  const [busyRest, setBusyRest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTitles = useCallback(async () => {
    if (!narrative) return;
    setBusyTitles(true);
    setError(null);
    setTitles(null);
    setChosenTitle(null);
    try {
      const effectiveTopic = buildEffectiveTopic(topic, narrative.narrative);
      setTitles(await generateTitles(geminiKeys, effectiveTopic, { market }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat judul.');
    } finally {
      setBusyTitles(false);
    }
  }, [narrative, topic, market, geminiKeys]);

  const chooseTitle = useCallback(
    async (t: TitleIdea) => {
      if (!narrative) return;
      setChosenTitle(t.title);
      setBusyRest(true);
      setError(null);
      try {
        const effectiveTopic = buildEffectiveTopic(topic, narrative.narrative);
        const [desc, tags] = await Promise.all([
          generateDescription(geminiKeys, effectiveTopic, { market, chosenTitle: t.title }),
          generateTags(geminiKeys, effectiveTopic, { market }),
        ]);
        onMetadataGenerated({ title: t.title, description: desc.description, why: desc.why, tags });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal membuat deskripsi/tag.');
      } finally {
        setBusyRest(false);
      }
    },
    [narrative, topic, market, geminiKeys, onMetadataGenerated]
  );

  if (!narrative) {
    return (
      <EmptyState
        icon={Tag}
        title="Belum ada narasi untuk dibuatkan metadata"
        description='Selesaikan tab "Narasi" dulu, baru kembali ke sini — judul & deskripsi dibangun dari isi narasinya, bukan sekadar topik mentah.'
        tone="primary"
      />
    );
  }

  return (
    <div className="max-w-4xl space-y-5 animate-fade-in">
      <HelpPanel>
        <p>
          <strong>Metadata SEO</strong> dibangun dari narasi (bukan cuma topik) — judul dan deskripsi
          satu paket: pilih judul dulu, deskripsi ditulis mengikuti persis janji judul itu. Tag
          sengaja dibuat pendek (5&ndash;8) — YouTube sendiri bilang tag berperan minim, jadi tidak
          perlu dipanjang-panjangkan.
        </p>
      </HelpPanel>

      <Card padding="md" className="space-y-3">
        <MarketSelect value={market} onChange={setMarket} />
        <Button icon={<Sparkles className="w-4 h-4" />} loading={busyTitles} disabled={busyTitles || geminiKeys.length === 0} onClick={runTitles}>
          {titles ? 'Buat Ulang Judul' : 'Langkah 1 — Buat Judul'}
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

      {busyTitles && <Loader label="Menyusun judul dari narasi..." size="sm" />}

      {titles && titles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Type className="w-4 h-4 text-primary" strokeWidth={2} />
            <p className="text-xs font-medium text-text">Langkah 2 — pilih judul, deskripsi & tag menyusul otomatis</p>
          </div>
          {titles.map((t, i) => {
            const picked = chosenTitle === t.title;
            return (
              <Card key={i} padding="sm" className={`flex items-start gap-3 ${picked ? 'ring-1 ring-primary/40 bg-primary/5' : ''}`} interactive>
                <button onClick={() => chooseTitle(t)} className="min-w-0 flex-1 text-left" disabled={busyRest}>
                  <p className="text-sm font-medium flex items-start gap-1.5">
                    {picked && <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />}
                    <span>{t.title}</span>
                  </p>
                  <WhyToggle>
                    <p><span className="font-medium text-text">Teknik:</span> {t.technique}</p>
                    <p>{t.reason}</p>
                  </WhyToggle>
                </button>
                <CopyButton text={t.title} />
              </Card>
            );
          })}
        </div>
      )}

      {busyRest && <Loader label="Menulis deskripsi & tag yang nyambung dengan judul terpilih..." size="sm" />}

      {metadata && chosenTitle && metadata.title === chosenTitle && !busyRest && (
        <Card padding="md" className="space-y-3 animate-slide-up">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" strokeWidth={2} />
            <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Paket Metadata</p>
          </div>

          <div className="rounded-lg border border-border bg-surface-raised/60 p-2.5 flex items-start gap-2">
            <p className="text-sm font-medium flex-1 min-w-0">{metadata.title}</p>
            <CopyButton text={metadata.title} />
          </div>

          <div className="flex items-start gap-2">
            <p className="text-sm text-text-muted whitespace-pre-wrap leading-relaxed flex-1 min-w-0">{metadata.description}</p>
            <CopyButton text={metadata.description} />
          </div>
          <WhyToggle label="Kenapa deskripsi disusun begini">
            <p>{metadata.why}</p>
          </WhyToggle>

          <div className="pt-1 space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-faint">Tag ({metadata.tags.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {metadata.tags.map((tg) => (
                <span key={tg} className="rounded-full border border-border px-2.5 py-1 text-xs text-text-muted">
                  {tg}
                </span>
              ))}
              <CopyButton text={metadata.tags.join(', ')} />
            </div>
          </div>

          <div className="pt-1">
            <CopyButton text={`${metadata.title}\n\n${metadata.description}\n\nTags: ${metadata.tags.join(', ')}`} />
            <span className="text-[11px] text-text-faint ml-1 align-middle">salin semua sekaligus</span>
          </div>
        </Card>
      )}
    </div>
  );
};
