# PROGRESS.md — SniffMySite build log (Chat A)

> One task at a time (§0.1). Each task: build → `npm run build` green →
> self-review against the anti-slop law (§0.4) → tick the checklist.

## Session — 2026-09-20, overnight build (subagent)

### Scaffold (pre-Task 2)
- Monorepo at `~/workspace/vaporrank-burnrate/` with npm workspaces.
- `apps/vapor` — React 19 + Vite 6 + TypeScript + Tailwind CSS v4
  (@tailwindcss/vite). Dev server proxies `/api` → `localhost:4000`.
- `packages/api` — Express 4 + TypeScript skeleton: `helmet`, CORS allowlist
  (env-driven, defaults to local dev), `GET /health`, stubbed routers for
  `/api/vapor/*`, `/api/burn/*`, `/api/billing/*`. Every stub returns
  `501 { error: "not_implemented" }` naming the task that will implement it.
  Full API logic is explicitly out of scope until Tasks 4–10.
- `apps/vapor/.env.example` created with placeholders. A local `apps/vapor/.env`
  exists for dev (gitignored, never committed). The anon key is public-by-design
  and is NOT written in any doc or memory file. The service-role key was never
  requested, never used. No writes were made to Supabase.

### TASK 2 — Design system "The Inspection Lab" (§2.7) ✅
`apps/vapor/src/index.css` is the single source of truth:
- Tokens: paper `#FAF8F4`, ink `#141310`, ink-soft `#4E4A41`,
  ink-faint `#8A8578`, hazard `#FF4D00` (+ `hazard-deep` for CTA hover),
  hairline `#E5E1D8`. No ad-hoc colors in components.
- Type: Space Grotesk 700 (display), Inter (body), JetBrains Mono
  (data/numbers) via Google Fonts. `font-display` / `font-body` / `font-data`
  Tailwind utilities.
- Rubber-stamp verdict component (`components/Stamp.tsx`): rotated −8°,
  double-ringed (3px border + 1px outline offset), uppercase mono,
  letter-spaced; stamps in with a 300ms thud
  (`cubic-bezier(0.2, 2.1, 0.36, 1)`: scale 2.4 → 0.92 → 1, rotate −16° → −8°).
  Hazard tone for vapor verdicts, ink tone for CERTIFIED REAL / MOSTLY HARMLESS.
- `useCountUp` hook: easeOutExpo 0 → score over 1200ms for reveals.
- Lucide icons only (`FlaskConical`, `ScanSearch`); custom one-color SVG logo
  (scent lines over ascending bars, hazard tip on the tallest bar).
- Marquee ticker (38s seamless loop, pauses on hover), staggered row entrances,
  1px hover lift on leaderboard rows. `prefers-reduced-motion` disables all
  choreography.

### TASK 3 — Landing page (§2.3 `/`) ✅
`apps/vapor/src/App.tsx` + components:
- Header: hairline rule, logo + wordmark, one quiet nav link (Leaderboard
  anchor). No header button — the hero keeps exactly one CTA.
- Hero (above the fold, left-aligned — NOT the centered AI-starter layout):
  eyebrow, the one-liner **"We sniff startups so you don't have to."**,
  one supporting sentence, the scan box, and the Hall of Vapor top-10 on the
  right. 5-second rule satisfied: what it is, why it's funny, what to do.
- Scan box (`components/ScanBox.tsx`): URL input + the single CTA
  **"Run the sniff test"**. Runs the §2.8 loading sequence ("Sniffing…" →
  "Counting buzzwords…" → "Checking if the demo exists…"), then an inline
  mock result: count-up score, stamped tier verdict, three metric bars,
  "sniffed just now · algo v1". Deterministic per domain (stable pseudo-random
  from URL hash). Invalid input gets an inline error, not a dead end.
- Leaderboard (`components/Leaderboard.tsx`): hairline-separated rows, mono
  tabular ranks/scores, hazard score bars, mini tier stamps, staggered
  entrance; hover lifts 1px and reveals a working "sniff again" affordance
  that seeds the hero scan box with the domain. Full sortable board is Task 6.
- Ticker (`components/Ticker.tsx`): "latest sniffs" marquee in mono.
- Manifesto teaser strip: "Every AI startup is 'revolutionizing' something.
  We measure the revolution." + three lab-stat rows (6 signals / 0–100 /
  $0) — hairline-divided, no cards.
- Footer: "No startups were harmed. Several were exposed." + explicit
  fictional-data disclaimer.

### Mock data (ALL fictional — no real companies anywhere)
`apps/vapor/src/lib/mock.ts`: SynergAI (94), Promptly (89), Neuraluxe (82),
VibeCodr (77), LLMagic (71), Disruptly (66), Agently (58), Quantopia (49),
OmniPrompt (33), DeepSprint (18). Tiers/verdicts from `lib/tiers.ts` per §2.4.
The live leaderboard (Task 6) replaces this with scoring-engine output (Task 4).

### Build verification
- `npm install` — 188 packages, clean.
- `npm run build` (root, all workspaces) — **passes**: `tsc` clean for both
  packages, Vite production build emits `dist/` (1679 modules).
- API smoke-tested live: `GET /health` → 200 `{"status":"ok",...}`;
  `GET /api/vapor/leaderboard` → 501; `POST /api/billing/webhook` → 501 with
  `{"error":"not_implemented","task":"task-9-lemon-squeezy"}`.
- Built CSS verified to contain the exact brand tokens (`#FAF8F4`, `#141310`,
  `#FF4D00`) and the `stamp-in` / `marquee` / `row-in` keyframes.

### Anti-slop self-review (§0.4) — written per task
- No purple/blue gradients, no aurora, no glassmorphism: solid paper
  background throughout. ✅
- No generic rounded-2xl card grids: layout is carried by 1px hairlines and
  whitespace; the only "grid" is a hairline-divided stat strip, not boxes. ✅
- No Inter-everywhere: Space Grotesk display + JetBrains Mono data. ✅
- No emoji icons: Lucide + custom SVG only; zero emojis in UI. ✅
- No lorem ipsum: every pixel is real (mock) content — 10 startups, real
  verdict copy, real metric labels. ✅
- No chatbot/cookie/testimonial slop. ✅
- No centered-hero-with-pill-badge AI-starter look: left-aligned hero, no
  badge, no gradient headline, exactly one CTA. ✅
- Hazard orange audit: used ONLY for scores, stamps, score bars, the CTA
  button (+hover), loading pulse, selection, focus rings. Stat numerals and
  the ticker label were deliberately set in ink after review — accent stays
  disciplined. ✅
- Screenshot test: nothing on the page could be mistaken for a generic SaaS
  template — the stamp, mono data type, and deadpan lab voice carry it. ✅

### Not done / next
- Task 4: SSRF-safe fetch + scoring engine v1 (replaces mock scan).
- Task 1 remainder (parent lane): domain purchase, Lemon Squeezy application.
- No blockers encountered. Nothing was hacked around.

### Files of note
- Design tokens: `apps/vapor/src/index.css`
- Mock data + tiers: `apps/vapor/src/lib/mock.ts`, `apps/vapor/src/lib/tiers.ts`
- API skeleton: `packages/api/src/`
- Supabase schema (already applied by parent): `supabase/001_foundation.sql`

### Footer tweak (parent, post-review) — 2026-09-20 ~02:05 PKT
- Joshua loved the design; one change: "No startups were harmed. Several were exposed." now a big centered display headline (text-3xl md:text-5xl) with the fictional-data disclaimer as sub-line. Build green. Other polish deferred to final pass.
- Review gate cleared: moving to Task 4.

---

## Chat B — BurnRate Task 2: design system ("After-Hours Trading Floor") — 2026-09-20 ~02:12 PKT

- Scaffolded `apps/burn` (`@burnrate/burn`), toolchain mirrored from vapor: React 19 + Vite 6 + TS + Tailwind v4. Dev port **5174** (vapor holds 5173), same `/api → :4000` proxy. `npm run build` green (verified independently).
- Tokens (`apps/burn/src/index.css`, `@theme`): bg #0b0b0c, surface #131315, text #f5f1e8, ember #ff5c1a (+deep #d64a12 CTA hover, +dim #7a2d10 #1-row hairlines), ash #8a877f, divider #1f1f22. Type: Space Grotesk 700 display, Inter body, JetBrains Mono (tabular) for ALL money figures, Instrument Serif italic editorial accents only.
- Components: `Ticker` (top marquee, §3.8 demo copy — "$1.2M incinerated today (allegedly)", pauses on hover), `useCountUp` (easeOutExpo, respects reduced-motion), `Logo` (custom SVG banknote + flame corner, currentColor ember).
- Preview sheet only in App.tsx — NOT the landing page (Task 3 scope preserved).
- `src/config.ts`: SITE_DOMAIN = 'burn-rate.lol' (canonical; purchase stays Joshua's step).

### Anti-slop self-review (Chat B)
- No purple/blue gradients, no glassmorphism: ember rationed by rule (burn figures, #1 glow, CTAs) — ash and off-white do all normal work. ✅
- No rounded-2xl card grids: 1px dividers (#1f1f22) and whitespace carry layout. ✅
- No Inter-everywhere: Grotesk display + mono money type; serif italic reserved for editorial accents. ✅
- No emoji icons: Lucide Flame + custom SVG only. ✅
- No lorem ipsum: tape copy is the product's real §3.8 voice ("audited by vibes™"). ✅
- Reduced-motion respected: marquee/count-ups/pulses all disabled under prefers-reduced-motion. ✅
- Screenshot test: reads as a Bloomberg terminal that stopped pretending — ember-on-ash, tabular money columns, deadpan satire voice. ✅

### Next
- Task 3: landing page (hero + top-10 board + ticker). Awaiting Joshua's go-ahead.
- Task 1 remainder (human step): burn-rate.lol purchase, planned Sep 21.

## Chat B — BurnRate Task 3: landing page — 2026-09-20 ~02:15 PKT

- `apps/burn/src/App.tsx`: ticker tape → header (logo + "audited by vibes™") → compact left-aligned hero → "incinerated today (allegedly)" count-up strip ($30,400) → top-10 burn board above the fold → serif-italic manifesto teaser → footer.
- `lib/mock.ts`: 10 obviously-fictional companies (StealthMode AI $212k/mo down to CashFurnace $26k/mo), `formatBurn` / `formatRunway` helpers ("0 days · airborne").
- `components/Board.tsx`: mono rank, name + fictional domain, tabular mono burn figures, runway, headcount; #1 crowned with Lucide Flame + `.money-glow`; 70ms staggered row entrances; dividers + whitespace, no cards.
- Build green (verified independently). Exactly one CTA ("List your burn" → /list, route is Task 4).

### Anti-slop self-review (Chat B, independent)
- "Obvious on landing": one-liner + board visible without scrolling + exactly one CTA. ✅ (verified in App.tsx — single ember button, compact hero)
- Ember rationed: burn figures, #1 crown, CTA, selection/focus only. ✅
- No gradients/glassmorphism/card grids; 1px dividers carry layout. ✅
- No emoji icons (Lucide Flame/ArrowRight only — grep-verified zero emoji in src). ✅
- No lorem ipsum: every string is §3.8 voice ("Runway: 0 days. Status: airborne."). ✅
- Satire guardrail: footer labels self-reported data, "audited by vibes". ✅
- Reduced-motion: tokens kill marquee/count-ups/staggers. ✅

### Next
- Task 4: submit form + moderation queue. Awaiting Joshua's go-ahead.
- Task 1 remainder (human step): burn-rate.lol purchase, planned Sep 21.

## Chat B — BurnRate Task 4: submit form + moderation queue — 2026-09-20 ~02:18 PKT

- Frontend (`apps/burn`): `/list` route with the 60-second form (name, domain, mono `$` burn input, runway, headcount/funding optional, email), honeypot field, client validation mirroring server, success state with rotated "IN THE QUEUE" ember stamp, honest 409 handling. App.tsx is now a router shell (`/` landing, `/list` form, deadpan 404); header/footer extracted; `public/_redirects` for Cloudflare Pages SPA fallback; react-router-dom added.
- API (`packages/api`): real `POST /api/burn/submit` — pipeline: honeypot (fake 201) → per-IP rate limit (10/hr, 429) → Turnstile (enforced only when `TURNSTILE_SECRET_KEY` set; warns + proceeds otherwise, TODO marked) → server-side validation (`lib/validate.ts`, domain normalization strips scheme/www/path/port, rejects IPs/localhost) → duplicate-domain pre-check + `23505` race catch → 409 "This domain already burns here." → insert as `status='pending'` via service-role key (anon has no INSERT grant). Returns only `{id, status}`.
- Builds green independently (frontend `tsc && vite build`; api `tsc`); 8/8 API unit tests pass (`node --test`); live smoke test verified 400/201/429/500 paths. No secrets committed (`.env.example` only).
- Moderation queue = `burn.companies` rows with `status='pending'` (public RLS exposes only `live`). Joshua reviews in Supabase Table Editor and flips to `live`/`rejected`. No admin dashboard v1 (§1.6).
- Deferred: email magic-link verification (→ Task 7 claim flow); Turnstile enforcement (deploy-time secret); end-to-end DB insert (needs service-role key in server env).

### Anti-slop self-review (Chat B, independent)
- Form runs on hairline dividers (`divide-y divide-divider`), not a card. ✅
- Ember rationed: submit button, burn-input focus, error text, success stamp. ✅
- Copy is §3.8 voice throughout ("What are you setting on fire?", "pending audit by vibes"). ✅
- Centered success stamp is a confirmation state, not a hero — acceptable. ✅

### Next
- Task 5: company pages + live runway countdown. Awaiting Joshua's go-ahead.
- Task 1 remainder (human step): burn-rate.lol purchase, planned Sep 21.

## Chat B — BurnRate Task 5: company pages + live runway countdown — 2026-09-20 ~02:20 PKT

- API (`packages/api`): real `GET /api/burn/company/:slug` — live rows only; pending/rejected 404 exactly like unknown slugs (queue stays invisible). New `lib/company.ts`: slug derivation + runway math, pure and unit-tested (7 new tests). Side fix: `npm test` script's `node --test dist/test/` directory form never resolved on this Node version — changed to `dist/test/*.test.js` so `npm test` works.
- Slug scheme: no slug column in `burn.companies`; domain is unique + normalized at insert, so slug = first DNS label (`stealthmode.lol` → `stealthmode`). Documented v1 caveat in code: `foo.lol` vs `foo.io` would collide — fix later is a real unique slug column.
- Frontend (`apps/burn`): `/c/:slug` page — big mono burn figure, stat strip (runway, headcount, funding, listed date), LIVE countdown ticking every second toward `listed_at + runway_months × 30.4375d` (constant duplicated in frontend fallback with keep-in-sync comment); under 7 days figures go ember; at zero: "Runway: 0 days. Status: airborne." — always labeled "not financial advice, obviously." Badge shelf = honest empty state; report-card button visibly disabled (Task 6). Deadpan 404 ("This burner doesn't exist. Or it burned out completely."). Board rows now link to `/c/:slug`. API-first with explicit mock fallback when DB env is absent (API 404 never falls back — honest).
- Builds green independently; `npm test` 74/74 pass, 0 fail.

### Anti-slop self-review (Chat B, independent)
- Countdown is the page hero: big tabular mono units on hairline dividers. ✅
- Ember rationed: burn figure + danger state only. ✅
- Zero emoji in new code (grep-verified); Lucide only. ✅
- Every string §3.8 voice. ✅

### Next
- Task 6: report card PNG generator + OG images. Awaiting Joshua's go-ahead.
- Task 1 remainder (human step): burn-rate.lol purchase, planned Sep 21.

## Chat B — BurnRate Task 6: report card PNGs + OG images — 2026-09-20 ~02:25 PKT

- PNG stack: hand-built SVG → PNG via `@resvg/resvg-js` (no puppeteer — too heavy for Render free tier; no sharp — librsvg text rendering is fontconfig-dependent). JetBrains Mono Bold + Space Grotesk Bold TTFs bundled in repo (`packages/api/src/assets/fonts/`, `copy:fonts` build step); loud fallback if run without them.
- API: `GET /api/burn/report-card/:slug.png` — sanitize → 120/hr/IP rate limit → live rows only (pending/unknown 404) → FIFO in-memory cache (200, keyed slug:sha1(fields)) → ETag/304 + `Cache-Control: public, max-age=3600`. 15 new unit tests; render pipeline covered by a test asserting real 1200×630 PNG bytes. Smoke test: no-DB → honest 500; 123 rapid requests → exactly 120 + 3× 429.
- Frontend: `ReportCardButton` replaces the disabled "cooking" button — native share sheet with card attached where `canShare` allows, else download; "Printing the card…" / "The printer jammed. Try again." states. `index.html` has site-wide OG tags (`og:image` → `https://burn-rate.lol/og-default.png`, canonical per config.ts — Vite can't interpolate `%VITE_*%` in index.html, verified); `public/og-default.png` generated and shipped.
- Cloudflare Pages Function `functions/c/[slug].js`: User-Agent sniff for social crawlers (Twitterbot, facebookexternalhit, LinkedInBot, Slackbot, Discordbot, TelegramBot, WhatsApp…) — crawlers get a tiny HTML shell with per-company og:title/description/image (absolute API PNG URL, live rows only so pending never leaks); humans pass through via `env.ASSETS.fetch`. API-down → generic shell with og-default.png. Functions take precedence over `/* → /index.html` redirect, SPA unaffected. `node --check` clean.
- Env: `PUBLIC_SITE_URL`, `PUBLIC_API_BASE_URL` (API + Pages Function + `VITE_PUBLIC_API_BASE_URL`); local dev works empty via Vite `/api` proxy; production builds must set them to the Render origin.
- Builds green independently; `npm test` 88/88 pass, 0 fail.
- Sample card reviewed by eye: on-brand (near-black, hairline frame, ember mono figure, "audited by vibes™", "not financial advice. obviously."). Known nit: giant burn figure slightly crowds the RUNWAY line — readable, log for a polish pass, not a blocker.

### Anti-slop self-review (Chat B, independent)
- Card + OG are pure trading-floor: no gradients, no cards-in-cards, mono type, ember rationed to burn figure + flame. ✅
- Every string §3.8 voice ("Printing the card…", "The printer jammed."). ✅

### Next
- Task 7: claim flow (email + DNS TXT). Awaiting Joshua's go-ahead.
- Task 1 remainder (human step): burn-rate.lol purchase, planned Sep 21.

## Chat B — BurnRate Task 7: claim flow (email + DNS TXT) — 2026-09-20 ~02:28 PKT

- Schema: new migration `supabase/002_claim_expiry.sql` (001 untouched) — adds `burn.claims.expires_at`, `burn.claims.claim_email`, unique index on `verification_token`; adds `burn.companies.claimed_by_email` + `claimed_at` (what Task 8's $9 Verified Burner badge gates on).
- API: `POST /api/burn/claim` (5/hr/IP + Turnstile; anti-enumeration "check your inbox" always, except public "already spoken for"); `GET /api/burn/claim/verify?token=` (single-use: only matches `verified_at IS NULL`, 302 to `/claim?claim=<uuid>`, invalid/expired → 302 with `claim_error`); `GET /api/burn/claim/:id/status` (safe subset, no email); `GET /api/burn/claim/:id/dns` (email-verified-gated, reveals `burnrate-verify=<challenge>`); `POST /api/burn/verify-dns` (10/hr/IP, `dns.promises.resolveTxt` exact match with chunk-joining, idempotent, sets claimed_by_email/claimed_at).
- Token design (`lib/claim.ts`, pure/tested): `randomBytes(32)`, store sha256 only, 24h expiry; DNS challenge = `HMAC-SHA256(CLAIM_DNS_SECRET, claim_id)` — deterministic, never stored plaintext.
- Email: Resend HTTPS API via plain fetch (`lib/resend.ts`); dev mode when `RESEND_API_KEY` unset = loud console warning + magic link logged, flow fully testable. Production needs `RESEND_API_KEY` + verified `RESEND_FROM_EMAIL` + `PUBLIC_API_URL` + `CLAIM_DNS_SECRET` (all documented in `.env.example`).
- Frontend: `/claim` two-step page ("Prove you're the one setting the money on fire." → inbox state → DNS record table with copy button → "I've added it — verify" → "This burn is officially yours."); honest expired/invalid/already-claimed states. Company pages link "Is this your burn? Claim it. →" under the badge shelf. Company API now exposes safe public `claimed: boolean`.
- Builds green independently; `npm test` 100/100 pass (12 new claim tests); live smoke test verified 500/302/400 paths.
- Anti-slop: hairline dividers, mono step markers, ember rationed to CTAs/errors/record value, §3.8 voice.

### Next
- Task 8: Lemon Squeezy integration (Verified Burner $9, spotlight $5, themes $4). Awaiting Joshua's go-ahead. NOTE: LS seller application still in review (submitted Sep 20 ~01:45 PKT) — Task 8 can build the integration + webhook handling against test mode, but live payments wait on approval.
- Task 1 remainder (human step): burn-rate.lol purchase, planned Sep 21.

## Chat A — Task 4 complete: SSRF-safe fetch + scoring engine v1 — 2026-09-20 ~03:00 PKT

**Files added/changed** (all under `packages/api/`):
- `src/lib/fetch.ts` — SSRF-hardened fetcher: scheme/credential validation, ALL resolved IPs must be public (IPv4/IPv6 incl. v4-mapped), connection pinned to validated IP via custom `lookup` (no DNS rebinding), manual redirects ≤3 with per-hop re-validation, 8s timeout (race-based), 2MB cap, HTML-only content types, dependency-free text/link/image extraction.
- `src/lib/score.ts` — Vapor Score v1: six metrics, documented weights summing to 100, ~90-phrase buzzword lexicon, tier function, verdict builder quoting the page's own phrases (never names), sha256 `snapshot_hash`, `algo_version: "v1"`.
- `src/routes/vapor.ts` — `POST /api/vapor/scan` live (400/403/502 error mapping). No DB writes (no service_role in this env; persistence at deploy).
- `src/test/score.test.ts` + `src/test/fetch.test.ts` — 59 unit tests (metrics, SSRF rejections incl. `[::1]` and redirect-to-private-IP, edge cases).
- `src/test/fixtures20.test.ts` — 5 tests over 20 real-page fixtures.
- `src/test/fixtures/*.json` — 20 fixtures `{domain, url, html}`, captured 2026-09-20 via curl (real HTML, not synthetic), sanitized (scripts/styles/svg/comments stripped, `<head>` reduced to `<title>`, body truncated head+tail ~60KB). Total ~1.1MB.
- `package.json` — `copy:fixtures` now copies `*.json` too.

**Test results:** `npm test` → **105/105 pass, 0 fail** (`tsc` clean). Breakdown: 59 VaporRank unit + 5 fixture-suite + 41 BurnRate (parallel Chat B lane, untouched by this task).

**20-site score table** (fixed date 2026-09-20, fixtures as captured):

| domain | score | tier |
|---|---|---|
| character.ai | 53 | SUS |
| copy.ai | 30 | MOSTLY HARMLESS |
| vercel.com | 30 | MOSTLY HARMLESS |
| synthesia.io | 29 | MOSTLY HARMLESS |
| elevenlabs.io | 28 | MOSTLY HARMLESS |
| mistral.ai | 21 | MOSTLY HARMLESS |
| runwayml.com | 21 | MOSTLY HARMLESS |
| openai.com | 20 | CERTIFIED REAL |
| huggingface.co | 19 | CERTIFIED REAL |
| jasper.ai | 15 | CERTIFIED REAL |
| stripe.com | 14 | CERTIFIED REAL |
| github.com | 12 | CERTIFIED REAL |
| supabase.com | 12 | CERTIFIED REAL |
| x.ai | 12 | CERTIFIED REAL |
| linear.app | 11 | CERTIFIED REAL |
| replit.com | 11 | CERTIFIED REAL |
| anthropic.com | 10 | CERTIFIED REAL |
| notion.so | 10 | CERTIFIED REAL |
| apple.com | 8 | CERTIFIED REAL |
| deepseek.com | 0 | CERTIFIED REAL |

Tiers hit: 3/5 (CERTIFIED REAL, MOSTLY HARMLESS, SUS). PURE UNCUT VAPOR is covered by the synthetic high-vapor unit test (scores 81); no established real page *should* reach 61+ — that's the top of the scale for truly vaporous pages.

**Calibration decisions** (all in documented constants, weights still sum to 100):
1. First probe: 19/20 pages scored 0–20 CERTIFIED REAL. Root cause was NOT just fixtures — full raw pages scored the same. The engine was spec-correct but product-broken: every metric's "escape hatch" fired on every real page.
2. Buzzword lexicon expanded with 2025–26 era hype vocabulary (`agentic`, `on autopilot`, `effortlessly`, `say goodbye to`, `unfair advantage`, `skyrocket`, `lightning-fast`, `enterprise-grade`, `no-code`, `like magic`, `redefine`, `reinvent`…). The 2021 lexicon ("synergy", "paradigm") misses how AI pages actually hype now — verified by word-frequency analysis of writesonic.com/jasper.ai.
3. `BUZZWORD_SLOPE` 12 → 20 (old slope tuned on a synthetic fixture; real hype pages sit at 1–2.5 hits/100 words).
4. `PROOF_DISCOUNT` 0.75 → 0.5, `EVIDENCE_FULL_AT` 6 → 8: a docs link mitigates grand claims, it doesn't erase them.
5. `isConcreteSentence`: headline-style guard — if >50% of non-first words are capitalized, it's Title Case marketing, not proper nouns. (Previously "Create Stunning Videos With Our Platform" counted as concrete.)
6. Logo wall rewritten per spec ("logo walls **without links**"): old `links.length < 15` condition was dead code on real pages (100+ nav links); now strips `<a>`-wrapped content and counts *unwrapped* logo images ≥ 4. Site's own logo excluded via hostname label (stripe.com's brand-imagery alts like "imitating the Stripe logo" were false-positive logo walls).
7. Removed bare `"powering"` from trust phrases: "Powering businesses of all sizes" is a product statement, not an endorsement claim (was giving stripe.com +45 social-proof sketch).
8. Verdict copy: fixed stray ", —" when a tier had buzzword quotes but zero claim sentences.

**Judgment calls / known limitations:**
- Fixtures are truncated (~60KB head+tail), which skews slightly vapor-heavy vs full pages (drops mid-page concrete content). Documented in the test file; acceptable for test data.
- character.ai (53 SUS) is a login wall — the scorer can't see the product, mid score is honest. deepseek.com (0) is a JS shell with 73 visible words — unscannable pages scoring low is a known edge case, not gamed.
- perplexity.ai returned 403 → substituted deepseek.com. openai.com apex refused connections → captured from www.openai.com.
- Explored but rejected: further lexicon chasing ("visibility"/"citations" GEO-hype) — moving target, would overfit fixtures.

### Anti-slop self-review (Chat A, Task 4)
- No magic numbers: every constant (slopes, discounts, point values, thresholds) has a doc comment with calibration rationale. ✅
- Weights sum to 100 (asserted in tests). Tiers match §2.4 exactly (asserted). ✅
- SSRF coverage is honest: blocks 127.0.0.1, ::1, 10/8, 169.254.169.254, redirects to private IPs; DNS-rebinding pinned via custom lookup. Two real bugs caught by tests during the build (hung-upstream timeout, `[::1]` parsing). ✅
- Verdicts quote the page's own words, never names (asserted in tests). ✅
- No silent failures: fetch errors map to 400/403/502 with reasons; empty/non-English/huge pages handled in tests. ✅

## Chat A — VaporRank Task 5: scan result page — 2026-09-20 ~02:50 PKT

**Done:**
- Routing: `react-router-dom` added (only new dependency). `/` landing, `/scan?url=…` result page, deadpan 404 ("This page doesn't exist. Unlike most startups, we'll admit it."). `ScrollManager` handles hash scrolling for the Leaderboard nav link + scroll-to-top on page change. `public/_redirects` added so client routes survive refresh on Cloudflare Pages.
- `src/lib/api.ts`: typed client for `POST /api/vapor/scan`; types mirror `packages/api/src/lib/score.ts` key-for-key; `ScanApiError` carries HTTP status + API error code.
- `src/pages/ScanPage.tsx`: the lab report. Report header row ("Lab report · Vapor analysis" + "Sniff another" exit), staged reveal — score counts up with the existing `useCountUp` hook, THEN the tier stamp slams in at 1350ms via the existing stamp animation — then "Official finding" (the engine's verdict, which quotes the page's own words), six signal-breakdown bars with §2.4 weights, and a quiet chain-of-custody meta line (domain, timestamp, algo version, truncated snapshot hash). Loading cycles the §2.8 lines ("Sniffing…", "Counting buzzwords…", "Checking if the demo exists…") with the pulsing hazard square, no SaaS spinner. Errors in deadpan lab voice, each with retry: "The specimen was mislabeled." (400), "The specimen refused collection." (403 SSRF), "The specimen could not be collected." (502), "The lab is unreachable." (network). Never a stack trace.
- `ScanBox`: the Task 3 mock scoring path is deleted — the hero CTA now navigates to `/scan?url=…` and drives the real engine. Bare domains default to `https://`. Leaderboard "sniff again" seeding behavior preserved.
- Reduced motion: `useCountUp` now jumps straight to the target and the stamp lands immediately (previously it would have waited 1350ms for a count-up that finishes instantly).
- `npm run build` green (`tsc` + vite).

**Smoke test (honest):** API started locally; curl confirmed `400 invalid_url` ("Malformed URL") and `403 ssrf_blocked` ("Refusing to fetch non-public IP 127.0.0.1") — both map to the frontend's deadpan error states. A live 200 scan was impossible from this sandbox: its DNS sinkholes every public hostname to 198.18.100.32, so the SSRF guard (correctly) refuses all fetches. Instead: ran `scorePage` over a Task 4 fixture via tsx and confirmed the response shape (`vapor_score, tier, metrics×6, verdict, algo_version, snapshot_hash[64], url, scanned_at`) matches the frontend types exactly; confirmed "Lab report" and "api/vapor/scan" strings in the production bundle; code-reviewed the render path (hook order before the early return, StrictMode double-effect guarded by the attempt ref, stamp sequencing resets on retry, URLs rendered as text only — no innerHTML injection). No in-browser render test was possible from this environment; eyeball `/scan` in a real browser before Task 6.

**Judgment calls:**
- Score numeral in JetBrains Mono (`font-data`), not Space Grotesk: the shipped leaderboard and the Task-3 inline result both render scores in mono — consistency with the reviewed, user-loved product won over the task brief's wording. Flagging for override.
- Metric bars in ink (as Task 3); hazard reserved for the score, the stamp, CTAs, and the sniff dot.
- Verdict section labeled "Official finding" in display type — gives the engine's copy the weight of a certified result.

### Anti-slop self-review (Chat A, Task 5)
- Lab report, not a dashboard: hairline rules + whitespace do the layout; no cards-in-grid, no icon decorations, no gradient progress rings, no confetti. ✅
- One accent, deliberate: hazard appears only on the score, the stamp, CTAs, and the sniffing dot. ✅
- Mono data type for numbers/hashes/timestamps; Space Grotesk for headlines and the finding. ✅
- Deadpan voice carried through loading, errors, the 404, and the meta line. ✅
- No banned patterns (§0.4): no gradients, no glassmorphism, no emoji icons, no pill-badge hero. ✅
- Reduced-motion path reviewed: choreography removed, content immediate, stamp still stamps (statically). ✅

## Chat A — VaporRank Task 6: full sortable leaderboard ("Hall of Vapor") — 2026-09-20 ~12:20 PKT

The fictional mock board is dead. Every number on the site is now a real engine score of a real public landing page.

**Backend** (`packages/api` — VaporRank files only):
- `src/lib/seed.ts` (new): loads the 20 Task-4 fixture pages, scores each once with the v1 engine at boot, serves `LeaderboardEntry[]` = `{domain, vapor_score, tier, metrics, scanned_at, algo_version, delta}`. `delta` is `null` on all seed entries (single snapshots, no history). Documented deploy-time seam: when Supabase persistence lands, replace `loadSeed()`'s fixture read with a query returning the same shape — router and frontend untouched. No DB writes here (no service_role key in this environment).
- `GET /api/vapor/leaderboard?sort=vapor|real|improved` (was 501): `vapor` = highest first, `real` = lowest first, `improved` = stable alphabetical with `delta: null` everywhere (honest — no invented ranking); 400 `invalid_sort` on anything else; defaults to `vapor`.
- Tests: `src/test/leaderboard.test.ts` — 9 new tests (seed shape ×20, sort correctness incl. tiebreaks, improved stable+null, endpoint default/real/improved/400 cases via ephemeral Express). **114/114 green** (`npm test`: tsc clean + node --test).
- curl smoke: 200 on vapor/real/improved (count 20, algo v1; top = character.ai 53 SUS; bottom = deepseek.com 0); 400 `invalid_sort` on `?sort=bogus`.

**Frontend** (`apps/vapor`):
- `src/pages/LeaderboardPage.tsx` (new): `/leaderboard` — "Hall of Vapor". Eyebrow + display H1 + deadpan subline ("Twenty specimens sniffed. Ranked by vapor, highest first. No appeals — only re-scans."). Three sort tabs (Most vapor / Least vapor / Most improved) as hairline-underline tabs. Full-width hairline rows: rank in display font, domain, score bar, mono hazard score, mini tier stamp, hover lifts 1px and reveals "sniff again" → whole row links to `/scan?url=<domain>`. Staggered row-in on tab switch (list keyed by sort). Loading ("Consulting the lab ledger…") and deadpan error + retry states.
- Most-improved: data-driven empty state — when every `delta` is null: "No redemption arcs yet." / "Nobody has fixed their landing page and re-scanned. The comeback board is empty — for now." If deltas ever populate (Tasks 8–9), rows render with a Δ column instead.
- Landing preview rewired: fetches top 10 from the real endpoint; "Demo board — every startup above is fictional" footnote deleted; "Full board →" link added; score now hazard per §2.7.
- Ticker feeds the real top-10 (`domain — score% TIER`); fabricated "2m ago" timestamps removed — a missing timestamp beats a made-up one.
- Footer: big sign-off kept verbatim; sub-line rewritten (the old "every startup is fictional" is now false): "Every score computed from a public landing page by VaporRank v1. Re-scan anytime — redemption arcs are public."
- `lib/mock.ts` deleted (MOCK_STARTUPS + mockScan gone); `SNIFF_PHASES` moved to `lib/sniff-phases.ts`, ScanPage import updated. Stale "falls back to local mock data" comment in supabase.ts corrected.
- Header "Leaderboard" nav now points to `/leaderboard` instead of `/#hall-of-vapor`.
- `npm run build` green (tsc + vite). Bundle verified to contain the new route strings ("No redemption arcs yet", "/api/vapor/leaderboard", new footer copy).

**Smoke test (honest):** no live-browser eyeball possible from this sandbox (same DNS-sinkhole limitation as Task 5 — localhost unreachable from the leased browser, and the API refuses all outbound fetches here). Compensated: curl-verified the endpoint contract end to end, confirmed the frontend's request path and response-shape handling by code review plus bundle-string verification, and reviewed the render path (effect cleanup on unmount/tab switch, keyed list re-triggers stagger, reduced-motion inherits the existing row-in/stamp behavior). **Eyeball `/leaderboard` in a real browser before launch.**

**Judgment calls:**
- Scores in hazard on both board and preview (§2.7 lists scores as a hazard use; the Task-2/3 anti-slop fix was about stat numerals, not scores — Task 5's scan page already ships hazard scores, so this keeps the product consistent).
- Preview shows the tier label as the row's sub-line where the fictional "name" used to be — real companies get no invented names, the domain is the identifier (§2.9: one listing per domain).
- Ticker drops timestamps entirely rather than showing 20× "just now" — truthful minimalism.
- `improved` returns data (not 204/empty) so the frontend can decide the empty state from `delta` — future-proof for when re-scans exist.

### Anti-slop self-review (Chat A, Task 6)
- Lab ledger, not a dashboard: full-width hairline rows, whitespace, one accent. No cards, no gradients, no chrome. ✅
- Hazard rationed: scores, stamps, active tab underline, CTAs. Ranks and meta in ink/faint. ✅
- Deadpan voice in tabs, empty state, errors, footer — no corporate filler. ✅
- Real data from first paint (or an honest loading line); no fictional startups anywhere on the page. ✅
- Satire guardrail: scores roast pages via metrics; no founder names, no personal data. ✅
- Reduced motion: inherits existing `.row-in`/stamp CSS (already gated in index.css); content identical without animation. ✅

## Task 7 — Startup profile pages + OG share cards (Chat A) — 2026-09-20

**Backend** (`packages/api`, VaporRank files only — no BurnRate files touched):
- `src/lib/seed.ts`: `loadSeed()` refactored to keep full `ScanResult`s; new `getSeedResults()` export backs profiles/OG (leaderboard shape unchanged — 114 pre-existing tests still green).
- `src/lib/profile.ts` (new): `normalizeSlug()` (lowercase, strip www./trailing dot, require a dot, reject garbage → router maps to 400 `invalid_slug`), `displayName()` (curated map for the 20 seed specimens — "OpenAI" not "Openai" — with graceful fallback), `getProfile()` → `{slug, domain, name, current: {vapor_score, tier, metrics, verdict, algo_version, scanned_at, snapshot_hash}, history: [single v1 chapter]}`. §2.9 dedupe on normalized domain.
- `src/lib/vapor-card.ts` (new): Inspection Lab OG card (1200×630) — paper bg, hairline border, giant mono hazard score, rotated tier stamp (hazard for SUS+, ink for clean tiers), one deadpan verdict line, footer `vaporrank.lol/s/<slug>` + "no startups were harmed." Hand-built SVG → `@resvg/resvg-js` (already a dependency — shared with the BurnRate lane, no duplicate). Bundled TTFs via the existing `copy:fonts` step. In-memory FIFO cache keyed by slug + snapshot hash (future-proof for re-scans); pure helpers unit-tested (escapeXml, fitFontSize, clampText, stampColor).
- `GET /api/vapor/startup/:slug` — 200 dossier / 400 `invalid_slug` / 404 `startup_not_found`.
- `GET /api/vapor/og/:slug.png` — 200 `image/png` (verified 1200×630, PNG magic bytes), ETag/304, `Cache-Control: public, max-age=86400`, 404 JSON on unknown slugs. **Deliberate header:** `Cross-Origin-Resource-Policy: cross-origin` — share cards are meant to be hotlinked (social crawlers, chat embeds, in-app preview); Helmet's default `same-origin` CORP would block the frontend `<img>` preview. Public non-sensitive PNG, so the opt-out is safe. (Note for the BurnRate lane: its report-card route doesn't set this — same latent issue may apply there; not my lane, not touched.)
- **Tests: 133/133 pass** (19 new in `src/test/profile.test.ts`: slug normalization, all-20 profile resolution + shape, route contracts incl. ETag/304, PNG magic bytes, SVG escaping, cache behavior). `tsc` clean.
- Bug caught by visual inspection: the verdict line overflowed the hairline on long verdicts (fitFontSize's min-size floor couldn't shrink a 150-char verdict enough). Fixed: hard clamp to 110 chars + min size 14. Re-rendered cards verified by eye (character.ai SUS/hazard stamp, stripe.com CERTIFIED REAL/ink stamp).

**Frontend** (`apps/vapor`):
- `/s/:slug` — `src/pages/StartupProfilePage.tsx`: dossier kicker, domain huge in display font, count-up mono hazard score + stamp-in, "Official finding" verdict, six signal bars (`MetricBars.tsx`), **score-history timeline** ("Chapter 1 · algo v1" + "Every redemption arc starts with a single sniff — re-scans append new chapters here, in public"), chain-of-custody meta, "Sniff again →" link.
- **Exhibit A share block**: live `<img>` preview of the OG endpoint + Copy link (clipboard w/ feedback) + Download PNG (blob fetch → real download, falls back to opening the image) + Share on X (intent URL, prefilled: `"{domain} scored {score}% vapor on VaporRank. Verdict: {tier}."` — roasts the page via numbers, never people).
- `src/lib/meta.ts` (new): per-page title/description/OG tags, set on dossier load, reset to site defaults on unmount.
- Wire-up: leaderboard rows now link to `/s/:slug` (row restructured — profile link covers rank/domain/score/stamp, separate "sniff again" link keeps the hover affordance, no nested anchors); `/scan` result page gains "Full dossier →" after a successful scan (unknown slugs land on the deadpan "No dossier on file" 404 state — honest, no dead ends).
- `npm run build` green (tsc + vite).

**Smoke test (honest):** curl-verified all endpoints (profile 200/400/404, OG 200 PNG + ETag/304 + 404) against a local API; visually inspected two rendered cards. No live-browser eyeball possible from this sandbox (DNS-sinkhole limitation, same as Tasks 5–6). Compensated with endpoint-contract verification, bundle build, and render-path review (effect cleanup, keyed stamp re-animation, no nested interactive elements). **Eyeball `/s/character.ai` in a real browser before launch.**

**HONEST LIMITATION — per-profile OG meta tags:** the frontend is a client-rendered SPA, so link-preview crawlers (X, iMessage, Discord) that don't execute JS will NOT see the per-profile `og:image`/`og:title` tags the profile page sets — they'll see index.html's site-wide tags instead. The PNG endpoint itself is fully crawler-ready (absolute URL, correct content-type, cache headers). Fix path at deploy time: prerender `/s/:slug` pages or inject the tags at the edge (Cloudflare Pages). Not pretending it works end-to-end today.

**Judgment calls:**
- Stamp color on card: hazard for SUS and worse, ink for CERTIFIED REAL/MOSTLY HARMLESS — a hazard "CERTIFIED REAL" stamp would read as alarming.
- Share text keeps the lab voice but stays factual; no founder names anywhere, including share text (satire guardrail §2.12).
- `MetricBars` extracted as a component for the profile page; ScanPage left untouched (zero regression risk on reviewed code).
- Download uses blob-fetch rather than relying on the `download` attribute (ignored cross-origin).

### Anti-slop self-review (Chat A, Task 7)
- Lab file, not a dashboard: hairline sections, whitespace, one accent. No cards-in-grid, no gradients, no chrome. ✅
- Hazard rationed: scores, stamps, CTAs, active states. Metric bars stay ink. ✅
- Deadpan voice in headers, 404/empty states, errors, share block — no corporate filler. ✅
- Real data only: every profile field comes from the v1 engine; history shows exactly one true chapter. ✅
- Satire guardrail: verdicts/shares roast pages via metrics; no founder names, no personal data. ✅
- Reduced motion: inherits existing count-up/stamp gating; content identical without animation. ✅

## Task 8 — claim flow (DNS TXT verification) ✅ *done 2026-09-20*

**Backend** (`packages/api`, VaporRank files only — BurnRate's `lib/claim.ts`/`claim.test.ts` untouched; new files named `vapor-claim*` to avoid collision):
- `src/lib/vapor-claim.ts` (new): `createClaim()` (48-hex token via `crypto.randomBytes(24)`, 7-day TTL, idempotent re-issue returns the SAME token so a published record stays valid), `verifyClaim()` with injectable `dns.resolveTxt` lookup (exact match on joined TXT chunks, timing-safe compare, ENOTFOUND/ENODATA → `token_not_found`, other DNS failures → `dns_error`, expired → `expired`, verified → idempotent `{verified:true}`), in-memory Map keyed by normalized domain (documented deploy seam: Supabase `claims` table from 001_foundation.sql; no DB writes here, no service_role key).
- Canonical TXT location (ONE place): host `_vaporrank.<domain>`, value `vaporrank-verification=<token>`. `<meta>` tag alternative from §2.9 is a documented future, not this task.
- Claim-scope decision (§2.9): **seed/board-listed domains only** — `POST /claim` 404s `startup_not_found` for unlisted domains. Claims gate re-scans and audits; with no auth in the MVP, the claimable surface is the listed set. One listing per domain. No `user_id` binding yet — claims are keyed by domain; `user_id` arrives with auth later.
- Routes: `POST /api/vapor/claim` → 200 `{domain, token, txt_host, txt_value, expires_at, instructions[4]}` / 400 `invalid_domain` / 404 `startup_not_found`; `POST /api/vapor/claim/verify` → always 200 `{verified, domain, claimed_at?|reason?}` — client sends ONLY the domain, the expected token is never revealed; 400/404 for bad input.
- Tests: 20 new in `src/test/vapor-claim.test.ts` (DNS fully mocked): token format/expiry, normalization, invalid/unlisted rejection, idempotent re-issue, verify success + chunked records, wrong value → `token_not_found`, substring smuggling rejected, ENOTFOUND/ENODATA → `token_not_found`, ETIMEOUT → `dns_error`, expired rejected, no-pending-claim, post-expiry rotation, endpoint contracts incl. no token leak in verify response. **Full suite: 153/153 pass** (tsc clean).

**Frontend** (`apps/vapor`):
- `/verify` ("Claim the specimen") — `src/pages/VerifyPage.tsx`: Step 1 name-the-specimen (prefills `?domain=`), Step 2 publish-the-record (host/value mono blocks with copy buttons + 4-step lab procedure), Step 3 the inspection ("Check verification" with honest propagation copy — "DNS propagates on its own schedule, not ours — the token stays valid for 7 days"), verified state ("Listing claimed. The specimen is yours."), deadpan failure states per reason with retry.
- StartupProfilePage gains "Claim this listing →" next to "Sniff again →" → `/verify?domain=<domain>`.
- `vite build` green (tsc + 1698 modules).

**Smoke tests:** curl `POST /claim` (200, correct host/value/expiry), invalid → 400, unlisted → 404, `POST /claim/verify` → 200 `{verified:false, reason:"dns_error"}` — the sandbox sinkholes DNS so a live true-path wasn't possible here; the unit tests cover it via injected lookup. Honest limitation recorded.

**Caveat (recorded):** no live-browser eyeball possible from this sandbox (DNS sinkhole) — eyeball `/verify` in a real browser before launch, incl. the copy buttons.

### Anti-slop self-review (Chat A, Task 8)
- Lab file, not a dashboard: custody-office framing, hairline sections, one accent. No cards-in-grid, no gradients. ✅
- Deadpan voice in headers, steps, errors, success ("Custody granted") — no corporate filler. ✅
- Hazard rationed: CTAs, active states, "expired/rejected" labels only. ✅
- Security honest: timing-safe token compare, exact TXT match (no substring), expected token never in verify response, invalid-domain/normalization reuses `normalizeSlug`. ✅
- Satire guardrail: copy roasts the process, never people; no founder names anywhere. ✅

**Next:** Task 9 (Lemon Squeezy products + checkout + webhook). NOTE: LS seller application submitted Sep 20 ~01:45 PKT, still in review — Task 9 can build integration + webhook verification against test mode, but live payments wait on approval. Task 1 remainder (human): `vaporrank.lol` purchase still pending; Joshua planned `burn-rate.lol` purchase Sep 21.

### Hotfix — pinned DNS lookup vs Node Happy Eyeballs (Sep 20, ~13:40 PKT)
- **Symptom (found on Joshua's machine, first real-network run):** `POST /api/vapor/scan` for any live domain failed with `fetch_failed: "Request error: Invalid IP address: undefined"`. The sandbox never caught it: tests use the stub transport, and sandbox DNS is sinkholed before the transport runs.
- **Root cause:** Node ≥20 resolves via Happy Eyeballs (`lookupAndConnectMultiple`) and calls custom `lookup` functions with `{ all: true }`, expecting an ARRAY of `{ address, family }`. Our pinned lookup answered with a bare string; Node iterated the string's characters, destructured `.address` → `undefined`, and threw `ERR_INVALID_IP_ADDRESS(undefined)`. Reproduced exactly in isolation before fixing.
- **Fix (`packages/api/src/lib/fetch.ts`):** new exported `createPinnedLookup(ep)` honors both shapes (array for `{ all: true }`, single otherwise); `rawGet` also sets `family: ep.family` on the request so Node takes the single-lookup path for an already-pinned IP. DNS-pinning guarantee unchanged — the socket still only ever dials the validated IP.
- **Tests:** +3 in `src/test/fetch.test.ts` (lookup shape unit tests + a real-transport integration test against a local server through the actual `rawGet`). Verified the array-shape test FAILS on the old code. Full suite: **156/156 green**. Transport also verified end-to-end against a real external host (301, no error).
- **Open:** Joshua's `/api/vapor/leaderboard` returned `count: 0` on his machine — fixtures ARE in the zip, so his API terminal should show `[leaderboard] fixture dir missing` if extraction dropped them; awaiting his check.

### QA polish batch — Joshua's 7-item feedback (Sep 20, ~15:45 PKT)

All implemented in `apps/vapor` only. No fixtures/scores changed, no API changes, no new ranking data — every number on screen still comes from the v1 engine or the 20-site fixture suite.

1. **Pointer cursors** (`src/index.css`): global rule — `button, a, [role="button"], [role="tab"], [role="link"], summary, label[for], input[type=submit|button]` all get `cursor: pointer`; disabled gets `not-allowed`. Tailwind v4 doesn't default this.
2. **Bolder stamps** (`src/index.css` `.stamp`): thicker borders (4px / 3px sm), stronger rotation (−10°), paper backdrop so the stamp reads on any surface, plus a hard drop shadow (2–3px ink offset) like a real ink thud. The `stamp-in` keyframe updated to settle at the new rotation. Single shared component change — landing preview, both boards, profiles, scan results all inherit it.
3. **Richer navbar** (`src/App.tsx` `Header()`): logo left; links — Rankings (`/leaderboard`), Sniff a site (`/`), Verify (`/verify`), How it works (`/leaderboard#how-it-works`); hazard "Sniff" CTA button; secondary scrollable nav row on narrow screens. Kept the Inspection Lab language — not outbid's pastel.
   - Category pills on `/leaderboard` filter the board live: All · AI Agents · Dev Tools · Marketing · Productivity · Other, each with a real count. Categories come from a frontend-only label map (`src/lib/categories.ts`) covering all 20 fixture domains — 10 AI Agents, 6 Dev Tools, 1 Marketing (jasper.ai), 1 Productivity (notion.so), 2 Other (apple.com, stripe.com). Labels only; no scores invented.
4. **Judging criteria** (`src/components/JudgingCriteria.tsx`, rendered under the `/leaderboard` table): "How the lab judges" — the REAL six metric names and weights from `packages/api/src/lib/score.ts` (Buzzword density 25 · Claim-to-proof 25 · Vague-verb index 15 · Social-proof sketchiness 15 · Pricing opacity 10 · Freshness 10), each with a plain-language description paraphrased from the engine's own comments (including real constants like the +45/+30/+30 sketch points and the pricing-opacity ladder), plus the five verdict tiers with real thresholds from `tierFor()` (0–20 / 21–40 / 41–60 / 61–80 / 81–100). Nothing invented.
5. **"What is this" explainer** (`src/App.tsx` landing, right after the hero): one deadpan band — "A satire lab for startup marketing. We sniff a company's public landing page, score its marketing vapor 0–100, and roast the copy — never the people behind it."
6. **Live specimen pane** (`src/components/LiveSpecimen.tsx`, in `StartupProfilePage`): sandboxed iframe (`sandbox="allow-scripts allow-same-origin"`, `loading="lazy"`, title attr) of the site's real landing page — dossier left, preview right on desktop, stacked on mobile. Graceful fallback: 10s watchdog — if the frame hasn't loaded (X-Frame-Options etc. never fire a reliable error), it says "This specimen refuses to be framed" with an "Open the live site" CTA; the header always carries an external link; a footer note says the lab judged a snapshot and the page may have changed.
7. **Logos** (`src/components/SiteLogo.tsx`): Google s2 favicon per domain (`sz=128`) client-side `<img>` with onError fallback to a hairline monogram tile with the domain's initial. In leaderboard rows, the landing Hall-of-Vapor preview, and profile headers (lg). No fake logos, no fake companies.

**Verification:** `tsc` clean, `vite build` green (1702 modules), API suite **156/156 pass**. No emojis anywhere in UI (Lucide only), reduced-motion rules untouched, hazard accent rationing preserved (anti-slop pass de-hazarded my eyebrow/weight labels back to ink).

**Deliberately NOT done:** no new sites ranked (scoring requires live network against the real engine); no scores or fixture data touched; no founder names anywhere (satire guardrail); OG/social previews still need the prerender/cloudflare-edge fix noted earlier.

### Task 9 — Lemon Squeezy products + checkout + webhook (Sep 20, ~16:05 PKT) — TEST MODE ONLY

Products come straight from master plan §2.6 (nothing invented): **Priority Re-scan $5** and **Certified Real Audit $29**. The "Featured spotlight" auction is deliberately deferred — an auction engine is its own task.

**Backend** (`packages/api`):
- `src/lib/billing.ts` (new): product catalog (`PRODUCTS`, rescan $5 / audit $29), `isBillingTestMode()` gate, `verifyWebhookSignature()` (hex HMAC-SHA256 of the RAW body vs `X-Signature`, timing-safe), `createLemonCheckout()` (POST `https://api.lemonsqueezy.com/v1/checkouts`, JSON:API shape, fetch-injectable for tests; never leaks the API key in errors), in-memory entitlement ledger keyed `email|product` (Supabase `billing.entitlements` is the documented deploy seam, same pattern as Task 8 claims), `grantCredits()` (idempotent on the LS order id — the idempotency key, §1.5), `consumeCredit()`, `creditsFor()`, and pure `applyBillingEvent()`: `order_created` → grant (email from `meta.custom_data` first, `user_email` fallback; product from custom_data only, never display names), `order_refunded` → claw back floored at 0, everything else ignored and honestly reported.
- `src/routes/billing.ts` (replaces the skeleton): `POST /checkout {product, email, startup_domain?}` → `{checkout_url}` (503 `billing_live_blocked` unless `LEMONSQUEEZY_TEST_MODE=true`; 503 `billing_not_configured` on missing keys; 502 `checkout_failed` on LS errors — no LS details leak to the client); `POST /webhook` (401 on bad/missing signature, 200 for handled AND ignored events so LS doesn't retry forever; logs event → action, never secrets); `GET /credits?email=…`; `POST /consume {email, product}` (402 `no_credits` when empty).
- `src/index.ts`: `express.json` now captures `req.rawBody` (HMAC needs raw bytes — parsed JSON can't be re-signed); billing router mounted at BOTH `/api/billing/*` (shared, plan §2.11) and `/api/vapor/billing/*` (product namespace). Stateless router, one shared ledger.
- `packages/api/.env.example`: `LEMONSQUEEZY_TEST_MODE=true`, `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `LEMONSQUEEZY_RESCAN_VARIANT_ID`, `LEMONSQUEEZY_AUDIT_VARIANT_ID`.

**Frontend** (`apps/vapor`):
- `/pricing` ("The lab's gift shop", linked in the navbar): email field (persisted to `localStorage`), the two products as hairline rows (icon, name, mono price, tagline, credit label, hazard buy button), a loud rotated **TEST MODE · NO REAL CHARGE** badge, the integrity line ("Paid = re-scan + badge. Never erasure. Scores stay public forever."), and honest audit fulfillment copy ("reviewed by an actual human — allow 48 hours"). Buy → `POST /checkout` → redirect to the LS hosted checkout.
- `src/components/PriorityStrip.tsx`: on `/scan` — email → live credit balance → "Re-sniff with priority" spends one rescan credit, then re-runs; the report's chain-of-custody line gets a hazard "priority sniff" tag. Out of credits → "Get priority →" link to `/pricing`.
- Reduced-motion rule extended to `animate-spin`/`animate-pulse` (the buying spinner). Anti-slop pass: Lucide only, no emojis, tokens only, hazard rationed.

**Verification:** `tsc` clean both packages, `vite build` green (1704 modules), API suite **176/176 pass** (156 existing + 20 new in `src/test/billing.test.ts`: signature valid/tampered/body-swapped/missing/whitespace, checkout payload shape + URL return + error non-leak + missing-URL, ledger idempotency/stacking/consume-floor, webhook event matrix incl. refund clawback and duplicate retry). Live smoke test on a local server: no flag → 503 `billing_live_blocked`; signed `order_created` → granted (credits 1); replay → `duplicate` (still 1); tampered body → 401; consume → ok then 402. `tsc` clean, build green.

**Live-mode block (hard):** the server refuses ALL checkout creation unless `LEMONSQUEEZY_TEST_MODE=true` (503 `billing_live_blocked`, message says live is locked until the seller application is approved). Flipping to live requires: LS approval → set `LEMONSQUEEZY_TEST_MODE=false` + live API key + live variant IDs + live webhook endpoint/secret. Do NOT flip early.

**Deliberately NOT done:** no new zip built (per task instructions); the Certified Real audit's human fulfillment is manual — the credit is recorded, the review itself is an ops step (tracked for later); spotlight auction engine deferred; no `user_id` binding (MVP keys entitlements by email, like Task 8 keys claims by domain).

**Next:** Task 10 (rate limiting + Turnstile + security headers) — that's when priority queue-jump gets real teeth. Task 1 remainder (human): `vaporrank.lol` purchase still pending; LS seller application submitted Sep 20 ~01:45 PKT, still in review.

## Chat B — BurnRate Task 8: Lemon Squeezy integration — 2026-09-20 ~17:23 PKT

- **TEST MODE ONLY.** LS seller application still in review (submitted Sep 20 ~01:45 PKT). Checkout hard-503s unless `LEMONSQUEEZY_TEST_MODE=true`; live charges impossible by construction. Flip off only after LS approves.
- Schema: `supabase/003_burn_billing.sql` (001 untouched) — `burn.companies.report_card_theme` (default `'terminal'`), `ls_order_id` on `burn.badges` + `burn.spotlight_bids` for exact refund clawbacks.
- Products (§3.10): Verified Burner badge $9, report card themes $4 (terminal/bonfire/doom/copium/diamond_hands — themes restyle the Task 6 SVG), weekly spotlight auction $5 minimum bid. Env naming follows the repo's existing `LEMONSQUEEZY_*` convention; all 7 vars in `.env.example`.
- API: `POST /api/burn/billing/checkout` (validates company live + claimed for badge, theme purchasable, bid ≥ max($5, top+$1)); shared `POST /api/billing/webhook` verifies `X-Signature` HMAC-SHA256 over the raw body with `crypto.timingSafeEqual` (401 on mismatch, 503 unconfigured), then dispatches `burn_*` products to the burn handler. In-memory replay ledger → duplicate deliveries are no-ops (zero DB writes).
- Entitlements ONLY from verified webhooks: `order_created` upserts badge / sets theme / inserts bid + recomputes top bid; `order_refunded` deletes badge by `ls_order_id`, reverts theme to terminal, removes bid. Bids are final — outbid ≠ refund, stated at checkout.
- Spotlight: week = Monday 00:00 UTC, auction created on first paid bid, winner computed lazily via `GET /api/burn/spotlight` (no cron in v1). Real `GET /api/burn/spotlight` replaced the 501 stub; company endpoint returns `badges[]` + `theme`; report-card route gates `?theme=` against the purchased theme.
- Frontend: `/pricing` (three products, deadpan copy, TEST MODE banner), `/billing/success` ("Your money is now officially certified as burning.") + `/billing/cancel` ("No charge. The burn continues, uncertified."), company-page badge shelf (rotated ember VERIFIED BURNER rubber-stamp when badged, "Get verified — $9" CTA for claimed-but-unbadged, card-skins link in share section), landing-page "Fuel the furnace" strip.
- Verification: builds green independently; `npm test` 201/201 pass (~35 new); live server smoke test — tampered signature → 401, replay → duplicate/no-op; theme PNGs rendered end-to-end (doom, copium, diamond_hands); honest 503s for unconfigured/no-key/no-DB states. Security review: timing-safe HMAC, idempotent webhooks, test-mode hard block, zero emoji in new UI.

### Next
- Task 9: full `/spotlight` auction page + countdown, and/or `/board` page. Awaiting Joshua's go-ahead.
- Task 1 remainder (human step): burn-rate.lol purchase (Joshua said he'd buy it — now past the planned Sep 21, unverified).
- Deploy-time: set the 7 `LEMONSQUEEZY_*` vars + Resend/claim vars on Render; verify sender domain for magic-link emails.

## Chat A — Readability + responsive pass (Sep 20, ~18:15 PKT) — Joshua's feedback batch

One isolated task per Joshua's "one task at a time" rule: make the whole VaporRank frontend readable by a 5th grader and a 90-year-old, on any device. **Only `apps/vapor` touched.** No renames, no stamp/badge redesigns, no scoring/tier/weight/threshold/value changes — numbers, products, and prices are byte-identical.

**Type scale (new floor):** body 18px/1.6; body copy 16–18px; functional text (buttons, links, form labels, metadata) minimum 14px (`text-sm`); decorative eyebrow micro-labels 13px (`.eyebrow`); zero instances of `text-[10px]/[11px]/[12px]` or `text-xs` remain. All interactive targets ≥44px (`.tap-target`). Consolidated the two duplicate `body` rules in `index.css`.

**Copy rewritten in plain words** (landing, scan box/loading/errors, ticker "Latest tests", leaderboard, priority strip "Re-test", scan report "What we found"/"How we got this score"/"Test report", startup report, verify page, pricing page, judging-criteria rubric, meta defaults). Kept playful flavor only where instantly understandable ("We sniff startups so you don't have to."). Jargon removed: satire lab, signals→checks, specimen, dossier, chain of custody, exhibit, ledger, appealable, versioned, erasure, redemption arc, claw back, fulfillment, X-Frame-Options. No emojis; Lucide only; reduced-motion preserved.

**Files changed (all `apps/vapor/src`):** `index.css`, `App.tsx`, `components/ScanBox.tsx`, `components/Ticker.tsx`, `components/Leaderboard.tsx` (+ icon-only "test again" under 400px so domain names fit), `components/PriorityStrip.tsx`, `components/JudgingCriteria.tsx`, `components/MetricBars.tsx`, `components/LiveSpecimen.tsx`, `lib/api.ts` (product taglines — display copy only, names/prices/keys unchanged), `lib/meta.ts`, `lib/sniff-phases.ts`, `pages/ScanPage.tsx`, `pages/LeaderboardPage.tsx` (+ same icon-only fix), `pages/StartupProfilePage.tsx`, `pages/VerifyPage.tsx` (incl. `RecordLine` 14px+ and 44px copy button), `pages/PricingPage.tsx` (email label now block-level — was colliding with the input on desktop).

**Responsive audit — real Chromium screenshots at 360 / 768 / 1440px** for `/`, `/scan`, `/leaderboard`, `/s/character.ai`, `/verify`, `/pricing`, and 404. No page-level horizontal overflow at 360px (verified programmatically: `documentElement.scrollWidth == innerWidth` on all routes; only intentional internal scrollers — the nav and the ticker marquee). Nav scrolls horizontally on phones instead of overlapping; sort tabs scroll; test-again actions visible on touch (no hover-only); scan input/button stack on small phones. (Audit note: this sandbox's Chromium blocks all localhost navigations via Local Network Access checks, so screenshots were taken through a CDP Fetch-interception harness; also the API's CORS allowlist is `http://localhost:5173`, so the audit used the `localhost` origin.)

**Verification:** `npx tsc -b apps/vapor` clean; `vite build` green (1704 modules). API suite untouched and still green per Task 9 (176/176).

**Deliberately NOT done:** no product rename (queued as its own task); stamps/tiers/scores/weights/thresholds unchanged; billing behavior unchanged (products still Priority Re-scan $5 / Certified Real Audit $29, test-mode hard block intact); `claim.instructions` copy comes from the API — out of scope, left alone.

**Next (awaiting Joshua's review of this pass before anything else starts):** the rename task; Task 10 security hardening; Task 11 launch posts; Task 1 remainder (vaporrank.lol purchase).

## Chat A — Rename: VaporRank → SniffMySite (Sep 20, ~19:00 PKT) — one isolated task

Joshua's pick: **SniffMySite** (VaporRank "doesn't make sense, not memey enough"). Target domain **sniffmysite.lol** — availability still to be confirmed at purchase time (registrar check below). VaporRank→SniffMySite applied to **user-visible strings only**. Nothing scored, weighed, or priced changed; the readability pass's plain language was preserved (brand swap only, no copy rewrites).

**Frontend (`apps/vapor`):** `index.html` (`<title>` + meta description), `src/App.tsx` (navbar wordmark, `aria-label`, footer wordmark), `src/lib/meta.ts` (DEFAULT_TITLE/DEFAULT_DESCRIPTION — the tags social crawlers would see), `src/pages/StartupProfilePage.tsx` (page title, share text for X/copy-link, OG preview alt text). Left alone: localStorage key `vaporrank_email` (internal identifier — changing it would orphan stored emails), code comments.

**Backend (`packages/api`):**
- `lib/vapor-card.ts`: the brand mark drawn on the share-card PNG is now `SNIFFMYSITE` (was `VAPORRANK`).
- `lib/vapor-claim.ts`: the DNS verification protocol moved with the brand — `_vaporrank.<domain>` → `_sniffmysite.<domain>`, `vaporrank-verification=<token>` → `sniffmysite-verification=<token>`. This is safe because nothing is deployed and no claims exist in the wild; the instructions text shown to users updates automatically (it interpolates the constants). Constant *names* (`VAPOR_TXT_HOST`, `VAPOR_TXT_PREFIX`) unchanged.
- `routes/vapor.ts`: default canonical site URL `https://vaporrank.lol` → `https://sniffmysite.lol` (still overridable via `PUBLIC_SITE_URL`).
- `lib/fetch.ts`: crawler user-agent `VaporRankBot/1.0` → `SniffMySiteBot/1.0` (this string is what scanned sites see in their logs — it's our public identifier).

**Deliberate non-changes (documented decision):** API route paths (`/api/vapor/*`), the Lemon Squeezy test store subdomain, internal variable/function names, and code comments keep their old names — renaming them is churn with zero user benefit. "Vapor Score" as the *metric* name is also unchanged (it's the score's name, not the product's — "SniffMySite's Vapor Score" still reads fine). The master plan doc is untouched as a historical record.

**Tests:** `test/vapor-claim.test.ts` assertions updated to the new TXT host/prefix. API suite **220/220 pass** (was 176 at Task 9; suite has grown since). `npx tsc -b apps/vapor` clean; `vite build` green.

**Anti-slop:** brand swap only — no new copy, no new UI, no tokens touched; wordmark stays uppercase Space Grotesk, footer/aria labels consistent.

**.lol registrar check (web, Sep 20 — no purchase made):** .lol is an open gTLD sold by multiple registrars. Cheapest reputable option found: **Hostinger** (ICANN-accredited) — **$1.99 first year, renews at $39.99/yr**. Others: domains33 (~€34/yr), Nominate (~$56/yr), Asia/America Registry (~$78/yr). Could NOT verify whether `sniffmysite.lol` itself is taken — the sandbox DNS gives bogus answers, so Joshua should type it into Hostinger's domain search at purchase time; it'll say instantly. Note for deploy: Cloudflare Pages + Render both accept any registrar's domain; just point DNS at them.

## Chat A — Stamp/badge redesign (Sep 20, ~19:50 PKT) — one isolated task

Joshua's complaint: the tier stamps didn't pop and weren't memorable. The redesign makes them the loudest thing on the page while keeping the Inspection Lab aesthetic — evolved, not replaced. No scoring, tiers, thresholds, copy, or prices changed.

**What the new stamp looks like:**
- Chunkier frame: 5px outer border (6px on lg), 2px inner ring set deeper, hard offset ink shadow (3–4px) — a real "slam".
- Worn ink edges: a subtle SVG-turbulence grunge mask eats the borders slightly; letters stay clean and readable.
- Stronger rotation: −12° (was −10°); irregular border-radius so it never lands perfectly square.
- Bigger: lg 1.125rem → fluid `clamp(1.15rem, 6vw, 1.5rem)` (full slam on desktop, never overflows a 360px phone); sm 0.625rem (11.25px — below the readability floor) → 0.8rem (14.4px).
- New token `--color-hazard-ink: #c23a00`: same hue family as hazard, deepened for ~5:1 contrast on paper (vivid #ff4d00 only manages ~3:1). Scores/CTAs keep the vivid accent; stamps use the readable one.
- **PURE UNCUT VAPOR — and only that tier — now lands FILLED** (paper text on hazard-ink): the lab's loudest mark, reserved for the worst offenders. All other tiers stay outline style; tier names and color meanings unchanged.
- Stamp-in animation retuned to the new rotation (400ms thud); reduced-motion path untouched (animation killed, content immediate).
- The pricing page's `TestModeBadge` now reuses the shared `.stamp` class instead of its own one-off badge styles — one stamp language everywhere.

**Files changed:**
- `apps/vapor/src/index.css` — new token, full `.stamp` rewrite (+ `.stamp-solid`), fluid lg size, updated keyframes.
- `apps/vapor/src/components/Stamp.tsx` — applies `.stamp-solid` when label is PURE UNCUT VAPOR.
- `apps/vapor/src/components/Leaderboard.tsx`, `apps/vapor/src/pages/LeaderboardPage.tsx` — stamp containers widened w-36/w-40 → w-52 so the bigger sm stamps fit at md+.
- `apps/vapor/src/pages/PricingPage.tsx` — TestModeBadge uses `.stamp`.
- `packages/api/src/lib/vapor-card.ts` — OG card stamp redrawn to match: chunkier double frame (6px/2.5px), −10° rotation, bigger type (up to 46px), stampColor deepened to `#C23A00`, filled variant for PURE UNCUT VAPOR.
- `packages/api/src/test/profile.test.ts` — stampColor assertions updated to `#C23A00`; new test: max tier filled, others outline.

**Verification:** `npx tsc -b apps/vapor` clean; `vite build` green; API suite **221/221 pass**. Screenshot-verified in real Chromium (CDP): all stamp sizes/tones + solid variant; mock leaderboard rows at 768px (no overlap) and 380px (stamps hidden, no overflow); lg stamps at 360px (fluid size, `scrollWidth == innerWidth` — no horizontal scroll). Rendered the OG PNG for SUS / PURE UNCUT VAPOR / CERTIFIED REAL and eyeballed all three — card stamps match the web design. No emojis introduced (grep-verified); Lucide-only discipline kept.

**Deliberately NOT done:** no scoring/numbers changes; no copy rewrites beyond stamp-adjacent text; no rename work; no Task 10; no zip rebuild.

**Next (awaiting Joshua's go-ahead, one at a time):** simplify how scores/numbers are explained → Task 10 (rate limiting + Turnstile + security headers) → Task 11 (launch posts) → Task 1 remainder (sniffmysite.lol purchase).

## Chat A — Simplify how scores/numbers are explained (Sep 20, ~18:00 PKT) — one isolated task

Joshua's complaint: the algorithm's numbers and explanation felt complex and didn't make intuitive sense. This pass is presentation-only — weights (25/25/15/15/10/10), tiers, thresholds, and every computed value are untouched.

**The one mental model** (`apps/vapor/src/lib/score-explainer.ts`, new shared module):
- `SCORE_STORY` — the same short story on the landing page, scan page, profile page, and leaderboard: "0 smells fine, 100 is pure vapor. We read the startup's public page — never the product, never the people — and run six smell checks. Each check scores 0 to 100, the two biggest checks count the most, and they blend into one score."
- `CHECK_INFO` — plain check names ("Hype words", "Big claims vs. proof", "Empty sentences", "Sketchy testimonials", "Hidden prices", "Stale page") + weight notes in words ("Counts the most" / "Counts a fair bit" / "Counts a little") — never percentages-as-math.
- `findingFor(key, value)` — one human sentence per check from the actual metric value. Thresholds mirror the engine's real score shapes (`packages/api/src/lib/score.ts`): buzzword/claim/vague/social are 0–100 continuous (bands at 67/34); pricing keys off the real values (100/75/40/0); freshness keys off real values (80/50/25/0, with 30 = "no year found — unknown, not guilty, we went easy on it").

**Findings first, everywhere:** `MetricBars.tsx` rewritten — each check leads with the mini-verdict sentence, the bar + `value/100` sit below as backup. The scan page's old inline metric list was deleted in favor of the shared component (scan page and profile page now render the same block). "0 smells fine, 100 is pure vapor. Higher means more hot air." added under the giant score on both pages.

**JudgingCriteria** (leaderboard): intro uses the shared story; the six rubric cards now show plain names + word-weights (the old "+45 points / +30 points" detail text simplified to words); tier score levels unchanged.

**Landing page:** the "What is this" band now says "from 0 (smells fine) to 100 (pure vapor)"; the 0–100 stat strip uses the story language ("The two biggest checks count the most").

**Verification:** `npx tsc -b apps/vapor` clean; `vite build` green. Real-Chromium CDP checks at 360px: `/`, `/scan?url=…` (error state renders; done-state layout is the same verified components — live scans can't complete in the sandbox, API returns ssrf_blocked on the bogus DNS), `/s/character.ai`, `/leaderboard` — `scrollWidth == innerWidth` on all four, screenshots eyeballed (breakdown findings, rubric cards, landing bands all read clean). Readability floor preserved (no text below 14px added; no emojis; Lucide-only; no new fonts; no purple gradients).

**Deliberately NOT done:** no scoring/weight/tier/threshold changes; no badge changes; no unrelated copy changes; no rename work; no Task 10; no zip rebuild.

**Next (awaiting Joshua's go-ahead, one at a time):** Task 10 (rate limiting + Turnstile + security headers) → Task 11 (launch posts) → Task 1 remainder (sniffmysite.lol purchase).

## Chat B — BurnRate Task 9: `/spotlight` auction page + `/board` rankings — 2026-09-20 ~17:24 PKT

- **API** (`packages/api`): `src/lib/board.ts` — pure ranking logic (`sortBoard`/`compareBoard`); `src/test/board.test.ts` (19 tests); `src/routes/burn.ts` — real `GET /api/burn/board?sort=burn|runway|efficiency` replaced the 501 stub (live rows only, 50/page, safe-subset fields, no emails), and `GET /api/burn/spotlight` gained a latest-20 paid-bid ledger.
- **"Most efficient" definition (documented on the page):** lowest monthly burn per employee. Null/zero headcount → "headcount undisclosed", sorts last, never misranked. Pure comparators, deterministic tie-breaks, unknown runways never crowned "shortest".
- **Frontend** (`apps/burn`): `pages/SpotlightPage.tsx` (`/spotlight`) — live countdown to Monday 00:00 UTC (soft pulse under 1h, reduced-motion safe), current holder linked to `/c/:slug` with top bid + minimum next bid (max($5, top+$1)), "Outbid them" routes into the existing `/pricing?product=spotlight_bid` checkout, honest empty state ("No one's bought the spotlight. Bold. Or broke."); `pages/BoardPage.tsx` (`/board`) — three ranking tabs reusing the landing board grid pattern with per-tab headline/secondary stats, rows link to company pages, §3.4 promise honored (spotlight winner's name + price + "Outbid them →" at the top). Nav now Board / Spotlight / List your burn; landing page's "full board drops soon" copy links to the real `/board`.
- Verification: API `tsc` green, `npm test` **220/220 pass**; frontend `tsc` + `vite build` green; zero emoji in new UI (grep-verified); endpoints return honest `server_not_configured` without DB env.
- Deferred: `/manifesto` (still unbuilt), deployment config, LS live-mode changes, cron-based auction close (lazy winner stands).

**Next:** Task 10 (rate limiting + Turnstile + security headers) — server side already landed via Chat A's shared-API pass (rate limits on all burn write endpoints, Turnstile widget + verification, helmet, CORS allowlist); burn-lane leftovers are the CORP override on the report-card PNG route, Cloudflare Pages `_headers`, and a dependency audit. Task 1 remainder (human): burn-rate.lol purchase still unverified; LS seller application still in review — live payments stay blocked.

## Chat A — Task 10: rate limiting + Turnstile + security headers (Sep 20, ~20:00 PKT)

**Backend (`packages/api`):**
- `src/lib/security.ts` (new): shared `rateLimit(bucket, limit, windowMs)` Express middleware (429 JSON in plain language + `Retry-After`), `clientIp()` (honors `trust proxy`, strips `::ffff:`), and the limit constants. `src/lib/ratelimit.ts` gained a `_resetRateLimits()` test seam (additive only — the burn lane's existing limiter untouched).
- `POST /api/vapor/scan` — three gates, in order: (1) Cloudflare Turnstile via the shared `verifyTurnstile()` (403 `bot_check_failed` when the secret is set and the check fails; warn-and-pass in dev when unset); (2) **priority lane**: `priority_email` holding a Priority Re-scan credit skips the anonymous bucket (60/hr per buyer email) — the server consumes the credit *inside* the scan, so a rejected scan never eats one; empty balance → 402 `no_credits`; (3) anonymous scans capped at **10/hr per IP** (the strictest limit we run — every scan is an outbound fetch). Priority responses carry `priority: true`.
- `GET /api/vapor/leaderboard` → 300/hr/IP. `POST /api/vapor/claim` → 5/hr/IP. `POST /api/vapor/claim/verify` → 10/hr/IP.
- Shared billing router: `POST /billing/checkout` → 10/hr/IP; `POST /billing/webhook` → 120/hr/IP, applied *before* signature verification (per-IP, so it only throttles a flooding source, never Lemon Squeezy's own servers).
- `src/index.ts`: `app.set('trust proxy', 1)` — without it, Render's proxy IP would share one bucket for all users; the rate limiter depends on this. Helmet stays with explicit, documented defaults (CSP `default-src 'self'`, CORP `same-origin`, `X-Frame-Options: SAMEORIGIN`, nosniff, no-referrer, HSTS). The OG share-card PNG route keeps its per-response `Cross-Origin-Resource-Policy: cross-origin` override (route headers beat middleware) — hotlinking/crawler embeds unaffected, and the profile-page iframe preview loads external sites directly, so API frame headers can't break it.
- **Priority queue-jumping is now REAL** (was honorary): a Priority Re-scan credit buys a scan on its own 60/hr lane instead of the 10/hr free line.

**Frontend (`apps/vapor`):**
- `src/components/TurnstileWidget.tsx` (new): lazy-loads the Cloudflare widget only when `VITE_TURNSTILE_SITE_KEY` is set; hides gracefully if the script can't load (the server still decides). `ScanPage` shows the widget *before* a scan runs and auto-starts the scan on verify; tokens are single-use, so retry/re-test re-arms the gate. In dev (no key) the flow is unchanged from before.
- `PriorityStrip` no longer pre-spends via `/consume` — it hands the email to the scan and the server spends exactly one credit; the balance re-reads after every scan. Fixed a double-scan bug found in review (the gate effect refiring on the new email state would have spent two credits).
- `scanUrl()` takes `{ turnstileToken, priorityEmail }`; new plain-English error states: 429 "Slow down — the lab is busy.", 403 "The human check didn't pass.", 402 "No priority re-tests left."
- `.env.example` (both packages): Turnstile test keys documented (`1x00000000000000000000AA` site / `1x0000000000000000000000000000000AA` secret — always pass, dev only).

**Tests:** `src/test/security.test.ts` — 13 new (middleware unit, scan 429, priority bypass + credit spend + 402/400 paths, Turnstile enforced/mocked-fail, leaderboard/checkout/webhook 429s, helmet header set, PNG CORP override). Full API suite **242/242 pass** (221 pre-existing + 13 new vapor security tests + 8 burn-lane security tests merged in by Chat B's concurrent Task 10). `npx tsc -b apps/vapor` clean; `vite build` green.

**Coordination note:** the burn lane (Chat B) is implementing its own Task 10 against the same shared `packages/api` concurrently — `lib/security.ts` and `src/test/security.test.ts` are now shared files holding both lanes' tests/helpers (their `setShareCardHeaders` + burn gate tests were merged in after this entry's tests; both suites green together). Coordinate before renaming or moving shared helpers.

**Deploy-time (Joshua):** set `TURNSTILE_SECRET_KEY` on Render + `VITE_TURNSTILE_SITE_KEY` in the Cloudflare Pages build env (real keys from the Cloudflare dashboard — the test keys above are dev-only). No other new env vars. `trust proxy` assumes one proxy hop (Render default) — revisit if the API ever sits behind two.

## Chat A — Task 11: launch posts (build-in-public thread) (Sep 20, ~20:05 PKT) — DRAFTS ONLY, nothing posted

Last item on the master-plan MVP checklist (§2.13 item 11). **Nothing was posted to any account** — these are markdown drafts in `apps/vapor/launch/` for Joshua to review, edit in his own voice, and post himself when the site is live.

**`launch/launch-thread.md`** — an 8-post X-style thread: the hook ("a lab that sniffs AI startups"), the six smell checks, the 0–100 score, the rubber stamps, share cards, the integrity line ("nobody can pay to hide a bad score — paying only buys a re-test"), an honest status line, and the weekend-build note. Plus a one-post condensed Option B.

**`launch/build-in-public-recap.md`** — how the weekend went: the 11-task master plan, the one-task-at-a-time rule, the Inspection Lab design, the scoring engine tested against 20 real pages, the feedback rounds that mattered (VaporRank→SniffMySite rename, 5th-grade copy, bigger stamps, simpler numbers), and the AI-partner division of labor ("it types fast, I decide what's good").

**Honesty rules enforced:** the posts say it's a weekend experiment, not public yet, payments in test mode until Lemon Squeezy approves, domain not bought ("link drops when it's real"). No founder names, no real startups called out as vapor by name, roast copy only. Emojis minimal (two total across the package — the no-emoji rule applies to the UI, not social drafts).

**Deliberately NOT done:** no code changes; no zip rebuild; posts stay in the repo until Joshua posts them himself.

**Status: all 11 master-plan MVP tasks are done.** Remaining (all human/launch-infrastructure): buy sniffmysite.lol, deploy (Cloudflare Pages + Render), Lemon Squeezy seller approval for live payments, Turnstile real keys at deploy.

## Chat B — BurnRate Task 10: security leftovers — 2026-09-20 ~20:05 PKT (verified by Jarvis)

Server-side was already landed by Chat A's shared-API pass (rate limits on every burn write endpoint, Turnstile verify-when-configured, helmet, CORS allowlist, Turnstile widget in SubmitPage + ClaimPage). This task covered the burn-lane leftovers:

- **CORP hotlink fix (the flagged cross-lane issue — confirmed real):** `GET /api/burn/report-card/:slug.png` had no CORP override, so helmet's default `CORP: same-origin` would have blocked the card in the in-app preview, social crawlers, and chat embeds — same latent bug Chat A fixed for vapor OG cards. Fixed by extracting a shared `setShareCardHeaders(res, etag, maxAgeSeconds)` in `packages/api/src/lib/security.ts` (emits `Content-Type: image/png`, `Cache-Control: public, max-age={3600|86400}`, `Cross-Origin-Resource-Policy: cross-origin`, `ETag`) and pointing both `routes/burn.ts` and `routes/vapor.ts` at it — dedupe, behavior-identical for vapor.
- **Cloudflare Pages `_headers`** (`apps/burn/public/_headers`, ships to `dist/`): X-Frame-Options DENY, nosniff, strict Referrer-Policy, HSTS w/ preload, restrictive Permissions-Policy, COOP same-origin, and a CSP that allows the Turnstile challenge CDN (`script-src`) and challenge iframe (`frame-src`), `style-src-attr 'unsafe-inline'` for React's inline style attributes, `connect-src 'self'` with a documented deploy-time caveat (if `VITE_PUBLIC_API_BASE_URL` ever goes absolute cross-origin, append it).
- **Gate coverage gap found and closed:** no test file mounted `burnRouter` before — added 9 HTTP-level tests (honeypot → 201 fake success ×12, 429 after 10/hr submit / 5/hr claim / 10/hr verify-dns / 10/hr checkout, Turnstile 400 when secret configured) + 2 header unit tests.
- **Dependency audit:** blocked honestly — sandbox registry policy denies the audit POST to registry.npmjs.org. Deploy-time step documented: `npm audit --omit=dev` in both packages on a machine with registry access. Installed majors are current (express 4.22.3, helmet 8.3.0, react 19.3.0, router 7.18.4, resvg-js 2.6.2).

**Verification (Jarvis, independent):** API `npm test` **242/242 pass** (0 fail); `npx tsc --noEmit` clean; burn frontend `tsc` + `vite build` green; `dist/_headers` confirmed present. (Note: running `npx vitest run` bare against the repo picks up stale compiled files in `dist/` — the canonical runner is `npm test`, which rebuilds first.)

**Next:** Task 11 — launch posts (build-in-public thread). Awaiting Joshua's go-ahead, one at a time.

## Chat A — Share popup + upgraded share card — 2026-09-20 ~21:00 PKT (built & verified by subagent)

Joshua: "whenever someone sniffs a site they get a pop-up to share the score — download PNG, post to socials, copy the image" + "improve the image: our name, logo, score, why it is, and a joke."

**What was built**
- **Upgraded share card** (`packages/api/src/lib/vapor-card.ts` rebuilt): still 1200×630 SVG→PNG via resvg. Now has: SNIFFMYSITE brand + profile URL header, circular domain monogram, giant score with `%`, the tier as a **circular rubber-stamp badge** (thick outer ring, thin inner ring, slammed at −8°; PURE UNCUT VAPOR the only filled one, matching the web stamp), a plain "why it scored this" line naming the strongest smell check, and a deterministic **field-note joke** built only from real metrics/evidence (never names people). Copy stays 5th-grade simple.
- **Reusable circular badge** (`apps/vapor/src/components/TierBadge.tsx`): same geometry as the PNG badge, used in the popup header.
- **Share popup** (`apps/vapor/src/components/SharePopup.tsx`): opens automatically when a scan finishes on `/scan?url=…` (re-openable via "Share this score" button); on startup profile pages it opens from the "Share this score" button (old per-button copy/download/X controls removed). Contents: score + badge header, live card preview, **Download PNG**, **Copy image** (ClipboardItem with honest fallback — "download it instead" when the browser can't), share intents for **X, Facebook, LinkedIn, WhatsApp, Telegram**, native `navigator.share` "More" when available, **Copy link**. A11y: role=dialog + aria-modal, Escape/backdrop close, focus in/out, body scroll lock, aria-live loading / role=alert error / role=status notes. All tap targets ≥44px, bottom-sheet on mobile, `max-h-[92vh]` scroll — built for 360px. Lucide icons only, no emojis, plain words.
- **Backend (scope note):** `POST /api/vapor/card` added in `packages/api/src/routes/vapor.ts` + evidence plumbed through `packages/api/src/lib/profile.ts` — arbitrary completed scans need a dynamic card render (the old `/og/:slug.png` only serves seeded profiles). This goes one file beyond the "only vapor-card.ts" allowance; it was the only way to make arbitrary scans shareable. Scoring untouched.
- Open issue carried forward: on arbitrary scans the popup shares `${origin}/s/${hostname}`, which 404s for non-seeded domains — should share the `/scan?url=…` report URL instead.

**Verification**
- API: `npm test` **260/260 pass** (18 new tests in `src/test/vapor-card.test.ts`: every tier badge, filled max-tier, deterministic jokes, strongest-finding selection, why-line, XML escaping, real 1200×630 PNG dimensions, `POST /api/vapor/card`).
- Frontend: `npx tsc -b` clean, `npm run build` green.
- Rendered two PNGs and eyeballed: SUS (character.ai 53% — joke: "Said “reimagined” 2 times. We counted. Twice.") and PURE UNCUT VAPOR (synthetic 97% — joke: "22× “game-changing”. At this point the buzzwords have buzzwords."). Caught and fixed a real bug: the footer line was clipped by the card frame (moved inside).
- Popup screenshot check **blocked by the sandbox**: Chrome 152 refuses all local navigations (`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`); disable-flags, enterprise policy, old headless, cloudflared tunnel, and an older-Chromium download all failed. Popup verified by code review instead: 44px targets, bottom-sheet layout, scroll containment, dialog semantics, no emojis, Lucide-only, plain copy. Recommend a human screenshot pass at 360/1440px on the deployed site.

## Chat A — Evidence panel replaces dead iframe preview — 2026-09-20 ~21:05 PKT (built & verified by subagent)

Joshua: the live-page iframe is blocked by half the internet — remove it, use the space better.

**What was built**
- **New `EvidencePanel`** (`apps/vapor/src/components/EvidencePanel.tsx`): a bordered lab-case-file aside in the right column where the iframe was. Three sections:
  1. **What counted most** — the check with the highest value × weight (deterministic, ties keep the first), in plain words: "{Hype words} tipped the scales. This check counts the most, and it scored {100} out of 100." Plus one honest line from the real scan counts, per check (e.g. "We found 2 hype words on the page.", "12 big claims, 3 links backing them up.", "The footer says © 2024."). All numbers come from the API's `ScoreEvidence` — nothing invented.
  2. **The words we caught** — the page's real top hype phrases as chips ("reimagined" ×2). Hidden when there are none.
  3. **What to do next** — "Test this site again" (hazard button → `/scan?url=…`), "Share this score" (opens the Task-1 SharePopup), "Open the live site" (external link — the one iframe part that always worked). Plus a small mono "lab notes" line: how many words/sentences we read.
- **Deleted** `apps/vapor/src/components/LiveSpecimen.tsx` (nothing else used it).
- `apps/vapor/src/lib/api.ts`: `ApiStartupProfile['current']` now declares `evidence: ScoreEvidence` — the data already flowed from the profile endpoint; the type was just behind. No backend changes needed. The panel degrades honestly when evidence is absent ("The lab notes for this test didn't survive…").
- `StartupProfilePage.tsx`: iframe slot swapped for the panel; claim CTA in "Report details" untouched.
- Note: the previous entry's "open issue" (share URL 404s for fresh scans) was already fixed by the parent before this task — fresh scans now share `window.location.href` (the `/scan?url=…` report).

**Verification**
- Frontend: `tsc --noEmit` clean, `vite build` green.
- API: `npm test` **260/260 pass** (unchanged — no backend touched).
- SSR smoke test (esbuild-bundled, real `/api/vapor/startup/character.ai` data): panel renders "Hype words tipped the scales. … scored 100 out of 100. We found 2 hype words on the page.", the "reimagined" ×2 chip, all three CTAs, and the lab-notes line; the no-evidence fallback also renders correctly.
- **Chromium screenshots blocked by the sandbox**: headless Chromium 152 cannot render at all here — even `data:text/html` URLs produce empty DOM, so it's the renderer, not the network (same wall the Task-1 popup check hit). The panel was verified by the SSR render + tsc + build instead. Recommend a human screenshot pass of `/s/character.ai` at 360px and 1440px on the deployed site — layout is the same responsive grid the iframe used, so risk is low.

---

## Feature batch — Task: Turnstile-gated scan budget (Sep 20, ~21:10 PKT)

Replaces the flat 10/hr anonymous scan cap with Joshua's spec: **30 free
scans per rolling hour per IP; past that, each fresh Turnstile solve grants
+10 scans; grants stack (30 + 10k); every further 10 needs another solve.**

**Backend** (`packages/api`):
- `src/lib/scan-budget.ts` (new): per-IP `{scans, grants}` timestamp lists,
  1-hour rolling window, `scanAllowance()` / `recordScan()` / `recordGrant()`
  (all with injectable `now` for tests), hourly prune (unref'd),
  `_resetScanBudgets()` test seam. In-memory — same documented deploy seam
  as `lib/ratelimit.ts` (shared store later).
- `src/routes/vapor.ts` `POST /scan` restructured: (1) priority lane first,
  unchanged semantics — own 60/hr/email bucket, credit consumed inside the
  scan, never touches the IP budget, no Turnstile needed (purchase-gated);
  (2) anonymous budget — under budget: scan immediately, **no token required**
  (the first 30 are frictionless); over budget: verify the token once (this
  IS the bot check — Cloudflare rejects a second verification of the same
  token, so tokens are single-use by design), success → `recordGrant` + scan,
  failure/missing → 429 `{error:'rate_limited', turnstile_required:true,
  detail:'You've used your 30 free tests this hour. Pass the human check for
  10 more.'}` + `Retry-After: 3600`.
- **The universal pre-scan bot check is gone** — and with it the 403
  `bot_check_failed` path on `/scan`. Over-budget token failures are 429s
  with the flag, not 403s.
- Dev behavior (documented in code): no `TURNSTILE_SECRET_KEY` →
  `verifyTurnstile` warns + passes, so over-budget scans auto-grant locally;
  the 30/hr counting still runs so the budget math is exercised. Dev never
  bricks.
- `src/lib/security.ts`: header comment rewritten for the new limits;
  `SCAN_FREE_LIMIT` (now 30), `SCAN_FREE_WINDOW_MS`, `SCAN_GRANT_SIZE`
  re-exported from `scan-budget.ts` (single source of truth). The shared
  `rateLimit` middleware / `clientIp` / `setShareCardHeaders` untouched.
- All other endpoint limits (leaderboard 300/hr, claim 5/10, checkout 10,
  webhook 120) byte-identical.

**Frontend** (`apps/vapor`):
- `src/lib/api.ts`: `ScanApiError` gains `turnstileRequired`; parsed from
  the response body's `turnstile_required` flag.
- `src/pages/ScanPage.tsx`: the upfront Turnstile gate is REMOVED — scans
  start immediately. When a scan 429s with the flag, a new `challenge` phase
  renders: "Out of free tests" / "You've used your 30 free tests this hour."
  / "Prove you're human for 10 more." + the Turnstile widget mounted
  on-demand; a solved token auto-retries the failed scan (one solve = 10
  more). Widget load failure → "The human check couldn't load. Check your
  connection, then try the check again." + re-mount button (the Task-10
  plain-language 403 path). No site key (dev) → honest "not switched on in
  this build" state with retry (server auto-grants in dev). No emojis,
  Lucide only, 44px targets.

**Tests:** `src/test/scan-budget.test.ts` (7 pure unit tests: 30 free,
grant +10, stacking, re-exhaustion, window rollover, per-IP isolation);
`src/test/security.test.ts` scan block rewritten (30-free + 429 flag shape,
stateful siteverify stub proving token reuse is rejected, dev auto-grant,
priority lane isolation, grant math through the real route). **Full API suite:
269/269 pass.** Frontend `tsc` clean, `vite build` green.

**Smoke tests (honest):** with `TURNSTILE_SECRET_KEY` set: 30 scans → 403
(sandbox DNS, gates passed), 31st → 429 `{"error":"rate_limited",
"turnstile_required":true,"detail":"You've used your 30 free tests this
hour. Pass the human check for 10 more."}` + `Retry-After: 3600`. Without
the secret: 40+ scans all pass (dev auto-grant). No live-browser eyeball of
the challenge phase possible from this sandbox (Chromium 152 can't render
here) — recommend a human pass: burn 30 scans on the deployed site, solve
the challenge, confirm the auto-retry.

## Chat A — Rentable sponsored banner slots (Sep 20, ~21:45 PKT) — built & verified by subagent

Joshua's post-MVP feature batch, task: rentable homepage banner slots. **PRICES ARE PLACEHOLDER** — banner7 $19 / banner30 $59, flagged for Joshua to change before live (see "Needs Joshua's decision" below). All other product rules enforced by construction:

**Backend** (`packages/api`):
- `src/lib/sponsors.ts` (new): separate `SPONSOR_PRODUCTS` catalog (banner7 "Homepage banner, 7 days" $19 / banner30 "Homepage banner, 30 days" $59 — NOT in the rescan/audit credit ledger), in-memory sponsor store (same documented Supabase deploy seam as billing), injectable `now` on every time function. Record: `{ id, brand_name, image_url, dest_url, alt_text, buyer_email, term_days, status, order_id, created_at, starts_at, ends_at }`. `validateAdvertiser()` — https-only for both URLs (rejects http:, javascript:, data:, ftp:, relative), brand ≤60 / alt ≤120, control chars stripped. `applySponsorEvent()` in the `applyBillingEvent` style: `order_created` → `pending_approval` record (idempotent on order_id), `order_refunded` → `rejected` (never servable), banner events provably never touch the credit ledger.
- `src/routes/sponsors.ts` (new): `GET /api/vapor/sponsors` (public: approved + in-window only, oldest-first, no buyer email / order id, 300/hr/IP), `GET /api/vapor/admin/sponsors` (all, `?status=` filterable), `POST /admin/sponsors/:id/approve` (optional `{starts_at}`; window starts now by default, ends_at = starts_at + term_days), `POST .../reject`. All admin routes behind a constant-time `x-admin-token` vs `ADMIN_TOKEN` comparison — missing env → 503, wrong token → 401.
- `src/routes/billing.ts`: `POST /checkout` now also accepts banner7/banner30 (test-mode gate unchanged); advertiser inputs validated server-side (400 `invalid_advertiser_input`) and passed through as Lemon Squeezy checkout `custom` data (URLs + names only). Webhook dispatches banner products to `applySponsorEvent` before the credit ledger — same pattern as the burn dispatch.
- `src/index.ts`: `sponsorsRouter` mounted at `/api/vapor`.
- `.env.example`: `LEMONSQUEEZY_BANNER7_VARIANT_ID`, `LEMONSQUEEZY_BANNER30_VARIANT_ID`, `ADMIN_TOKEN` (documented: server-only, never committed).

**Frontend** (`apps/vapor`):
- `src/components/SponsorSlot.tsx` (new): renders a "Sponsored" eyebrow + linked image (max-height 160px, aspect preserved, `target="_blank" rel="sponsored noopener"`, alt text from the record). Neutral classes only (`.sponsor-slot`, `.sponsor-frame` — nothing containing "ad"). Empty state: Slot A renders nothing; Slot B renders one quiet line ("Your banner here — reach founders" → /pricing) — no empty boxes, no spam.
- `App.tsx` `LandingPage`: fetches `/api/vapor/sponsors` once, shares via props (index 0 → Slot A, index 1 → Slot B). **Slot A** directly below the hero; **Slot B** directly above the footer. Both are their own sections, never inside the Hall of Vapor or adjacent-to-score markup — sponsorship is visually and logically far from rankings.
- `src/pages/AdminSponsorsPage.tsx` (new, `/admin/sponsors` route, not linked from the site): token entry form → sessionStorage for the tab only; pending list with creative previewed (image + link), buyer email, term, paid date; approve (starts window now) / reject / pull-down buttons; plain internal Lab styling.
- `src/pages/PricingPage.tsx`: new "Sponsor the homepage" section — two banner cards in the existing hairline-row style (Megaphone icon), an advertiser form (brand name, image URL, destination URL, alt text; buyer email reuses the page's email field), client validation mirroring the server rules, plain 5th-grade copy, Lucide only, 44px targets, the honesty line ("You pay now, a human approves later… payment alone never publishes"), and test-mode labeling matching the page's badge.

**Verification:** API `npm test` **302/302 pass** (269 pre-existing + 33 new in `src/test/sponsors.test.ts`: full lifecycle, webhook idempotency, refund kill, validation matrix, credit-ledger isolation, admin auth paths). Frontend `tsc` clean, `vite build` green. Live smoke test: signed `order_created` webhook → `pending_approval` (public still empty) → admin approve → publicly served with safe fields only; checkout 400s on http:/javascript:/oversize inputs verified. **Chromium screenshots blocked again** — this sandbox's Chromium can't render even `data:text/html` (empty DOM; same wall the last three tasks hit). Banner slot layout, the admin page, and the pricing section need a human eyeball pass at 360px and 1440px on the deployed site with a seeded test sponsor (approve one via the admin page, check both slots, then reject it).

**Needs Joshua's decision:**
1. **Final pricing** — $19/7 days and $59/30 days are PLACEHOLDERS. Set real prices before going live (they're in `packages/api/src/lib/sponsors.ts` `SPONSOR_PRODUCTS`, mirrored in `apps/vapor/src/lib/api.ts`, plus LS dashboard variant IDs).
2. **Term lengths** — 7 and 30 days are my defaults; say the word if he wants different terms.
3. **LS dashboard** — create the two banner products in test mode and set `LEMONSQUEEZY_BANNER7_VARIANT_ID` / `LEMONSQUEEZY_BANNER30_VARIANT_ID` on Render.
4. **ADMIN_TOKEN** — set a long random value as a Render env var (`ADMIN_TOKEN`); the `/admin/sponsors` page will ask for it once per session.
5. Deploy-time: same test-mode hard block as Task 9 — no live money until the LS seller app is approved.

**Deliberately NOT done:** impression/click tracking (no pixels by design); banners only on the landing page; rescan/audit products and prices untouched; no zip rebuild; apps/burn untouched.

## Chat A — Sniff Score flip (Sep 21, ~19:00 PKT) — built & verified by subagent

The isolated task: flip the public number to Sniff Score (0 = pure vapor, 100 = certified real), conversion `sniff_score = clamp(Math.round(100 - vapor_score), 0, 100)` in `packages/api/src/lib/score.ts` (`sniffScoreFor`). The internal six-check Vapor Score v1 engine, weights, constants, calibration, 20 fixtures, and `ALGO_VERSION = 'v1'` are untouched. Work scoped to `apps/vapor` + `packages/api` only.

**Backend** (`packages/api`):
- `src/lib/score.ts`: `sniffScoreFor()` added; `ScanResult` carries both scores; `tierFor` now keys off sniff — CERTIFIED REAL 81–100, ALMOST REAL 61–80, SUS 41–60, JUST VIBES 21–40, CERTIFIED FAKE 0–20; `scorePage` derives sniff from unchanged vapor then tiers off it; verdicts rewritten in reverse-psychology voice (grudging respect for good pages, delight at exposing bad ones; page-focused, never people). Fixed a double-negative bug: "no live demo is nowhere to be found" → "no live demo to be found".
- `src/lib/seed.ts`: `sniff_score` on every seed row (delta sign documented as sniff delta: positive = page got more real); added `sortRealFirst` / `sortVaporFirst` / `sortImproved` sort helpers. Removed the unused `sniffScoreFor` import.
- `src/lib/profile.ts`: profile + history carry both scores (fallback conversion for old entries).
- `src/lib/vapor-card.ts`: full rebuild around the sniff score — SNIFFMYSITE branding, SNIFF SCORE label, original serrated rosette seal (24 teeth, two ribbon tails, tier colors: gold/slate/orange/hazard red-orange/gray), deterministic evidence-based joke, canonical `sniffmysite.lol/s/:slug` URL, footer "we joke about the page, never the people." **Fixed a real bug**: ribbon tails were path-command strings fed to `<polygon points>` (rendered nothing) — now `<path d>`.
- `src/routes/vapor.ts`: leaderboard defaults to `sort=real`; OG card route uses `profile.current.sniff_score`; `/card` accepts `sniff_score` (primary) with legacy `vapor_score` conversion; `setShareCardHeaders()` / CORP untouched.

**Frontend** (`apps/vapor`):
- `src/lib/tiers.ts` rewritten for new tier names + sniff boundaries, reverse-psychology fallback verdicts; `src/lib/api.ts` carries `sniff_score` through scan/leaderboard/profile/history types; `src/lib/score-explainer.ts` `SCORE_STORY` is now the exact verbatim sentence: "0 is pure vapor, 100 is certified real. We read the startup's public page and run six smell checks."
- New `src/components/RosetteBadge.tsx`: original SVG rosette, tier colors, scales from 28px to hero size. **Same ribbon bug fixed** (`<path d>`). Deleted `Stamp.tsx` / `TierBadge.tsx` (the `.stamp` CSS stays — Pricing's test-mode badge uses it; billing untouched).
- All display surfaces flipped: ScanPage, StartupProfilePage, LeaderboardPage (Most Real default with gold #1, Most Vapor = Wall of Shame, Most Improved), landing Leaderboard ("Hall of Vapor" keeps the vapor fetch but displays sniff), Ticker, SharePopup, JudgingCriteria (tiers highest-first with rosettes), MetricBars (bars remain smell-intensity, copy explains they show what blocked a perfect 100).
- Verified: `vapor_score` appears nowhere in the frontend outside `lib/api.ts` types/transport — never rendered.

**Verification:** API `npm test` **312/312 pass** (302 baseline + 10 net new; includes direct `sniffScoreFor` tests — 0→100, 100→0, rounding, clamping — tier boundaries 80/81, 60/61, 40/41, 20/21, both-scores contract, grammar regression for the double negative, `sortImproved` sign-convention test, card POST with legacy `vapor_score` compatibility). Frontend `npx tsc --noEmit` clean, `vite build` green. Rendered two sample cards via `renderVaporPNG` — 94 CERTIFIED REAL and 3 CERTIFIED FAKE — both exactly 1200×630 PNG (~54–55KB), visually inspected: rosette with ribbon tails, SNIFF SCORE label, deterministic report number, evidence joke, canonical URL, footer sign-off.

**Needs Joshua's eyeball pass (Chromium screenshots unavailable in this sandbox):** (1) rosette at small leaderboard/popup size, (2) rosette at large scan/profile size, (3) default Most Real order + gold #1 styling, (4) Most Vapor Wall of Shame tab, (5) the two 1200×630 sample cards, (6) share popup header + preview. Sample cards are at `/tmp/sniff-card-94-certified-real.png` and `/tmp/sniff-card-03-certified-fake.png`.

**Deliberately NOT done:** engine/weights/fixtures/calibration unchanged; apps/burn, billing, sponsors, rate limits, Turnstile, priority scans, security headers/CORP, deployment/launch untouched; no zip rebuild.

## Chat A — Navbar rebuild (Sep 21, ~22:00 PKT) — built & verified by subagent

The navbar finally does things. Replaced the inline `Header()` in `apps/vapor/src/App.tsx` with a real `Navbar` component, and replaced the ticker's faked "latest sniffs" (it was sorting the leaderboard, not showing recent scans) with a real feed.

**Backend** (`packages/api`):
- `src/lib/recent.ts` (new): in-memory ring log of the last `RECENT_MAX = 15` successful scans — same documented Supabase deploy seam as billing/sponsors. Each record is host-only by construction: `{ slug, domain, sniff_score, vapor_score, tier, scanned_at, has_profile }`. `has_profile` = `getProfile(slug) !== null`. No emails, IPs, or full URLs ever enter the log.
- `src/routes/vapor.ts`: `POST /api/vapor/scan` calls `recordRecentScan` on every successful scan — anonymous AND priority lane (a scan is a scan). New public `GET /api/vapor/recent` → `{ count, scans }` (300/hr/IP, same limit class as leaderboard/sponsors), empty log → `{ count: 0, scans: [] }`.
- Tests: `src/test/recent.test.ts` (8 tests: record on scan input, slug/domain derivation, both scores present, has_profile true for `character.ai` / false for unknown hosts, newest-first order, 15-scan cap, invalid-URL no-push, empty-log shape, public-field whitelist, ISO `scanned_at`, 300×200 → 301st 429 with Retry-After). **Full API suite: 320/320 pass** (312 baseline + 8 new). Note: real successful scans can't run in this sandbox (DNS blocked → fetchPage 403s), so "push on scan" is tested at the exact `recordRecentScan` seam the route calls.

**Frontend** (`apps/vapor`):
- `src/components/Navbar.tsx` (new): sticky (`sticky top-0 z-40`, paper bg) two-row navbar. Row 1: Logo + SniffMySite wordmark → `/`; four real links — Sniff → `/#sniff`, Leaderboard → `/leaderboard`, How it works → `/leaderboard#how-it-works` (anchor VERIFIED: `id="how-it-works"` in `JudgingCriteria.tsx`, rendered on LeaderboardPage), Pricing → `/pricing`; prominent hazard "Sniff a site" CTA. Row 2: the ticker.
- CTA behavior: on `/` → smooth-scrolls to `#sniff` (new anchor on the scan-box wrapper, `scroll-mt-40` clears the sticky bar) and focuses `#scan-input`; from any other route → `navigate('/#sniff')`, then focuses after navigation settles. Reduced-motion users get instant scroll.
- `src/components/Ticker.tsx` rewritten: real feed from `GET /api/vapor/recent` (empty/failed → tape hidden, never fabricated); each item = 28px RosetteBadge + host + sniff score in mono; links to `/s/:slug` when `has_profile`, else `/scan?url=https://<host>` (ScanPage reads `?url=`); duplicated list for the seamless -50% loop with aria-hidden dupes; pause on hover AND focus-within (new CSS); `prefers-reduced-motion` → static wrapping list, duplicate half hidden; `aria-label="Latest sniffs"`. Paper bg + hairline borders, quiet.
- `App.tsx`: inline `Header()` deleted; `<Ticker />` removed from the landing page (exactly one ticker on the site, inside the navbar); ScrollManager untouched (still owns scroll-to-top-on-navigation).
- Mobile: 44px hamburger (Lucide Menu/X, `aria-expanded`) toggling a stacked panel with the four links + full-width CTA; ticker stays visible below the bar, slimmer (`py-2`). No sideways-scroll nav anymore.
- `src/lib/api.ts`: `ApiRecentScan` type + `fetchRecentScans()`.
- Anti-slop: no emojis, Lucide only, all tap targets ≥44px, no dead links (every nav link + CTA + ticker link walked against the route table), no purple gradients, plain 5th-grade copy.

**Verification:** API `npm test` **320/320 pass**. Frontend `npx tsc --noEmit` clean, `vite build` green (1710 modules).

**Needs Joshua's eyeball (Chromium screenshots impossible in this sandbox — nothing here was visually verified):**
1. Desktop navbar: bar + ticker strip layout, rosette + score legibility in the tape.
2. Ticker animation + pause-on-hover (and pause when tabbing through items).
3. Mobile at 360px: hamburger panel (links + CTA stacked), ticker slim below the bar, no sideways scroll anywhere.
4. CTA focus behavior from a non-landing page: click "Sniff a site" on /leaderboard or /pricing → should land on / with the scan input focused and cursor in the box.
5. Empty-state: on a fresh server with no scans, the ticker strip should be gone entirely.
6. Mobile menu closes on navigation (link click or CTA).

**Deliberately NOT done:** meme-energy copy pass, footer, scan reliability, depth features (compare/random/trending/history), zip rebuilds, scoring engine/weights/fixtures, billing/sponsors/Turnstile/rate limits, apps/burn.

## Chat A — Meme-energy pass (Sep 21, ~22:30 PKT) — built & verified by subagent

Joshua's core complaint: the site feels too serious for a meme site meant to go viral. This pass extends the reverse-psychology inspector voice (grudging about good pages, delighted by vapor) across every surface. Copy + styling only, in `apps/vapor`; **zero changes** to scoring engine, weights, tiers, leaderboard logic, billing, sponsors, scan budgets, or `packages/api`. Inspection Lab identity kept — just turned up.

**Landing page (`App.tsx`):** eyebrow "The startup hype checker" → "The startup smell test"; hero H1 bumped to `text-6xl md:text-7xl` with "sniff" in hazard; subcopy now "Paste a startup's web address. We read the page, count the hype, and hand it a score from 0 to 100 — 100 is certified real, 0 is pure vapor. Founders, be brave."; joke band "We measure exactly how much."; $0 card "Founders only pay to re-test faster — or to prove they're real." (billing-honest).

**Scan box (`ScanBox.tsx`):** CTA "Test the page" → "Sniff it"; sub-line "Free forever · No account · Scores are public, obviously".

**Scan page (`ScanPage.tsx`):** loading phases extended (`sniff-phases.ts`: 'Sniffing for "revolutionary"…', 'Counting the "trusted by" logos…', 'Dusting off the copyright year…' — each a real test step); loading eyebrow "Sniffing", "A real sniff takes a few seconds."; score reveal eyebrow now "The lab has spoken" (count-up + rosette slam unchanged); "What we found" → "The findings", "How we got this score" → "Show your work", verdict bumped to `md:text-4xl`; share CTA "Share this score" → "Spread the word" + "Make it famous."; report-shell exit "Test another" → "Sniff another".

**Profile page (`StartupProfilePage.tsx`):** eyebrow "Startup report" → "Report card"; same reveal/section voice as scan page; "Past scores" → "The redemption file" + "Every redemption arc starts with one re-test. New scores land here, in public."; history rows "Test N" → "Sniff N"; not-found CTA "Sniff the page".

**Leaderboard page (`LeaderboardPage.tsx`):** tab sublines rewritten — Most Real: "#1 is the prize. Every founder wants this spot."; Most Vapor (Wall of Shame): "#1 is the vaporest page we've ever tested. Say cheese."; Most Improved: "Redemption arcs — pages that fixed their copy and re-tested. Ranked by biggest glow-up."; empty state "No redemption arcs yet." + "Be the first."; intro/footer now "Sniff the page again" / "Sniff any page again anytime."

**Landing leaderboard (`Leaderboard.tsx`):** subline "Top 10 · vaporest first".

**Judging criteria (`JudgingCriteria.tsx`):** "No appeals, no bribes — the only way to change a score is to sniff the page again." (integrity line, meme voice); "Score levels" → "The medals".

**Evidence panel / metric bars (`EvidencePanel.tsx`, `MetricBars.tsx`):** "What counted most" → "The biggest clue" ("moved the needle most"); "The words we caught" → "Caught red-handed"; "What to do next" → "Your move"; CTAs "Sniff it again" / "Spread the word"; bars intro "Each check shows how much it stank".

**Anti-slop pass:** every new line read aloud — 5th-grade clear, no emojis (Lucide only), no purple gradients, roast targets the page not people, 44px tap targets untouched, no new pages/features. One cut: "We framed their homepage" dropped as ambiguous (framed = falsely accused?) → "Say cheese."

**Verification:** frontend `npx tsc --noEmit` clean, `vite build` green (1710 modules); API suite **320/320 pass** (untouched, re-run to confirm). No frontend tests exist; no copy-selection logic changed, so none added.

**Needs Joshua's eyeball (Chromium unavailable in this sandbox):** (1) hero at 360px and 1440px — the `text-7xl` H1 with hazard "sniff" beside the leaderboard; (2) the "The lab has spoken" score reveal + rosette slam; (3) Wall of Shame tab and Most Improved redemption copy; (4) empty states (no comebacks, no report); (5) mobile stacking of the new loading phases and "Spread the word" buttons.

**Deliberately NOT done:** footer (next task), scan reliability, depth features, zip rebuilds, navbar structure, pricing/verify/billing copy, scoring engine/weights/tiers.

## Chat A — Real footer (Sep 21, ~23:00 PKT) — built & verified by subagent

New `apps/vapor/src/components/Footer.tsx`, mounted in `App.tsx` layout so every page gets it; the old inline footer (sign-off + tiny bottom bar) was deleted from `App.tsx`. Frontend-only — zero API changes.

**Structure (Antigravity-inspired, Inspection Lab identity):**
1. Sign-off + CTA block: eyebrow "The nose never sleeps", Joshua's beloved "No startups were harmed. / Several were exposed." kept big (text-3xl md:text-5xl), one-line invite, and the hazard "Go sniff something." button (Lucide FlaskConical, 44px+).
2. Link columns — only real destinations, all machine-verified against the route table: The site (Sniff a site `/#sniff`, Leaderboard `/leaderboard`, How it works `/leaderboard#how-it-works` — anchor exists in JudgingCriteria, Pricing `/pricing`); Founders (Claim your page `/verify`, Audits & re-scans `/pricing`). Zero dead links.
3. Giant wordmark: SNIFFMYSITE in Space Grotesk bold uppercase, ink, `clamp(2.5rem,10.5vw,9.5rem)` — ~234px wide at 360px (fits in 312px), ~882px at 1440px. `whitespace-nowrap` + `overflow-x-clip` guard on the footer: no sideways scroll possible. It's a home link (aria-label, visual span aria-hidden).
4. Bottom bar: parody disclaimer ("Scores come from an automated nose reading public landing pages. We joke about the words on the page — never the people behind them. A bad score isn't forever: fix the page, sniff it again."), "© 2026 · Sniff Score v1 · nose operational".

**CTA behavior:** same as the navbar's "Sniff a site" (scroll to #sniff + focus input on `/`; navigate-then-focus from any other page, with reduced-motion respect). Re-implemented locally in Footer.tsx — Navbar.tsx untouched by design.

**Anti-slop pass:** no emojis (Lucide only), no purple gradients, hazard used only for the CTA button, all copy 5th-grade clear and readable, every interactive element ≥44px, columns stack on mobile, no lorem ipsum, roasts the page never people.

**Verification:** `npx tsc --noEmit` clean, `vite build` green (1711 modules), API suite **320/320 pass** (untouched, re-run to confirm). Footer links walked against the route table: 6/6 real (4 routes + 2 anchors verified to exist in rendered components).

**Needs Joshua's eyeball (Chromium unavailable in this sandbox):** (1) giant wordmark at 360px and 1440px — check it fills the width without clipping; (2) the two link columns on a phone (should stack cleanly, no sideways scroll); (3) "Go sniff something." from a non-landing page (e.g. /pricing) — should land on /#sniff with the scan input focused; (4) bottom bar stacking on mobile.

**Deliberately NOT done:** scan reliability (next task), depth features, zip rebuilds, navbar changes.

## Chat A — Scan reliability (Sep 21, ~23:30 PKT) — built & verified by subagent

Joshua's complaint: "scan results fail to appear for some sites" — some URLs produced silence. Now every failure leaves as a structured, honest, actionable result. SSRF protections untouched (only the *reporting* changed, never the guards).

**Backend** (`packages/api/src/lib/fetch.ts`, `src/routes/vapor.ts`):
- New `FetchErrorCode`s: `blocked` (upstream HTTP 403/429, or a bot-protection/captcha challenge page served as HTTP 200 — detected via conservative Cloudflare/PerimeterX/DataDome markers, never scored as garbage), `http_error` (other upstream 4xx/5xx), `tls_error` (cert/TLS handshake failures, classified from transport error text), `empty_page` (page loaded but <100 chars of readable text — a JS shell used to score as suspiciously *perfect*).
- Status handling: 403/429 → `blocked`; other ≥400 → `http_error`. Both carry `upstreamStatus`; the route returns it as `upstream_status` so the frontend can tailor advice (404 vs 500).
- **Leak fix:** the route no longer echoes `err.message` — it returns `fetchErrorPublicDetail(code)`, a generic one-liner per code (no IPs, DNS internals, or transport jargon — the old messages were an SSRF oracle, e.g. "Refusing to fetch non-public IP 10.0.0.1"). Status mapping centralized in `fetchErrorHttpStatus` (400 invalid_url, 403 ssrf_blocked, 502 everything else).
- Scoring engine, weights, tiers, budgets, rate limits, Turnstile flow: untouched.

**Frontend** (`apps/vapor/src/lib/api.ts`, `src/pages/ScanPage.tsx`):
- `requestJson` now has a 60s hard timeout → `request_timeout` code: no more infinite spinners, even on a hung connection or cold host. `ScanApiError` carries `upstreamStatus`.
- `toLabError` rebuilt as a full code → voice table (all 12 fetch codes + billing + network + `request_timeout`), `http_error` special-cased by status (404: "check the URL"; 5xx: "their server is down"). Unmapped codes fall back to a generic entry — and raw server text is never rendered anymore.
- Error card now picks the sensible primary button: pointless retries (`invalid_url`, `ssrf_blocked`, `tls_error`, `body_too_large`, `unsupported_content_type`) get a filled **Back to the start** + quiet "Try again anyway"; transient failures keep filled **Try again**. All ≥44px, Lucide only, no emojis, meme voice that roasts the situation not the person.

**Verification:** API **354/354 pass** (320 baseline + 34 new in `src/test/scan-errors.test.ts`: stubbed fetchPage taxonomy — 403/429→blocked, 404/500→http_error, challenge page→blocked, JS shell→empty_page, bad redirect→fetch_failed; TLS vs transport classification; leak-free one-liner for every code; route-level ssrf_blocked sanitization proving the refused IP never appears in the response). Two old stub fixtures were padded past the 100-char readability floor. Frontend `tsc` clean, `vite build` green. Machine-walked: all 12 API codes map to a frontend voice, no unmapped codes, no raw-message echo.

**Needs Joshua's live eyeball (sandbox DNS is sinkholed — no live fetch possible here):** (1) an unreachable URL → "That address doesn't exist" card; (2) a bot-protected site (e.g. one with Cloudflare challenge) → "This site blocked our nose"; (3) a JS-heavy page with an empty shell → "The page came back empty"; (4) confirm a normal scan still lands on results. Mock-tested here; live behavior needs one real run of each.

**Deliberately NOT done:** depth features (next task), zip rebuilds, scoring/tiers/budgets/Turnstile/rate limits, apps/burn.

## Chat A — Depth features: sniff-off, random sniff, most-sniffed board (Sep 21, ~23:50 PKT) — built & verified by subagent

All three §2.12 depth features. Work stayed in `apps/vapor` + `packages/api`; apps/burn, billing, sponsors, scan budgets/rate limits, Turnstile, scoring/weights, tiers, leaderboard, navbar, footer untouched.

**1) Sniff-off (`/compare`)** — `apps/vapor/src/pages/ComparePage.tsx`, route registered in `App.tsx`.
- Two URL inputs; on submit both scans fire through the existing POST /api/vapor/scan pipeline independently (per-side loading/error/result states — one slow or failed scan never blocks the other).
- Side-by-side cards: rosette (reused RosetteBadge, 72px + tier name in text), count-up sniff score (reused useCountUp), verdict, "Full report →" link to /scan?url=….
- Winner: "X takes the sniff-off." (higher score wins) / tie: "A dead tie. The nose shrugs." Loser's card gets "Sniff-off champion" ribbon on the winner's side.
- Biggest differences: top 3 of the six smell-check gaps (abs diff of each metric), each row naming the smellier side ("{host} smells worse here"), with the honest scale note "higher = more suspicious".
- Same URL twice → friendly error, zero scans fired (canonical compare: no scheme/www/trailing slash/query).
- Failures reuse the ScanPage failure-code voice (exported toLabError + LabError + hostnameOf from ScanPage.tsx); budget 429 gets its own honest copy: "A sniff-off runs two tests, and each one counts against your 30 free tests per hour". The form states this upfront too. No Turnstile widget on this page — honest, since the challenge lives on /scan.
- Entry link on the landing hero: "Got two pages? Pit them against each other".

**2) Random sniff button** — `apps/vapor/src/lib/randomSeeds.ts` (THE one file Joshua edits: 18 `{ name, url }` famous pages, plain https homepages, no deep links) + exported `RandomSniffButton` in `ScanBox.tsx`.
- Dices icon, "Feeling brave?" label, next to the hero scan box (also offered on the scan page's empty state). Rolls → "Consulting the nose…" / "Rolling the dice…" beat → navigates to /scan?url=<seed> so the normal scan flow runs.
- Never picks the same site twice in a row (sessionStorage `sniffmysite-last-random`; degrades gracefully if storage is blocked).

**3) Most-sniffed board** — API: `packages/api/src/lib/recent.ts` gains a per-host tally map updated in the same `recordRecentScan` call that feeds the ticker (only successful scans ever reach it — failures can't be counted), same in-memory + documented Supabase-seam pattern; new read-only `GET /api/vapor/trending` returns top 10 `{ host, slug, sniff_count, latest_sniff_score, tier, has_profile }`, host only. Frontend: `apps/vapor/src/components/TrendingBoard.tsx` on the landing page (below hero, above sponsor slot A): rank, mini rosette, host, latest score, "sniffed N times", linking to /s/:slug when a dossier exists else /scan?url=https://host. Empty tally → honest quiet line ("Nothing sniffed yet — be the first."); API unreachable → section hides, never fakes.

**Verification:** API **364/364 pass** (354 baseline + 10 new in `src/test/trending.test.ts`: tally increments on recorded scans only, latest score/tier reflects newest scan, www+path variants merge, desc order + latest-scan tiebreak, 10-host cap, endpoint shape + public-field privacy + has_profile, empty shape, 429 behavior). Live smoke: /api/vapor/trending → 200 `{"count":0,"hosts":[]}`. Frontend `tsc --noEmit` clean, `vite build` green (1714 modules). Link walk: /compare route exists; all new links (/s/:slug, /scan?url=…, /compare, /) resolve against the route table — zero dead links. Anti-slop pass on all new copy: 5th-grade clear, roasts pages not people, zero emojis, Lucide only, 44px tap targets, no purple gradients.

**Needs Joshua's live eyeball (Chromium unavailable in this sandbox):** (1) /compare on desktop + phone — side-by-side cards, stacked layout, per-side loading, same-URL-twice error; (2) "Feeling brave?" button — picks a random seed, never repeats back-to-back (check `apps/vapor/src/lib/randomSeeds.ts` for the editable list); (3) "Most sniffed" strip on the landing page — will be empty ("Nothing sniffed yet — be the first.") until real scans accumulate; counts only successful scans, so bots' failures never inflate it.

**Deliberately NOT done:** zip rebuilds, scoring/tiers/budgets/Turnstile/rate limits, apps/burn, navbar/footer structure.

## Chat A — Live leaderboard: scans now reach the board (Sep 21, ~23:55 PKT) — built & verified by subagent

Joshua's complaint: the leaderboard was frozen on the original 20 fixture sites — new scans never appeared, killing the point of the site. Root cause: `GET /api/vapor/leaderboard` read only the boot-scored seed list; the scan route journaled nothing for the board.

**Backend** (`packages/api`):
- `src/lib/scanlog.ts` (new): the live scan journal — same in-memory + documented Supabase-seam pattern as `lib/recent.ts` (`board_scans` table replaces the map at deploy). Every successful `POST /api/vapor/scan` calls `recordBoardScan({ finalUrl, result })` on the same code path as the ticker feed. Per host (normalized via the shared slug function — `www.x.com`, `X.COM`, `x.com` never double-list): full scan history newest first, board row = latest score, `delta` = latest sniff − FIRST sniff (positive = more real; null until 2+ scans). A live scan of a fixture host OVERRIDES its seed row and adopts the seed scan as history chapter 1 — the fixture score itself is never edited. Entries are host-only by construction (no IPs/emails/full URLs).
- `src/lib/slug.ts` (new): `normalizeSlug` extracted from `profile.ts` (re-exported there, so every existing importer keeps working) so the journal can share the one canonical dedupe function without a circular import.
- `src/lib/profile.ts`: `getProfile` now reads the journal first, seed second — one re-scan updates the board, the dossier, the share card, and the claim gate together. Seed-only hosts return byte-identical profiles to before (single chapter). Consequence (intended, no claim code touched): the claim flow's "board-listed only" scope now means the *live* board — any successfully scanned host can be claimed, not just the original 20.
- `src/routes/vapor.ts`: scan success path records into the journal; `GET /api/vapor/leaderboard` now serves `getBoard(sort)` (live rows + untouched seeds for hosts never re-scanned). Response shape, rate limit (300/hr), and all sort helpers unchanged.

**Frontend** (`apps/vapor/src/pages/LeaderboardPage.tsx`):
- The board re-fetches every **20s** (within the 15–30s spec). Polling pauses while the tab is hidden (Page Visibility API) and refreshes once when the tab returns instead of waiting out the timer.
- Refreshes are *soft*: old rows stay on screen while the new data loads, React keys rows by domain so they update in place — no full-page flash, no scroll jump, the selected tab never resets. A stale-response guard keeps overlapping tab-switches and poll ticks from overwriting each other; soft failures fail silently (next tick retries), only a deliberate load shows the error state.
- Intro line is now dynamic: "N startup pages tested and ranked." instead of the hardcoded 20. Gold #1 styling, tabs, category pills, delta column, and the "No redemption arcs yet." empty state all work off live data (Most Improved fills the moment any host has 2+ scans).

**Verification:** API **376/376 pass** (364 baseline + 12 new in `src/test/scanlog.test.ts`: new scan appears on the board; re-scan updates latest + appends history; fixture merge/override with seed score untouched; www/case/path dedupe; Most Improved delta math incl. negative-before-null ordering; empty-journal empty state; host-only shape; profiles follow the journal incl. fixture re-scans; garbage URLs rejected; plus 2 route-level tests proving the endpoint merges live scans). The tab walk was mock-tested: the sandbox DNS is sinkholed, so real fetching is impossible — the sequence runs the real v1 engine over synthetic HTML through the exact `recordBoardScan` seam the route calls, then the real HTTP endpoint. Frontend `tsc --noEmit` clean, `vite build` green (1714 modules), full repo `npm run build` green. Anti-slop pass: two new UI strings, both 5th-grade plain; no new animations (row-in stays under the existing reduced-motion gate).

**In-memory restart-reset caveat:** the journal lives in the server process — a Render restart wipes live rows and the board falls back to the 20 seeds (same as the billing ledger, sponsor store, and recent-scans ring). Supabase persistence is the documented deploy seam.

**Live test script for Joshua (needs the deployed API, real network):**
1. Sniff 2–3 sites you've never sniffed before. Open `/leaderboard` and keep it open — the new rows appear within ~20 seconds, no reload, and the "N startup pages" count goes up.
2. Re-sniff one of them (or one of the original 20). Open the **Most Improved** tab — the comeback row shows up with a Δ score (positive = the page got more real). The site's dossier (`/s/<domain>`) shows the redemption file with both chapters.
3. Check **Most Real** — #1 still wears the gold. Switch tabs and scroll mid-refresh — your place never jumps.

**Deliberately NOT done:** scoring engine/weights/calibration, tiers, rate limits/scan budgets, Turnstile, apps/burn, billing, sponsors, compare/random/trending features, navbar/footer structure, fixture scores (untouched), zip rebuilds. The landing-page Hall of Vapor preview reads the same live endpoint on page load (polling lives on `/leaderboard` only, per spec).

## Chat A — Leaderboard visual fixes (Sep 22, ~11:45 PKT) — built & verified by subagent

Joshua's live-site screenshots showed four problems: (1) homepage Hall of Vapor preview chopped domains mid-word ("charact...", "ascenda...") and tier labels ("ALMOST R..."); (2) /leaderboard meta lines got awkwardly cut ("Other · tested 11h ago · scoring ..."); (3) the "weird black sign" was character.ai's real favicon (SiteLogo flashes a broken-image box while loading); (4) medals felt like dots, not medals.

**Homepage preview (`components/Leaderboard.tsx`)** — rows redesigned: the decorative score bar is gone (it duplicated the big number), "test again" is now icon-only (44px tap target, full `aria-label`), the domain block got ~200px more room, the domain carries the full value in `title`, and the tier line is uppercase microtype that never mid-word chops. **Sort fixed too:** the preview now fetches `real` (Most Real) with the label "Top 10 · most real first" — it previously showed most-vapor while /leaderboard defaults to Most Real, so the two pages disagreed. The "Full board" link already pointed at /leaderboard, so they're consistent now.

**`/leaderboard` rows (`pages/LeaderboardPage.tsx`)** — meta line trimmed to `{Category} · tested {ago}` (the meaningless "scoring v1" chop is gone — the version already lives in the footer bar); score bar removed (same duplicate-number reasoning); domain gets `title`; the Δ column now has a tooltip: "Score change since the first sniff: +N".

**Favicons (`components/SiteLogo.tsx`)** — the black square was character.ai's REAL favicon, behavior kept (no fake logos). Now the monogram tile is always rendered underneath at the exact box size: no layout shift while the favicon loads, no broken-image flash (the img only fades in on a successful load), and a recycled row that gets a new domain (live board re-sorts) restarts its load cycle.

**Bigger medals everywhere** — preview 28→40, /leaderboard 30→44, scan result 110→128, profile hero 110→128, profile history 30→40, share popup 84→96, "The medals" legend 34→48. Ticker (28) and trending (34) left alone — slim strips, not medal moments.

**Verification:** frontend `tsc` clean, `vite build` green, API suite **376/376 pass** (untouched). Width walk by layout math: at 360px the preview domain block gets ~124px (12–13 chars at 16px bold — "character.ai" fits, longer ones truncate once at the end with full domain in title); at 768px+ and 1440px nothing truncates. All tap targets ≥44px, Lucide only, no emojis, Inspection Lab identity untouched. Anti-slop: two new UI strings ("Top 10 · most real first", the Δ tooltip), both 5th-grade plain.

**Needs Joshua's eyeball (Chromium unavailable in this sandbox):** (1) homepage preview rows at phone + desktop — domains read cleanly, no mid-word chop; (2) preview header says "most real first" and matches the /leaderboard default tab; (3) /leaderboard rows — meta line reads "{Category} · tested X ago", Δ shows its tooltip on hover; (4) medals visibly bigger on scan page, profile, leaderboard, share popup; (5) favicon loading — monogram tile first, real favicon fades in, no broken-image flash (try a slow connection).

**Deliberately NOT done:** footer wordmark, dark theme, full mobile QA pass (separate tasks), scoring/tiers, apps/burn, billing, zip rebuilds.

## Chat A — Footer wordmark centering + float-in reveal (Sep 22, ~11:45 PKT) — built & verified by subagent

Joshua's live-site screenshot showed the giant footer "SniffMySite" wordmark sitting left-aligned instead of centered, and he asked for a float-in effect when scrolled to the bottom.

**Fixes (`components/Footer.tsx`)** — root cause of the misalignment: the wordmark `span` is a block element, so it stretched full width with default left text alignment. Added `text-center` (tracking-tight is near-zero trailing space, so plain centering is optically true — no letter-spacing fudge needed). Added a `useRevealOnce` hook: an IntersectionObserver (threshold 0.25) that floats the wordmark up from `translate-y-10` + `opacity-0` to its rest state over 800ms with a soft `cubic-bezier(0.22,1,0.36,1)` ease — no bounce, no overshoot. The observer disconnects after the first reveal and the `will-change` hint drops off the final frame. `prefers-reduced-motion` users get the wordmark fully visible immediately, no animation. On short pages (footer already in view at load) it simply floats in on mount. CTA block, link columns, disclaimer, and status bar untouched; the wordmark stays a giant home link and scales down via the existing `clamp()` sizing at 360px.

**Verification:** frontend `tsc --noEmit` clean, `vite build` green, API suite **376/376 pass** (untouched). Anti-slop: zero new user-facing strings, no emojis, no new colors, 44px tap targets unchanged, Inspection Lab identity intact.

**Needs Joshua's eyeball (Chromium unavailable in this sandbox):** (1) footer wordmark centered at desktop width; (2) wordmark centered at 360px phone width; (3) scroll to the bottom — the wordmark floats up once and settles (it should NOT re-animate when scrolling back up); (4) with the OS reduced-motion setting on, the wordmark is just there — no animation at all.

**Deliberately NOT done:** dark theme, full mobile QA pass (separate tasks), leaderboard, scoring/tiers, apps/burn, billing, zip rebuilds.

## Chat A — Dark theme (Sep 22, ~11:55 PKT) — built & verified by subagent

Joshua asked for a dark theme with smooth transitions. Strategy: **token remap, not per-component work** — Tailwind v4 utilities compile to `var(--color-*)`, so redefining the tokens under `.dark` flips all ~366 token-based color classes site-wide for free. New components inherit dark mode automatically; never add `dark:` variants.

**Core (`hooks/useTheme.ts`, `components/ThemeToggle.tsx`, `components/Navbar.tsx`, `index.html`, `index.css`)** — the toggle is a 44px sun/moon Lucide button in the navbar's action cluster (always visible, desktop + phone), with `aria-label`/`title` that flip with the theme. Explicit choice persists in `localStorage` (`sniffmysite-theme`); first visit with no stored choice follows the OS `prefers-color-scheme`. A pre-paint inline script in `index.html` sets the `dark` class before first paint — a stored dark theme never flashes white. `color-scheme: light/dark` set on `html`/`.dark` so native form controls and scrollbars follow. Toggling adds a brief `theme-anim` class (~650ms) that eases background/color/border/fill/stroke/box-shadow everywhere — a smooth glide, not a snap; `prefers-reduced-motion` skips the animation entirely (both the glide and the OS-level one).

**Dark palette (Inspection Lab after hours — zero gradients):** paper `#141310`, ink `#f2ede1` (~14:1), ink-soft `#b9b2a2`, ink-faint `#847d6b`, hairline `#2e2a23`, hazard `#ff5c1a` / deep `#e04a10` / ink `#ff8a4d` (~7:1 on dark for stamps), gold `#d9a93c`. The 90-year-old readability floor survives: primary text at ~14:1.

**Everything the token remap couldn't reach (full audit, then fixed):**
- `RosetteBadge.tsx` — tier colors and the inner-disc fill were hardcoded hexes. Now six new `--color-rosette-*` tokens (light + dark values in `index.css`); fills go through inline `style` (not the `fill` attribute) so `var()` resolves in every browser's SVG. Medals brighten on dark instead of turning muddy.
- `index.css` stamps — the four hardcoded ink-black `box-shadow` sets were invisible on dark paper; `.dark` overrides give the stamp a warm light edge (same sizes, same pressed-thud intent).
- `Logo.tsx` — the hazard tip rect now reads `var(--color-hazard)` via style instead of hardcoded `#FF4D00`.
- `SharePopup.tsx` — the card-preview well `bg-white/40` glowed wrong in dark; now `bg-hairline/50`, an inset well in both themes.
- `TurnstileWidget.tsx` — was hardcoded `theme: 'light'`; now follows the theme via `useTheme` and re-renders on toggle (third-party iframe, tokens can't reach it).
- **Deliberately kept:** sponsor creative frames stay `#ffffff` — ad creatives are designed on white; the mat is white by design. Server-generated share-card PNG colors are out of scope (flagged for the parent).

**Verification:** frontend `tsc --noEmit` clean, `vite build` green (`.dark` remap + rosette tokens confirmed present in `dist` CSS), API suite **376/376 pass** (untouched). Anti-slop: no gradients, no ad-hoc colors (all new color values are design tokens in `index.css`), no emojis (Lucide Sun/Moon only), 44px tap target, zero new user-facing strings beyond accessibility labels. The footer wordmark reveal and stamp animations coexist with the theme glide; reduced-motion disables all of it.

**Needs Joshua's eyeball (Chromium unavailable in this sandbox):** (1) the sun/moon toggle in the navbar works and the whole page glides between themes with no snap; (2) reload with dark chosen — no white flash; (3) first visit follows the OS theme; (4) every surface readable in dark mode at phone + desktop widths — landing, scan flow, /compare, /leaderboard, profiles, pricing, share popup, footer, ticker; (5) rosettes crisp and bright in dark mode; (6) reduced-motion on — toggle changes theme instantly with no glide.

**Deliberately NOT done:** full mobile QA pass (separate task — theme simply must not break mobile), algorithm v2, scoring/tiers, apps/burn, billing, zip rebuilds.

## Session — 2026-09-22, mobile/all-device optimization pass (coordinator + 3 workers)

Joshua: "the mobile layout is a bit off, and I need a proper mobile and all-device optimized site." Final sweep over all previous batches (leaderboard visuals, footer wordmark, dark theme), in both themes, at 360/768/1440px widths. Three workers audited in parallel with non-overlapping file sets; coordinator verified. Chromium unavailable in sandbox — audit by layout reasoning against the token system; Joshua has an exact eyeball checklist (below).

**Worker A — Navbar + Landing** (`App.tsx`, `components/ScanBox.tsx`, `components/TrendingBoard.tsx`, `components/JudgingCriteria.tsx`)
- Contrast fixes: compare link + 404 eyebrow + validation errors moved from `text-hazard` (~3.1:1) to `text-hazard-ink` (~5:1 light, ~7.8:1 dark); the compare link also became a real 44px target (`inline-flex`, was inline so min-height was ignored).
- Readability floor: ScanBox "Free forever" line and TrendingBoard meta bumped from `text-[13px]` to `text-sm` (90-year-old bar).
- JudgingCriteria medals: rosette+tier block was a fixed `w-64` that wrapped awkwardly at 360px; now `w-full sm:w-64` — each part gets its own clean line on phones, desktop unchanged.
- Navbar + Ticker audited, no changes: hamburger 44×44, theme toggle 44×44, CTA min-h-44, mobile panel rows min-h-44 and close-on-navigate; ticker can't overflow the page (`overflow: hidden`).

**Worker B — Scan flow + /compare** (`components/MetricBars.tsx`, `components/EvidencePanel.tsx`, `pages/ComparePage.tsx`, `pages/ScanPage.tsx`)
- MetricBars: fixed invalid HTML (`<p>` directly inside `<dl>` — hoisted into a wrapping div; identical visuals).
- EvidencePanel: "Caught red-handed" chips get `min-w-0 max-w-full break-words` — a long unbroken caught phrase can no longer push the panel wider than a 360px screen.
- ComparePage: added a mobile-only (`md:hidden`) hairline divider with a mono uppercase hazard "VS" between the stacked Sniff-off cards (side-by-side grid already stacked on phones); "Where they differ most" rows get `min-w-0` + `break-all` so long hostnames can't cause horizontal scroll.
- ScanPage: score-reveal gap `gap-x-12` → `gap-x-8 md:gap-x-12` — 3-digit score + 128px rosette still wraps via `flex-wrap` at 360px, tighter and more intentional on phones; desktop unchanged.

**Worker C — /leaderboard + profiles + pricing** (`pages/LeaderboardPage.tsx`, `pages/PricingPage.tsx`)
- LeaderboardPage: icon-only "sniff again" link was 16px wide × 44px tall below 400px; added `px-3.5` → full 44×44 target. Row math re-verified at 360px (rank 40 + logo 40 + score 64 + 44px link leaves ~76px for the truncating domain).
- PricingPage: fixed a real horizontal-overflow bug — the `white-space: nowrap` "TEST MODE · NO REAL CHARGE" `.stamp` badge ran ~370px wide on a 312px content box, scrolling the whole page sideways. Fluid `fontSize: clamp(13px, 3.6vw, 1rem)` on the badge only (inline style — `.stamp` is unlayered CSS in index.css that Tailwind utilities can't override; index.css was out of worker scope): 13px on phones (fits), full 16px slam at ≥445px, zero desktop change.
- StartupProfilePage: audited, no changes needed (hero wraps, 128px rosette stacks, history rows wrap, 44px claim/test-again links).
- Tab bar note: code has 3 tabs, not 5; already `overflow-x-auto` + `shrink-0`, handles more without overflow. No tab-logic changes.
- Flag (pre-existing, token-level): `text-ink-faint` on dark paper is ~4.49:1 — right at WCAG AA for small meta text; not changed, noting for a future token pass.
- Footer's giant wordmark (verify-only): at exactly 360px the nowrap clamp computes ~317px vs a 312px content box; `overflow-x-clip` on the footer prevents page scroll, but the "S"/"e" edges may nick slightly. If Joshua spots it: lower the clamp minimum from 2.5rem to ~2.25rem in Footer.tsx.
- Read-only audit of VerifyPage and AdminSponsorsPage: both clean (stacking, break-all, 44px targets).

**Verification:** frontend `tsc --noEmit` clean, `vite build` green, API suite **376/376 pass** (untouched). Anti-slop: no emojis (regex sweep clean), no gradients, tokens only, zero new user-facing strings, Lucide only, 44px targets everywhere, Inspection Lab identity intact. Scoring/tiers/weights, apps/burn, billing, sponsors untouched.

**Needs Joshua's eyeball (post-deploy, each at phone + tablet + desktop, light + dark):**
- Landing: navbar fits one row, hamburger panel stacks full-width, ticker scrolls and pauses on focus, hero stacks (input above button), error text readable, medals list stacks neatly, theme toggle glides with no flash.
- Scan page: loading phases cycle, score counts up, rosette slams in below it, no sideways scroll; error-card buttons thumb-sized.
- /compare: cards stack with the VS divider on phones, sit side by side on tablet/desktop (VS gone); long hostnames don't scroll the page.
- /leaderboard: tab row swipes, rows show rank/logo/domain/score with a tappable sniff-again icon, #1 gold reads in dark mode.
- Profiles: logo + domain wrap, score then medal, history rows stack, share card full width.
- Pricing: TEST MODE stamp fits on screen, no sideways scroll anywhere; cards stack vertically on phones.
- Footer: wordmark centered at all widths, floats in once on scroll to bottom.

**Deliberately NOT done:** algorithm v2, new features, billing/sponsors, zip rebuilds.

## Session — 2026-09-22, scoring algorithm v2 (coordinator)

**What:** six targeted fixes inside the six checks — weights (25/25/15/15/10/10),
tiers, verdict voice, determinism, and `sniff = 100 − vapor` all untouched.
`ALGO_VERSION` bumped to `'v2'`.

**Weakness → fix (all in `packages/api/src/lib/score.ts`):**
1. English-only nose → language guard: pages whose visible text is <50%
   Latin-script letters skip the buzzword/claim/vague checks (metrics read 0),
   remaining weights (social 15 + pricing 10 + freshness 10 = 35) renormalize
   to 100, and `evidence.language_note` = "nose only smells English — hype
   checks skipped".
2. AI-slop blind spot → lexicon gains delve/delves/delving, tapestry,
   furthermore, moreover, "in today's fast-paced", "it's important to note",
   "in the ever-evolving", "digital landscape", "evolving landscape". Bare
   "landscape" deliberately NOT added (legit competitive-landscape copy).
3. "best" false positive → claim pattern changed `/\bbest\b/i` →
   `/\bbest\b(?!\s+practices\b)/i`; "best practices" no longer a grand claim.
4. Pricing fooled by a link → price-signal detection
   (`[$€£¥]\s*\d`, `/mo`/`/month`/`/year`, "per user"/"per seat",
   "free tier"/"free plan"): link+signals → 0; link, no signals → 50;
   no link, signals → 30; sales-only → 75; dev-mitigated → 40; bare → 100.
   `evidence.has_price_signals` recorded.
5. Nav chrome gaming the proof discount → `stripChrome()` removes
   <header>/<nav>/<footer> + nav/menu-classed divs before counting evidence
   links. Discount math (0.5, full at 8) unchanged — it now has to be earned.
6. Freshness punished minimalism → unknown © 30 → 15; curve now
   0yr→0, 1yr→20, 2yr→40, 3+yr→70.

**Leaderboard comparability:** `boardEntryFor` (`packages/api/src/lib/scanlog.ts`)
now computes "Most Improved" delta = latest sniff − oldest sniff **within the
same algo_version** — a v1→v2 formula jump never masquerades as improvement.
Seeds are re-scored at boot, so they are always the current version.

**Fixture audit trail (v1 vapor/sniff → v2), all 20 re-run:**
- anthropic.com 10/90 → 15/85 — /pricing link, no price signals on landing → 50
- apple.com 8/92 → 8/92 — unchanged (real $ prices detected)
- character.ai 53/47 → 52/48 — freshness 30→15 (no © year)
- copy.ai 30/70 → 27/73 — "best practices" fix drops claims 16→5; freshness 25→20
- deepseek.com 0/100 → 14/86 — language guard fired (page ~52% Chinese); judged on social/pricing/freshness only; pricing link, no signals → 50
- elevenlabs.io 28/72 → 32/68 — nav evidence stripped (claim 50→53); pricing 0→50; freshness 30→15
- github.com 12/88 → 10/90 — freshness 30→15
- huggingface.co 19/81 → 18/82 — freshness 50→40 (smoother curve)
- jasper.ai 15/85 → 20/80 — pricing 0→50 · **tier: CERTIFIED REAL → ALMOST REAL**
- linear.app 11/89 → 16/84 — pricing 0→50
- mistral.ai 21/79 → 26/74 — pricing 0→50
- notion.so 10/90 → 15/85 — pricing 0→50
- openai.com 20/80 → 19/81 — freshness 80→70 · **tier: ALMOST REAL → CERTIFIED REAL**
- replit.com 11/89 → 16/84 — pricing 0→50
- runwayml.com 21/79 → 33/67 — nav evidence stripped (claim 34→59); pricing 0→50
- stripe.com 14/86 → 14/86 — unchanged (real prices detected)
- supabase.com 12/88 → 16/84 — pricing 0→50; freshness 30→15
- synthesia.io 29/71 → 37/63 — nav evidence stripped (claim 89→100); pricing 0→50
- vercel.com 30/70 → 34/66 — pricing 0→50; freshness 30→15
- x.ai 12/88 → 17/83 — pricing 0→50
- Tier span still ≥3 (CERTIFIED REAL ×12, ALMOST REAL ×7, SUS ×1) — no flatline.

**Tests:** full API suite **383/383 green** (was 376; +7 new v2 tests: language
guard, best-practices fix, pricing matrix, nav-evidence, freshness curve,
LLM-slop lexicon, same-version Most Improved delta). Frontend `tsc` clean,
`vite build` green. Hand-built `ScoreEvidence` objects in vapor.ts route,
vapor-card/profile/leaderboard tests updated for the two new evidence fields.

**Known display follow-up — BUILT 2026-09-22:** on language-skipped pages the
verdict says "zero hype words" — technically true but the fuller story is in
`evidence.language_note`. ScanPage now surfaces it: a "Lab note" callout with a
Languages icon under the verdict ("nose only smells English — hype checks
skipped. The score above comes from the checks that work in any language.").
Frontend `ScoreEvidence` type gained `language_note` + `has_price_signals`;
tsc clean, vite build green.

## Session 2026-09-23 — Ticker duplicates + compare slow-side UX (Joshua's screenshots)

**Bug 1 — navbar ticker showed every site twice** (discord.com 77 ×2,
ascendai.digital 66 ×2, shopify.com 81 ×2). Root cause: `recordRecentScan()`
unshifted EVERY successful scan onto the ring log with no per-host dedupe.
Fixes:
- `packages/api/src/lib/recent.ts` — `recordRecentScan` now removes any
  existing entry with the same slug before unshifting: the log is "latest
  scan per host, newest first" (RECENT_MAX=15 unchanged). The per-host
  sniff tally still counts every scan (trending board unaffected).
- `apps/vapor/src/components/Ticker.tsx` — defensive client-side dedupe by
  slug (belt and suspenders), plus 20s polling of `fetchRecentScans()` so
  new scans land in the banner without a reload; paused while the tab is
  hidden, one refresh on return (same Page Visibility pattern as
  /leaderboard). Kept: pause on hover/focus, reduced-motion static list,
  hidden when empty, aria-hidden second loop copy.
- `packages/api/src/test/recent.test.ts` — two new tests: re-scan keeps
  ONE entry with the latest score (incl. www-stripping); re-scan bumps its
  host to the front. **Suite 385/385 green** (was 383).

**Bug 2 — compare page: one side "keeps sniffing" while the other finished.**
No logic bug: both sides run independent `scanUrl` promises; the asymmetry
is fetch-time variance (redirect chains etc.). Fix is UX-only:
- `ComparePage.tsx` — new `SlowSideNote`: after ~15s of sniffing, a quiet
  secondary line appears under "Sniffing…": "Still working — some pages
  take a while to answer." (5th-grade plain, lab voice.)
- **Concurrency verified in `packages/api/src/lib/fetch.ts`**: no shared
  in-flight map, no serialization, no cross-request module state (only a
  regex constant at module scope). Concurrent scans are truly independent —
  no code change needed there.
- Timeout safety unchanged: the 60s frontend hard timeout (`requestJson`,
  `apps/vapor/src/lib/api.ts`) aborts the fetch → `ScanApiError
  'request_timeout'` → `toLabError` → the actionable "The tester is taking
  too long" error card with retry. Perpetual "Sniffing…" is impossible.

**Verification:** API suite 385/385, frontend `tsc --noEmit` clean, `vite
build` green, anti-slop sweep clean (no emojis, Lucide only, no new colors,
44px targets untouched). Out of scope untouched: scoring/tiers, billing,
sponsors, dark theme, footer, apps/burn.

**Eyeball checklist for Joshua (post-deploy):** (1) scan the same site
twice → ticker shows it once with the latest score; (2) keep the homepage
open, scan a new site in another tab → it appears in the ticker within
~20s; (3) sniff-off with two slow pages → after ~15s the slow side shows
the "still working" line while the finished side shows its result; (4) no
layout shift in the ticker when it refreshes.

## Session 2026-09-23 — Growth Plan §1: Embeddable "Sniffed" badge (BUILT)

**Goal:** every high-scoring site becomes a billboard + backlink. Highest-leverage of the five growth loops.

**API:**
- `packages/api/src/lib/badge.ts` (new) — `badgeSvg(score, tier)` renders a self-contained 320×112 SVG: paper bg, ink border, tier-color accent bar (the rosette seal doesn't read below ~120px, so the badge leads with a big number + small tier label), score with /100 context, tier name in the tier's color, "SNIFFED BY SNIFFMYSITE" wordmark. System font stack, no external assets, XML-escaped. `notSniffedSvg()` (404: "Not sniffed yet — run a sniff to earn a badge", never a fabricated score), `badSlugSvg()` (400). `resolveBadge()` reads `getProfile(slug)` — the exact same source as the dossier/leaderboard/share card (live journal first, seed fallback) — so the badge always shows the true latest score.
- `routes/vapor.ts` — `GET /api/vapor/badge/:slug.svg`: `Content-Type: image/svg+xml`, `Cache-Control: public, max-age=3600` (scores move slowly; hourly refresh is honest), `Cross-Origin-Resource-Policy: cross-origin` (badges are MEANT to be hotlinked, same reasoning as the share-card PNGs).

**Frontend:**
- `apps/vapor/src/lib/api.ts` — new `badgeUrl(slug)` helper (absolute URL from the configured API base, mirroring `ogCardUrl`; no hardcoded localhost).
- `apps/vapor/src/components/BadgeSnippet.tsx` (new) — "Put it on your site" block: live badge preview (160px), paste-ready snippet `<a href="https://sniffmysite.lol/s/:slug"><img src="…/badge/:slug.svg" alt="SniffMySite score: n/100 — tier"></a>`, copy button (Lucide Copy/Check, 44px tap target, "Copied" feedback, graceful fallback note). Renders ONLY for CERTIFIED REAL / ALMOST REAL (a badge nobody wants to display is dead inventory); returns null for lower tiers.
- Wired into `ScanPage` (after "Spread the word", slug = scanned host minus www) and `StartupProfilePage` (after "Share this score", `profile.slug` already normalized).

**Tests:** `packages/api/src/test/badge.test.ts` — 11 new tests: SVG carries the true score/tier/tier-color/wordmark for CERTIFIED REAL, ALMOST REAL, SUS; self-containment (no external URLs/assets); `resolveBadge` matches the dossier source for a seed host, follows a re-scan (latest wins), 404 "not sniffed yet" with no score, 400 for garbage, www normalization; HTTP-level via ephemeral express: 200 + SVG content type + `Cache-Control: public, max-age=3600` + CORP cross-origin, 404 path keeps headers. **Suite 396/396 green** (was 385). Frontend `tsc` clean, `vite build` green. Anti-slop pass: no emojis, no gradients, Lucide only, 5th-grade copy, roast-the-page voice.

**Out of scope untouched:** growth items 2–5, scoring/tiers, billing, sponsors, dark theme, footer, apps/burn.

**Eyeball checklist for Joshua (post-deploy):** (1) open /api/vapor/badge/apple.com.svg directly → 92 CERTIFIED REAL in gold; (2) /api/vapor/badge/never-sniffed-xyz.test.svg → gray "Not sniffed yet"; (3) scan a CERTIFIED REAL site → "Put it on your site" block appears with a working copy button; (4) scan a SUS-or-lower site → no badge block offered; (5) paste the snippet into a blank HTML page → badge renders, link resolves to the dossier.

## Session 2026-09-23 — Growth Plan §2: Sniff-off challenge links (BUILT)

**Goal:** turn every comparison into two founders' audiences — "I challenge @founder to a sniff-off" posted to X/LinkedIn.

**Frontend only (no API changes):**
- `apps/vapor/src/lib/share.ts` (new) — `buildSniffOffChallenge(origin, hostA, scoreA, hostB, scoreB)`: pure, testable builder returning the pre-written lab-voice text ("I challenged {hostB} to a sniff-off on SniffMySite — {hostA} scored {scoreA}, {hostB} scored {scoreB}. Beat that." — both hosts + both scores), the canonical absolute challenge URL `/compare?a=..&b=..` (origin passed in, mirroring how StartupProfilePage builds absolute URLs via `window.location.origin`), plus X intent and LinkedIn share-offsite hrefs (same intent-link patterns as SharePopup).
- `apps/vapor/src/pages/ComparePage.tsx` —
  - Reads `?a=`/`?b=` via `useSearchParams` on mount (guarded ref, runs once): pre-fills both inputs; if both are valid domains and different (reuses the existing `canonical()` same-page check), auto-runs the sniff-off. Invalid/missing params → the normal form with a friendly error ("That challenge link needs two real web addresses…"), never a wasted scan. Same-page-twice param → the existing friendly same-page error, no scan.
  - New `ChallengeBlock` rendered once both sides land: blockquote preview of the exact post text, "Post to X" (hazard button), "Post to LinkedIn" (ink-outline button), "Copy challenge link" (Copy/Check icons, "Copied" feedback, graceful no-op when clipboard is blocked). 44px tap targets throughout.

**Rules kept:** no emojis (Lucide Copy/Check only), no gradients, 44px targets, Inspection Lab voice, 5th-grade copy, roast pages never people. Each side still counts against the 30/hr budget — budget-honesty copy and rate limiting untouched.

**Verification:** API suite **396/396 green** (frontend-only change, ran to be safe), frontend `tsc --noEmit` clean, `vite build` green. Anti-slop pass: 0 emojis, no new colors, tap targets intact.

**Out of scope untouched:** growth items 1 (done — left alone), 3–5, scoring/tiers, billing, sponsors, dark theme, footer, apps/burn.

**Eyeball checklist for Joshua (post-deploy):** (1) open `/compare?a=stripe.com&b=lemonsqueezy.com` → both inputs pre-fill and the sniff-off auto-runs; (2) open `/compare?a=stripe.com&b=stripe.com` → friendly "same page twice" error, zero scans wasted; (3) finish any sniff-off → the "Throw down the gauntlet" block appears with working X/LinkedIn buttons and copy-link; (4) open the copied link in a fresh tab → the same matchup replays.

## Session 2026-09-23 — Growth Plan §3: Founder claim + score-drop alerts (BUILT)

**Goal:** retention loop + owned email list. Claim your page, get emailed when your score drops. (The rival-passing-you half of §3 is still future work — no comparative alert.)

**API:**
- `packages/api/src/lib/vapor-claim.ts` (extended) — `createClaim(domain, { email?, alerts? })`, backward compatible (one-arg callers unchanged). Email optional: normalized trim+lowercase; garbage → `invalid_email` (never echoes the address). `alerts` defaults true when an email is given. `ClaimRecord` carries `email` + `alertsOptIn`; the idempotent re-claim path updates contact details without rotating the token. On successful `verifyClaim` (both the fresh and the already-verified path) the record's email+opt-in upserts a watchlist entry — token request alone never does.
- `packages/api/src/lib/watchlist.ts` (new) — in-memory Map (normalized domain → `{ email, unsubToken, lastAlertedScore, createdAt }`), deploy seam comment names the future `watchlist` table (domain PK, email, unsub_token, last_alerted_score, created_at). `processScanForWatchlist(finalUrl, result, sendAlert?)`: baseline = the previous scan (scans[1], skipping the just-recorded scan) filtered to the SAME `algo_version` — v1→v2 formula changes never alert (standing constraint). Alerts on ≥10-point drops OR a tier-rank drop (CERTIFIED REAL > ALMOST REAL > SUS > JUST VIBES > CERTIFIED FAKE). One alert per drop event (`lastAlertedScore`); non-qualifying scans reset it to null (recovered — future drops alert fresh). Sender injectable; never throws (errors logged without the address).
- `packages/api/src/lib/resend.ts` (extended) — `sendScoreDropAlert({ to, domain, slug, prevScore, newScore, tier, unsubUrl, siteUrl })`, exactly the existing pattern: loud dev-mode console log when `RESEND_API_KEY` is unset, real Resend POST otherwise. From `SniffMySite <noreply@sniffmysite.lol>` (env-overridable). Dev log shows domain + scores, NEVER the email. Copy: "{domain} dropped to {score}/100 — the nose noticed" / lab voice, roasts the page, one-click unsub line.
- `routes/vapor.ts` — `/scan` hooks the watchlist fire-and-forget AFTER `recordBoardScan`, before `res.json` (baseline = previous scan; handles seed adoption); `/claim` accepts `email`/`alerts`, 400 `invalid_email` with a plain-language detail that never echoes the address; new `GET /api/vapor/watchlist/unsubscribe?token=...` (claim-verify rate-limit bucket) returns calm 200 HTML for real, spent, and missing tokens — domain shown, email never.

**Frontend:**
- `apps/vapor/src/lib/api.ts` — `requestClaimToken(domain, email?, alerts?)`: only sends email when it looks like one; server `invalid_email` still surfaces through `ScanApiError`.
- `apps/vapor/src/pages/VerifyPage.tsx` — Step 1 gains an email input ("Email for score-drop alerts (optional)") + a real `<label>` + `<input type="checkbox">`, DEFAULT CHECKED, with the adjacent plain copy: "Email me if this page's score drops by 10+ points. One email per drop — never spam. Unsubscribe anytime with one click." Garbage email → friendly inline error, no request. Verified phase shows "We'll email you if this page's score drops. One email per drop — unsubscribe anytime." — the address is never rendered from the server.

**Tests:** `packages/api/src/test/watchlist.test.ts` — 30 new tests: 10+ drop alerts once with right domain/scores; 81→79 tier-crossing alerts; 5-point wiggle silence; no duplicate on same-score re-scan; recovery then fresh drop alerts again; v1-baseline/v2-scan silence; gain silence; first-scan-no-baseline silence; unknown domain ignored; malformed URLs; failing sender never throws; store behaviors (normalize, email update preserves bookkeeping, unsubscribe token, harmless unknowns); claim integration (entry only on successful verify + opt-in, not token request; alerts:false → no entry; email default-on; re-claim updates email; lib-level invalid_email); endpoints (POST /claim 400 invalid_email with no echo, response never carries email, unsubscribe stops alerts + calm 200 for spent/missing tokens, no email in HTML). **Suite 426/426 green** (was 396). Frontend `tsc --noEmit` clean, `vite build` green. Anti-slop pass: no emojis, Lucide only, no new colors (theme `accent-hazard`), 44px tap targets, lab voice, 5th-grade copy.

**Out of scope untouched:** growth items 4–5, badge/challenge links (done — left alone), scoring/tiers, billing, sponsors, dark theme, footer, apps/burn, $29 PDF audit.

**Joshua-side (at deploy):** set `RESEND_API_KEY` + verified `RESEND_FROM_EMAIL` (his Resend account, his domain) — until then dev-mode logging, fully testable without it. `PUBLIC_SITE_URL` / optional `PUBLIC_API_URL` drive the dossier + unsubscribe links.

**Eyeball checklist for Joshua (post-deploy):** (1) on /verify for a board-listed domain, enter an email (checkbox stays on) → publish the TXT → check → "It's yours." shows the drop-alerts note; (2) re-scan the domain with a 10+ point drop → dev log shows the alert with the exact copy + dossier/unsub links (or a real email once keys are set); (3) re-scan at the same low score → no second alert; (4) open the unsubscribe link → "You're off the list." page, and the next drop sends nothing; (5) a 5-point drop → silence.

## Session 2026-09-23 — Growth Plan §4: Weekly biggest-movers roundup (BUILT)

**Goal:** a content engine that writes itself — "who gained, who face-planted this week": a page plus copy-paste social text, pull-based on the trailing window (no cron).

**API:**
- `packages/api/src/lib/scanlog.ts` — new `getAllLiveHosts(): LiveHost[]` (copies; the journal's full per-host histories newest-first, previously only reachable as board rows). No behavior change to existing callers.
- `packages/api/src/lib/movers.ts` (new) — `getMovers(window, now)`: hosts with ≥2 scans in the trailing window; per host, in-window scans filtered to the SAME `algo_version` as the latest in-window scan (the Most Improved anchor pattern — a v1→v2 formula jump never appears as a move); `delta = latest − oldest same-version`; zero-delta hosts count as tracked but appear on neither list. Response: `{ window, generated_at, gainers, losers, hosts_tracked, note? }`, each row `{ slug, domain, old_score, new_score, delta, tier, has_profile }`, gainers/losers sorted by |delta| desc, capped at 10/side. Thin window (<5 qualifying hosts) → honest `note`: "Early days — only N sites have two sniffs this week." (+ encouragement line; 30d variant names "the last 30 days"). Seed chapters adopted into the journal count like any scan — same treatment as Most Improved.
- `routes/vapor.ts` — `GET /api/vapor/movers?window=7d|30d` (default 7d; anything else → 400 `invalid_window` with a friendly detail). Same rate-limit bucket as /recent. Host only in every row — no IPs, emails, or full URLs.

**Frontend:**
- `apps/vapor/src/lib/api.ts` — `MoversWindow`, `ApiMoverRow`, `ApiMovers`, `fetchMovers(window)`.
- `apps/vapor/src/pages/MoversPage.tsx` (new, route `/movers` in App.tsx, nav link "Movers" after Leaderboard) — header in lab voice ("A lab formula change never counts as a move"), 7d/30d toggle (aria-pressed, 44px), "Copy the roundup" button (hazard CTA, Copied confirmation), two sections — "Climbing" (TrendingUp) and "Face-plants" (TrendingDown) — rows mirror the leaderboard (rank, SiteLogo, domain, old → new, signed delta chip, rosette, link to `/s/:slug` dossier or `/scan?url=`), honest empty-side lines, the API's thin-data note rendered plainly, a footer line stating the tracked count + same-version rule, loading and error states with retry.
- Roundup post (lab voice, 5th-grade): "This week's biggest movers on SniffMySite:\nClimbing: {domain} up {n} ({old} to {new}).\nFace-plant: {domain} down {n} ({old} to {new}).\nFull board: {origin}/movers" — graceful "Nobody moved. The internet held its breath." when both sides are empty.

**Tests:** `packages/api/src/test/movers.test.ts` — 14 new tests: same-version gating (v1+v2 pair → not tracked), latest-anchor (old v1 chapters ignored when latest is v2), window filtering (7d vs 30d), single-scan never qualifies, |delta| desc ordering + 10/side cap, zero-delta tracked-but-unlisted, thin note (<5, exact copy incl. singular/plural + 30d variant), no note at ≥5, row slug/has_profile, endpoint shape + 7d default + 30d + 400 invalid_window. **Suite 440/440 green** (was 426). Frontend `tsc --noEmit` clean, `vite build` green. Anti-slop pass: no emojis, Lucide only, no new colors/gradients, 44px tap targets, lab voice, 5th-grade copy. (Fixed a `window`-state shadowing bug caught by tsc.)

**Out of scope untouched:** growth items 1–3 (done — left alone), item 5, scoring/tiers, billing, sponsors, dark theme, footer, apps/burn, $29 PDF audit, zip rebuilds.

**Joshua-side:** nothing — works the day it deploys. Weekly posting of the roundup is his social habit, not a feature.

**Eyeball checklist for Joshua (post-deploy):** (1) /movers shows Climbing/Face-plants with correct deltas (re-scan a site twice to seed one); (2) "Copy the roundup" produces postable text with the top gainer/loser + board link; (3) the 7d/30d toggle changes the lists; (4) with little data the honest "Early days — only N sites have two sniffs this week." note shows instead of padded rows.

## Session 2026-09-23 — Growth Plan §5: Roast-my-launch kit (BUILT)

**Goal:** turn launch days (Product Hunt, Hacker News, X) into sniff events — founders submit their launch URL to get publicly sniffed; the drama is the marketing.

**Frontend only — no API surface:**
- `apps/vapor/src/pages/LaunchPage.tsx` (new, route `/launch` in App.tsx) — "Launching? Get publicly sniffed." Three steps in 5th-grade lab voice (paste URL → we sniff it live in front of everyone → post your score, dare the internet to beat it); URL input + "Sniff my launch" CTA navigates to `/#sniff` carrying `{ seedUrl }` in location state, which LandingPage feeds into the existing `scanSeed` → `ScanBox` seeding mechanism (the same one the navbar CTA and leaderboard "sniff again" use); the state is consumed via `history.replaceState` so back/forward/reload never re-seed. ScrollManager already scrolls to `#sniff` on arrival.
- Three copy-paste launch-post templates (Product Hunt, Hacker News "Show HN", X) as bordered copy-button blocks: Lucide Copy/Check, "Copied" feedback for 2s, 44px tap targets, clipboard-failure keeps the button for retry. Blanks the founder fills: {PRODUCT}, {ONE-LINER}, {SCORE}, {LINK}. Voice: confident, self-roasting ("We got sniffed before launch — {SCORE}/100 on SniffMySite. Roast us. {LINK}").
- Honest FAQ: bad score = content (face-plants get shared more; fix, re-sniff, post the comeback); paying never moves a score (links /pricing); scores can't be hidden ("that's the game").
- Nav link "Launch" (after Movers) + footer "Roast my launch" under Founders. Mobile hamburger picks it up automatically.

**Tests:** no new API surface, none added — canonical suite **440/440 green** (unchanged). Frontend `tsc --noEmit` clean, `vite build` green. Anti-slop pass: no emojis, Lucide only, no new colors/gradients, 44px tap targets on every control, lab voice, 5th-grade copy. (Note: invoking `npx vitest run` directly misreports files as failed — the project's `npm test` path is the source of truth.)

**Out of scope untouched:** growth items 1–4 (done — left alone), scoring/tiers, billing, sponsors, dark theme, footer wordmark, apps/burn, $29 PDF audit, zip rebuilds.

**Joshua-side:** runs the first roast-my-launch on his own channels to seed the ritual.

**Eyeball checklist for Joshua (post-deploy):** (1) /launch renders the 3 steps, URL box, 3 templates, and FAQ; (2) paste a URL → "Sniff my launch" lands on / scrolled to the scan box with the URL pre-filled; (3) each "Copy template" copies the exact template text ("Copied" shows); (4) page reads cleanly on a phone (steps stack, template blocks scroll horizontally if long).
