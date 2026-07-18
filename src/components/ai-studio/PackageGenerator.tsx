import React, { useState, useCallback } from 'react';
import {
  generateTitles,
  generateDescription,
  type TitleIdea,
  type DescriptionResult,
} from '@/services/geminiService';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { Loader } from '@/components/shared/Loader';
import { WhyToggle, CopyButton, MarketSelect } from './GeneratorBits';
import { Sparkles, AlertCircle, Check, FileText, Type, RotateCcw } from 'lucide-react';

interface Props {
  geminiKeys: string[];
}

/**
 * Packaging-first generator: title and description are ONE package, not two separate assets.
 * Enter the topic once → pick from title options → the description is then written to deliver
 * on THAT exact title's promise (reusing its keyword verbatim). This mirrors how top channels
 * actually work — decide the promise/packaging first, then write everything to serve it.
 */
export const PackageGenerator: React.FC<Props> = ({ geminiKeys }) => {
  const [topic, setTopic] = useState('');
  const [market, setMarket] = useState<string | null>(null);

  const [titles, setTitles] = useState<TitleIdea[] | null>(null);
  const [chosen, setChosen] = useState<TitleIdea | null>(null);
  const [description, setDescription] = useState<DescriptionResult | null>(null);

  const [busyTitles, setBusyTitles] = useState(false);
  const [busyDesc, setBusyDesc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTitles = useCallback(async () => {
    if (!topic.trim()) return;
    setBusyTitles(true);
    setError(null);
    setTitles(null);
    setChosen(null);
    setDescription(null);
    try {
      setTitles(await generateTitles(geminiKeys, topic.trim(), { market }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat judul.');
    } finally {
      setBusyTitles(false);
    }
  }, [topic, market, geminiKeys]);

  const chooseTitle = useCallback(
    async (t: TitleIdea) => {
      setChosen(t);
      setDescription(null);
      setBusyDesc(true);
      setError(null);
      try {
        // The chosen title is passed in so the description is built around its exact angle.
        setDescription(await generateDescription(geminiKeys, topic.trim(), { market, chosenTitle: t.title }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal membuat deskripsi.');
      } finally {
        setBusyDesc(false);
      }
    },
    [topic, market, geminiKeys]
  );

  const reset = useCallback(() => {
    setChosen(null);
    setDescription(null);
  }, []);

  return (
    <div className="max-w-3xl space-y-4">
      <Card padding="md" className="space-y-3">
        <div>
          <label className="text-xs text-text-faint">Topik video</label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            placeholder="Topik / poin utama video (mis. smooth jazz buat kerja di kedai kopi, 3 jam)..."
            className="mt-1.5 w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <MarketSelect value={market} onChange={setMarket} />
        <Button
          icon={<Sparkles className="w-4 h-4" />}
          loading={busyTitles}
          disabled={!topic.trim() || busyTitles}
          onClick={runTitles}
        >
          {titles ? 'Buat Ulang Judul' : 'Langkah 1 — Buat Judul'}
        </Button>
      </Card>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 flex items-start gap-2.5 text-sm text-danger">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {busyTitles && <Loader label="Gemini menyusun judul..." size="sm" />}

      {titles && titles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Type className="w-4 h-4 text-primary" strokeWidth={2} />
            <p className="text-xs font-medium text-text">
              Langkah 2 — pilih satu judul, deskripsi akan dibangun mengikutinya
            </p>
          </div>
          {titles.map((t, i) => {
            const picked = chosen?.title === t.title;
            return (
              <Card
                key={i}
                padding="sm"
                className={`flex items-start gap-3 ${picked ? 'ring-1 ring-primary/40 bg-primary/5' : ''}`}
                interactive
              >
                <button onClick={() => chooseTitle(t)} className="min-w-0 flex-1 text-left" disabled={busyDesc}>
                  <p className="text-sm font-medium flex items-start gap-1.5">
                    {picked && <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />}
                    <span>{t.title}</span>
                  </p>
                  <WhyToggle>
                    <p>
                      <span className="font-medium text-text">Teknik:</span> {t.technique}
                    </p>
                    <p>{t.reason}</p>
                  </WhyToggle>
                </button>
                <CopyButton text={t.title} />
              </Card>
            );
          })}
        </div>
      )}

      {busyDesc && <Loader label="Menulis deskripsi yang nyambung dengan judul terpilih..." size="sm" />}

      {chosen && description && (
        <Card padding="md" className="space-y-2.5 animate-slide-up">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" strokeWidth={2} />
            <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Paket siap pakai</p>
            <button
              onClick={reset}
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-text-faint hover:text-text transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> pilih judul lain
            </button>
          </div>

          <div className="rounded-lg border border-border bg-surface-raised/60 p-2.5">
            <div className="flex items-start gap-2">
              <p className="text-sm font-medium flex-1 min-w-0">{chosen.title}</p>
              <CopyButton text={chosen.title} />
            </div>
          </div>

          <div className="flex items-start gap-2">
            <p className="text-sm text-text-muted whitespace-pre-wrap leading-relaxed flex-1 min-w-0">
              {description.description}
            </p>
            <CopyButton text={description.description} />
          </div>

          <WhyToggle label="Kenapa disusun begini">
            <p>{description.why}</p>
          </WhyToggle>

          <div className="pt-1">
            <CopyButton text={`${chosen.title}\n\n${description.description}`} />
            <span className="text-[11px] text-text-faint ml-1 align-middle">salin judul + deskripsi sekaligus</span>
          </div>
        </Card>
      )}
    </div>
  );
};
