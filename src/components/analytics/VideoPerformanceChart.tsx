import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Eye, Clock, TrendingUp, TrendingDown, Minus, Info, PlaySquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DailyVideoAnalytics } from '@/types';
import { Card } from '@/components/shared/ui/Card';

interface Props {
  data: DailyVideoAnalytics[];
  splitDate: string;
  videoTitle: string;
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pctDelta(before: number, after: number): number | null {
  return before > 0 ? ((after - before) / before) * 100 : null;
}

const StatCard: React.FC<{
  icon: LucideIcon;
  label: string;
  before: string;
  after: string;
  deltaPct: number | null;
  featured?: boolean;
  delayMs?: number;
}> = ({ icon: Icon, label, before, after, deltaPct, featured = false, delayMs = 0 }) => {
  const isUp = deltaPct !== null && deltaPct > 0;
  const isFlat = deltaPct === null || deltaPct === 0;
  const DeltaIcon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
  const deltaTone = isFlat ? 'text-text-faint bg-surface-raised' : isUp ? 'text-success bg-success-bg' : 'text-danger bg-danger-bg';

  return (
    <Card
      padding={featured ? 'lg' : 'sm'}
      interactive
      glow={featured ? 'primary' : 'none'}
      className="min-w-0 h-full flex flex-col animate-fade-in"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className={`flex items-center gap-2 ${featured ? 'mb-4' : 'mb-2.5'}`}>
        <span
          className={`flex items-center justify-center rounded-md bg-primary/10 text-primary shrink-0 ${featured ? 'w-8 h-8' : 'w-7 h-7'}`}
        >
          <Icon className={featured ? 'w-4 h-4' : 'w-3.5 h-3.5'} strokeWidth={2} />
        </span>
        <p className={`text-text-faint truncate ${featured ? 'text-xs font-medium uppercase tracking-wide' : 'text-xs'}`}>
          {label}
        </p>
      </div>
      <div className="flex items-end justify-between gap-2 mt-auto">
        <div className="min-w-0">
          <p
            className={`font-semibold text-text font-mono tabular-nums leading-tight truncate ${featured ? 'text-3xl' : 'text-xl'}`}
          >
            {after}
          </p>
          <p className="text-[11px] text-text-faint mt-1 truncate font-mono tabular-nums">sebelum: {before}</p>
        </div>
        {deltaPct !== null && (
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium font-mono tabular-nums shrink-0 ${deltaTone}`}
          >
            <DeltaIcon className="w-3 h-3" strokeWidth={2.5} />
            {isFlat ? '0.0%' : `${isUp ? '+' : ''}${deltaPct.toFixed(1)}%`}
          </span>
        )}
      </div>
    </Card>
  );
};

interface ChartTooltipPayloadEntry {
  value: number;
}

const ChartTooltip: React.FC<{
  active?: boolean;
  payload?: ChartTooltipPayloadEntry[];
  label?: string;
}> = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-md">
      <p className="text-[11px] text-text-faint mb-1">{label}</p>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-0.5 rounded-full bg-primary" />
        <span className="text-sm font-semibold text-text font-mono tabular-nums">
          {payload[0].value.toLocaleString('id-ID')}
        </span>
        <span className="text-xs text-text-muted">views</span>
      </div>
    </div>
  );
};

/**
 * Views + average watch duration before/after a marked date — the reliable, actually-
 * queryable signal for "did the thumbnail/title change help?" Real thumbnail CTR isn't
 * available through this API (see youtubeAnalyticsService.ts); check YouTube Studio's
 * own Reach tab directly if you need that specific number.
 */
export const VideoPerformanceChart: React.FC<Props> = ({ data, splitDate, videoTitle }) => {
  const sorted = useMemo(() => [...data].sort((a, b) => a.date.localeCompare(b.date)), [data]);
  const before = sorted.filter((d) => d.date < splitDate);
  const after = sorted.filter((d) => d.date >= splitDate);
  const hasBothWindows = before.length > 0 && after.length > 0;

  const beforeViews = average(before.map((d) => d.views));
  const afterViews = average(after.map((d) => d.views));
  const beforeDuration = average(before.map((d) => d.averageViewDuration));
  const afterDuration = average(after.map((d) => d.averageViewDuration));

  const chartData = sorted.map((d) => ({ date: d.date.slice(5), views: d.views }));

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Bento: chart claims 2/3 of the width as the dominant element, the stat
          column takes the remaining 1/3 with the views card visually heavier
          than the duration card beside it. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <Card padding="lg" className="lg:col-span-2">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0">
              <PlaySquare className="w-4 h-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-text truncate">{videoTitle}</h3>
              <p className="text-xs text-text-faint">
                Views harian &middot; garis putus-putus menandai tanggal ganti thumbnail/judul
              </p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'var(--color-text-faint)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--color-text-faint)' }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: 'var(--color-border-strong)', strokeWidth: 1 }}
              />
              <ReferenceLine
                x={splitDate.slice(5)}
                stroke="var(--color-warning)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{
                  value: 'Ganti',
                  position: 'insideTopRight',
                  fill: 'var(--color-warning)',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
              <Area
                type="monotone"
                dataKey="views"
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill="url(#viewsFill)"
                dot={false}
                activeDot={{
                  r: 5,
                  strokeWidth: 2,
                  stroke: 'var(--color-surface)',
                  fill: 'var(--color-primary)',
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {hasBothWindows ? (
          <div className="grid grid-cols-1 gap-4">
            <StatCard
              icon={Eye}
              label="Views (rata-rata harian)"
              before={Math.round(beforeViews).toLocaleString('id-ID')}
              after={Math.round(afterViews).toLocaleString('id-ID')}
              deltaPct={pctDelta(beforeViews, afterViews)}
              featured
              delayMs={0}
            />
            <StatCard
              icon={Clock}
              label="Durasi tonton rata-rata (detik)"
              before={Math.round(beforeDuration).toLocaleString('id-ID')}
              after={Math.round(afterDuration).toLocaleString('id-ID')}
              deltaPct={pctDelta(beforeDuration, afterDuration)}
              delayMs={40}
            />
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-lg border border-info/20 bg-info-bg px-4 py-3 h-full">
            <Info className="w-4 h-4 text-info mt-0.5 shrink-0" strokeWidth={2} />
            <p className="text-xs text-info">
              Perbandingan sebelum/sesudah butuh data di kedua sisi tanggal ganti — perlebar rentang tanggal
              kalau salah satu sisinya masih kosong.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2.5 rounded-lg bg-surface-raised px-4 py-3">
        <Info className="w-3.5 h-3.5 text-text-faint mt-0.5 shrink-0" strokeWidth={2} />
        <p className="text-[11px] text-text-faint leading-relaxed">
          Data ini apa adanya dari channel kamu — bukan hasil tes A/B yang dijalankan otomatis oleh app
          ini. Kalau kamu menjalankan &ldquo;Test and Compare&rdquo; di YouTube Studio, pemenangnya
          ditentukan Studio berdasarkan watch time per impression. Angka CTR thumbnail yang persis cuma
          kelihatan di tab &ldquo;Reach&rdquo; YouTube Studio langsung — API publik yang dipakai app ini
          tidak menyediakan angka itu.
        </p>
      </div>
    </div>
  );
};
