import React from 'react';
import { Loader2 } from 'lucide-react';

export const Loader: React.FC<{ label?: string; size?: 'sm' | 'md' }> = ({ label, size = 'md' }) => {
  const dim = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
  return (
    <div className="flex items-center gap-2.5 text-text-muted animate-fade-in">
      <Loader2 className={`${dim} animate-spin text-primary`} />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
};
