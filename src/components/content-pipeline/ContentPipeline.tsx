import React, { useState } from 'react';
import { Newspaper, FileSearch, ScrollText, Tag, Image, Mic, FolderArchive } from 'lucide-react';
import { useGeminiKeys } from '@/hooks/useGeminiKeys';
import type { ResearchResult } from '@/services/contentResearchService';
import type { NarrativeResult } from '@/services/geminiService';
import { ResearchPanel } from './ResearchPanel';
import { NarrativePanel } from './NarrativePanel';
import { MetadataPanel, type MetadataResult } from './MetadataPanel';
import { ThumbnailPanel, type ThumbnailStageResult } from './ThumbnailPanel';
import { VoiceoverPanel, type VoiceoverResult } from './VoiceoverPanel';
import { ExportPanel } from './ExportPanel';

/**
 * Produksi Konten — pipeline pra-produksi konten (riset → narasi → metadata → thumbnail →
 * voice-over → ekspor), dibangun bertahap satu tab per tahap. State hasil tiap tahap disimpan di
 * sini (bukan di tiap panel) supaya tahap berikutnya bisa memakai hasil tahap sebelumnya tanpa
 * hilang saat pindah tab — pola yang sama dengan useOwnVideoCatalog/usePlaylistManager di App.tsx.
 */
type Stage = 'research' | 'narrative' | 'metadata' | 'thumbnail' | 'voiceover' | 'export';

const STAGES: { id: Stage; label: string; icon: React.ElementType; available: boolean }[] = [
  { id: 'research', label: 'Riset & Verifikasi', icon: FileSearch, available: true },
  { id: 'narrative', label: 'Narasi', icon: ScrollText, available: true },
  { id: 'metadata', label: 'Metadata SEO', icon: Tag, available: true },
  { id: 'thumbnail', label: 'Konsep Thumbnail', icon: Image, available: true },
  { id: 'voiceover', label: 'Voice Over', icon: Mic, available: true },
  { id: 'export', label: 'Ekspor', icon: FolderArchive, available: true },
];

export const ContentPipeline: React.FC = () => {
  const { geminiKeys } = useGeminiKeys();
  const [stage, setStage] = useState<Stage>('research');

  const [topic, setTopic] = useState('');
  const [research, setResearch] = useState<ResearchResult | null>(null);
  const [narrative, setNarrative] = useState<NarrativeResult | null>(null);
  const [metadata, setMetadata] = useState<MetadataResult | null>(null);
  const [thumbnail, setThumbnail] = useState<ThumbnailStageResult | null>(null);
  const [voiceover, setVoiceover] = useState<VoiceoverResult | null>(null);

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 ring-1 ring-primary/20 flex items-center justify-center">
          <Newspaper className="w-5 h-5 text-primary" strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gradient-brand">Produksi Konten</h1>
          <p className="text-sm text-text-muted mt-1 max-w-2xl">
            Alur pra-produksi: riset materi bersumber resmi → narasi original → metadata SEO →
            konsep thumbnail → voice-over. Dibangun bertahap — tab yang belum tersedia akan
            menyusul.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border">
        {STAGES.map((s) => (
          <button
            key={s.id}
            onClick={() => s.available && setStage(s.id)}
            disabled={!s.available}
            className={`relative inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium transition-colors ${
              stage === s.id ? 'text-primary' : s.available ? 'text-text-muted hover:text-text' : 'text-text-faint cursor-not-allowed'
            }`}
          >
            <s.icon className="w-4 h-4" strokeWidth={2} />
            {s.label}
            {!s.available && <span className="text-[10px] uppercase tracking-wide ml-1">segera</span>}
            {stage === s.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-primary to-accent animate-scale-in" />
            )}
          </button>
        ))}
      </div>

      {stage === 'research' && (
        <ResearchPanel
          geminiKeys={geminiKeys}
          initialTopic={topic}
          onResearched={(t, r) => {
            setTopic(t);
            setResearch(r);
          }}
        />
      )}
      {stage === 'narrative' && (
        <NarrativePanel
          geminiKeys={geminiKeys}
          topic={topic}
          research={research}
          narrative={narrative}
          onNarrativeGenerated={setNarrative}
        />
      )}
      {stage === 'metadata' && (
        <MetadataPanel
          geminiKeys={geminiKeys}
          topic={topic}
          narrative={narrative}
          metadata={metadata}
          onMetadataGenerated={setMetadata}
        />
      )}
      {stage === 'thumbnail' && (
        <ThumbnailPanel
          geminiKeys={geminiKeys}
          topic={topic}
          metadata={metadata}
          thumbnail={thumbnail}
          onThumbnailGenerated={setThumbnail}
        />
      )}
      {stage === 'voiceover' && (
        <VoiceoverPanel geminiKeys={geminiKeys} narrative={narrative} onVoiceoverGenerated={setVoiceover} />
      )}
      {stage === 'export' && (
        <ExportPanel
          topic={topic}
          research={research}
          narrative={narrative}
          metadata={metadata}
          thumbnail={thumbnail}
          voiceover={voiceover}
        />
      )}
    </div>
  );
};
