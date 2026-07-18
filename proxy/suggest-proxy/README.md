# panna-suggest-proxy

Satu Cloudflare Worker kecil yang jadi relay ke endpoint autocomplete YouTube (biar nggak
kena blokir CORS dari browser). Gratis, nggak butuh kartu kredit, free tier 100.000
request/hari — jauh di atas kebutuhan pemakaian personal.

## Cara deploy (sekali saja)

1. `cd proxy/suggest-proxy`
2. `npm install`
3. `npx wrangler login` — ini buka browser, login pakai akun Cloudflare kamu (bikin akun
   gratis dulu di dash.cloudflare.com kalau belum punya).
4. `npx wrangler deploy`
5. Setelah selesai, terminal akan menampilkan URL worker-nya, bentuknya kira-kira:
   `https://panna-suggest-proxy.<username-kamu>.workers.dev`
6. Copy URL itu, tempel ke file `.env.local` di root `panna-command-center` sebagai:
   `VITE_SUGGEST_PROXY_URL=https://panna-suggest-proxy.<username-kamu>.workers.dev`

## Cara tes lokal (opsional, sebelum deploy)

`npm run dev` — jalanin worker di localhost, defaultnya di `http://localhost:8787`.
Test dengan buka `http://localhost:8787/suggest?q=focus%20music` di browser, harus
muncul JSON `{ "query": "focus music", "suggestions": [...] }`.

## Update keamanan (audit 2026-07-10)

Worker ini sekarang cuma bisa dipanggil dari origin yang terdaftar di `ALLOWED_ORIGINS`
(`src/index.ts`) — sebelumnya siapapun yang tau URL-nya bisa manggil dari mana saja tanpa
batas. Kalau kamu deploy `panna-command-center` ke domain publik nanti, tambahkan domain
itu ke `ALLOWED_ORIGINS`, lalu **deploy ulang worker-nya** (`npx wrangler deploy`) —
kalau lupa, app di domain baru itu bakal kena error 403 dari worker ini.

Kalau worker yang sudah live sebelumnya belum dapat update ini, jalankan `npx wrangler
deploy` sekali lagi dari folder ini untuk mendorong perbaikan keamanannya ke versi yang
sudah live.
