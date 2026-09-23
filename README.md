# VaporRank + BurnRate.lol

Two satirical, pay-to-rank web apps. One shared stack. Zero AI-slop.

- **VaporRank** (`apps/vapor`) — the internet's bullshit detector for AI startups. Paste a URL, get a savage-but-fair Vapor Score, land on the public Hall of Vapor leaderboard.
- **BurnRate.lol** (`apps/burn`, Chat B) — the leaderboard that ranks monthly burn instead of revenue.
- **Shared API** (`packages/api`) — one Express service: `/api/vapor/*`, `/api/burn/*`, `/api/billing/*`.
- **Shared data** — one Supabase project (`supabase/001_foundation.sql`): `vapor.*`, `burn.*`, `billing.*` schemas with RLS.

## Layout

```
vaporrank-burnrate/
├── apps/
│   ├── vapor/            # VaporRank frontend (React + Vite + TS + Tailwind)
│   └── burn/             # BurnRate frontend (built in Chat B)
├── packages/
│   └── api/              # Shared Express API (TypeScript)
├── supabase/
│   └── 001_foundation.sql
├── PROGRESS.md           # build log, per-task self-reviews
└── CHECKLIST.md          # §2.13 / §3.13 MVP checklists
```

## Develop

```bash
npm install
npm run dev:vapor   # VaporRank frontend → http://localhost:5173
npm run dev:api     # Express API → http://localhost:4000
```

Copy `apps/vapor/.env.example` to `apps/vapor/.env` and fill in the Supabase
project values. Never commit `.env`.

## Admin token (sponsor banner approvals)

Set `ADMIN_TOKEN` on the **server only** (Render env var — never in any
`.env` that gets committed, never in frontend source). The `/admin/sponsors`
approval page asks for it once per session and keeps it in that tab's
sessionStorage. All `/api/vapor/admin/*` routes 503 while it is unset, and
401 on a wrong token (constant-time comparison).

## Build

```bash
npm run build   # builds every workspace
```

See `PROGRESS.md` for the per-task build log and anti-slop self-reviews.
