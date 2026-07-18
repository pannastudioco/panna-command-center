import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { EditableVideo } from '@/types';
import { setVideoThumbnail } from '@/services/youtubeDataService';
import { QUOTA_COST } from '@/constants/quotas';
import { Card } from '@/components/shared/ui/Card';
import { Button } from '@/components/shared/ui/Button';
import { Image, Upload, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  videos: EditableVideo[];
  accessToken: string | null;
  remainingUnitsToday: number;
  recordUnits: (units: number) => void;
}

const MAX_BYTES = 2 * 1024 * 1024; // YouTube's 2MB thumbnail cap.
const ALLOWED = ['image/jpeg', 'image/png'];

export const BulkThumbnailUpdater: React.FC<Props> = ({ videos, accessToken, remainingUnitsToday, recordUnits }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = useCallback((f: File | undefined) => {
    setError(null);
    setSuccess(null);
    if (!f) return;
    if (!ALLOWED.includes(f.type)) {
      setError('Format harus JPG atau PNG.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`Ukuran maksimal 2MB (file ini ${(f.size / 1024 / 1024).toFixed(1)}MB).`);
      return;
    }
    setFile(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  }, []);

  const handleUpload = useCallback(async () => {
    if (!accessToken || !selectedId || !file) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await setVideoThumbnail(selectedId, file, accessToken);
      recordUnits(QUOTA_COST.thumbnailsSet);
      setSuccess('Thumbnail berhasil di-set. Cek di YouTube (bisa perlu beberapa menit muncul).');
      setFile(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal set thumbnail.');
    } finally {
      setBusy(false);
    }
  }, [accessToken, selectedId, file, recordUnits]);

  const selectedVideo = videos.find((v) => v.videoId === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">
      <Card padding="none" className="overflow-hidden lg:sticky lg:top-6">
        <div className="px-4 py-3 border-b border-border bg-surface-raised/60">
          <h3 className="text-sm font-semibold">Pilih Video</h3>
        </div>
        <div className="max-h-[520px] overflow-y-auto custom-scrollbar p-2 space-y-1">
          {videos.map((v) => (
            <button
              key={v.videoId}
              onClick={() => {
                setSelectedId(v.videoId);
                setSuccess(null);
                setError(null);
              }}
              className={`w-full text-left rounded-lg p-2 flex gap-2.5 items-center transition-colors ${selectedId === v.videoId ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-surface-hover'}`}
            >
              <div className="w-16 aspect-video shrink-0 rounded-md overflow-hidden bg-surface-raised">
                {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
              </div>
              <p className="text-xs font-medium line-clamp-2 flex-1 min-w-0">{v.title}</p>
            </button>
          ))}
        </div>
      </Card>

      <div className="min-w-0">
        {!selectedVideo ? (
          <Card padding="lg" className="text-center">
            <div className="flex flex-col items-center gap-2 py-4">
              <Image className="w-8 h-8 text-text-faint" strokeWidth={1.5} />
              <p className="text-sm text-text-muted">Pilih video untuk ganti thumbnail-nya.</p>
            </div>
          </Card>
        ) : (
          <Card padding="md" className="space-y-4">
            <p className="text-sm font-semibold line-clamp-1">{selectedVideo.title}</p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] text-text-faint mb-1.5">Thumbnail sekarang</p>
                <div className="aspect-video rounded-lg overflow-hidden bg-surface-raised border border-border">
                  {selectedVideo.thumbnailUrl && <img src={selectedVideo.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
                </div>
              </div>
              <div>
                <p className="text-[11px] text-text-faint mb-1.5">Thumbnail baru</p>
                <div className="aspect-video rounded-lg overflow-hidden bg-surface-raised border border-dashed border-border-strong flex items-center justify-center">
                  {previewUrl ? <img src={previewUrl} alt="" className="w-full h-full object-cover" /> : <Image className="w-6 h-6 text-text-faint" strokeWidth={1.5} />}
                </div>
              </div>
            </div>

            <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" size="sm" icon={<Upload className="w-4 h-4" />} onClick={() => fileRef.current?.click()}>
                Pilih Gambar
              </Button>
              <Button size="sm" loading={busy} disabled={!file || busy || remainingUnitsToday < QUOTA_COST.thumbnailsSet} onClick={handleUpload}>
                Upload & Set (50 unit)
              </Button>
              <span className="text-[11px] text-text-faint">JPG/PNG, ≤2MB, saran 1280×720</span>
            </div>

            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 flex items-start gap-2 text-sm text-danger">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
              </div>
            )}
            {success && (
              <div className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 flex items-start gap-2 text-sm text-success">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /><span>{success}</span>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
};
