import React, { useState, useCallback, useEffect } from 'react';
import { Users2, RefreshCw, AlertCircle, TrendingUp } from 'lucide-react';
import type { ChannelStats, ChannelSnapshot, QuotaState } from '@/types';
import { resolveChannel, getChannelStats } from '@/services/youtubeDataService';
import { executeApiCallWithRotation } from '@/services/apiExecutor';
import { QUOTA_COST } from '@/constants/quotas';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useCompetitorSnapshots } from '@/hooks/useCompetitorSnapshots';
import { Loader } from '@/components/shared/Loader';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Card } from '@/components/shared/ui/Card';
import { HelpPanel } from '@/components/shared/ui/HelpPanel';
import { StrategyPanel, Example, Sample, Why } from '@/components/shared/ui/StrategyPanel';
import { EmptyState } from '@/components/shared/ui/EmptyState';
import { WatchlistManager } from './WatchlistManager';
import { CompetitorTrendChart } from './CompetitorTrendChart';
import { TrendLinkOut } from './TrendLinkOut';

interface Props {
  youtubeApiKeys: string[];
  youtubeApiKeyIndex: number;
  setYoutubeApiKeyIndex: (idx: number) => void;
  quota: QuotaState;
  recordUnits: (units: number) => void;
}

export const CompetitorTracker: React.FC<Props> = ({
  youtubeApiKeys,
  youtubeApiKeyIndex,
  setYoutubeApiKeyIndex,
  recordUnits,
}) => {
  const { watchlist, addChannel, removeChannel } = useWatchlist();
  const { recordSnapshotIfNew, getHistory } = useCompetitorSnapshots();

  const [statsByChannelId, setStatsByChannelId] = useState<Map<string, ChannelStats>>(new Map());
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [history, setHistory] = useState<ChannelSnapshot[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyStatsAndSnapshot = useCallback(
    async (statsList: ChannelStats[]) => {
      setStatsByChannelId((prev) => {
        const next = new Map(prev);
        for (const s of statsList) next.set(s.channelId, s);
        return next;
      });
      await Promise.all(statsList.map((s) => recordSnapshotIfNew(s)));
    },
    [recordSnapshotIfNew]
  );

  const handleAdd = useCallback(
    async (input: string) => {
      if (youtubeApiKeys.length === 0) {
        setError('Tambahkan minimal 1 API key YouTube dulu (klik status di kanan atas).');
        return;
      }
      setError(null);
      setIsAdding(true);
      try {
        const { result: stats, nextKeyIndex } = await executeApiCallWithRotation(
          (key) => resolveChannel(input, key),
          youtubeApiKeys,
          youtubeApiKeyIndex,
          'youtube-channels'
        );
        recordUnits(QUOTA_COST.channelsList);
        setYoutubeApiKeyIndex(nextKeyIndex);

        addChannel({
          channelId: stats.channelId,
          title: stats.title,
          thumbnailUrl: stats.thumbnailUrl,
          addedAt: new Date().toISOString(),
        });
        await applyStatsAndSnapshot([stats]);
        setSelectedChannelId(stats.channelId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal menambahkan channel.');
      } finally {
        setIsAdding(false);
      }
    },
    [youtubeApiKeys, youtubeApiKeyIndex, setYoutubeApiKeyIndex, recordUnits, addChannel, applyStatsAndSnapshot]
  );

  const handleRefreshAll = useCallback(async () => {
    if (watchlist.length === 0) return;
    if (youtubeApiKeys.length === 0) {
      setError('Tambahkan minimal 1 API key YouTube dulu (klik status di kanan atas).');
      return;
    }
    setError(null);
    setIsRefreshing(true);
    try {
      const channelIds = watchlist.map((c) => c.channelId);
      const { result: statsList, nextKeyIndex } = await executeApiCallWithRotation(
        (key) => getChannelStats(channelIds, key),
        youtubeApiKeys,
        youtubeApiKeyIndex,
        'youtube-channels'
      );
      recordUnits(Math.ceil(channelIds.length / 50) * QUOTA_COST.channelsList);
      setYoutubeApiKeyIndex(nextKeyIndex);
      await applyStatsAndSnapshot(statsList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal me-refresh statistik channel.');
    } finally {
      setIsRefreshing(false);
    }
  }, [watchlist, youtubeApiKeys, youtubeApiKeyIndex, setYoutubeApiKeyIndex, recordUnits, applyStatsAndSnapshot]);

  const handleRemove = useCallback(
    (channelId: string) => {
      removeChannel(channelId);
      if (selectedChannelId === channelId) setSelectedChannelId(null);
    },
    [removeChannel, selectedChannelId]
  );

  const handleSelect = useCallback((channelId: string) => {
    setSelectedChannelId(channelId);
  }, []);

  useEffect(() => {
    if (!selectedChannelId) {
      setHistory([]);
      return;
    }
    let ignore = false;
    getHistory(selectedChannelId).then((h) => {
      if (!ignore) setHistory(h);
    });
    return () => {
      ignore = true;
    };
  }, [selectedChannelId, getHistory]);

  // On mount, seed statsByChannelId from each watched channel's most recent LOCAL
  // snapshot (IndexedDB read only — zero API calls, zero quota) so numbers appear
  // immediately after a reload instead of showing blank until "Refresh Semua" is
  // clicked. Intentionally runs once against the watchlist's initial (synchronously
  // localStorage-loaded) value, not on every watchlist change — a freshly-added
  // channel already gets its stats set directly by applyStatsAndSnapshot.
  useEffect(() => {
    let ignore = false;
    (async () => {
      const entries = await Promise.all(
        watchlist.map(async (c) => {
          const h = await getHistory(c.channelId);
          const latest = h[h.length - 1];
          if (!latest) return null;
          const stats: ChannelStats = {
            channelId: c.channelId,
            title: c.title,
            thumbnailUrl: c.thumbnailUrl,
            subscriberCount: latest.subscriberCount,
            subscriberCountHidden: false,
            viewCount: latest.viewCount,
            videoCount: latest.videoCount,
          };
          return stats;
        })
      );
      if (ignore) return;
      const fresh = entries.filter((e): e is ChannelStats => e !== null);
      if (fresh.length > 0) {
        setStatsByChannelId((prev) => {
          const next = new Map(prev);
          for (const s of fresh) if (!next.has(s.channelId)) next.set(s.channelId, s);
          return next;
        });
      }
    })();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedChannel = watchlist.find((c) => c.channelId === selectedChannelId) ?? null;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="relative overflow-hidden rounded-xl border border-border bg-aurora bg-grain p-5">
        <div className="relative z-[2] flex items-start gap-3">
          <div className="w-11 h-11 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0 shadow-glow">
            <Users2 className="w-5 h-5 text-primary" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-gradient-brand">Competitor &amp; Trend</h1>
              <Badge tone="success" dot>~1 unit / refresh</Badge>
            </div>
            <p className="text-sm text-text-muted mt-1 max-w-2xl">
              Pantau channel kompetitor lewat{' '}
              <code className="px-1.5 py-0.5 rounded-sm bg-surface-raised border border-border font-mono text-[11px]">
                channels.list
              </code>{' '}
              (irit kuota — seluruh watchlist ter-refresh dengan sekitar 1 unit, dan nggak pernah pakai
              jatah{' '}
              <code className="px-1.5 py-0.5 rounded-sm bg-surface-raised border border-border font-mono text-[11px]">
                search.list
              </code>{' '}
              yang terbatas). YouTube nggak punya API buat histori channel orang lain, jadi trend
              dibangun dari snapshot harian yang disimpan lokal di browser kamu.
            </p>
          </div>
        </div>
      </div>

      <HelpPanel>
        <p>
          <strong>Pantau channel saingan</strong> dan cek tren kata kunci. Tambahkan channel kompetitor (tempel
          link/@handle/ID) ke <strong>watchlist</strong> — app mencatat subscriber, views, dan jumlah video mereka.
        </p>
        <p>
          <strong>Soal grafik trend:</strong> YouTube tidak menyediakan histori statistik channel orang lain. Jadi
          app ini <strong>menyimpan snapshot sendiri tiap hari</strong> — makanya garis trend baru muncul setelah kamu
          klik &ldquo;Refresh&rdquo; di beberapa hari berbeda (makin sering, makin panjang grafiknya). Refresh seluruh
          watchlist cuma ~1 unit kuota.
        </p>
        <p>
          <strong>Cek Tren Kata Kunci:</strong> tombol yang membuka <strong>Google Trends</strong> asli di tab baru —
          untuk lihat tren pencarian sebuah kata kunci naik/turun. Ini data tren beneran (beda dari &ldquo;estimasi
          demand&rdquo; di modul Riset Kata Kunci yang cuma perkiraan).
        </p>
      </HelpPanel>

      <StrategyPanel>
        <p>Pantau saingan bukan buat iri, tapi buat mencuri format yang sudah terbukti dan menaruh satu twist milikmu.</p>
        <Example label="Siapa yang dipantau (niche kamu)">
          <Sample>Lofi Girl — Cafe Music BGM — Relaxing Jazz — Coffee Shop Vibes</Sample>
          <p>Tambahkan channel-channel ini ke watchlist, refresh berkala biar kelihatan mana yang subscriber-nya melesat.</p>
        </Example>
        <Example label="Cara pakai intel-nya">
          <p>Buka channel saingan di YouTube, cari video yang views-nya jauh di atas rata-rata mereka (outlier). Itu ide yang sudah terbukti diminati. Buat versimu dengan satu pembeda.</p>
          <Sample>Mereka: &ldquo;Cozy Coffee Shop Ambience&rdquo; → Kamu: &ldquo;Cozy Coffee Shop Ambience with Rain &amp; Thunder&rdquo;</Sample>
          <Why>format yang sudah tembus di channel besar berarti klik + retensinya sudah teruji. Kamu cuma perlu memindahkannya ke sudut yang belum digarap.</Why>
        </Example>
        <p className="text-[11px] text-text-faint">
          Grafik tren channel di sini dibangun dari snapshot yang kamu simpan sendiri tiap kali refresh (YouTube tak
          menyediakan histori channel orang lain). Untuk tren kata kunci beneran, pakai tombol Google Trends di bawah.
        </p>
      </StrategyPanel>

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger animate-slide-up">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-1 lg:row-span-2 flex flex-col gap-3">
          <WatchlistManager
            watchlist={watchlist}
            statsByChannelId={statsByChannelId}
            selectedChannelId={selectedChannelId}
            isAdding={isAdding}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onSelect={handleSelect}
          />

          {watchlist.length > 0 && (
            <Button
              variant="secondary"
              onClick={handleRefreshAll}
              disabled={isRefreshing}
              loading={isRefreshing}
              icon={<RefreshCw className="w-4 h-4" />}
              fullWidth
            >
              {isRefreshing ? 'Me-refresh...' : 'Refresh Semua & Ambil Snapshot Hari Ini'}
            </Button>
          )}

          {(isAdding || isRefreshing) && <Loader label="Menghubungi YouTube..." size="sm" />}
        </div>

        <div className="lg:col-span-2">
          {selectedChannel ? (
            <CompetitorTrendChart channelTitle={selectedChannel.title} history={history} />
          ) : (
            <Card className="h-full animate-fade-in">
              <EmptyState
                icon={TrendingUp}
                title="Pilih channel buat lihat trend"
                description="Klik salah satu channel di watchlist untuk menampilkan grafik subscriber-nya di sini."
              />
            </Card>
          )}
        </div>

        <div className="lg:col-span-2">
          <TrendLinkOut />
        </div>
      </div>
    </div>
  );
};
