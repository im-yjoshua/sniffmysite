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

function bid(orderId: string, priceCents: number): NewThroneBid {
  return {
    order_id: orderId,
    url: 'https://example.com/',
    domain: 'example.com',
    price_cents: priceCents,
    score: 66,
    tier: 'RECRUIT',
    roast: { verdict: 'x', tier: 'RECRUIT', score: 66, scanned_at: 't' },
    buyer_email: null,
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
      { store, scan: async () => fakeScan() },
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
      { store, scan: async () => fakeScan() },
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
      { store, scan: async () => fakeScan() },
    );
    const outcome = await applyThroneOrderRefunded('ord_1', { store });
    assert.deepEqual(outcome, { handled: true, action: 'vacated', orderId: 'ord_1' });
    assert.equal((await store.getStatus()).occupied, false);
  });
});
