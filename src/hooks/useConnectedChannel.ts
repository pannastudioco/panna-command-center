import { useState, useEffect } from 'react';
import type { ConnectedChannelInfo } from '@/types';
import { getMyChannelInfo } from '@/services/youtubeDataService';
import { QUOTA_COST } from '@/constants/quotas';

/**
 * Shared across every OAuth-gated module (Bulk Editor, Analytics, ...): resolves and
 * displays WHICH channel the current OAuth grant points to. Extracted out of BulkEditor
 * so Fase 3 doesn't have to duplicate this fetch-and-display logic.
 */
export const useConnectedChannel = (
  isConnected: boolean,
  accessToken: string | null,
  recordUnits: (units: number) => void
) => {
  const [channelInfo, setChannelInfo] = useState<ConnectedChannelInfo | null>(null);
  const [isLoadingChannel, setIsLoadingChannel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Stale-response guard: if isConnected/accessToken changes again before this
    // request settles (e.g. rapid disconnect + reconnect to a different Google
    // account), an in-flight response for the OLD token must not overwrite state
    // set by the newer request. Without this, whichever request happens to resolve
    // last wins regardless of which one is actually current.
    let ignore = false;

    if (!isConnected || !accessToken) {
      setChannelInfo(null);
      return;
    }
    setIsLoadingChannel(true);
    setError(null);
    getMyChannelInfo(accessToken)
      .then((info) => {
        if (ignore) return;
        recordUnits(QUOTA_COST.channelsList);
        setChannelInfo(info);
      })
      .catch((e) => {
        if (ignore) return;
        setError(e instanceof Error ? e.message : 'Gagal membaca info channel.');
      })
      .finally(() => {
        if (!ignore) setIsLoadingChannel(false);
      });

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, accessToken]);

  return { channelInfo, isLoadingChannel, error };
};
