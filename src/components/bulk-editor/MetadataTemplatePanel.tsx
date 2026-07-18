import React, { useState, useCallback } from 'react';
import type { EditableVideo } from '@/types';
import { updateVideoMetadata } from '@/services/youtubeDataService';
import { QUOTA_COST } from '@/constants/quotas';
import { useMetadataTemplates } from '@/hooks/useMetadataTemplates';
import { Card } from '@/components/shared/ui/Card';
import { Button } from '@/components/shared/ui/Button';
import { Save, FileText, CheckCircle2, AlertCircle, Wand2, X } from 'lucide-react';

interface Props {
  videos: EditableVideo[];
  accessToken: string | null;
  remainingUnitsToday: number;
  recordUnits: (units: number) => void;
  onLocalPatch: (videoId: string, patch: Partial<EditableVideo>) => void;
}

export const MetadataTemplatePanel: React.FC<Props> = ({
  videos,
  accessToken,
  remainingUnitsToday,
  recordUnits,
  onLocalPatch,
}) => {
  const { templates, saveTemplate, removeTemplate } = useMetadataTemplates();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [descBlock, setDescBlock] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeTemplate = templates.find((t) => t.id === activeTemplateId) ?? null;
  const applyCost = selectedIds.size * QUOTA_COST.videosUpdate;

  const handleSave = useCallback(() => {
    if (!name.trim()) return;
    saveTemplate({
      name: name.trim(),
      descriptionBlock: descBlock,
      tags: tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    setName('');
    setDescBlock('');
    setTagsInput('');
    setShowCreate(false);
  }, [name, descBlock, tagsInput, saveTemplate]);

  const toggleVideo = useCallback((videoId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }, []);

  const handleApply = useCallback(async () => {
    if (!accessToken || !activeTemplate || selectedIds.size === 0) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    let done = 0;
    const failures: string[] = [];
    for (const videoId of selectedIds) {
      const video = videos.find((v) => v.videoId === videoId);
      if (!video) continue;
      const patch: Partial<Pick<EditableVideo, 'description' | 'tags'>> = {};
      if (activeTemplate.descriptionBlock) {
        patch.description = `${video.description.replace(/\s+$/, '')}\n\n${activeTemplate.descriptionBlock}`;
      }
      if (activeTemplate.tags.length > 0) {
        const existing = new Set(video.tags.map((t) => t.toLowerCase()));
        const merged = [...video.tags, ...activeTemplate.tags.filter((t) => !existing.has(t.toLowerCase()))];
        if (merged.length !== video.tags.length) patch.tags = merged;
      }
      if (Object.keys(patch).length === 0) continue;
      try {
        await updateVideoMetadata(videoId, patch, accessToken);
        recordUnits(QUOTA_COST.videosUpdate);
        onLocalPatch(videoId, patch);
        done += 1;
      } catch (e) {
        failures.push(e instanceof Error ? e.message : videoId);
      }
    }
    setBusy(false);
    setSelectedIds(new Set());
    setSuccess(`Template diterapkan ke ${done} video${failures.length ? `, ${failures.length} gagal` : ''}.`);
  }, [accessToken, activeTemplate, selectedIds, videos, recordUnits, onLocalPatch]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-primary" strokeWidth={2} />
        <h3 className="text-sm font-semibold">Template Metadata</h3>
        <Button size="sm" variant="secondary" icon={<Save className="w-3.5 h-3.5" />} className="ml-auto" onClick={() => setShowCreate((v) => !v)}>
          Template Baru
        </Button>
      </div>
      <p className="text-xs text-text-muted -mt-1">
        Simpan blok deskripsi + set tag yang sering dipakai, lalu terapkan ke banyak video sekaligus.
        Deskripsi template ditambahkan di akhir, tag digabung tanpa duplikat. 50 unit/video.
      </p>

      {showCreate && (
        <Card padding="md" className="space-y-2.5 animate-slide-up">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama template (mis. Footer standar)" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary" />
          <textarea value={descBlock} onChange={(e) => setDescBlock(e.target.value)} rows={4} placeholder="Blok deskripsi (link sosial, CTA, dll)" className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary" />
          <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="Tag, pisah koma" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary" />
          <div className="flex justify-end">
            <Button size="sm" icon={<Save className="w-3.5 h-3.5" />} disabled={!name.trim()} onClick={handleSave}>Simpan Template</Button>
          </div>
        </Card>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-2.5 flex items-start gap-2 text-sm text-danger">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-success/30 bg-success-bg px-4 py-2.5 flex items-start gap-2 text-sm text-success">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /><span>{success}</span>
        </div>
      )}

      {templates.length === 0 ? (
        <p className="text-xs text-text-faint">Belum ada template. Buat satu dengan tombol di atas.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {templates.map((t) => (
            <div key={t.id} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${activeTemplateId === t.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-surface-hover'}`}>
              <button onClick={() => setActiveTemplateId(activeTemplateId === t.id ? null : t.id)} className="font-medium">
                {t.name}
              </button>
              <span className="text-text-faint">({t.tags.length} tag)</span>
              <button onClick={() => removeTemplate(t.id)} aria-label="Hapus template" className="text-text-faint hover:text-danger">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTemplate && (
        <Card padding="md" className="space-y-3">
          <p className="text-xs text-text-muted">
            Pilih video untuk menerapkan <span className="font-medium text-text">{activeTemplate.name}</span>:
          </p>
          <div className="max-h-64 overflow-y-auto custom-scrollbar grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {videos.map((v) => {
              const picked = selectedIds.has(v.videoId);
              return (
                <button key={v.videoId} onClick={() => toggleVideo(v.videoId)} className={`text-left rounded-lg p-1.5 flex gap-2 items-center transition-colors ${picked ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-surface-hover'}`}>
                  <div className="w-14 aspect-video shrink-0 rounded overflow-hidden bg-surface-raised">
                    {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <p className="text-[11px] line-clamp-2 flex-1 min-w-0">{v.title}</p>
                  {picked && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" icon={<Wand2 className="w-3.5 h-3.5" />} loading={busy} disabled={selectedIds.size === 0 || busy || remainingUnitsToday < applyCost} onClick={handleApply}>
              Terapkan ke {selectedIds.size > 0 ? `${selectedIds.size} video` : ''}
            </Button>
            {selectedIds.size > 0 && <span className="text-xs text-text-faint tabular-nums">≈ {applyCost} unit</span>}
          </div>
        </Card>
      )}
    </div>
  );
};
