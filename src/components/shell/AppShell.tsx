import React, { useState } from 'react';
import type { ModuleId, QuotaState } from '@/types';
import { Sidebar } from './Sidebar';
import { ConnectionStatusBar } from './ConnectionStatusBar';

interface Props {
  activeModule: ModuleId;
  onSelectModule: (id: ModuleId) => void;
  keyCount: number;
  quota: QuotaState;
  onManageKeys: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<Props> = ({
  activeModule,
  onSelectModule,
  keyCount,
  quota,
  onManageKeys,
  isDark,
  onToggleTheme,
  children,
}) => {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <div className="h-full flex">
      <Sidebar
        activeModule={activeModule}
        onSelect={onSelectModule}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <ConnectionStatusBar
          activeModule={activeModule}
          keyCount={keyCount}
          quota={quota}
          onManageKeys={onManageKeys}
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
          isDark={isDark}
          onToggleTheme={onToggleTheme}
        />
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
          <div key={activeModule} className="animate-slide-up">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
