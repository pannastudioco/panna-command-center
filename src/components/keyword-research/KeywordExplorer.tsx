import React, { useState, useCallback } from 'react';
import { Search, AlertCircle, Sparkles, MousePointerClick } from 'lucide-react';
import type { KeywordSuggestion, TagSuggestion, CompetitorVideoSample, QuotaState } from '@/types';
import { harvestKeywordSuggestions } from '@/services/autocompleteService';
import { searchVideosByKeyword, getVideoTagsAndStats } from '@/services/youtubeDataService';
import { executeApiCallWithRotation } from '@/services/apiExecutor';
import { useLocalDb } from '@/hooks/useLocalDb';
import { SEARCH_LIST_DAILY_CAP, QUOTA_COST } from '@/constants/quotas';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/ui/EmptyState';
import { Card } from '@/components/shared/ui/Card';
import { Skeleton } from '@/components/shared/ui/Skeleton';
import { SuggestionHarvestPanel } from './SuggestionHarvestPanel';
import { TagBuilder } from './TagBuilder';
import { RankTracker } from './RankTracker';
import { HelpPanel } from '@/components/shared/ui/HelpPanel';
import { StrategyPanel, Example, Sample, Why } from '@/components/shared/ui/StrategyPanel';

function buildTagSuggestions(sample: CompetitorVideoSample[]): TagSuggestion[] {
  const counts = new Map<string, { usedByCount: number; sourceVideoTitles: string[] }>();
  for (const video of sample) {
    for (const tag of video.tags) {
      const existing = counts.get(tag);
      if (existing) {
        existing.usedByCount += 1;
        existing.sourceVideoTitles.push(video.title);
      } else {
        counts.set(tag, { usedByCount: 1, sourceVideoTitles: [video.title] });
      }
    }
  }
  return [...counts.entries()]
    .map(([tag, v]) => ({ tag, ...v }))
    .sort((a, b) => b.usedByCount - a.usedByCount)
    .slice(0, 30);
}

interface Props {
  youtubeApiKeys: string[];
  youtubeApiKeyIndex: number;
  setYoutubeApiKeyIndex: (idx: number) => void;
  quota: QuotaState;
  recordUnits: (units: number) => void;
  recordSearchListCall: () => void;
}

export const KeywordExplorer: React.FC<Props> = ({
  youtubeApiKeys,
  youtubeApiKeyIndex,
  setYoutubeApiKeyIndex,
  quota,
  recordUnits,
  recordSearchListCall,
}) => {
  const { getCachedSuggestions, setCachedSuggestions, getCachedCompetitorAnalysis, setCachedCompetitorAnalysis } =
    useLocalDb();

  const [seed, setSeed] = useState('');
  const [suggestions, setSuggestions] = useState<KeywordSuggestion[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [competitorSample, setCompetitorSample] = useState<CompetitorVideoSample[]>([]);

  const [isHarvesting, setIsHarvesting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchBudgetLeft = SEARCH_LIST_DAILY_CAP - quota.searchListCallsUsed;

  const handleHarvest = useCallback(async () => {
    const trimmed = seed.trim();
    if (!trimmed) return;
    setError(null);
    setSelectedTerm(null);
    setTagSuggestions([]);
    setCompetitorSample([]);
    setIsHarvesting(true);
    try {
      const cached = await getCachedSuggestions(trimmed);
      if (cached) {
        setSuggestions(cached);
      } else {
        const fresh = await harvestKeywordSuggestions(trimmed);
        setSuggestions(fresh);
        await setCachedSuggestions(trimmed, fresh);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengambil suggestion.');
    } finally {
      setIsHarvesting(false);
    }
  }, [seed, getCachedSuggestions, setCachedSuggestions]);

  const handleAnalyzeCompetition = useCallback(
    async (term: string) => {
      // Re-entrancy guard: without this, clicking a second suggestion before the
      // first analysis resolves starts a second concurrent search.list + videos.list
      // chain — both spend real (scarce) search.list quota, and whichever resolves
      // last silently overwrites the results regardless of click order.
      if (isAnalyzing) return;
      if (youtubeApiKeys.length === 0) {
        setError('Tambahkan minimal 1 API key YouTube dulu (klik status di kanan atas).');
        return;
      }
      setSelectedTerm(term);
      setError(null);
      setIsAnalyzing(true);
      try {
        const cached = await getCachedCompetitorAnalysis(term);
        if (cached) {
          setTagSuggestions(cached.tagSuggestions);
          setCompetitorSample(cached.competitorSample);
          return;
        }

        if (searchBudgetLeft <= 0) {
          setError('Jatah search.list hari ini (~100) sudah habis. Coba lagi besok, atau pakai keyword yang sudah pernah dianalisis (ke-cache).');
          return;
        }

        const { result: hits, nextKeyIndex: idxAfterSearch } = await executeApiCallWithRotation(
          (key) => searchVideosByKeyword(term, key),
          youtubeApiKeys,
          youtubeApiKeyIndex,
          'youtube-search'
        );
        recordSearchListCall();
        setYoutubeApiKeyIndex(idxAfterSearch);

        const { result: sample, nextKeyIndex: idxAfterVideos } = await executeApiCallWithRotation(
          (key) => getVideoTagsAndStats(hits, key),
          youtubeApiKeys,
          idxAfterSearch,
          'youtube-videos'
        );
        recordUnits(Math.ceil(hits.length / 50) * QUOTA_COST.videosList);
        setYoutubeApiKeyIndex(idxAfterVideos);

        const tags = buildTagSuggestions(sample);
        setTagSuggestions(tags);
        setCompetitorSample(sample);
        await setCachedCompetitorAnalysis(term, tags, sample);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal menganalisis kompetisi.');
      } finally {
        setIsAnalyzing(false);
      }
    },
    [
      isAnalyzing,
      youtubeApiKeys,
      youtubeApiKeyIndex,
      setYoutubeApiKeyIndex,
      searchBudgetLeft,
      getCachedCompetitorAnalysis,
      setCachedCompetitorAnalysis,
      recordSearchListCall,
      recordUnits,
    ]
  );

  return (
    <div className="w-full max-w-6xl space-y-6 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="hidden sm:flex w-11 h-11 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 border border-primary/20 items-center justify-center shrink-0 shadow-glow">
          <Search className="w-5 h-5 text-primary" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gradient-brand">Riset Kata Kunci &amp; Tag</h1>
          <p className="text-sm text-text-muted mt-1 max-w-2xl">
            Masukkan satu istilah dasar (misal &ldquo;focus music&rdquo; atau &ldquo;sleep sounds&rdquo;) untuk
            mengambil suggestion asli dari autocomplete YouTube, lalu analisis tag video kompetitor teratas.
          </p>
        </div>
      </div>

      <HelpPanel>
        <p>
          <strong>&ldquo;Kata kunci&rdquo; di sini = keyword pencarian</strong> — kata/frasa yang diketik
          orang di kolom search YouTube (mis. &ldquo;smooth jazz&rdquo;). Ini <strong>bukan judul video kamu</strong>.
          Gunanya: tahu apa yang dicari orang, lalu pakai kata itu di judul, tag, dan deskripsi supaya video kamu
          lebih gampang ditemukan.
        </p>
        <p>
          <strong>Alur pakainya:</strong> (1) ketik satu istilah dasar → klik Cari. (2) Muncul daftar{' '}
          <strong>suggestion</strong> (kata kunci turunan yang beneran diketik orang, dari autocomplete YouTube).
          Angka di kanan tiap suggestion = <strong>estimasi demand</strong> (0&ndash;100, seberapa sering istilah
          itu muncul) — ini <strong>perkiraan, bukan angka pencarian pasti</strong> (nggak ada API resmi untuk
          angka pasti). (3) Klik salah satu suggestion → app menganalisis <strong>tag video kompetitor teratas</strong>
          untuk kata kunci itu.
        </p>
        <p>
          <strong>Skor Peluang Kata Kunci</strong> (lingkaran angka): seberapa layak kata kunci itu dikejar =
          60% demand + 40% ruang-untuk-ranking (makin kecil rata-rata views kompetitor, makin gampang tembus).
          Angka tinggi = permintaan lumayan tapi persaingan belum berat. <strong>Tag dari Video Kompetitor</strong>:
          tag yang dipakai video-video teratas — angka di kurung = berapa video pakai tag itu; klik tag untuk memilih,
          lalu Salin buat ditempel ke video kamu.
        </p>
        <p>
          <strong>Rank Tracker</strong> (di bawah): lacak posisi video KAMU di hasil pencarian untuk kata kunci
          tertentu. Set channel kamu sekali, tambah kata kunci, klik cek — tiap cek pakai 1 jatah pencarian harian,
          dan riwayat posisinya digambar jadi grafik kecil.
        </p>
      </HelpPanel>

      <StrategyPanel>
        <p>
          <strong>Skor Peluang menjawab satu hal:</strong> kata kunci ini layak dikejar atau tidak. Makin tinggi,
          makin layak. Aturan bacanya sederhana:
        </p>
        <Example label="Cara baca skor">
          <p><strong>60&ndash;100</strong> — target kuat. Ada yang cari, saingan belum berat. Kejar.</p>
          <p><strong>40&ndash;59</strong> — boleh, asal kamu punya sudut yang lebih spesifik dari kompetitor.</p>
          <p><strong>0&ndash;39</strong> — biasanya lewati. Entah sedikit yang cari, atau sudah dikuasai channel besar.</p>
        </Example>
        <p>
          Skor rendah belum tentu jelek. Tergantung sebabnya, dan ada dua sebab yang artinya beda jauh:
        </p>
        <Example label="Demand vs Kompetisi (inti skornya)">
          <p>
            <strong>Demand</strong> = berapa banyak orang mengetik kata itu di search. <strong>Kompetisi</strong> =
            seberapa kuat video yang sudah ada (rata-rata views 15 video teratas). Skor menggabung keduanya:
            60% demand + 40% ruang untuk tembus.
          </p>
          <p>
            Demand kecil + saingan ringan → gampang ranking #1, tapi cuma segelintir yang nonton. Cocok untuk
            video pelengkap, bukan untuk tumbuh.
          </p>
          <p>
            Demand besar + saingan berat → penonton banyak, tapi 15 besar dipegang channel raksasa. Sebagai channel
            kecil kamu bakal ketimbun di halaman bawah.
          </p>
        </Example>
        <p>
          Titik manisnya ada di tengah: <strong>permintaan lumayan dengan persaingan ringan</strong>. Hampir selalu
          itu kata kunci yang lebih panjang dan spesifik (long-tail).
        </p>
        <Example label="Contoh nyata — niche kamu (Somatic Lounge)">
          <p>Terlalu berat, jangan jadikan target utama:</p>
          <Sample>smooth jazz</Sample>
          <p>Permintaan besar, tapi Lofi Girl dan channel jazz raksasa sudah menguasainya. Skornya bakal rendah karena kompetisi, bukan karena sepi.</p>
          <p className="pt-1">Pas dikejar:</p>
          <Sample>smooth jazz for cozy home office</Sample>
          <p>Permintaan sedang, saingan tipis. Ini yang kamu incar.</p>
          <Why>video kecil menang di frasa spesifik karena 15 besarnya belum diisi channel raksasa, jadi masih ada ruang buat naik.</Why>
        </Example>
        <p>
          Begitu ketemu frasa berskor tinggi, pakai frasa itu apa adanya di judul, di baris pertama deskripsi, dan
          di beberapa tag. Contoh judul jadinya:
        </p>
        <Sample>Smooth Jazz for Cozy Home Office ☕ Warm Coffee Shop Ambience for Focus &amp; Work</Sample>
        <p>
          <strong>Soal Tag dari Video Kompetitor:</strong> angka di kurung = berapa dari video teratas yang memakai
          tag itu. Misal <em>#ChillJazz (7)</em> berarti 7 dari 15 video pakai tag itu. Tapi jujur, tag itu faktor
          kecil. YouTube sendiri menyatakan tag &ldquo;berperan minimal&rdquo; untuk penemuan, jauh di bawah judul,
          thumbnail, dan deskripsi.
        </p>
        <Example label="Cara benar pakai tag kompetitor">
          <p>
            Tag kompetitor itu alat mata-mata, bukan tombol ranking. Gunanya melihat pola kata yang dipakai saingan
            dan menemukan ide keyword yang belum kepikiran, lalu kamu tuang ke judul dan deskripsi.
          </p>
          <p>Pasang 5&ndash;8 tag relevan saja, cukup. Sisa energi lempar ke judul dan thumbnail, dampaknya 10&ndash;20x lebih besar.</p>
        </Example>
        <p className="text-[11px] text-text-faint">
          Catatan jujur: angka demand di sini estimasi (tidak ada API resmi untuk volume pencarian pasti), dan bobot
          60/40 adalah pilihan Panna Studio, bukan rumus resmi. Arahnya sama seperti VidIQ dan TubeBuddy (demand
          tinggi + saingan rendah = peluang bagus); angkanya saja yang diperlakukan sebagai perkiraan.
        </p>
      </StrategyPanel>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint pointer-events-none" />
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleHarvest()}
            placeholder="focus music"
            aria-label="Istilah pencarian kata kunci"
            className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2.5 text-sm text-text placeholder:text-text-faint outline-none transition-all duration-200 ease-standard focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <Button
          onClick={handleHarvest}
          disabled={isHarvesting || !seed.trim()}
          loading={isHarvesting}
          icon={<Search className="w-4 h-4" />}
        >
          {isHarvesting ? 'Mencari...' : 'Cari'}
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger animate-slide-up">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Kolom kiri: suggestion dari autocomplete */}
        <div className="space-y-3">
          {isHarvesting && (
            <Card padding="none" className="overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-14" />
              </div>
              <div className="divide-y divide-border">
                {Array.from({ length: 6 }, (_, i) => (
                  <div
                    key={i}
                    className="px-4 py-3 flex items-center justify-between gap-3 animate-fade-in"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <Skeleton className="h-3.5 w-2/5" />
                    <Skeleton className="h-5 w-10 rounded-full" />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!isHarvesting && suggestions.length === 0 && !error && (
            <EmptyState
              icon={Sparkles}
              title="Belum ada suggestion"
              description="Ketik istilah dasar di atas lalu tekan Cari untuk mengambil suggestion asli dari autocomplete YouTube."
              tone="primary"
            />
          )}

          {!isHarvesting && suggestions.length > 0 && (
            <>
              <SuggestionHarvestPanel
                suggestions={suggestions}
                selectedTerm={selectedTerm}
                onSelect={handleAnalyzeCompetition}
                disabled={isAnalyzing}
              />
              <p className="text-xs text-text-faint">
                Klik salah satu suggestion untuk analisis tag dari video kompetitor teratasnya. Sisa jatah
                search hari ini:{' '}
                <span className="font-mono tabular-nums text-text-muted">{searchBudgetLeft}</span>/
                <span className="font-mono tabular-nums">{SEARCH_LIST_DAILY_CAP}</span>.
              </p>
            </>
          )}
        </div>

        {/* Kolom kanan: hasil analisis tag kompetitor */}
        <div className="space-y-3">
          {isAnalyzing && (
            <Card padding="none" className="overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className="animate-fade-in" style={{ animationDelay: `${i * 40}ms` }}>
                    <Skeleton className={`h-7 rounded-full ${i % 3 === 0 ? 'w-24' : i % 3 === 1 ? 'w-16' : 'w-20'}`} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!isAnalyzing && (tagSuggestions.length > 0 || competitorSample.length > 0) && (
            <TagBuilder
              tagSuggestions={tagSuggestions}
              competitorSample={competitorSample}
              demandScore={suggestions.find((s) => s.term === selectedTerm)?.estimatedDemandScore}
            />
          )}

          {!isAnalyzing && tagSuggestions.length === 0 && competitorSample.length === 0 && (
            <EmptyState
              icon={MousePointerClick}
              title={suggestions.length > 0 ? 'Pilih suggestion di kiri' : 'Menunggu suggestion'}
              description={
                suggestions.length > 0
                  ? 'Klik salah satu istilah di panel kiri untuk menganalisis tag video kompetitor teratasnya.'
                  : 'Hasil analisis tag kompetitor akan muncul di sini setelah kamu mencari & memilih suggestion.'
              }
              tone={suggestions.length > 0 ? 'primary' : 'neutral'}
            />
          )}
        </div>
      </div>

      <RankTracker
        youtubeApiKeys={youtubeApiKeys}
        youtubeApiKeyIndex={youtubeApiKeyIndex}
        setYoutubeApiKeyIndex={setYoutubeApiKeyIndex}
        quota={quota}
        recordUnits={recordUnits}
        recordSearchListCall={recordSearchListCall}
      />
    </div>
  );
};
