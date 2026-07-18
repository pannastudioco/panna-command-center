import React, { useState, useCallback, useEffect } from 'react';
import type { ValidatedKey, KeyStatus } from '@/types';
import { validateYoutubeApiKey } from '@/services/validationService';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Card } from '@/components/shared/ui/Card';
import { EmptyState } from '@/components/shared/ui/EmptyState';
import { KeyRound, Plus, CheckCircle2, XCircle, Loader2, X, ShieldCheck } from 'lucide-react';

interface Props {
  existingKeys: string[];
  onKeysSubmitted: (keys: { youtubeKeys: string[] }) => void;
  onRemoveKey: (key: string) => void;
  onClose?: () => void;
}

const STATUS_STYLES: Record<KeyStatus, { icon: React.ElementType; className: string }> = {
  validating: { icon: Loader2, className: 'text-text-faint animate-spin' },
  valid: { icon: CheckCircle2, className: 'text-success' },
  invalid: { icon: XCircle, className: 'text-danger' },
};

const KeyRow: React.FC<{ item: ValidatedKey; onRemove: () => void; index?: number }> = ({
  item,
  onRemove,
  index = 0,
}) => {
  const { icon: StatusIcon, className: statusClass } = STATUS_STYLES[item.status];
  const accentBorder =
    item.status === 'valid'
      ? 'border-success/25'
      : item.status === 'invalid'
        ? 'border-danger/25'
        : 'border-border';
  return (
    <div
      className={`group rounded-lg border ${accentBorder} bg-surface px-3 py-2.5 shadow-xs transition-all duration-150 ease-standard hover:border-border-strong hover:bg-surface-hover hover:shadow-sm animate-slide-up`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <StatusIcon className={`w-4 h-4 shrink-0 ${statusClass}`} strokeWidth={2} />
          <p className="truncate font-mono text-xs text-text-muted" title={item.key}>
            {item.key.slice(0, 8)}...{item.key.slice(-4)}
          </p>
        </div>
        <button
          onClick={onRemove}
          aria-label={`Hapus key ${item.key.slice(0, 8)}...`}
          className="shrink-0 rounded-md p-2 text-text-faint transition-all duration-150 ease-standard hover:bg-danger-bg hover:text-danger active:scale-90"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {item.status === 'invalid' && item.error && (
        <p className="mt-1.5 pl-6 text-xs text-danger">{item.error}</p>
      )}
    </div>
  );
};

export const AuthenticationHub: React.FC<Props> = ({ existingKeys, onKeysSubmitted, onRemoveKey, onClose }) => {
  const [pendingKeys, setPendingKeys] = useState<ValidatedKey[]>([]);
  const [input, setInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const validateAndSubmit = useCallback(async () => {
    setIsValidating(true);
    const existingSet = new Set(existingKeys);
    const rawKeys = input
      .split(/[\n, ]+/)
      .map((k) => k.trim())
      .filter((k) => k && !existingSet.has(k));
    const uniqueKeys = [...new Set(rawKeys)];

    if (uniqueKeys.length === 0) {
      setIsValidating(false);
      return;
    }

    const items = uniqueKeys.map((key) => ({ id: `key-${Math.random()}`, key, status: 'validating' as const }));
    setPendingKeys((prev) => [...prev, ...items]);
    setInput('');

    await Promise.all(
      items.map(async (item) => {
        try {
          await validateYoutubeApiKey(item.key);
          setPendingKeys((prev) => prev.map((k) => (k.id === item.id ? { ...k, status: 'valid' } : k)));
        } catch (e) {
          const error = e instanceof Error ? e.message : 'Validasi gagal.';
          setPendingKeys((prev) => prev.map((k) => (k.id === item.id ? { ...k, status: 'invalid', error } : k)));
        }
      })
    );
    setIsValidating(false);
  }, [input, existingKeys]);

  useEffect(() => {
    const validKeys = pendingKeys.filter((k) => k.status === 'valid').map((k) => k.key);
    if (validKeys.length > 0) {
      onKeysSubmitted({ youtubeKeys: validKeys });
    }
  }, [pendingKeys, onKeysSubmitted]);

  const handleRemovePending = (id: string) => {
    setPendingKeys((prev) => prev.filter((k) => k.id !== id));
  };

  /** Must also purge the key from local pendingKeys, not just the persisted pool —
   * otherwise the useEffect above recomputes validKeys from pendingKeys (which still
   * holds this key at status 'valid') the next time ANY other key is validated in the
   * same session, silently resubmitting the just-deleted key back into the pool. */
  const handleRemoveExisting = useCallback(
    (key: string) => {
      onRemoveKey(key);
      setPendingKeys((prev) => prev.filter((k) => k.key !== key));
    },
    [onRemoveKey]
  );

  const visiblePendingKeys = pendingKeys.filter((k) => k.status !== 'valid');
  const hasList = existingKeys.length > 0 || pendingKeys.length > 0;

  /** Purely presentational: one combined, indexed list so both existing and
   * pending rows share a single stagger sequence when rendered. Does not
   * change what triggers onRemoveKey / handleRemovePending. */
  const rows = [
    ...existingKeys.map((key) => ({
      rowKey: key,
      item: { id: key, key, status: 'valid' as const },
      onRemove: () => handleRemoveExisting(key),
    })),
    ...visiblePendingKeys.map((k) => ({
      rowKey: k.id,
      item: k,
      onRemove: () => handleRemovePending(k.id),
    })),
  ];

  return (
    <div className="w-full max-w-3xl mx-auto animate-fade-in">
      <div className="mb-6 flex items-start gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-accent/15 ring-1 ring-primary/20 shadow-xs animate-pop">
          <KeyRound className="w-5 h-5 text-primary" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-text">API Key YouTube Data v3</h2>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            Tempel satu atau beberapa API key (pisah baris baru atau koma). Key divalidasi langsung dan
            disimpan di browser kamu, bukan di server kami — tapi tetap terkirim ke Google di setiap
            panggilan API, seperti cara kerja API key pada umumnya.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-3">
          <textarea
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="AIzaSy..."
            aria-label="Tempel API key YouTube"
            className="w-full resize-none rounded-lg border border-border bg-bg px-3.5 py-2.5 text-sm font-mono text-text placeholder:text-text-faint outline-none transition-all duration-150 ease-standard focus:border-primary focus:ring-2 focus:ring-primary/15 focus:shadow-glow"
          />
          <Button
            onClick={validateAndSubmit}
            disabled={isValidating || !input.trim()}
            loading={isValidating}
            icon={<Plus className="w-4 h-4" />}
          >
            {isValidating ? 'Memvalidasi...' : 'Validasi & Tambahkan'}
          </Button>
        </div>

        {hasList ? (
          <Card padding="sm">
            <div className="mb-2.5 flex items-center gap-2 px-1 pt-1">
              <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Key Tersimpan</p>
              <Badge tone="neutral">
                <span className="tabular-nums font-mono">{existingKeys.length}</span>
              </Badge>
            </div>
            <div className="max-h-[360px] space-y-1.5 overflow-y-auto custom-scrollbar px-1 pb-1">
              {rows.map((row, i) => (
                <KeyRow key={row.rowKey} item={row.item} onRemove={row.onRemove} index={i} />
              ))}
            </div>
          </Card>
        ) : (
          <Card padding="none" className="flex items-center justify-center">
            <EmptyState
              icon={ShieldCheck}
              title="Belum ada key tersimpan"
              description="Tempel API key di sebelah kiri — begitu tervalidasi, key otomatis muncul di sini dan siap dipakai."
              tone="neutral"
            />
          </Card>
        )}
      </div>

      {onClose && existingKeys.length > 0 && (
        <Button variant="secondary" fullWidth onClick={onClose} className="mt-7">
          Selesai
        </Button>
      )}
    </div>
  );
};
