/** YouTube localisation target languages (BCP-47 codes accepted as `localizations` keys).
 *
 * Ordered and tiered by CREATOR RPM (take-home after YouTube's 45% cut) — NOT gross
 * advertiser CPM. HONEST SOURCING NOTE: YouTube itself never publishes per-country RPM —
 * there is no official source for this table. The tiering below is based on Dynamoi's
 * self-reported vendor RPM data (dynamoi.com, a music/YouTube-promotion platform) cross-checked
 * against other CPM/RPM vendor write-ups (Mediacube, Lenos, etc). Treat this as an industry
 * estimate, not a verified figure — the underlying numbers move between snapshots (Dynamoi's
 * own published Denmark RPM varied ~$8.37–$8.56 across pulls taken the same day), so use the
 * TIER ORDERING as directional guidance, not the exact dollar amounts.
 * The load-bearing insight (still directionally consistent across every vendor source checked):
 * Nordic countries over-index on RPM vs CPM (high YouTube Premium penetration + high ad-fill),
 * so Denmark tops RPM despite a mid CPM. That's why Danish/Norwegian sit in the top tier here
 * even though a CPM-only list would rank them lower.
 *
 * RPM is measured by AUDIENCE COUNTRY, not language, so languages spanning rich + poor
 * markets are weighted by where viewers actually sit (English's core is US/UK/CA/AU; Spanish
 * is dragged down by Latin America; Arabic by non-Gulf markets) — noted in each `markets` hint. */
export type CpmTier = 'S' | 'A' | 'B' | 'C';

export interface LangOption {
  code: string;
  name: string;
  /** RPM tier of the markets this language unlocks. S = highest take-home. */
  tier: CpmTier;
  /** Short "which markets + RPM nuance" hint, shown as a tooltip in the picker. */
  markets?: string;
}

export const TIER_META: Record<CpmTier, { label: string; hint: string }> = {
  S: { label: 'Tier S', hint: 'RPM take-home tertinggi — prioritaskan' },
  A: { label: 'Tier A', hint: 'RPM tinggi' },
  B: { label: 'Tier B', hint: 'RPM sedang' },
  C: { label: 'Tier C', hint: 'RPM lebih rendah, jangkauan luas' },
};

export const TARGET_LANGUAGES: LangOption[] = [
  // ── Tier S — highest creator RPM (take-home) ──
  { code: 'en', name: 'English', tier: 'S', markets: 'AS, UK, Kanada, Australia, NZ, Irlandia — inti RPM tinggi (ekor India/Nigeria rendah)' },
  { code: 'da', name: 'Dansk (Danish)', tier: 'S', markets: 'Denmark — RPM #1 dunia (Premium tinggi)' },
  { code: 'no', name: 'Norsk (Norwegian)', tier: 'S', markets: 'Norwegia — RPM jauh di atas CPM-nya' },

  // ── Tier A — high RPM ──
  { code: 'de', name: 'Deutsch (German)', tier: 'A', markets: 'Jerman, Austria, Swiss (DACH) — tier bersih tanpa ekor rendah' },
  { code: 'nl', name: 'Nederlands (Dutch)', tier: 'A', markets: 'Belanda, Belgia (Flandria)' },
  { code: 'fr', name: 'Français (French)', tier: 'A', markets: 'Prancis, Belgia, Swiss, Kanada (Quebec) — bagian Afrika rendah' },
  { code: 'sv', name: 'Svenska (Swedish)', tier: 'A', markets: 'Swedia (konversi RPM di bawah Denmark/Norwegia)' },
  { code: 'fi', name: 'Suomi (Finnish)', tier: 'A', markets: 'Finlandia — RPM tinggi, audiens kecil' },
  { code: 'is', name: 'Íslenska (Icelandic)', tier: 'A', markets: 'Islandia — RPM tinggi, pasar sangat kecil' },

  // ── Tier B — mid RPM ──
  { code: 'ja', name: '日本語 (Japanese)', tier: 'B', markets: 'Jepang — audiens besar, RPM sedang' },
  { code: 'ko', name: '한국어 (Korean)', tier: 'B', markets: 'Korea Selatan' },
  { code: 'he', name: 'עברית (Hebrew)', tier: 'B', markets: 'Israel' },
  { code: 'it', name: 'Italiano (Italian)', tier: 'B', markets: 'Italia, Swiss' },
  { code: 'es', name: 'Español (Spanish)', tier: 'B', markets: 'Spanyol sedang; Amerika Latin (mayoritas audiens) rendah' },
  { code: 'pl', name: 'Polski (Polish)', tier: 'B', markets: 'Polandia' },
  { code: 'cs', name: 'Čeština (Czech)', tier: 'B', markets: 'Ceko' },
  { code: 'el', name: 'Ελληνικά (Greek)', tier: 'B', markets: 'Yunani' },
  { code: 'hu', name: 'Magyar (Hungarian)', tier: 'B', markets: 'Hungaria' },
  { code: 'ro', name: 'Română (Romanian)', tier: 'B', markets: 'Rumania' },
  { code: 'pt', name: 'Português (Portuguese)', tier: 'B', markets: 'Portugal sedang; Brasil (mayoritas audiens) rendah' },

  // ── Tier C — lower RPM, broad reach ──
  { code: 'ar', name: 'العربية (Arabic)', tier: 'C', markets: 'Teluk/UAE lumayan (niche mewah/tech); mayoritas Arab rendah' },
  { code: 'ru', name: 'Русский (Russian)', tier: 'C', markets: 'Rusia, CIS' },
  { code: 'tr', name: 'Türkçe (Turkish)', tier: 'C', markets: 'Turki' },
  { code: 'uk', name: 'Українська (Ukrainian)', tier: 'C', markets: 'Ukraina' },
  { code: 'sk', name: 'Slovenčina (Slovak)', tier: 'C', markets: 'Slovakia' },
  { code: 'bg', name: 'Български (Bulgarian)', tier: 'C', markets: 'Bulgaria' },
  { code: 'hr', name: 'Hrvatski (Croatian)', tier: 'C', markets: 'Kroasia' },
  { code: 'sr', name: 'Српски (Serbian)', tier: 'C', markets: 'Serbia' },
  { code: 'sl', name: 'Slovenščina (Slovenian)', tier: 'C', markets: 'Slovenia' },
  { code: 'et', name: 'Eesti (Estonian)', tier: 'C', markets: 'Estonia' },
  { code: 'lv', name: 'Latviešu (Latvian)', tier: 'C', markets: 'Latvia' },
  { code: 'lt', name: 'Lietuvių (Lithuanian)', tier: 'C', markets: 'Lituania' },
  { code: 'ca', name: 'Català (Catalan)', tier: 'C', markets: 'Spanyol (Catalonia)' },
  { code: 'hi', name: 'हिन्दी (Hindi)', tier: 'C', markets: 'India — volume besar, RPM rendah' },
  { code: 'id', name: 'Bahasa Indonesia', tier: 'C', markets: 'Indonesia' },
  { code: 'vi', name: 'Tiếng Việt (Vietnamese)', tier: 'C', markets: 'Vietnam' },
  { code: 'th', name: 'ไทย (Thai)', tier: 'C', markets: 'Thailand' },
  { code: 'zh', name: '中文 (Chinese)', tier: 'C', markets: 'Taiwan, Hong Kong, Singapura' },
  { code: 'ms', name: 'Bahasa Melayu (Malay)', tier: 'C', markets: 'Malaysia' },
  { code: 'fil', name: 'Filipino (Tagalog)', tier: 'C', markets: 'Filipina' },
  { code: 'bn', name: 'বাংলা (Bengali)', tier: 'C', markets: 'Bangladesh, India' },
  { code: 'ta', name: 'தமிழ் (Tamil)', tier: 'C', markets: 'India, Sri Lanka' },
  { code: 'te', name: 'తెలుగు (Telugu)', tier: 'C', markets: 'India' },
  { code: 'mr', name: 'मराठी (Marathi)', tier: 'C', markets: 'India' },
  { code: 'gu', name: 'ગુજરાતી (Gujarati)', tier: 'C', markets: 'India' },
  { code: 'kn', name: 'ಕನ್ನಡ (Kannada)', tier: 'C', markets: 'India' },
  { code: 'ml', name: 'മലയാളം (Malayalam)', tier: 'C', markets: 'India' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ (Punjabi)', tier: 'C', markets: 'India, Pakistan' },
  { code: 'ur', name: 'اردو (Urdu)', tier: 'C', markets: 'Pakistan' },
  { code: 'fa', name: 'فارسی (Persian)', tier: 'C', markets: 'Iran' },
  { code: 'af', name: 'Afrikaans', tier: 'C', markets: 'Afrika Selatan' },
  { code: 'sw', name: 'Kiswahili (Swahili)', tier: 'C', markets: 'Kenya, Tanzania' },
  { code: 'az', name: 'Azərbaycan (Azerbaijani)', tier: 'C', markets: 'Azerbaijan' },
  { code: 'kk', name: 'Қазақ (Kazakh)', tier: 'C', markets: 'Kazakhstan' },
  { code: 'ka', name: 'ქართული (Georgian)', tier: 'C', markets: 'Georgia' },
  { code: 'sq', name: 'Shqip (Albanian)', tier: 'C', markets: 'Albania, Kosovo' },
];

/** Languages grouped by RPM tier, for a picker that surfaces the high-value ones first. */
export const LANGUAGES_BY_TIER: { tier: CpmTier; langs: LangOption[] }[] = (['S', 'A', 'B', 'C'] as CpmTier[]).map(
  (tier) => ({ tier, langs: TARGET_LANGUAGES.filter((l) => l.tier === tier) })
);

/**
 * Per-market cultural localisation guidance for the generators. Keyed by BCP-47 code.
 * These encode how NATIVE content is actually written in each high-revenue market so the
 * AI rebuilds the title/description from the local formula instead of machine-translating
 * the English structure (validated via 2026 localisation research). Only the highest-value
 * markets get a bespoke profile; others fall back to a generic "write natively" instruction.
 */
export const MARKET_GUIDANCE: Record<string, string> = {
  en: 'US/UK English. Title Case for the brand/main phrase, then the signature lowercase gerund tail ("beats to study/relax/sleep to"). 1-4 word minimal thumbnail concept, single focal point, one bold sans-serif. Individual/productivity use-cases (focus, deep work, study, unwind). No exclamation spam, no ALL-CAPS, at most ~2 stacked keywords. Keep genre loanwords (lofi, chillhop, ambient, chill, beats).',
  de: 'German (DACH). Translate idiomatically, NEVER word-for-word. Calm, precise, factual tone — Germans read hype as untrustworthy, so no "BESTE!!!". Use compound nouns as one word: Entspannungsmusik, Einschlafmusik, Schlafmusik, Lernmusik, Konzentrationsmusik, plus Tiefschlaf, beruhigende Musik, Meditationsmusik, Naturgeräusche. CAPITALISE EVERY NOUN (Musik, Schlaf, Stunden, Konzentration). Numbers "10 Stunden", decimal comma (1,50), thousands dot (15.000). Keep loanwords Lofi/Ambient/Chill.',
  ja: 'Japanese. The master keyword is BGM, not 音楽. Use purpose-prefixed forms: 作業用BGM (work), 勉強用BGM (study), 睡眠用BGM / 睡眠導入 (sleep), plus 癒し, リラックス, 集中, カフェミュージック. Thumbnails are legitimately text-dense: bracket-tag use-cases in 【】 e.g. 【勉強用・作業用・睡眠用BGM】 and front-load duration (3時間). Thick Gothic Black-weight font, double-outlined text + drop shadow, red/yellow/white accents. Use full-width punctuation 【】（）、。. Never literal-translate "study music" to 研究音楽 — the idiom is 勉強用BGM.',
  fr: 'French. Full French expected (audience is protective of the language). Keywords: musique relaxante, musique douce, pour dormir / pour s\'endormir, pour travailler, pour étudier, pour se concentrer, méditation, sommeil profond. TWO hard native tells: (1) SENTENCE CASE only, never Title-Case every word; (2) a non-breaking space BEFORE : ; ! ? and inside « guillemets ». Accents are mandatory (étudier, détendre). "10 heures", decimal comma. Keep Lofi/chill. Warm aesthetic tone, tasteful emoji ok.',
  ko: 'Korean. Native pattern is a KOREAN + ENGLISH bilingual single-line title, e.g. "공부할때 듣기 좋은 음악 🎵 Relaxing Study & Sleep Music". Keywords: 수면음악, 공부할때 듣는 음악, 수면유도음악, 집중, 힐링음악, 잔잔한, 감성, 카페음악, 플레이리스트/플리. Playlist culture dominates — frame as a 플레이리스트. Natural spoken "~할때 듣기 좋은" phrasing with correct Korean spacing/particles. Duration up front (10시간), aesthetic emoji.',
  nl: 'Dutch. Very high English proficiency — English is often accepted as native for instrumental music, so clean English is a safe default. If localising Dutch: ontspannende/rustgevende muziek, slaapmuziek, muziek om te studeren, concentratie, focus (keep English loanwords). Direct, understated tone — Dutch distrust hype even more than Germans. Sentence case (few caps), decimal comma, "uur". Minimalist Western thumbnail, "gezellig" cosy framing.',
  da: 'Danish. Scandinavians have top-tier English, so clean English often reads native for instrumental music (safe default); optionally add a Danish emotional/seasonal hook. If localising: afslappende musik, søvn, sovemusik. Sentence case, understated tone, no exclamation spam, decimal comma, "timer". Lean on cosy "hygge" and nature imagery (forest, rain, snow).',
  no: 'Norwegian. Like Danish — clean English often reads native for instrumental music (safe default); optional Norwegian hook. If localising: avslappende musikk, sovemusikk, søvn. Sentence case, understated, no hype, decimal comma, "timer". Cosy "koselig" + nature (fjord, forest, snow, rain) framing.',
  sv: 'Swedish. Clean English often reads native for instrumental music (safe default); optional Swedish hook. If localising: avslappnande musik, sömn, musik för studier. Sentence case, understated, decimal comma, "timmar". Cosy "mysig" + nature framing.',
  es: 'Spanish. Full Spanish. Keywords: música relajante, música para dormir, para estudiar, para trabajar, concentración, meditación, sueño profundo. Sentence case (Spanish capitalises far fewer words than English). Inverted marks ¿ ¡ where relevant. Keep Lofi/chill. Warm tone.',
  it: 'Italian. Full Italian. Keywords: musica rilassante, musica per dormire, per studiare, per concentrarsi, meditazione, sonno profondo. Sentence case. Keep Lofi/chill. Warm tone.',
  pt: 'Portuguese. Full Portuguese (weight toward Brazil, the largest audience). Keywords: música relaxante, música para dormir, para estudar, para trabalhar, concentração, meditação, sono profundo. Sentence case. Keep Lofi/chill.',
  id: 'Indonesian (Bahasa Indonesia). Write natural spoken Indonesian, NOT stiff translated English. Tone is warm, friendly and direct — Indonesian creators address the viewer personally ("kamu", "kalian", "gaes"/"guys" for casual channels) rather than formally ("Anda"), unless the channel is corporate. Keywords by use-case: musik relaksasi, musik untuk tidur, buat kerja, buat belajar, buat fokus, musik santai, suara hujan, meditasi, ketiduran, biar rileks. Very common native pattern is Indonesian + English mixed in one title (code-switching is normal and reads native, not sloppy) — e.g. "Musik Santai buat Kerja ☕ Lofi Chill 3 Jam". Keep genre loanwords in English (lofi, ambient, chill, beats, playlist). Use "buat"/"untuk" for the use-case framing. Duration in Indonesian: "3 Jam", "10 Jam". Sentence case or Title Case both read fine; avoid ALL-CAPS shouting except one word. Numbers use dot thousands (15.000) and comma decimal (1,5). Emoji are welcome and common. For non-music niches (sport, news, gaming) Indonesian titles often front-load the subject name + a strong emotional word (GOKIL, MENGAMUK, GACOR) — match the channel\'s existing voice rather than imposing a formal register.',
};

/** The default-language options to set on a video whose defaultLanguage isn't set yet. */
export const DEFAULT_LANGUAGE_OPTIONS: LangOption[] = [
  { code: 'id', name: 'Bahasa Indonesia', tier: 'C' },
  { code: 'en', name: 'English', tier: 'S' },
];

/** Markets offered in the generator's localisation selector (those with a bespoke profile),
 * newest-highest-value first. `null` = write for a global English-speaking audience. */
export const LOCALIZATION_MARKETS: { code: string | null; label: string }[] = [
  { code: null, label: 'Global (English netral)' },
  { code: 'id', label: 'Indonesia' },
  { code: 'en', label: 'AS / UK (English)' },
  { code: 'de', label: 'Jerman / DACH' },
  { code: 'ja', label: 'Jepang' },
  { code: 'fr', label: 'Prancis' },
  { code: 'ko', label: 'Korea Selatan' },
  { code: 'nl', label: 'Belanda' },
  { code: 'da', label: 'Denmark' },
  { code: 'no', label: 'Norwegia' },
  { code: 'sv', label: 'Swedia' },
  { code: 'es', label: 'Spanyol' },
  { code: 'it', label: 'Italia' },
  { code: 'pt', label: 'Portugal / Brasil' },
];
