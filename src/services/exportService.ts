import JSZip from 'jszip';
import type { ResearchResult } from './contentResearchService';
import type { NarrativeResult } from './geminiService';
import type { MetadataResult } from '@/components/content-pipeline/MetadataPanel';
import type { ThumbnailStageResult } from '@/components/content-pipeline/ThumbnailPanel';
import type { VoiceoverResult } from '@/components/content-pipeline/VoiceoverPanel';

/**
 * Bundles whatever pipeline stages have been completed into one downloadable ZIP with real
 * internal folder structure — the "structured folder" Kharis asked for. Browser-only app (no
 * backend, no filesystem access), so a ZIP is the one universal mechanism: works in every
 * browser via a plain download, unlike the File System Access API (Chromium-only). Missing
 * stages are simply omitted, never faked with placeholder content.
 */
export interface PipelineBundle {
  topic: string;
  research: ResearchResult | null;
  narrative: NarrativeResult | null;
  metadata: MetadataResult | null;
  thumbnail: ThumbnailStageResult | null;
  voiceover: VoiceoverResult | null;
}

function sanitizeFolderName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^\w\-\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return cleaned || 'konten';
}

export async function exportPipelineAsZip(bundle: PipelineBundle): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder(sanitizeFolderName(bundle.topic));
  if (!root) throw new Error('Gagal membuat struktur folder ZIP.');

  const included: string[] = [];

  if (bundle.research) {
    const risetFolder = root.folder('riset');
    risetFolder?.file('briefing.txt', bundle.research.briefing);
    risetFolder?.file(
      'sumber.txt',
      bundle.research.sources.length
        ? bundle.research.sources.map((s) => `${s.title}\n${s.url}`).join('\n\n')
        : '(tidak ada sumber tercatat pada riset ini)'
    );
    included.push('Riset & Verifikasi');
  }

  if (bundle.narrative) {
    root.folder('narasi')?.file('narasi.txt', bundle.narrative.narrative);
    included.push('Narasi');
  }

  if (bundle.metadata) {
    const metaFolder = root.folder('metadata');
    metaFolder?.file('judul.txt', bundle.metadata.title);
    metaFolder?.file('deskripsi.txt', bundle.metadata.description);
    metaFolder?.file('tags.txt', bundle.metadata.tags.join(', '));
    included.push('Metadata SEO');
  }

  if (bundle.thumbnail) {
    const thumbFolder = root.folder('thumbnail');
    thumbFolder?.file('prompt.txt', bundle.thumbnail.imagePrompt);
    if (bundle.thumbnail.processed) {
      const base64 = bundle.thumbnail.processed.dataUrl.split(',')[1];
      if (base64) thumbFolder?.file('thumbnail.jpg', base64, { base64: true });
    }
    included.push('Konsep Thumbnail');
  }

  if (bundle.voiceover) {
    root.folder('voiceover')?.file(`voiceover.${bundle.voiceover.mimeExtension}`, bundle.voiceover.blob);
    included.push('Voice Over');
  }

  root.file(
    'README.txt',
    [
      'Paket produksi konten — Panna Studio',
      `Topik: ${bundle.topic || '(tanpa topik)'}`,
      `Diekspor: ${new Date().toISOString()}`,
      '',
      `Tahap yang disertakan: ${included.length ? included.join(', ') : '(belum ada tahap yang selesai)'}`,
    ].join('\n')
  );

  return zip.generateAsync({ type: 'blob' });
}
