-- 003 — burn billing columns (Task 8).
-- NEVER edit 001_foundation.sql; all schema changes land here as new files.
--
-- The Lemon Squeezy integration (test mode) needs:
--   burn.companies.report_card_theme — the purchased $4 card skin
--     ('terminal' = default, free). Unpurchased/unknown themes fall back
--     to 'terminal' at render time.
--   burn.badges.ls_order_id        — which order granted the badge, so a
--     refund can claw exactly that badge back.
--   burn.spotlight_bids.ls_order_id — which order placed the bid, so a
--     refund can remove exactly that bid and recompute the auction top.

alter table burn.companies
  add column report_card_theme text not null default 'terminal';

alter table burn.badges
  add column ls_order_id text;

alter table burn.spotlight_bids
  add column ls_order_id text;

create index bids_ls_order_idx on burn.spotlight_bids (ls_order_id);
create index badges_ls_order_idx on burn.badges (ls_order_id);
