import React, { useState } from 'react';
import type { ConnectedChannelInfo } from '@/types';
import { OAuthConnectButton } from './OAuthConnectButton';
import { SkeletonRow } from '@/components/shared/ui/Skeleton';
import { Info, ChevronDown } from 'lucide-react';

interface Props {
  isConnected: boolean;
  isConnecting: boolean;
  authError: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  channelInfo: ConnectedChannelInfo | null;
  isLoadingChannel: boolean;
}

/** Shared by every OAuth-gated module (Bulk Editor, Analytics) so "which channel am I
 * about to act on" is always answered the same way, in the same place. */
export const ChannelConnectionPanel: React.FC<Props> = ({
  isConnected,
  isConnecting,
  authError,
  onConnect,
  onDisconnect,
  channelInfo,
  isLoadingChannel,
}) => {
  const [showSwitchHelp, setShowSwitchHelp] = useState(false);

  return (
    <div className="space-y-3">
      <OAuthConnectButton
        isConnected={isConnected}
        isConnecting={isConnecting}
        error={authError}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
      />

      {isLoadingChannel && (
        <div role="status" aria-label="Membaca info channel yang tersambung...">
          <SkeletonRow />
        </div>
      )}

      {isConnected && channelInfo && (
        <div className="flex items-center gap-3 rounded-lg border border-success/25 bg-surface px-4 py-3 shadow-xs ring-1 ring-success/10 transition-all duration-200 ease-standard hover:shadow-sm animate-slide-up">
          {channelInfo.thumbnailUrl ? (
            <img
              src={channelInfo.thumbnailUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
            />
          ) : (
            <div className="h-10 w-10 shrink-0 rounded-full border border-border bg-surface-raised" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text-faint">Channel yang tersambung sekarang</p>
            <p className="truncate text-sm font-medium text-text">{channelInfo.title}</p>
          </div>
          <button
            onClick={() => setShowSwitchHelp((v) => !v)}
            aria-expanded={showSwitchHelp}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-all duration-150 ease-standard hover:bg-primary/10 active:scale-95"
          >
            Bukan channel ini?
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-150 ease-standard ${showSwitchHelp ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      )}

      {showSwitchHelp && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-bg px-4 py-3 text-sm leading-relaxed text-text-muted animate-slide-up">
          <Info className="w-4 h-4 shrink-0 translate-y-0.5 text-warning" strokeWidth={2} />
          <p>
            Klik &ldquo;Putuskan&rdquo; lalu &ldquo;Sambungkan Akun YouTube&rdquo; lagi — Google akan
            selalu menampilkan pemilih akun setiap kali, termasuk opsi &ldquo;Gunakan akun lain&rdquo;
            kalau channel yang kamu mau login pakai akun Google yang berbeda dari yang tersambung
            sekarang. Kalau channel yang kamu mau ada di bawah akun Google yang belum pernah dipakai
            di app ini, pastikan dulu akun itu juga terdaftar sebagai &ldquo;test user&rdquo; di
            Google Auth Platform &rarr; Audience (sama seperti langkah waktu setup pertama kali) —
            kalau belum, nanti muncul lagi error akses ditolak.
          </p>
        </div>
      )}
    </div>
  );
};
