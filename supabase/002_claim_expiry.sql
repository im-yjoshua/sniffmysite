-- 002 — claim flow columns (Task 7).
-- NEVER edit 001_foundation.sql; all schema changes land here as new files.
--
-- The founder claim flow (email magic link + DNS TXT) needs:
--   burn.claims.expires_at        — magic links die after 24h
--   burn.claims.claim_email       — the email that claimed (needed to set
--                                  companies.claimed_by_email after DNS proof)
--   burn.claims.verification_token unique — one hash, one lookup
--   burn.companies.claimed_by_email / claimed_at — what Task 8 (Verified
--                                  Burner badge, $9) reads to know who's
--                                  eligible. A claimed company is one whose
--                                  founder proved email + domain ownership.

alter table burn.claims add column expires_at timestamptz;
alter table burn.claims add column claim_email text;

create unique index claims_token_unique on burn.claims (verification_token);

alter table burn.companies add column claimed_by_email text;
alter table burn.companies add column claimed_at timestamptz;
