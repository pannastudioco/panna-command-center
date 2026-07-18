import React from 'react';
import { X } from 'lucide-react';
import type { ModuleId } from '@/types';
import { MODULES, MODULE_ICONS } from '@/constants/modules';

interface Props {
  activeModule: ModuleId;
  onSelect: (id: ModuleId) => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<Props> = ({ activeModule, onSelect, isMobileOpen, onCloseMobile }) => {
  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-fade-in"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`w-64 shrink-0 border-r border-border bg-surface flex flex-col fixed lg:static inset-y-0 left-0 z-50 transition-transform duration-300 ease-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-4 py-4 border-b border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/favicon.svg" alt="" className="w-9 h-9 shrink-0 rounded-lg shadow-glow" />
            <div className="min-w-0">
              <p className="font-semibold text-[13px] tracking-wide truncate">P A N N A ✪ S T U D I O</p>
              <p className="text-[11px] text-text-faint mt-0.5 truncate">Research and Development</p>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="lg:hidden shrink-0 w-7 h-7 rounded-md hover:bg-surface-hover flex items-center justify-center text-text-faint"
            aria-label="Tutup menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
          {MODULES.map((mod) => {
            const isActive = mod.id === activeModule;
            const Icon = MODULE_ICONS[mod.id];
            return (
              <button
                key={mod.id}
                onClick={() => {
                  if (!mod.available) return;
                  onSelect(mod.id);
                  onCloseMobile();
                }}
                disabled={!mod.available}
                className={`group relative w-full text-left rounded-lg pl-3.5 pr-3 py-2.5 transition-all duration-200 ease-standard ${
                  isActive
                    ? 'bg-gradient-to-r from-primary/12 to-accent/5 text-primary'
                    : mod.available
                      ? 'text-text hover:bg-surface-hover'
                      : 'text-text-faint cursor-not-allowed'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-gradient-to-b from-primary to-accent animate-scale-in" />
                )}
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-primary drop-shadow-[0_0_6px_color-mix(in_oklch,var(--color-primary)_50%,transparent)]' : 'text-text-faint group-hover:text-text-muted'}`}
                    strokeWidth={2}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{mod.label}</span>
                      {!mod.available && (
                        <span className="shrink-0 text-[10px] uppercase tracking-wide rounded-full border border-border px-1.5 py-0.5 text-text-faint">
                          Segera
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-faint mt-0.5 truncate">{mod.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
