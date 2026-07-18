import React, { useState } from 'react';
import type { BulkFindReplaceRule, EditableField } from '@/types';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { Search, Replace, SlidersHorizontal } from 'lucide-react';

interface Props {
  onPreview: (rule: BulkFindReplaceRule) => void;
  disabled: boolean;
}

const FIELD_LABELS: Record<EditableField, string> = {
  title: 'Judul',
  description: 'Deskripsi',
  tags: 'Tag',
};

export const BulkFindReplacePanel: React.FC<Props> = ({ onPreview, disabled }) => {
  const [field, setField] = useState<EditableField>('title');
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);

  const handlePreview = () => {
    if (!find.trim()) return;
    onPreview({ field, find, replace, caseSensitive });
  };

  return (
    <Card padding="md" className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <SlidersHorizontal className="w-4 h-4 text-primary" strokeWidth={1.75} />
        </div>
        <div>
          <h3 className="text-sm font-semibold leading-tight">Cari & Ganti Massal</h3>
          <p className="text-[11px] text-text-faint mt-0.5">Berlaku ke semua video yang cocok</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-medium text-text-faint block mb-1.5">Field</label>
          <select
            value={field}
            onChange={(e) => setField(e.target.value as EditableField)}
            aria-label="Field yang diedit"
            className="w-full rounded-md border border-border bg-bg px-2.5 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all duration-150 ease-standard"
          >
            {(Object.keys(FIELD_LABELS) as EditableField[]).map((f) => (
              <option key={f} value={f}>
                {FIELD_LABELS[f]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] font-medium text-text-faint block mb-1.5">Cari</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-text-faint absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Cari teks..."
              aria-label="Teks yang dicari"
              className="w-full rounded-md border border-border bg-bg pl-8 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all duration-150 ease-standard"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-medium text-text-faint block mb-1.5">Ganti dengan</label>
          <div className="relative">
            <Replace className="w-3.5 h-3.5 text-text-faint absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              placeholder="Ganti dengan..."
              aria-label="Teks pengganti"
              className="w-full rounded-md border border-border bg-bg pl-8 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all duration-150 ease-standard"
            />
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none w-fit">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => setCaseSensitive(e.target.checked)}
          className="rounded border-border accent-primary w-3.5 h-3.5"
        />
        Peka huruf besar/kecil
      </label>

      <Button variant="primary" fullWidth onClick={handlePreview} disabled={disabled || !find.trim()}>
        Pratinjau Perubahan
      </Button>
    </Card>
  );
};
