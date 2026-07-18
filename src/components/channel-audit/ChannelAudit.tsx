import React, { useCallback, useMemo } from 'react';
import type { YoutubeAuthState, ConnectedChannelState } from '@/types';
import type { ChannelAuditState, RangeDays } from '@/hooks/useChannelAudit';
import {
  computeOutliers,
  computeBestPublishTimes,
  computeMilestone,
  trafficSourceLabel,
  countryName,
  type PublishBucket,
} from '@/services/channelAuditService';
import { ChannelConnectionPanel } from '@/components/auth/ChannelConnectionPanel';
import { HelpPanel } from '@/components/shared/ui/HelpPanel';
import { StrategyPanel, Example, Why } from '@/components/shared/ui/StrategyPanel';
import { Loader } from '@/components/shared/Loader';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { Badge } from '@/components/shared/ui/Badge';
import { EmptyState } from '@/components/shared/ui/EmptyState';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  Activity,
  Eye,
  Clock,
  Users2,
  TrendingUp,
  Flame,
  Globe2,
  CalendarClock,
  Route,
  AlertCircle,
  Target,
  Play,
} from 'lucide-react';

interface Props {
  auth: YoutubeAuthState;
  channel: ConnectedChannelState;
  audit: ChannelAuditState;
}

const TOOLTIP_STYLE = {
  background: 'var(--color-surface-raised)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  fontSize: 12,
  boxShadow: 'var(--shadow-md)',
} as const;

function fmt(n: number): string {
  return n.toLocaleString('id-ID');
}
function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'jt';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'rb';
  return String(n);
}
function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const StatTile: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  tone?: 'primary' | 'success' | 'info' | 'accent';
  large?: boolean;
}> = ({ icon: Icon, label, value, sub, tone = 'primary', large }) => {
  const toneBg = { primary: 'bg-primary/10 text-primary', success: 'bg-success-bg text-success', info: 'bg-info-bg text-info', accent: 'bg-accent/10 text-accent' }[tone];
  return (
    <Card padding="md" className={`flex items-center gap-3.5 ${large ? 'sm:col-span-2' : ''}`} glow={tone === 'primary' ? 'primary' : 'none'} interactive>
      <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${toneBg}`}>
        <Icon className="w-5 h-5" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-text-faint truncate">{label}</p>
        <p className={`font-semibold tabular-nums font-mono leading-tight ${large ? 'text-2xl' : 'text-lg'}`}>{value}</p>
        {sub && <p className="text-[11px] text-text-muted mt-0.5 truncate">{sub}</p>}
      </div>
    </Card>
  );
};

const BestTimeCard: React.FC<{ title: string; buckets: PublishBucket[]; icon: React.ElementType }> = ({
  title,
  buckets,
  icon: Icon,
}) => {
  const max = Math.max(1, ...buckets.map((b) => b.medianViews));
  const top = buckets.slice(0, 6);
  return (
    <Card padding="md">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" strokeWidth={2} />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {top.length === 0 ? (
        <p className="text-xs text-text-faint">Belum cukup data video.</p>
      ) : (
        <div className="space-y-2">
          {top.map((b) => (
            <div key={b.key} className="flex items-center gap-2.5">
              <span className="w-10 shrink-0 text-xs font-mono tabular-nums text-text-muted">{b.label}</span>
              <div className="flex-1 h-5 rounded bg-surface-raised overflow-hidden">
                <div
                  className="h-full rounded bg-gradient-to-r from-primary to-accent flex items-center justify-end pr-1.5"
                  style={{ width: `${Math.max(8, (b.medianViews / max) * 100)}%` }}
                >
                  <span className="text-[10px] font-mono text-on-primary tabular-nums">{fmtCompact(b.medianViews)}</span>
                </div>
              </div>
              <span className="w-8 shrink-0 text-[10px] text-text-faint tabular-nums text-right">{b.videoCount}v</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export const ChannelAudit: React.FC<Props> = ({ auth, channel, audit }) => {
  const { isConnected, isConnecting, error: authError, connect, disconnect } = auth;
  const { channelInfo, isLoadingChannel } = channel;

  // All the expensive/fetched state lives in the shared app-level hook, so it survives a
  // tab switch and is never re-fetched (or re-billed) on return.
  const {
    data,
    range,
    isLoading,
    error,
    hasLoaded,
    retention,
    retentionVideoId,
    isLoadingRetention,
    retentionError,
    load,
    selectRange,
    loadRetention,
    reset,
  } = audit;

  const handleDisconnect = useCallback(() => {
    disconnect();
    reset();
  }, [disconnect, reset]);

  // ---- Derived ----
  const videoMeta = useMemo(() => new Map((data?.videos ?? []).map((v) => [v.videoId, v])), [data]);
  const viewsByVideoId = useMemo(
    () => new Map((data?.topVideos ?? []).map((t) => [t.videoId, t.views])),
    [data]
  );
  const outliers = useMemo(() => (data ? computeOutliers(data.topVideos) : null), [data]);
  const bestTimes = useMemo(
    () => (data ? computeBestPublishTimes(data.videos, viewsByVideoId) : null),
    [data, viewsByVideoId]
  );
  const totalTrafficViews = useMemo(
    () => (data?.traffic ?? []).reduce((s, t) => s + t.views, 0),
    [data]
  );
  const totals = useMemo(() => {
    if (!data) return null;
    const views = data.timeSeries.reduce((s, p) => s + p.views, 0);
    const watch = data.timeSeries.reduce((s, p) => s + p.estimatedMinutesWatched, 0);
    const net = data.timeSeries.reduce((s, p) => s + p.subscribersNet, 0);
    const avd = data.timeSeries.length
      ? data.timeSeries.reduce((s, p) => s + p.averageViewDuration, 0) / data.timeSeries.length
      : 0;
    return { views, watch, net, avd };
  }, [data]);

  const timeSeriesChart = useMemo(
    () => (data?.timeSeries ?? []).map((p) => ({ date: p.date.slice(5), views: p.views, subs: p.subscribersNet })),
    [data]
  );

  const retentionChart = useMemo(
    () => (retention ?? []).map((p) => ({ pct: Math.round(p.elapsedRatio * 100), watch: Math.round(p.audienceWatchRatio * 100) })),
    [retention]
  );

  return (
    <div className="max-w-[1500px] space-y-6">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 ring-1 ring-primary/20 flex items-center justify-center">
          <Activity className="w-5 h-5 text-primary" strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gradient-brand">Channel Audit</h1>
          <p className="text-sm text-text-muted mt-1 max-w-2xl">
            Kesehatan channel dari YouTube Analytics resmi (0 kuota Data API) — trafik, retensi asli per
            video, outlier, dan waktu publish historis terbaik.
          </p>
        </div>
      </div>

      <HelpPanel>
        <p>
          <strong>Rapor kesehatan channel kamu</strong> dari data YouTube Analytics resmi. Sambungkan akun, klik
          &ldquo;Muat Audit&rdquo;, pilih rentang 30/90 hari. Cara baca tiap bagian:
        </p>
        <p>
          <strong>Kartu atas:</strong> total subscriber, views periode ini, rata-rata durasi tonton.{' '}
          <strong>Milestone:</strong> progress menuju angka bulat berikutnya (mis. 100rb subscriber).{' '}
          <strong>Views Harian:</strong> grafik naik-turun views tiap hari. <strong>Sumber Trafik:</strong> dari mana
          penonton datang — Suggested (video terkait), Search (pencarian), Browse (beranda/langganan), dll.
        </p>
        <p>
          <strong>Video Teratas &amp; Outlier:</strong> &ldquo;outlier&rdquo; = video yang performanya jauh di atas
          rata-rata (angka &ldquo;×&rdquo; = berapa kali lipat views dibanding median channel). Klik video untuk lihat{' '}
          <strong>kurva retensi</strong> — persen penonton yang masih menonton di tiap titik video; tempat garis jatuh
          tajam = tempat orang berhenti nonton.
        </p>
        <p>
          <strong>Jam/Hari Publish Terbaik:</strong> dari video-video kamu, jam/hari mana yang historisnya paling
          banyak views. Ini analisis performa, <strong>bukan</strong> data &ldquo;kapan audiens online&rdquo; (itu cuma
          ada di Studio, tak tersedia via API). <strong>Negara Teratas:</strong> dari mana penonton kamu berasal.
        </p>
      </HelpPanel>

      <StrategyPanel>
        <p>Audit ini bukan buat dipandangi, tapi buat diambil aksinya. Baca, lalu lakukan:</p>
        <Example label="Kurva Retensi — perbaiki tempat orang berhenti">
          <p>Klik sebuah video, lihat kurvanya, cari titik garis jatuh tajam. Kalau jatuhnya di ~30 detik pertama, intro-nya kepanjangan atau tak sesuai judul.</p>
          <Why>Banyak riset kreator/vendor (bukan angka resmi YouTube) melaporkan mayoritas penonton kabur di menit pertama sebuah video — YouTube sendiri tak pernah merilis angka baku, cuma bilang retensi dinilai relatif ke video sejenis, bukan ke satu ambang tetap. Tapi arahnya konsisten di semua sumber: 30 detik pertama paling menentukan. Perbaiki bagian itu (langsung ke suasana yang dijanjikan judul) dan retensi keseluruhan video biasanya ikut naik.</Why>
        </Example>
        <Example label="Sumber Trafik — gandakan yang menang">
          <p>Kalau <strong>Suggested</strong> paling besar, berarti YouTube sudah kenal lane kamu. Perkuat playlist &amp; end screen biar penonton lanjut ke video kamu berikutnya. Kalau <strong>Search</strong> yang besar, pola judul &amp; deskripsi kamu sudah kena. Bikin lebih banyak video dengan pola judul yang sama.</p>
        </Example>
        <Example label="Video Teratas & Outlier — tiru pemenangmu sendiri">
          <p>Video berskor &ldquo;×&rdquo; tinggi (mis. 3× median) artinya idenya yang menang, bukan kebetulan. Buat lebih banyak versi format itu. Contoh: kalau &ldquo;Rainy Night Jazz&rdquo; tembus 4×, bikin seri Rainy Night (musim gugur, salju, hujan badai).</p>
        </Example>
        <Example label="Jam/Hari Publish Terbaik — jadwalkan ke sana">
          <p>Lihat bar tertinggi, publish video berikutnya di jam/hari itu. Ingat, ini performa historis video kamu, bukan data &ldquo;kapan audiens online&rdquo;.</p>
        </Example>
      </StrategyPanel>

      <ChannelConnectionPanel
        isConnected={isConnected}
        isConnecting={isConnecting}
        authError={authError}
        onConnect={connect}
        onDisconnect={handleDisconnect}
        channelInfo={channelInfo}
        isLoadingChannel={isLoadingChannel}
      />

      {isConnected && channelInfo && (
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={<Activity className="w-4 h-4" />} loading={isLoading} onClick={() => load(range, hasLoaded)}>
            {data ? 'Muat Ulang Audit' : 'Muat Audit Channel'}
          </Button>
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            {([30, 90] as RangeDays[]).map((d) => (
              <button
                key={d}
                onClick={() => selectRange(d)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === d ? 'bg-primary text-on-primary' : 'text-text-muted hover:bg-surface-hover'
                }`}
              >
                {d} hari
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 flex items-start gap-2.5 text-sm text-danger">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {isLoading && <Loader label="Menarik data Analytics channel..." />}

      {!isLoading && !data && isConnected && (
        <Card padding="none">
          <EmptyState
            icon={Activity}
            tone="primary"
            title="Belum ada audit"
            description="Klik “Muat Audit Channel” untuk menarik data kesehatan channel dari YouTube Analytics."
          />
        </Card>
      )}

      {data && totals && (
        <>
          {/* Bento stat row — subscribers is the hero (larger). */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile
              icon={Users2}
              label="Total Subscriber"
              value={data.stats.subscriberCountHidden ? 'Disembunyikan' : fmt(data.stats.subscriberCount)}
              sub={`${totals.net >= 0 ? '+' : ''}${fmt(totals.net)} periode ini`}
              tone="primary"
              large
            />
            <StatTile icon={Eye} label={`Views (${range}h)`} value={fmtCompact(totals.views)} tone="info" />
            <StatTile icon={Clock} label="Rata durasi tonton" value={fmtDuration(totals.avd)} tone="accent" />
          </div>

          {/* Milestones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['subscribers', 'views'] as const).map((metric) => {
              const current = metric === 'subscribers' ? data.stats.subscriberCount : data.stats.viewCount;
              if (metric === 'subscribers' && data.stats.subscriberCountHidden) return null;
              const m = computeMilestone(metric, current);
              return (
                <Card key={metric} padding="md">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-primary" strokeWidth={2} />
                      <h3 className="text-sm font-semibold">
                        Milestone {metric === 'subscribers' ? 'Subscriber' : 'Total Views'}
                      </h3>
                    </div>
                    <Badge tone="primary">
                      <span className="tabular-nums">{fmtCompact(m.next)}</span>
                    </Badge>
                  </div>
                  <div className="h-2.5 rounded-full bg-surface-raised overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-700 ease-standard"
                      style={{ width: `${Math.round(m.progress * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-text-muted mt-1.5 tabular-nums">
                    {fmt(m.current)} / {fmt(m.next)} ({Math.round(m.progress * 100)}%)
                  </p>
                </Card>
              );
            })}
          </div>

          {/* Bento: big time-series chart + traffic sources side panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <Card padding="md" className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-primary" strokeWidth={2} />
                <h3 className="text-sm font-semibold">Views Harian ({range} hari)</h3>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={timeSeriesChart} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="auditViewsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-text-faint)' }} stroke="var(--color-border)" interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-faint)' }} stroke="var(--color-border)" width={44} tickFormatter={fmtCompact} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: 'var(--color-text)', fontWeight: 600 }} formatter={(v) => [fmt(Number(v)), 'Views']} />
                  <Area type="monotone" dataKey="views" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#auditViewsFill)" activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card padding="md">
              <div className="flex items-center gap-2 mb-3">
                <Route className="w-4 h-4 text-primary" strokeWidth={2} />
                <h3 className="text-sm font-semibold">Sumber Trafik</h3>
              </div>
              {data.traffic.length === 0 ? (
                <p className="text-xs text-text-faint">Belum ada data.</p>
              ) : (
                <div className="space-y-2">
                  {data.traffic.slice(0, 7).map((t) => {
                    const pct = totalTrafficViews > 0 ? (t.views / totalTrafficViews) * 100 : 0;
                    return (
                      <div key={t.source}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="text-text-muted truncate">{trafficSourceLabel(t.source)}</span>
                          <span className="font-mono tabular-nums text-text-faint shrink-0 ml-2">{pct.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${Math.max(2, pct)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Top videos + outliers */}
          <Card padding="none" className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-surface-raised/60 flex items-center gap-2">
              <Flame className="w-4 h-4 text-primary" strokeWidth={2} />
              <h3 className="text-sm font-semibold">Video Teratas & Outlier</h3>
              <span className="text-[11px] text-text-faint ml-auto">Outlier = views ÷ median (klik untuk retention)</span>
            </div>
            <div className="divide-y divide-border max-h-[420px] overflow-y-auto custom-scrollbar">
              {(outliers?.results ?? []).slice(0, 20).map((o) => {
                const meta = videoMeta.get(o.videoId);
                const isOutlier = o.outlierScore >= 2;
                return (
                  <button
                    key={o.videoId}
                    onClick={() => loadRetention(o.videoId)}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors hover:bg-surface-hover ${
                      retentionVideoId === o.videoId ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="w-16 aspect-video shrink-0 rounded-md overflow-hidden bg-surface-raised">
                      {meta?.thumbnailUrl && <img src={meta.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium line-clamp-1">{meta?.title ?? o.videoId}</p>
                      <p className="text-[11px] text-text-faint tabular-nums mt-0.5">{fmt(o.views)} views</p>
                    </div>
                    <Badge tone={isOutlier ? 'success' : 'neutral'} className="shrink-0">
                      <span className="tabular-nums">{o.outlierScore.toFixed(1)}×</span>
                    </Badge>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Retention curve (real, own video) */}
          {retentionVideoId && (
            <Card padding="md">
              <div className="flex items-center gap-2 mb-1">
                <Play className="w-4 h-4 text-primary" strokeWidth={2} />
                <h3 className="text-sm font-semibold line-clamp-1">
                  Retention: {videoMeta.get(retentionVideoId)?.title ?? retentionVideoId}
                </h3>
              </div>
              <p className="text-xs text-text-faint mb-3">
                Kurva retensi audiens ASLI dari YouTube Analytics (data pemilik) — % penonton yang masih
                menonton di tiap posisi video. Titik jatuh tajam = tempat orang berhenti.
              </p>
              {isLoadingRetention ? (
                <Loader label="Menarik data retention..." size="sm" />
              ) : retentionError ? (
                <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{retentionError}</span>
                </div>
              ) : retentionChart.length === 0 ? (
                <p className="text-sm text-text-muted">Belum ada data retention untuk video ini (mungkin terlalu sedikit penonton).</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={retentionChart} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="retentionFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="pct" tick={{ fontSize: 11, fill: 'var(--color-text-faint)' }} stroke="var(--color-border)" tickFormatter={(v) => `${v}%`} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-faint)' }} stroke="var(--color-border)" width={40} tickFormatter={(v) => `${v}%`} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => `Posisi ${v}%`} formatter={(v) => [`${Number(v)}%`, 'Masih nonton']} />
                    <ReferenceLine y={100} stroke="var(--color-border-strong)" strokeDasharray="2 2" />
                    <Area type="monotone" dataKey="watch" stroke="var(--color-accent)" strokeWidth={2.5} fill="url(#retentionFill)" activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Card>
          )}

          {/* Best time + geography */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            {bestTimes && <BestTimeCard title="Jam Publish Terbaik (historis)" buckets={bestTimes.byHour} icon={CalendarClock} />}
            {bestTimes && <BestTimeCard title="Hari Publish Terbaik (historis)" buckets={bestTimes.byDayOfWeek} icon={CalendarClock} />}
            <Card padding="md">
              <div className="flex items-center gap-2 mb-3">
                <Globe2 className="w-4 h-4 text-primary" strokeWidth={2} />
                <h3 className="text-sm font-semibold">Negara Teratas</h3>
              </div>
              {data.geography.length === 0 ? (
                <p className="text-xs text-text-faint">Belum ada data.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.geography.slice(0, 8).map((g) => {
                    const maxG = data.geography[0]?.views || 1;
                    return (
                      <div key={g.country} className="flex items-center gap-2.5">
                        <span className="w-24 shrink-0 text-xs text-text-muted truncate">{countryName(g.country)}</span>
                        <div className="flex-1 h-4 rounded bg-surface-raised overflow-hidden">
                          <div className="h-full rounded bg-gradient-to-r from-primary to-accent" style={{ width: `${Math.max(4, (g.views / maxG) * 100)}%` }} />
                        </div>
                        <span className="w-12 shrink-0 text-[10px] text-text-faint tabular-nums text-right">{fmtCompact(g.views)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-info/30 bg-info-bg px-4 py-3 text-xs leading-relaxed text-text-muted">
            <CalendarClock className="w-4 h-4 shrink-0 translate-y-0.5 text-info" strokeWidth={2} />
            <p>
              <span className="font-medium text-text">Soal &ldquo;waktu terbaik&rdquo;:</span> ini analisis
              performa historis video kamu per jam/hari publish (median views), BUKAN data &ldquo;kapan
              audiens online&rdquo; — sinyal itu cuma ada di YouTube Studio dan tidak tersedia lewat API
              mana pun. Bucket dengan sedikit video (angka &ldquo;v&rdquo; kecil) kurang bisa diandalkan.
            </p>
          </div>
        </>
      )}
    </div>
  );
};
