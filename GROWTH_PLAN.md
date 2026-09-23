# SniffMySite Growth Plan — the five viral loops

Written Sep 23, 2026. Build order = leverage order. One at a time, each
shipped green before the next starts. Standing constraints apply to all:
no emojis (Lucide only), no purple gradients, 44px tap targets, 5th-grade
copy, Inspection Lab voice, roast the page never people, money never moves
a score/rank.

---

## 1. Embeddable "Sniffed" badge — HIGHEST LEVERAGE

**Goal:** every high-scoring site becomes a billboard. A founder pastes one
snippet on their homepage; it shows their live score and links back to us.

**Scope**
- API: `GET /api/vapor/badge/:slug.svg` — self-contained SVG (no external
  assets), renders current sniff score + tier name in tier colors +
  "Sniffed by SniffMySite". `Cache-Control: public, max-age=3600` (score
  changes are slow; hourly refresh is honest). Unknown slug → 404 SVG
  ("not sniffed yet" — never fabricate a score).
- Snippet generator on ScanPage (after a successful scan) and
  StartupProfilePage: shows the HTML snippet
  `<a href="https://sniffmysite.lol/s/:slug"><img src="…/badge/:slug.svg" alt="Sniff score …"></a>`
  with a copy button. Only offered for CERTIFIED REAL / ALMOST REAL tiers
  (a badge nobody wants to display is dead inventory).
- The badge links to the dossier/scan page — the backlink is the point.

**Files:** `packages/api/src/lib/badge.ts` (new), route in
`routes/vapor.ts`, new `BadgeSnippet.tsx` component, ScanPage,
StartupProfilePage. Tests: score→SVG mapping, 404 behavior, cache header.

**Acceptance:** SVG renders the true live score for 3 tiers; snippet copies
to clipboard; pasting the snippet on a test page shows the badge and the
link resolves; no layout shift on our pages.

**Joshua-side:** nothing. Works the day it deploys.

---

## 2. Sniff-off challenge links

**Goal:** turn every comparison into two founders' audiences. "I challenge
@founder to a sniff-off" posted to X/LinkedIn.

**Scope**
- `ComparePage` reads `?a=` and `?b=` query params on load: pre-fills both
  inputs; if both are valid and different, auto-runs the sniff-off.
- "Challenge" share block on the compare results: share-to-X and
  share-to-LinkedIn intent links + copy-link button, with pre-written text:
  "I challenged {hostB} to a sniff-off on SniffMySite. {hostA} scored {n} —
  beat that." (Lab voice, 5th-grade plain.)
- Canonical share URL form: `/compare?a=stripe.com&b=lemonsqueezy.com`.

**Files:** `ComparePage.tsx`, small share-text helper (new or in
`lib/share.ts`). No API changes.

**Acceptance:** opening a challenge link pre-fills and runs; share text
contains both hosts and both scores; invalid params show the normal form
with a friendly error, never a wasted scan.

**Joshua-side:** nothing.

---

## 3. Founder claim + score-drop alerts

**Goal:** retention loop + owned email list. Claim your page, get emailed
when your score drops or a rival passes you.

**What exists:** DNS-TXT claim flow (`lib/vapor-claim.ts`, 7-day TTL,
board-listed domains only) and Resend email infra (`lib/resend.ts`) with
dev-mode console logging when no API key is set.

**Scope**
- Extend the claim flow: capture an email at claim time (verified via the
  existing magic-link/verify step — no new verification machinery).
- Watchlist: claimed domain → email mapping (in-memory now, Supabase table
  at deploy, same seam as the other stores).
- Drop detection: after every successful scan, compare against the claimed
  host's previous latest score. Alert when: score drops ≥ 10 points, OR tier
  drops a level. (Small wiggles are noise — never email noise.)
- Alert email via the Resend pattern: real send in production, loud
  console log in dev. Copy: plain, lab voice, links to the dossier.
- Unsubscribe: one-click link, no account needed.

**Files:** `lib/vapor-claim.ts` (extend), new `lib/watchlist.ts`,
scan route hook, claim UI on StartupProfilePage, new email template in
`lib/resend.ts` style. Tests: drop threshold logic, no-alert on small
wiggle, unsubscribe.

**Acceptance:** claim → verify → re-scan with a 10+ point drop →
alert queued/sent with correct copy; 5-point drop → silence; unsubscribe
works.

**Joshua-side:** at deploy, set `RESEND_API_KEY` + verified
`RESEND_FROM_EMAIL` (his Resend account, his domain). Until then dev-mode
logging — the feature is fully testable without it.

---

## 4. Weekly biggest-movers roundup

**Goal:** a content engine that writes itself. "Who gained, who face-planted
this week" — a page plus copy-paste social text, every week.

**Scope**
- API: `GET /api/vapor/movers?window=7d` — biggest same-version score
  gainers and losers among hosts with ≥2 scans in the window (the
  same-algo-version rule from Most Improved applies: v1→v2 formula changes
  are never presented as product moves). Honest sample-size note when the
  window is thin ("early days — 12 sites tracked").
- Page `/movers`: the two lists (gainers / face-plants), each row linking
  to the dossier. A "copy the roundup" button producing a pre-written
  social post.
- Cadence is pull-based (the page always shows the trailing 7 days) — no
  cron needed for v1. A scheduled Sunday post is a Joshua-side social
  habit, not a feature.

**Files:** `lib/movers.ts` (new), route, `MoversPage.tsx`, nav link.
Tests: same-version gating, ordering, thin-window honesty copy.

**Acceptance:** two scans of a host a week apart show the delta correctly;
v1 vs v2 scans never appear as movers; thin data shows the honest note.

**Joshua-side:** posts the roundup weekly (his social habit).

---

## 5. Roast-my-launch kit

**Goal:** turn launch days (Product Hunt, Hacker News, X) into sniff events.
Founders submit their launch URL to get publicly sniffed; the drama is the
marketing.

**Scope**
- Page `/launch`: "Launching? Get publicly sniffed." — explains the ritual
  in 3 steps (submit URL → we sniff it live → you post the score), CTA that
  drops the URL into the hero scan box, and copy-paste launch-post
  templates for Product Hunt / Hacker News / X ("We got sniffed before
  launch — {score}/100. Roast us.").
- Mostly content + one CTA; no new API surface. Links into the existing
  scan flow and share cards.

**Files:** `LaunchPage.tsx` (new), route in App.tsx, nav/footer link.
No API changes, no tests beyond the existing page suite.

**Acceptance:** CTA seeds the scan box with the pasted URL; templates copy
cleanly; page reads at 5th-grade level.

**Joshua-side:** runs the first roast-my-launch on his own channels to
seed it.

---

## Explicitly OUT of scope for this plan

- The $29 automated PDF audit (separate product decision, needs Joshua's
  go-ahead — NOT approved).
- Pricing page restructure (agreed it's odd; revisit after these five land
  and there's traffic to convert).
- Paid tiers, API access for developers (later, post-traction).
- Supabase migration of the in-memory stores (deploy-time work, already
  tracked).
