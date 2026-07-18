import React from 'react';
import { Menu, Zap, Search, KeyRound } from 'lucide-react';
import type { ModuleId, QuotaState } from '@/types';
import { DAILY_UNIT_POOL, SEARCH_LIST_DAILY_CAP } from '@/constants/quotas';
import { MODULES, MODULE_ICONS } from '@/constants/modules';
import { ThemeToggle } from '@/components/shared/ui/ThemeToggle';

interface Props {
  activeModule: ModuleId;
  keyCount: number;
  quota: QuotaState;
  onManageKeys: () => void;
  onOpenMobileNav: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

const Meter: React.FC<{ icon: React.ReactNode; label: string; used: number; cap: number }> = ({
  icon,
  label,
  used,
  cap,
}) => {
  const pct = Math.min(100, Math.round((used / cap) * 100));
  const warn = pct >= 80;
  return (
    <div className="hidden sm:flex items-center gap-2 text-xs" title={`${label}: ${used}/${cap}`}>
      <span className={warn ? 'text-warning' : 'text-text-faint'}>{icon}</span>
      <div className="w-16 md:w-24 h-1.5 rounded-full bg-surface-raised overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-standard ${warn ? 'bg-warning' : 'bg-gradient-to-r from-primary to-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`font-mono tabular-nums ${warn ? 'text-warning' : 'text-text-muted'}`}>
        {used}/{cap}
      </span>
    </div>
  );
};

export const ConnectionStatusBar: React.FC<Props> = ({
  activeModule,
  keyCount,
  quota,
  onManageKeys,
  onOpenMobileNav,
  isDark,
  onToggleTheme,
}) => {
  const mod = MODULES.find((m) => m.id === activeModule);
  const Icon = MODULE_ICONS[activeModule];

  return (
    <div className="h-14 shrink-0 border-b border-border bg-surface/80 backdrop-blur-sm flex items-center justify-between px-4 sm:px-6 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileNav}
          className="lg:hidden shrink-0 w-8 h-8 rounded-md hover:bg-surface-hover flex items-center justify-center text-text-muted"
          aria-label="Buka menu"
        >
          <Menu className="w-4.5 h-4.5" />
        </button>
        <div className="hidden sm:flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 shrink-0 rounded-md bg-gradient-to-br from-primary/15 to-accent/10 flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm font-medium truncate">{mod?.label}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-5">
        <Meter icon={<Zap className="w-3.5 h-3.5" />} label="Kuota harian" used={quota.dataApiUnitsUsed} cap={DAILY_UNIT_POOL} />
        <Meter
          icon={<Search className="w-3.5 h-3.5" />}
          label="search.list"
          used={quota.searchListCallsUsed}
          cap={SEARCH_LIST_DAILY_CAP}
        />
        <button
          onClick={onManageKeys}
          className="flex items-center gap-1.5 text-xs rounded-md border border-border px-2.5 py-1.5 hover:bg-surface-hover hover:border-border-strong transition-all duration-200 ease-standard"
        >
          <KeyRound className="w-3.5 h-3.5 text-text-faint" />
          <span
            className={`w-1.5 h-1.5 rounded-full ${keyCount > 0 ? 'bg-success shadow-[0_0_6px_var(--color-success)]' : 'bg-danger'}`}
          />
          <span className="hidden md:inline">
            {keyCount > 0 ? `${keyCount} API key tersambung` : 'Belum ada API key'}
          </span>
        </button>
        <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
      </div>
    </div>
  );
};
