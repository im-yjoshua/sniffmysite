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
 * oracle, not a copy of lib code): key = base64(secret), HMAC-SHA256 over
 * "{id}.{timestamp}.{body}", token "v1,<base64>".
 */

const SECRET = 'test_webhook_secret_abc123';

function sign(
  id: string,
  timestamp: string,
  body: string,
  secret: string = SECRET,
): string {
  const key = Buffer.from(secret, 'utf8').toString('base64');
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
