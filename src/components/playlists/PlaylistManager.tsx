import React, { useState, useCallback } from 'react';
import type { YoutubeAuthState, ConnectedChannelState, QuotaState } from '@/types';
import { QUOTA_COST, DAILY_UNIT_POOL } from '@/constants/quotas';
import type { OwnVideoCatalog } from '@/hooks/useOwnVideoCatalog';
import type { PlaylistManagerState } from '@/hooks/usePlaylistManager';
import { ChannelConnectionPanel } from '@/components/auth/ChannelConnectionPanel';
import { HelpPanel } from '@/components/shared/ui/HelpPanel';
import { StrategyPanel, Example, Sample, Why } from '@/components/shared/ui/StrategyPanel';
import { Loader } from '@/components/shared/Loader';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { EmptyState } from '@/components/shared/ui/EmptyState';
import {
  ListVideo,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  CheckCircle2,
  ListPlus,
  Lock,
  Globe,
  Link2,
  X,
  Gauge,
} from 'lucide-react';

interface Props {
  quota: QuotaState;
  auth: YoutubeAuthState;
  channel: ConnectedChannelState;
  catalog: OwnVideoCatalog;
  playlistState: PlaylistManagerState;
}

const PRIVACY_ICON: Record<string, React.ElementType> = {
  private: Lock,
  unlisted: Link2,
  public: Globe,
};

export const PlaylistManager: React.FC<Props> = ({ quota, auth, channel, catalog, playlistState }) => {
  const { isConnected, isConnecting, error: authError, connect, disconnect } = auth;
  const { channelInfo, isLoadingChannel } = channel;

  // Data + async mutations live in the shared app-level hook, so the playlist list and each
  // opened playlist's items survive a tab switch (no re-fetch / re-billing on return).
  const {
    playlists,
    hasLoaded,
    isLoadingPlaylists,
    selectedId,
    items,
    isLoadingItems,
    busy,
    error,
    success,
    loadPlaylists,
    selectPlaylist,
    create,
    removeItem,
    moveItem,
    addVideos,
    reset,
  } = playlistState;

  // Ephemeral form-only state (fine to lose on unmount — it holds no fetched data).
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPrivacy, setNewPrivacy] = useState<'private' | 'unlisted' | 'public'>('private');
  const [showAdd, setShowAdd] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());

  const remainingUnitsToday = DAILY_UNIT_POOL - quota.dataApiUnitsUsed;
  const selectedPlaylist = playlists.find((p) => p.playlistId === selectedId) ?? null;

  const handleCreate = useCallback(async () => {
    const ok = await create(newTitle, newPrivacy);
    if (ok) {
      setShowCreate(false);
      setNewTitle('');
    }
  }, [create, newTitle, newPrivacy]);

  const handleAddVideos = useCallback(async () => {
    await addVideos([...selectedVideoIds]);
    setSelectedVideoIds(new Set());
    setShowAdd(false);
  }, [addVideos, selectedVideoIds]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    reset();
    catalog.reset();
  }, [disconnect, reset, catalog]);

  const toggleVideo = useCallback((videoId: string) => {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }, []);

  const addCost = selectedVideoIds.size * QUOTA_COST.playlistItemsInsert;

  return (
    <div className="max-w-[1400px] space-y-6">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 ring-1 ring-primary/20 flex items-center justify-center">
          <ListVideo className="w-5 h-5 text-primary" strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gradient-brand">Playlist Manager</h1>
          <p className="text-sm text-text-muted mt-1 max-w-2xl">
            Kelola playlist channel — buat baru, tambah/hapus video, ubah urutan. Playlist{' '}
            <strong>disebut langsung oleh YouTube</strong> sebagai strategi pertumbuhan channel. Tiap penulisan
            = 50 unit kuota (ditampilkan sebelum aksi).
          </p>
        </div>
      </div>

      <HelpPanel>
        <p>
          <strong>Kelola playlist</strong> channel kamu langsung dari sini. Kenapa penting — dan ini{' '}
          <strong>resmi</strong>, bukan klaim kreator: halaman &ldquo;YouTube&rsquo;s Recommendation System&rdquo;
          punya bagian khusus <em>&ldquo;What does this mean for your channel growth strategy?&rdquo;</em> yang
          menganjurkan <em>&ldquo;use clear calls to action (example: If you liked this, then watch...), playlists,
          and end screens&rdquo;</em> dan <em>&ldquo;develop content series to encourage continued viewing&rdquo;</em>.
          Selain itu, definisi resmi trafik <strong>Suggested</strong> mencakup{' '}
          <em>&ldquo;links in video descriptions&rdquo;</em> — jadi menautkan playlist di deskripsi itu jalur
          Suggested resmi.
        </p>
        <p className="text-xs text-text-muted">
          <strong>Koreksi jujur:</strong> versi sebelumnya di app ini menyebut playlist bekerja lewat
          &ldquo;kontribusi sesi&rdquo;. Istilah itu <strong>tidak ada di dokumen resmi YouTube mana pun</strong> —
          itu karangan blog SEO yang sempat kami ulang. Anjuran playlist-nya tetap benar dan sekarang malah{' '}
          <strong>lebih kuat</strong> (resmi), tapi alasannya yang kami perbaiki.
        </p>
        <p>
          <strong>Cara pakai:</strong> klik &ldquo;Muat Playlist&rdquo; → pilih playlist di kiri → lihat &amp; kelola
          isinya di kanan. Kamu bisa <strong>buat playlist baru</strong>, <strong>tambah video</strong> dari katalog,{' '}
          <strong>hapus</strong>, dan <strong>ubah urutan</strong> (panah naik/turun).
        </p>
        <p>
          <strong>Catatan urutan:</strong> mengubah urutan cuma bisa kalau playlist di-set &ldquo;Manual&rdquo; di
          YouTube Studio (bukan urutan otomatis). Tiap aksi tulis = 50 unit kuota.
        </p>
      </HelpPanel>

      <StrategyPanel>
        <p>Untuk channel musik/relax, playlist itu mesin sesi. Tata pakai kegunaan, bukan sekadar genre:</p>
        <Example label="Susun playlist berdasarkan kegunaan (niche kamu)">
          <Sample>Cozy Café Mornings — Study &amp; Focus — Rainy Night Jazz — Sleep &amp; Deep Rest — Seasonal (Autumn/Winter)</Sample>
          <Why>orang datang dengan niat (&ldquo;buat tidur&rdquo;, &ldquo;buat kerja&rdquo;). Playlist per-kegunaan bikin autoplay menyambung satu video ke video kamu berikutnya, menumpuk jam tonton. Angka &ldquo;+22% view dari sesi&rdquo; yang beredar itu klaim vendor, bukan data resmi YouTube — perlakukan sebagai arah, bukan janji.</Why>
        </Example>
        <Example label="Langkah praktis">
          <p>Buat 4&ndash;5 playlist kegunaan di atas, masukkan tiap video baru ke playlist yang cocok, lalu di YouTube Studio set end screen video biar mengarah ke video berikutnya dalam playlist itu.</p>
          <p>Urutkan track dalam alur natural (pelan → makin dalam), dan set playlist ke &ldquo;Manual&rdquo; di Studio supaya bisa kamu atur urutannya dari sini.</p>
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
          <Button icon={<ListVideo className="w-4 h-4" />} loading={isLoadingPlaylists} onClick={() => loadPlaylists(hasLoaded)}>
            {hasLoaded ? 'Muat Ulang' : 'Muat Playlist Saya'}
          </Button>
          {hasLoaded && (
            <Button variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate((v) => !v)}>
              Buat Playlist Baru
            </Button>
          )}
          <span className="text-xs text-text-faint inline-flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5" /> Sisa kuota: <span className="font-mono tabular-nums">{remainingUnitsToday}</span>
          </span>
        </div>
      )}

      {showCreate && (
        <Card padding="md" className="space-y-3 animate-slide-up">
          <div className="flex items-center gap-2">
            <ListPlus className="w-4 h-4 text-primary" strokeWidth={2} />
            <h3 className="text-sm font-semibold">Playlist Baru</h3>
            <span className="text-[11px] text-text-faint ml-auto">50 unit</span>
          </div>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Judul playlist"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <div className="flex items-center gap-2">
            {(['private', 'unlisted', 'public'] as const).map((p) => {
              const Icon = PRIVACY_ICON[p];
              return (
                <button
                  key={p}
                  onClick={() => setNewPrivacy(p)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                    newPrivacy === p ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-muted hover:bg-surface-hover'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {p}
                </button>
              );
            })}
            <Button
              size="sm"
              className="ml-auto"
              loading={busy}
              disabled={!newTitle.trim() || busy || remainingUnitsToday < QUOTA_COST.playlistsInsert}
              onClick={handleCreate}
            >
              Buat
            </Button>
          </div>
        </Card>
      )}

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

      {isLoadingPlaylists && <Loader label="Memuat playlist..." size="sm" />}

      {!isLoadingPlaylists && hasLoaded && playlists.length === 0 && (
        <Card padding="none">
          <EmptyState icon={ListVideo} tone="primary" title="Belum ada playlist" description="Buat playlist pertama kamu dengan tombol di atas." />
        </Card>
      )}

      {playlists.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">
          {/* Playlist list */}
          <Card padding="none" className="overflow-hidden lg:sticky lg:top-6">
            <div className="px-4 py-3 border-b border-border bg-surface-raised/60">
              <h3 className="text-sm font-semibold">
                Playlist <span className="text-text-faint font-mono tabular-nums">({playlists.length})</span>
              </h3>
            </div>
            <div className="max-h-[560px] overflow-y-auto custom-scrollbar p-2 space-y-1">
              {playlists.map((p) => {
                const Icon = PRIVACY_ICON[p.privacyStatus] ?? Lock;
                return (
                  <button
                    key={p.playlistId}
                    onClick={() => selectPlaylist(p.playlistId)}
                    className={`w-full text-left rounded-lg p-2 flex gap-2.5 items-center transition-colors ${
                      selectedId === p.playlistId ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-surface-hover'
                    }`}
                  >
                    <div className="w-16 aspect-video shrink-0 rounded-md overflow-hidden bg-surface-raised">
                      {p.thumbnailUrl && <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium line-clamp-2 leading-snug">{p.title}</p>
                      <p className="text-[10px] text-text-faint mt-1 flex items-center gap-1">
                        <Icon className="w-3 h-3" /> {p.itemCount} video
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Selected playlist items */}
          <div className="min-w-0 space-y-4">
            {!selectedPlaylist ? (
              <Card padding="none">
                <EmptyState icon={ListVideo} tone="primary" title="Pilih playlist" description="Klik playlist di kiri untuk lihat & kelola isinya." />
              </Card>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{selectedPlaylist.title}</p>
                    <p className="text-xs text-text-faint tabular-nums">{items.length} video</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<ListPlus className="w-3.5 h-3.5" />}
                    className="ml-auto"
                    onClick={() => {
                      setShowAdd((v) => !v);
                      if (!catalog.hasLoaded && !catalog.isLoading) catalog.loadCatalog();
                    }}
                  >
                    Tambah Video
                  </Button>
                </div>

                {/* Add-videos panel */}
                {showAdd && (
                  <Card padding="md" className="space-y-3 animate-slide-up">
                    <div className="flex items-center gap-2">
                      <ListPlus className="w-4 h-4 text-primary" strokeWidth={2} />
                      <h3 className="text-sm font-semibold">Pilih video untuk ditambahkan</h3>
                      <button onClick={() => setShowAdd(false)} className="ml-auto text-text-faint hover:text-text" aria-label="Tutup">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {catalog.isLoading ? (
                      <Loader label="Memuat katalog..." size="sm" />
                    ) : catalog.videos.length === 0 ? (
                      <p className="text-xs text-text-faint">Tidak ada video di channel.</p>
                    ) : (
                      <>
                        <div className="max-h-72 overflow-y-auto custom-scrollbar grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {catalog.videos.map((v) => {
                            const picked = selectedVideoIds.has(v.videoId);
                            return (
                              <button
                                key={v.videoId}
                                onClick={() => toggleVideo(v.videoId)}
                                className={`text-left rounded-lg p-1.5 flex gap-2 items-center transition-colors ${
                                  picked ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-surface-hover'
                                }`}
                              >
                                <div className="w-14 aspect-video shrink-0 rounded overflow-hidden bg-surface-raised">
                                  {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
                                </div>
                                <p className="text-[11px] line-clamp-2 flex-1 min-w-0">{v.title}</p>
                                {picked && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            size="sm"
                            loading={busy}
                            disabled={selectedVideoIds.size === 0 || busy || remainingUnitsToday < addCost}
                            onClick={handleAddVideos}
                          >
                            Tambah {selectedVideoIds.size > 0 ? `${selectedVideoIds.size} video` : ''}
                          </Button>
                          {selectedVideoIds.size > 0 && (
                            <span className="text-xs text-text-faint tabular-nums">≈ {addCost} unit</span>
                          )}
                        </div>
                      </>
                    )}
                  </Card>
                )}

                {isLoadingItems ? (
                  <Loader label="Memuat isi playlist..." size="sm" />
                ) : items.length === 0 ? (
                  <Card padding="none">
                    <EmptyState icon={ListVideo} title="Playlist kosong" description="Tambahkan video dengan tombol di atas." />
                  </Card>
                ) : (
                  <Card padding="none" className="overflow-hidden">
                    <div className="divide-y divide-border max-h-[560px] overflow-y-auto custom-scrollbar">
                      {items.map((item, index) => (
                        <div key={item.playlistItemId} className="px-3 py-2 flex items-center gap-3 hover:bg-surface-hover transition-colors">
                          <span className="w-6 shrink-0 text-xs font-mono tabular-nums text-text-faint text-center">{index + 1}</span>
                          <div className="w-20 aspect-video shrink-0 rounded-md overflow-hidden bg-surface-raised">
                            {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
                          </div>
                          <p className="text-xs flex-1 min-w-0 line-clamp-2">{item.title}</p>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => moveItem(index, -1)}
                              disabled={index === 0 || busy}
                              aria-label="Naikkan"
                              className="rounded-md p-1.5 text-text-faint hover:bg-surface-raised hover:text-text disabled:opacity-30 transition-colors"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveItem(index, 1)}
                              disabled={index === items.length - 1 || busy}
                              aria-label="Turunkan"
                              className="rounded-md p-1.5 text-text-faint hover:bg-surface-raised hover:text-text disabled:opacity-30 transition-colors"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => removeItem(item)}
                              disabled={busy}
                              aria-label="Hapus dari playlist"
                              className="rounded-md p-1.5 text-text-faint hover:bg-danger-bg hover:text-danger disabled:opacity-30 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-2 border-t border-border bg-surface-raised/40">
                      <p className="text-[11px] text-text-faint">
                        Naik/turun & hapus masing-masing 50 unit. <span className="text-text-muted">Ubah urutan hanya
                        bekerja bila playlist di-set &ldquo;Manual&rdquo; di YouTube Studio</span> — kalau masih
                        urutan otomatis (mis. tanggal ditambahkan), YouTube menolak perubahan posisi.
                      </p>
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
