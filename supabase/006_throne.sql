-- ============================================================================
-- 006_throne.sql — The Throne: auction for the paid spotlight above the
-- standings. Run this in the Supabase SQL editor (project:
-- vaporrank-burnrate). Idempotent — safe to re-run.
--
-- Mechanics (locked 2026-09-28):
--   - Opening bid $19 (1900¢). Each new bid must top the current holder
--     by at least $3 (300¢).
--   - A paid bid takes the throne IMMEDIATELY (dethrones the holder);
--     otherwise the holder keeps it until expires_at (3 days from payment).
--   - A refund vacates the throne and resets the price to the $19 floor.
--   - Money buys the spotlight only — scores and rankings are untouched.
-- ============================================================================

-- Every throne payment, one row. order_id is the idempotency key.
create table if not exists billing.throne_bids (
  id uuid primary key default gen_random_uuid(),
  order_id text unique not null,
  url text not null,
  domain text not null,
  price_cents integer not null check (price_cents > 0),
  score integer,
  tier text,
  roast jsonb,
  buyer_email text,
  paid_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'holding'
    check (status in ('holding', 'dethroned', 'expired', 'refunded'))
);

-- Singleton row (id = 1): who holds the throne right now.
create table if not exists billing.throne_state (
  id integer primary key check (id = 1),
  order_id text unique,
  url text,
  domain text,
  price_cents integer not null default 1900,
  score integer,
  tier text,
  roast jsonb,
  held_since timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into billing.throne_state (id)
values (1)
on conflict (id) do nothing;

-- Same deterministic grants as 005: the API talks to Supabase with the
-- service role, and raw-SQL tables don't inherit dashboard exposure.
grant usage on schema billing to service_role;
grant all on table billing.throne_bids to service_role;
grant all on table billing.throne_state to service_role;
