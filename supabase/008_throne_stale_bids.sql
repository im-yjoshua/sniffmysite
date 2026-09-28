-- ============================================================================
-- 008_throne_stale_bids.sql — reject stale quotes, refund them automatically.
--
-- The +$3 rule was enforced when a checkout was CREATED, but the throne
-- could move between quote and payment: a $22 quote paid after a rival
-- took the throne at $25 would steal it back, visibly breaking the
-- auction's own rule.
--
-- New policy (locked 2026-09-28): the staleness check runs INSIDE the
-- atomic claim transaction, against the live minimum at the moment of
-- payment. A stale quote is never installed and never dethrones anyone:
-- its bid row is recorded as 'stale' and the API refunds it in full via
-- Polar's refund API (reconciling first, so redeliveries can't
-- double-refund). Nobody's money is ever kept for nothing.
--
--   1. Widen the bid status check to include 'stale' / 'stale_refunded'.
--   2. Replace billing.claim_throne with a version that takes the quoted
--      price and returns 'stale' when the quote fell below the live
--      minimum (holder price + $3, or the $19 floor when vacant/expired).
--
-- Run in the Supabase SQL editor AFTER 007. Idempotent.
-- ============================================================================

-- 1. New bid states.
alter table billing.throne_bids
  drop constraint if exists throne_bids_status_check;
alter table billing.throne_bids
  add constraint throne_bids_status_check
  check (status in (
    'holding', 'dethroned', 'expired', 'refunded',
    'stale', 'stale_refunded'
  ));

-- 2. Atomic claim with an in-transaction staleness check.
-- Drop the 007 signature first: CREATE OR REPLACE only replaces an
-- identical signature, otherwise it would leave a stale overload behind.
drop function if exists billing.claim_throne(
  text, text, text, integer, integer, text, jsonb, text, timestamptz, timestamptz
);

create or replace function billing.claim_throne(
  p_order_id text,
  p_url text,
  p_domain text,
  p_price_cents integer,
  p_quoted_cents integer,
  p_score integer,
  p_tier text,
  p_roast jsonb,
  p_buyer_email text,
  p_now timestamptz,
  p_expires_at timestamptz
)
returns text
language plpgsql
as $$
declare
  v_cur_order text;
  v_cur_expires timestamptz;
  v_cur_price integer;
  v_cur_status text;
  v_live_min integer;
  v_holder_live boolean;
begin
  -- Serialize every throne claim on the singleton row: one transaction,
  -- one lock, no interleaving — across all API instances and restarts.
  select order_id, expires_at, price_cents
    into v_cur_order, v_cur_expires, v_cur_price
    from billing.throne_state
   where id = 1
     for update;

  -- Idempotency on the Polar order id: a redelivered webhook is a
  -- duplicate, never a double install.
  insert into billing.throne_bids
    (order_id, url, domain, price_cents, score, tier, roast,
     buyer_email, paid_at, expires_at, status)
  values
    (p_order_id, p_url, p_domain, p_price_cents, p_score, p_tier, p_roast,
     p_buyer_email, p_now, p_expires_at, 'holding')
  on conflict (order_id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  -- The live minimum bid at THIS moment, inside the lock: the holder's
  -- price + $3 while they hold it, the $19 floor when vacant or expired.
  -- (Locked 2026-09-28: floor 1900¢, increment 300¢ — mirrors the API.)
  v_holder_live := v_cur_order is not null
               and v_cur_expires is not null
               and v_cur_expires > p_now;
  if v_holder_live then
    v_live_min := v_cur_price + 300;
  else
    v_live_min := 1900;
  end if;

  -- Stale quote: the throne moved past this bid while the buyer was on
  -- Polar's checkout page. Record it as stale (redeliveries reconcile
  -- instead of re-deciding) — never installed, never dethrones anyone.
  -- The API refunds it in full.
  if p_quoted_cents < v_live_min then
    update billing.throne_bids
       set status = 'stale'
     where order_id = p_order_id;
    return 'stale';
  end if;

  -- Retire the previous holder: dethroned when beaten, expired when its
  -- 3 days ran out (lazy expiry, no cron needed).
  if v_cur_order is not null then
    select status into v_cur_status
      from billing.throne_bids
     where order_id = v_cur_order;
    if v_cur_status = 'holding' then
      update billing.throne_bids
         set status = case
                        when v_cur_expires is not null and v_cur_expires <= p_now
                        then 'expired'
                        else 'dethroned'
                      end
       where order_id = v_cur_order;
    end if;
  end if;

  -- Install the new holder.
  update billing.throne_state
     set order_id = p_order_id,
         url = p_url,
         domain = p_domain,
         price_cents = p_price_cents,
         score = p_score,
         tier = p_tier,
         roast = p_roast,
         held_since = p_now,
         expires_at = p_expires_at,
         updated_at = p_now
   where id = 1;

  return 'installed';
end;
$$;

grant execute on function billing.claim_throne(
  text, text, text, integer, integer, integer, text, jsonb, text, timestamptz, timestamptz
) to service_role;
