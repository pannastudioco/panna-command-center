import React, { useState, useMemo } from 'react';
import { ShieldAlert, ShieldCheck, Info } from 'lucide-react';
import { scanDemonetization } from '@/constants/demonetizationWords';
import { Card } from '@/components/shared/ui/Card';

/** Local, indicative scan for advertiser-unfriendly terms. Deliberately NOT a verdict —
 * see the honesty note rendered at the bottom. Zero network. */
export const DemonetizationChecker: React.FC = () => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');

  const hits = useMemo(
    () =>
      scanDemonetization({
        title,
        description,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    [title, description, tags]
  );

  const highCount = hits.filter((h) => h.severity === 'high').length;
  const hasInput = Boolean(title || description || tags);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      <Card padding="md" className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-primary" strokeWidth={2} />
          <h3 className="text-sm font-semibold">Cek Kata Berisiko Monetisasi</h3>
        </div>
        <div className="space-y-2.5">
          <div>
            <label className="text-xs text-text-faint">Judul</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tempel judul video"
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div>
            <label className="text-xs text-text-faint">Deskripsi</label>
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tempel deskripsi video"
              className="mt-1 w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div>
            <label className="text-xs text-text-faint">Tag (pisah koma)</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tag1, tag2, tag3"
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <Card
          padding="md"
          className={`flex items-center gap-3 ${
            !hasInput ? '' : highCount > 0 ? 'ring-1 ring-danger/30' : hits.length > 0 ? 'ring-1 ring-warning/30' : 'ring-1 ring-success/30'
          }`}
        >
          {!hasInput ? (
            <>
              <Info className="w-5 h-5 text-text-faint shrink-0" />
              <p className="text-sm text-text-muted">Isi judul/deskripsi/tag untuk mulai memindai.</p>
            </>
          ) : hits.length === 0 ? (
            <>
              <ShieldCheck className="w-5 h-5 text-success shrink-0" />
              <p className="text-sm">
                <span className="font-medium text-success">Bersih dari wordlist.</span> Tidak ada kata
                berisiko yang cocok — tapi ini bukan jaminan (lihat catatan di bawah).
              </p>
            </>
          ) : (
            <>
              <ShieldAlert className="w-5 h-5 text-danger shrink-0" />
              <p className="text-sm">
                <span className="font-semibold tabular-nums">{hits.length}</span> potensi kata berisiko
                {highCount > 0 && (
                  <>
                    {' '}
                    (<span className="font-semibold tabular-nums text-danger">{highCount}</span> tinggi)
                  </>
                )}
                .
              </p>
            </>
          )}
        </Card>

        {hits.length > 0 && (
          <Card padding="md" className="space-y-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Temuan</p>
            <div className="flex flex-wrap gap-2">
              {hits.map((h, i) => (
                <span
                  key={`${h.word}-${h.field}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs animate-slide-up"
                  style={{ animationDelay: `${Math.min(i, 15) * 30}ms` }}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${h.severity === 'high' ? 'bg-danger' : 'bg-warning'}`} />
                  <span className="font-mono">{h.word}</span>
                  <span className="text-text-faint">· {h.category} · {h.field}</span>
                </span>
              ))}
            </div>
          </Card>
        )}

        <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-bg px-4 py-3 text-xs leading-relaxed text-text-muted">
          <Info className="w-4 h-4 shrink-0 translate-y-0.5 text-warning" strokeWidth={2} />
          <p>
            <span className="font-medium text-text">Indikatif, bukan keputusan YouTube.</span> Alat ini
            cuma mencocokkan wordlist umum — konteks (edukasi, dokumenter, musik) sering tetap aman, dan
            YouTube pakai klasifikasi yang jauh lebih rumit. Anggap ini &ldquo;perlu dicek ulang&rdquo;,
            bukan vonis. Ikon monetisasi resmi tetap ada di YouTube Studio.
          </p>
        </div>
      </div>
    </div>
  );
};
