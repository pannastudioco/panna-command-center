import React, { useState, useCallback, useEffect } from 'react';
import type { QuotaState, RankSnapshot } from '@/types';
import { resolveChannel, findVideoRankForKeyword } from '@/services/youtubeDataService';
import { executeApiCallWithRotation } from '@/services/apiExecutor';
import { useRankTracker } from '@/hooks/useRankTracker';
import { SEARCH_LIST_DAILY_CAP, QUOTA_COST } from '@/constants/quotas';
import { Card } from '@/components/shared/ui/Card';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { StrategyPanel, Example, Sample, Why } from '@/components/shared/ui/StrategyPanel';
import { Plus, Trash2, RefreshCw, Target, AlertCircle, ChevronDown, Radar } from 'lucide-react';

interface Props {
  youtubeApiKeys: string[];
  youtubeApiKeyIndex: number;
  setYoutubeApiKeyIndex: (idx: number) => void;
  quota: QuotaState;
  recordUnits: (units: number) => void;
  recordSearchListCall: () => void;
}

const CHANNEL_KEY = 'pcc.myChannelForRank';
interface MyChannel {
  channelId: string;
  title: string;
}

/** Tiny inline sparkline of rank over time. Rank is inverted (1 = best = top), so the
 * line is drawn with rank 1 near the top. Not-found checks (rank null) break the line. */
const RankSparkline: React.FC<{ history: RankSnapshot[] }> = ({ history }) => {
  if (history.length < 2) return null;
  const w = 120;
  const h = 28;
  const ranks = history.map((s) => s.rank);
  const found = ranks.filter((r): r is number => r !== null);
  const maxRank = Math.max(10, ...found);
  const pts = history.map((s, i) => {
    const x = (i / (history.length - 1)) * w;
    // rank 1 → y near 0 (top); worse rank → lower.
    const y = s.rank === null ? h : ((s.rank - 1) / (maxRank - 1 || 1)) * (h - 4) + 2;
    return { x, y, found: s.rank !== null };
  });
  const line = pts
    .filter((p) => p.found)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} className="shrink-0">
      <path d={line} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => p.found && <circle key={i} cx={p.x} cy={p.y} r={2} fill="var(--color-primary)" />)}
    </svg>
  );
};

export const RankTracker: React.FC<Props> = ({
  youtubeApiKeys,
  youtubeApiKeyIndex,
  setYoutubeApiKeyIndex,
  quota,
  recordUnits,
  recordSearchListCall,
}) => {
  const { keywords, addKeyword, removeKeyword, recordRank, getHistory } = useRankTracker();
  const [open, setOpen] = useState(false);
  const [myChannel, setMyChannel] = useState<MyChannel | null>(() => {
    try {
      const raw = localStorage.getItem(CHANNEL_KEY);
      return raw ? (JSON.parse(raw) as MyChannel) : null;
    } catch {
      return null;
    }
  });
  const [channelInput, setChannelInput] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [historyByKeyword, setHistoryByKeyword] = useState<Map<string, RankSnapshot[]>>(new Map());
  const [checkingKeyword, setCheckingKeyword] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchBudgetLeft = SEARCH_LIST_DAILY_CAP - quota.searchListCallsUsed;

  // Load history for all tracked keywords when opened.
  useEffect(() => {
    if (!open) return;
    let ignore = false;
    (async () => {
      const map = new Map<string, RankSnapshot[]>();
      for (const k of keywords) {
        map.set(k.keyword, await getHistory(k.keyword));
      }
      if (!ignore) setHistoryByKeyword(map);
    })();
    return () => {
      ignore = true;
    };
  }, [open, keywords, getHistory]);

  const persistChannel = useCallback((c: MyChannel | null) => {
    setMyChannel(c);
    try {
      if (c) localStorage.setItem(CHANNEL_KEY, JSON.stringify(c));
      else localStorage.removeItem(CHANNEL_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const handleResolveChannel = useCallback(async () => {
    if (!channelInput.trim() || youtubeApiKeys.length === 0) {
      setError(youtubeApiKeys.length === 0 ? 'Tambahkan API key dulu.' : null);
      return;
    }
    setError(null);
    setIsResolving(true);
    try {
      const { result, nextKeyIndex } = await executeApiCallWithRotation(
        (key) => resolveChannel(channelInput.trim(), key),
        youtubeApiKeys,
        youtubeApiKeyIndex,
        'youtube-channels'
      );
      recordUnits(QUOTA_COST.channelsList);
      setYoutubeApiKeyIndex(nextKeyIndex);
      persistChannel({ channelId: result.channelId, title: result.title });
      setChannelInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengenali channel.');
    } finally {
      setIsResolving(false);
    }
  }, [channelInput, youtubeApiKeys, youtubeApiKeyIndex, setYoutubeApiKeyIndex, recordUnits, persistChannel]);

  const handleCheck = useCallback(
    async (keyword: string) => {
      if (!myChannel || youtubeApiKeys.length === 0) return;
      if (searchBudgetLeft <= 0) {
        setError('Jatah search.list hari ini sudah habis. Coba lagi besok.');
        return;
      }
      setError(null);
      setCheckingKeyword(keyword);
      try {
        const { result, nextKeyIndex } = await executeApiCallWithRotation(
          (key) => findVideoRankForKeyword(keyword, myChannel.channelId, key),
          youtubeApiKeys,
          youtubeApiKeyIndex,
          'youtube-search'
        );
        recordSearchListCall();
        setYoutubeApiKeyIndex(nextKeyIndex);
        await recordRank({
          keyword,
          rank: result.rank,
          foundVideoId: result.foundVideoId,
          foundTitle: result.foundTitle,
        });
        setHistoryByKeyword((prev) => {
          const next = new Map(prev);
          next.set(keyword, [...(prev.get(keyword) ?? []).filter((s) => s.dateISO !== todayISOLocal()), {
            keyword,
            dateISO: todayISOLocal(),
            rank: result.rank,
            foundVideoId: result.foundVideoId,
            foundTitle: result.foundTitle,
          }]);
          return next;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal cek ranking.');
      } finally {
        setCheckingKeyword(null);
      }
    },
    [myChannel, youtubeApiKeys, youtubeApiKeyIndex, setYoutubeApiKeyIndex, searchBudgetLeft, recordSearchListCall, recordRank]
  );

  return (
    <Card padding="none" className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-2 hover:bg-surface-hover transition-colors"
      >
        <Radar className="w-4 h-4 text-primary" strokeWidth={2} />
        <h3 className="text-sm font-semibold">Rank Tracker</h3>
        <span className="text-[11px] text-text-faint">Lacak posisi video kamu di pencarian</span>
        <ChevronDown className={`w-4 h-4 ml-auto text-text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border animate-slide-up">
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 flex items-start gap-2 text-xs text-danger">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <StrategyPanel title="Cara baca & pakai Rank Tracker">
            <p>
              Rank Tracker mengecek video KAMU nangkring di <strong>posisi berapa</strong> saat orang mengetik satu
              kata kunci di search YouTube. Set channel sekali (1 unit), tambah kata kunci yang kamu incar, klik cek.
              App mencari video kamu di 50 hasil teratas untuk kata itu.
            </p>
            <Example label="Cara baca angka posisinya">
              <p><strong>#1&ndash;#10</strong> (hijau) — halaman pertama. Ini yang bikin views organik.</p>
              <p><strong>#11&ndash;#30</strong> (kuning) — kelihatan, tapi perlu didorong sedikit lagi.</p>
              <p><strong>#31&ndash;#50</strong> (abu) — masih jauh di bawah.</p>
              <p><strong>&ldquo;Tidak masuk top 50&rdquo;</strong> — video kamu belum keluar sama sekali untuk kata itu.</p>
            </Example>
            <Example label="Garis kecil (sparkline) itu apa">
              <p>Riwayat posisi tiap kali kamu cek. Garis naik ke atas = posisi <strong>membaik</strong> dari waktu ke waktu. Titik putus = hari itu tak masuk top 50.</p>
              <Why>posisi tak berubah tiap jam, jadi cek 1&ndash;2x seminggu per kata kunci sudah cukup. Tiap cek makan 1 dari ~100 jatah search harian, jadi jangan diborosin.</Why>
            </Example>
            <Example label="Cara bertindak (contoh niche kamu)">
              <p>Kamu di posisi <Sample>#15 · smooth jazz for work</Sample> Itu peluang emas: sudah dekat halaman satu.</p>
              <p>Langkah: pakai frasa persis &ldquo;smooth jazz for work&rdquo; di judul + baris pertama deskripsi, perbaiki retensi 30 detik pertama, lalu pantau seminggu — harusnya merangkak naik.</p>
              <p>Kalau &ldquo;tidak masuk top 50&rdquo; terus, kata kuncinya kemungkinan terlalu berat. Bidik yang lebih spesifik (mis. tambah &ldquo;cozy&rdquo; atau &ldquo;rainy night&rdquo;).</p>
            </Example>
          </StrategyPanel>

          {/* Channel setup */}
          {!myChannel ? (
            <div className="space-y-2">
              <p className="text-xs text-text-muted">
                Set channel kamu dulu (1 unit) supaya bisa mencari posisi video kamu di hasil pencarian.
              </p>
              <div className="flex gap-2">
                <input
                  value={channelInput}
                  onChange={(e) => setChannelInput(e.target.value)}
                  placeholder="Link/@handle/ID channel kamu"
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <Button size="sm" loading={isResolving} disabled={!channelInput.trim() || isResolving} onClick={handleResolveChannel}>
                  Set
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <Target className="w-3.5 h-3.5 text-primary" />
              <span className="text-text-muted">Melacak untuk:</span>
              <span className="font-medium">{myChannel.title}</span>
              <button onClick={() => persistChannel(null)} className="ml-auto text-text-faint hover:text-danger">
                ganti
              </button>
            </div>
          )}

          {myChannel && (
            <>
              {/* Add keyword */}
              <div className="flex gap-2">
                <input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newKeyword.trim()) {
                      addKeyword(newKeyword);
                      setNewKeyword('');
                    }
                  }}
                  placeholder="Kata kunci untuk dilacak"
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus className="w-3.5 h-3.5" />}
                  disabled={!newKeyword.trim()}
                  onClick={() => {
                    addKeyword(newKeyword);
                    setNewKeyword('');
                  }}
                >
                  Tambah
                </Button>
              </div>

              <p className="text-[11px] text-text-faint">
                Tiap cek = 1 panggilan search.list. Sisa jatah hari ini:{' '}
                <span className="font-mono tabular-nums">{searchBudgetLeft}</span>/{SEARCH_LIST_DAILY_CAP}.
              </p>

              {/* Tracked keywords */}
              {keywords.length === 0 ? (
                <p className="text-xs text-text-faint py-2">Belum ada kata kunci dilacak.</p>
              ) : (
                <div className="space-y-1.5">
                  {keywords.map((k) => {
                    const history = historyByKeyword.get(k.keyword) ?? [];
                    const latest = history[history.length - 1];
                    return (
                      <div key={k.keyword} className="rounded-lg border border-border bg-surface px-3 py-2 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{k.keyword}</p>
                          {latest && (
                            <p className="text-[11px] text-text-faint mt-0.5">
                              {latest.rank === null ? (
                                <span>Tidak masuk top 50</span>
                              ) : (
                                <>
                                  Posisi <span className="font-mono tabular-nums text-text-muted">#{latest.rank}</span> ·{' '}
                                  {latest.dateISO}
                                </>
                              )}
                            </p>
                          )}
                        </div>
                        <RankSparkline history={history} />
                        {latest && (
                          <Badge tone={latest.rank === null ? 'neutral' : latest.rank <= 10 ? 'success' : latest.rank <= 30 ? 'warning' : 'neutral'}>
                            {latest.rank === null ? '—' : `#${latest.rank}`}
                          </Badge>
                        )}
                        <button
                          onClick={() => handleCheck(k.keyword)}
                          disabled={checkingKeyword === k.keyword || searchBudgetLeft <= 0}
                          aria-label="Cek ranking sekarang"
                          className="shrink-0 rounded-md p-1.5 text-text-faint hover:bg-surface-hover hover:text-primary disabled:opacity-40 transition-colors"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${checkingKeyword === k.keyword ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => removeKeyword(k.keyword)}
                          aria-label="Hapus kata kunci"
                          className="shrink-0 rounded-md p-1.5 text-text-faint hover:bg-danger-bg hover:text-danger transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
};

function todayISOLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
