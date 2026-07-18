import React, { useState, useCallback } from 'react';
import { LOCALIZATION_MARKETS } from '@/constants/languages';
import { Copy, Check, ChevronDown, Globe2 } from 'lucide-react';

/** Clean output by default; the proven technique behind each result is one click away. */
export const WhyToggle: React.FC<{ label?: string; children: React.ReactNode }> = ({
  label = 'Kenapa ini bekerja',
  children,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary/80 hover:text-primary transition-colors"
      >
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        {label}
      </button>
      {open && (
        <div className="mt-1 border-l-2 border-primary/40 pl-2 text-[11px] text-text-muted space-y-0.5 animate-slide-up">
          {children}
        </div>
      )}
    </div>
  );
};

export const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied — no-op, user can select manually */
    }
  }, [text]);
  return (
    <button
      onClick={copy}
      aria-label="Salin"
      className="shrink-0 rounded-md p-1.5 text-text-faint hover:bg-surface-hover hover:text-primary transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

/**
 * Global Localization selector. Picking a market makes the AI write natively for it —
 * local keyword idioms, capitalisation, number/punctuation conventions and cultural framing —
 * instead of machine-translating an English structure. Markets are ordered by creator RPM.
 */
export const MarketSelect: React.FC<{ value: string | null; onChange: (v: string | null) => void }> = ({
  value,
  onChange,
}) => (
  <div>
    <label className="text-xs text-text-faint flex items-center gap-1.5 mb-1.5">
      <Globe2 className="w-3.5 h-3.5" /> Target market (Global Localization)
    </label>
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
    >
      {LOCALIZATION_MARKETS.map((m) => (
        <option key={m.code ?? 'global'} value={m.code ?? ''}>
          {m.label}
        </option>
      ))}
    </select>
    <p className="text-[11px] text-text-faint mt-1">
      Ditulis natif ala kreator lokal (idiom, kapitalisasi, angka, gaya budaya), bukan terjemahan mentah.
    </p>
  </div>
);
