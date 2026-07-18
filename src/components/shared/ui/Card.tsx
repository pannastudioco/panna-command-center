import React, { useCallback } from 'react';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  padding?: 'sm' | 'md' | 'lg' | 'none';
  /** Cursor-follows radial highlight — reserve for a handful of high-attention
   * cards (a selected competitor, a video tile), not every card on screen. */
  spotlight?: boolean;
  /** Tinted ambient glow shadow on hover instead of a flat black shadow. 'none'
   * (default) keeps the plain elevation shadow from `interactive`. */
  glow?: 'primary' | 'accent' | 'none';
}

const PADDING_CLASSES: Record<NonNullable<Props['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

const GLOW_CLASSES: Record<NonNullable<Props['glow']>, string> = {
  none: '',
  primary: 'hover:shadow-glow',
  accent: 'hover:shadow-glow-accent',
};

/** The one surface-card treatment every module should reuse — keeps corner radius,
 * border, and elevation consistent instead of each screen picking its own. */
export const Card: React.FC<Props> = ({
  interactive = false,
  padding = 'md',
  spotlight = false,
  glow = 'none',
  className = '',
  children,
  onMouseMove,
  ...rest
}) => {
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (spotlight) {
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--x', `${((e.clientX - rect.left) / rect.width) * 100}%`);
        e.currentTarget.style.setProperty('--y', `${((e.clientY - rect.top) / rect.height) * 100}%`);
      }
      onMouseMove?.(e);
    },
    [spotlight, onMouseMove]
  );

  return (
    <div
      onMouseMove={handleMouseMove}
      className={`relative overflow-hidden rounded-lg border border-border bg-surface shadow-xs ${PADDING_CLASSES[padding]} ${
        interactive
          ? `group/card transition-all duration-200 ease-standard hover:border-border-strong hover:shadow-md cursor-pointer ${GLOW_CLASSES[glow]}`
          : ''
      } ${className}`}
      {...rest}
    >
      {spotlight ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
            style={{
              background:
                'radial-gradient(420px circle at var(--x, 50%) var(--y, 50%), color-mix(in oklch, var(--color-primary) 10%, transparent), transparent 70%)',
            }}
          />
          {/* Only wrapped when spotlight is on — the wrapper would otherwise
              swallow flex/grid layout classes callers pass via `className`
              expecting them to apply directly to `children`. */}
          <div className="relative z-10">{children}</div>
        </>
      ) : (
        children
      )}
    </div>
  );
};
