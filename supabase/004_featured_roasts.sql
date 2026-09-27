-- ============================================================================
-- 004_featured_roasts.sql — Phase A1: Featured Roast fulfillment (Polar).
--
-- Run this in the Supabase SQL editor (project: vaporrank-burnrate).
-- Data API auto-expose stays OFF: the API reads/writes through the
-- service-role server client only. Joshua applies this; the API never
-- runs DDL itself.
--
-- DASHBOARD STEP (required, easy to miss): after applying, go to
-- Project Settings → Data API → Exposed schemas and check `billing`.
-- Table-level toggles do NOTHING unless the schema itself is exposed —
-- without this the API gets `permission denied for schema billing`
-- (seen 2026-09-28: exposed tables alone are ineffective).
-- ============================================================================

create table billing.featured_roasts (
  id          uuid primary key default gen_random_uuid(),
  order_id    text unique not null,          -- Polar order id (idempotency key)
  url         text not null,                 -- final URL after redirects
  slug        text,                           -- bare hostname, e.g. acme.com
  score       int,
  tier        text,                           -- LAUREATE … LION FOOD
  roast       jsonb,                          -- the published roast lines
  buyer_email text,
  paid_at     timestamptz not null default now(),
  expires_at  timestamptz not null,           -- paid_at + 7 days
  status      text not null default 'active' -- active | expired | refunded
);

-- Active-pin lookup: status + expiry, newest first.
create index featured_roasts_active_idx
  on billing.featured_roasts (status, expires_at desc);

alter table billing.featured_roasts enable row level security;
-- No public grants: the Express API uses the service-role key and exposes
-- pins only through GET /api/vapor/featured after validation.
