import React, { useState, useCallback, useMemo } from 'react';
import type { EditableVideo } from '@/types';
import { updateVideoMetadata } from '@/services/youtubeDataService';
import { QUOTA_COST } from '@/constants/quotas';
import {
  parseChapters,
  validateChapters,
  replaceChapterBlock,
  formatTimestamp,
  type Chapter,
} from '@/services/chapterService';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { EmptyState } from '@/components/shared/ui/EmptyState';
import { Plus, Trash2, Check, AlertCircle, CheckCircle2, Clock, ListVideo } from 'lucide-react';

interface Props {
  videos: EditableVideo[];
  accessToken: string | null;
  remainingUnitsToday: number;
  recordUnits: (units: number) => void;
  onLocalPatch: (videoId: string, patch: Partial<EditableVideo>) => void;
}

/** Parse an "MM:SS" / "HH:MM:SS" string to seconds, or null if malformed. */
function tsToSeconds(input: string): number | null {
  const parts = input.split(':').map((p) => p.trim());
  if (parts.some((p) => p === '' || !/^\d+$/.test(p))) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 1) return nums[0];
  return null;
}

export const ChapterEditor: React.FC<Props> = ({
  videos,
  accessToken,
  remainingUnitsToday,
  recordUnits,
  onLocalPatch,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSummary, setSaveSummary] = useState<string | null>(null);

  const selectedVideo = useMemo(() => videos.find((v) => v.videoId === selectedId) ?? null, [videos, selectedId]);
  const validation = useMemo(() => validateChapters(chapters), [chapters]);

  const handleSelect = useCallback((video: EditableVideo) => {
    setSelectedId(video.videoId);
    setChapters(parseChapters(video.description));
    setSaveSummary(null);
    setError(null);
  }, []);

  const updateChapter = useCallback((index: number, patch: Partial<Chapter>) => {
    setChapters((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }, []);

  const addChapter = useCallback(() => {
    setChapters((prev) => {
      const last = prev[prev.length - 1];
      const nextStart = last ? last.start + 30 : 0;
      return [...prev, { start: nextStart, label: '' }];
    });
  }, []);

  const removeChapter = useCallback((index: number) => {
    setChapters((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(async () => {
    if (!accessToken || !selectedVideo || !validation.ok) return;
    setIsSaving(true);
    setError(null);
    try {
      const sorted = [...chapters].sort((a, b) => a.start - b.start);
      const newDescription = replaceChapterBlock(selectedVideo.description, sorted);
      // Only send description — partial patch, same fetch-merge-send contract the bulk
      // editor relies on so other fields (tags, categoryId) are never disturbed.
      await updateVideoMetadata(selectedVideo.videoId, { description: newDescription }, accessToken);
      recordUnits(QUOTA_COST.videosUpdate);
      onLocalPatch(selectedVideo.videoId, { description: newDescription });
      setSaveSummary('Chapter berhasil disimpan ke video. Cek di YouTube (bisa perlu beberapa menit muncul).');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan chapter.');
    } finally {
      setIsSaving(false);
    }
  }, [accessToken, selectedVideo, chapters, validation.ok, recordUnits, onLocalPatch]);

  if (videos.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={ListVideo}
          tone="primary"
          title="Muat katalog dulu"
          description="Setelah katalog termuat, pilih video untuk mengatur chapter-nya."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 flex items-start gap-2.5 text-sm text-danger">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {saveSummary && (
        <div className="rounded-lg border border-success/30 bg-success-bg px-4 py-3 flex items-start gap-2.5 text-sm text-success">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{saveSummary}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">
        {/* Video picker */}
        <Card padding="none" className="overflow-hidden lg:sticky lg:top-6">
          <div className="px-4 py-3 border-b border-border bg-surface-raised/60">
            <h3 className="text-sm font-semibold">Pilih Video</h3>
          </div>
          <div className="max-h-[560px] overflow-y-auto custom-scrollbar p-2 space-y-1">
            {videos.map((v) => {
              const chapCount = parseChapters(v.description).length;
              return (
                <button
                  key={v.videoId}
                  onClick={() => handleSelect(v)}
                  className={`w-full text-left rounded-lg p-2 flex gap-2.5 transition-colors ${
                    selectedId === v.videoId ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-surface-hover'
                  }`}
                >
                  <div className="w-20 aspect-video shrink-0 rounded-md overflow-hidden bg-surface-raised">
                    {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium line-clamp-2 leading-snug">{v.title}</p>
                    <p className="text-[10px] text-text-faint mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {chapCount > 0 ? `${chapCount} chapter` : 'belum ada chapter'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Chapter editor */}
        <div className="min-w-0">
          {!selectedVideo ? (
            <Card padding="none">
              <EmptyState
                icon={Clock}
                tone="primary"
                title="Pilih video dari daftar"
                description="Chapter yang sudah ada akan otomatis di-parse dari deskripsi, siap kamu edit."
              />
            </Card>
          ) : (
            <Card padding="md" className="space-y-4">
              <div>
                <p className="text-sm font-semibold line-clamp-1">{selectedVideo.title}</p>
                <p className="text-xs text-text-faint mt-0.5">
                  YouTube mengaktifkan chapter bila: mulai 0:00, minimal 3 chapter, urut naik, tiap chapter
                  ≥10 detik.
                </p>
              </div>

              <div className="space-y-2">
                {chapters.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={formatTimestamp(c.start)}
                      onChange={(e) => {
                        const secs = tsToSeconds(e.target.value);
                        if (secs !== null) updateChapter(i, { start: secs });
                      }}
                      className="w-20 shrink-0 rounded-md border border-border bg-bg px-2 py-1.5 text-sm font-mono tabular-nums text-center outline-none focus:border-primary"
                    />
                    <input
                      value={c.label}
                      onChange={(e) => updateChapter(i, { label: e.target.value })}
                      placeholder="Judul chapter"
                      className="flex-1 min-w-0 rounded-md border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => removeChapter(i)}
                      aria-label="Hapus chapter"
                      className="shrink-0 rounded-md p-1.5 text-text-faint hover:bg-danger-bg hover:text-danger transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={addChapter}>
                  Tambah Chapter
                </Button>
              </div>

              {!validation.ok && chapters.length > 0 && (
                <div className="rounded-lg border border-warning/30 bg-warning-bg px-3 py-2.5 space-y-1">
                  {validation.errors.map((err, i) => (
                    <p key={i} className="text-xs text-text-muted flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px text-warning" />
                      {err}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <Button
                  icon={<Check className="w-4 h-4" />}
                  loading={isSaving}
                  disabled={!validation.ok || isSaving || remainingUnitsToday < QUOTA_COST.videosUpdate}
                  onClick={handleSave}
                >
                  Simpan ke Video (50 unit)
                </Button>
                {validation.ok && (
                  <span className="text-xs text-success flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                  </span>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
