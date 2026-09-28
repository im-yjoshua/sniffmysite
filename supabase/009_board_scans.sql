-- 009: persist the live scan journal in Supabase.
--
-- The leaderboard, biggest-movers roundup, startup dossiers, share cards,
-- badges, and the claim gate all read from the live scan journal
-- (packages/api/src/lib/scanlog.ts). That journal was an in-memory Map, so
-- every Render restart wiped every live scan: the board fell back to the 20
-- seed fixtures, dossiers for live-scanned hosts 404'd until re-scanned,
-- and share-card URLs went dead. This table makes the journal durable.
--
-- One row per successful scan (append-only). `result` is the full
-- ScanResult JSONB (verdict, evidence, snapshot hash) so profiles and
-- share cards stay honest for re-scans. The API keeps the latest 100
-- scans per host (see boardStore.ts); older chapters are pruned on write
-- so the table can't grow without bound on the free tier.
--
-- Non-destructive: creates one new table + indexes + one view.
-- No existing data touched.

create table if not exists vapor.board_scans (
  id         bigint generated always as identity primary key,
  domain     text not null,
  result     jsonb not null,
  scanned_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Hot paths: latest scan per host (board, profiles) and trailing-window
-- scans (movers). Both order by scanned_at desc, id desc as tiebreak.
create index if not exists board_scans_domain_scanned_idx
  on vapor.board_scans (domain, scanned_at desc, id desc);
create index if not exists board_scans_scanned_at_idx
  on vapor.board_scans (scanned_at desc);

-- Board bookends: per host, the latest scan plus the oldest scan of EACH
-- algo version. That's everything the board row needs (latest score +
-- delta vs the oldest scan sharing the latest's algo_version) without
-- shipping full per-host histories on every /leaderboard hit. The API
-- filters seed adoption and the same-version anchor in TypeScript
-- (boardEntryForScans), so this view stays a dumb, fast projection.
create or replace view vapor.board_bookends as
with flagged as (
  select
    domain,
    result,
    (row_number() over (
      partition by domain order by scanned_at desc, id desc
    )) = 1 as is_latest,
    (row_number() over (
      partition by domain, result ->> 'algo_version'
      order by scanned_at asc, id asc
    )) = 1 as is_first_in_version
  from vapor.board_scans
)
select domain, result, is_latest, is_first_in_version
from flagged
where is_latest or is_first_in_version;

-- Same deterministic grants as 005: the API talks to Supabase with the
-- service_role key, so it needs schema usage + full table access.
grant usage on schema vapor to service_role;
grant all on table vapor.board_scans to service_role;
grant select on vapor.board_bookends to service_role;
