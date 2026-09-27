import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPolarOrderPaid,
  applyPolarOrderRefunded,
  memoryFeaturedStore,
  type FeaturedStore,
  type PriorityScanFn,
} from '../lib/featured.js';
import type { ParsedPolarEvent } from '../lib/polar.js';

/**
 * Phase A1 tests — Featured Roast fulfillment logic.
 * In-memory store + fake scan: no network, no Supabase.
 */

const NOW = new Date('2026-09-28T12:00:00.000Z');

function paidEvent(orderId: string, websiteUrl: unknown): Extract<ParsedPolarEvent, { ok: true }> {
  return {
    ok: true,
    type: 'order.paid',
    orderId,
    order: {
      id: orderId,
      custom_field_data: { 'website-url': websiteUrl },
      customer: { email: 'buyer@example.com' },
    },
  };
}

const fakeScan: PriorityScanFn = async (url) => ({
  finalUrl: url,
  sniff_score: 42,
  tier: 'JESTER',
  verdict: 'The crowd laughs. Not with you.',
  scanned_at: NOW.toISOString(),
});

let store: FeaturedStore;
beforeEach(() => {
  store = memoryFeaturedStore();
});

describe('applyPolarOrderPaid', () => {
  it('fulfills: scans, stores the roast, pins for 7 days', async () => {
    const out = await applyPolarOrderPaid(paidEvent('ord_1', 'acme.com'), { store, scan: fakeScan }, NOW);
    assert.deepEqual(out, {
      handled: true,
      action: 'fulfilled',
      orderId: 'ord_1',
      slug: 'acme.com',
    });

    const row = await store.findByOrderId('ord_1');
    assert.ok(row);
    assert.equal(row.url, 'https://acme.com/');
    assert.equal(row.score, 42);
    assert.equal(row.tier, 'JESTER');
    assert.equal(row.status, 'active');
    assert.equal(row.buyer_email, 'buyer@example.com');
    assert.deepEqual((row.roast as { verdict: string }).verdict, 'The crowd laughs. Not with you.');
    // 7-day pin, to the millisecond.
    assert.equal(
      row.expires_at,
      new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    );

    const active = await store.getActive(NOW);
    assert.equal(active?.order_id, 'ord_1');
  });

  it('is idempotent: a redelivery does not re-scan or duplicate', async () => {
    let scans = 0;
    const countingScan: PriorityScanFn = async (url) => {
      scans++;
      return fakeScan(url);
    };
    const first = await applyPolarOrderPaid(paidEvent('ord_9', 'acme.com'), { store, scan: countingScan }, NOW);
    const second = await applyPolarOrderPaid(paidEvent('ord_9', 'acme.com'), { store, scan: countingScan }, NOW);
    assert.equal(first.handled, true);
    assert.deepEqual(second, {
      handled: true,
      action: 'duplicate',
      orderId: 'ord_9',
      slug: 'acme.com',
    });
    assert.equal(scans, 1, 'redelivery must not re-run the scan');
  });

  it('rejects a missing/invalid website-url without retry', async () => {
    const missing = await applyPolarOrderPaid(paidEvent('ord_2', ''), { store, scan: fakeScan }, NOW);
    assert.deepEqual(missing, { handled: false, reason: 'missing_url', retryable: false });

    const invalid = await applyPolarOrderPaid(paidEvent('ord_3', 'javascript:alert(1)'), {
      store,
      scan: fakeScan,
    }, NOW);
    assert.deepEqual(invalid, { handled: false, reason: 'invalid_url', retryable: false });

    assert.equal(await store.findByOrderId('ord_2'), null);
    assert.equal(await store.findByOrderId('ord_3'), null);
  });

  it('marks a failed scan as retryable (Polar will redeliver)', async () => {
    const boom: PriorityScanFn = async () => {
      throw new Error('fetch exploded');
    };
    const out = await applyPolarOrderPaid(paidEvent('ord_4', 'acme.com'), { store, scan: boom }, NOW);
    assert.deepEqual(out, { handled: false, reason: 'scan_failed', retryable: true });
    assert.equal(await store.findByOrderId('ord_4'), null);
  });

  it('marks a dead store as retryable', async () => {
    const dead: FeaturedStore = {
      findByOrderId: async () => {
        throw new Error('supabase_not_configured');
      },
      insert: async () => {
        throw new Error('supabase_not_configured');
      },
      revoke: async () => false,
      getActive: async () => null,
    };
    const out = await applyPolarOrderPaid(paidEvent('ord_5', 'acme.com'), { store: dead, scan: fakeScan }, NOW);
    assert.deepEqual(out, { handled: false, reason: 'store_unavailable', retryable: true });
  });
});

describe('applyPolarOrderRefunded', () => {
  it('revokes the pin; the row stays as history', async () => {
    await applyPolarOrderPaid(paidEvent('ord_7', 'acme.com'), { store, scan: fakeScan }, NOW);
    const out = await applyPolarOrderRefunded('ord_7', { store });
    assert.deepEqual(out, { handled: true, action: 'refunded', orderId: 'ord_7' });

    const row = await store.findByOrderId('ord_7');
    assert.equal(row?.status, 'refunded');
    // The pin disappears from the active lookup…
    assert.equal(await store.getActive(NOW), null);
  });

  it('refund of an unknown order is a no-op (not retryable)', async () => {
    const out = await applyPolarOrderRefunded('ord_nope', { store });
    assert.deepEqual(out, { handled: true, action: 'already_gone', orderId: 'ord_nope' });
  });

  it('refund after expiry is still recorded', async () => {
    await applyPolarOrderPaid(paidEvent('ord_8', 'acme.com'), { store, scan: fakeScan }, NOW);
    const out = await applyPolarOrderRefunded('ord_8', { store });
    assert.equal(out.handled, true);
    if (out.handled) assert.equal(out.action, 'refunded');
  });
});
