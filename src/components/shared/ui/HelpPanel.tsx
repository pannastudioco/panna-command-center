import React, { useState } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';

interface Props {
  title?: string;
  /** Collapsed by default so it never clutters — one click reveals the explanation. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** A quiet, collapsible "what is this & how do I read it?" explainer. Every module gets
 * one so the app is self-explanatory without a separate manual — progressive disclosure,
 * so power users aren't slowed down but new users have plain-language help one click away. */
export const HelpPanel: React.FC<Props> = ({ title = 'Apa ini & cara membacanya?', defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-info/25 bg-info-bg/50 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-info-bg"
      >
        <HelpCircle className="w-4 h-4 shrink-0 text-info" strokeWidth={2} />
        <span className="text-xs font-medium text-text">{title}</span>
        <ChevronDown
          className={`w-4 h-4 ml-auto text-text-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 pt-0.5 text-xs leading-relaxed text-text-muted space-y-2 animate-slide-up [&_strong]:text-text [&_strong]:font-semibold">
          {children}
        </div>
      )}
    </div>
  );
};
