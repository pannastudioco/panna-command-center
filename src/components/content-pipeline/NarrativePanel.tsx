import React, { useState, useCallback } from 'react';
import { ScrollText, AlertCircle, Sparkles, Clock, Type, ChevronDown } from 'lucide-react';
import type { ResearchResult } from '@/services/contentResearchService';
import { generateNarrative, type NarrativeResult } from '@/services/geminiService';
import { WhyToggle, CopyButton, MarketSelect } from '@/components/ai-studio/GeneratorBits';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { Loader } from '@/components/shared/Loader';
import { EmptyState } from '@/components/shared/ui/EmptyState';
import { HelpPanel } from '@/components/shared/ui/HelpPanel';

interface Props {
  geminiKeys: string[];
  topic: string;
  research: ResearchResult | null;
  narrative: NarrativeResult | null;
  onNarrativeGenerated: (n: NarrativeResult) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `~${m} menit ${s > 0 ? `${s} detik` : ''}`.trim() : `~${s} detik`;
}

export const NarrativePanel: React.FC<Props> = ({ geminiKeys, topic, research, narrative, onNarrativeGenerated }) => {
  const [angle, setAngle] = useState('');
  const [market, setMarket] = useState<string | null>(null);
  const [editedText, setEditedText] = useState(narrative?.narrative ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!research) return;
    setIsLoading(true);
    setError(null);
    try {
      const n = await generateNarrative(geminiKeys, topic, research.briefing, {
        market,
        angle: angle.trim() || null,
      });
      onNarrativeGenerated(n);
      setEditedText(n.narrative);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat narasi.');
    } finally {
      setIsLoading(false);
    }
  }, [research, geminiKeys, topic, market, angle, onNarrativeGenerated]);

  if (!research) {
    return (
      <EmptyState
        icon={ScrollText}
        title="Belum ada riset untuk dinarasikan"
        description='Buka tab "Riset & Verifikasi" dulu, cari topik, baru kembali ke sini.'
        tone="primary"
      />
    );
  }

  const wordCount = editedText.trim() ? editedText.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="max-w-4xl space-y-5 animate-fade-in">
      <HelpPanel>
        <p>
          <strong>Narasi</strong> ditulis ORIGINAL dari briefing riset (bukan disalin) — dioptimalkan
          untuk dibaca lantang sebagai voice-over: kalimat pendek, ritme bicara alami, struktur
          hook → isi → penutup. Klaim yang di briefing masih ditandai &ldquo;belum
          terverifikasi&rdquo; otomatis dilunakkan atau dihilangkan di sini, tidak disajikan sebagai
          fakta pasti.
        </p>
      </HelpPanel>

      <Card padding="md" className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Topik</p>
        <p className="text-sm text-text">{topic}</p>
        <details className="group pt-1">
          <summary className="list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-1 text-xs text-primary/80 hover:text-primary cursor-pointer">
            <ChevronDown className="w-3.5 h-3.5 transition-transform duration-200 group-open:rotate-180" />
            Lihat briefing riset yang jadi acuan
          </summary>
          <p className="text-xs text-text-muted whitespace-pre-wrap leading-relaxed mt-2 pl-4 border-l-2 border-border">
            {research.briefing}
          </p>
        </details>
      </Card>

      <Card padding="md" className="space-y-3">
        <div>
          <label className="text-xs text-text-faint">Sudut pandang/angle (opsional)</label>
          <input
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            placeholder="Kosongkan buat biarkan AI pilih, atau tempel salah satu angle dari briefing"
            className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <MarketSelect value={market} onChange={setMarket} />
        <Button
          icon={<Sparkles className="w-4 h-4" />}
          loading={isLoading}
          disabled={isLoading || geminiKeys.length === 0}
          onClick={handleGenerate}
        >
          {isLoading ? 'Menulis narasi...' : narrative ? 'Buat Ulang Narasi' : 'Buat Narasi'}
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

      {isLoading && <Loader label="Menulis narasi dari briefing riset..." />}

      {narrative && !isLoading && (
        <Card padding="md" className="space-y-3 animate-slide-up">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs font-medium uppercase tracking-wide text-text-faint">
              Narasi (bisa diedit)
            </p>
            <div className="flex items-center gap-3 text-[11px] text-text-faint">
              <span className="inline-flex items-center gap-1">
                <Type className="w-3 h-3" /> {wordCount} kata
              </span>
              <span className="inline-flex items-center gap-1" title="Estimasi kasar, ~150 kata/menit — bukan durasi pasti">
                <Clock className="w-3 h-3" /> {formatDuration(Math.round((wordCount / 150) * 60))} (estimasi)
              </span>
              <CopyButton text={editedText} />
            </div>
          </div>
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            rows={14}
            className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <WhyToggle label="Kenapa disusun begini">
            <p>{narrative.structureNotes}</p>
          </WhyToggle>
        </Card>
      )}
    </div>
  );
};
