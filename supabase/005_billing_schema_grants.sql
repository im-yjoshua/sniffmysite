-- ============================================================================
-- 005_billing_schema_grants.sql — grant the API service role access to billing.
--
-- Run this in the Supabase SQL editor (project: vaporrank-burnrate).
--
-- Why this exists: `billing` was created by raw SQL migrations (001/004),
-- and the Data API "Exposed schemas" dashboard toggle alone did NOT grant
-- USAGE on it to the API's role — live symptom 2026-09-28:
--   GET /api/vapor/featured → 500 {"error":"store_unavailable"}
--   Render log: [polar] featured lookup failed
--     { code: '42501', message: 'permission denied for schema billing' }
-- even with `billing` checked under Exposed schemas AND
-- `billing.featured_roasts` checked under Exposed tables.
-- Explicit grants are the deterministic fix. Idempotent — safe to re-run.
-- ============================================================================

grant usage on schema billing to service_role;
grant all on table billing.featured_roasts to service_role;
