import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ImagePlus, Upload } from 'lucide-react';
import { Card } from '@/components/shared/ui/Card';
import { Button } from '@/components/shared/ui/Button';

/** Renders an uploaded thumbnail image inside faithful mockups of YouTube's search,
 * home-grid, and sidebar-suggestion surfaces so you can judge how it reads at real size
 * before publishing. 100% client-side (object URL), zero network, zero quota. */
export const ThumbnailMockup: React.FC = () => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('Judul video kamu tampil di sini — cek keterbacaannya');
  const fileRef = useRef<HTMLInputElement>(null);

  // Revoke the object URL when it changes or on unmount to avoid leaking blobs.
  useEffect(() => {
    return () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
    };
  }, [imgUrl]);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file || !file.type.startsWith('image/')) return;
      setImgUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
    },
    []
  );

  const Thumb: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`relative bg-surface-raised rounded-lg overflow-hidden ${className}`}>
      {imgUrl ? (
        <img src={imgUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImagePlus className="w-6 h-6 text-text-faint" strokeWidth={1.5} />
        </div>
      )}
      <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[10px] font-medium text-white tabular-nums">
        12:34
      </span>
    </div>
  );

  return (
    <div className="space-y-5">
      <Card padding="md" className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <Button variant="secondary" icon={<Upload className="w-4 h-4" />} onClick={() => fileRef.current?.click()}>
            {imgUrl ? 'Ganti Gambar' : 'Upload Thumbnail'}
          </Button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Judul untuk pratinjau"
            className="flex-1 min-w-[200px] rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <p className="text-xs text-text-faint">
          Semua render di bawah 100% lokal — gambar tidak diunggah ke mana pun. Saran ukuran asli
          YouTube: 1280×720, ≤2MB.
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Search result row */}
        <Card padding="md" className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Hasil Pencarian</p>
          <div className="flex gap-3">
            <Thumb className="w-40 aspect-video shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug line-clamp-2">{title}</p>
              <p className="text-[11px] text-text-faint mt-1">Panna Studio · 12rb x ditonton · 2 hari lalu</p>
            </div>
          </div>
        </Card>

        {/* Home grid card */}
        <Card padding="md" className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Grid Beranda</p>
          <div>
            <Thumb className="w-full aspect-video" />
            <div className="flex gap-2.5 mt-2">
              <div className="w-8 h-8 rounded-full bg-surface-raised shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug line-clamp-2">{title}</p>
                <p className="text-[11px] text-text-faint mt-0.5">Panna Studio</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Sidebar suggestion */}
        <Card padding="md" className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Saran Samping</p>
          <div className="flex gap-2">
            <Thumb className="w-24 aspect-video shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium leading-snug line-clamp-2">{title}</p>
              <p className="text-[10px] text-text-faint mt-1">Panna Studio</p>
              <p className="text-[10px] text-text-faint">12rb x · 2 hari lalu</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
