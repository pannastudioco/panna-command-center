import React, { useState, useMemo } from 'react';
import { Tag as TagIcon, Copy, Check, AlertCircle, ChevronDown, PlayCircle, Target } from 'lucide-react';
import type { TagSuggestion, CompetitorVideoSample } from '@/types';
import { Card } from '@/components/shared/ui/Card';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { ScoreRing } from '@/components/shared/ui/ScoreRing';
import { computeKeywordOpportunity } from '@/services/keywordScoreService';

interface Props {
  tagSuggestions: TagSuggestion[];
  competitorSample: CompetitorVideoSample[];
  /** Demand heuristic (0-100) of the analysed term — enables the opportunity score. */
  demandScore?: number;
}

export const TagBuilder: React.FC<Props> = ({ tagSuggestions, competitorSample, demandScore }) => {
  const [pickedTags, setPickedTags] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const opportunity = useMemo(
    () =>
      demandScore !== undefined && competitorSample.length > 0
        ? computeKeywordOpportunity(demandScore, competitorSample)
        : null,
    [demandScore, competitorSample]
  );

  if (tagSuggestions.length === 0 && competitorSample.length === 0) return null;

  const toggleTag = (tag: string) => {
    setPickedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const copyTags = async () => {
    try {
      await navigator.clipboard.writeText(pickedTags.join(', '));
      setCopyError(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by browser permissions policy — fail visibly
      // instead of leaving the user thinking the copy succeeded when nothing happened.
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
    }
  };

  return (
    <div className="space-y-4">
      {opportunity && (
        <Card padding="md" className="flex items-center gap-4 animate-slide-up" glow="primary" interactive>
          <ScoreRing score={opportunity.score} size={64} label="peluang" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" strokeWidth={2} />
              <h3 className="text-sm font-semibold">Skor Peluang Kata Kunci</h3>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Demand{' '}
              <span className="font-mono tabular-nums text-text">{opportunity.demandComponent}</span> vs
              kompetisi{' '}
              <span className="font-mono tabular-nums text-text">{opportunity.competitionStrength}</span>{' '}
              (rata-rata{' '}
              <span className="font-mono tabular-nums">
                {opportunity.avgCompetitorViews.toLocaleString('id-ID')}
              </span>{' '}
              views di {opportunity.sampleSize} video teratas).
            </p>
            <p className="text-[11px] text-text-faint mt-1">
              Rumus transparan: 60% demand + 40% ruang-untuk-ranking. Heuristik, bukan search volume asli.
            </p>
          </div>
        </Card>
      )}

      <Card padding="none" className="overflow-hidden animate-slide-up">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-text flex items-center gap-2">
            <TagIcon className="w-4 h-4 text-primary" strokeWidth={1.75} />
            Tag dari Video Kompetitor Teratas
          </h3>
          <Badge tone="primary" dot className="tabular-nums">
            {competitorSample.length} video dianalisis
          </Badge>
        </div>

      {tagSuggestions.length > 0 && (
        <div className="p-4 flex flex-wrap gap-2">
          {tagSuggestions.map((t, i) => {
            const picked = pickedTags.includes(t.tag);
            return (
              <button
                key={t.tag}
                onClick={() => toggleTag(t.tag)}
                aria-pressed={picked}
                style={{ animationDelay: `${Math.min(i, 24) * 25}ms` }}
                className={`animate-pop inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5 border transition-all duration-200 ease-standard active:scale-[0.95] ${
                  picked
                    ? 'bg-primary text-on-primary border-primary shadow-glow'
                    : 'border-border text-text-muted hover:border-primary/40 hover:text-text hover:shadow-xs'
                }`}
                title={`Dipakai ${t.usedByCount} dari ${competitorSample.length} video`}
              >
                {picked && <Check className="w-3 h-3" strokeWidth={2.5} />}
                {t.tag}
                <span className={`tabular-nums ${picked ? 'opacity-80' : 'opacity-60'}`}>({t.usedByCount})</span>
              </button>
            );
          })}
        </div>
      )}

      {pickedTags.length > 0 && (
        <div className="px-4 pb-4 flex flex-wrap items-center gap-3 animate-slide-up">
          <Button
            onClick={copyTags}
            variant="primary"
            size="sm"
            icon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          >
            {copied ? (
              'Tersalin!'
            ) : (
              <>
                Salin <span className="tabular-nums">{pickedTags.length}</span> tag terpilih
              </>
            )}
          </Button>
          {copyError && (
            <span className="inline-flex items-center gap-1.5 text-xs text-danger animate-slide-up">
              <AlertCircle className="w-3.5 h-3.5" />
              Gagal menyalin — coba pilih &amp; salin manual.
            </span>
          )}
        </div>
      )}

      {competitorSample.length > 0 && (
        <details className="group border-t border-border">
          <summary className="list-none [&::-webkit-details-marker]:hidden px-4 py-2.5 text-xs text-text-faint cursor-pointer hover:text-text-muted hover:bg-surface-hover transition-all duration-200 ease-standard flex items-center gap-1.5 select-none">
            <ChevronDown className="w-3.5 h-3.5 transition-transform duration-200 ease-standard group-open:rotate-180" />
            Lihat video sampel yang dianalisis
            <span className="ml-auto font-mono tabular-nums text-text-faint">{competitorSample.length}</span>
          </summary>
          <div className="px-4 pb-3 space-y-1.5">
            {competitorSample.map((v, i) => (
              <div
                key={v.videoId}
                className="flex items-center gap-2 text-xs text-text-muted rounded-md px-1.5 py-1 -mx-1.5 transition-colors duration-200 ease-standard hover:bg-surface-hover animate-fade-in"
                style={{ animationDelay: `${Math.min(i, 20) * 20}ms` }}
              >
                <PlayCircle className="w-3.5 h-3.5 text-text-faint shrink-0" />
                <span className="truncate flex-1">{v.title}</span>
                <span className="shrink-0 text-text-faint font-mono tabular-nums">
                  {v.viewCount.toLocaleString()} views
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
      </Card>
    </div>
  );
};
