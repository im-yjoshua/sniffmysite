# CHECKLIST.md — BurnRate.lol MVP (§3.13), one task at a time (Chat B)

> Exactly one task is "in progress" at any moment (§0.1). A task is done when
> it builds clean AND passes the anti-slop self-review in PROGRESS.md.
> Shared foundation (§1) is owned by Chat A; this lane consumes it.

- [x] 1. Domain + hosting + Supabase tables — *done 2026-09-20*
  - [x] Supabase: burn.companies, burn.claims, burn.badges, burn.spotlight_auctions, burn.spotlight_bids live (shared foundation SQL 001, verified in Chat A; RLS on, anon read-scoped)
  - [x] Hosting decided (shared): Render free tier (Express API), Cloudflare Pages (frontend)
  - [x] Domain pick — Joshua chose **burn-rate.lol** (Sep 20); purchase is his step, planned for Sep 21. Canonical domain locked in for the build.
  - [ ] Lemon Squeezy seller application submitted (Chat A lane — in review since ~01:45 PKT)
- [x] 2. Design tokens + typography + ticker component — *done 2026-09-20, build green*
- [x] 3. Landing page (hero + top-10 board + ticker) — *done 2026-09-20, build green*
- [x] 4. Submit form + moderation queue — *done 2026-09-20, builds green, 8/8 API tests pass*
- [x] 5. Company pages + live runway countdown — *done 2026-09-20, builds green, 74/74 API tests pass*
- [x] 6. Report card PNG generator + OG images — *done 2026-09-20, builds green, 88/88 API tests pass*
- [x] 7. Claim flow (email + DNS TXT) — *done 2026-09-20, builds green, 100/100 API tests pass*
- [x] 8. Lemon Squeezy products + checkout + webhook — *done 2026-09-20, TEST MODE (live payments wait on LS seller approval), builds green, 201/201 API tests pass*
- [x] 9. Spotlight auction engine + countdown — *done 2026-09-20, builds green, 220/220 API tests pass*
  - Full `/spotlight` page: live countdown to Monday 00:00 UTC, current holder + top bid + minimum next bid, last-20 bid ledger, "Outbid them" → existing checkout; honest empty state
  - `/board` rankings: Highest burn / Shortest runway / Most efficient (defined as lowest burn per employee, undisclosed headcount sorts last); 50/page pagination; new `GET /api/burn/board?sort=`
  - Anti-slop: zero emoji in new UI, countdown reuses company-page pattern
- [x] 10. Rate limiting + Turnstile + security headers — *done 2026-09-20, verified 242/242 API tests*
  - Server side (shared pass): per-IP rate limits on all burn write endpoints (submit 10/hr + honeypot, claim 5/hr, claim-verify 10/hr, report-card 120/hr, checkout 10/hr), Turnstile verified-when-configured, helmet + CORS allowlist + 256kb JSON limit, Turnstile widget wired in SubmitPage + ClaimPage
  - Burn-lane leftovers: shared `setShareCardHeaders()` helper in `packages/api/src/lib/security.ts` — burn report-card PNG now emits `Cross-Origin-Resource-Policy: cross-origin` (the flagged cross-lane hotlink fix, also deduped vapor's OG card route); new `apps/burn/public/_headers` (XFO DENY, nosniff, HSTS, CSP allowing the Turnstile challenge CDN + Turnstile iframe, no unsafe-inline in script-src) shipped to `dist/`; HTTP-level gate tests for burn routes (honeypot → 201 ×12, 429s, Turnstile 400 when configured); dependency audit blocked by sandbox registry policy — deploy-time step documented
- [ ] 11. Launch posts (build-in-public thread)

**Next up: Task 11 (launch posts — build-in-public thread; Joshua's go-ahead needed).**
