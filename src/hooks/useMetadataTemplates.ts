import { useState, useEffect, useCallback } from 'react';
import type { MetadataTemplate } from '@/types';

const STORAGE_KEY = 'pcc.metadataTemplates';

/** Saved reusable metadata blocks (description footer + tag set) the user can apply to
 * many videos at once — like TubeBuddy's upload defaults, but applied retroactively.
 * Small list, localStorage (matches useApiKeys/useWatchlist). */
export const useMetadataTemplates = () => {
  const [templates, setTemplates] = useState<MetadataTemplate[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as MetadataTemplate[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    } catch (e) {
      console.warn('Failed to persist metadata templates:', e);
    }
  }, [templates]);

  const saveTemplate = useCallback((tpl: Omit<MetadataTemplate, 'id'>) => {
    setTemplates((prev) => [...prev, { ...tpl, id: `tpl-${Date.now()}-${prev.length}` }]);
  }, []);

  const removeTemplate = useCallback((id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { templates, saveTemplate, removeTemplate };
};
