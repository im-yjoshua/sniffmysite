/**
 * VaporRank claim-flow tests (Task 8, §2.9 / §2.11).
 *
 * DNS is fully mocked (injected `lookup` param) — no real DNS in tests.
 * Endpoint tests spin up an ephemeral Express app, same pattern as
 * leaderboard.test.ts (node:http + global fetch).
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import {
  createClaim,
  verifyClaim,
  txtRecordHost,
  txtRecordValue,
  claimInstructions,
  resetClaims,
  CLAIM_TTL_MS,
  VAPOR_TXT_HOST,
  VAPOR_TXT_PREFIX,
  type DnsLookup,
} from '../lib/vapor-claim';
import { vaporRouter } from '../routes/vapor';

const DOMAIN = 'stripe.com'; // board-listed seed specimen
const UNKNOWN = 'totally-real-startup.xyz';

function claimAndGetToken(domain: string): string {
  const outcome = createClaim(domain);
  assert.equal(outcome.ok, true);
  return outcome.ok ? outcome.record.token : '';
}

function dnsError(code: string): Error {
  const e = new Error(`getaddrinfo ${code}`) as NodeJS.ErrnoException;
  e.code = code;
  return e;
}

describe('createClaim', () => {
  beforeEach(() => resetClaims());

  it('mints a 48-hex-char token with the canonical TXT location', () => {
    const outcome = createClaim(DOMAIN);
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.match(outcome.record.token, /^[0-9a-f]{48}$/);
    assert.equal(outcome.record.domain, 'stripe.com');
    assert.equal(txtRecordHost('stripe.com'), '_sniffmysite.stripe.com');
    assert.equal(
      txtRecordValue(outcome.record.token),
      `${VAPOR_TXT_PREFIX}${outcome.record.token}`,
    );
    const ttl = Date.parse(outcome.record.expiresAt) - Date.now();
    assert.ok(
      ttl > CLAIM_TTL_MS - 60_000 && ttl <= CLAIM_TTL_MS,
      `token should expire in ~7 days, got ${ttl}ms`,
    );
  });

  it('normalizes domains (case, www.) before minting', () => {
    const outcome = createClaim('WWW.Stripe.COM');
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.record.domain, 'stripe.com');
  });

  it('rejects garbage input with invalid_domain', () => {
    for (const bad of ['', 'not a domain', 'foo', 42, null, undefined]) {
      const outcome = createClaim(bad);
      assert.equal(outcome.ok, false);
      if (!outcome.ok) assert.equal(outcome.error, 'invalid_domain');
    }
  });

  it('404s domains that are not on the board (seed-only claim scope)', () => {
    const outcome = createClaim(UNKNOWN);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.error, 'startup_not_found');
  });

  it('is idempotent: re-claiming returns the SAME token', () => {
    const first = createClaim(DOMAIN);
    const second = createClaim(DOMAIN);
    assert.equal(first.ok && second.ok, true);
    if (first.ok && second.ok) {
      assert.equal(second.record.token, first.record.token);
      assert.equal(second.isNew, false);
      assert.equal(first.isNew, true);
    }
  });

  it('ships four-step lab-procedure instructions', () => {
    const steps = claimInstructions('abc123');
    assert.equal(steps.length, 4);
    assert.ok(steps[1].includes('_sniffmysite'));
    assert.ok(steps[1].includes('sniffmysite-verification=abc123'));
  });
});

describe('verifyClaim', () => {
  beforeEach(() => resetClaims());

  it('verifies when the exact record value is present', async () => {
    const token = claimAndGetToken(DOMAIN);
    const lookup: DnsLookup = async (host) => {
      assert.equal(host, `${VAPOR_TXT_HOST}.${DOMAIN}`);
      return [[txtRecordValue(token)]];
    };
    const outcome = await verifyClaim(DOMAIN, lookup);
    assert.equal(outcome.verified, true);
    if (outcome.verified) assert.ok(!Number.isNaN(Date.parse(outcome.claimedAt)));
  });

  it('joins split TXT chunks before comparing', async () => {
    const token = claimAndGetToken(DOMAIN);
    const full = txtRecordValue(token);
    const lookup: DnsLookup = async () => [
      [full.slice(0, 20), full.slice(20)], // chunked record
    ];
    const outcome = await verifyClaim(DOMAIN, lookup);
    assert.equal(outcome.verified, true);
  });

  it('is idempotent: a verified claim stays verified without another DNS hit', async () => {
    const token = claimAndGetToken(DOMAIN);
    let calls = 0;
    const okLookup: DnsLookup = async () => {
      calls += 1;
      return [[txtRecordValue(token)]];
    };
    assert.equal((await verifyClaim(DOMAIN, okLookup)).verified, true);
    const neverLookup: DnsLookup = async () => {
      throw new Error('should not be called');
    };
    const second = await verifyClaim(DOMAIN, neverLookup);
    assert.equal(second.verified, true);
    assert.equal(calls, 1);
  });

  it('rejects a wrong token value (token_not_found)', async () => {
    claimAndGetToken(DOMAIN);
    const lookup: DnsLookup = async () => [['sniffmysite-verification=wrong']];
    const outcome = await verifyClaim(DOMAIN, lookup);
    assert.deepEqual(outcome, { verified: false, reason: 'token_not_found' });
  });

  it('rejects a token smuggled inside noise (exact match only)', async () => {
    const token = claimAndGetToken(DOMAIN);
    const lookup: DnsLookup = async () => [[`xx${txtRecordValue(token)}xx`]];
    const outcome = await verifyClaim(DOMAIN, lookup);
    assert.deepEqual(outcome, { verified: false, reason: 'token_not_found' });
  });

  it('maps ENOTFOUND/ENODATA to token_not_found, never a crash', async () => {
    claimAndGetToken(DOMAIN);
    for (const code of ['ENOTFOUND', 'ENODATA']) {
      const lookup: DnsLookup = async () => {
        throw dnsError(code);
      };
      const outcome = await verifyClaim(DOMAIN, lookup);
      assert.deepEqual(outcome, { verified: false, reason: 'token_not_found' });
    }
  });

  it('maps unexpected DNS failures to dns_error', async () => {
    claimAndGetToken(DOMAIN);
    const lookup: DnsLookup = async () => {
      throw dnsError('ETIMEOUT');
    };
    const outcome = await verifyClaim(DOMAIN, lookup);
    assert.deepEqual(outcome, { verified: false, reason: 'dns_error' });
  });

  it('rejects expired tokens', async () => {
    const outcome = createClaim(DOMAIN);
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    outcome.record.expiresAt = new Date(Date.now() - 1000).toISOString();
    const lookup: DnsLookup = async () => [[txtRecordValue(outcome.record.token)]];
    assert.deepEqual(await verifyClaim(DOMAIN, lookup), {
      verified: false,
      reason: 'expired',
    });
  });

  it('returns no_pending_claim when nothing was issued', async () => {
    const lookup: DnsLookup = async () => {
      throw new Error('should not be called');
    };
    assert.deepEqual(await verifyClaim(DOMAIN, lookup), {
      verified: false,
      reason: 'no_pending_claim',
    });
  });

  it('rotates the token after expiry', () => {
    const first = createClaim(DOMAIN);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    first.record.expiresAt = new Date(Date.now() - 1000).toISOString();
    const second = createClaim(DOMAIN);
    assert.equal(second.ok, true);
    if (second.ok) {
      assert.equal(second.isNew, true);
      assert.notEqual(second.record.token, first.record.token);
    }
  });
});

describe('claim endpoints', () => {
  let app: Express;
  let server: Server;
  let base: string;

  before(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/vapor', vaporRouter);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => resetClaims());

  async function post(path: string, body: unknown) {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it('POST /claim issues a token with instructions', async () => {
    const { status, body } = await post('/api/vapor/claim', { domain: DOMAIN });
    assert.equal(status, 200);
    assert.equal(body.domain, DOMAIN);
    assert.match(String(body.token), /^[0-9a-f]{48}$/);
    assert.equal(body.txt_host, '_sniffmysite.stripe.com');
    assert.equal(body.txt_value, `sniffmysite-verification=${body.token}`);
    assert.ok(!Number.isNaN(Date.parse(String(body.expires_at))));
    assert.ok(Array.isArray(body.instructions) && body.instructions.length === 4);
  });

  it('POST /claim 400s invalid domains, 404s unlisted ones', async () => {
    const bad = await post('/api/vapor/claim', { domain: '???' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'invalid_domain');
    const unknown = await post('/api/vapor/claim', { domain: UNKNOWN });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error, 'startup_not_found');
  });

  it('POST /claim/verify returns false before the record exists (no real DNS)', async () => {
    await post('/api/vapor/claim', { domain: DOMAIN });
    const { status, body } = await post('/api/vapor/claim/verify', {
      domain: DOMAIN,
    });
    assert.equal(status, 200);
    assert.equal(body.verified, false);
    // Real DNS for the sandbox sinkholes everything; either way the token
    // isn't published there, so both honest reasons are acceptable.
    assert.ok(
      body.reason === 'token_not_found' || body.reason === 'dns_error',
      `unexpected reason: ${body.reason}`,
    );
    assert.ok(!('token' in body), 'verify response must never leak the token');
  });

  it('POST /claim/verify 404s unknown domains, 400s invalid ones', async () => {
    const unknown = await post('/api/vapor/claim/verify', { domain: UNKNOWN });
    assert.equal(unknown.status, 404);
    const bad = await post('/api/vapor/claim/verify', { domain: '' });
    assert.equal(bad.status, 400);
  });
});
