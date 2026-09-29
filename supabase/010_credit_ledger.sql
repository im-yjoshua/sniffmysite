-- 010_credit_ledger.sql — durable billing entitlement ledger.
--
-- The credit ledger (priority re-scan / audit credits) lived in a
-- process-local Map in lib/billing.ts. Every Render restart (deploys,
-- free-tier sleep) zeroed all paid balances — money taken, nothing
-- delivered — and wiped the webhook idempotency keys, so a redelivery
-- after a restart could double-grant.
--
-- This migration moves the ledger to Postgres with row-locked,
-- idempotent RPCs (same pattern as billing.claim_throne):
--   billing.grant_credits(email, product, credits, order_id)
--     → (granted boolean, credits int); redeliveries are no-ops.
--   billing.consume_credit(email, product)
--     → (ok boolean, remaining int); atomic decrement, never negative.
--   billing.refund_credits(order_id, credits)
--     → boolean; clawback, floored at zero.
--
-- Non-destructive: creates one table + three functions. No existing
-- rows or tables are touched.

create table if not exists billing.credit_ledger (
  email      text not null,
  product    text not null,
  credits    integer not null default 0 check (credits >= 0),
  order_ids  text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (email, product)
);

-- The money table: RLS on, no public policies. The API talks to it with
-- the service-role key, which bypasses RLS; nobody else can read or write
-- balances.
alter table billing.credit_ledger enable row level security;

grant usage on schema billing to service_role;
grant all on table billing.credit_ledger to service_role;

-- Idempotent grant. The INSERT ... ON CONFLICT with the array-membership
-- WHERE makes webhook redelivery a no-op: a repeated order id changes no
-- row, so FOUND is false and we report (granted=false). The loop only
-- repeats in the vanishingly rare lost-insert race, where it re-runs the
-- upsert against the now-existing row.
create or replace function billing.grant_credits(
  p_email text, p_product text, p_credits int, p_order_id text
)
returns table (granted boolean, credits int)
language plpgsql
security definer
set search_path = billing, pg_temp
as $$
declare
  v_credits int;
begin
  loop
    insert into billing.credit_ledger (email, product, credits, order_ids)
    values (p_email, p_product, p_credits, array[p_order_id])
    on conflict (email, product) do update
    set credits   = billing.credit_ledger.credits + p_credits,
        order_ids = array_append(billing.credit_ledger.order_ids, p_order_id),
        updated_at = now()
    where not (billing.credit_ledger.order_ids @> array[p_order_id]);

    if found then
      select c.credits into v_credits
      from billing.credit_ledger c
      where c.email = p_email and c.product = p_product;
      return query select true, v_credits;
    end if;

    -- No row changed: either a duplicate redelivery, or a lost insert race.
    -- Re-check under the loop to tell them apart.
    select c.credits into v_credits
    from billing.credit_ledger c
    where c.email = p_email and c.product = p_product;

    if found then
      -- Row exists and already holds this order → duplicate delivery.
      return query select false, v_credits;
    end if;
    -- Row genuinely missing: a concurrent grant won the insert race; loop
    -- and let the upsert hit the existing row.
  end loop;
end;
$$;

-- Atomic spend. The WHERE credits > 0 makes concurrent consumes safe:
-- exactly one of two racing spends can take the last credit.
create or replace function billing.consume_credit(p_email text, p_product text)
returns table (ok boolean, remaining int)
language plpgsql
security definer
set search_path = billing, pg_temp
as $$
declare
  v_remaining int;
begin
  update billing.credit_ledger
  set credits = credits - 1,
      updated_at = now()
  where email = p_email and product = p_product and credits > 0
  returning credits into v_remaining;

  if found then
    return query select true, v_remaining;
  end if;

  select c.credits into v_remaining
  from billing.credit_ledger c
  where c.email = p_email and c.product = p_product;
  if not found then
    v_remaining := 0;
  end if;
  return query select false, v_remaining;
end;
$$;

-- Clawback for order_refunded. Removes the order id (so a later
-- re-grant of the same order would count as new — matching the old
-- Map behavior) and decrements, floored at zero.
create or replace function billing.refund_credits(p_order_id text, p_credits int)
returns boolean
language plpgsql
security definer
set search_path = billing, pg_temp
as $$
declare
  v_updated int;
begin
  update billing.credit_ledger
  set credits   = greatest(0, credits - p_credits),
      order_ids = array_remove(order_ids, p_order_id),
      updated_at = now()
  where order_ids @> array[p_order_id];

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

grant execute on function billing.grant_credits(text, text, int, text) to service_role;
grant execute on function billing.consume_credit(text, text) to service_role;
grant execute on function billing.refund_credits(text, int) to service_role;
