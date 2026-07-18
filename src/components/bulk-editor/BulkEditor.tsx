import React, { useState, useCallback, useMemo } from 'react';
import type {
  EditableVideo,
  PendingEdit,
  BulkFindReplaceRule,
  QuotaState,
  YoutubeAuthState,
  ConnectedChannelState,
} from '@/types';
import { updateVideoMetadata } from '@/services/youtubeDataService';
import type { OwnVideoCatalog } from '@/hooks/useOwnVideoCatalog';
import { DAILY_UNIT_POOL, QUOTA_COST } from '@/constants/quotas';
import { ChannelConnectionPanel } from '@/components/auth/ChannelConnectionPanel';
import { Loader } from '@/components/shared/Loader';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { EmptyState } from '@/components/shared/ui/EmptyState';
import { Skeleton } from '@/components/shared/ui/Skeleton';
import { PenLine, ListVideo, Inbox, AlertCircle, CheckCircle2, Gauge, GitCompareArrows } from 'lucide-react';
import { VideoGrid } from './VideoGrid';
import { BulkFindReplacePanel } from './BulkFindReplacePanel';
import { EditDiffPreview } from './EditDiffPreview';
import { MetadataTemplatePanel } from './MetadataTemplatePanel';
import { BulkThumbnailUpdater } from './BulkThumbnailUpdater';
import { HelpPanel } from '@/components/shared/ui/HelpPanel';
import { StrategyPanel, Example, Sample, Why } from '@/components/shared/ui/StrategyPanel';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replaces using a function replacer (not a plain string) so the replacement text is
 * always inserted literally — a plain-string second argument to String.replace treats
 * $&, $$, $`, $' as live substitution tokens, which would silently mangle any
 * replacement text a user happens to type containing a dollar sign. */
function literalReplace(source: string, pattern: RegExp, replacement: string): string {
  return source.replace(pattern, () => replacement);
}

function applyFindReplace(videos: EditableVideo[], rule: BulkFindReplaceRule): PendingEdit[] {
  const flags = rule.caseSensitive ? 'g' : 'gi';
  const pattern = new RegExp(escapeRegExp(rule.find), flags);
  const edits: PendingEdit[] = [];

  for (const v of videos) {
    if (rule.field === 'tags') {
      const newTags = v.tags.map((t) => literalReplace(t, pattern, rule.replace));
      if (newTags.some((t, i) => t !== v.tags[i])) {
        edits.push({
          videoId: v.videoId,
          before: { title: v.title, description: v.description, tags: v.tags },
          after: { title: v.title, description: v.description, tags: newTags },
        });
      }
    } else {
      const original = v[rule.field];
      const updated = literalReplace(original, pattern, rule.replace);
      if (updated !== original) {
        edits.push({
          videoId: v.videoId,
          before: { title: v.title, description: v.description, tags: v.tags },
          after: {
            title: rule.field === 'title' ? updated : v.title,
            description: rule.field === 'description' ? updated : v.description,
            tags: v.tags,
          },
        });
      }
    }
  }
  return edits;
}

/** The critical fix: only include fields that actually changed. Sending the full
 * before/after triple as the update patch (the old behavior) meant videos.update's
 * fetch-merge-send would unconditionally overwrite description/tags back to this
 * possibly-stale local snapshot even when only the title was meant to change —
 * silently discarding any edit made outside this app (e.g. directly in YouTube Studio)
 * between catalog load and commit. */
function computePatch(edit: PendingEdit): Partial<Pick<EditableVideo, 'title' | 'description' | 'tags'>> {
  const patch: Partial<Pick<EditableVideo, 'title' | 'description' | 'tags'>> = {};
  if (edit.after.title !== edit.before.title) patch.title = edit.after.title;
  if (edit.after.description !== edit.before.description) patch.description = edit.after.description;
  if (JSON.stringify(edit.after.tags) !== JSON.stringify(edit.before.tags)) patch.tags = edit.after.tags;
  return patch;
}

interface Props {
  quota: QuotaState;
  recordUnits: (units: number) => void;
  auth: YoutubeAuthState;
  channel: ConnectedChannelState;
  catalog: OwnVideoCatalog;
}

export const BulkEditor: React.FC<Props> = ({ quota, recordUnits, auth, channel, catalog }) => {
  const { accessToken, isConnected, isConnecting, error: authError, connect, disconnect } = auth;
  const { channelInfo, isLoadingChannel } = channel;

  // Videos come from the ONE app-level catalog now — already populated if any other
  // module loaded it, so switching to Bulk Editor no longer re-fetches or re-spends quota.
  const { videos, hasLoaded: hasLoadedCatalog, isLoading: isLoadingCatalog, loadCatalog, applyLocalPatch } = catalog;

  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [excludedVideoIds, setExcludedVideoIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSummary, setSaveSummary] = useState<string | null>(null);
  const [mode, setMode] = useState<'find-replace' | 'template' | 'thumbnail'>('find-replace');

  const pendingByVideoId = useMemo(() => new Map(pendingEdits.map((e) => [e.videoId, e])), [pendingEdits]);
  const remainingUnitsToday = DAILY_UNIT_POOL - quota.dataApiUnitsUsed;

  const handleLoadCatalog = useCallback(async () => {
    setError(null);
    setSaveSummary(null);
    setPendingEdits([]);
    setExcludedVideoIds(new Set());
    // force=true: the "Muat Ulang" affordance should genuinely refetch.
    await loadCatalog(true);
  }, [loadCatalog]);

  const handlePreview = useCallback(
    (rule: BulkFindReplaceRule) => {
      const edits = applyFindReplace(videos, rule);
      setPendingEdits(edits);
      setExcludedVideoIds(new Set());
      setSaveSummary(null);
      if (edits.length === 0) {
        setError('Tidak ada video yang cocok dengan pencarian itu.');
      } else {
        setError(null);
      }
    },
    [videos]
  );

  const handleToggleExclude = useCallback((videoId: string) => {
    setExcludedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }, []);

  const handleCommit = useCallback(async () => {
    if (!accessToken) return;
    const toSave = pendingEdits.filter((e) => !excludedVideoIds.has(e.videoId));
    setIsSaving(true);
    setError(null);
    let succeeded = 0;
    const failures: string[] = [];

    for (const edit of toSave) {
      try {
        await updateVideoMetadata(edit.videoId, computePatch(edit), accessToken);
        recordUnits(QUOTA_COST.videosUpdate);
        succeeded += 1;
        applyLocalPatch(edit.videoId, edit.after);
      } catch (e) {
        failures.push(e instanceof Error ? e.message : `Gagal update video ${edit.videoId}`);
      }
    }

    setIsSaving(false);
    setPendingEdits([]);
    setExcludedVideoIds(new Set());
    setSaveSummary(
      failures.length === 0
        ? `${succeeded} video berhasil diperbarui.`
        : `${succeeded} berhasil, ${failures.length} gagal: ${failures[0]}`
    );
  }, [accessToken, pendingEdits, excludedVideoIds, recordUnits, applyLocalPatch]);

  const handleDiscard = useCallback(() => {
    setPendingEdits([]);
    setExcludedVideoIds(new Set());
  }, []);

  const handleDisconnect = useCallback(() => {
    // App resets the shared catalog when the channel changes; here we just clear this
    // module's own pending-edit state.
    disconnect();
    setPendingEdits([]);
    setExcludedVideoIds(new Set());
  }, [disconnect]);

  return (
    <div className="max-w-[1600px] space-y-6">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 ring-1 ring-primary/20 flex items-center justify-center">
          <PenLine className="w-5 h-5 text-primary" strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gradient-brand">Bulk Edit Metadata</h1>
          <p className="text-sm text-text-muted mt-1 max-w-2xl">
            Cari & ganti teks di title/deskripsi/tag di banyak video sekaligus. Setiap penyimpanan
            butuh 50 unit kuota per video — tinjau dulu sebelum simpan.
          </p>
        </div>
      </div>

      <HelpPanel>
        <p>
          Modul ini mengedit <strong>metadata</strong> video kamu (judul, deskripsi, tag) secara massal —
          sambungkan akun YouTube dulu, lalu muat katalog. Ada 3 tab:
        </p>
        <p>
          <strong>Cari &amp; Ganti:</strong> ganti sebuah teks jadi teks lain di banyak video sekaligus (mis. ganti
          nama channel lama). Selalu tampilkan <strong>pratinjau perubahan</strong> dulu (cuma bagian yang berubah
          yang disorot) — kamu bisa mencentang keluar video tertentu sebelum simpan. Badge <strong>SEO</strong> di
          tiap thumbnail (0&ndash;100) = skor kelengkapan metadata, makin hijau makin lengkap.
        </p>
        <p>
          <strong>Template Metadata:</strong> simpan blok deskripsi + set tag yang sering dipakai, lalu terapkan ke
          banyak video sekali klik. <strong>Update Thumbnail:</strong> ganti gambar thumbnail video (JPG/PNG, maks 2MB).
        </p>
        <p>
          <strong>Soal kuota:</strong> memuat katalog murah; tiap penyimpanan ke YouTube = 50 unit per video. Angka
          &ldquo;Sisa Kuota Hari Ini&rdquo; ada di kartu atas.
        </p>
      </HelpPanel>

      <StrategyPanel>
        <p>Massal itu buat konsistensi. Tiga tab, tiga kegunaan nyata:</p>
        <Example label="Cari & Ganti — rapikan semua video sekali klik">
          <p>Contoh: kamu ganti nama brand di semua deskripsi. Ketik cari <Sample>PannaStudio</Sample> ganti jadi <Sample>Panna Studio</Sample> lalu terapkan ke seluruh katalog.</p>
          <p>Badge <strong>SEO</strong> di tiap thumbnail (0&ndash;100) = kelengkapan metadata; makin hijau makin lengkap. Pakai buat cari video yang deskripsinya masih tipis.</p>
          <Why>selalu tinjau pratinjau dulu — cuma bagian yang berubah yang disorot, dan kamu bisa keluarkan video tertentu sebelum simpan.</Why>
        </Example>
        <Example label="Template Metadata — deskripsi kaya keyword di semua video">
          <p>Simpan satu blok deskripsi standar (link playlist, ajakan subscribe, hashtag) + set tag, terapkan ke banyak video. Contoh blok untuk Somatic Lounge:</p>
          <Sample>Original smooth jazz by Somatic Lounge — no repeating loops, just hours of calm for work, study &amp; sleep. ▶ Playlist: Cozy Café Mornings / Late Night Study. #smoothjazz #coffeeshopambience #relaxingmusic</Sample>
          <Why>deskripsi konsisten + kaya keyword di seluruh channel memperkuat sinyal &ldquo;channel ini tentang apa&rdquo;, dan bikin tiap upload lebih gampang ditemukan.</Why>
        </Example>
        <Example label="Update Thumbnail — jaga brand tetap seragam">
          <p>Ganti thumbnail massal (JPG/PNG, maks 2MB) biar semua video satu gaya. Gunanya supaya PENONTON langsung mengenali channel-mu di feed. (Catatan jujur: tak ada bukti YouTube mengelompokkan channel dari gaya thumbnail — manfaatnya ke manusia, bukan algoritma.)</p>
        </Example>
      </StrategyPanel>

      <ChannelConnectionPanel
        isConnected={isConnected}
        isConnecting={isConnecting}
        authError={authError}
        onConnect={connect}
        onDisconnect={handleDisconnect}
        channelInfo={channelInfo}
        isLoadingChannel={isLoadingChannel}
      />

      {isConnected && channelInfo && !hasLoadedCatalog && (
        <Card padding="lg" className="relative bg-aurora bg-grain text-center animate-fade-in">
          <div className="relative z-10 flex flex-col items-center gap-3 py-4">
            <div className="w-12 h-12 rounded-full bg-surface/90 backdrop-blur-sm border border-border shadow-glow flex items-center justify-center">
              <ListVideo className="w-5 h-5 text-primary" strokeWidth={2} />
            </div>
            <div>
              <p className="text-sm font-semibold text-text">Siap memuat katalog video</p>
              <p className="text-xs text-text-muted mt-1 max-w-sm">
                Tarik semua video dari channel ini dulu, baru kamu bisa mulai cari & ganti massal.
              </p>
            </div>
            <Button
              variant="primary"
              icon={<ListVideo className="w-4 h-4" />}
              loading={isLoadingCatalog}
              disabled={isLoadingCatalog}
              onClick={handleLoadCatalog}
            >
              {isLoadingCatalog ? 'Memuat...' : 'Muat Katalog Video Saya'}
            </Button>
          </div>
        </Card>
      )}

      {isLoadingCatalog && (
        <div className="space-y-3 animate-fade-in">
          <Loader label="Memuat daftar video dari channel kamu..." size="sm" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-surface overflow-hidden">
                <Skeleton className="aspect-video w-full rounded-none" />
                <div className="p-2.5 space-y-2">
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasLoadedCatalog && videos.length === 0 && (
        <Card padding="none" className="animate-fade-in">
          <EmptyState
            icon={Inbox}
            title="Channel ini belum ada video sama sekali"
            description="Bukan error, cuma belum ada yang diupload."
          />
        </Card>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 flex items-start gap-2.5 text-sm text-danger animate-slide-up">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {saveSummary && (
        <div className="rounded-lg border border-success/30 bg-success-bg px-4 py-3 flex items-start gap-2.5 text-sm text-success animate-slide-up">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{saveSummary}</span>
        </div>
      )}

      {videos.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card padding="sm" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ListVideo className="w-4 h-4 text-primary" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-text-faint truncate">Video Dimuat</p>
                <p className="text-lg font-semibold tabular-nums font-mono leading-tight">{videos.length}</p>
              </div>
            </Card>
            <Card padding="sm" className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  remainingUnitsToday <= 0 ? 'bg-danger-bg' : 'bg-info-bg'
                }`}
              >
                <Gauge
                  className={`w-4 h-4 ${remainingUnitsToday <= 0 ? 'text-danger' : 'text-info'}`}
                  strokeWidth={2}
                />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-text-faint truncate">Sisa Kuota Hari Ini</p>
                <p
                  className={`text-lg font-semibold tabular-nums font-mono leading-tight ${
                    remainingUnitsToday <= 0 ? 'text-danger' : ''
                  }`}
                >
                  {remainingUnitsToday}
                </p>
              </div>
            </Card>
            <Card padding="sm" className="flex items-center gap-3 col-span-2 sm:col-span-1">
              <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <GitCompareArrows className="w-4 h-4 text-accent" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-text-faint truncate">Perubahan Menunggu</p>
                <p className="text-lg font-semibold tabular-nums font-mono leading-tight">{pendingEdits.length}</p>
              </div>
            </Card>
          </div>

          {/* Mode tabs — find-replace (existing) vs template apply vs thumbnail set. */}
          <div className="flex flex-wrap gap-1.5 border-b border-border">
            {([
              { id: 'find-replace', label: 'Cari & Ganti' },
              { id: 'template', label: 'Template Metadata' },
              { id: 'thumbnail', label: 'Update Thumbnail' },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => setMode(t.id)}
                className={`relative px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  mode === t.id ? 'text-primary' : 'text-text-muted hover:text-text'
                }`}
              >
                {t.label}
                {mode === t.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-primary to-accent animate-scale-in" />
                )}
              </button>
            ))}
          </div>

          {mode === 'find-replace' && (
            <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 items-start animate-fade-in">
              <div className="space-y-6 lg:sticky lg:top-6">
                {pendingEdits.length === 0 && (
                  <BulkFindReplacePanel onPreview={handlePreview} disabled={isSaving} />
                )}

                {pendingEdits.length > 0 && (
                  <EditDiffPreview
                    edits={pendingEdits}
                    excludedVideoIds={excludedVideoIds}
                    onToggleExclude={handleToggleExclude}
                    onCommit={handleCommit}
                    onDiscard={handleDiscard}
                    isSaving={isSaving}
                    remainingUnitsToday={remainingUnitsToday}
                  />
                )}
              </div>

              <div className="min-w-0">
                <VideoGrid videos={videos} pendingByVideoId={pendingByVideoId} />
              </div>
            </div>
          )}

          {mode === 'template' && (
            <div className="animate-fade-in">
              <MetadataTemplatePanel
                videos={videos}
                accessToken={accessToken}
                remainingUnitsToday={remainingUnitsToday}
                recordUnits={recordUnits}
                onLocalPatch={applyLocalPatch}
              />
            </div>
          )}

          {mode === 'thumbnail' && (
            <div className="animate-fade-in">
              <BulkThumbnailUpdater
                videos={videos}
                accessToken={accessToken}
                remainingUnitsToday={remainingUnitsToday}
                recordUnits={recordUnits}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};
