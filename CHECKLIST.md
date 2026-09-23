# CHECKLIST.md — SniffMySite MVP (§2.13), one task at a time

> Exactly one task is "in progress" at any moment (§0.1). A task is done when
> it builds clean AND passes the anti-slop self-review in PROGRESS.md.

- [~] 1. Domain + hosting + Supabase project setup — *in progress (parent lane)*
  - [x] Supabase project live (Singapore); foundation SQL applied; 11 tables/views verified; Data API exposes 5/5 schemas, 11/11 tables
  - [x] Hosting decided: Render free tier (API), Cloudflare Pages (frontend)
  - [ ] Domain purchase — sniffmysite.lol availability to be checked at purchase time (vaporrank.lol was available; purchase now on hold pending rename)
  - [ ] Lemon Squeezy seller application submitted
- [x] 2. Design tokens + typography + stamp component — *done 2026-09-20*
- [x] 3. Landing page (hero + leaderboard preview + ticker) — *done 2026-09-20*
- [x] 4. SSRF-safe fetch + scoring engine v1 (unit-tested against 20 known sites) — *done 2026-09-20*
- [x] 5. Scan result page with animated reveal — *done 2026-09-20*
- [x] 6. Leaderboard page (full, sortable) — *done 2026-09-20*
- [x] 7. Startup profile pages + OG share cards — *done 2026-09-20*
- [x] 8. Claim flow (DNS TXT verification) — *done 2026-09-20*
- [x] 9. Lemon Squeezy products + checkout + webhook — *done 2026-09-20 (TEST MODE)*
  - Re-scan $5 + Certified Real audit $29 (plan §2.6), hosted checkout, HMAC webhooks, email-keyed credit ledger, /pricing + priority lane on /scan
  - LIVE BLOCKED until LS seller approval (server 503s without LEMONSQUEEZY_TEST_MODE=true)
- [x] 10. Rate limiting + Turnstile + security headers — *done 2026-09-20*
  - Scan: 10/hr/IP anonymous + Turnstile + real priority lane (60/hr/email, credit spent server-side); leaderboard 300/hr; claim 5/hr; checkout 10/hr; webhook 120/hr; helmet headers; trust proxy for Render
  - Deploy needs: TURNSTILE_SECRET_KEY (Render) + VITE_TURNSTILE_SITE_KEY (Pages) — real keys, test keys are dev-only
- [ ] 11. Launch posts (build-in-public thread)

**Next up: Task 11.**
