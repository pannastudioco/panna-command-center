import React, { useState, useCallback } from 'react';
import type { YoutubeAuthState, ConnectedChannelState, QuotaState } from '@/types';
import { DAILY_UNIT_POOL } from '@/constants/quotas';
import { useGeminiKeys } from '@/hooks/useGeminiKeys';
import type { OwnVideoCatalog } from '@/hooks/useOwnVideoCatalog';
import { validateGeminiKey } from '@/services/geminiService';
import { ChannelConnectionPanel } from '@/components/auth/ChannelConnectionPanel';
import { HelpPanel } from '@/components/shared/ui/HelpPanel';
import { StrategyPanel, Example, Sample, Why } from '@/components/shared/ui/StrategyPanel';
import { Loader } from '@/components/shared/Loader';
import { Button } from '@/components/shared/ui/Button';
import { Card } from '@/components/shared/ui/Card';
import { TranslatePanel } from './TranslatePanel';
import { GeneratorPanel } from './GeneratorPanel';
import { PackageGenerator } from './PackageGenerator';
import { Sparkles, Languages, Type, Lightbulb, KeyRound, AlertCircle, ListVideo, CheckCircle2 } from 'lucide-react';

interface Props {
  quota: QuotaState;
  recordUnits: (units: number) => void;
  auth: YoutubeAuthState;
  channel: ConnectedChannelState;
  catalog: OwnVideoCatalog;
}

type Tab = 'package' | 'ideas' | 'translate';

const TABS: { id: Tab; label: string; icon: React.ElementType; needsYoutube: boolean }[] = [
  // Judul + Deskripsi are ONE tab: packaging-first — the description is written to deliver on
  // the chosen title, so the two never drift apart.
  { id: 'package', label: 'Judul + Deskripsi', icon: Type, needsYoutube: false },
  { id: 'ideas', label: 'Ide Konten', icon: Lightbulb, needsYoutube: false },
  { id: 'translate', label: 'Translate', icon: Languages, needsYoutube: true },
];

/** Gemini key entry — self-contained (not in AuthenticationHub) so the resurrection-bug
 * fix there stays untouched. Same rule: pasted in UI → localStorage, never a source file.
 * Adds one key at a time (each is validated live before joining the rotation pool). */
/** Splits a bulk paste into keys — newline or comma separated, same as the YouTube key hub. */
function parseKeys(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

const GeminiKeyGate: React.FC<{ onSaved: (key: string) => void; compact?: boolean }> = ({
  onSaved,
  compact = false,
}) => {
  const [input, setInput] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    const keys = parseKeys(input);
    if (keys.length === 0) return;
    setValidating(true);
    setError(null);
    setProgress(null);

    // Validate each key against ITSELF, so one bad key never blocks the rest and no single
    // key's tiny daily quota gets drained validating the others. validateGeminiKey only
    // rejects genuinely-bad keys — quota caps and Gemini load spikes pass, because in both
    // cases the key authenticated fine.
    let added = 0;
    const failures: string[] = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (keys.length > 1) setProgress(`Memvalidasi key ${i + 1}/${keys.length}...`);
      try {
        await validateGeminiKey(key);
        onSaved(key);
        added += 1;
      } catch (e) {
        failures.push(`…${key.slice(-4)}: ${e instanceof Error ? e.message : 'ditolak Google'}`);
      }
    }

    setProgress(null);
    setValidating(false);
    if (added > 0) setInput('');
    if (failures.length > 0) {
      setError(
        `${added} key ditambahkan, ${failures.length} gagal.\n${failures.slice(0, 3).join('\n')}` +
          (failures.length > 3 ? `\n…dan ${failures.length - 3} lagi.` : '')
      );
    }
  }, [input, onSaved]);

  const pendingCount = parseKeys(input).length;

  // Compact = the "add more keys" row shown once at least one key exists.
  if (compact) {
    return (
      <div>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            placeholder="Tambah key lain (project berbeda) — boleh tempel banyak sekaligus, pisah baris/koma"
            className="flex-1 resize-y rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-mono outline-none focus:border-primary"
          />
          <Button size="sm" loading={validating} disabled={pendingCount === 0 || validating} onClick={handleSave}>
            Tambah{pendingCount > 1 ? ` ${pendingCount}` : ''}
          </Button>
        </div>
        {progress && <p className="mt-1.5 text-[11px] text-text-muted">{progress}</p>}
        {error && (
          <p className="mt-1.5 text-[11px] text-danger flex items-start gap-1.5 whitespace-pre-wrap">
            <AlertCircle className="w-3 h-3 shrink-0 mt-px" />
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <Card padding="lg" className="max-w-xl bg-aurora bg-grain">
      <div className="relative flex items-start gap-3.5">
        <div className="w-10 h-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
          <KeyRound className="w-5 h-5 text-primary" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">Sambungkan Gemini API Key</h3>
          <p className="text-xs text-text-muted mt-1 leading-relaxed">
            Fitur AI pakai Gemini. Bikin key gratis di{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              aistudio.google.com/apikey
            </a>
            . Boleh tempel <strong>beberapa key sekaligus</strong> (pisah baris baru atau koma) — tiap key
            divalidasi sendiri, lalu dipakai bergiliran supaya kuota harianmu berlipat. Disimpan cuma di browser
            kamu, nggak pernah ke server kami atau ke file.
          </p>
          <div className="flex gap-2 mt-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={3}
              placeholder={'AIza... atau AQ.Ab8RN6...\n(satu key per baris)'}
              className="flex-1 resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm font-mono outline-none focus:border-primary"
            />
            <Button loading={validating} disabled={pendingCount === 0 || validating} onClick={handleSave}>
              {pendingCount > 1 ? `Simpan ${pendingCount}` : 'Simpan'}
            </Button>
          </div>
          {progress && <p className="mt-2 text-xs text-text-muted">{progress}</p>}
          {error && (
            <p className="mt-2 text-xs text-danger flex items-start gap-1.5 whitespace-pre-wrap">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
              {error}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
};

/** Per-tab executable playbook (separate from the HelpPanel "what is this" copy). Grounded
 * in the live 2026 research: CPM-by-country for Translate, proven title/description formulas
 * and ideation frameworks for the generators. */
const AiStudioStrategy: React.FC<{ tab: Tab }> = ({ tab }) => {
  if (tab === 'translate') {
    return (
      <StrategyPanel title="Contoh & strategi: Translate" defaultOpen>
        <p>
          Menerjemahkan judul &amp; deskripsi bikin satu video yang sama muncul dengan bahasa penonton di tiap
          negara. Efeknya dua: jangkauan lebih luas, dan kamu masuk ke pasar CPM tinggi (iklan lebih mahal).
        </p>
        <Example label="Urutan bahasa paling menguntungkan (mulai dari sini)">
          <p><strong>1. English</strong> — wajib. Satu terjemahan ini membuka 7 pasar termahal sekaligus: AS, UK, Australia, Kanada, Selandia Baru, Irlandia, Singapura.</p>
          <p><strong>2. German</strong> — buka Jerman + Austria + Swiss (blok DACH, CPM tinggi).</p>
          <p><strong>3. French</strong> — Prancis, Belgia, Swiss, Quebec.</p>
          <p><strong>4. Dutch, lalu Nordic</strong> (Norwegia/Denmark/Swedia) &amp; <strong>Japanese</strong>.</p>
        </Example>
        <Example label="Contoh satu video, tiga bahasa">
          <Sample>EN — Smooth Jazz for Work ☕ Cozy Coffee Shop Ambience</Sample>
          <Sample>DE — Sanfter Jazz zum Arbeiten ☕ Gemütliche Café-Atmosphäre</Sample>
          <Sample>FR — Jazz doux pour travailler ☕ Ambiance café cosy</Sample>
          <Why>YouTube otomatis menyajikan versi bahasa yang cocok dengan lokasi penonton, jadi penonton AS lihat judul Inggris, penonton Jerman lihat judul Jerman — dari satu video yang sama.</Why>
        </Example>
        <Example label="Auto Dubbing itu FITUR BERBEDA — jangan tertukar">
          <p>
            <strong>Tab ini menerjemahkan TEKS</strong> (judul &amp; deskripsi) → bikin videomu{' '}
            <strong>DITEMUKAN</strong> dalam bahasa lain.
            <br />
            <strong>Auto Dubbing menerjemahkan AUDIO</strong> (suara di dalam video) → bikin videomu{' '}
            <strong>DITONTON</strong> dalam bahasa lain.
          </p>
          <p>
            Dua hal terpisah, dikerjakan di tempat berbeda: yang teks di sini, yang audio di{' '}
            <strong>YouTube Studio</strong>. App ini <strong>tidak</strong> mengurus dubbing.
          </p>
          <p>
            Kabar bagusnya, sejak <strong>4 Februari 2026</strong> auto dubbing gratis untuk semua,{' '}
            <strong>27 bahasa</strong> — dan Expressive Speech sudah termasuk <strong>Bahasa Indonesia</strong>.
            Pernyataan resminya: <em>&ldquo;Auto dubs are all gain and no pain; there&rsquo;s no negative impact on
            your original video&rsquo;s discovery algorithm, and it might be able to help with discovery in other
            languages.&rdquo;</em>
          </p>
          <Why>
            Buat channel musik instrumental, dubbing sering tidak relevan — tidak ada narasi buat didubbing. Jadi
            yang benar-benar kerja buat Somatic Lounge/Nature adalah terjemahan judul &amp; deskripsi di tab ini.
            Dubbing baru berguna kalau videomu ada suara orang (voice-over, komentar, penjelasan) — misalnya di
            channel voli.
          </Why>
        </Example>
        <p className="text-[11px] text-text-faint">
          Catatan jujur: terjemahan bahasa lain yang sudah ada tidak tertimpa (app membaca-gabung-tulis). CPM itu harga
          kotor pengiklan, BUKAN penghasilanmu — YouTube menegaskan revenue tidak sama dengan CPM x views, jadi
          jangan dipakai buat menghitung uang. Urutan negaranya yang berguna. Niche juga lebih menentukan
          penghasilan daripada negara, jadi bahasa memperbesar, bukan mengganti.
        </p>
      </StrategyPanel>
    );
  }
  if (tab === 'package') {
    return (
      <StrategyPanel title="Contoh & strategi: Judul + Deskripsi (satu paket)" defaultOpen>
        <p>
          Judul dan deskripsi digabung di satu tab karena memang <strong>satu kesatuan</strong>. Kamu isi topik
          sekali, pilih judul, lalu deskripsi ditulis khusus untuk menepati janji judul itu (keyword-nya dipakai
          ulang persis). Kalau dibuat terpisah, keduanya gampang tidak nyambung dan sinyal ke YouTube jadi lemah.
        </p>
        <Example label="Bahan judul yang menang (2026)">
          <p>Panjang ~50&ndash;60 karakter, keyword di depan (~40 karakter pertama); satu angka spesifik; satu celah penasaran; maksimal satu kurung; 1&ndash;2 kata bertenaga; pakai &ldquo;you/your&rdquo;.</p>
        </Example>
        <Example label="Struktur deskripsi yang mengikuti judul">
          <p><strong>Baris 1 (150 karakter pertama)</strong> = keyword judul + manfaat. Ini satu-satunya teks yang muncul di hasil search &amp; feed.</p>
          <p>Ringkasan 2&ndash;4 kalimat, keyword diulang 2&ndash;3x natural, panjang 200&ndash;400 kata, lalu chapter dan 3&ndash;5 hashtag.</p>
        </Example>
        <Example label="Contoh paket jadi (niche kamu)">
          <Sample>Judul: Smooth Jazz for Deep Focus ☕ 3 Hours to Get Real Work Done</Sample>
          <Sample>Baris 1: Smooth jazz for deep focus — 3 jam saxophone hangat &amp; suasana kedai kopi buat kerja tanpa buyar.</Sample>
          <Why>keyword &ldquo;smooth jazz for deep focus&rdquo; muncul di depan judul DAN di kata pertama deskripsi. Satu janji, dua tempat, saling menguatkan — persis yang dibaca YouTube untuk Search.</Why>
        </Example>
        <Example label="Global Localization">
          <p>
            Pilih target market (mis. Jerman/Jepang) dan AI menulis <strong>natif ala kreator lokal</strong>, bukan
            terjemahan mentah: idiom keyword lokal (Jepang pakai 作業用BGM bukan &ldquo;work music&rdquo;), kapitalisasi
            (Jerman kapital tiap kata benda), angka &amp; tanda baca lokal, dan gaya yang pas budaya sana.
          </p>
        </Example>
      </StrategyPanel>
    );
  }
  return (
    <StrategyPanel title="Contoh & strategi: Ide Konten">
      <p>Generator ide memakai kerangka yang dipakai channel-channel top, bukan tebakan. Tiap ide keluar sebagai Judul + Hook + alasan kenapa berpeluang jalan.</p>
      <Example label="Kerangka ide berpeluang tinggi">
        <p><strong>Outlier</strong> — tiru format video yang tembus jauh di atas rata-rata channel sejenis.</p>
        <p><strong>Format remix</strong> — ambil format yang sudah terbukti, kasih satu twist di niche kamu.</p>
        <p><strong>Search-gap</strong> — bidik frasa spesifik yang dicari tapi saingannya tipis.</p>
        <p><strong>Seri</strong> — bikin serial biar penonton lanjut nonton (dorong sesi).</p>
      </Example>
      <Example label="Contoh ide (niche kamu)">
        <Sample>Judul: &ldquo;1 Hour vs 8 Hours of Rain for Sleep — Which Actually Works?&rdquo;</Sample>
        <Sample>Hook: &ldquo;Semua orang pasang suara hujan buat tidur. Tapi durasi mana yang benar-benar bikin nyenyak?&rdquo;</Sample>
        <Why>format &ldquo;X vs Y&rdquo; sudah terbukti tembus di banyak niche, dipasang ke Somatic Nature dengan satu pertanyaan yang bikin penasaran.</Why>
      </Example>
      <p className="text-[11px] text-text-faint">
        Catatan jujur: ini ide kreatif dari AI, bukan data tren real-time. Untuk tren beneran, cek Google Trends
        (ada link-out di modul Competitor &amp; Trend).
      </p>
    </StrategyPanel>
  );
};

export const AiStudio: React.FC<Props> = ({ quota, recordUnits, auth, channel, catalog }) => {
  const { geminiKeys, addKey, removeKey } = useGeminiKeys();
  const { isConnected, isConnecting, error: authError, connect, disconnect, accessToken } = auth;
  const { channelInfo, isLoadingChannel } = channel;

  const [tab, setTab] = useState<Tab>('package');
  const activeTab = TABS.find((t) => t.id === tab)!;
  const remainingUnitsToday = DAILY_UNIT_POOL - quota.dataApiUnitsUsed;

  const handleDisconnect = useCallback(() => {
    disconnect();
    catalog.reset();
  }, [disconnect, catalog]);

  return (
    <div className="max-w-[1400px] space-y-6">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 ring-1 ring-primary/20 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-primary" strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gradient-brand">AI Studio</h1>
          <p className="text-sm text-text-muted mt-1 max-w-2xl">
            Judul + deskripsi sebagai satu paket, ide konten, dan terjemahan ke 55 bahasa (langsung ke YouTube) —
            semuanya bisa ditulis natif untuk market CPM/RPM tinggi, pakai Gemini API key kamu sendiri.
          </p>
        </div>
      </div>

      <HelpPanel>
        <p>
          Fitur AI pakai <strong>Gemini</strong> (buatan Google). Butuh <strong>API key Gemini</strong> milikmu
          (gratis, beda dari API key YouTube) — tempel sekali, disimpan cuma di browser. Ada 3 tab:
        </p>
        <p>
          <strong>Judul + Deskripsi:</strong> satu paket. Isi topik sekali → AI kasih opsi judul → kamu pilih satu →
          deskripsi ditulis khusus untuk judul itu. Digabung karena judul &amp; deskripsi memang harus saling
          menguatkan; kalau dibuat terpisah gampang tidak nyambung.
        </p>
        <p>
          <strong>Ide Konten:</strong> ketik niche, AI kasih ide berbentuk Judul + Hook + alasan kenapa berpeluang.
          Ini saran kreatif AI, <strong>bukan data tren real-time</strong> — untuk tren beneran pakai Google Trends
          (link-out ada di modul Competitor &amp; Trend).
        </p>
        <p>
          <strong>Translate:</strong> pilih video → pilih bahasa target → AI menerjemahkan judul &amp; deskripsi →
          kamu review/edit → simpan ke YouTube. Bikin video kamu <strong>muncul dengan bahasa penonton</strong>.
          Terjemahan bahasa lain yang sudah ada aman, tidak tertimpa.
        </p>
        <p>
          Di tiap generator ada pilihan <strong>Target market</strong>: AI menulis natif ala kreator negara itu
          (idiom, kapitalisasi, gaya budaya), bukan terjemahan mentah. Translate butuh akun YouTube tersambung;
          generator cukup Gemini key saja.
        </p>
      </HelpPanel>

      {geminiKeys.length === 0 ? (
        <GeminiKeyGate onSaved={addKey} />
      ) : (
        <>
          <Card padding="sm" className="space-y-2">
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
              <span className="text-text-muted">
                {geminiKeys.length} Gemini key aktif — dipakai bergiliran (round-robin) tiap panggilan.
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {geminiKeys.map((k) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[11px] font-mono"
                >
                  {/* Never render the full key — last 4 chars is enough to tell them apart. */}
                  …{k.slice(-4)}
                  <button
                    onClick={() => removeKey(k)}
                    aria-label="Hapus key"
                    className="text-text-faint hover:text-danger"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <GeminiKeyGate onSaved={addKey} compact />
            <p className="text-[11px] text-text-faint leading-relaxed">
              <span className="font-medium text-text">Penting:</span> kuota free-tier Gemini dihitung per{' '}
              <strong>project Google Cloud</strong>, bukan per key. Beberapa key dari project yang SAMA tetap
              berbagi satu kuota (tidak nambah). Supaya kuota beneran bertambah, pakai key dari project/akun
              yang berbeda-beda.
            </p>
          </Card>

          <div className="flex flex-wrap gap-1.5 border-b border-border">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${active ? 'text-primary' : 'text-text-muted hover:text-text'}`}
                >
                  <Icon className="w-4 h-4" strokeWidth={2} />
                  {t.label}
                  {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-primary to-accent animate-scale-in" />}
                </button>
              );
            })}
          </div>

          <AiStudioStrategy tab={tab} />

          {/* Translate needs YouTube OAuth + catalog; generators don't. */}
          {activeTab.needsYoutube && (
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
              {isConnected && channelInfo && !catalog.hasLoaded && (
                <Card padding="lg" className="text-center">
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
                      <ListVideo className="w-5 h-5 text-primary" strokeWidth={2} />
                    </div>
                    <p className="text-sm text-text-muted max-w-sm">Muat katalog untuk memilih video yang mau diterjemahkan.</p>
                    <Button icon={<ListVideo className="w-4 h-4" />} loading={catalog.isLoading} onClick={() => catalog.loadCatalog()}>
                      {catalog.isLoading ? 'Memuat...' : 'Muat Katalog Video Saya'}
                    </Button>
                  </div>
                </Card>
              )}
              {catalog.isLoading && <Loader label="Memuat daftar video..." size="sm" />}
              {catalog.error && (
                <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 flex items-start gap-2.5 text-sm text-danger">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{catalog.error}</span>
                </div>
              )}
            </div>
          )}

          <div key={tab} className="animate-fade-in">
            {tab === 'translate' && isConnected && catalog.hasLoaded && (
              <TranslatePanel
                videos={catalog.videos}
                accessToken={accessToken}
                geminiKeys={geminiKeys}
                remainingUnitsToday={remainingUnitsToday}
                recordUnits={recordUnits}
              />
            )}
            {tab === 'package' && <PackageGenerator geminiKeys={geminiKeys} />}
            {tab === 'ideas' && <GeneratorPanel kind="ideas" geminiKeys={geminiKeys} />}
          </div>
        </>
      )}
    </div>
  );
};
