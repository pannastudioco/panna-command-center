import React, { useState, useCallback } from 'react';
import {
  generateTitles,
  generateDescription,
  generateContentIdeas,
  type TitleIdea,
  type ContentIdea,
  type DescriptionResult,
} from '@/services/geminiService';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { Loader } from '@/components/shared/Loader';
import { WhyToggle, CopyButton, MarketSelect } from './GeneratorBits';
import { Sparkles, AlertCircle, Lightbulb } from 'lucide-react';

type Kind = 'titles' | 'description' | 'ideas';

interface Props {
  kind: Kind;
  geminiKeys: string[];
}

const COPY: Record<Kind, { placeholder: string; label: string; button: string }> = {
  titles: { placeholder: 'Topik / deskripsi singkat video...', label: 'Topik video', button: 'Buat Judul' },
  description: { placeholder: 'Topik / poin utama video...', label: 'Topik video', button: 'Buat Deskripsi' },
  ideas: { placeholder: 'Niche channel (mis. lofi study beats)...', label: 'Niche channel', button: 'Buat Ide Konten' },
};

export const GeneratorPanel: React.FC<Props> = ({ kind, geminiKeys }) => {
  const [input, setInput] = useState('');
  const [market, setMarket] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titles, setTitles] = useState<TitleIdea[] | null>(null);
  const [description, setDescription] = useState<DescriptionResult | null>(null);
  const [ideas, setIdeas] = useState<ContentIdea[] | null>(null);

  const run = useCallback(async () => {
    if (!input.trim()) return;
    setBusy(true);
    setError(null);
    setTitles(null);
    setDescription(null);
    setIdeas(null);
    try {
      if (kind === 'titles') setTitles(await generateTitles(geminiKeys, input.trim(), { market }));
      else if (kind === 'description') setDescription(await generateDescription(geminiKeys, input.trim(), { market }));
      else setIdeas(await generateContentIdeas(geminiKeys, input.trim(), { market }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal generate.');
    } finally {
      setBusy(false);
    }
  }, [input, market, kind, geminiKeys]);

  return (
    <div className="max-w-3xl space-y-4">
      <Card padding="md" className="space-y-3">
        <div>
          <label className="text-xs text-text-faint">{COPY[kind].label}</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            placeholder={COPY[kind].placeholder}
            className="mt-1.5 w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <MarketSelect value={market} onChange={setMarket} />
        <Button icon={<Sparkles className="w-4 h-4" />} loading={busy} disabled={!input.trim() || busy} onClick={run}>
          {COPY[kind].button}
        </Button>
      </Card>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 flex items-start gap-2.5 text-sm text-danger">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}

      {busy && <Loader label="Gemini sedang berpikir..." size="sm" />}

      {titles && (
        <div className="space-y-2">
          {titles.map((t, i) => (
            <Card key={i} padding="sm" className="flex items-start gap-3" interactive>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                <WhyToggle>
                  <p><span className="font-medium text-text">Teknik:</span> {t.technique}</p>
                  <p>{t.reason}</p>
                </WhyToggle>
              </div>
              <CopyButton text={t.title} />
            </Card>
          ))}
        </div>
      )}

      {description && (
        <Card padding="md" className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Deskripsi</p>
            <CopyButton text={description.description} />
          </div>
          <p className="text-sm text-text-muted whitespace-pre-wrap leading-relaxed">{description.description}</p>
          <WhyToggle label="Kenapa disusun begini">
            <p>{description.why}</p>
          </WhyToggle>
        </Card>
      )}

      {ideas && (
        <div className="space-y-2">
          {ideas.map((idea, i) => (
            <Card key={i} padding="sm" className="flex items-start gap-3" interactive>
              <div className="w-8 h-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                <Lightbulb className="w-4 h-4 text-primary" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{idea.title}</p>
                <p className="text-xs text-text-muted mt-0.5"><span className="text-text-faint">Hook:</span> {idea.hook}</p>
                <WhyToggle>
                  <p><span className="font-medium text-text">Kerangka:</span> {idea.framework}</p>
                  <p>{idea.why}</p>
                </WhyToggle>
              </div>
              <CopyButton text={idea.title} />
            </Card>
          ))}
          <p className="text-[11px] text-text-faint px-1">
            Ide di atas AI-generated (kreatif), bukan data tren real-time.
          </p>
        </div>
      )}
    </div>
  );
};
