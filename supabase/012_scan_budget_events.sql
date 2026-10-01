-- 012_scan_budget_events.sql
--
-- Durable backing for the anonymous scan budget (fixes #6).
--
-- The scan budget (30 free scans/hr/IP, +10 per Turnstile solve) lived in
-- process memory, so every Render deploy/sleep reset it. This table is the
-- write-through backing store: the API keeps serving from memory (sync,
-- zero hot-path latency change) and mirrors every scan/grant event here;
-- on boot the API hydrates the in-memory map from the last hour of rows.
--
-- API-only table: RLS enabled, no public policies (service_role bypasses).

create table if not exists vapor.scan_budget_events (
  ip   text        not null,
  kind text        not null check (kind in ('scan', 'grant')),
  at   timestamptz not null default now()
);

create index if not exists scan_budget_events_ip_at
  on vapor.scan_budget_events (ip, at desc);

alter table vapor.scan_budget_events enable row level security;
grant all on table vapor.scan_budget_events to service_role;

-- Housekeeping: rows older than two windows are never read again.
-- The API deletes them opportunistically on boot; this is belt-and-braces.
-- (Run manually if the table ever grows: delete from vapor.scan_budget_events
--  where at < now() - interval '2 hours';)
