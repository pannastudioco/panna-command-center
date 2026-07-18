import { useState, useCallback, useRef, useEffect } from 'react';
import { OAUTH_SCOPES } from '@/constants/scopes';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

interface TokenState {
  accessToken: string;
  expiresAt: number; // epoch ms
}

/**
 * Google Identity Services token client wrapper. Deliberately in-memory only
 * (never localStorage) — tokens last ~1hr with no refresh token, so persisting them
 * across reloads buys nothing and just adds a place for a stale/dead token to leak.
 *
 * MUST be called from a user gesture (button click) — GIS token requests made
 * without one are unreliable across browsers (popup-blocked). This is why the
 * previous (broken) Reality Architect scaffold never actually worked even once the
 * missing GSI script tag is fixed: there's no way to skip the "Connect" click.
 */
export const useYoutubeAuth = () => {
  const [token, setToken] = useState<TokenState | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenClientRef = useRef<ReturnType<NonNullable<Window['google']>['accounts']['oauth2']['initTokenClient']> | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined;

  const scheduleExpiry = useCallback((expiresInSeconds: number) => {
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    expiryTimerRef.current = setTimeout(() => {
      setToken(null);
    }, expiresInSeconds * 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
      if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    };
  }, []);

  const connect = useCallback(() => {
    if (!clientId) {
      setError('VITE_GOOGLE_OAUTH_CLIENT_ID belum diset di .env.local.');
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      setError('Google Identity Services belum dimuat. Coba reload halaman.');
      return;
    }

    setError(null);
    setIsConnecting(true);

    if (!tokenClientRef.current) {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: OAUTH_SCOPES,
        callback: (response) => {
          // Clear the stuck-button timeout first — a real callback firing (success
          // or error) always means the request settled, so the fallback is moot.
          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
          }
          setIsConnecting(false);
          if (response.error || !response.access_token) {
            setError(response.error || 'Gagal mendapatkan akses. Coba lagi.');
            return;
          }
          const expiresInSeconds = response.expires_in ?? 3600;
          setToken({ accessToken: response.access_token, expiresAt: Date.now() + expiresInSeconds * 1000 });
          scheduleExpiry(expiresInSeconds);
        },
      });
    }

    // Always force Google's account chooser (prompt: 'select_account') instead of
    // silently reusing whatever Google session is already active in the browser.
    // Kharis manages content across multiple separate Google accounts (not just
    // multiple Brand Account channels under one login), so every "Connect" click
    // needs to let him pick — including "Use another account" for a login that
    // isn't signed in yet at all.
    tokenClientRef.current.requestAccessToken({ prompt: 'select_account' });

    // Fallback for a documented GIS behavior: if the browser silently blocks the
    // popup, the callback above can simply never fire (no success, no error) —
    // confirmed happening in this project's own testing. Without this timeout,
    // isConnecting stays true forever and the Connect button is permanently
    // disabled until a full page reload.
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    connectTimeoutRef.current = setTimeout(() => {
      connectTimeoutRef.current = null;
      setIsConnecting(false);
      setError('Nggak ada respons dari Google — kemungkinan popup-nya diblokir browser. Coba klik "Sambungkan" lagi.');
    }, 20_000);
  }, [clientId, scheduleExpiry]);

  const disconnect = useCallback(() => {
    if (token && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(token.accessToken, () => {});
    }
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    setToken(null);
  }, [token]);

  return {
    accessToken: token?.accessToken ?? null,
    isConnected: !!token,
    isConnecting,
    error,
    connect,
    disconnect,
  };
};
