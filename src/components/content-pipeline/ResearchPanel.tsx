import React, { useState, useCallback } from 'react';
import { Search, AlertCircle, FileSearch, ExternalLink, ShieldAlert } from 'lucide-react';
import { researchTopic, type ResearchResult } from '@/services/contentResearchService';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { Loader } from '@/components/shared/Loader';
import { EmptyState } from '@/components/shared/ui/EmptyState';
import { HelpPanel } from '@/components/shared/ui/HelpPanel';
import { StrategyPanel, Example, Why } from '@/components/shared/ui/StrategyPanel';

interface Props {
  geminiKeys: string[];
  /** Last topic researched in this pipeline session, if any — preserved across tab switches. */
  initialTopic?: string;
  /** Reports a successful research back up to ContentPipeline so later stages (Narasi, ...) can use it. */
  onResearched?: (topic: string, result: ResearchResult) => void;
}

export const ResearchPanel: React.FC<Props> = ({ geminiKeys, initialTopic = '', onResearched }) => {
  const [topic, setTopic] = useState(initialTopic);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResearch = useCallback(async () => {
    if (!topic.trim()) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await researchTopic(geminiKeys, topic.trim());
      setResult(r);
      onResearched?.(topic.trim(), r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal melakukan riset.');
    } finally {
      setIsLoading(false);
    }
  }, [topic, geminiKeys, onResearched]);

  return (
    <div className="max-w-4xl space-y-5 animate-fade-in">
      <HelpPanel>
        <p>
          <strong>Riset & Verifikasi Materi</strong> — masukkan topik, Gemini mencari LANGSUNG lewat
          Google Search (bukan dari ingatan lama) dan menyusun briefing: ringkasan, fakta kunci
          (ditandai kalau cuma klaim belum terverifikasi), beberapa sudut pandang konten, dan hal yang
          masih perlu dicek manual.
        </p>
        <p>
          <strong>Soal materi gambar/video:</strong> app ini <strong>tidak mengunduh apa pun secara
          otomatis</strong> dari Facebook/Instagram/TikTok — melanggar ToS platform tersebut dan
          berisiko hak cipta ke channel-mu sendiri kalau dipakai ulang. Yang disediakan: link
          pencarian resmi tiap platform yang siap diklik — kamu yang meninjau dan memilih materinya
          sendiri.
        </p>
      </HelpPanel>

      <StrategyPanel title="Cara pakai">
        <Example label="Alur singkat">
          <p>Ketik topik konkret (bukan cuma satu kata) → klik Riset → baca briefing & sumbernya →
          klik link pencarian gambar/video/sosial media yang relevan → pilih & unduh materi secara
          manual di tab baru → edit sendiri sebelum dipakai.</p>
          <Why>menjaga manusia tetap jadi penentu terakhir soal materi apa yang dipakai — bagian yang
          paling berisiko (hak cipta, akurasi) sengaja tidak diotomasi penuh.</Why>
        </Example>
      </StrategyPanel>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint pointer-events-none" />
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleResearch()}
            placeholder="mis. gelombang panas Jakarta Juli 2026"
            aria-label="Topik konten yang mau diriset"
            className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2.5 text-sm text-text placeholder:text-text-faint outline-none transition-all duration-200 ease-standard focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <Button
          onClick={handleResearch}
          disabled={isLoading || !topic.trim() || geminiKeys.length === 0}
          loading={isLoading}
          icon={<FileSearch className="w-4 h-4" />}
        >
          {isLoading ? 'Meriset...' : 'Riset & Verifikasi'}
        </Button>
      </div>

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

      {isLoading && <Loader label="Gemini mencari & memverifikasi lewat Google Search..." />}

      {!isLoading && !result && !error && (
        <EmptyState
          icon={FileSearch}
          title="Belum ada riset"
          description="Ketik topik lalu klik Riset & Verifikasi untuk mulai."
          tone="primary"
        />
      )}

      {result && (
        <div className="space-y-4 animate-slide-up">
          <Card padding="md" className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Briefing</p>
            <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">{result.briefing}</p>
          </Card>

          {result.sources.length > 0 && (
            <Card padding="md" className="space-y-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-text-faint">
                Sumber Nyata (dari hasil pencarian Gemini, {result.sources.length})
              </p>
              <div className="space-y-1.5">
                {result.sources.map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline break-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{s.title}</span>
                  </a>
                ))}
              </div>
            </Card>
          )}

          <Card padding="md" className="space-y-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-text-faint">
              Cari Materi Gambar/Video (manual, kamu yang pilih)
            </p>
            <div className="flex flex-wrap gap-2">
              {result.links.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-muted hover:border-primary/40 hover:text-text transition-colors"
                >
                  {l.label}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
            <p className="flex items-start gap-1.5 text-[11px] text-text-faint pt-1">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
              Link ini membuka pencarian resmi tiap platform di tab baru — tidak ada yang diunduh
              otomatis. Tinjau lisensi/hak cipta materinya sendiri sebelum dipakai di video.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
};
