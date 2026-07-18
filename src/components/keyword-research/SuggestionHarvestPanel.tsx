import React from 'react';
import { Sparkles } from 'lucide-react';
import type { KeywordSuggestion } from '@/types';
import { Card } from '@/components/shared/ui/Card';

interface Props {
  suggestions: KeywordSuggestion[];
  selectedTerm: string | null;
  onSelect: (term: string) => void;
  disabled?: boolean;
}

export const SuggestionHarvestPanel: React.FC<Props> = ({ suggestions, selectedTerm, onSelect, disabled }) => {
  if (suggestions.length === 0) return null;

  return (
    <Card padding="none" className="overflow-hidden animate-slide-up">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" strokeWidth={1.75} />
          Suggestion dari Autocomplete YouTube
        </h3>
        <span className="shrink-0 text-xs text-text-faint font-mono tabular-nums">
          {suggestions.length} istilah
        </span>
      </div>
      <div className="max-h-80 overflow-y-auto custom-scrollbar divide-y divide-border">
        {suggestions.map((s, i) => {
          const isSelected = selectedTerm === s.term;
          return (
            <button
              key={s.term}
              onClick={() => onSelect(s.term)}
              disabled={disabled}
              aria-pressed={isSelected}
              style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}
              className={`relative w-full text-left pl-[13px] pr-4 py-3 border-l-[3px] flex items-center justify-between gap-3 transition-all duration-200 ease-standard disabled:opacity-40 disabled:cursor-not-allowed animate-fade-in ${
                isSelected
                  ? 'bg-primary/10 border-l-primary shadow-glow'
                  : 'border-l-transparent hover:bg-surface-hover active:scale-[0.99]'
              }`}
            >
              <span className={`text-sm truncate ${isSelected ? 'text-primary font-medium' : 'text-text'}`}>
                {s.term}
              </span>
              <span
                className="shrink-0 inline-flex items-center rounded-full bg-surface-raised px-2 py-0.5 text-xs text-text-faint font-mono tabular-nums"
                title="Estimasi demand (heuristik dari frekuensi & posisi suggestion) — bukan angka search volume asli"
              >
                ~{s.estimatedDemandScore}
              </span>
            </button>
          );
        })}
      </div>
      <p className="px-4 py-2.5 text-[11px] text-text-faint border-t border-border bg-surface-raised/50">
        Angka di kanan adalah estimasi demand (heuristik), bukan search volume asli — tidak ada API resmi
        yang menyediakan itu.
      </p>
    </Card>
  );
};
