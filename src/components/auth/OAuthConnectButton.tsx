import React from 'react';
import { SquarePlay, CircleX, AlertCircle } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';

interface Props {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const OAuthConnectButton: React.FC<Props> = ({
  isConnected,
  isConnecting,
  error,
  onConnect,
  onDisconnect,
}) => {
  if (isConnected) {
    return (
      <div className="flex flex-wrap items-center gap-3 animate-pop">
        <Badge tone="success" dot>
          Akun YouTube tersambung
        </Badge>
        <button
          onClick={onDisconnect}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-text-faint transition-all duration-150 ease-standard hover:bg-danger-bg hover:text-danger active:scale-95"
        >
          <CircleX className="w-3.5 h-3.5" />
          Putuskan
        </button>
      </div>
    );
  }

  return (
    <div>
      <Button onClick={onConnect} disabled={isConnecting} loading={isConnecting} icon={<SquarePlay className="w-4 h-4" />}>
        {isConnecting ? 'Menyambungkan...' : 'Sambungkan Akun YouTube'}
      </Button>
      {error && (
        <div className="mt-2.5 flex items-start gap-2 rounded-md border border-danger/20 bg-danger-bg px-3 py-2 text-xs leading-relaxed text-danger animate-slide-up">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 translate-y-px" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
