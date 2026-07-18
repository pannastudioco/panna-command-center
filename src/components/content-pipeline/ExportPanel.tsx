import React, { useState, useCallback } from 'react';
import { FolderArchive, AlertCircle, Download, Check, X } from 'lucide-react';
import type { ResearchResult } from '@/services/contentResearchService';
import type { NarrativeResult } from '@/services/geminiService';
import { exportPipelineAsZip } from '@/services/exportService';
import type { MetadataResult } from './MetadataPanel';
import type { ThumbnailStageResult } from './ThumbnailPanel';
import type { VoiceoverResult } from './VoiceoverPanel';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { HelpPanel } from '@/components/shared/ui/HelpPanel';

interface Props {
  topic: string;
  research: ResearchResult | null;
  narrative: NarrativeResult | null;
  metadata: MetadataResult | null;
  thumbnail: ThumbnailStageResult | null;
  voiceover: VoiceoverResult | null;
}

const CHECKLIST: { label: string; has: (p: Props) => boolean }[] = [
  { label: 'Riset & Verifikasi', has: (p) => !!p.research },
  { label: 'Narasi', has: (p) => !!p.narrative },
  { label: 'Metadata SEO', has: (p) => !!p.metadata },
  { label: 'Konsep Thumbnail', has: (p) => !!p.thumbnail },
  { label: 'Voice Over', has: (p) => !!p.voiceover },
];

export const ExportPanel: React.FC<Props> = (props) => {
  const { topic, research, narrative, metadata, thumbnail, voiceover } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const hasAnything = !!(research || narrative || metadata || thumbnail || voiceover);

  const handleExport = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const blob = await exportPipelineAsZip({ topic, research, narrative, metadata, thumbnail, voiceover });
      const url = URL.createObjectURL(blob);
      setDownloadUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat ZIP.');
    } finally {
      setBusy(false);
    }
  }, [topic, research, narrative, metadata, thumbnail, voiceover]);

  return (
    <div className="max-w-3xl space-y-5 animate-fade-in">
      <HelpPanel>
        <p>
          <strong>Ekspor</strong> membungkus semua tahap yang sudah selesai jadi satu file ZIP
          dengan folder rapi di dalamnya (riset, narasi, metadata, thumbnail, voice over) — buka
          file ZIP-nya untuk lihat foldernya. Tahap yang belum dikerjakan otomatis dilewati, tidak
          diisi konten kosong.
        </p>
      </HelpPanel>

      <Card padding="md" className="space-y-2.5">
        <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Yang akan disertakan</p>
        <div className="space-y-1.5">
          {CHECKLIST.map((c) => {
            const done = c.has(props);
            return (
              <div key={c.label} className="flex items-center gap-2 text-sm">
                {done ? (
                  <Check className="w-4 h-4 text-success shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-text-faint shrink-0" />
                )}
                <span className={done ? 'text-text' : 'text-text-faint'}>{c.label}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {!hasAnything ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-text-muted">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
          <span>Belum ada tahap yang selesai — kerjakan minimal satu tahap dulu (mis. Riset) sebelum ekspor.</span>
        </div>
      ) : (
        <Button icon={<FolderArchive className="w-4 h-4" />} loading={busy} disabled={busy} onClick={handleExport}>
          {busy ? 'Membungkus ZIP...' : 'Ekspor ke ZIP'}
        </Button>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger animate-slide-up">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {downloadUrl && !busy && (
        <Card padding="md" className="animate-slide-up">
          <a
            href={downloadUrl}
            download={`${topic.trim() || 'konten'}.zip`}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-on-primary text-sm font-medium px-4 py-2.5 hover:bg-primary-hover transition-colors"
          >
            <Download className="w-4 h-4" /> Unduh ZIP
          </a>
        </Card>
      )}
    </div>
  );
};
