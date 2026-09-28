import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  verifyPolarSignature,
  parsePolarEvent,
  extractWebsiteUrl,
  extractBuyerEmail,
  type HeaderGetter,
} from '../lib/polar.js';

/**
 * Phase A1 tests — Polar Standard Webhooks verification + event parsing.
 * The signer below implements the spec independently (it's the test's
 * oracle, not a copy of lib code): key = base64-DECODED dashboard secret
 * (optional `whsec_` prefix stripped), HMAC-SHA256 over
 * "{id}.{timestamp}.{body}", token "v1,<base64>".
 */

// base64 of 'test_webhook_secret_abc123' — a well-formed dashboard-style secret
const SECRET = 'dGVzdF93ZWJob29rX3NlY3JldF9hYmMxMjM=';

function sign(
  id: string,
  timestamp: string,
  body: string,
  secret: string = SECRET,
): string {
  let keyMaterial = secret;
  if (keyMaterial.startsWith('whsec_')) keyMaterial = keyMaterial.slice('whsec_'.length);
  const key = Buffer.from(keyMaterial, 'base64');
  const digest = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`, 'utf8')
    .digest('base64');
  return `v1,${digest}`;
}

function headersFor(
  id: string,
  timestamp: string,
  signature: string,
): HeaderGetter {
  const map: Record<string, string> = {
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': signature,
  };
  return (name) => map[name];
}

const NOW_MS = 1_758_000_000_000; // fixed "now" for deterministic tests
const TS = String(Math.floor(NOW_MS / 1000)); // current timestamp

describe('verifyPolarSignature', () => {
  it('accepts a correctly signed delivery', () => {
    const body = JSON.stringify({ type: 'order.paid', data: { id: 'ord_1' } });
    const get = headersFor('msg_1', TS, sign('msg_1', TS, body));
    assert.equal(verifyPolarSignature(Buffer.from(body), get, SECRET, NOW_MS), true);
  });

  it('accepts a whsec_-prefixed dashboard secret', () => {
    // Polar dashboard secrets may carry a `whsec_` prefix; the verifier
    // strips it before base64-decoding. Regression test: the old code
    // base64-ENCODED the secret, which 401'd every real Polar delivery.
    const body = JSON.stringify({ type: 'order.paid', data: { id: 'ord_1' } });
    const get = headersFor('msg_1', TS, sign('msg_1', TS, body));
    assert.equal(verifyPolarSignature(Buffer.from(body), get, `whsec_${SECRET}`, NOW_MS), true);
  });

  it('rejects a wrong secret', () => {
    const body = '{"a":1}';
    const get = headersFor('msg_1', TS, sign('msg_1', TS, body, 'other_secret'));
    assert.equal(verifyPolarSignature(Buffer.from(body), get, SECRET, NOW_MS), false);
  });

  it('rejects a tampered body', () => {
    const body = '{"a":1}';
    const tampered = '{"a":2}';
    const get = headersFor('msg_1', TS, sign('msg_1', TS, body));
    assert.equal(verifyPolarSignature(Buffer.from(tampered), get, SECRET, NOW_MS), false);
  });

  it('rejects missing headers', () => {
    const get: HeaderGetter = () => undefined;
    assert.equal(verifyPolarSignature(Buffer.from('{}'), get, SECRET, NOW_MS), false);
  });

  it('rejects a stale timestamp (replay protection)', () => {
    const body = '{"a":1}';
    const oldTs = String(Math.floor(NOW_MS / 1000) - 601);
    const get = headersFor('msg_1', oldTs, sign('msg_1', oldTs, body));
    assert.equal(verifyPolarSignature(Buffer.from(body), get, SECRET, NOW_MS), false);
  });

  it('accepts when one of several rotated signatures matches', () => {
    const body = '{"a":1}';
    const good = sign('msg_1', TS, body);
    const get = headersFor('msg_1', TS, `v1,AAAAAAAAAAAAAAAAAAAAAA ${good}`);
    assert.equal(verifyPolarSignature(Buffer.from(body), get, SECRET, NOW_MS), true);
  });

  it('rejects an empty secret or empty body', () => {
    const body = '{"a":1}';
    const get = headersFor('msg_1', TS, sign('msg_1', TS, body));
    assert.equal(verifyPolarSignature(Buffer.from(body), get, '', NOW_MS), false);
    assert.equal(verifyPolarSignature(Buffer.alloc(0), get, SECRET, NOW_MS), false);
  });
});

describe('parsePolarEvent', () => {
  it('parses order.paid', () => {
    const r = parsePolarEvent({ type: 'order.paid', data: { id: 'ord_1' } });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.type, 'order.paid');
      assert.equal(r.orderId, 'ord_1');
    }
  });

  it('parses order.refunded', () => {
    const r = parsePolarEvent({ type: 'order.refunded', data: { id: 'ord_2' } });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.type, 'order.refunded');
  });

  it('ignores other event types', () => {
    const r = parsePolarEvent({ type: 'checkout.created', data: { id: 'x' } });
    assert.deepEqual(r, { ok: false, reason: 'ignored_event' });
  });

  it('rejects malformed payloads', () => {
    assert.deepEqual(parsePolarEvent(null), { ok: false, reason: 'invalid_payload' });
    assert.deepEqual(parsePolarEvent({ type: 'order.paid' }), {
      ok: false,
      reason: 'invalid_payload',
    });
    assert.deepEqual(parsePolarEvent({ type: 'order.paid', data: { id: '' } }), {
      ok: false,
      reason: 'invalid_payload',
    });
  });
});

describe('extractWebsiteUrl', () => {
  it('reads the website-url custom field and defaults the scheme', () => {
    const r = extractWebsiteUrl({ custom_field_data: { 'website-url': 'acme.com' } });
    assert.deepEqual(r, { ok: true, url: 'https://acme.com/' });
  });

  it('falls back to metadata.website_url for API-created sessions (throne bids)', () => {
    const r = extractWebsiteUrl({ metadata: { website_url: 'bidder.com' } });
    assert.deepEqual(r, { ok: true, url: 'https://bidder.com/' });
  });

  it('prefers the custom field over metadata', () => {
    const r = extractWebsiteUrl({
      custom_field_data: { 'website-url': 'field.com' },
      metadata: { website_url: 'meta.com' },
    });
    assert.deepEqual(r, { ok: true, url: 'https://field.com/' });
  });

  it('keeps an explicit scheme', () => {
    const r = extractWebsiteUrl({
      custom_field_data: { 'website-url': 'http://example.com/page' },
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.ok(r.url.startsWith('http://example.com'));
  });

  it('rejects a missing field', () => {
    assert.deepEqual(extractWebsiteUrl({ custom_field_data: {} }), {
      ok: false,
      reason: 'missing_url',
    });
    assert.deepEqual(extractWebsiteUrl({}), { ok: false, reason: 'missing_url' });
  });

  it('rejects non-http schemes and localhost', () => {
    assert.deepEqual(
      extractWebsiteUrl({ custom_field_data: { 'website-url': 'javascript:alert(1)' } }),
      { ok: false, reason: 'invalid_url' },
    );
    assert.deepEqual(
      extractWebsiteUrl({ custom_field_data: { 'website-url': 'https://localhost:3000' } }),
      { ok: false, reason: 'invalid_url' },
    );
    assert.deepEqual(
      extractWebsiteUrl({ custom_field_data: { 'website-url': 'not a url at all' } }),
      { ok: false, reason: 'invalid_url' },
    );
  });
});

describe('extractBuyerEmail', () => {
  it('reads customer.email, lowercased', () => {
    assert.equal(
      extractBuyerEmail({ customer: { email: 'Buyer@Example.COM' } }),
      'buyer@example.com',
    );
  });

  it('returns null for garbage', () => {
    assert.equal(extractBuyerEmail({}), null);
    assert.equal(extractBuyerEmail({ customer: { email: 'nope' } }), null);
  });
});

describe('polarRefundClient (stale throne bids)', () => {
  function stubFetch(routes: Record<string, unknown>) {
    const calls: string[] = [];
    const fn = (async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${url}`);
      const body = routes[`${method} ${url.split('?')[0]}`] ?? routes[method];
      if (typeof body === 'function') return body(url, init);
      return {
        ok: true,
        status: 200,
        json: async () => body,
      };
    }) as unknown as typeof fetch;
    return { fn, calls };
  }

  it('skips creation when Polar already holds a refund (no double-refund)', async () => {
    const { polarRefundClient } = await import('../lib/polarRefund.js');
    process.env.POLAR_ACCESS_TOKEN = 'test_token';
    const { fn, calls } = stubFetch({
      GET: { items: [{ id: 're_1', status: 'succeeded' }] },
    });
    await polarRefundClient(fn).refundOrder('ord_stale', 2200);
    assert.ok(calls.some((c) => c.startsWith('GET ')));
    assert.ok(!calls.some((c) => c.startsWith('POST ')));
    delete process.env.POLAR_ACCESS_TOKEN;
  });

  it('creates a full refund with reason "other" when none exists', async () => {
    const { polarRefundClient } = await import('../lib/polarRefund.js');
    process.env.POLAR_ACCESS_TOKEN = 'test_token';
    let posted: Record<string, unknown> | null = null;
    const { fn } = stubFetch({
      GET: { items: [] },
      POST: (_url: string, init: { body?: string }) => {
        posted = JSON.parse(init.body ?? '{}');
        return { ok: true, status: 201, json: async () => ({ id: 're_2' }) };
      },
    });
    await polarRefundClient(fn).refundOrder('ord_stale', 2200);
    assert.deepEqual(posted, {
      order_id: 'ord_stale',
      amount: 2200,
      reason: 'other',
      comment:
        'Throne bid went stale: the throne moved past the quoted price while the buyer was paying. Throne not granted — full refund.',
    });
    delete process.env.POLAR_ACCESS_TOKEN;
  });

  it('throws a not-configured error without a token', async () => {
    const {
      polarRefundClient,
      PolarRefundNotConfiguredError,
    } = await import('../lib/polarRefund.js');
    delete process.env.POLAR_ACCESS_TOKEN;
    await assert.rejects(
      () => polarRefundClient(stubFetch({}).fn).refundOrder('ord_x', 100),
      PolarRefundNotConfiguredError,
    );
  });
});

describe('createThroneCheckout', () => {
  it('sends discount codes OFF for throne checkouts', async () => {
    const { createThroneCheckout } = await import('../lib/polarCheckout.js');
    process.env.POLAR_ACCESS_TOKEN = 'test_token';
    process.env.POLAR_THRONE_PRODUCT_ID = 'prod_throne';
    let posted: Record<string, unknown> | null = null;
    const fn = (async (_url: string, init: { body?: string }) => {
      posted = JSON.parse(init.body ?? '{}');
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: 'ch_1', url: 'https://polar.sh/checkout/ch_1' }),
      };
    }) as unknown as typeof fetch;
    const out = await createThroneCheckout('https://example.com/', 2200, fn);
    assert.equal(out.price_cents, 2200);
    assert.equal(out.checkout_id, 'ch_1');
    assert.equal((posted as unknown as Record<string, unknown>)?.allow_discount_codes, false);
    assert.deepEqual(
      (posted as unknown as Record<string, { throne_price_cents: string }>)?.metadata
        ?.throne_price_cents,
      '2200',
    );
    delete process.env.POLAR_ACCESS_TOKEN;
    delete process.env.POLAR_THRONE_PRODUCT_ID;
  });
});
