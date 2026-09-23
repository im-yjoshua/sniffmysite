/**
 * Task 10 security tests: rate limiting, Turnstile, priority lane, headers.
 *
 * The scan tests run against the sandbox's sinkholed DNS: every "real" scan
 * returns 403 ssrf_blocked (the guard correctly refuses the bogus 198.18.x.x
 * answers). That is fine here — the budget, Turnstile grant, and priority
 * logic all run BEFORE the fetch, so 403s still exercise them.
 * A 403 means "passed the gates"; only 429/402 mean a gate fired.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { vaporRouter } from '../routes/vapor';
import { burnRouter } from '../routes/burn';
import { billingRouter } from '../routes/billing';
import { rateLimit, setShareCardHeaders } from '../lib/security';
import { _resetRateLimits } from '../lib/ratelimit';
import { _resetScanBudgets } from '../lib/scan-budget';
import {
  grantCredits,
  creditsFor,
  _resetBillingState,
} from '../lib/billing';

const SCAN_URL = 'https://example.com';

describe('rateLimit middleware', () => {
  let base: string;
  let server: Server;

  before(async () => {
    const app = express();
    app.get('/tiny', rateLimit('test-tiny', 2, 60_000), (_req, res) =>
      res.json({ ok: true }),
    );
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });

  after(
    async () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  );

  beforeEach(() => _resetRateLimits());

  it('allows hits under the limit, then 429s with a plain-English payload', async () => {
    assert.equal((await fetch(`${base}/tiny`)).status, 200);
    assert.equal((await fetch(`${base}/tiny`)).status, 200);
    const r = await fetch(`${base}/tiny`);
    assert.equal(r.status, 429);
    assert.ok(r.headers.get('retry-after'), 'Retry-After header present');
    const body = (await r.json()) as any;
    assert.equal(body.error, 'rate_limited');
    assert.ok(
      typeof body.detail === 'string' && body.detail.length > 10,
      'detail is plain language, not a code',
    );
  });
});

describe('POST /api/vapor/scan — Task 10 gates', () => {
  let app: Express;
  let server: Server;
  let base: string;

  before(async () => {
    app = express();
    // Mirror index.ts: trust proxy so req.ip is the client.
    app.set('trust proxy', 1);
    app.use(express.json({ limit: '256kb' }));
    app.use('/api/vapor', vaporRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}/api/vapor/scan`;
  });

  after(
    async () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  );

  beforeEach(() => {
    _resetRateLimits();
    _resetScanBudgets();
    _resetBillingState();
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  async function scan(body: any) {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON */
    }
    return { status: res.status, body: json };
  }

  it('anonymous scans get 30 free per hour; the 31st → 429 with turnstile_required', async () => {
    // Secret set so the budget's 429 is observable (dev auto-grants).
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    try {
      for (let i = 0; i < 30; i++) {
        const { status } = await scan({ url: SCAN_URL });
        assert.equal(status, 403, `scan ${i + 1} should pass the gates (403 = sandbox DNS)`);
      }
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: SCAN_URL }),
      });
      assert.equal(res.status, 429);
      assert.ok(res.headers.get('retry-after'), 'Retry-After header present');
      const body = (await res.json()) as any;
      assert.equal(body.error, 'rate_limited');
      assert.equal(body.turnstile_required, true, 'frontend flag present');
      assert.ok(
        typeof body.detail === 'string' && /30 free/.test(body.detail),
        'detail names the free budget in plain language',
      );
    } finally {
      delete process.env.TURNSTILE_SECRET_KEY;
    }
  });

  it('a fresh Turnstile solve grants 10 more scans; every further 10 needs another solve', async () => {
    // Secret set → grants need a real verification. The stub mimics
    // Cloudflare: each token verifies once; a repeat is a duplicate.
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    const realFetch = globalThis.fetch;
    const seen = new Set<string>();
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url).includes('challenges.cloudflare.com')) {
        const token = String(new URLSearchParams(init?.body).get('response'));
        if (seen.has(token)) {
          return { ok: true, json: async () => ({ success: false }) } as any;
        }
        seen.add(token);
        return { ok: true, json: async () => ({ success: true }) } as any;
      }
      return realFetch(url, init);
    }) as typeof fetch;
    try {
      for (let i = 0; i < 30; i++) {
        assert.equal((await scan({ url: SCAN_URL })).status, 403);
      }
      // Over budget, no token → 429 + flag.
      const denied = await scan({ url: SCAN_URL });
      assert.equal(denied.status, 429);
      assert.equal(denied.body.turnstile_required, true);

      // Fresh solve → grant: scans 31–40 pass with no further friction.
      assert.equal((await scan({ url: SCAN_URL, turnstile_token: 'tok-1' })).status, 403);
      for (let i = 0; i < 9; i++) {
        assert.equal((await scan({ url: SCAN_URL })).status, 403, `granted scan ${32 + i}`);
      }

      // 41st: over again. Reusing tok-1 is rejected (single-use tokens).
      const reused = await scan({ url: SCAN_URL, turnstile_token: 'tok-1' });
      assert.equal(reused.status, 429);
      assert.equal(reused.body.turnstile_required, true);

      // A second fresh solve grants the next 10.
      assert.equal((await scan({ url: SCAN_URL, turnstile_token: 'tok-2' })).status, 403);
      for (let i = 0; i < 9; i++) {
        assert.equal((await scan({ url: SCAN_URL })).status, 403, `second-grant scan ${42 + i}`);
      }
      const third = await scan({ url: SCAN_URL });
      assert.equal(third.status, 429, '51st scan needs a third solve');
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.TURNSTILE_SECRET_KEY;
    }
  });

  it('dev (no secret): over-budget scans auto-grant — local dev never bricks', async () => {
    // No TURNSTILE_SECRET_KEY → verifyTurnstile warns + passes.
    for (let i = 0; i < 30; i++) {
      assert.equal((await scan({ url: SCAN_URL })).status, 403);
    }
    // 31st with no token at all: auto-granted in dev.
    assert.equal((await scan({ url: SCAN_URL })).status, 403);
    for (let i = 0; i < 9; i++) {
      assert.equal((await scan({ url: SCAN_URL })).status, 403);
    }
    // 41st: auto-grants again.
    assert.equal((await scan({ url: SCAN_URL })).status, 403);
  });

  it('the priority lane never touches the IP budget', async () => {
    // Secret set so the anonymous budget's 429 is observable (dev auto-grants).
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    try {
      const email = 'founder@budget.test';
      grantCredits(email, 'rescan', 'order-1');

      // Spend the whole anonymous budget.
      for (let i = 0; i < 30; i++) {
        assert.equal((await scan({ url: SCAN_URL })).status, 403);
      }
      assert.equal((await scan({ url: SCAN_URL })).status, 429);

      // A priority scan still works on its own lane…
      const p = await scan({ url: SCAN_URL, priority_email: email });
      assert.equal(p.status, 403, 'passed the gates (403 = sandbox DNS)');
      assert.equal(creditsFor(email).products.rescan, 0, 'one credit spent');

      // …and it granted the anonymous budget nothing.
      const still = await scan({ url: SCAN_URL });
      assert.equal(still.status, 429);
      assert.equal(still.body.turnstile_required, true);
    } finally {
      delete process.env.TURNSTILE_SECRET_KEY;
    }
  });

  it('the priority lane skips the anonymous bucket and spends one credit per scan', async () => {
    const email = 'founder@priority.test';
    grantCredits(email, 'rescan', 'order-1');
    grantCredits(email, 'rescan', 'order-2');
    grantCredits(email, 'rescan', 'order-3');

    // 15 priority scans: none may 429 (anonymous bucket is untouched).
    for (let i = 0; i < 15; i++) {
      const { status, body } = await scan({
        url: SCAN_URL,
        priority_email: email,
      });
      if (i < 3) {
        assert.equal(status, 403, `priority scan ${i + 1} should pass the gates`);
      } else {
        assert.equal(status, 402, 'out of credits after 3 scans');
        assert.equal(body.error, 'no_credits');
      }
    }
    assert.equal(
      creditsFor(email).products.rescan,
      0,
      'exactly 3 credits consumed',
    );
  });

  it('priority_email with no credits → 402, never touches the free bucket', async () => {
    // Secret set so the anonymous budget's 429 is observable (dev auto-grants).
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    try {
      const { status, body } = await scan({
        url: SCAN_URL,
        priority_email: 'broke@priority.test',
      });
      assert.equal(status, 402);
      assert.equal(body.error, 'no_credits');
      // The anonymous budget is untouched: 30 free scans still available.
      for (let i = 0; i < 30; i++) {
        assert.equal((await scan({ url: SCAN_URL })).status, 403);
      }
      const over = await scan({ url: SCAN_URL });
      assert.equal(over.status, 429);
      assert.equal(over.body.turnstile_required, true);
    } finally {
      delete process.env.TURNSTILE_SECRET_KEY;
    }
  });

  it('priority_email must be a valid email → 400 otherwise', async () => {
    const { status, body } = await scan({
      url: SCAN_URL,
      priority_email: 'not-an-email',
    });
    assert.equal(status, 400);
    assert.equal(body.error, 'invalid_email');
  });

  it('Turnstile is only demanded past the free budget; dev skip when unset', async () => {
    // Secret unset → no token needed, even past the budget (dev auto-grant).
    for (let i = 0; i < 31; i++) {
      assert.equal((await scan({ url: SCAN_URL })).status, 403);
    }

    // Secret set → under-budget scans still need no token…
    _resetScanBudgets();
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url).includes('challenges.cloudflare.com')) {
        return { ok: true, json: async () => ({ success: true }) } as any;
      }
      return realFetch(url, init);
    }) as typeof fetch;
    try {
      assert.equal((await scan({ url: SCAN_URL })).status, 403);

      // …but a failed verification past the budget stays a 429, not a grant.
      for (let i = 0; i < 29; i++) {
        assert.equal((await scan({ url: SCAN_URL })).status, 403);
      }
      globalThis.fetch = (async (url: any, init: any) => {
        if (String(url).includes('challenges.cloudflare.com')) {
          return { ok: true, json: async () => ({ success: false }) } as any;
        }
        return realFetch(url, init);
      }) as typeof fetch;
      const { status, body } = await scan({
        url: SCAN_URL,
        turnstile_token: 'bad-tok',
      });
      assert.equal(status, 429);
      assert.equal(body.turnstile_required, true);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.TURNSTILE_SECRET_KEY;
    }
  });
});

describe('rate limits on read/write endpoints', () => {
  let server: Server;
  let base: string;

  before(async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json({ limit: '256kb' }));
    app.use('/api/vapor', vaporRouter);
    app.use('/api/billing', billingRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });

  after(
    async () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  );

  beforeEach(() => {
    _resetRateLimits();
    _resetBillingState();
  });

  it('GET /api/vapor/leaderboard: 300/hr, then 429', async () => {
    for (let i = 0; i < 300; i++) {
      const r = await fetch(`${base}/api/vapor/leaderboard`);
      assert.equal(r.status, 200, `leaderboard hit ${i + 1}`);
    }
    const r = await fetch(`${base}/api/vapor/leaderboard`);
    assert.equal(r.status, 429);
    assert.equal(((await r.json()) as any).error, 'rate_limited');
  });

  it('POST /api/vapor/claim: 5/hr, then 429', async () => {
    const post = () =>
      fetch(`${base}/api/vapor/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'stripe.com' }),
      });
    for (let i = 0; i < 5; i++) {
      assert.equal((await post()).status, 200, `claim ${i + 1}`);
    }
    assert.equal((await post()).status, 429);
  });

  it('POST /api/billing/checkout: 10/hr, then 429', async () => {
    const post = () =>
      fetch(`${base}/api/billing/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product: 'rescan', email: 'a@b.co' }),
      });
    for (let i = 0; i < 10; i++) {
      const s = (await post()).status;
      assert.ok(s === 503, `checkout ${i + 1} → 503 unconfigured, got ${s}`);
    }
    assert.equal((await post()).status, 429);
  });

  it('POST /api/billing/webhook: 120/hr, then 429 (before signature check)', async () => {
    const post = () =>
      fetch(`${base}/api/billing/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
    for (let i = 0; i < 120; i++) {
      const s = (await post()).status;
      assert.ok(s === 503, `webhook ${i + 1} → 503 unconfigured, got ${s}`);
    }
    assert.equal((await post()).status, 429);
  });
});

describe('security headers (helmet)', () => {
  let server: Server;
  let base: string;

  before(async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet());
    app.use(express.json({ limit: '256kb' }));
    app.use('/api/vapor', vaporRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });

  after(
    async () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  );

  it('JSON responses carry the full helmet header set', async () => {
    const r = await fetch(`${base}/api/vapor/leaderboard`);
    assert.equal(r.status, 200);
    const h = r.headers;
    assert.equal(h.get('x-content-type-options'), 'nosniff');
    assert.equal(h.get('x-frame-options'), 'SAMEORIGIN');
    assert.ok(
      (h.get('content-security-policy') ?? '').includes("default-src 'self'"),
      'CSP default-src self',
    );
    assert.ok(h.get('strict-transport-security'), 'HSTS present');
    assert.ok(h.get('referrer-policy'), 'Referrer-Policy present');
    assert.equal(h.get('x-powered-by'), null, 'X-Powered-By removed');
    assert.equal(
      h.get('cross-origin-resource-policy'),
      'same-origin',
      'default CORP is same-origin',
    );
  });

  it('the OG share-card PNG keeps CORP: cross-origin (hotlinkable)', async () => {
    const r = await fetch(`${base}/api/vapor/og/character.ai.png`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/png');
    assert.equal(
      r.headers.get('cross-origin-resource-policy'),
      'cross-origin',
      'route-level override survives helmet',
    );
  });
});

describe('setShareCardHeaders — public card PNG headers', () => {
  const fakeRes = () => {
    const headers: Record<string, string> = {};
    return {
      headers,
      setHeader: (k: string, v: string) => {
        headers[k.toLowerCase()] = v;
      },
    };
  };
  const call = (etag: string, maxAge: number) => {
    const res = fakeRes();
    setShareCardHeaders(
      res as never, // only setHeader is touched; the shape suffices
      etag,
      maxAge,
    );
    return res.headers;
  };

  it('sets image/png, public caching, CORP cross-origin, and the ETag', () => {
    const headers = call('"abc123"', 86400);
    assert.equal(headers['content-type'], 'image/png');
    assert.equal(headers['cache-control'], 'public, max-age=86400');
    assert.equal(
      headers['cross-origin-resource-policy'],
      'cross-origin',
      'hotlinkable across origins — overrides helmet default',
    );
    assert.equal(headers['etag'], '"abc123"');
  });

  it('honors a shorter max-age for the burn report cards', () => {
    assert.equal(call('"xyz"', 3600)['cache-control'], 'public, max-age=3600');
  });
});

describe('burn write-endpoint gates (Task 10)', () => {
  let server: Server;
  let base: string;

  before(async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet());
    app.use(express.json({ limit: '256kb' }));
    app.use('/api/burn', burnRouter);
    app.use('/api/billing', billingRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });

  after(
    async () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  );

  beforeEach(() => {
    _resetRateLimits();
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it('honeypot trips return fake 201 and do not consume the submit bucket', async () => {
    for (let i = 0; i < 12; i++) {
      const r = await fetch(`${base}/api/burn/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ website: 'http://spam.example' }),
      });
      assert.equal(r.status, 201, 'bot never learns it was caught');
      const body = (await r.json()) as any;
      assert.equal(body.status, 'pending');
    }
  });

  it('POST /api/burn/submit 429s after 10/hr per IP', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await fetch(`${base}/api/burn/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      // Gates pass (dev Turnstile skip), body fails validation → 400.
      // The rate limiter counts the attempt before validation runs.
      assert.equal(r.status, 400);
    }
    const r = await fetch(`${base}/api/burn/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(r.status, 429);
    assert.equal(((await r.json()) as any).error, 'rate_limited');
  });

  it('POST /api/burn/claim 429s after 5/hr per IP', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`${base}/api/burn/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'founder@example.com' }),
      });
      assert.notEqual(r.status, 429);
    }
    const r = await fetch(`${base}/api/burn/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'founder@example.com' }),
    });
    assert.equal(r.status, 429);
  });

  it('POST /api/burn/verify-dns 429s after 10/hr per IP', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await fetch(`${base}/api/burn/verify-dns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ claim_id: 'nope' }),
      });
      // Rate gate runs before claim validation → 400s, then 429.
      assert.equal(r.status, 400);
    }
    const r = await fetch(`${base}/api/burn/verify-dns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ claim_id: 'nope' }),
    });
    assert.equal(r.status, 429);
  });

  it('POST /api/billing/checkout 429s after 10/hr per IP', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await fetch(`${base}/api/billing/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product: 'rescan', email: 'f@example.com' }),
      });
      assert.notEqual(r.status, 429);
    }
    const r = await fetch(`${base}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ product: 'rescan', email: 'f@example.com' }),
    });
    assert.equal(r.status, 429);
  });

  it('Turnstile is enforced on burn writes when the secret is configured', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    try {
      const r = await fetch(`${base}/api/burn/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}), // no turnstileToken → verify fails w/o network
      });
      assert.equal(r.status, 400);
      assert.equal(((await r.json()) as any).error, 'bot_check_failed');
    } finally {
      delete process.env.TURNSTILE_SECRET_KEY;
    }
  });
});
