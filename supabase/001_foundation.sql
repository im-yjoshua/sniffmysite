-- ============================================================================
-- VaporRank + BurnRate.lol — shared foundation schema (v1)
-- Run this in the Supabase SQL editor (one project serves both products).
-- Chat A (VaporRank) builds it first; Chat B (BurnRate) consumes it.
-- ============================================================================

create schema if not exists vapor;
create schema if not exists burn;
create schema if not exists billing;

-- ============================ VAPORRANK ===================================

create table vapor.startups (
  id          uuid primary key default gen_random_uuid(),
  domain      text not null,
  name        text not null,
  logo_url    text,
  claimed_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  constraint startups_domain_unique unique (domain)
);

create table vapor.scans (
  id                uuid primary key default gen_random_uuid(),
  startup_id        uuid not null references vapor.startups(id) on delete cascade,
  vapor_score       smallint not null check (vapor_score between 0 and 100),
  metrics           jsonb not null default '{}'::jsonb,
  algo_version      text not null default 'v1',
  page_snapshot_hash text,
  created_at        timestamptz not null default now()
);
create index scans_startup_created_idx on vapor.scans (startup_id, created_at desc);

create table vapor.claims (
  id                 uuid primary key default gen_random_uuid(),
  startup_id         uuid not null references vapor.startups(id) on delete cascade,
  user_id            uuid references auth.users(id),
  verification_token text not null,
  verified_at        timestamptz,
  created_at         timestamptz not null default now()
);

-- Public ticker feed ("latest sniffs")
create table vapor.events (
  id         uuid primary key default gen_random_uuid(),
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_created_idx on vapor.events (created_at desc);

-- Latest score per startup (drives the Hall of Vapor leaderboard)
create or replace view vapor.latest_scans as
select distinct on (startup_id) *
from vapor.scans
order by startup_id, created_at desc;

-- ============================ BURNRATE ======================================

create table burn.companies (
  id              uuid primary key default gen_random_uuid(),
  domain          text not null,
  name            text not null,
  logo_url        text,
  monthly_burn    numeric(14,2) not null check (monthly_burn >= 0),
  runway_months   numeric(6,2)  check (runway_months >= 0),
  headcount       int           check (headcount >= 0),
  funding_raised  numeric(14,2) check (funding_raised >= 0),
  status          text not null default 'pending'
                  check (status in ('pending','live','rejected')),
  listed_by_email text,
  created_at      timestamptz not null default now(),
  constraint companies_domain_unique unique (domain)
);
create index companies_status_burn_idx on burn.companies (status, monthly_burn desc);

create table burn.claims (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references burn.companies(id) on delete cascade,
  user_id            uuid references auth.users(id),
  verification_token text not null,
  verified_at        timestamptz,
  created_at         timestamptz not null default now()
);

create table burn.badges (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references burn.companies(id) on delete cascade,
  type        text not null default 'verified_burner',
  granted_at  timestamptz not null default now(),
  constraint badges_company_type_unique unique (company_id, type)
);

create table burn.spotlight_auctions (
  id                uuid primary key default gen_random_uuid(),
  week_start        date not null unique,
  current_bid       numeric(10,2) not null default 0,
  current_holder_id uuid references burn.companies(id),
  ends_at           timestamptz not null
);

create table burn.spotlight_bids (
  id          uuid primary key default gen_random_uuid(),
  auction_id  uuid not null references burn.spotlight_auctions(id) on delete cascade,
  company_id  uuid not null references burn.companies(id) on delete cascade,
  amount      numeric(10,2) not null check (amount > 0),
  created_at  timestamptz not null default now()
);
create index bids_auction_amount_idx on burn.spotlight_bids (auction_id, amount desc);

-- ========================= SHARED BILLING ===================================

create table billing.entitlements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id),
  product         text not null,
  -- vapor_rescan | vapor_audit | vapor_spotlight |
  -- burn_badge | burn_spotlight | burn_card_theme
  ref_id          uuid, -- startup_id or company_id, depending on product
  status          text not null default 'active'
                  check (status in ('active','refunded','expired')),
  ls_order_id     text,
  idempotency_key text not null unique,
  created_at      timestamptz not null default now()
);

-- ====================== ROW LEVEL SECURITY ==================================
-- Public reads for leaderboards/tickers. All writes go through the Express
-- API using the service-role key — no anon/authenticated write policies.

alter table vapor.startups  enable row level security;
alter table vapor.scans     enable row level security;
alter table vapor.claims    enable row level security;
alter table vapor.events    enable row level security;
alter table burn.companies  enable row level security;
alter table burn.claims     enable row level security;
alter table burn.badges     enable row level security;
alter table burn.spotlight_auctions enable row level security;
alter table burn.spotlight_bids     enable row level security;
alter table billing.entitlements    enable row level security;

grant usage on schema vapor, burn, billing to anon, authenticated;

grant select on vapor.startups, vapor.scans, vapor.events to anon, authenticated;
grant select on burn.companies, burn.spotlight_auctions, burn.spotlight_bids
  to anon, authenticated;

create policy "public read startups"
  on vapor.startups for select to anon, authenticated using (true);

create policy "public read scans"
  on vapor.scans for select to anon, authenticated using (true);

create policy "public read events"
  on vapor.events for select to anon, authenticated using (true);

-- Only live companies are public; pending/rejected stay hidden (moderation queue)
create policy "public read live companies"
  on burn.companies for select to anon, authenticated using (status = 'live');

create policy "public read auctions"
  on burn.spotlight_auctions for select to anon, authenticated using (true);

create policy "public read bids"
  on burn.spotlight_bids for select to anon, authenticated using (true);
