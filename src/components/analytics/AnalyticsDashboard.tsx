import React, { useState, useCallback, useMemo } from 'react';
import type { YoutubeAuthState, ConnectedChannelState, AnalyzedVideoOption, DailyVideoAnalytics, QuotaState } from '@/types';
import { getVideoPerformanceReport } from '@/services/youtubeAnalyticsService';
import type { OwnVideoCatalog } from '@/hooks/useOwnVideoCatalog';
import { ChannelConnectionPanel } from '@/components/auth/ChannelConnectionPanel';
import { Loader } from '@/components/shared/Loader';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { HelpPanel } from '@/components/shared/ui/HelpPanel';
import { StrategyPanel, Example, Why } from '@/components/shared/ui/StrategyPanel';
import { EmptyState } from '@/components/shared/ui/EmptyState';
import { VideoPerformanceChart } from './VideoPerformanceChart';
import { LineChart, ListVideo, Calendar, TrendingUp, AlertCircle, ChevronDown, PlaySquare, CalendarClock } from 'lucide-react';

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

interface Props {
  auth: YoutubeAuthState;
  channel: ConnectedChannelState;
  quota: QuotaState;
  recordUnits: (units: number) => void;
  catalog: OwnVideoCatalog;
}

export const AnalyticsDashboard: React.FC<Props> = ({ auth, channel, catalog }) => {
  const { accessToken, isConnected, isConnecting, error: authError, connect, disconnect } = auth;
  const { channelInfo, isLoadingChannel } = channel;

  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [startDate, setStartDate] = useState(isoDateDaysAgo(30));
  const [endDate, setEndDate] = useState(isoDateDaysAgo(0));
  const [splitDate, setSplitDate] = useState(isoDateDaysAgo(15));

  const [dailyData, setDailyData] = useState<DailyVideoAnalytics[]>([]);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Video list comes from the ONE shared app-level catalog — loaded once and reused across
  // every module, so opening Analytics after another module already loaded it is instant and
  // free (no separate uploads-playlist + videos.list fetch here anymore).
  const videoOptions = useMemo<AnalyzedVideoOption[]>(
    () =>
      catalog.videos.map((v) => ({
        videoId: v.videoId,
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        publishedAt: v.publishedAt,
      })),
    [catalog.videos]
  );
  const isLoadingVideos = catalog.isLoading;

  const selectedVideo = useMemo(
    () => videoOptions.find((v) => v.videoId === selectedVideoId) ?? null,
    [videoOptions, selectedVideoId]
  );

  const handleLoadVideos = useCallback(() => {
    catalog.loadCatalog();
  }, [catalog]);

  const handleLoadReport = useCallback(async () => {
    if (!accessToken || !selectedVideoId) return;
    setError(null);
    setIsLoadingReport(true);
    setDailyData([]);
    try {
      const data = await getVideoPerformanceReport(selectedVideoId, startDate, endDate, accessToken);
      setDailyData(data);
      if (data.length === 0) {
        setError('Tidak ada data untuk rentang tanggal ini — coba perlebar rentangnya.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data analytics.');
    } finally {
      setIsLoadingReport(false);
    }
  }, [accessToken, selectedVideoId, startDate, endDate]);

  return (
    <div className="max-w-6xl space-y-6">
      <Card padding="lg" className="bg-aurora bg-grain">
        <div className="relative z-[2] flex items-start gap-3">
          <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 text-primary shrink-0 shadow-glow">
            <LineChart className="w-5 h-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-gradient-brand">Analisis A/B Thumbnail &amp; Judul</h1>
            <p className="text-sm text-text-muted mt-1.5 leading-relaxed max-w-2xl">
              Dashboard ini membaca data views &amp; durasi tonton resmi dari YouTube Analytics API — bukan
              mesin A/B testing baru. Tes title/thumbnail tetap dijalankan lewat fitur bawaan &ldquo;Test
              and Compare&rdquo; di YouTube Studio; di sini kamu tandai tanggal kamu ganti thumbnail/judul,
              dan lihat apakah views &amp; retensi penonton naik sesudahnya. Angka CTR thumbnail yang persis
              nggak tersedia lewat API publik — cek langsung di tab &ldquo;Reach&rdquo; YouTube Studio kalau
              butuh itu.
            </p>
          </div>
        </div>
      </Card>

      <HelpPanel>
        <p>
          <strong>Buat apa modul ini:</strong> lihat apakah ganti thumbnail atau judul benar-benar menaikkan
          performa video. Ini <strong>bukan</strong> mesin A/B testing — tes-nya kamu jalankan lewat &ldquo;Test
          and Compare&rdquo; bawaan YouTube Studio; di sini kamu cuma <strong>membaca</strong> datanya.
        </p>
        <p>
          <strong>Cara baca:</strong> pilih video, lalu tandai tanggal kamu mengganti thumbnail/judul. Grafik
          menampilkan <strong>views &amp; durasi tonton</strong> per hari, dengan garis pemisah di tanggal itu —
          bandingkan rata-rata sebelum vs sesudah untuk tahu dampaknya. Data langsung dari YouTube Analytics resmi
          (0 kuota Data API).
        </p>
        <p>
          <strong>Catatan jujur:</strong> angka CTR thumbnail yang persis tidak tersedia lewat API publik ini —
          untuk itu cek tab &ldquo;Reach&rdquo; di YouTube Studio langsung.
        </p>
      </HelpPanel>

      <StrategyPanel>
        <p>Pakai ini buat membuktikan perubahan itu ngefek, bukan sekadar nebak. Aturannya: ubah satu hal saja per kali.</p>
        <Example label="Cara uji yang bersih">
          <p>Ganti thumbnail (atau judul) sebuah video, catat tanggalnya, biarkan 1&ndash;2 minggu, lalu pilih video itu di sini dan set &ldquo;tanggal ganti&rdquo; ke tanggal tadi. Bandingkan rata-rata views sebelum vs sesudah garis pemisah.</p>
          <Why>kalau kamu ganti thumbnail DAN judul sekaligus, kamu tak akan tahu mana yang bikin naik. Satu perubahan per kali = jawaban yang jelas.</Why>
        </Example>
        <Example label="Contoh nyata (niche kamu)">
          <p>Video &ldquo;Relaxing Jazz&rdquo; jalan di tempat. Ganti thumbnail ke satu scene kedai kopi hujan yang jelas, catat tanggal, tunggu. Kalau garis views naik sesudahnya, scene itu menang. Pakai gaya thumbnail yang sama untuk upload berikutnya.</p>
          <Why>thumbnail adalah satu-satunya hal yang dilihat penonton sebelum memutuskan klik, jadi ini pengungkit paling langsung yang kamu kontrol. (Angka-angka &ldquo;naik X% CTR = views berlipat&rdquo; yang beredar itu klaim vendor, bukan data resmi YouTube — makanya kita ukur video kamu sendiri di sini, bukan percaya rumus.)</Why>
        </Example>
        <Example label="Pakai 'Test & Compare' bawaan YouTube — dan pahami yang diukurnya">
          <p>
            YouTube Studio punya A/B test resmi (sampai 3 varian judul/thumbnail). Yang penting kamu tahu, ini
            pernyataan resmi YouTube soal cara pemenangnya dipilih: <em>&ldquo;Tests are optimised for overall watch
            time over other metrics, like click-through rate.&rdquo;</em>
          </p>
          <Why>jadi pemenangnya BUKAN yang CTR-nya tertinggi, tapi yang total watch time-nya tertinggi. Thumbnail clickbait bisa menang CTR tapi kalah di tes ini — dan itu justru bagus, karena mencegahmu memilih varian yang menarik klik lalu mengecewakan penonton.</Why>
        </Example>
      </StrategyPanel>

      <ChannelConnectionPanel
        isConnected={isConnected}
        isConnecting={isConnecting}
        authError={authError}
        onConnect={connect}
        onDisconnect={disconnect}
        channelInfo={channelInfo}
        isLoadingChannel={isLoadingChannel}
      />

      {isConnected && channelInfo && videoOptions.length === 0 && (
        <Card padding="none" className="animate-slide-up">
          <EmptyState
            icon={ListVideo}
            title="Ambil daftar video dari channel ini"
            description="Muat semua video yang sudah kamu upload, lalu pilih salah satu untuk dianalisis performanya sebelum/sesudah ganti thumbnail atau judul."
            tone="primary"
            action={
              <Button onClick={handleLoadVideos} loading={isLoadingVideos} icon={<ListVideo className="w-4 h-4" />}>
                Muat Daftar Video
              </Button>
            }
          />
        </Card>
      )}

      {isLoadingVideos && <Loader label="Memuat daftar video..." />}

      {videoOptions.length > 0 && (
        <Card padding="lg" className="animate-slide-up">
          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6">
            <div className="space-y-4 min-w-0">
              <div>
                <label htmlFor="analytics-video-select" className="text-xs font-medium text-text-muted block mb-1.5">
                  Pilih video
                </label>
                <div className="relative">
                  <select
                    id="analytics-video-select"
                    value={selectedVideoId}
                    onChange={(e) => setSelectedVideoId(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-border bg-bg pl-3 pr-9 py-2.5 text-sm text-text outline-none transition-colors duration-150 ease-standard hover:border-border-strong focus:border-primary"
                  >
                    <option value="">-- pilih video --</option>
                    {videoOptions.map((v) => (
                      <option key={v.videoId} value={v.videoId}>
                        {v.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-text-faint absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {selectedVideo && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fade-in">
                  <div>
                    <label htmlFor="analytics-start-date" className="text-xs font-medium text-text-muted block mb-1.5">
                      Dari tanggal
                    </label>
                    <div className="relative">
                      <Calendar className="w-3.5 h-3.5 text-text-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="analytics-start-date"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full rounded-lg border border-border bg-bg pl-8 pr-2 py-2 text-sm text-text outline-none transition-colors duration-150 ease-standard hover:border-border-strong focus:border-primary"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="analytics-end-date" className="text-xs font-medium text-text-muted block mb-1.5">
                      Sampai tanggal
                    </label>
                    <div className="relative">
                      <Calendar className="w-3.5 h-3.5 text-text-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="analytics-end-date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full rounded-lg border border-border bg-bg pl-8 pr-2 py-2 text-sm text-text outline-none transition-colors duration-150 ease-standard hover:border-border-strong focus:border-primary"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="analytics-split-date" className="text-xs font-medium text-text-muted block mb-1.5">
                      Tanggal ganti thumbnail/judul
                    </label>
                    <div className="relative">
                      <Calendar className="w-3.5 h-3.5 text-text-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="analytics-split-date"
                        type="date"
                        value={splitDate}
                        onChange={(e) => setSplitDate(e.target.value)}
                        className="w-full rounded-lg border border-border bg-bg pl-8 pr-2 py-2 text-sm text-text outline-none transition-colors duration-150 ease-standard hover:border-border-strong focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedVideo && (
                <Button
                  onClick={handleLoadReport}
                  loading={isLoadingReport}
                  icon={<TrendingUp className="w-4 h-4" />}
                >
                  Tampilkan Analisis
                </Button>
              )}
            </div>

            <div className="min-w-0">
              {selectedVideo ? (
                <Card
                  padding="md"
                  interactive
                  spotlight
                  glow="primary"
                  className="h-full flex flex-col animate-pop"
                >
                  {selectedVideo.thumbnailUrl ? (
                    <img
                      src={selectedVideo.thumbnailUrl}
                      alt=""
                      className="w-full aspect-video rounded-md object-cover border border-border"
                    />
                  ) : (
                    <span className="flex items-center justify-center w-full aspect-video rounded-md bg-surface-raised text-text-faint border border-border">
                      <PlaySquare className="w-6 h-6" strokeWidth={1.75} />
                    </span>
                  )}
                  <p className="text-sm font-medium text-text mt-3 leading-snug line-clamp-2">
                    {selectedVideo.title}
                  </p>
                  {selectedVideo.publishedAt && (
                    <p className="flex items-center gap-1.5 text-[11px] text-text-faint mt-auto pt-3">
                      <CalendarClock className="w-3 h-3" strokeWidth={2} />
                      Diupload {new Date(selectedVideo.publishedAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                </Card>
              ) : (
                <div className="h-full rounded-lg border border-dashed border-border">
                  <EmptyState
                    icon={PlaySquare}
                    title="Belum ada video dipilih"
                    description="Pilih salah satu video di sebelah kiri untuk melihat preview-nya di sini."
                    tone="neutral"
                  />
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {isLoadingReport && <Loader label="Mengambil data dari YouTube Analytics..." />}

      {(error || catalog.error) && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-bg px-4 py-3 text-sm text-danger shadow-xs animate-pop">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={2} />
          <p>{error || catalog.error}</p>
        </div>
      )}

      {dailyData.length > 0 && selectedVideo && (
        <VideoPerformanceChart data={dailyData} splitDate={splitDate} videoTitle={selectedVideo.title} />
      )}
    </div>
  );
};
