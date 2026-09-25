# Deploying SniffMySite on Hostinger — runbook

## What we know (Sep 26, 2026)
- Plan: **Premium**, expires 2027-12-07. Plenty of runway.
- hPanel has a **Web Apps** section (left sidebar) — that's where Node.js apps live.
- "Create website → Web App" shows a **lock icon** — click it / open Web Apps to see
  what the lock means (plan restriction vs. just an enable step). Report back.

## Path A — Hostinger runs the Node API (preferred, everything in one place)

### A1. Create the API web app
1. hPanel → Websites → **Web Apps** → create Node.js app for the API.
2. Connect the GitHub repo `im-yjoshua/sniffmysite`, or upload the API folder.
3. Startup: `node packages/api/dist/index.js` (or set the app root to
   `packages/api` and use `node dist/index.js`). **Node >= 20.**
4. Set env vars in the app's dashboard (values are yours — never commit them):
   - `CORS_ORIGIN=https://sniffmysite.lol`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (from your Supabase project)
   - `PUBLIC_SITE_URL=https://sniffmysite.lol`
   - `PUBLIC_API_URL=` ← the public URL Hostinger gives this app (no trailing slash)
   - `TURNSTILE_SECRET_KEY` ← real key from cloudflare.com (bot protection)
   - `CLAIM_DNS_SECRET` ← long random string (generate: `openssl rand -hex 32`)
   - `ADMIN_TOKEN` ← long random string (protects /admin routes)
   - Resend (`RESEND_API_KEY` + verified `RESEND_FROM_EMAIL`): **optional at
     launch** — unset = magic links log to the server console, endpoint still
     works. Add it later when claim emails matter.
   - Leave all `LEMONSQUEEZY_*` unset — billing is test-mode only until Polar.
5. Note the app's public URL. That's your `VITE_API_URL`.

### A2. Deploy the frontend (static files)
1. Rebuild with the real API URL (Vite bakes env in at build time):
   `VITE_API_URL=https://<api-url> npm run build --workspace=@vaporrank/vapor`
   (Keep the existing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — the anon
   key is public-safe by design.)
2. Upload `apps/vapor/dist/*` to `public_html` for sniffmysite.lol
   (or hPanel → Websites → PHP/HTML website → upload).
3. SPA fallback: add `.htaccess` rewrite so `/s/<slug>` and other routes don't 404:
   ```
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule ^ index.html [L]
   </IfModule>
   ```

### A3. Domain
Buy `sniffmysite.lol` in Hostinger → attach to the frontend website.
Same account = DNS is automatic, no manual records.

## Path B — fallback: API on Render free tier
If the Web App lock means Node isn't on your plan:
1. Frontend: same as A2/A3 (static files on Hostinger, domain attached there).
2. API: Render.com → New Web Service → connect `im-yjoshua/sniffmysite` →
   root `packages/api`, build `npm install && npm run build`,
   start `node dist/index.js`, Node 20. Same env vars as A1, with
   `CORS_ORIGIN=https://sniffmysite.lol` and `PUBLIC_API_URL=<render url>`.
3. Keep-alive: cron-job.org → ping `<render url>/health` every 10 min
   (`*/10 * * * *`). **Ping `/health` only** — never the scan endpoint
   (it would pollute the leaderboard/ticker).
4. Frontend rebuild: `VITE_API_URL=<render url>`.

## Smoke test after deploy
- `GET <api>/health` → `{"status":"ok",...}`
- Open `https://sniffmysite.lol` → run a scan → share card PNG renders.
- Post one scan from your phone (real user path).

## Pre-verified Sep 26, 2026
- `apps/vapor` production build: PASS (`tsc && vite build`, 1720 modules).
- `packages/api` production build: PASS (`tsc`, `dist/index.js` + fonts).
  The `dist/` in the repo right now was built with `VITE_API_URL=localhost`
  (dev) — **rebuild the frontend with the real API URL before uploading.**
