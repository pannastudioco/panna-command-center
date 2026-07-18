import React, { useState } from 'react';
import { UserPlus, Users2, Eye, Video, Trash2, CheckCircle2 } from 'lucide-react';
import type { WatchedChannel, ChannelStats } from '@/types';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { EmptyState } from '@/components/shared/ui/EmptyState';

interface Props {
  watchlist: WatchedChannel[];
  statsByChannelId: Map<string, ChannelStats>;
  selectedChannelId: string | null;
  isAdding: boolean;
  onAdd: (input: string) => void;
  onRemove: (channelId: string) => void;
  onSelect: (channelId: string) => void;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}rb`;
  return n.toLocaleString('id-ID');
}

export const WatchlistManager: React.FC<Props> = ({
  watchlist,
  statsByChannelId,
  selectedChannelId,
  isAdding,
  onAdd,
  onRemove,
  onSelect,
}) => {
  const [input, setInput] = useState('');

  const handleAdd = () => {
    if (!input.trim()) return;
    onAdd(input.trim());
    setInput('');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="youtube.com/@channelname atau channel ID"
          aria-label="Tambah channel kompetitor"
          className="flex-1 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-text-faint outline-none transition-all duration-150 ease-standard focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <Button
          onClick={handleAdd}
          disabled={isAdding || !input.trim()}
          loading={isAdding}
          icon={<UserPlus className="w-4 h-4" />}
          className="sm:w-auto"
        >
          {isAdding ? 'Menambah...' : 'Tambah'}
        </Button>
      </div>

      {watchlist.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={Users2}
            title="Belum ada channel yang dipantau"
            description="Tempel link atau ID channel kompetitor di kolom di atas untuk mulai memantau."
            tone="primary"
          />
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden divide-y divide-border">
          {watchlist.map((c, i) => {
            const stats = statsByChannelId.get(c.channelId);
            const isSelected = selectedChannelId === c.channelId;
            return (
              <div
                key={c.channelId}
                style={{ animationDelay: `${i * 40}ms`, opacity: 0 }}
                className={`relative flex items-center gap-3 pl-4 pr-2 py-3 transition-all duration-150 ease-standard animate-slide-up ${
                  isSelected ? 'bg-primary/10 ring-1 ring-inset ring-primary/20' : 'hover:bg-surface-hover'
                }`}
              >
                {isSelected && <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-primary shadow-glow" />}
                <button
                  type="button"
                  onClick={() => onSelect(c.channelId)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  {c.thumbnailUrl ? (
                    <img
                      src={c.thumbnailUrl}
                      alt=""
                      className={`w-9 h-9 rounded-full shrink-0 border transition-all duration-150 ease-standard ${
                        isSelected ? 'border-primary/40 ring-2 ring-primary/20' : 'border-border'
                      }`}
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full shrink-0 bg-surface-raised border border-border flex items-center justify-center">
                      <Users2 className="w-4 h-4 text-text-faint" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${isSelected ? 'font-semibold text-primary' : 'font-medium text-text'}`}>
                      {c.title}
                    </p>
                    {stats ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-text-faint tabular-nums font-mono">
                        <span className="inline-flex items-center gap-1">
                          <Users2 className="w-3 h-3 shrink-0" />
                          {stats.subscriberCountHidden ? 'Disembunyikan' : formatCount(stats.subscriberCount)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Eye className="w-3 h-3 shrink-0" />
                          {formatCount(stats.viewCount)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Video className="w-3 h-3 shrink-0" />
                          {stats.videoCount}
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-text-faint mt-0.5">Belum ada data</p>
                    )}
                  </div>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(c.channelId);
                  }}
                  aria-label={`Hapus ${c.title} dari watchlist`}
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md text-text-faint hover:bg-danger-bg hover:text-danger active:scale-90 transition-all duration-150 ease-standard"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
};
