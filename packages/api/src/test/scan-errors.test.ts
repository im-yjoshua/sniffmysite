/**
 * Scan-reliability tests: every fetch failure leaves the API as a
 * structured, machine-readable code — never silence, never a leak.
 *
 * - fetchPage-level: each failure mode exercised through the `stub` seam
 *   (zero real network).
 * - Sanitization: the public detail for every code contains no IPs, DNS
 *   internals, or transport jargon (no SSRF oracle).
 * - Route-level: POST /api/vapor/scan maps FetchError → { error, detail }
 *   with the sanitized one-liner and the right HTTP status.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import {
  fetchPage,
  FetchError,
  fetchErrorHttpStatus,
  fetchErrorPublicDetail,
  classifyTransportError,
  isChallengePage,
  MIN_READABLE_CHARS,
  type RawResponse,
  type FetchErrorCode,
} from '../lib/fetch';
import { vaporRouter } from '../routes/vapor';
import { _resetRateLimits } from '../lib/ratelimit';
import { _resetScanBudgets } from '../lib/scan-budget';

const ALL_CODES: FetchErrorCode[] = [
  'invalid_url',
  'ssrf_blocked',
  'dns_error',
  'too_many_redirects',
  'timeout',
  'body_too_large',
  'unsupported_content_type',
  'fetch_failed',
  'blocked',
  'http_error',
  'tls_error',
  'empty_page',
];

/** Rejects with a FetchError — returns the error for further assertions. */
async function catchFetchError(p: Promise<unknown>): Promise<FetchError> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof FetchError, `expected FetchError, got ${e}`);
    return e;
  }
  assert.fail('expected a FetchError rejection, but it resolved');
}

const stubRes = (
  status: number,
  html: string,
  headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8' },
): RawResponse => ({ status, headers, body: Buffer.from(html, 'utf8') });

/** A realistic-enough landing page: comfortably past the empty-page guard. */
const REAL_PAGE = `<html><head><title>Acme — widgets for everyone</title></head><body>
  <h1>Acme makes wonderful widgets</h1>
  <p>Our revolutionary platform synergizes best-in-class solutions for modern teams.
  Trusted by thousands of happy customers worldwide, we disrupt the widget space daily.</p>
  <p>Pricing starts at $9. <a href="/docs">Read the docs</a>.</p>
</body></html>`;

describe('fetchPage failure taxonomy (stubbed, zero network)', () => {
  it('403 from upstream → blocked (bot wall, never scored)', async () => {
    const e = await catchFetchError(
      fetchPage('http://8.8.8.8/wall', { stub: async () => stubRes(403, REAL_PAGE) }),
    );
    assert.equal(e.code, 'blocked');
    assert.equal(e.upstreamStatus, 403);
  });

  it('429 from upstream → blocked', async () => {
    const e = await catchFetchError(
      fetchPage('http://8.8.8.8/ratelimited', { stub: async () => stubRes(429, REAL_PAGE) }),
    );
    assert.equal(e.code, 'blocked');
    assert.equal(e.upstreamStatus, 429);
  });

  it('404 from upstream → http_error with the status attached', async () => {
    const e = await catchFetchError(
      fetchPage('http://8.8.8.8/missing', { stub: async () => stubRes(404, REAL_PAGE) }),
    );
    assert.equal(e.code, 'http_error');
    assert.equal(e.upstreamStatus, 404);
  });

  it('500 from upstream → http_error', async () => {
    const e = await catchFetchError(
      fetchPage('http://8.8.8.8/broken', { stub: async () => stubRes(500, REAL_PAGE) }),
    );
    assert.equal(e.code, 'http_error');
    assert.equal(e.upstreamStatus, 500);
  });

  it('Cloudflare-style challenge page (HTTP 200) → blocked, not scored', async () => {
    const challenge = `<html><head><title>Just a moment...</title></head><body>
      <p>Verifying you are human. This may take a few seconds.</p></body></html>`;
    const e = await catchFetchError(
      fetchPage('http://8.8.8.8/challenge', { stub: async () => stubRes(200, challenge) }),
    );
    assert.equal(e.code, 'blocked');
    assert.ok(isChallengePage(challenge, 'Just a moment...', 'Verifying you are human'));
  });

  it('JS-shell page with nothing readable → empty_page', async () => {
    const shell = `<html><head><title>App</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
    const e = await catchFetchError(
      fetchPage('http://8.8.8.8/spa', { stub: async () => stubRes(200, shell) }),
    );
    assert.equal(e.code, 'empty_page');
  });

  it('a page right at the readability floor passes', async () => {
    const pad = 'x'.repeat(MIN_READABLE_CHARS);
    const page = await fetchPage('http://8.8.8.8/ok', {
      stub: async () => stubRes(200, `<html><body><p>${pad}</p></body></html>`),
    });
    assert.ok(page.text.length >= MIN_READABLE_CHARS);
  });

  it('invalid redirect Location → fetch_failed (not silence)', async () => {
    const e = await catchFetchError(
      fetchPage('http://8.8.8.8/badredir', {
        stub: async () => ({ status: 302, headers: { location: 'http://' }, body: Buffer.alloc(0) }),
      }),
    );
    assert.equal(e.code, 'fetch_failed');
  });

  it('a real page still fetches fine (no false positives)', async () => {
    const page = await fetchPage('http://8.8.8.8/', {
      stub: async () => stubRes(200, REAL_PAGE),
    });
    assert.ok(page.text.includes('Acme makes wonderful widgets'));
    assert.ok(!isChallengePage(REAL_PAGE, page.title, page.text));
  });
});

describe('classifyTransportError', () => {
  for (const msg of [
    'certificate has expired',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'write EPROTO ssl3_get_server_certificate: certificate verify failed',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'ERR_TLS_CERT_ALTNAME_INVALID',
  ]) {
    it(`TLS-ish "${msg.slice(0, 40)}…" → tls_error`, () => {
      assert.equal(classifyTransportError(new Error(msg)), 'tls_error');
    });
  }
  for (const msg of [
    'connect ECONNREFUSED 93.184.216.34:443',
    'socket hang up',
    'getaddrinfo ENOTFOUND no-such-host.invalid',
    'read ECONNRESET',
  ]) {
    it(`transport "${msg.slice(0, 40)}…" → fetch_failed`, () => {
      assert.equal(classifyTransportError(new Error(msg)), 'fetch_failed');
    });
  }
});

describe('sanitized public details (no SSRF oracle)', () => {
  const LEAK_RES = [
    /\d+\.\d+\.\d+\.\d+/, // no IP addresses, ever
    /ECONNREFUSED|ENOTFOUND|ECONNRESET|EPROTO/i,
    /resolves to|Refusing to fetch|non-public/i,
    /Upstream returned HTTP \d+/, // statuses travel in `upstream_status`, not prose
  ];

  for (const code of ALL_CODES) {
    it(`${code}: status mapping + leak-free one-liner`, () => {
      const status = fetchErrorHttpStatus(code);
      const expected = code === 'invalid_url' ? 400 : code === 'ssrf_blocked' ? 403 : 502;
      assert.equal(status, expected, `${code} → HTTP ${expected}`);
      const detail = fetchErrorPublicDetail(code);
      assert.ok(typeof detail === 'string' && detail.length > 10, 'plain-language one-liner');
      for (const re of LEAK_RES) {
        assert.ok(!re.test(detail), `${code} detail leaks internals: "${detail}"`);
      }
    });
  }

  it('covers every code in the FetchErrorCode union', () => {
    // If someone adds a code to the union without a public detail, the
    // switch falls through and this (plus TS exhaustiveness) catches it.
    assert.equal(ALL_CODES.length, 12);
  });
});

describe('POST /api/vapor/scan error mapping (route level)', () => {
  let app: Express;
  let server: Server;
  let base: string;

  before(async () => {
    app = express();
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
  });

  async function scan(body: unknown) {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it('private IP target → 403 ssrf_blocked with the sanitized one-liner', async () => {
    const { status, body } = await scan({ url: 'http://127.0.0.1:9/' });
    assert.equal(status, 403);
    assert.equal(body.error, 'ssrf_blocked');
    assert.equal(body.detail, fetchErrorPublicDetail('ssrf_blocked'));
    assert.ok(
      !JSON.stringify(body).includes('127.0.0.1'),
      'the refused IP must not appear in the response',
    );
  });

  it('malformed URL → 400 invalid_url', async () => {
    const { status, body } = await scan({ url: 'not a url' });
    assert.equal(status, 400);
    assert.equal(body.error, 'invalid_url');
    assert.equal(body.detail, fetchErrorPublicDetail('invalid_url'));
  });

  it('unresolvable domain → 502 with a structured code (never silence)', async () => {
    // Sandbox DNS is sinkholed to 198.18.x.x (benchmark range) → the guard
    // refuses it as ssrf_blocked; with real DNS this is dns_error. Either
    // way the contract holds: a structured code + sanitized detail.
    const { status, body } = await scan({
      url: 'https://this-domain-cannot-possibly-exist-xyz987.invalid/',
    });
    assert.ok(status === 502 || status === 403, `expected 502/403, got ${status}`);
    assert.ok(
      body.error === 'dns_error' || body.error === 'ssrf_blocked',
      `expected a fetch code, got ${body.error}`,
    );
    assert.equal(body.detail, fetchErrorPublicDetail(body.error as FetchErrorCode));
  });
});
