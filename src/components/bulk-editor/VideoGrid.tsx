import React, { useMemo } from 'react';
import type { EditableVideo, PendingEdit } from '@/types';
import { Badge } from '@/components/shared/ui/Badge';
import { Card } from '@/components/shared/ui/Card';
import { Film } from 'lucide-react';
import { scoreVideoSeo } from '@/services/seoScoreService';

interface Props {
  videos: EditableVideo[];
  pendingByVideoId: Map<string, PendingEdit>;
}

/** Small SEO score pill overlaid on each thumbnail — colour keys off the value. Uses the
 * transparent checklist-based score (services/seoScoreService), not a black-box number. */
const ScorePill: React.FC<{ score: number }> = ({ score }) => {
  const tone = score >= 70 ? 'bg-success' : score >= 50 ? 'bg-warning' : 'bg-danger';
  return (
    <span
      className={`absolute top-2 left-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono font-semibold tabular-nums text-white shadow-sm backdrop-blur-sm ${tone}`}
      title={`Skor SEO (checklist): ${score}/100`}
    >
      SEO {score}
    </span>
  );
};

export const VideoGrid: React.FC<Props> = ({ videos, pendingByVideoId }) => {
  // Score reflects the CURRENT (post-pending) metadata so the badge updates live as
  // edits are previewed. Cheap pure computation, memoised on the inputs.
  const scoreByVideoId = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of videos) {
      const pending = pendingByVideoId.get(v.videoId);
      const snapshot = pending
        ? { title: pending.after.title, description: pending.after.description, tags: pending.after.tags, thumbnailUrl: v.thumbnailUrl }
        : v;
      map.set(v.videoId, scoreVideoSeo(snapshot).total);
    }
    return map;
  }, [videos, pendingByVideoId]);

  return (
    <Card padding="none" className="overflow-hidden animate-fade-in">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 bg-surface-raised/60">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-text-faint" strokeWidth={1.75} />
          <h3 className="text-sm font-semibold">Katalog Video</h3>
        </div>
        <span className="text-xs text-text-faint shrink-0 tabular-nums font-mono">
          {videos.length} video dimuat
        </span>
      </div>
      <div className="max-h-[640px] overflow-y-auto custom-scrollbar p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {videos.map((v, i) => {
            const pending = pendingByVideoId.get(v.videoId);
            return (
              <Card
                key={v.videoId}
                interactive
                glow={pending ? 'primary' : 'none'}
                padding="none"
                className={`overflow-hidden animate-slide-up ${pending ? 'ring-1 ring-primary/40' : ''}`}
                style={{ animationDelay: `${Math.min(i, 20) * 30}ms` }}
              >
                <div className="relative aspect-video bg-surface-raised">
                  {v.thumbnailUrl ? (
                    <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="w-5 h-5 text-text-faint" strokeWidth={1.75} />
                    </div>
                  )}
                  <ScorePill score={scoreByVideoId.get(v.videoId) ?? 0} />
                  {pending && (
                    <Badge
                      tone="primary"
                      dot
                      className="absolute top-2 right-2 shadow-sm backdrop-blur-sm bg-surface/90"
                    >
                      Diubah
                    </Badge>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-sm truncate text-text">{pending ? pending.after.title : v.title}</p>
                  <p className="text-xs text-text-faint truncate mt-1 tabular-nums">
                    {v.tags.length} tag &middot; {new Date(v.publishedAt).toLocaleDateString('id-ID')}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </Card>
  );
};
