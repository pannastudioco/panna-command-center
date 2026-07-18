import React from 'react';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';

interface Props {
  tone?: Tone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
  primary: 'bg-primary/10 text-primary',
  neutral: 'bg-surface-raised text-text-muted',
};

const DOT_CLASSES: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  primary: 'bg-primary',
  neutral: 'bg-text-faint',
};

export const Badge: React.FC<Props> = ({ tone = 'neutral', dot = false, children, className = '' }) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${DOT_CLASSES[tone]}`} />}
      {children}
    </span>
  );
};
