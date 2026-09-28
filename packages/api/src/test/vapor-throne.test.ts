import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  memoryThroneStore,
  applyThroneOrderPaid,
  applyThroneOrderRefunded,
  extractOrderCents,
  formatCents,
  THRONE_FLOOR_CENTS,
  THRONE_INCREMENT_CENTS,
  type NewThroneBid,
} from '../lib/throne.js';

function bid(orderId: string, priceCents: number, quotedCents = priceCents): NewThroneBid {
  return {
    order_id: orderId,
    url: 'https://example.com/',
    domain: 'example.com',
    price_cents: priceCents,
    quoted_cents: quotedCents,
    score: 66,
    tier: 'RECRUIT',
    roast: { verdict: 'x', tier: 'RECRUIT', score: 66, scanned_at: 't' },
    buyer_email: null,
  };
}

/** Stub refund client: records calls, simulates Polar reconciliation. */
function fakeRefund(opts?: { fail?: boolean; already?: boolean }) {
  const calls: Array<{ orderId: string; amountCents: number }> = [];
  let refunded = opts?.already ?? false;
  return {
    calls,
    client: {
      alreadyRefunded: async (_orderId: string) => refunded,
      refundOrder: async (orderId: string, amountCents: number) => {
        if (opts?.fail) throw new Error('polar exploded');
        calls.push({ orderId, amountCents });
        refunded = true;
      },
    },
  };
}

const paidEvent = (orderId: string, order: Record<string, unknown>) =>
  ({ ok: true as const, type: 'order.paid' as const, orderId, order });

const fakeScan = () => ({
  finalUrl: 'https://example.com/',
  sniff_score: 66,
  tier: 'RECRUIT',
  verdict: 'Shows promise. Shows fear.',
  scanned_at: new Date().toISOString(),
});

describe('throne store', () => {
  it('starts empty with the $19 floor as the minimum bid', async () => {
    const s = await memoryThroneStore().getStatus();
    assert.equal(s.occupied, false);
    assert.equal(s.holder, null);
    assert.equal(s.min_bid_cents, THRONE_FLOOR_CENTS);
    assert.equal(s.min_bid_cents, 1900);
  });

  it('claim installs a holder and raises the minimum by $3', async () => {
    const store = memoryThroneStore();
    assert.equal(await store.claim(bid('o1', 1900)), 'installed');
    const s = await store.getStatus();
    assert.equal(s.occupied, true);
    assert.equal(s.holder?.domain, 'example.com');
    assert.equal(s.holder?.price_cents, 1900);
    assert.equal(s.min_bid_cents, 1900 + THRONE_INCREMENT_CENTS);
  });

  it('a second claim dethrones the first immediately', async () => {
    const store = memoryThroneStore();
    await store.claim(bid('o1', 1900));
    assert.equal(await store.claim({ ...bid('o2', 2200), domain: 'usurper.com' }), 'installed');
    const s = await store.getStatus();
    assert.equal(s.holder?.order_id, 'o2');
    assert.equal(s.holder?.domain, 'usurper.com');
    assert.equal(s.min_bid_cents, 2500);
    assert.deepEqual(await store.findBid('o1'), { order_id: 'o1', status: 'dethroned' });
  });

  it('is idempotent on the order id', async () => {
    const store = memoryThroneStore();
    await store.claim(bid('o1', 1900));
    assert.equal(await store.claim(bid('o1', 1900)), 'duplicate');
    assert.equal((await store.getStatus()).holder?.order_id, 'o1');
  });

  it('lazily expires a holder past its 3 days', async () => {
    const store = memoryThroneStore();
    const t0 = new Date('2026-09-28T00:00:00Z');
    await store.claim(bid('o1', 1900), t0);
    assert.equal((await store.getStatus(t0)).occupied, true);
    // 3 days + 1 minute later: vacant, price back at the floor.
    const later = new Date(t0.getTime() + 3 * 24 * 60 * 60 * 1000 + 60_000);
    const s = await store.getStatus(later);
    assert.equal(s.occupied, false);
    assert.equal(s.min_bid_cents, THRONE_FLOOR_CENTS);
    assert.deepEqual(await store.findBid('o1'), { order_id: 'o1', status: 'expired' });
  });

  it('refund of the holder vacates the throne and resets the floor', async () => {
    const store = memoryThroneStore();
    await store.claim(bid('o1', 2500));
    assert.equal(await store.vacateOnRefund('o1'), true);
    const s = await store.getStatus();
    assert.equal(s.occupied, false);
    assert.equal(s.min_bid_cents, THRONE_FLOOR_CENTS);
  });

  it('refund of a dethroned bid does not touch the current holder', async () => {
    const store = memoryThroneStore();
    await store.claim(bid('o1', 1900));
    await store.claim({ ...bid('o2', 2200), domain: 'usurper.com' });
    assert.equal(await store.vacateOnRefund('o1'), false);
    const s = await store.getStatus();
    assert.equal(s.occupied, true);
    assert.equal(s.holder?.order_id, 'o2');
    assert.deepEqual(await store.findBid('o1'), { order_id: 'o1', status: 'refunded' });
  });

  it('refund of an unknown order is a no-op', async () => {
    const store = memoryThroneStore();
    assert.equal(await store.vacateOnRefund('nope'), false);
  });
});

describe('extractOrderCents', () => {
  it('prefers the order total', () => {
    assert.equal(extractOrderCents({ total_amount: 2200 }), 2200);
  });
  it('falls back to the quoted metadata price, then the floor', () => {
    assert.equal(
      extractOrderCents({ metadata: { throne_price_cents: '2500' } }),
      2500,
    );
    assert.equal(extractOrderCents({}), THRONE_FLOOR_CENTS);
    assert.equal(extractOrderCents({ total_amount: 'garbage' }), THRONE_FLOOR_CENTS);
  });
});

describe('formatCents', () => {
  it('formats whole and fractional dollars', () => {
    assert.equal(formatCents(1900), '$19');
    assert.equal(formatCents(2250), '$22.50');
  });
});

describe('applyThroneOrderPaid', () => {
  it('fulfills a throne bid: scan → claim → holder installed', async () => {
    const store = memoryThroneStore();
    const outcome = await applyThroneOrderPaid(
      paidEvent('ord_1', {
        metadata: { throne_bid: 'true', website_url: 'example.com' },
        total_amount: 1900,
      }),
      { store, scan: async () => fakeScan(), refund: fakeRefund().client },
    );
    assert.equal(outcome.handled, true);
    if (outcome.handled) assert.equal(outcome.action, 'fulfilled');
    const s = await store.getStatus();
    assert.equal(s.occupied, true);
    assert.equal(s.holder?.domain, 'example.com');
    assert.equal(s.holder?.price_cents, 1900);
  });

  it('is idempotent on redelivery', async () => {
    const store = memoryThroneStore();
    const deps = {
      store,
      scan: async () => fakeScan(),
      refund: fakeRefund().client,
    };
    const event = paidEvent('ord_1', {
      metadata: { throne_bid: 'true', website_url: 'example.com' },
      total_amount: 1900,
    });
    await applyThroneOrderPaid(event, deps);
    const again = await applyThroneOrderPaid(event, deps);
    assert.equal(again.handled, true);
    if (again.handled) assert.equal(again.action, 'duplicate');
  });

  it('rejects a missing URL without retry; retries a failed scan', async () => {
    const store = memoryThroneStore();
    const missing = await applyThroneOrderPaid(
      paidEvent('ord_x', { metadata: { throne_bid: 'true' } }),
      { store, scan: async () => fakeScan(), refund: fakeRefund().client },
    );
    assert.deepEqual(missing, {
      handled: false,
      reason: 'missing_url',
      retryable: false,
    });

    const failed = await applyThroneOrderPaid(
      paidEvent('ord_y', { metadata: { website_url: 'example.com' } }),
      {
        store,
        scan: async () => {
          throw new Error('fetch blew up');
        },
        refund: fakeRefund().client,
      },
    );
    assert.deepEqual(failed, {
      handled: false,
      reason: 'scan_failed',
      retryable: true,
    });
  });
});

describe('applyThroneOrderRefunded', () => {
  it('vacates the throne when the holder refunds', async () => {
    const store = memoryThroneStore();
    await applyThroneOrderPaid(
      paidEvent('ord_1', {
        metadata: { throne_bid: 'true', website_url: 'example.com' },
        total_amount: 1900,
      }),
      { store, scan: async () => fakeScan(), refund: fakeRefund().client },
    );
    const outcome = await applyThroneOrderRefunded('ord_1', { store });
    assert.deepEqual(outcome, { handled: true, action: 'vacated', orderId: 'ord_1' });
    assert.equal((await store.getStatus()).occupied, false);
  });
});

describe('supabaseThroneStore.claim via claim_throne RPC', () => {
  // The RPC is the atomicity guarantee (007): one transaction behind
  // SELECT ... FOR UPDATE. Here we stub the Supabase client and assert the
  // store calls the RPC with the right params and honors its verdicts.
  async function withStubbedClient(
    rpcImpl: (params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>,
    fn: (seen: { params: Record<string, unknown> | null }) => Promise<void>,
  ) {
    const seen: { params: Record<string, unknown> | null } = { params: null };
    const supabaseMod = (await import('../lib/supabase.js')) as Record<string, unknown>;
    const real = supabaseMod.getSupabase;
    const client = {
      schema: (_s: string) => ({
        rpc: async (_fn: string, params: Record<string, unknown>) => {
          seen.params = params;
          return rpcImpl(params);
        },
      }),
    };
    supabaseMod.getSupabase = () => client;
    try {
      await fn(seen);
    } finally {
      supabaseMod.getSupabase = real;
    }
  }

  it("calls billing.claim_throne and returns 'installed'", async () => {
    const { supabaseThroneStore } = await import('../lib/throne.js');
    await withStubbedClient(
      async () => ({ data: 'installed', error: null }),
      async (seen) => {
        const outcome = await supabaseThroneStore().claim(bid('ord_9', 2200));
        assert.equal(outcome, 'installed');
        assert.equal(seen.params?.p_order_id, 'ord_9');
        assert.equal(seen.params?.p_price_cents, 2200);
        assert.equal(seen.params?.p_quoted_cents, 2200);
        assert.equal(seen.params?.p_domain, 'example.com');
        assert.ok(typeof seen.params?.p_now === 'string');
        assert.ok(typeof seen.params?.p_expires_at === 'string');
        assert.ok(
          Date.parse(seen.params.p_expires_at as string) >
            Date.parse(seen.params.p_now as string),
        );
      },
    );
  });

  it("returns 'duplicate' when the RPC reports a redelivery", async () => {
    const { supabaseThroneStore } = await import('../lib/throne.js');
    await withStubbedClient(
      async () => ({ data: 'duplicate', error: null }),
      async () => {
        const outcome = await supabaseThroneStore().claim(bid('ord_9', 2200));
        assert.equal(outcome, 'duplicate');
      },
    );
  });

  it('throws when the RPC fails (Polar redelivers the webhook)', async () => {
    const { supabaseThroneStore } = await import('../lib/throne.js');
    await withStubbedClient(
      async () => ({ data: null, error: new Error('db down') }),
      async () => {
        await assert.rejects(() => supabaseThroneStore().claim(bid('ord_x', 1900)));
      },
    );
  });
});

describe('stale throne bids', () => {
  it("memory store: a quote below the live minimum returns 'stale' and never installs", async () => {
    const store = memoryThroneStore();
    assert.equal(await store.claim(bid('ord_hold', 2500)), 'installed');
    // Throne held at $25 → live minimum $28. A $22 quote is stale.
    assert.equal(await store.claim(bid('ord_stale', 2200, 2200)), 'stale');
    const s = await store.getStatus();
    assert.equal(s.holder?.order_id, 'ord_hold');
    assert.equal(s.min_bid_cents, 2500 + THRONE_INCREMENT_CENTS);
    assert.deepEqual(await store.findBid('ord_stale'), {
      order_id: 'ord_stale',
      status: 'stale',
    });
  });

  it('memory store: a quote exactly at the live minimum still installs', async () => {
    const store = memoryThroneStore();
    assert.equal(await store.claim(bid('ord_hold', 1900)), 'installed');
    assert.equal(await store.claim(bid('ord_new', 2200, 2200)), 'installed');
    assert.equal((await store.getStatus()).holder?.order_id, 'ord_new');
  });

  it('memory store: an expired holder resets the minimum to the floor', async () => {
    const store = memoryThroneStore();
    const past = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    assert.equal(await store.claim(bid('ord_old', 5000), past), 'installed');
    // Holder lapsed 4 days ago → floor quote is fresh, not stale.
    assert.equal(await store.claim(bid('ord_new', 1900, 1900)), 'installed');
    assert.equal((await store.getStatus()).holder?.order_id, 'ord_new');
  });

  it('applyThroneOrderPaid refunds a stale bid in full and keeps the holder', async () => {
    const store = memoryThroneStore();
    await store.claim(bid('ord_hold', 2500));
    const fr = fakeRefund();
    const outcome = await applyThroneOrderPaid(
      paidEvent('ord_stale', {
        metadata: {
          throne_bid: 'true',
          website_url: 'example.com',
          throne_price_cents: '2200',
        },
        total_amount: 2200,
      }),
      { store, scan: async () => fakeScan(), refund: fr.client },
    );
    assert.deepEqual(outcome, {
      handled: true,
      action: 'stale_refunded',
      orderId: 'ord_stale',
      refunded_cents: 2200,
    });
    assert.deepEqual(fr.calls, [{ orderId: 'ord_stale', amountCents: 2200 }]);
    assert.equal((await store.getStatus()).holder?.order_id, 'ord_hold');
    assert.deepEqual(await store.findBid('ord_stale'), {
      order_id: 'ord_stale',
      status: 'stale_refunded',
    });
  });

  it('a redelivered stale webhook reconciles instead of double-refunding', async () => {
    const store = memoryThroneStore();
    await store.claim(bid('ord_hold', 2500));
    const fr = fakeRefund();
    const event = paidEvent('ord_stale', {
      metadata: {
        throne_bid: 'true',
        website_url: 'example.com',
        throne_price_cents: '2200',
      },
      total_amount: 2200,
    });
    const deps = { store, scan: async () => fakeScan(), refund: fr.client };
    await applyThroneOrderPaid(event, deps);
    // Second delivery: Polar already has the refund → no second call.
    const again = await applyThroneOrderPaid(event, deps);
    assert.equal(fr.calls.length, 1);
    if (again.handled) assert.equal(again.action, 'duplicate');
  });

  it('a failed refund is retryable (Polar redelivers)', async () => {
    const store = memoryThroneStore();
    await store.claim(bid('ord_hold', 2500));
    const fr = fakeRefund({ fail: true });
    const outcome = await applyThroneOrderPaid(
      paidEvent('ord_stale', {
        metadata: {
          throne_bid: 'true',
          website_url: 'example.com',
          throne_price_cents: '2200',
        },
        total_amount: 2200,
      }),
      { store, scan: async () => fakeScan(), refund: fr.client },
    );
    assert.deepEqual(outcome, {
      handled: false,
      reason: 'refund_failed',
      retryable: true,
    });
    // Still marked stale — the redelivery will reconcile the refund.
    assert.deepEqual(await store.findBid('ord_stale'), {
      order_id: 'ord_stale',
      status: 'stale',
    });
  });
});

describe('extractQuotedCents', () => {
  it('prefers the metadata quote stamp, then the settled total, then the floor', async () => {
    const { extractQuotedCents } = await import('../lib/throne.js');
    assert.equal(
      extractQuotedCents({
        metadata: { throne_price_cents: '2200' },
        total_amount: 2200,
      }),
      2200,
    );
    assert.equal(extractQuotedCents({ total_amount: 2500 }), 2500);
    assert.equal(extractQuotedCents({}), THRONE_FLOOR_CENTS);
    assert.equal(
      extractQuotedCents({ metadata: { throne_price_cents: 'garbage' } }),
      THRONE_FLOOR_CENTS,
    );
  });
});
