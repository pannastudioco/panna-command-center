import React from 'react';
import type { PendingEdit } from '@/types';
import { QUOTA_COST } from '@/constants/quotas';
import { Button } from '@/components/shared/ui/Button';
import { GitCompareArrows, AlertTriangle, Check, X } from 'lucide-react';

interface Props {
  edits: PendingEdit[];
  excludedVideoIds: Set<string>;
  onToggleExclude: (videoId: string) => void;
  onCommit: () => void;
  onDiscard: () => void;
  isSaving: boolean;
  remainingUnitsToday: number;
}

/** Trims the common prefix/suffix so only the actually-changed middle segment gets
 * colored — a find/replace edit is always localized, so this reads far better than
 * striking through the whole string every time (which is what the field looked like
 * before this fix, and made a 20-tag list impossible to verify by eye). */
function TextDiff({ before, after }: { before: string; after: string }) {
  if (before === after) return null;

  let prefixLen = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (prefixLen < maxPrefix && before[prefixLen] === after[prefixLen]) prefixLen++;

  let suffixLen = 0;
  const maxSuffix = Math.min(before.length, after.length) - prefixLen;
  while (
    suffixLen < maxSuffix &&
    before[before.length - 1 - suffixLen] === after[after.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const prefix = before.slice(0, prefixLen);
  const removed = before.slice(prefixLen, before.length - suffixLen);
  const added = after.slice(prefixLen, after.length - suffixLen);
  const suffix = before.slice(before.length - suffixLen);

  return (
    <span className="text-xs break-words leading-relaxed">
      {prefix && <span className="text-text-muted">{prefix}</span>}
      {removed && (
        <span className="text-danger line-through bg-danger-bg rounded px-0.5 mx-0.5">{removed}</span>
      )}
      {added && <span className="text-success bg-success-bg rounded px-0.5 mx-0.5">{added}</span>}
      {suffix && <span className="text-text-muted">{suffix}</span>}
    </span>
  );
}

/** Tags are a fixed-size array (find/replace edits each tag in place, never adds/removes
 * one) — diff position-by-position and only render the pairs that actually changed. */
function TagsDiff({ before, after }: { before: string[]; after: string[] }) {
  const changedPairs = before
    .map((b, i) => ({ before: b, after: after[i] }))
    .filter((p) => p.before !== p.after);

  if (changedPairs.length === 0) return null;

  return (
    <div className="text-xs flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span className="text-text-faint">
        {changedPairs.length} dari {before.length} tag berubah:
      </span>
      {changedPairs.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-1 mr-1">
          <span className="text-danger line-through bg-danger-bg rounded px-1">{p.before}</span>
          <span className="text-text-faint">→</span>
          <span className="text-success bg-success-bg rounded px-1">{p.after}</span>
        </span>
      ))}
    </div>
  );
}

export const EditDiffPreview: React.FC<Props> = ({
  edits,
  excludedVideoIds,
  onToggleExclude,
  onCommit,
  onDiscard,
  isSaving,
  remainingUnitsToday,
}) => {
  if (edits.length === 0) return null;

  const includedCount = edits.filter((e) => !excludedVideoIds.has(e.videoId)).length;
  const costUnits = includedCount * QUOTA_COST.videosUpdate;
  const exceedsQuota = costUnits > remainingUnitsToday;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 shadow-glow overflow-hidden animate-pop">
      <div className="px-4 py-3 border-b border-primary/20 flex items-start justify-between gap-2 flex-wrap bg-surface/40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <GitCompareArrows className="w-4 h-4 text-primary" strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-tight tabular-nums">
              Pratinjau {edits.length} Perubahan
            </h3>
            <p className="text-[11px] text-text-faint mt-0.5 tabular-nums font-mono">
              {includedCount} akan disimpan &middot; ~{costUnits} unit kuota
            </p>
          </div>
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto custom-scrollbar divide-y divide-border">
        {edits.map((edit, i) => {
          const excluded = excludedVideoIds.has(edit.videoId);
          return (
            <label
              key={edit.videoId}
              className={`px-4 py-2.5 flex gap-3 cursor-pointer transition-all duration-150 ease-standard hover:bg-surface-hover animate-fade-in ${
                excluded ? 'opacity-40' : ''
              }`}
              style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}
            >
              <input
                type="checkbox"
                checked={!excluded}
                onChange={() => onToggleExclude(edit.videoId)}
                className="mt-1 rounded border-border accent-primary w-3.5 h-3.5 shrink-0"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <TextDiff before={edit.before.title} after={edit.after.title} />
                <TextDiff before={edit.before.description} after={edit.after.description} />
                <TagsDiff before={edit.before.tags} after={edit.after.tags} />
              </div>
            </label>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-primary/20 space-y-3 bg-surface/40">
        {exceedsQuota && (
          <div className="flex items-start gap-2 text-xs text-warning bg-warning-bg border border-warning/30 rounded-md px-3 py-2 animate-pop">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Biaya perubahan ini (~{costUnits} unit) melebihi sisa kuota hari ini ({remainingUnitsToday} unit).
              Kurangi jumlah video yang dicentang, atau simpan sisanya besok.
            </span>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            icon={<Check className="w-4 h-4" />}
            loading={isSaving}
            disabled={isSaving || includedCount === 0 || exceedsQuota}
            onClick={onCommit}
            fullWidth
          >
            {isSaving ? 'Menyimpan...' : `Simpan ${includedCount} Perubahan`}
          </Button>
          <Button
            variant="secondary"
            icon={<X className="w-4 h-4" />}
            disabled={isSaving}
            onClick={onDiscard}
            fullWidth
          >
            Batalkan
          </Button>
        </div>
      </div>
    </div>
  );
};
