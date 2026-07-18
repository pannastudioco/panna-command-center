import { Search, PenLine, LineChart, Users2, Wrench, Activity, ListVideo, Sparkles, Newspaper, type LucideIcon } from 'lucide-react';
import type { ModuleId, ModuleDef } from '@/types';

export const MODULE_ICONS: Record<ModuleId, LucideIcon> = {
  'keyword-research': Search,
  'bulk-editor': PenLine,
  analytics: LineChart,
  'channel-audit': Activity,
  playlists: ListVideo,
  'ai-studio': Sparkles,
  competitors: Users2,
  toolbox: Wrench,
  'content-pipeline': Newspaper,
};

export const MODULES: ModuleDef[] = [
  {
    id: 'keyword-research',
    label: 'Riset Kata Kunci & Tag',
    description: 'Suggestion harvesting + tag kompetitor',
    available: true,
  },
  {
    id: 'bulk-editor',
    label: 'Bulk Edit Metadata',
    description: 'Cari & ganti massal',
    available: true,
  },
  {
    id: 'analytics',
    label: 'Analisis A/B Thumbnail',
    description: 'Views & retensi sebelum vs sesudah',
    available: true,
  },
  {
    id: 'channel-audit',
    label: 'Channel Audit',
    description: 'Kesehatan channel, retensi, outlier, waktu terbaik',
    available: true,
  },
  {
    id: 'playlists',
    label: 'Playlist Manager',
    description: 'Kelola playlist: buat, isi, urutkan',
    available: true,
  },
  {
    id: 'ai-studio',
    label: 'AI Studio',
    description: 'Translate multi-bahasa + generator (Gemini)',
    available: true,
  },
  {
    id: 'competitors',
    label: 'Competitor & Trend',
    description: 'Watchlist + snapshot harian',
    available: true,
  },
  {
    id: 'toolbox',
    label: 'Toolbox',
    description: 'Cek monetisasi, mockup thumbnail, chapter',
    available: true,
  },
  {
    id: 'content-pipeline',
    label: 'Produksi Konten',
    description: 'Riset materi → narasi → metadata → thumbnail',
    available: true,
  },
];
