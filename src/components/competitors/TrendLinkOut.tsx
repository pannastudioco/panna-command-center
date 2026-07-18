import React, { useState } from 'react';
import { TrendingUp, ExternalLink } from 'lucide-react';
import { Card } from '@/components/shared/ui/Card';

/**
 * Fase 4b, per the approved plan: no stable trend API exists (Google Trends has no
 * public API; the unofficial scraping route would double the ToS grey-zone exposure
 * this app already carries for keyword harvesting in Fase 1). Default, zero-risk
 * option — link out to Google Trends directly rather than scrape it. Only worth
 * upgrading to a scraped/proxied version later if this genuinely isn't enough.
 */
export const TrendLinkOut: React.FC = () => {
  const [term, setTerm] = useState('');

  const trendsUrl = term.trim()
    ? `https://trends.google.com/trends/explore?q=${encodeURIComponent(term.trim())}&geo=ID`
    : 'https://trends.google.com/trends/explore?geo=ID';

  return (
    <Card padding="sm" className="animate-fade-in">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
          <TrendingUp className="w-4 h-4 text-accent" strokeWidth={2} />
        </div>
        <h3 className="text-sm font-semibold text-text">Cek Tren Kata Kunci</h3>
      </div>
      <p className="text-xs text-text-faint mb-3.5">
        Tidak ada API resmi buat data tren kata kunci — daripada scraping tidak resmi (nambah risiko
        ToS di atas yang sudah dipakai fitur riset kata kunci), link ini langsung buka Google Trends
        asli di tab baru.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="sleep music, focus music, dll"
          aria-label="Kata kunci untuk dicek di Google Trends"
          className="flex-1 rounded-md border border-border bg-bg px-3.5 py-2.5 text-sm text-text placeholder:text-text-faint outline-none transition-all duration-150 ease-standard focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <a
          href={trendsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary text-on-primary text-sm font-medium px-4 py-2.5 shadow-sm transition-all duration-150 ease-standard hover:bg-primary-hover hover:shadow-glow active:scale-[0.97] whitespace-nowrap"
        >
          Buka Google Trends
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </Card>
  );
};
