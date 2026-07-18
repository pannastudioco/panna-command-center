import React from 'react';

interface Props {
  className?: string;
}

/** Shimmer placeholder block — sizing is entirely up to the caller via className
 * (e.g. `h-4 w-32`, `h-24 w-full`). Rounded by default to match Card corners. */
export const Skeleton: React.FC<Props> = ({ className = 'h-4 w-full' }) => {
  return <div className={`skeleton rounded-md ${className}`} />;
};

/** Circular placeholder — channel/video thumbnails, avatars. */
export const SkeletonAvatar: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const dim = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-12 h-12' : 'w-10 h-10';
  return <div className={`skeleton rounded-full shrink-0 ${dim}`} />;
};

/** Multi-line paragraph placeholder — the last line is shorter, mimicking how
 * real wrapped text actually ends, instead of a uniform block of bars. */
export const SkeletonText: React.FC<{ lines?: number }> = ({ lines = 2 }) => (
  <div className="space-y-2">
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
    ))}
  </div>
);

export const SkeletonCard: React.FC = () => (
  <div className="rounded-lg border border-border bg-surface p-5 space-y-3">
    <Skeleton className="h-4 w-2/3" />
    <Skeleton className="h-3 w-full" />
    <Skeleton className="h-3 w-5/6" />
  </div>
);

/** Row shape matching a typical "avatar + two lines" list item (watchlist
 * entries, video grid rows) — shows the loading state in the actual geometry
 * the real content will occupy, not a generic gray rectangle. */
export const SkeletonRow: React.FC = () => (
  <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
    <SkeletonAvatar size="sm" />
    <div className="flex-1 min-w-0">
      <SkeletonText lines={2} />
    </div>
  </div>
);
