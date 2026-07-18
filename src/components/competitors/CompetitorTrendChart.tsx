import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { ChannelSnapshot } from '@/types';
import { Card } from '@/components/shared/ui/Card';
import { Badge } from '@/components/shared/ui/Badge';

interface Props {
  channelTitle: string;
  history: ChannelSnapshot[];
}

export const CompetitorTrendChart: React.FC<Props> = ({ channelTitle, history }) => {
  if (history.length < 2) {
    return (
      <Card padding="none" className="h-full animate-fade-in">
        <div className="flex flex-col items-center text-center py-14 px-6">
          <div className="w-12 h-12 rounded-full bg-surface-raised border border-border flex items-center justify-center mb-4">
            <TrendingUp className="w-5 h-5 text-text-faint" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-medium text-text">
            Baru ada <span className="tabular-nums">{history.length}</span> snapshot buat{' '}
            <span className="text-primary">{channelTitle}</span>
          </p>
          <p className="text-xs text-text-muted mt-1 max-w-sm">
            Trend baru kelihatan setelah ada snapshot dari beberapa hari berbeda — klik &ldquo;Refresh
            Semua&rdquo; lagi besok atau lusa buat nambah titik data.
          </p>
        </div>
      </Card>
    );
  }

  const chartData = history.map((h) => ({
    date: h.dateISO.slice(5),
    subscribers: h.subscriberCount,
    views: h.viewCount,
  }));

  const latest = chartData[chartData.length - 1];
  const first = chartData[0];
  const subsDelta = latest.subscribers - first.subscribers;

  return (
    <Card className="animate-fade-in" style={{ boxShadow: 'var(--shadow-glow)' }}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-sm font-semibold text-text">{channelTitle}</h3>
        <Badge tone="primary">
          <span className="tabular-nums">{history.length}</span> snapshot
        </Badge>
      </div>
      <p className="text-xs text-text-faint mb-4">
        Subscriber harian dari snapshot lokal — YouTube nggak nyediain histori buat channel orang lain,
        jadi ini dibangun dari snapshot yang app ini simpan sendiri tiap hari.
      </p>

      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="rounded-lg border border-border bg-surface-raised px-3.5 py-2.5">
          <p className="text-[11px] text-text-faint">Subscriber terkini</p>
          <p className="text-lg font-semibold text-text tabular-nums font-mono mt-0.5">
            {latest.subscribers.toLocaleString('id-ID')}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised px-3.5 py-2.5">
          <p className="text-[11px] text-text-faint">Perubahan periode ini</p>
          <p
            className={`text-lg font-semibold tabular-nums font-mono mt-0.5 ${
              subsDelta > 0 ? 'text-success' : subsDelta < 0 ? 'text-danger' : 'text-text'
            }`}
          >
            {subsDelta > 0 ? '+' : ''}
            {subsDelta.toLocaleString('id-ID')}
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="competitorTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'var(--color-text-faint)' }}
            stroke="var(--color-border)"
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--color-text-faint)' }}
            stroke="var(--color-border)"
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              fontSize: 12,
              boxShadow: 'var(--shadow-md)',
            }}
            labelStyle={{ color: 'var(--color-text)', fontWeight: 600, marginBottom: 2 }}
            itemStyle={{ color: 'var(--color-primary)' }}
          />
          <Area
            type="monotone"
            dataKey="subscribers"
            stroke="var(--color-primary)"
            strokeWidth={2.5}
            fill="url(#competitorTrendFill)"
            dot={{ r: 3, stroke: 'var(--color-primary)', strokeWidth: 2, fill: 'var(--color-surface)' }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
};
