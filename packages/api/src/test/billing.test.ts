import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  PRODUCTS,
  _resetBillingState,
  applyBillingEvent,
  consumeCredit,
  createLemonCheckout,
  creditsFor,
  grantCredits,
  isBillingTestMode,
  isProductKey,
  LemonApiError,
  verifyWebhookSignature,
} from '../lib/billing.js';

const SECRET = 'whsec_test_123';

function sign(body: Buffer): string {
  return crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

describe('verifyWebhookSignature', () => {
  const body = Buffer.from(JSON.stringify({ hello: 'world' }), 'utf8');

  it('accepts a correct X-Signature', () => {
    assert.equal(verifyWebhookSignature(body, sign(body), SECRET), true);
  });

  it('rejects a tampered signature', () => {
    const bad = sign(body).replace(/^./, sign(body)[0] === 'a' ? 'b' : 'a');
    assert.equal(verifyWebhookSignature(body, bad, SECRET), false);
  });

  it('rejects when the body was modified after signing', () => {
    const other = Buffer.from(JSON.stringify({ hello: 'mars' }), 'utf8');
    assert.equal(verifyWebhookSignature(other, sign(body), SECRET), false);
  });

  it('rejects missing signature, missing secret, and empty body', () => {
    assert.equal(verifyWebhookSignature(body, undefined, SECRET), false);
    assert.equal(verifyWebhookSignature(body, sign(body), undefined), false);
    assert.equal(verifyWebhookSignature(Buffer.alloc(0), sign(body), SECRET), false);
  });

  it('tolerates surrounding whitespace on the header value', () => {
    assert.equal(
      verifyWebhookSignature(body, `  ${sign(body)}\n`, SECRET),
      true,
    );
  });
});

describe('createLemonCheckout', () => {
  it('POSTs the JSON:API checkout payload and returns the hosted URL', async () => {
    let seenUrl = '';
    let seenBody: any;
    let seenHeaders: any;
    const stub = async (url: string, init: any) => {
      seenUrl = url;
      seenHeaders = init.headers;
      seenBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 'ck_123',
            attributes: {
              url: 'https://vaporrank.lemonsqueezy.com/checkout/test',
              expires_at: '2026-09-21T00:00:00Z',
            },
          },
        }),
      };
    };
    const out = await createLemonCheckout(
      {
        variantId: '111',
        storeId: '222',
        apiKey: 'sekret',
        email: 'founder@example.com',
        custom: { product: 'rescan', startup_domain: 'example.com' },
        testMode: true,
      },
      stub,
    );
    assert.equal(seenUrl, 'https://api.lemonsqueezy.com/v1/checkouts');
    assert.equal(seenHeaders.Authorization, 'Bearer sekret');
    assert.equal(seenBody.data.type, 'checkouts');
    assert.equal(seenBody.data.attributes.test_mode, true);
    assert.deepEqual(seenBody.data.attributes.checkout_data, {
      email: 'founder@example.com',
      custom: { product: 'rescan', startup_domain: 'example.com' },
    });
    assert.deepEqual(seenBody.data.relationships.store, {
      data: { type: 'stores', id: '222' },
    });
    assert.deepEqual(seenBody.data.relationships.variant, {
      data: { type: 'variants', id: '111' },
    });
    assert.equal(out.url, 'https://vaporrank.lemonsqueezy.com/checkout/test');
    assert.equal(out.checkoutId, 'ck_123');
  });

  it('throws LemonApiError (never leaking the key) on HTTP errors', async () => {
    const stub = async () => ({ ok: false, status: 401, json: async () => ({}) });
    await assert.rejects(
      () =>
        createLemonCheckout(
          {
            variantId: '1',
            storeId: '2',
            apiKey: 'super-secret-key',
            email: 'a@b.co',
            custom: {},
            testMode: true,
          },
          stub,
        ),
      (e: any) => {
        assert.ok(e instanceof LemonApiError);
        assert.equal(e.status, 401);
        assert.ok(!e.message.includes('super-secret-key'));
        return true;
      },
    );
  });

  it('throws when Lemon Squeezy returns no checkout URL', async () => {
    const stub = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'x', attributes: {} } }),
    });
    await assert.rejects(
      () =>
        createLemonCheckout(
          {
            variantId: '1',
            storeId: '2',
            apiKey: 'k',
            email: 'a@b.co',
            custom: {},
            testMode: true,
          },
          stub,
        ),
      (e: any) => e instanceof LemonApiError,
    );
  });
});

describe('entitlement ledger', () => {
  beforeEach(() => _resetBillingState());

  it('grants are idempotent on the Lemon Squeezy order id', () => {
    const first = grantCredits('Founder@Example.com', 'rescan', 'ord_1');
    assert.equal(first.granted, true);
    assert.equal(first.credits, 1);
    const second = grantCredits('founder@example.com', 'rescan', 'ord_1');
    assert.equal(second.granted, false);
    assert.equal(second.credits, 1);
  });

  it('different orders stack; different products are separate', () => {
    grantCredits('a@b.co', 'rescan', 'ord_1');
    grantCredits('a@b.co', 'rescan', 'ord_2');
    grantCredits('a@b.co', 'audit', 'ord_3');
    const c = creditsFor('A@B.CO');
    assert.deepEqual(c.products, { rescan: 2, audit: 1 });
  });

  it('consume decrements and refuses at zero', () => {
    grantCredits('a@b.co', 'rescan', 'ord_1');
    assert.deepEqual(consumeCredit('a@b.co', 'rescan'), {
      ok: true,
      remaining: 0,
    });
    assert.deepEqual(consumeCredit('a@b.co', 'rescan'), {
      ok: false,
      remaining: 0,
    });
    assert.deepEqual(consumeCredit('nobody@b.co', 'audit'), {
      ok: false,
      remaining: 0,
    });
  });
});

describe('applyBillingEvent', () => {
  beforeEach(() => _resetBillingState());

  const orderCreated = (custom: any, orderId = 'ord_9') => ({
    meta: {
      event_name: 'order_created',
      custom_data: custom,
    },
    data: {
      id: orderId,
      attributes: { user_email: 'fallback@example.com' },
    },
  });

  it('grants credits from custom_data on order_created', () => {
    const out = applyBillingEvent(
      orderCreated({ product: 'rescan', email: 'buyer@example.com' }),
    );
    assert.deepEqual(out, { handled: true, action: 'granted' });
    assert.deepEqual(creditsFor('buyer@example.com').products, {
      rescan: 1,
      audit: 0,
    });
  });

  it('falls back to the order email when custom_data lacks one', () => {
    applyBillingEvent(orderCreated({ product: 'audit' }));
    assert.equal(creditsFor('fallback@example.com').products.audit, 1);
  });

  it('reports duplicates on webhook retries', () => {
    const ev = orderCreated({ product: 'rescan', email: 'x@y.co' }, 'ord_dup');
    assert.deepEqual(applyBillingEvent(ev), {
      handled: true,
      action: 'granted',
    });
    assert.deepEqual(applyBillingEvent(ev), {
      handled: true,
      action: 'duplicate',
    });
    assert.equal(creditsFor('x@y.co').products.rescan, 1);
  });

  it('rejects unknown products, missing emails, and malformed events', () => {
    assert.deepEqual(
      applyBillingEvent(orderCreated({ product: 'moon' })),
      { handled: false, reason: 'unknown_product' },
    );
    assert.deepEqual(
      applyBillingEvent({
        meta: { event_name: 'order_created', custom_data: { product: 'rescan' } },
        data: { id: '1', attributes: {} },
      }),
      { handled: false, reason: 'missing_email' },
    );
    assert.deepEqual(applyBillingEvent({}), {
      handled: false,
      reason: 'malformed_event',
    });
  });

  it('claws the credit back on order_refunded (floored at zero)', () => {
    applyBillingEvent(orderCreated({ product: 'rescan', email: 'r@s.co' }, 'ord_r'));
    consumeCredit('r@s.co', 'rescan'); // spent already — refund can't go negative
    assert.deepEqual(
      applyBillingEvent({
        meta: { event_name: 'order_refunded' },
        data: { id: 'ord_r', attributes: {} },
      }),
      { handled: true, action: 'refunded' },
    );
    assert.equal(creditsFor('r@s.co').products.rescan, 0);
  });

  it('treats unknown refund order ids as an idempotent no-op', () => {
    assert.deepEqual(
      applyBillingEvent({
        meta: { event_name: 'order_refunded' },
        data: { id: 'ord_ghost', attributes: {} },
      }),
      { handled: true, action: 'refunded' },
    );
  });

  it('ignores unrelated events without failing', () => {
    assert.deepEqual(
      applyBillingEvent({
        meta: { event_name: 'subscription_created' },
        data: { id: 'sub_1' },
      }),
      { handled: false, reason: 'ignored:subscription_created' },
    );
  });
});

describe('billing guards and catalog', () => {
  const OLD = process.env.LEMONSQUEEZY_TEST_MODE;
  afterEach(() => {
    if (OLD === undefined) delete process.env.LEMONSQUEEZY_TEST_MODE;
    else process.env.LEMONSQUEEZY_TEST_MODE = OLD;
  });

  it('test mode is only on with the explicit flag', () => {
    delete process.env.LEMONSQUEEZY_TEST_MODE;
    assert.equal(isBillingTestMode(), false);
    process.env.LEMONSQUEEZY_TEST_MODE = 'false';
    assert.equal(isBillingTestMode(), false);
    process.env.LEMONSQUEEZY_TEST_MODE = 'true';
    assert.equal(isBillingTestMode(), true);
  });

  it('the catalog holds the plan §2.6 products at the right prices', () => {
    assert.equal(PRODUCTS.rescan.priceCents, 500);
    assert.equal(PRODUCTS.audit.priceCents, 2900);
    assert.ok(isProductKey('rescan'));
    assert.ok(isProductKey('audit'));
    assert.ok(!isProductKey('spotlight'));
  });
});
