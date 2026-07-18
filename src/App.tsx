import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import type { ModuleId } from '@/types';
import { useApiKeys } from '@/hooks/useApiKeys';
import { useQuotaTracker } from '@/hooks/useQuotaTracker';
import { useSessionPersistence } from '@/hooks/useSessionPersistence';
import { useYoutubeAuth } from '@/hooks/useYoutubeAuth';
import { useConnectedChannel } from '@/hooks/useConnectedChannel';
import { useOwnVideoCatalog } from '@/hooks/useOwnVideoCatalog';
import { useChannelAudit } from '@/hooks/useChannelAudit';
import { usePlaylistManager } from '@/hooks/usePlaylistManager';
import { AppShell } from '@/components/shell/AppShell';
import { AuthenticationHub } from '@/components/auth/AuthenticationHub';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Loader } from '@/components/shared/Loader';
import { MODULES, MODULE_ICONS } from '@/constants/modules';

// Lazy-loaded per module: only one module is ever visible at a time (the sidebar
// is a switcher, not a router), so there's no reason to ship recharts (pulled in by
// Analytics + Competitors) inside the bundle for someone who only ever uses
// Keyword Research. Cuts the initial JS payload roughly in half.
const KeywordExplorer = lazy(() =>
  import('@/components/keyword-research/KeywordExplorer').then((m) => ({ default: m.KeywordExplorer }))
);
const BulkEditor = lazy(() =>
  import('@/components/bulk-editor/BulkEditor').then((m) => ({ default: m.BulkEditor }))
);
const AnalyticsDashboard = lazy(() =>
  import('@/components/analytics/AnalyticsDashboard').then((m) => ({ default: m.AnalyticsDashboard }))
);
const CompetitorTracker = lazy(() =>
  import('@/components/competitors/CompetitorTracker').then((m) => ({ default: m.CompetitorTracker }))
);
const ChannelAudit = lazy(() =>
  import('@/components/channel-audit/ChannelAudit').then((m) => ({ default: m.ChannelAudit }))
);
const PlaylistManager = lazy(() =>
  import('@/components/playlists/PlaylistManager').then((m) => ({ default: m.PlaylistManager }))
);
const AiStudio = lazy(() => import('@/components/ai-studio/AiStudio').then((m) => ({ default: m.AiStudio })));
const Toolbox = lazy(() => import('@/components/toolbox/Toolbox').then((m) => ({ default: m.Toolbox })));
const ContentPipeline = lazy(() =>
  import('@/components/content-pipeline/ContentPipeline').then((m) => ({ default: m.ContentPipeline }))
);

function App() {
  const { youtubeApiKeys, youtubeApiKeyIndex, setYoutubeApiKeyIndex, handleKeysSubmitted, removeKey } =
    useApiKeys();
  const { quota, refreshIfNewDay, recordUnits, recordSearchListCall } = useQuotaTracker();
  const { saveSession, loadSession } = useSessionPersistence();

  // Shared across every OAuth-gated module (Bulk Editor, Analytics) — one connection,
  // not a separate reconnect per module.
  const youtubeAuth = useYoutubeAuth();
  const connectedChannel = useConnectedChannel(youtubeAuth.isConnected, youtubeAuth.accessToken, recordUnits);

  // App-level shared caches — all loaded ONCE and reused by every module that needs them,
  // so switching tabs never re-fetches or re-spends quota:
  //  • catalog       → "my videos" (Bulk Editor, Channel Audit, Playlist, AI Studio, Toolbox, Analytics)
  //  • channelAudit  → the Analytics pull for the Channel Audit tab
  //  • playlistState → the playlist list + each opened playlist's items
  const catalog = useOwnVideoCatalog(youtubeAuth, connectedChannel, recordUnits);
  const channelAudit = useChannelAudit(youtubeAuth, connectedChannel, recordUnits, catalog);
  const playlistState = usePlaylistManager(youtubeAuth, recordUnits);

  // When the channel connection drops (or the user switches accounts), the loaded caches
  // belong to the old channel — clear all of them so the next module reloads the right one.
  const channelId = connectedChannel.channelInfo?.channelId ?? null;
  const prevChannelIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevChannelIdRef.current !== null && prevChannelIdRef.current !== channelId) {
      catalog.reset();
      channelAudit.reset();
      playlistState.reset();
    }
    prevChannelIdRef.current = channelId;
  }, [channelId, catalog, channelAudit, playlistState]);

  const [activeModule, setActiveModule] = useState<ModuleId>('keyword-research');
  const [showKeyManager, setShowKeyManager] = useState(false);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      setActiveModule(saved.activeModule);
      setIsDark(saved.theme === 'dark');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => {
    saveSession({ activeModule, theme: isDark ? 'dark' : 'light' });
  }, [activeModule, isDark, saveSession]);

  const handleToggleTheme = useCallback(() => setIsDark((d) => !d), []);

  useEffect(() => {
    const interval = setInterval(refreshIfNewDay, 60_000);
    return () => clearInterval(interval);
  }, [refreshIfNewDay]);

  const handleSelectModule = useCallback((id: ModuleId) => setActiveModule(id), []);

  const hasKeys = youtubeApiKeys.length > 0;

  if (!hasKeys) {
    return (
      <div className="h-full flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        <div className="lg:w-[44%] shrink-0 flex items-center px-8 sm:px-12 py-10 lg:py-0 relative overflow-hidden bg-bg bg-aurora bg-grain">
          <div className="relative max-w-md mx-auto lg:mx-0 animate-fade-in">
            <div className="flex items-center gap-3 mb-7">
              <img src="/favicon.svg" alt="" className="w-11 h-11 rounded-xl shadow-glow" />
              <div>
                <p className="font-semibold tracking-wide">P A N N A ✪ S T U D I O</p>
                <p className="text-xs text-text-faint mt-0.5">Research and Development</p>
              </div>
            </div>
            <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight leading-tight">
              Satu dashboard buat semua riset &amp; operasional YouTube kamu.
            </h1>
            <p className="mt-3 text-sm text-text-muted leading-relaxed">
              Jalan langsung dari browser kamu — data dan API key tersimpan lokal, nggak pernah
              lewat server kami.
            </p>
            <ul className="mt-8 space-y-3.5">
              {MODULES.map((mod) => {
                const Icon = MODULE_ICONS[mod.id];
                return (
                  <li key={mod.id} className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-primary/15 to-accent/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" strokeWidth={2} />
                    </div>
                    <span className="text-text-muted">{mod.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center px-6 py-10 lg:py-6 bg-surface border-t lg:border-t-0 lg:border-l border-border">
          <AuthenticationHub
            existingKeys={youtubeApiKeys}
            onKeysSubmitted={handleKeysSubmitted}
            onRemoveKey={removeKey}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <AppShell
        activeModule={activeModule}
        onSelectModule={handleSelectModule}
        keyCount={youtubeApiKeys.length}
        quota={quota}
        onManageKeys={() => setShowKeyManager(true)}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
      >
        <ErrorBoundary key={activeModule}>
          <Suspense fallback={<Loader label="Memuat modul..." />}>
            {activeModule === 'keyword-research' && (
              <KeywordExplorer
                youtubeApiKeys={youtubeApiKeys}
                youtubeApiKeyIndex={youtubeApiKeyIndex}
                setYoutubeApiKeyIndex={setYoutubeApiKeyIndex}
                quota={quota}
                recordUnits={recordUnits}
                recordSearchListCall={recordSearchListCall}
              />
            )}
            {activeModule === 'bulk-editor' && (
              <BulkEditor quota={quota} recordUnits={recordUnits} auth={youtubeAuth} channel={connectedChannel} catalog={catalog} />
            )}
            {activeModule === 'analytics' && (
              <AnalyticsDashboard
                quota={quota}
                recordUnits={recordUnits}
                auth={youtubeAuth}
                channel={connectedChannel}
                catalog={catalog}
              />
            )}
            {activeModule === 'channel-audit' && (
              <ChannelAudit auth={youtubeAuth} channel={connectedChannel} audit={channelAudit} />
            )}
            {activeModule === 'playlists' && (
              <PlaylistManager quota={quota} auth={youtubeAuth} channel={connectedChannel} catalog={catalog} playlistState={playlistState} />
            )}
            {activeModule === 'ai-studio' && (
              <AiStudio quota={quota} recordUnits={recordUnits} auth={youtubeAuth} channel={connectedChannel} catalog={catalog} />
            )}
            {activeModule === 'competitors' && (
              <CompetitorTracker
                youtubeApiKeys={youtubeApiKeys}
                youtubeApiKeyIndex={youtubeApiKeyIndex}
                setYoutubeApiKeyIndex={setYoutubeApiKeyIndex}
                quota={quota}
                recordUnits={recordUnits}
              />
            )}
            {activeModule === 'toolbox' && (
              <Toolbox
                quota={quota}
                recordUnits={recordUnits}
                auth={youtubeAuth}
                channel={connectedChannel}
                catalog={catalog}
                youtubeApiKeys={youtubeApiKeys}
                youtubeApiKeyIndex={youtubeApiKeyIndex}
                setYoutubeApiKeyIndex={setYoutubeApiKeyIndex}
                recordSearchListCall={recordSearchListCall}
              />
            )}
            {activeModule === 'content-pipeline' && <ContentPipeline />}
          </Suspense>
        </ErrorBoundary>
      </AppShell>

      {showKeyManager && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-6 animate-fade-in">
          <div className="bg-surface rounded-xl border border-border shadow-lg p-6 max-h-[85vh] overflow-y-auto custom-scrollbar animate-scale-in">
            <AuthenticationHub
              existingKeys={youtubeApiKeys}
              onKeysSubmitted={handleKeysSubmitted}
              onRemoveKey={removeKey}
              onClose={() => setShowKeyManager(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

export default App;
