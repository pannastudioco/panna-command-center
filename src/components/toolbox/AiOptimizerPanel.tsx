import React, { useState, useCallback, useMemo } from 'react';
import type { EditableVideo } from '@/types';
import {
  updateVideoMetadata,
  setVideoThumbnail,
  searchVideosByKeyword,
  getVideoTagsAndStats,
  discloseSyntheticMedia,
} from '@/services/youtubeDataService';
import { executeApiCallWithRotation } from '@/services/apiExecutor';
import { QUOTA_COST } from '@/constants/quotas';
import {
  generateOptimizedMetadata,
  generateThumbnailConcept,
  generateThumbnailImage,
  isQuotaError,
  type OptimizedMetadata,
  type ThumbnailConcept,
} from '@/services/geminiService';
import { buildThumbnailPrompt } from '@/services/thumbnailPrompt';
import { processThumbnail, type ProcessedThumbnail } from '@/services/thumbnailService';
import { computeReadiness, type ReadinessResult } from '@/services/readinessService';
import {
  checkDistribution,
  DISTRIBUTION_DISCLAIMER,
  TAGS_NOTE,
  type SurfaceReport,
} from '@/services/distributionCheckService';
import { MarketSelect, WhyToggle, CopyButton } from '@/components/ai-studio/GeneratorBits';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { Badge } from '@/components/shared/ui/Badge';
import { Loader } from '@/components/shared/Loader';
import { Wand2, Image as ImageIcon, Target, AlertCircle, CheckCircle2, Search, Users2, Home, Radar, Route, ShieldCheck } from 'lucide-react';

interface Props {
  video: EditableVideo;
  geminiKeys: string[];
  accessToken: string | null;
  remainingUnitsToday: number;
  recordUnits: (units: number) => void;
  onLocalPatch: (videoId: string, patch: Partial<EditableVideo>) => void;
  niche: string;
  youtubeApiKeys: string[];
  youtubeApiKeyIndex: number;
  setYoutubeApiKeyIndex: (idx: number) => void;
  recordSearchListCall: () => void;
  searchBudgetLeft: number;
}

const SURFACE_ICON = { search: Search, suggested: Users2, browse: Home } as const;
const CONF_LABEL = { high: 'keyakinan tinggi', medium: 'keyakinan sedang', low: 'keyakinan rendah' } as const;

function scoreTone(n: number): string {
  return n >= 70 ? 'text-success' : n >= 45 ? 'text-warning' : 'text-danger';
}

/** Appends hashtags to a description only if they're not already in it. */
function withHashtags(description: string, hashtags: string[]): string {
  if (hashtags.length === 0) return description;
  const line = hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ');
  if (description.includes(line)) return description;
  return `${description.replace(/\s+$/, '')}\n\n${line}`;
}

/**
 * The AI execution layer of the Video Optimizer: it doesn't just advise, it WRITES the new
 * metadata and the new thumbnail and pushes them to YouTube.
 *
 * The readiness scores here are deliberately labelled an ESTIMATE, not a win probability —
 * no API (YouTube's or anyone's) exposes a real chance-to-rank, so anything claiming one is
 * invented. What we do instead is measure what's genuinely measurable (metadata, keyword
 * coverage, packaging, real competitor views, real retention) and show every component.
 */
export const AiOptimizerPanel: React.FC<Props> = ({
  video,
  geminiKeys,
  accessToken,
  remainingUnitsToday,
  recordUnits,
  onLocalPatch,
  niche,
  youtubeApiKeys,
  youtubeApiKeyIndex,
  setYoutubeApiKeyIndex,
  recordSearchListCall,
  searchBudgetLeft,
}) => {
  const [keyword, setKeyword] = useState('');
  const [market, setMarket] = useState<string | null>(null);

  const [competitorViews, setCompetitorViews] = useState<number[] | null>(null);
  const [checkingComp, setCheckingComp] = useState(false);

  const [draft, setDraft] = useState<OptimizedMetadata | null>(null);
  const [busyMeta, setBusyMeta] = useState(false);
  const [applyingMeta, setApplyingMeta] = useState(false);

  const [concept, setConcept] = useState<ThumbnailConcept | null>(null);
  const [imagePrompt, setImagePrompt] = useState<string | null>(null);
  const [thumb, setThumb] = useState<ProcessedThumbnail | null>(null);
  const [conceptOnly, setConceptOnly] = useState(false);
  const [busyThumb, setBusyThumb] = useState(false);
  const [applyingThumb, setApplyingThumb] = useState(false);

  const [disclosing, setDisclosing] = useState(false);
  const [disclosed, setDisclosed] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canWrite = Boolean(accessToken) && remainingUnitsToday >= QUOTA_COST.videosUpdate;

  const readiness: ReadinessResult = useMemo(
    () =>
      computeReadiness({
        title: video.title,
        description: video.description,
        tags: video.tags,
        hasThumbnail: Boolean(video.thumbnailUrl),
        defaultLanguage: video.defaultLanguage,
        targetKeyword: keyword.trim() || null,
        competitorViews,
        retentionPercent: null,
      }),
    [video, keyword, competitorViews]
  );

  // Pre-publish distribution check against YouTube's OFFICIAL traffic-source taxonomy.
  // Recomputes live as the AI draft is edited, so the checks describe what you're about to
  // publish rather than what's already live.
  const distribution: SurfaceReport[] = useMemo(
    () =>
      checkDistribution({
        video: draft
          ? { ...video, title: draft.title, description: withHashtags(draft.description, draft.hashtags), tags: draft.tags }
          : video,
        targetKeyword: keyword.trim() || null,
      }),
    [video, draft, keyword]
  );
  const surfacesPassing = distribution.filter((s) => s.status === 'pass').length;

  const handleCheckCompetition = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw) return;
    if (youtubeApiKeys.length === 0) {
      setError('Tambahkan minimal 1 API key YouTube dulu (klik status di kanan atas).');
      return;
    }
    if (searchBudgetLeft <= 0) {
      setError('Jatah search.list hari ini (~100) sudah habis. Coba lagi besok.');
      return;
    }
    setCheckingComp(true);
    setError(null);
    try {
      const { result: hits, nextKeyIndex } = await executeApiCallWithRotation(
        (key) => searchVideosByKeyword(kw, key),
        youtubeApiKeys,
        youtubeApiKeyIndex,
        'youtube-search'
      );
      recordSearchListCall();
      const { result: sample, nextKeyIndex: idx2 } = await executeApiCallWithRotation(
        (key) => getVideoTagsAndStats(hits, key),
        youtubeApiKeys,
        nextKeyIndex,
        'youtube-videos'
      );
      recordUnits(Math.ceil(hits.length / 50) * QUOTA_COST.videosList);
      setYoutubeApiKeyIndex(idx2);
      setCompetitorViews(sample.map((s) => s.viewCount));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengecek kompetisi.');
    } finally {
      setCheckingComp(false);
    }
  }, [keyword, youtubeApiKeys, youtubeApiKeyIndex, setYoutubeApiKeyIndex, recordSearchListCall, recordUnits, searchBudgetLeft]);

  const handleGenerateMeta = useCallback(async () => {
    setBusyMeta(true);
    setError(null);
    setSuccess(null);
    try {
      setDraft(
        await generateOptimizedMetadata(geminiKeys, {
          currentTitle: video.title,
          currentDescription: video.description,
          currentTags: video.tags,
          niche,
          targetKeyword: keyword.trim() || null,
          market,
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat metadata teroptimasi.');
    } finally {
      setBusyMeta(false);
    }
  }, [geminiKeys, video, niche, keyword, market]);

  const handleApplyMeta = useCallback(async () => {
    if (!accessToken || !draft) return;
    setApplyingMeta(true);
    setError(null);
    setSuccess(null);
    try {
      const description = withHashtags(draft.description, draft.hashtags);
      const patch = { title: draft.title, description, tags: draft.tags };
      await updateVideoMetadata(video.videoId, patch, accessToken);
      recordUnits(QUOTA_COST.videosUpdate);
      onLocalPatch(video.videoId, patch);
      setSuccess('Judul, deskripsi & tag baru sudah tersimpan ke YouTube.');
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan ke YouTube.');
    } finally {
      setApplyingMeta(false);
    }
  }, [accessToken, draft, video.videoId, recordUnits, onLocalPatch]);

  const handleDisclose = useCallback(async () => {
    if (!accessToken) return;
    setDisclosing(true);
    setError(null);
    setSuccess(null);
    try {
      await discloseSyntheticMedia(video.videoId, accessToken);
      recordUnits(QUOTA_COST.videosUpdate);
      setDisclosed(true);
      setSuccess(
        'Ditandai sebagai konten AI/sintetis. Catatan: YouTube tidak menyediakan cara membaca status ini lewat API, jadi app tidak bisa memverifikasinya — konfirmasi di YouTube Studio.'
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menandai konten AI.');
    } finally {
      setDisclosing(false);
    }
  }, [accessToken, video.videoId, recordUnits]);

  const handleGenerateThumb = useCallback(async () => {
    setBusyThumb(true);
    setError(null);
    setSuccess(null);
    setThumb(null);
    setConceptOnly(false);
    let c: ThumbnailConcept | null = null;
    try {
      c = await generateThumbnailConcept(geminiKeys, {
        title: draft?.title || video.title,
        niche,
        market,
      });
      setConcept(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat konsep thumbnail.');
      setBusyThumb(false);
      return;
    }
    // We assemble the image prompt ourselves so the dual-theme physics are guaranteed rather
    // than left to whatever the concept call felt like restating. Surface it so the user can
    // copy it into any image tool — essential now that in-app render needs a billing-enabled
    // key, but the prompt itself is free to produce.
    const assembledPrompt = buildThumbnailPrompt({ ...c, market });
    setImagePrompt(assembledPrompt);
    try {
      const raw = await generateThumbnailImage(geminiKeys, assembledPrompt);
      setThumb(await processThumbnail(raw));
    } catch (e) {
      // Quota is the expected failure on a free-tier key — degrade to concept-only rather
      // than throwing away the concept we just paid for.
      if (isQuotaError(e)) setConceptOnly(true);
      else setError(e instanceof Error ? e.message : 'Gagal menggambar thumbnail.');
    } finally {
      setBusyThumb(false);
    }
  }, [geminiKeys, draft, video.title, niche, market]);

  const handleApplyThumb = useCallback(async () => {
    if (!accessToken || !thumb) return;
    setApplyingThumb(true);
    setError(null);
    setSuccess(null);
    try {
      await setVideoThumbnail(video.videoId, thumb.blob, accessToken);
      recordUnits(QUOTA_COST.videosUpdate);
      setSuccess('Thumbnail baru sudah dipasang ke video. Cek di YouTube Studio.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memasang thumbnail.');
    } finally {
      setApplyingThumb(false);
    }
  }, [accessToken, thumb, video.videoId, recordUnits]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 flex items-start gap-2.5 text-sm text-danger">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-success/30 bg-success-bg px-4 py-3 flex items-start gap-2.5 text-sm text-success">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {/* Target + competition */}
      <Card padding="md" className="space-y-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" strokeWidth={2} />
          <h3 className="text-sm font-semibold">Target</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-faint">Keyword target</label>
            <input
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setCompetitorViews(null);
              }}
              placeholder="smooth jazz for work"
              className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <MarketSelect value={market} onChange={setMarket} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            icon={<Radar className="w-3.5 h-3.5" />}
            loading={checkingComp}
            disabled={!keyword.trim() || checkingComp}
            onClick={handleCheckCompetition}
          >
            Cek Kompetisi (data asli)
          </Button>
          <span className="text-[11px] text-text-faint">
            1 jatah search + ~1 unit. Sisa hari ini: <span className="font-mono tabular-nums">{searchBudgetLeft}</span>
          </span>
          {competitorViews && (
            <Badge tone="success" dot>
              {competitorViews.length} video kompetitor terbaca
            </Badge>
          )}
        </div>
      </Card>

      {/* Pre-publish distribution check — official YouTube traffic sources only */}
      <Card padding="md" className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Route className="w-4 h-4 text-primary" strokeWidth={2} />
          <h3 className="text-sm font-semibold">Cek Distribusi (sumber trafik resmi YouTube)</h3>
          <Badge tone={surfacesPassing === distribution.length ? 'success' : 'warning'}>
            {surfacesPassing}/{distribution.length} surface lolos
          </Badge>
        </div>

        <div className="space-y-2.5">
          {distribution.map((s) => (
            <div key={s.id} className="rounded-lg border border-border bg-surface-raised/40 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface/60">
                {s.status === 'pass' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0" />
                )}
                <p className="text-xs font-semibold">{s.officialName}</p>
                <span className="text-[10px] text-text-faint tabular-nums ml-auto">
                  {s.passed} lolos · {s.failed} gagal
                </span>
              </div>
              <div className="p-2.5 space-y-1.5">
                <p className="text-[10px] text-text-faint leading-relaxed italic">{s.definition}</p>
                {s.checks.map((c) => (
                  <div key={c.id} className="flex items-start gap-2">
                    <span
                      className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                        c.status === 'pass' ? 'bg-success' : c.status === 'fail' ? 'bg-danger' : 'bg-text-faint'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-text flex items-center gap-1.5 flex-wrap">
                        {c.label}
                        {c.status === 'manual' && (
                          <span className="text-[9px] text-text-faint border border-border rounded px-1">
                            cek manual
                          </span>
                        )}
                        {c.official && (
                          <span className="text-[9px] text-info border border-info/30 rounded px-1">resmi</span>
                        )}
                      </p>
                      {c.status !== 'pass' && (
                        <p className="text-[11px] text-text-muted leading-relaxed mt-0.5">{c.fix}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-info/30 bg-info-bg px-3 py-2.5 text-[11px] leading-relaxed text-text-muted">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 translate-y-0.5 text-info" strokeWidth={2} />
          <div className="space-y-1.5">
            <p>{DISTRIBUTION_DISCLAIMER}</p>
            <p>{TAGS_NOTE}</p>
          </div>
        </div>
      </Card>

      {/* SECONDARY: the weighted estimate. Deliberately demoted below the official check —
          these weights are OUR design, not YouTube's (YouTube publishes no weights at all),
          so the officially-grounded pass/fail leads and this is only a relative compass. */}
      <Card padding="md" className="space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Radar className="w-3.5 h-3.5 text-text-muted" strokeWidth={2} />
          <h3 className="text-xs font-semibold text-text-muted">Indikator sekunder — estimasi kesiapan</h3>
          <Badge tone="neutral">perkiraan, bukan angka YouTube</Badge>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {readiness.surfaces.map((s) => {
            const Icon = SURFACE_ICON[s.surface];
            return (
              <div key={s.surface} className="rounded-md border border-border bg-surface-raised/40 px-2.5 py-2">
                <div className="flex items-center gap-1 mb-0.5">
                  <Icon className="w-3 h-3 text-text-faint" strokeWidth={2} />
                  <p className="text-[10px] text-text-faint truncate">{s.label}</p>
                </div>
                <p className={`text-base font-semibold font-mono tabular-nums leading-none ${scoreTone(s.score)}`}>
                  {s.score}
                  <span className="text-[10px] text-text-faint">/100</span>
                </p>
                <p className="text-[9px] text-text-faint mt-0.5">{CONF_LABEL[s.confidence]}</p>
              </div>
            );
          })}
        </div>

        <WhyToggle label="Lihat komponen & bobotnya">
          <div className="space-y-1">
            {readiness.components.map((c) => (
              <p key={c.key}>
                <span className="font-medium text-text">
                  {c.label}: {c.score}/100
                </span>{' '}
                {c.measured ? '' : '(belum diukur) '}
                — {c.detail}
              </p>
            ))}
            <p className="pt-1">
              Bobot per pintu — Search: 35% keyword, 25% peluang, 20% metadata, 15% retensi, 5% packaging ·
              Suggested: 25% packaging, 25% retensi, 20% keyword · Browse: 35% packaging, 35% retensi.
            </p>
            <p>
              <span className="font-medium text-text">Bobot ini pilihan desain kami, bukan bobot YouTube.</span>{' '}
              YouTube tidak pernah mempublikasikan bobot sinyal apa pun. Pakai angka ini sebagai kompas relatif
              (naik/turun setelah kamu perbaiki sesuatu), bukan sebagai kebenaran. Yang berdasar resmi adalah Cek
              Distribusi di atas.
            </p>
          </div>
        </WhyToggle>
      </Card>

      {/* AI metadata rewrite */}
      <Card padding="md" className="space-y-3">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-primary" strokeWidth={2} />
          <h3 className="text-sm font-semibold">Tulis Ulang dengan AI, lalu Terapkan</h3>
        </div>
        <Button icon={<Wand2 className="w-4 h-4" />} loading={busyMeta} disabled={busyMeta} onClick={handleGenerateMeta}>
          {draft ? 'Buat Ulang' : 'Buat Versi Teroptimasi'}
        </Button>

        {busyMeta && <Loader label="Gemini menulis ulang metadata..." size="sm" />}

        {draft && (
          <div className="space-y-3 animate-slide-up">
            <div>
              <label className="text-xs text-text-faint">Judul baru ({draft.title.length} karakter)</label>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-text-faint">Deskripsi baru</label>
              <textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={8}
                className="mt-1 w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-text-faint">Tag baru ({draft.tags.length})</label>
              <input
                value={draft.tags.join(', ')}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
                className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm font-mono outline-none focus:border-primary"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {draft.hashtags.map((h) => (
                <span key={h} className="rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[11px] font-mono">
                  #{h.replace(/^#/, '')}
                </span>
              ))}
            </div>
            <WhyToggle>
              <p>{draft.why}</p>
            </WhyToggle>
            <Button
              icon={<CheckCircle2 className="w-4 h-4" />}
              loading={applyingMeta}
              disabled={applyingMeta || !canWrite}
              onClick={handleApplyMeta}
            >
              Terapkan ke YouTube (50 unit)
            </Button>
          </div>
        )}
      </Card>

      {/* AI content disclosure — 2026 requirement for AI-generated music */}
      <Card padding="md" className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" strokeWidth={2} />
          <h3 className="text-sm font-semibold">Pengungkapan konten AI (wajib 2026)</h3>
        </div>
        <p className="text-xs text-text-muted">
          Sejak 2026 <strong>&ldquo;AI generated music&rdquo;</strong> masuk daftar yang wajib diungkap. Dan ini
          resmi: <em>&ldquo;Disclosing AI content won&rsquo;t limit a video&rsquo;s audience or impact its
          eligibility to earn money.&rdquo;</em> Label AI juga{' '}
          <em>&ldquo;does not change how a video is recommended&rdquo;</em>. Jadi menandai itu{' '}
          <strong>gratis</strong> — tidak mengungkap justru berisiko sanksi YPP.
        </p>
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-text-muted">
          <strong className="text-text">Ini BISA dibatalkan — bukan label permanen.</strong> Pengungkapan
          yang kamu set sendiri (tombol ini / toggle &ldquo;Altered or synthetic content&rdquo; di Studio)
          resmi bisa diubah lagi: <em>&ldquo;you can change it in most cases by selecting No in the AI
          disclosure survey under Attributes.&rdquo;</em> Label <strong>permanen</strong> yang tak bisa
          dilepas itu mekanisme <em>berbeda</em> — cuma untuk video yang dibuat pakai alat AI YouTube
          sendiri (Veo/Dream Screen) atau file dengan kredensial C2PA yang menyatakan{' '}
          <em>&ldquo;the entire video was made with AI&rdquo;</em>. Musik Suno di bawah gambar biasa{' '}
          <strong>tidak</strong> masuk kategori itu.
        </div>
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-muted">
          <strong className="text-text">Dua batas jujur:</strong> (1) YouTube{' '}
          <strong>tidak menyediakan cara membaca</strong> status ini lewat API, jadi app tidak bisa tahu
          video mana yang sudah ditandai — makanya aku sengaja <strong>tidak</strong> membuat cek otomatis
          (cuma akan menebak). (2) Membatalkan yang terdokumentasi resmi itu lewat <strong>Studio</strong>
          (Attributes → survei AI → pilih &ldquo;No&rdquo;); membatalkan lewat API belum dinyatakan resmi.
          Jadi kalau nanti mau melepas, lakukan di Studio, bukan lewat app.
        </div>
        <Button
          icon={<ShieldCheck className="w-4 h-4" />}
          loading={disclosing}
          disabled={disclosing || disclosed || !canWrite}
          onClick={handleDisclose}
        >
          {disclosed ? 'Sudah ditandai ✓' : 'Tandai sebagai konten AI/sintetis (50 unit)'}
        </Button>
      </Card>

      {/* AI thumbnail */}
      <Card padding="md" className="space-y-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-primary" strokeWidth={2} />
          <h3 className="text-sm font-semibold">Thumbnail AI (aman di tema gelap & terang)</h3>
        </div>
        <Button icon={<ImageIcon className="w-4 h-4" />} loading={busyThumb} disabled={busyThumb} onClick={handleGenerateThumb}>
          {thumb ? 'Buat Ulang Thumbnail' : 'Buat Konsep + Gambar'}
        </Button>

        {busyThumb && <Loader label="Gemini merancang konsep lalu menggambar thumbnail..." size="sm" />}

        {concept && (
          <div className="rounded-lg border border-border bg-surface-raised/50 p-2.5 text-xs space-y-1">
            <p>
              <span className="text-text-faint">Scene:</span> {concept.scene}
            </p>
            {concept.text && (
              <p>
                <span className="text-text-faint">Teks:</span> {concept.text}
              </p>
            )}
            <p>
              <span className="text-text-faint">Palet:</span> {concept.palette}
            </p>
            <WhyToggle>
              <p>{concept.why}</p>
            </WhyToggle>
          </div>
        )}

        {imagePrompt && (
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-text">
                Prompt gambar (photorealistic) — tempel ke tool gambar mana pun
              </p>
              <CopyButton text={imagePrompt} />
            </div>
            <textarea
              readOnly
              value={imagePrompt}
              onFocus={(e) => e.currentTarget.select()}
              rows={7}
              className="w-full resize-y rounded-md border border-border bg-bg px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-text-muted outline-none focus:border-primary"
            />
            <p className="text-[10px] leading-relaxed text-text-faint">
              Ini prompt yang sama yang dipakai app — sudah dikunci untuk hasil <strong>foto asli</strong> (kamera/lensa/
              depth) dan <strong>lolos di tema gelap &amp; terang</strong> YouTube. Tempel ke Gemini/AI Studio (butuh
              billing), Nano Banana, atau image tool lain. Kalau subjeknya <strong>orang asli</strong> (mis. atlet), lihat
              catatan di bawah.
            </p>
          </div>
        )}

        {conceptOnly && concept && (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2.5 text-[11px] leading-relaxed text-text-muted">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 translate-y-0.5 text-warning" strokeWidth={2} />
            <p>
              <span className="font-medium text-text">Konsepnya jadi, gambarnya belum — dan ini bukan &ldquo;limit
              harian&rdquo;.</span>{' '}
              Pembuatan gambar <strong>tidak tersedia di free tier Gemini</strong>: semua model gambar (Nano Banana /
              Gemini Image) butuh <strong>project Google Cloud dengan billing aktif</strong>. Kalau dashboard-mu
              menampilkan <strong>0/0</strong> untuk model gambar, itu tandanya — free tier memang 0 kuota gambar,
              jadi menambah key gratis <em>tidak</em> membantu. Pilihan: (1) aktifkan billing di satu project lalu
              pakai key-nya, atau (2) pakai konsep di atas untuk render manual di Canva. Konsepnya sendiri (dari
              model teks) tetap masuk jatah gratis.
            </p>
          </div>
        )}

        {imagePrompt && (
          <div className="rounded-lg border border-border bg-surface-raised/40 px-2.5 py-2 text-[10px] leading-relaxed text-text-faint">
            <strong className="text-text-muted">Catatan orang asli:</strong> kalau prompt menyebut{' '}
            <em>orang nyata yang dikenali</em> (mis. atlet seperti Megawati), gambar foto-realistis buatan AI dari
            wajahnya itu <strong>media sintetis dari orang asli</strong> — bisa kena isu hak keserupaan/publisitas dan
            wajib diungkap sebagai konten AI. Untuk atlet/figur nyata, lebih aman pakai <strong>foto asli berlisensi</strong>{' '}
            atau gaya <strong>non-foto (ilustrasi/stilasi)</strong>. Untuk musik/alam/ambience (channel Somatic-mu),
            foto-realistis bebas masalah.
          </div>
        )}

        {thumb && (
          <div className="space-y-2.5 animate-slide-up">
            {/* Both themes side by side — this is the actual dual-theme check. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded-lg p-3 bg-white">
                <p className="text-[10px] text-neutral-500 mb-1.5">Tema terang YouTube</p>
                <img src={thumb.dataUrl} alt="Pratinjau thumbnail di tema terang" className="w-full rounded" />
              </div>
              <div className="rounded-lg p-3" style={{ background: '#0F0F0F' }}>
                <p className="text-[10px] text-neutral-400 mb-1.5">Tema gelap YouTube</p>
                <img src={thumb.dataUrl} alt="Pratinjau thumbnail di tema gelap" className="w-full rounded" />
              </div>
            </div>
            <p className="text-[11px] text-text-faint">
              1280×720 · {(thumb.sizeBytes / 1024).toFixed(0)} KB · garis tepi ganda (putih+hitam) dipasang otomatis
              supaya bingkainya tetap kelihatan di kedua tema.
              {thumb.edgeRisk && ' Tepi gambar aslinya nyaris putih/hitam — garis tepi inilah yang menyelamatkannya.'}
            </p>
            <Button
              icon={<CheckCircle2 className="w-4 h-4" />}
              loading={applyingThumb}
              disabled={applyingThumb || !canWrite}
              onClick={handleApplyThumb}
            >
              Pasang sebagai Thumbnail (50 unit)
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};
