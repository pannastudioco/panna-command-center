import { useState, useCallback } from 'react';
import type { QuotaState } from '@/types';
import { DAILY_UNIT_POOL, SEARCH_LIST_DAILY_CAP } from '@/constants/quotas';

const STORAGE_KEY = 'pcc.quotaState';

/** YouTube's quota resets at midnight Pacific Time, not UTC — match that boundary. */
const getCurrentResetDay = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());

const loadState = (): QuotaState => {
  const resetDay = getCurrentResetDay();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as QuotaState;
      if (parsed.resetDay === resetDay) return parsed;
    }
  } catch {
    // fall through to fresh state
  }
  return { resetDay, dataApiUnitsUsed: 0, searchListCallsUsed: 0 };
};

const persist = (state: QuotaState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to persist quota state:', e);
  }
};

/** Client-tracked estimate of today's YouTube Data API usage — for the UI budget meter only, not authoritative. */
export const useQuotaTracker = () => {
  const [quota, setQuota] = useState<QuotaState>(loadState);

  const refreshIfNewDay = useCallback(() => {
    const resetDay = getCurrentResetDay();
    setQuota((prev) => {
      if (prev.resetDay === resetDay) return prev;
      const fresh = { resetDay, dataApiUnitsUsed: 0, searchListCallsUsed: 0 };
      persist(fresh);
      return fresh;
    });
  }, []);

  const recordUnits = useCallback((units: number) => {
    setQuota((prev) => {
      const resetDay = getCurrentResetDay();
      const base = prev.resetDay === resetDay ? prev : { resetDay, dataApiUnitsUsed: 0, searchListCallsUsed: 0 };
      const next = { ...base, dataApiUnitsUsed: base.dataApiUnitsUsed + units };
      persist(next);
      return next;
    });
  }, []);

  const recordSearchListCall = useCallback(() => {
    setQuota((prev) => {
      const resetDay = getCurrentResetDay();
      const base = prev.resetDay === resetDay ? prev : { resetDay, dataApiUnitsUsed: 0, searchListCallsUsed: 0 };
      const next = { ...base, searchListCallsUsed: base.searchListCallsUsed + 1 };
      persist(next);
      return next;
    });
  }, []);

  return {
    quota,
    refreshIfNewDay,
    recordUnits,
    recordSearchListCall,
    dailyUnitPool: DAILY_UNIT_POOL,
    searchListDailyCap: SEARCH_LIST_DAILY_CAP,
  };
};
