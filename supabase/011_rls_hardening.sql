-- 011_rls_hardening.sql
--
-- Defense-in-depth RLS for tables added after the 001 foundation.
--
-- The access model (unchanged): all writes go through the Express API with
-- the server-side service-role key, which bypasses RLS by design. The anon
-- key keeps ONLY the public-read policies from 001_foundation.sql
-- (leaderboards, live companies, auctions). Tables below are API-only, so
-- they get RLS with NO policies — deny-by-default for anon/authenticated.
--
-- Tables covered:
--   billing.throne_bids, billing.throne_state  (auction state — money-adjacent)
--   vapor.board_scans                           (scan journal)
-- Already covered (no change): billing.featured_roasts (RLS on, no policies,
-- API-only), billing.credit_ledger (RLS on, service_role only, 010),
-- vapor.claims / burn.claims / burn.badges / billing.entitlements (RLS on,
-- no public policies, 001).
--
-- Safe to apply: additive only, changes nothing for the service-role API.
-- The anon key's effective permissions are unchanged (it could not read
-- these tables before either — now that is explicit rather than accidental).

alter table billing.throne_bids  enable row level security;
alter table billing.throne_state enable row level security;
alter table vapor.board_scans    enable row level security;

-- Explicit grants mirror the deny-by-default intent: service_role keeps
-- full access (it bypasses RLS anyway); no grants to anon/authenticated.
grant all on table billing.throne_bids, billing.throne_state to service_role;
grant all on table vapor.board_scans to service_role;
