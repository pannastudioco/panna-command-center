import React, { useState } from 'react';
import { Target, ChevronDown } from 'lucide-react';

interface Props {
  title?: string;
  /** Collapsed by default (progressive disclosure), like HelpPanel — one click reveals it. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * A separate, deliberately more "premium" panel than HelpPanel. HelpPanel answers "what is
 * this & how do I read it?"; StrategyPanel answers "what do I actually DO, and show me a real
 * example I can copy". It lives on every module and every sub-tab so there's an executable,
 * niche-specific playbook one click away wherever the user is. Warm brand accent (not the
 * info-blue of HelpPanel) so the two are visually distinct at a glance.
 */
export const StrategyPanel: React.FC<Props> = ({
  title = 'Contoh nyata & strategi eksekusi',
  defaultOpen = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-primary/25 bg-gradient-to-br from-primary/[0.06] to-accent/[0.05] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-primary/10"
      >
        <Target className="w-4 h-4 shrink-0 text-primary" strokeWidth={2} />
        <span className="text-xs font-semibold text-text">{title}</span>
        <span className="text-[10px] text-primary/70 font-medium hidden sm:inline">contoh siap pakai</span>
        <ChevronDown
          className={`w-4 h-4 ml-auto text-text-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 pt-1 text-xs leading-relaxed text-text-muted space-y-3 animate-slide-up [&_strong]:text-text [&_strong]:font-semibold">
          {children}
        </div>
      )}
    </div>
  );
};

/** A labelled real-example block — makes concrete examples pop out from the explanation. */
export const Example: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="rounded-md border border-border bg-surface/70 p-2.5">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/80 mb-1.5">{label}</p>
    <div className="space-y-1.5 text-text-muted">{children}</div>
  </div>
);

/** A quoted, monospace-ish sample (a real title / tag / line the user can copy the pattern of). */
export const Sample: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="rounded bg-surface-raised border border-border px-2 py-1 text-[11px] text-text leading-snug">
    {children}
  </p>
);

/** The "why this works" note — the honest, evidence-based reason behind an example. */
export const Why: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] text-text-muted border-l-2 border-primary/40 pl-2 mt-1">
    <span className="font-medium text-text">Kenapa ini bekerja:</span> {children}
  </p>
);
