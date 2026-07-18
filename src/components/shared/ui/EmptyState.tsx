import React from 'react';
import type { LucideIcon } from 'lucide-react';

type Tone = 'neutral' | 'primary' | 'danger';

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Lets each empty-state SCENARIO read differently at a glance — a genuinely
   * empty list ('neutral'), an inviting first-run prompt ('primary', gets the
   * brand gradient badge), or a failure state ('danger') — instead of every
   * empty state in the app looking identical regardless of what it means. */
  tone?: Tone;
}

const BADGE_TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-surface-raised border border-border',
  primary: 'bg-gradient-to-br from-primary/15 to-accent/15 border border-primary/20',
  danger: 'bg-danger-bg border border-danger/20',
};

const ICON_TONE_CLASSES: Record<Tone, string> = {
  neutral: 'text-text-faint',
  primary: 'text-primary',
  danger: 'text-danger',
};

/** One consistent "nothing here yet" / "something broke" treatment, reused for
 * empty lists, empty search results, and the ErrorBoundary fallback. */
export const EmptyState: React.FC<Props> = ({ icon: Icon, title, description, action, tone = 'neutral' }) => {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6 animate-fade-in">
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${BADGE_TONE_CLASSES[tone]}`}
      >
        <Icon className={`w-5 h-5 ${ICON_TONE_CLASSES[tone]}`} strokeWidth={1.75} />
      </div>
      <p className="text-sm font-medium text-text">{title}</p>
      {description && <p className="text-xs text-text-muted mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
