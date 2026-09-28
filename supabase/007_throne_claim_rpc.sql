-- ============================================================================
-- 007_throne_claim_rpc.sql — atomic throne claims.
--
-- The old claim() did bid-insert → dethrone → state-update as three
-- separate Supabase round-trips behind an in-process mutex. Two holes:
--   1. A second API instance (or any process restart) could interleave
--      claims — the mutex only serializes one Node process.
--   2. A crash between the bid insert and the state update left a paid
--      buyer permanently uninstalled: the bid row existed, so every
--      redelivered webhook was swallowed as 'duplicate'.
--
-- billing.claim_throne() does the whole claim in ONE transaction behind
-- SELECT ... FOR UPDATE on the singleton row: insert (idempotent on
-- order_id) → retire the previous holder (dethroned, or expired when its
-- 3 days ran out) → install the new holder. Returns 'installed' or
-- 'duplicate'. Run in the Supabase SQL editor AFTER 006. Idempotent.
-- ============================================================================

create or replace function billing.claim_throne(
  p_order_id text,
  p_url text,
  p_domain text,
  p_price_cents integer,
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
  v_cur_status text;
begin
  -- Serialize every throne claim on the singleton row: one transaction,
  -- one lock, no interleaving — across all API instances and restarts.
  select order_id, expires_at
    into v_cur_order, v_cur_expires
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
  text, text, text, integer, integer, text, jsonb, text, timestamptz, timestamptz
) to service_role;
