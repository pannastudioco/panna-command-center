import React, { useState, useCallback } from 'react';
import type { YoutubeAuthState, ConnectedChannelState, QuotaState } from '@/types';
import type { OwnVideoCatalog } from '@/hooks/useOwnVideoCatalog';
import { useGeminiKeys } from '@/hooks/useGeminiKeys';
import { DAILY_UNIT_POOL, SEARCH_LIST_DAILY_CAP } from '@/constants/quotas';
import { Wrench, ShieldAlert, Image, Clock, Gauge, ListVideo, AlertCircle } from 'lucide-react';
import { ChannelConnectionPanel } from '@/components/auth/ChannelConnectionPanel';
import { Loader } from '@/components/shared/Loader';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { HelpPanel } from '@/components/shared/ui/HelpPanel';
import { StrategyPanel, Example, Sample, Why } from '@/components/shared/ui/StrategyPanel';
import { DemonetizationChecker } from './DemonetizationChecker';
import { ThumbnailMockup } from './ThumbnailMockup';
import { ChapterEditor } from './ChapterEditor';
import { VideoOptimizer } from './VideoOptimizer';

interface Props {
  quota: QuotaState;
  recordUnits: (units: number) => void;
  auth: YoutubeAuthState;
  channel: ConnectedChannelState;
  catalog: OwnVideoCatalog;
  /** Needed by the Video Optimizer's "Cek Kompetisi" (real search.list competitor data). */
  youtubeApiKeys: string[];
  youtubeApiKeyIndex: number;
  setYoutubeApiKeyIndex: (idx: number) => void;
  recordSearchListCall: () => void;
}

type Tool = 'optimizer' | 'demonetization' | 'thumbnail' | 'chapters';

const TABS: { id: Tool; label: string; icon: React.ElementType; needsAuth: boolean }[] = [
  { id: 'optimizer', label: 'Optimasi Video', icon: Gauge, needsAuth: true },
  { id: 'demonetization', label: 'Cek Monetisasi', icon: ShieldAlert, needsAuth: false },
  { id: 'thumbnail', label: 'Mockup Thumbnail', icon: Image, needsAuth: false },
  { id: 'chapters', label: 'Editor Chapter', icon: Clock, needsAuth: true },
];

/** Per-tab executable playbook. Grounded in live 2026 research (title/description SEO,
 * distribution mechanics, YouTube's own chapter/monetization rules) and tailored to
 * Kharis's relaxing-music niche. Separate from the HelpPanel "what is this" copy. */
const ToolboxStrategy: React.FC<{ tool: Tool }> = ({ tool }) => {
  if (tool === 'optimizer') {
    return (
      <StrategyPanel title="Contoh & strategi: Optimasi Video" defaultOpen>
        <p>
          Tab ini <strong>mengeksekusi</strong>, bukan cuma menyarankan. Pilih video, isi keyword target, lalu AI
          menulis ulang judul/deskripsi/tag dan menggambar thumbnail baru — kamu review, edit kalau perlu, lalu
          simpan langsung ke YouTube dari sini.
        </p>
        <p>Skor SEO di sini checklist, bukan sihir. Naikkan dengan urutan dampak, dari yang paling berpengaruh:</p>
        <Example label="Urutan menaikkan skor (dampak terbesar dulu)">
          <p><strong>1. Judul</strong> — taruh keyword utama + kegunaan di ~40 karakter pertama biar tak kepotong di HP.</p>
          <p><strong>2. Thumbnail</strong> — satu scene jelas, konsisten tiap upload.</p>
          <p><strong>3. Deskripsi</strong> — baris pertama (150 karakter) = keyword + manfaat; ulang keyword 2&ndash;3x; tambah chapter kalau video &gt;5 menit.</p>
          <p><strong>4. Sebut keyword-nya di 30 detik pertama video</strong> — YouTube mendengar &amp; mentranskrip; sinyal relevansi ini lebih kuat dari tag apa pun.</p>
          <p><strong>5. Tag</strong> — 5&ndash;8 saja, terakhir. Dampak paling kecil.</p>
        </Example>
        <Example label="Sebelum → sesudah (video jazz kamu)">
          <p>Sebelum, lemah:</p>
          <Sample>Relaxing Jazz Music</Sample>
          <p>Sesudah, dioptimalkan:</p>
          <Sample>Smooth Jazz for Work ☕ Cozy Coffee Shop Ambience for Focus &amp; Study (3 Hours)</Sample>
          <p>Baris pertama deskripsi:</p>
          <Sample>Smooth jazz for work: 3 jam saxophone hangat &amp; suasana kedai kopi buat fokus, belajar, dan bersantai.</Sample>
          <Why>keyword ada di depan judul dan baris pertama (yang muncul di hasil search + feed); durasi &amp; kegunaan bikin orang yang cari &ldquo;buat kerja&rdquo; langsung klik.</Why>
        </Example>
        <p>
          Panel <strong>Cek Distribusi</strong> di bawah memakai nama &amp; definisi <strong>resmi</strong> YouTube
          (bukan &ldquo;framework&rdquo; karangan blog SEO). Empat sumber trafik yang benar-benar bisa kamu tindak
          sebelum publish:
        </p>
        <Example label="4 sumber trafik resmi & tuas nyatanya">
          <p><strong>Browse features</strong> (resmi: Home + subscriptions + Watch Later jadi SATU sumber, bukan terpisah) — di sini penonton cuma lihat judul + thumbnail. Itu saja seluruh tuasmu.</p>
          <p><strong>Suggested videos</strong> — definisi resminya termasuk <strong>&ldquo;links in video descriptions&rdquo;</strong>. Jadi menaruh link video/playlist kamu sendiri di deskripsi itu tuas Suggested yang RESMI, dan hampir tak ada yang pakai.</p>
          <p><strong>YouTube search</strong> — resmi: dicocokkan dari &ldquo;title, description, and <strong>video content</strong>&rdquo;. &ldquo;Video content&rdquo; itulah kenapa menyebut keyword dengan suara di awal video lebih kuat dari tag apa pun.</p>
          <p><strong>Playlists</strong> — sumber trafik tersendiri: video yang tidak masuk playlist mana pun kehilangan pintu ini sepenuhnya.</p>
          <Why>keempatnya dari dokumen resmi YouTube. Yang TIDAK dimasukkan: External &amp; Notifications — YouTube resmi tidak menghitung impression di sana, jadi target CTR untuk keduanya mustahil dan cuma akan mengarang.</Why>
        </Example>
        <p className="text-[11px] text-text-faint">
          Catatan jujur, hasil riset kami sendiri: istilah yang beredar seperti &ldquo;4-Layer Distribution Test&rdquo;,
          &ldquo;7 Discovery Surfaces&rdquo;, &ldquo;Signal Hierarchy 5 Tiers&rdquo;, dan &ldquo;Gemini thumbnail
          signal&rdquo; <strong>tidak punya sumber sama sekali</strong> — bukan istilah YouTube, tanpa pencetus, nol
          jejak. Taksonomi resmi YouTube adalah ~17 &ldquo;traffic source types&rdquo;, tidak pernah dikelompokkan
          jadi 7. App ini sengaja tidak memakai istilah-istilah karangan itu.
        </p>
      </StrategyPanel>
    );
  }
  if (tool === 'demonetization') {
    return (
      <StrategyPanel title="Contoh & strategi: Cek Monetisasi">
        <p>
          Tempel judul, deskripsi, atau tag, lalu app menandai kata yang berisiko bikin iklan dibatasi. Ini
          indikatif, bukan vonis resmi YouTube. Untuk musik relax kamu, risiko kata biasanya kecil. Yang jauh
          lebih penting untuk channel Suno:
        </p>
        <Example label="Risiko #1 channel AI-music: 'Generic or Repetitive Content'">
          <p>
            Halaman kebijakan monetisasi (<code>answer/1311392</code>) sudah <strong>ditulis ulang</strong>. Judul
            &ldquo;inauthentic content&rdquo; <strong>sudah tidak ada lagi</strong> — sekarang dipecah jadi
            &ldquo;Generic or Repetitive Content&rdquo;, &ldquo;Reused content&rdquo;, &ldquo;Unsatisfying or
            Off-putting Content&rdquo;, dan &ldquo;AI Personas Related to Sensitive Topics&rdquo;. Definisi
            resminya sekarang: <em>&ldquo;content that looks like it&rsquo;s made with a template, or that may feel
            repetitive to viewers after watching several videos.&rdquo;</em>
          </p>
          <p>
            <strong>Ini kabar baik buatmu.</strong> Frasa lama &ldquo;easily replicable at scale&rdquo; —
            yang praktis menghukum musik AI hanya karena <em>cara produksinya</em> — sudah <strong>dihapus</strong>.
            Ujiannya sekarang <strong>nilai buat penonton</strong>, bukan seberapa mudah diproduksi. Jadi patokannya
            bukan lagi &ldquo;ini dibuat AI?&rdquo; tapi &ldquo;penonton dapat sesuatu yang berbeda tiap video?&rdquo;
          </p>
          <p>
            Praktisnya tetap sama: bikin beberapa track dasar berbeda lalu disambung, bukan satu klip 2 menit
            diulang jadi 8 jam. Yang berubah adalah <em>alasannya</em> — bukan karena &ldquo;diproduksi massal&rdquo;,
            tapi karena penonton merasa videomu terasa sama saja.
          </p>
          <Why>
            Penulisan ulang ini dilakukan YouTube <strong>tanpa pengumuman apa pun</strong> — changelog di halaman
            itu sendiri masih berhenti di 15 Juli 2025. Aku memverifikasi langsung ke halaman resminya, dan judul
            &ldquo;inauthentic content&rdquo; memang sudah tidak ada. Karena tidak diumumkan, YouTube tidak pernah
            menyebut tanggal resminya — jadi aku tidak mencantumkan tanggal di sini.
          </Why>
        </Example>
        <Example label="BARU 2026: musik AI wajib diungkap (disclosure)">
          <p>
            &ldquo;AI generated music&rdquo; sekarang masuk daftar konten yang <strong>wajib diungkap</strong> saat
            upload (<code>answer/14328491</code>). Ini perubahan 2026 yang paling langsung kena workflow Suno-mu.
          </p>
          <p>
            Dan ini bagian pentingnya, resmi verbatim:{' '}
            <em>&ldquo;Disclosing AI content won&rsquo;t limit a video&rsquo;s audience or impact its eligibility to
            earn money.&rdquo;</em> Jadi mengungkap itu <strong>gratis</strong> — tidak memotong jangkauan, tidak
            memotong penghasilan. Tidak mengungkap justru berisiko kena sanksi YPP.
          </p>
          <Why>
            Banyak creator menahan disclosure karena takut jangkauannya dipotong. YouTube secara eksplisit
            membantah itu — di dua halaman terpisah. Label AI juga resmi dinyatakan{' '}
            <em>&ldquo;does not change how a video is recommended or whether it&rsquo;s eligible to earn money&rdquo;</em>{' '}
            (27 Mei 2026). Jadi ini keputusan kejujuran, bukan trade-off jangkauan — centang saja.
          </Why>
        </Example>
        <Example label="Tenang: pengungkapan yang kamu set BISA dibatalkan">
          <p>
            Sempat ada kekhawatiran (termasuk dariku) bahwa menandai konten AI itu pintu satu-arah. Setelah
            kuverifikasi ke dokumen resmi: <strong>tidak</strong>. Yang kamu set sendiri bisa diubah lagi —{' '}
            <em>&ldquo;you can change it in most cases by selecting No in the AI disclosure survey under
            Attributes&rdquo;</em>.
          </p>
          <p>
            Label yang <strong>permanen</strong> (tak bisa dilepas) itu mekanisme lain: cuma untuk video yang
            dibuat pakai alat AI YouTube sendiri (Veo/Dream Screen), atau file dengan kredensial C2PA yang
            menyatakan <em>&ldquo;the entire video was made with AI&rdquo;</em>. Auto-deteksi YouTube juga menyasar
            AI <strong>visual/fotorealistik</strong>, bukan musik. Musik Suno di bawah gambar biasa tidak masuk
            satu pun kategori itu.
          </p>
          <Why>
            Soal &ldquo;Suno menyematkan C2PA sejak awal 2026&rdquo; yang ramai di blog SEO: tidak ada sumber
            resmi Suno maupun C2PA yang mendukungnya — Suno bahkan <strong>bukan anggota C2PA</strong>, dan ToS/Help
            Suno tak pernah menyebut C2PA/watermark. Jadi klaim &ldquo;label AI Suno otomatis dan permanen&rdquo;
            itu tak berdasar. Kalau provenance benar-benar penting, konfirmasi langsung ke support Suno, bukan ke
            blog.
          </Why>
        </Example>
      </StrategyPanel>
    );
  }
  if (tool === 'thumbnail') {
    return (
      <StrategyPanel title="Contoh & strategi: Mockup Thumbnail">
        <p>Upload gambar, lihat tampilannya di hasil search, beranda, dan sidebar. Cek keterbacaan di ukuran HP sebelum dipakai.</p>
        <Example label="Spec thumbnail yang bekerja di niche kamu">
          <p><strong>Satu scene cosy</strong> yang jelas: jendela berembun hujan, meja berlampu temaram, kedai kopi bersalju.</p>
          <p><strong>Palet terbatas</strong>: biru-ungu dingin untuk malam/hujan, cahaya lampu hangat untuk suasana cozy.</p>
          <p><strong>Teks 1&ndash;4 kata</strong> saja, atau tanpa teks. Untuk Somatic Nature, badge durasi &ldquo;10 HOURS&rdquo; sering jadi satu-satunya teks.</p>
          <p><strong>Konsisten tiap upload</strong>: logo kecil di pojok, gaya sama.</p>
          <Why>penonton mengenali channel-mu sekejap di layar HP — itu manfaat buat MANUSIA, bukan buat algoritma. Tidak ada bukti YouTube mengelompokkan channel dari gaya thumbnail (kami cek, tak ada sumbernya). Referensinya: scene &ldquo;study girl&rdquo; yang selalu sama milik Lofi Girl.</Why>
        </Example>
        <p className="text-[11px] text-text-faint">
          Tips: pakai fitur &ldquo;Test &amp; Compare&rdquo; bawaan YouTube Studio (sampai 3 thumbnail) biar YouTube memilih yang CTR-nya tertinggi otomatis.
        </p>
      </StrategyPanel>
    );
  }
  return (
    <StrategyPanel title="Contoh & strategi: Editor Chapter">
      <p>
        Chapter = penanda waktu biar penonton loncat ke bagian tertentu. Untuk video panjang (loop 1&ndash;8 jam)
        ini penting, dan menaikkan rata-rata durasi tonton sekitar 11%.
      </p>
      <Example label="Aturan wajib YouTube (kalau satu tak dipenuhi, chapter tidak aktif)">
        <p>Timestamp pertama <strong>wajib 0:00</strong>.</p>
        <p>Minimal <strong>3 timestamp</strong>, urut naik.</p>
        <p>Tiap segmen minimal <strong>10 detik</strong>.</p>
      </Example>
      <Example label="Contoh chapter untuk video jazz 3 jam kamu">
        <Sample>
          0:00 Warm-up — Soft Piano<br />
          12:30 Coffee Shop Rain<br />
          58:00 Late Night Saxophone<br />
          1:45:00 Deep Focus Section
        </Sample>
        <Why>tiap chapter juga bisa muncul sebagai &ldquo;Key Moments&rdquo; di Google Search, jadi pintu penemuan tambahan gratis.</Why>
      </Example>
    </StrategyPanel>
  );
};

export const Toolbox: React.FC<Props> = ({
  quota,
  recordUnits,
  auth,
  channel,
  catalog,
  youtubeApiKeys,
  youtubeApiKeyIndex,
  setYoutubeApiKeyIndex,
  recordSearchListCall,
}) => {
  const [tool, setTool] = useState<Tool>('optimizer');
  const { isConnected, isConnecting, error: authError, connect, disconnect, accessToken } = auth;
  const { channelInfo, isLoadingChannel } = channel;
  // The Gemini key lives in localStorage, so the Optimizer can pick up the same key the user
  // already pasted in AI Studio — no second key gate.
  const { geminiKeys } = useGeminiKeys();

  // App-level catalog (loaded once for the whole app) — every OAuth tool here reuses it,
  // and it's already populated if any other module loaded it first.
  const { videos, hasLoaded, isLoading: isLoadingCatalog, error: catalogError, loadCatalog, applyLocalPatch, reset } = catalog;

  const remainingUnitsToday = DAILY_UNIT_POOL - quota.dataApiUnitsUsed;
  const activeTab = TABS.find((t) => t.id === tool)!;

  const handleDisconnect = useCallback(() => {
    disconnect();
    reset();
  }, [disconnect, reset]);

  return (
    <div className="max-w-[1400px] space-y-6">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 ring-1 ring-primary/20 flex items-center justify-center">
          <Wrench className="w-5 h-5 text-primary" strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gradient-brand">Toolbox</h1>
          <p className="text-sm text-text-muted mt-1 max-w-2xl">
            Optimasi SEO + eksekusi langsung ke video, cek kata berisiko monetisasi, pratinjau thumbnail,
            dan atur chapter. Cek monetisasi & mockup 100% lokal (0 kuota).
          </p>
        </div>
      </div>

      <HelpPanel>
        <p>
          Kotak alat berisi 4 fitur bantu:
        </p>
        <p>
          <strong>Optimasi Video:</strong> pilih video → dapat <strong>skor SEO</strong> (0&ndash;100) + daftar
          perbaikan konkret yang bisa langsung <strong>diterapkan ke YouTube</strong> (tambah tag/hashtag, perdalam
          deskripsi, dll). Tiap saran diberi label dampak jujur — judul &amp; thumbnail dampak besar, tag dampak kecil.
        </p>
        <p>
          <strong>Cek Monetisasi:</strong> tempel judul/deskripsi/tag → app menandai kata yang berisiko dibatasi
          iklannya. Ini <strong>indikatif, bukan vonis</strong> YouTube — cuma buat kehati-hatian.{' '}
          <strong>Mockup Thumbnail:</strong> upload gambar, lihat tampilannya di berbagai posisi YouTube (hasil
          pencarian, beranda, saran) — buat cek keterbacaan sebelum dipakai.
        </p>
        <p>
          <strong>Editor Chapter:</strong> atur penanda waktu (chapter) di video — mulai 0:00, minimal 3, biar penonton
          gampang loncat ke bagian tertentu (bantu retensi). Cek Monetisasi &amp; Mockup 100% lokal (0 kuota); Optimasi
          &amp; Chapter menyimpan ke YouTube (butuh kuota saat simpan).
        </p>
      </HelpPanel>

      <div className="flex flex-wrap gap-1.5 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={`relative inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                active ? 'text-primary' : 'text-text-muted hover:text-text'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={2} />
              {t.label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-primary to-accent animate-scale-in" />
              )}
            </button>
          );
        })}
      </div>

      <ToolboxStrategy tool={tool} />

      {/* Shared connection + catalog gate for the OAuth tools */}
      {activeTab.needsAuth && (
        <div className="space-y-4">
          <ChannelConnectionPanel
            isConnected={isConnected}
            isConnecting={isConnecting}
            authError={authError}
            onConnect={connect}
            onDisconnect={handleDisconnect}
            channelInfo={channelInfo}
            isLoadingChannel={isLoadingChannel}
          />

          {isConnected && channelInfo && !hasLoaded && (
            <Card padding="lg" className="text-center">
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
                  <ListVideo className="w-5 h-5 text-primary" strokeWidth={2} />
                </div>
                <p className="text-sm text-text-muted max-w-sm">
                  Muat katalog dulu (sekali saja, dipakai bersama semua alat di sini).
                </p>
                <Button icon={<ListVideo className="w-4 h-4" />} loading={isLoadingCatalog} onClick={() => loadCatalog()}>
                  {isLoadingCatalog ? 'Memuat...' : 'Muat Katalog Video Saya'}
                </Button>
              </div>
            </Card>
          )}

          {isLoadingCatalog && <Loader label="Memuat daftar video..." size="sm" />}

          {catalogError && (
            <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 flex items-start gap-2.5 text-sm text-danger">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{catalogError}</span>
            </div>
          )}
        </div>
      )}

      <div key={tool} className="animate-fade-in">
        {tool === 'optimizer' && isConnected && hasLoaded && (
          <VideoOptimizer
            videos={videos}
            accessToken={accessToken}
            remainingUnitsToday={remainingUnitsToday}
            recordUnits={recordUnits}
            onLocalPatch={applyLocalPatch}
            onNavigateTool={(t) => setTool(t)}
            geminiKeys={geminiKeys}
            niche={channelInfo?.title ?? 'functional / relaxing music'}
            youtubeApiKeys={youtubeApiKeys}
            youtubeApiKeyIndex={youtubeApiKeyIndex}
            setYoutubeApiKeyIndex={setYoutubeApiKeyIndex}
            recordSearchListCall={recordSearchListCall}
            searchBudgetLeft={SEARCH_LIST_DAILY_CAP - quota.searchListCallsUsed}
          />
        )}
        {tool === 'chapters' && isConnected && hasLoaded && (
          <ChapterEditor
            videos={videos}
            accessToken={accessToken}
            remainingUnitsToday={remainingUnitsToday}
            recordUnits={recordUnits}
            onLocalPatch={applyLocalPatch}
          />
        )}
        {tool === 'demonetization' && <DemonetizationChecker />}
        {tool === 'thumbnail' && <ThumbnailMockup />}
      </div>
    </div>
  );
};
