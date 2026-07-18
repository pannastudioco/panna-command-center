import React from 'react';

interface Props {
  /** 0-100 */
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}

/** Circular 0-100 score gauge. Colour keys off the value (green/amber/red) using the
 * app's semantic tokens so it reads correctly in both themes. Reused by SEO score,
 * keyword score, and anywhere a 0-100 needs a compact visual. */
export const ScoreRing: React.FC<Props> = ({
  score,
  size = 56,
  strokeWidth = 5,
  label,
  className = '',
}) => {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const color = clamped >= 70 ? 'var(--color-success)' : clamped >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-surface-raised)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s var(--ease-standard)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-semibold tabular-nums leading-none" style={{ fontSize: size * 0.28 }}>
          {clamped}
        </span>
        {label && <span className="text-[9px] text-text-faint mt-0.5 uppercase tracking-wide">{label}</span>}
      </div>
    </div>
  );
};
