import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  SPONSOR_PRODUCTS,
  _resetSponsorState,
  applySponsorEvent,
  approveSponsor,
  createPendingSponsor,
  getSponsor,
  isSponsorProductKey,
  listActiveSponsors,
  listSponsors,
  rejectSponsor,
  validateAdvertiser,
  type SponsorWebhookOutcome,
} from '../lib/sponsors.js';
import { creditsFor } from '../lib/billing.js';
import { sponsorsRouter } from '../routes/sponsors.js';

/** Narrow a SponsorWebhookOutcome to its action (asserts handled). */
function handledAction(o: SponsorWebhookOutcome): string {
  assert.equal(o.handled, true);
  if (!o.handled) throw new Error('expected handled outcome');
  return o.action;
}

const T0 = Date.parse('2026-09-20T12:00:00Z');
const DAY = 86_400_000;

const GOOD_INPUT = {
  brand_name: 'Acme Tools',
  image_url: 'https://cdn.acme.tools/banner.png',
  dest_url: 'https://acme.tools/?ref=sniffmysite',
  alt_text: 'Acme Tools — the wrench that ships',
};

function orderEvent(
  eventName: string,
  orderId: string,
  product: string,
  customExtra: Record<string, unknown> = {},
) {
  return {
    meta: {
      event_name: eventName,
      custom_data: {
        product,
        email: 'buyer@example.com',
        ...GOOD_INPUT,
        ...customExtra,
      },
    },
    data: {
      id: orderId,
      attributes: { user_email: 'buyer@example.com' },
    },
  };
}

describe('sponsor catalog', () => {
  it('exposes banner7/banner30 with placeholder prices and the right env vars', () => {
    assert.equal(SPONSOR_PRODUCTS.banner7.priceDisplay, '$19');
    assert.equal(SPONSOR_PRODUCTS.banner7.termDays, 7);
    assert.equal(
      SPONSOR_PRODUCTS.banner7.variantEnv,
      'LEMONSQUEEZY_BANNER7_VARIANT_ID',
    );
    assert.equal(SPONSOR_PRODUCTS.banner30.priceDisplay, '$59');
    assert.equal(SPONSOR_PRODUCTS.banner30.termDays, 30);
    assert.equal(
      SPONSOR_PRODUCTS.banner30.variantEnv,
      'LEMONSQUEEZY_BANNER30_VARIANT_ID',
    );
  });

  it('isSponsorProductKey only matches banner keys', () => {
    assert.equal(isSponsorProductKey('banner7'), true);
    assert.equal(isSponsorProductKey('banner30'), true);
    assert.equal(isSponsorProductKey('rescan'), false);
    assert.equal(isSponsorProductKey('audit'), false);
    assert.equal(isSponsorProductKey('badge'), false);
    assert.equal(isSponsorProductKey(undefined), false);
  });
});

describe('validateAdvertiser', () => {
  it('accepts a clean advertiser input', () => {
    const out = validateAdvertiser(GOOD_INPUT);
    assert.equal(out.ok, true);
    if (out.ok) assert.deepEqual(out.value, GOOD_INPUT);
  });

  it('rejects an http:// image URL', () => {
    const out = validateAdvertiser({
      ...GOOD_INPUT,
      image_url: 'http://cdn.acme.tools/banner.png',
    });
    assert.equal(out.ok, false);
  });

  it('rejects a javascript: destination URL', () => {
    const out = validateAdvertiser({
      ...GOOD_INPUT,
      dest_url: 'javascript:alert(1)',
    });
    assert.equal(out.ok, false);
  });

  it('rejects ftp: and relative URLs', () => {
    assert.equal(
      validateAdvertiser({ ...GOOD_INPUT, image_url: 'ftp://x/y.png' }).ok,
      false,
    );
    assert.equal(
      validateAdvertiser({ ...GOOD_INPUT, dest_url: '/banner.png' }).ok,
      false,
    );
  });

  it('rejects an oversize brand name and oversize alt text', () => {
    assert.equal(
      validateAdvertiser({ ...GOOD_INPUT, brand_name: 'x'.repeat(61) }).ok,
      false,
    );
    assert.equal(
      validateAdvertiser({ ...GOOD_INPUT, alt_text: 'x'.repeat(121) }).ok,
      false,
    );
  });

  it('rejects missing brand_name / alt_text', () => {
    assert.equal(
      validateAdvertiser({ ...GOOD_INPUT, brand_name: '   ' }).ok,
      false,
    );
    assert.equal(
      validateAdvertiser({ ...GOOD_INPUT, alt_text: '' }).ok,
      false,
    );
  });

  it('strips control characters instead of rejecting', () => {
    const out = validateAdvertiser({
      ...GOOD_INPUT,
      brand_name: 'Acme\x00Tools\x1f',
    });
    assert.equal(out.ok, true);
    if (out.ok) assert.equal(out.value.brand_name, 'AcmeTools');
  });
});

describe('sponsor lifecycle (store)', () => {
  beforeEach(() => _resetSponsorState());

  it('new records start pending_approval and are not publicly served', () => {
    const { created, record } = createPendingSponsor(
      GOOD_INPUT,
      'ord_1',
      'buyer@example.com',
      7,
      T0,
    );
    assert.equal(created, true);
    assert.equal(record.status, 'pending_approval');
    assert.equal(record.starts_at, null);
    assert.equal(listActiveSponsors(T0).length, 0);
  });

  it('approve sets the window; served inside, hidden before starts_at and after ends_at', () => {
    const { record } = createPendingSponsor(
      GOOD_INPUT,
      'ord_2',
      'buyer@example.com',
      7,
      T0,
    );
    const approved = approveSponsor(record.id, T0, T0 + 1000);
    assert.ok(approved);
    assert.equal(approved.status, 'approved');
    assert.equal(approved.starts_at, new Date(T0).toISOString());
    assert.equal(approved.ends_at, new Date(T0 + 7 * DAY).toISOString());

    assert.equal(listActiveSponsors(T0 - 1).length, 0); // before window
    const mid = listActiveSponsors(T0 + 3 * DAY);
    assert.equal(mid.length, 1);
    assert.equal(mid[0].brand_name, 'Acme Tools');
    assert.equal(mid[0].image_url, 'https://cdn.acme.tools/banner.png');
    assert.equal(mid[0].dest_url, 'https://acme.tools/?ref=sniffmysite');
    assert.equal(mid[0].alt_text, 'Acme Tools — the wrench that ships');
    assert.equal(listActiveSponsors(T0 + 7 * DAY).length, 0); // expired
  });

  it('approve with an explicit starts_at schedules the window', () => {
    const { record } = createPendingSponsor(
      GOOD_INPUT,
      'ord_3',
      'buyer@example.com',
      30,
      T0,
    );
    approveSponsor(record.id, T0 + 5 * DAY, T0);
    assert.equal(listActiveSponsors(T0 + 4 * DAY).length, 0);
    assert.equal(listActiveSponsors(T0 + 6 * DAY).length, 1);
  });

  it('rejected records are never served', () => {
    const { record } = createPendingSponsor(
      GOOD_INPUT,
      'ord_4',
      'buyer@example.com',
      7,
      T0,
    );
    rejectSponsor(record.id);
    assert.equal(getSponsor(record.id)?.status, 'rejected');
    assert.equal(listActiveSponsors(T0 + DAY).length, 0);
  });

  it('active sponsors sort oldest-first for slot assignment', () => {
    const a = createPendingSponsor(
      { ...GOOD_INPUT, brand_name: 'First' },
      'ord_a',
      'a@example.com',
      7,
      T0,
    );
    const b = createPendingSponsor(
      { ...GOOD_INPUT, brand_name: 'Second' },
      'ord_b',
      'b@example.com',
      7,
      T0 + 1000,
    );
    approveSponsor(a.record.id, T0, T0);
    approveSponsor(b.record.id, T0, T0);
    const active = listActiveSponsors(T0 + DAY);
    assert.equal(active.length, 2);
    assert.equal(active[0].brand_name, 'First');
    assert.equal(active[1].brand_name, 'Second');
  });

  it('public records carry no buyer email or order id', () => {
    const { record } = createPendingSponsor(
      GOOD_INPUT,
      'ord_5',
      'buyer@example.com',
      7,
      T0,
    );
    approveSponsor(record.id, T0, T0);
    const [pub] = listActiveSponsors(T0 + DAY);
    assert.ok(!('buyer_email' in pub));
    assert.ok(!('order_id' in pub));
  });

  it('listSponsors filters by status, newest first', () => {
    const a = createPendingSponsor(GOOD_INPUT, 'ord_x', 'a@x.com', 7, T0);
    createPendingSponsor(GOOD_INPUT, 'ord_y', 'b@x.com', 7, T0 + 1000);
    approveSponsor(a.record.id, T0, T0);
    assert.equal(listSponsors('pending_approval').length, 1);
    assert.equal(listSponsors('approved').length, 1);
    assert.equal(listSponsors('rejected').length, 0);
    assert.equal(listSponsors().length, 2);
  });

  it('approve/reject on unknown ids return null', () => {
    assert.equal(approveSponsor('nope'), null);
    assert.equal(rejectSponsor('nope'), null);
  });
});

describe('applySponsorEvent (webhook grants)', () => {
  beforeEach(() => _resetSponsorState());

  it('order_created creates a pending_approval record with the product term', () => {
    const outcome = applySponsorEvent(orderEvent('order_created', 'ord_10', 'banner7'));
    assert.deepEqual(outcome, { handled: true, action: 'pending_approval' });
    const [rec] = listSponsors();
    assert.equal(rec.status, 'pending_approval');
    assert.equal(rec.term_days, 7);
    assert.equal(rec.buyer_email, 'buyer@example.com');
    assert.equal(rec.brand_name, 'Acme Tools');
    // Pending is never publicly served.
    assert.equal(listActiveSponsors().length, 0);
  });

  it('banner30 grants a 30-day term', () => {
    applySponsorEvent(orderEvent('order_created', 'ord_11', 'banner30'));
    assert.equal(listSponsors()[0].term_days, 30);
  });

  it('is idempotent on the order id — same order twice never double-creates', () => {
    const evt = orderEvent('order_created', 'ord_12', 'banner7');
    assert.equal(handledAction(applySponsorEvent(evt)), 'pending_approval');
    assert.equal(handledAction(applySponsorEvent(evt)), 'duplicate');
    assert.equal(handledAction(applySponsorEvent(evt)), 'duplicate');
    assert.equal(listSponsors().length, 1);
  });

  it('order_refunded marks the record rejected — it can never be served', () => {
    applySponsorEvent(orderEvent('order_created', 'ord_13', 'banner7'));
    const [rec] = listSponsors();
    approveSponsor(rec.id, T0 - DAY, T0); // would otherwise be live
    assert.equal(listActiveSponsors(T0).length, 1);
    const outcome = applySponsorEvent(
      orderEvent('order_refunded', 'ord_13', 'banner7'),
    );
    assert.deepEqual(outcome, { handled: true, action: 'refunded' });
    assert.equal(getSponsor(rec.id)?.status, 'rejected');
    assert.equal(listActiveSponsors(T0).length, 0);
  });

  it('refund of an unknown order is an idempotent no-op', () => {
    const outcome = applySponsorEvent(
      orderEvent('order_refunded', 'ord_unknown', 'banner7'),
    );
    assert.deepEqual(outcome, { handled: true, action: 'refunded' });
    assert.equal(listSponsors().length, 0);
  });

  it('banner events never touch the rescan/audit credit ledger', () => {
    applySponsorEvent(orderEvent('order_created', 'ord_14', 'banner7'));
    applySponsorEvent(orderEvent('order_refunded', 'ord_14', 'banner7'));
    const credits = creditsFor('buyer@example.com');
    assert.equal(credits.products.rescan, 0);
    assert.equal(credits.products.audit, 0);
  });

  it('non-banner products route to unknown_product here (the billing ledger owns them)', () => {
    const outcome = applySponsorEvent(
      orderEvent('order_created', 'ord_15', 'rescan'),
    );
    assert.deepEqual(outcome, { handled: false, reason: 'unknown_product' });
    assert.equal(listSponsors().length, 0);
  });

  it('bad advertiser input fails closed with no record', () => {
    const outcome = applySponsorEvent(
      orderEvent('order_created', 'ord_16', 'banner7', {
        dest_url: 'javascript:alert(1)',
      }),
    );
    assert.deepEqual(outcome, {
      handled: false,
      reason: 'invalid_advertiser_input',
    });
    assert.equal(listSponsors().length, 0);
  });

  it('malformed events and other event names are reported, not crashes', () => {
    assert.deepEqual(applySponsorEvent(null), {
      handled: false,
      reason: 'malformed_event',
    });
    assert.deepEqual(
      applySponsorEvent(orderEvent('subscription_created', 'ord_17', 'banner7')),
      { handled: false, reason: 'ignored:subscription_created' },
    );
  });
});

describe('sponsor HTTP routes', () => {
  let app: Express;
  let server: Server;
  let base: string;
  const OLD_TOKEN = process.env.ADMIN_TOKEN;

  before(async () => {
    process.env.ADMIN_TOKEN = 'test-admin-token-xyz';
    app = express();
    app.use(express.json());
    app.use('/api/vapor', sponsorsRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}/api/vapor`;
  });

  after(async () => {
    if (OLD_TOKEN === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = OLD_TOKEN;
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  beforeEach(() => _resetSponsorState());

  async function req(
    method: string,
    path: string,
    opts: { token?: string; body?: unknown } = {},
  ) {
    const headers: Record<string, string> = {};
    if (opts.token) headers['x-admin-token'] = opts.token;
    const res = await fetch(base + path, {
      method,
      headers: {
        ...headers,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    return { status: res.status, body: (await res.json()) as any };
  }

  it('GET /sponsors serves only approved, in-window sponsors', async () => {
    const { record: pending } = createPendingSponsor(
      GOOD_INPUT,
      'ord_http1',
      'a@example.com',
      7,
      T0,
    );
    void pending;
    const { record } = createPendingSponsor(
      GOOD_INPUT,
      'ord_http2',
      'b@example.com',
      7,
      T0,
    );
    approveSponsor(record.id, T0, T0);

    const { status, body } = await req('GET', '/sponsors');
    assert.equal(status, 200);
    assert.equal(body.sponsors.length, 1);
    assert.equal(body.sponsors[0].brand_name, 'Acme Tools');
    assert.ok(!('buyer_email' in body.sponsors[0]));
    assert.ok(!('order_id' in body.sponsors[0]));
  });

  it('admin routes 401 without the token', async () => {
    assert.equal((await req('GET', '/admin/sponsors')).status, 401);
    assert.equal(
      (await req('GET', '/admin/sponsors', { token: 'wrong' })).status,
      401,
    );
    assert.equal(
      (await req('POST', '/admin/sponsors/x/approve', { token: 'wrong' }))
        .status,
      401,
    );
  });

  it('admin list filters by status with the token', async () => {
    const { record } = createPendingSponsor(
      GOOD_INPUT,
      'ord_http3',
      'a@example.com',
      7,
      T0,
    );
    approveSponsor(record.id, T0, T0);

    const all = await req('GET', '/admin/sponsors', {
      token: 'test-admin-token-xyz',
    });
    assert.equal(all.status, 200);
    assert.equal(all.body.sponsors.length, 1);
    // Admin sees buyer email + order id.
    assert.equal(all.body.sponsors[0].buyer_email, 'a@example.com');
    assert.equal(all.body.sponsors[0].order_id, 'ord_http3');

    const pending = await req('GET', '/admin/sponsors?status=pending_approval', {
      token: 'test-admin-token-xyz',
    });
    assert.equal(pending.body.sponsors.length, 0);
  });

  it('approve starts the window now; reject kills it', async () => {
    const { record } = createPendingSponsor(
      GOOD_INPUT,
      'ord_http4',
      'a@example.com',
      7,
    );
    const ok = await req('POST', `/admin/sponsors/${record.id}/approve`, {
      token: 'test-admin-token-xyz',
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.sponsor.status, 'approved');
    assert.ok(ok.body.sponsor.starts_at);
    assert.ok(ok.body.sponsor.ends_at);
    // Live on the public endpoint now.
    assert.equal((await req('GET', '/sponsors')).body.sponsors.length, 1);

    const bad = await req('POST', '/admin/sponsors/nope/approve', {
      token: 'test-admin-token-xyz',
    });
    assert.equal(bad.status, 404);

    const rejected = await req('POST', `/admin/sponsors/${record.id}/reject`, {
      token: 'test-admin-token-xyz',
    });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.sponsor.status, 'rejected');
    assert.equal((await req('GET', '/sponsors')).body.sponsors.length, 0);
  });

  it('approve accepts an explicit starts_at; garbage 400s', async () => {
    const { record } = createPendingSponsor(
      GOOD_INPUT,
      'ord_http5',
      'a@example.com',
      7,
    );
    const future = new Date(T0 + 10 * DAY).toISOString();
    const ok = await req('POST', `/admin/sponsors/${record.id}/approve`, {
      token: 'test-admin-token-xyz',
      body: { starts_at: future },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.sponsor.starts_at, future);
    // Not yet in window.
    assert.equal((await req('GET', '/sponsors')).body.sponsors.length, 0);

    const bad = await req('POST', `/admin/sponsors/${record.id}/approve`, {
      token: 'test-admin-token-xyz',
      body: { starts_at: 'not-a-date' },
    });
    assert.equal(bad.status, 400);
  });

  it('admin routes 503 when ADMIN_TOKEN is unset on the server', async () => {
    delete process.env.ADMIN_TOKEN;
    try {
      const { status, body } = await req('GET', '/admin/sponsors', {
        token: 'test-admin-token-xyz',
      });
      assert.equal(status, 503);
      assert.equal(body.error, 'admin_not_configured');
    } finally {
      process.env.ADMIN_TOKEN = 'test-admin-token-xyz';
    }
  });

  it('bad status filter 400s', async () => {
    const { status } = await req('GET', '/admin/sponsors?status=bogus', {
      token: 'test-admin-token-xyz',
    });
    assert.equal(status, 400);
  });
});
