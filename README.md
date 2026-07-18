# Panna Studio — Research and Development

Dashboard pribadi yang menggabungkan fitur TubeBuddy + VidIQ, dibangun sendiri untuk
channel-channel YouTube Kharis. Lihat rencana lengkap (semua fase) di
`C:\Users\Administrator\.claude\plans\zippy-honking-eich.md`.

Fase 0 (dashboard shell), Fase 1 (riset kata kunci & tag), Fase 2 (bulk edit metadata),
Fase 3 (analisis A/B thumbnail/judul), dan Fase 4 (competitor & trend tracking) semuanya
sudah selesai dan sudah diverifikasi jalan dengan data asli — termasuk commit sungguhan
ke YouTube yang dicek balik lewat YouTube Studio. Sudah melalui audit menyeluruh
(2026-07-10, 18 temuan diverifikasi adversarial, 16 fix diterapkan) sebelum Fase 4
dimulai, lalu DUA putaran perombakan UI/UX (2026-07-10 dan 2026-07-11) — putaran kedua
menambahkan logo/branding "Panna Studio" asli, sistem warna OKLCH, layout bento untuk
Analytics & Competitor, dan restrukturisasi layout supaya lebih padat (nggak banyak
ruang kosong di layar lebar) — riset visual (bukan cuma preferensi internal) dan semua
perubahan diverifikasi tidak mengubah satu pun logika bisnis.

## Cara jalankan

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`. Halaman pertama akan minta API key YouTube Data API v3 —
bikin satu gratis di [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
(aktifkan "YouTube Data API v3" dulu di API Library-nya). Bisa tempel banyak key
sekaligus — kalau tiap key dari project Google Cloud yang berbeda, kuota harian
(10.000 unit) beneran terlipat-gandakan, bukan cuma cadangan.

## Supaya riset kata kunci berfungsi penuh

Fitur harvesting suggestion butuh proxy kecil (Cloudflare Worker, gratis) karena browser
diblokir CORS kalau manggil endpoint autocomplete YouTube langsung. Deploy sekali:

1. `cd proxy/suggest-proxy && npm install && npx wrangler login && npx wrangler deploy`
2. Copy URL yang muncul, taruh di `.env.local` (contoh di `.env.example`) sebagai
   `VITE_SUGGEST_PROXY_URL=...`
3. Restart `npm run dev`

Tanpa langkah ini, riset kata kunci akan menampilkan pesan error yang jelas (bukan gagal
diam-diam) yang mengarahkan ke langkah di atas.

## Supaya Bulk Edit & Analytics berfungsi (butuh OAuth)

1. Bikin OAuth Client ID tipe **Web application** di Google Cloud Console, Authorized
   JavaScript origins diisi `http://localhost:5173` (dan origin production kalau nanti
   di-deploy). Authorized redirect URIs dikosongkan — flow yang dipakai (Google Identity
   Services token client) tidak butuh itu.
2. Di **Google Auth Platform → Audience**, daftarkan setiap akun Google yang mau dipakai
   sebagai **test user** (termasuk akun kamu sendiri) — kalau lupa, muncul error
   `403 access_denied`. Izin test user otomatis kedaluwarsa tiap 7 hari selama masih
   mode Testing (normal, tinggal connect ulang).
3. Copy Client ID (bukan Client Secret — itu tidak pernah dipakai/disimpan di app ini,
   flow-nya browser-only) ke `.env.local` sebagai `VITE_GOOGLE_OAUTH_CLIENT_ID=...`.
4. Klik "Sambungkan Akun YouTube" di app — Google selalu menampilkan pemilih akun
   (termasuk "Gunakan akun lain") tiap kali, jadi bisa pindah channel/akun Google kapan
   saja lewat disconnect+reconnect.

Catatan: `channels.list?mine=true` YouTube API cuma bisa baca **satu** channel per OAuth
grant (channel yang aktif di sesi Google saat itu) — tidak ada cara resmi untuk list
semua Brand Account channel milik satu akun Google sekaligus untuk kreator biasa (itu
cuma tersedia untuk akun CMS/content-owner). App ini menampilkan nama+foto channel yang
lagi tersambung dengan jelas di setiap modul yang butuh OAuth, supaya selalu ketahuan
mana yang sedang diedit/dianalisis sebelum ada aksi yang berjalan.

## Sistem desain (untuk siapa pun yang lanjut mengembangkan ini)

Token warna/shadow/radius/motion ada di `src/index.css` (`@theme` block, OKLCH, otomatis
dark-mode aware lewat `:root.dark`). Komponen reusable ada di
`src/components/shared/ui/` (Button, Card, Badge, EmptyState, Skeleton, ScoreRing,
ThemeToggle) — pakai ulang ini untuk fitur baru, jangan bikin styling dari nol supaya
tampilan tetap konsisten. Ikon pakai `lucide-react`. Modul di-lazy-load per route
(`React.lazy` di `App.tsx`) supaya `recharts` (dipakai Analytics, Channel Audit,
Competitors) tidak membebani modul yang tidak butuh chart.

Sekarang ada **8 modul**: Riset Kata Kunci (+ Rank Tracker), Bulk Edit (+ template &
thumbnail), Analisis A/B, Channel Audit, Playlist Manager, AI Studio (Gemini), Competitor
& Trend, dan Toolbox (+ Video Optimizer). Semua fitur write pakai pola fetch-merge-send /
read-merge-write yang sama supaya tidak menimpa field yang tidak disentuh. Kunci API
(YouTube & Gemini) hanya di localStorage, tidak pernah di file. IndexedDB terpusat di
`services/db.ts` (skema v3: suggestionsCache, competitorCache, channelSnapshots,
rankHistory).

## Yang sudah ada

- Dashboard shell dengan sidebar 4 modul (3 aktif, 1 ditandai "Segera"), responsive
  (sidebar jadi menu hamburger di layar sempit), toggle mode terang/gelap
- Onboarding API key: paste banyak key sekaligus, tervalidasi live, tersimpan di browser
- Riset kata kunci: harvesting suggestion asli dari autocomplete YouTube (teknik
  alphabet-soup), dengan skor estimasi demand yang dilabel jujur sebagai heuristik
- Analisis tag kompetitor: klik satu suggestion untuk narik tag dari video teratas yang
  relevan (pakai `search.list`, dibatasi ketat ke ~100 panggilan/hari, di-cache 7 hari)
- Bulk edit metadata: muat seluruh katalog video, cari & ganti massal di
  title/deskripsi/tag, pratinjau diff (cuma highlight bagian yang berubah, bukan
  seluruh teks) sebelum commit, estimasi biaya kuota ditampilkan sebelum simpan
- Analisis A/B thumbnail/judul: baca data views & durasi tonton resmi dari YouTube
  Analytics API, tandai tanggal ganti thumbnail/judul, lihat perbandingan sebelum/sesudah
  dalam chart + kartu ringkasan — bukan mesin testing baru, cuma dashboard di atas data
  test yang dijalankan native lewat YouTube Studio. (Angka CTR thumbnail yang persis
  dikonfirmasi TIDAK tersedia lewat API interaktif ini — cek tab "Reach" YouTube Studio
  langsung kalau butuh itu.)
- Budget meter kuota harian (10.000 unit pool + ~100 search.list) di status bar atas,
  identitas channel yang tersambung selalu ditampilkan jelas di modul OAuth
- Competitor & trend tracking: watchlist channel kompetitor (tambah via link/@handle/ID —
  nggak pernah pakai `search.list`), refresh hemat kuota (~1 unit buat seluruh watchlist),
  snapshot harian otomatis tersimpan lokal buat bangun grafik trend (YouTube nggak punya
  API histori buat channel orang lain), link-out ke Google Trends asli buat cek tren kata
  kunci (bukan scraping — zero risiko tambahan)

## Yang belum (opsional, bukan prioritas)

- Fase 1.5 (opsional): asistensi Gemini untuk cluster/prioritas kata kunci
- Trend tracking versi lebih dalam (opsional, kalau link-out ke Google Trends dirasa
  kurang — lihat catatan risiko di rencana awal sebelum membangun ini)

## Deploy ke Google Cloud Run (lewat Google AI Studio / GitHub)

Diverifikasi 2026-07-18: Google AI Studio (mode "Build") bisa **import project dari GitHub**
lalu deploy ke **Cloud Run** (ai.google.dev/gemini-api/docs/aistudio-build-mode). Google
Antigravity adalah tool coding ber-agent (desktop app + CLI), bukan platform hosting — kalau
mau memakainya untuk mengembangkan app ini, cukup buka repo ini di sana seperti editor lain,
tidak butuh perubahan kode tambahan.

Langkah:

1. `git init` sudah dijalankan di folder ini. Buat repo baru di GitHub kamu sendiri, lalu:
   ```
   git add .
   git commit -m "Initial commit"
   git remote add origin <URL repo GitHub kamu>
   git push -u origin main
   ```
2. Buka [aistudio.google.com](https://aistudio.google.com) → mode **Build** → **Import from
   GitHub** → pilih repo ini.
3. Deploy dari sana ke Cloud Run. `Dockerfile` di root sudah disiapkan (build Vite + serve
   static lewat paket `serve`, baca `$PORT` dari Cloud Run otomatis). Saat deploy, isi 2
   build argument ini (nilai sama seperti di `.env.local` kamu, JANGAN commit `.env.local`
   itu sendiri — sudah di-gitignore):
   - `VITE_GOOGLE_OAUTH_CLIENT_ID`
   - `VITE_SUGGEST_PROXY_URL`
4. Header keamanan (`X-Frame-Options`, dst) sudah diatur lewat `serve.json` — otomatis
   terpakai, tidak perlu setting tambahan di Cloud Run.
5. Setelah dapat URL Cloud Run yang sebenarnya, lanjutkan ke checklist di bawah (poin 1 & 2)
   — origin/redirect URI produksi WAJIB didaftarkan dulu sebelum OAuth & suggest-proxy jalan.

## Checklist sebelum deploy ke domain publik

App ini sekarang cuma didesain jalan di localhost. Sebelum di-deploy ke domain publik:

1. Tambahkan domain production ke `ALLOWED_ORIGINS` di
   `proxy/suggest-proxy/src/index.ts`, lalu `npx wrangler deploy` ulang.
2. Tambahkan domain production ke "Authorized JavaScript origins" di OAuth Client ID
   (Google Cloud Console).
3. Tambahkan header keamanan di level hosting (bukan `index.html` — `X-Frame-Options`
   dan `X-Content-Type-Options` tidak bisa diset lewat `<meta>` tag menurut spesifikasi
   CSP, wajib lewat HTTP header asli). Kalau hosting di Cloudflare Pages, ini lewat file
   `_headers` di root:
   ```
   /*
     X-Frame-Options: DENY
     X-Content-Type-Options: nosniff
     Content-Security-Policy: frame-ancestors 'none'
   ```
4. `vite.config.ts` men-set `server.host: '0.0.0.0'` (dev server bisa diakses dari
   perangkat lain di jaringan yang sama, bukan cuma localhost) — ini pola umum buat
   testing dari HP di WiFi yang sama, tapi pastikan kamu sadar ini aktif kalau lagi di
   jaringan yang tidak dipercaya.
