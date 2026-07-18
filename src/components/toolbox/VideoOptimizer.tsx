import React, { useState, useCallback, useMemo } from 'react';
import type { EditableVideo } from '@/types';
import { updateVideoMetadata } from '@/services/youtubeDataService';
import { QUOTA_COST } from '@/constants/quotas';
import { scoreVideoSeo } from '@/services/seoScoreService';
import { buildRecommendations, SURFACE_LABEL, type Recommendation, type AutoFix } from '@/services/seoAdvisorService';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { Badge } from '@/components/shared/ui/Badge';
import { ScoreRing } from '@/components/shared/ui/ScoreRing';
import { EmptyState } from '@/components/shared/ui/EmptyState';
import { AiOptimizerPanel } from './AiOptimizerPanel';
import {
  Gauge,
  Sparkles,
  Check,
  ChevronRight,
  Search,
  Users2,
  Home,
  Smile,
  CheckCircle2,
  AlertCircle,
  Wand2,
  ListVideo,
} from 'lucide-react';

interface Props {
  videos: EditableVideo[];
  accessToken: string | null;
  remainingUnitsToday: number;
  recordUnits: (units: number) => void;
  onLocalPatch: (videoId: string, patch: Partial<EditableVideo>) => void;
  /** Route the user to a sibling Toolbox tab (chapters / thumbnail). */
  onNavigateTool?: (tool: 'chapters' | 'thumbnail') => void;
  /** Gemini key enables the AI execution layer (rewrite + thumbnail). Null = not connected yet. */
  geminiKeys: string[];
  niche: string;
  youtubeApiKeys: string[];
  youtubeApiKeyIndex: number;
  setYoutubeApiKeyIndex: (idx: number) => void;
  recordSearchListCall: () => void;
  searchBudgetLeft: number;
}

const SURFACE_ICON = {
  search: Search,
  suggested: Users2,
  browse: Home,
  satisfaction: Smile,
} as const;

const IMPACT_TONE = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
} as const;

const IMPACT_LABEL = { high: 'Dampak tinggi', medium: 'Dampak sedang', low: 'Dampak kecil' } as const;

/** Compute the exact metadata patch an AutoFix produces, given the current video. Pure —
 * returned patch is fed to updateVideoMetadata AND to the local catalog patch so the
 * score recomputes without a refetch. */
function patchForFix(video: EditableVideo, fix: AutoFix): Partial<EditableVideo> {
  switch (fix.kind) {
    case 'add-tags':
      return { tags: [...video.tags, ...fix.tags] };
    case 'add-hashtags':
      return { description: `${video.description.replace(/\s+$/, '')}\n\n${fix.hashtags.join(' ')}` };
    case 'append-description':
      return { description: `${video.description.replace(/\s+$/, '')}${fix.block}` };
    case 'set-default-language':
      return { defaultLanguage: 'id' };
  }
}

function fixPatchToWrite(patch: Partial<EditableVideo>): Partial<Pick<EditableVideo, 'title' | 'description' | 'tags' | 'defaultLanguage'>> {
  const out: Partial<Pick<EditableVideo, 'title' | 'description' | 'tags' | 'defaultLanguage'>> = {};
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.description !== undefined) out.description = patch.description;
  if (patch.tags !== undefined) out.tags = patch.tags;
  if (patch.defaultLanguage !== undefined) out.defaultLanguage = patch.defaultLanguage;
  return out;
}

const RecommendationRow: React.FC<{
  rec: Recommendation;
  video: EditableVideo;
  isApplying: boolean;
  canWrite: boolean;
  onApply: (rec: Recommendation) => void;
  onNavigateTool?: (tool: 'chapters' | 'thumbnail') => void;
}> = ({ rec, video, isApplying, canWrite, onApply, onNavigateTool }) => {
  const SurfaceIcon = SURFACE_ICON[rec.surface];
  const fixPreview = rec.autoFix ? patchForFix(video, rec.autoFix) : null;

  return (
    <div className="rounded-lg border border-border bg-surface p-3.5 space-y-2 transition-colors hover:border-border-strong animate-slide-up">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 shrink-0 rounded-lg bg-surface-raised flex items-center justify-center">
          <SurfaceIcon className="w-4 h-4 text-text-muted" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium">{rec.title}</p>
            <Badge tone={IMPACT_TONE[rec.impact]}>{IMPACT_LABEL[rec.impact]}</Badge>
            <span className="text-[11px] text-text-faint">{SURFACE_LABEL[rec.surface]}</span>
          </div>
          <p className="text-xs text-text-muted mt-1 leading-relaxed">{rec.detail}</p>

          {rec.autoFix && (
            <div className="mt-2 rounded-md bg-surface-raised/70 border border-border px-2.5 py-2">
              <p className="text-[11px] text-text-faint mb-1">
                {rec.autoFix.kind === 'set-default-language'
                  ? rec.autoFix.note
                  : rec.autoFix.kind === 'append-description'
                    ? rec.autoFix.note
                    : 'Akan diterapkan:'}
              </p>
              {rec.autoFix.kind === 'add-tags' && (
                <div className="flex flex-wrap gap-1">
                  {rec.autoFix.tags.map((t) => (
                    <span key={t} className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-mono border border-border">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {rec.autoFix.kind === 'add-hashtags' && (
                <div className="flex flex-wrap gap-1">
                  {rec.autoFix.hashtags.map((h) => (
                    <span key={h} className="rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[11px] font-mono">
                      {h}
                    </span>
                  ))}
                </div>
              )}
              {(rec.autoFix.kind === 'append-description' || rec.autoFix.kind === 'set-default-language') && fixPreview?.description && (
                <p className="text-[11px] font-mono text-text-muted whitespace-pre-wrap line-clamp-3">
                  {fixPreview.description.slice(-160)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 pl-11">
        {rec.autoFix ? (
          <Button
            size="sm"
            variant="primary"
            icon={<Wand2 className="w-3.5 h-3.5" />}
            loading={isApplying}
            disabled={isApplying || !canWrite}
            onClick={() => onApply(rec)}
          >
            Terapkan (50 unit)
          </Button>
        ) : rec.toolHint === 'chapters' ? (
          <Button size="sm" variant="secondary" icon={<ChevronRight className="w-3.5 h-3.5" />} onClick={() => onNavigateTool?.('chapters')}>
            Buka Editor Chapter
          </Button>
        ) : rec.toolHint === 'thumbnail' ? (
          <Button size="sm" variant="secondary" icon={<ChevronRight className="w-3.5 h-3.5" />} onClick={() => onNavigateTool?.('thumbnail')}>
            Buka Mockup Thumbnail
          </Button>
        ) : (
          <span className="text-[11px] text-text-faint italic">Kerja kreatif — tidak bisa diterapkan otomatis</span>
        )}
      </div>
    </div>
  );
};

export const VideoOptimizer: React.FC<Props> = ({
  videos,
  accessToken,
  remainingUnitsToday,
  recordUnits,
  onLocalPatch,
  onNavigateTool,
  geminiKeys,
  niche,
  youtubeApiKeys,
  youtubeApiKeyIndex,
  setYoutubeApiKeyIndex,
  recordSearchListCall,
  searchBudgetLeft,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedVideo = useMemo(() => videos.find((v) => v.videoId === selectedId) ?? null, [videos, selectedId]);

  const audit = useMemo(
    () =>
      selectedVideo
        ? { score: scoreVideoSeo(selectedVideo), recs: buildRecommendations(selectedVideo) }
        : null,
    [selectedVideo]
  );

  const canWrite = Boolean(accessToken) && remainingUnitsToday >= QUOTA_COST.videosUpdate;

  const handleApply = useCallback(
    async (rec: Recommendation) => {
      if (!accessToken || !selectedVideo || !rec.autoFix) return;
      setApplyingId(rec.id);
      setError(null);
      setSuccess(null);
      try {
        const patch = patchForFix(selectedVideo, rec.autoFix);
        await updateVideoMetadata(selectedVideo.videoId, fixPatchToWrite(patch), accessToken);
        recordUnits(QUOTA_COST.videosUpdate);
        onLocalPatch(selectedVideo.videoId, patch);
        setSuccess(`"${rec.title}" diterapkan ke video. Skor SEO diperbarui.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal menerapkan perbaikan.');
      } finally {
        setApplyingId(null);
      }
    },
    [accessToken, selectedVideo, recordUnits, onLocalPatch]
  );

  if (videos.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={ListVideo}
          tone="primary"
          title="Muat katalog dulu"
          description="Setelah katalog termuat, pilih video untuk mendapat skor SEO + rencana peningkatan yang bisa langsung diterapkan."
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">
      {/* Picker */}
      <Card padding="none" className="overflow-hidden lg:sticky lg:top-6">
        <div className="px-4 py-3 border-b border-border bg-surface-raised/60">
          <h3 className="text-sm font-semibold">Pilih Video</h3>
        </div>
        <div className="max-h-[560px] overflow-y-auto custom-scrollbar p-2 space-y-1">
          {videos.map((v) => {
            const score = scoreVideoSeo(v).total;
            const tone = score >= 70 ? 'text-success' : score >= 50 ? 'text-warning' : 'text-danger';
            return (
              <button
                key={v.videoId}
                onClick={() => {
                  setSelectedId(v.videoId);
                  setError(null);
                  setSuccess(null);
                }}
                className={`w-full text-left rounded-lg p-2 flex gap-2.5 items-center transition-colors ${
                  selectedId === v.videoId ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-surface-hover'
                }`}
              >
                <div className="w-16 aspect-video shrink-0 rounded-md overflow-hidden bg-surface-raised">
                  {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium line-clamp-2 leading-snug">{v.title}</p>
                </div>
                <span className={`shrink-0 text-xs font-mono font-semibold tabular-nums ${tone}`}>{score}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Audit + recommendations */}
      <div className="min-w-0 space-y-4">
        {!selectedVideo || !audit ? (
          <Card padding="none">
            <EmptyState
              icon={Gauge}
              tone="primary"
              title="Pilih video untuk diaudit"
              description="Kamu akan dapat skor SEO, breakdown checklist, dan daftar perbaikan berprioritas yang bisa langsung diterapkan ke YouTube."
            />
          </Card>
        ) : (
          <>
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

            {/* Score + checklist */}
            <Card padding="md" glow="primary" className="flex flex-col sm:flex-row gap-5 items-start">
              <div className="flex items-center gap-4 shrink-0">
                <ScoreRing score={audit.score.total} size={72} label={`nilai ${audit.score.grade}`} />
                <div>
                  <p className="text-sm font-semibold line-clamp-2 max-w-[240px]">{selectedVideo.title}</p>
                  <p className="text-xs text-text-faint mt-1">Skor checklist transparan (bukan black-box)</p>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 min-w-0">
                {audit.score.checks.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-xs" title={c.hint}>
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        c.status === 'pass' ? 'bg-success' : c.status === 'warn' ? 'bg-warning' : 'bg-danger'
                      }`}
                    />
                    <span className="text-text-muted truncate flex-1">{c.label}</span>
                    <span className="font-mono tabular-nums text-text-faint">
                      {c.points}/{c.weight}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {/* AI execution layer — writes the new metadata/thumbnail and pushes them live. */}
            {geminiKeys.length > 0 ? (
              <AiOptimizerPanel
                video={selectedVideo}
                geminiKeys={geminiKeys}
                accessToken={accessToken}
                remainingUnitsToday={remainingUnitsToday}
                recordUnits={recordUnits}
                onLocalPatch={onLocalPatch}
                niche={niche}
                youtubeApiKeys={youtubeApiKeys}
                youtubeApiKeyIndex={youtubeApiKeyIndex}
                setYoutubeApiKeyIndex={setYoutubeApiKeyIndex}
                recordSearchListCall={recordSearchListCall}
                searchBudgetLeft={searchBudgetLeft}
              />
            ) : (
              <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-bg px-4 py-3 text-xs leading-relaxed text-text-muted">
                <AlertCircle className="w-4 h-4 shrink-0 translate-y-0.5 text-warning" strokeWidth={2} />
                <p>
                  <span className="font-medium text-text">Fitur AI belum aktif.</span> Sambungkan Gemini API key
                  di modul <strong>AI Studio</strong> sekali saja, lalu balik ke sini — kamu akan dapat tulis-ulang
                  judul/deskripsi/tag otomatis, thumbnail AI, dan estimasi kesiapan per pintu distribusi.
                </p>
              </div>
            )}

            {/* Recommendations */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Sparkles className="w-4 h-4 text-primary" strokeWidth={2} />
                <h3 className="text-sm font-semibold">Rencana Peningkatan</h3>
                <span className="text-xs text-text-faint tabular-nums">{audit.recs.length} rekomendasi</span>
              </div>

              {audit.recs.length === 0 ? (
                <Card padding="md" className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                  <p className="text-sm text-text-muted">Video ini sudah kuat di metadata. Fokus ke kualitas konten & thumbnail.</p>
                </Card>
              ) : (
                <div className="space-y-2.5">
                  {audit.recs.map((rec) => (
                    <RecommendationRow
                      key={rec.id}
                      rec={rec}
                      video={selectedVideo}
                      isApplying={applyingId === rec.id}
                      canWrite={canWrite}
                      onApply={handleApply}
                      onNavigateTool={onNavigateTool}
                    />
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-info/30 bg-info-bg px-4 py-3 text-xs leading-relaxed text-text-muted">
                <Check className="w-4 h-4 shrink-0 translate-y-0.5 text-info" strokeWidth={2} />
                <p>
                  <span className="font-medium text-text">Realistis, bukan jaminan.</span> Ini pengungkit
                  discovery yang terdokumentasi (Search/Suggested/Browse 2026) yang diterapkan ke hal yang
                  kamu kontrol — metadata. Pengungkit terbesar (kualitas konten, hook 30 detik, desain
                  thumbnail) tetap kerja kreatif kamu. Tidak ada tool yang bisa menjamin view atau
                  penempatan.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
