/**
 * Score-drop watchlist tests (Growth Plan §3).
 *
 * The sender is injected — no Resend, no console spam. Scan history flows
 * through the real recordBoardScan → processScanForWatchlist path, exactly
 * like the /scan route does it (record first, then the hook, which skips
 * scans[0] as its baseline).
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { vaporRouter } from '../routes/vapor';
import { _resetScanLog, recordBoardScan } from '../lib/scanlog';
import type { ScanResult, Tier } from '../lib/score';
import { ALGO_VERSION } from '../lib/score';
import {
  upsertWatchlist,
  getWatchlistEntry,
  unsubscribeByToken,
  resetWatchlist,
  processScanForWatchlist,
  SCORE_DROP_THRESHOLD,
  type AlertSender,
} from '../lib/watchlist';
import type { ScoreDropAlert } from '../lib/resend';
import {
  createClaim,
  verifyClaim,
  txtRecordValue,
  resetClaims,
  type DnsLookup,
} from '../lib/vapor-claim';

const DOMAIN = 'stripe.com'; // board-listed seed specimen
const EMAIL = 'founder@stripe.com';
// A non-seed domain for drop-detection tests: no seed chapter is adopted,
// so the tests control the baseline exactly. (Seed adoption is exercised
// separately in the end-to-end claim test.)
const FREE_DOMAIN = 'claimed-example.com';
const FREE_EMAIL = 'founder@claimed-example.com';

function fakeResult(
  score: number,
  tier: Tier,
  algoVersion: string = ALGO_VERSION,
): ScanResult {
  return {
    vapor_score: 100 - score,
    sniff_score: score,
    tier,
    metrics: {
      buzzword_density: 0,
      claim_to_proof: 0,
      vague_verb: 0,
      social_proof: 0,
      pricing_opacity: 0,
      freshness: 0,
    },
    verdict: 'test verdict',
    algo_version: algoVersion,
    snapshot_hash: 'test-hash',
    url: `https://${DOMAIN}/`,
    scanned_at: new Date().toISOString(),
    evidence: {
      words: 0,
      sentences: 0,
      buzzword_hits: 0,
      top_phrases: [],
      claim_sentences: 0,
      evidence_links: 0,
      vague_sentences: 0,
      trust_mentions: 0,
      anonymous_testimonials: 0,
      logo_images: 0,
      has_pricing: false,
      has_price_signals: false,
      sales_only_cta: false,
      copyright_year: null,
      language_note: null,
    },
  } as ScanResult;
}

/** The real /scan-route flow: record first, then run the hook. */
async function scan(domain: string, score: number, tier: Tier, sender: AlertSender): Promise<void> {
  const result = fakeResult(score, tier);
  recordBoardScan({ finalUrl: `https://${domain}/`, result });
  await processScanForWatchlist(`https://${domain}/`, result, sender);
}

function fakeSender(): { sender: AlertSender; calls: ScoreDropAlert[] } {
  const calls: ScoreDropAlert[] = [];
  const sender: AlertSender = async (input: ScoreDropAlert) => {
    calls.push(input);
    return { ok: true, devMode: true };
  };
  return { sender, calls };
}

function watch(domain: string, email: string = EMAIL): void {
  assert.ok(upsertWatchlist(domain, email), 'upsert should succeed');
}

describe('watchlist store', () => {
  beforeEach(() => {
    resetClaims();
    resetWatchlist();
    _resetScanLog();
  });

  it('normalizes domains and lowercases emails', () => {
    const entry = upsertWatchlist('WWW.Stripe.COM', '  Founder@Stripe.COM  ');
    assert.ok(entry);
    assert.equal(entry.domain, 'stripe.com');
    assert.equal(entry.email, 'founder@stripe.com');
    assert.match(entry.unsubToken, /^[0-9a-f]{48}$/);
    assert.equal(entry.lastAlertedScore, null);
  });

  it('rejects bad domains and empty emails', () => {
    assert.equal(upsertWatchlist('???', EMAIL), null);
    assert.equal(upsertWatchlist(DOMAIN, ''), null);
    assert.equal(upsertWatchlist(DOMAIN, 42), null);
    assert.equal(getWatchlistEntry(DOMAIN), null);
  });

  it('email updates preserve the one-alert bookkeeping', () => {
    watch(DOMAIN);
    const entry = getWatchlistEntry(DOMAIN);
    assert.ok(entry);
    entry.lastAlertedScore = 40; // simulate an alert already owed
    upsertWatchlist(DOMAIN, 'new@stripe.com');
    const updated = getWatchlistEntry(DOMAIN);
    assert.ok(updated);
    assert.equal(updated.email, 'new@stripe.com');
    assert.equal(updated.lastAlertedScore, 40);
    assert.equal(updated.unsubToken, entry.unsubToken);
  });

  it('unsubscribeByToken removes the entry; unknown tokens are harmless', () => {
    watch(DOMAIN);
    const token = getWatchlistEntry(DOMAIN)?.unsubToken;
    assert.ok(token);
    assert.equal(unsubscribeByToken(token), 'stripe.com');
    assert.equal(getWatchlistEntry(DOMAIN), null);
    assert.equal(unsubscribeByToken(token), null); // spent token
    assert.equal(unsubscribeByToken('nope'), null);
    assert.equal(unsubscribeByToken(''), null);
    assert.equal(unsubscribeByToken(42), null);
  });

  it('threshold constant is 10', () => {
    assert.equal(SCORE_DROP_THRESHOLD, 10);
  });
});

describe('processScanForWatchlist', () => {
  const D = FREE_DOMAIN;
  beforeEach(() => {
    resetClaims();
    resetWatchlist();
    _resetScanLog();
  });

  it('alerts on a 10+ point drop, exactly once', async () => {
    watch(D, FREE_EMAIL);
    const { sender, calls } = fakeSender();
    await scan(D, 90, 'CERTIFIED REAL', sender); // baseline
    await scan(D, 75, 'ALMOST REAL', sender); // -15, tier drop too
    assert.equal(calls.length, 1);
    const a = calls[0];
    assert.equal(a.domain, D);
    assert.equal(a.slug, D);
    assert.equal(a.to, FREE_EMAIL);
    assert.equal(a.prevScore, 90);
    assert.equal(a.newScore, 75);
    assert.equal(a.tier, 'ALMOST REAL');
    assert.match(a.unsubUrl, /\/api\/vapor\/watchlist\/unsubscribe\?token=[0-9a-f]{48}/);
    assert.match(a.siteUrl, /^https?:/);
    const entry = getWatchlistEntry(D);
    assert.ok(entry);
    assert.equal(entry.lastAlertedScore, 75);
  });

  it('alerts on a tier drop under 10 points (81 → 79 crosses a boundary)', async () => {
    watch(D, FREE_EMAIL);
    const { sender, calls } = fakeSender();
    await scan(D, 81, 'CERTIFIED REAL', sender);
    await scan(D, 79, 'ALMOST REAL', sender); // -2, but tier rank dropped
    assert.equal(calls.length, 1);
    assert.equal(calls[0].prevScore, 81);
    assert.equal(calls[0].newScore, 79);
  });

  it('stays silent on a 5-point wiggle in the same tier', async () => {
    watch(D, FREE_EMAIL);
    const { sender, calls } = fakeSender();
    await scan(D, 70, 'ALMOST REAL', sender);
    await scan(D, 65, 'ALMOST REAL', sender); // -5, same tier
    assert.equal(calls.length, 0);
  });

  it('no duplicate alert for a second scan at the same low score', async () => {
    watch(D, FREE_EMAIL);
    const { sender, calls } = fakeSender();
    await scan(D, 90, 'CERTIFIED REAL', sender);
    await scan(D, 75, 'ALMOST REAL', sender);
    assert.equal(calls.length, 1);
    await scan(D, 75, 'ALMOST REAL', sender); // same low — no event
    assert.equal(calls.length, 1);
  });

  it('recovery then a fresh drop alerts again', async () => {
    watch(D, FREE_EMAIL);
    const { sender, calls } = fakeSender();
    await scan(D, 90, 'CERTIFIED REAL', sender);
    await scan(D, 75, 'ALMOST REAL', sender);
    assert.equal(calls.length, 1);
    await scan(D, 92, 'CERTIFIED REAL', sender); // recovered — reset
    assert.equal(calls.length, 1);
    await scan(D, 80, 'ALMOST REAL', sender); // -12 fresh drop
    assert.equal(calls.length, 2);
    assert.equal(calls[1].prevScore, 92);
    assert.equal(calls[1].newScore, 80);
  });

  it('gradual small steps within one tier stay silent; a step crossing a tier boundary alerts', async () => {
    watch(D, FREE_EMAIL);
    const { sender, calls } = fakeSender();
    await scan(D, 90, 'CERTIFIED REAL', sender);
    await scan(D, 82, 'CERTIFIED REAL', sender); // -8
    await scan(D, 74, 'ALMOST REAL', sender); // -8 vs 82, but tier dropped → ALERT
    assert.equal(calls.length, 1); // tier rank dropped on the second step
  });

  it('v1 baseline vs v2 scan with a 15-point gap: NO alert (same-version rule)', async () => {
    watch(D, FREE_EMAIL);
    const { sender, calls } = fakeSender();
    // A v1-era scan as the only history chapter.
    const v1 = fakeResult(90, 'CERTIFIED REAL', 'v1');
    recordBoardScan({ finalUrl: `https://${D}/`, result: v1 });
    // Now a v2 scan drops 15 points: no same-version baseline → silence.
    const v2 = fakeResult(75, 'ALMOST REAL', 'v2');
    recordBoardScan({ finalUrl: `https://${D}/`, result: v2 });
    await processScanForWatchlist(`https://${D}/`, v2, sender);
    assert.equal(calls.length, 0);
  });

  it('a score gain never alerts', async () => {
    watch(D, FREE_EMAIL);
    const { sender, calls } = fakeSender();
    await scan(D, 60, 'SUS', sender);
    await scan(D, 78, 'ALMOST REAL', sender); // +18, tier up
    assert.equal(calls.length, 0);
  });

  it('a host with no baseline (first scan ever) never alerts', async () => {
    watch(D, FREE_EMAIL);
    const { sender, calls } = fakeSender();
    const result = fakeResult(10, 'CERTIFIED FAKE');
    recordBoardScan({ finalUrl: `https://${D}/`, result });
    await processScanForWatchlist(`https://${D}/`, result, sender);
    assert.equal(calls.length, 0);
  });

  it('a domain with no watchlist entry is ignored silently', async () => {
    const { sender, calls } = fakeSender();
    await scan('lemonsqueezy.com', 90, 'CERTIFIED REAL', sender);
    await scan('lemonsqueezy.com', 70, 'ALMOST REAL', sender);
    assert.equal(calls.length, 0);
  });

  it('malformed URLs never throw', async () => {
    watch(D, FREE_EMAIL);
    const { sender } = fakeSender();
    await processScanForWatchlist('not a url', fakeResult(50, 'SUS'), sender);
  });

  it('a failing sender never throws and leaves the drop owed', async () => {
    watch(D, FREE_EMAIL);
    const calls: ScoreDropAlert[] = [];
    const badSender: AlertSender = async (input) => {
      calls.push(input);
      throw new Error('resend is down');
    };
    const r1 = fakeResult(90, 'CERTIFIED REAL');
    recordBoardScan({ finalUrl: `https://${D}/`, result: r1 });
    const r2 = fakeResult(75, 'ALMOST REAL');
    recordBoardScan({ finalUrl: `https://${D}/`, result: r2 });
    await processScanForWatchlist(`https://${D}/`, r2, badSender);
    assert.equal(calls.length, 1);
    assert.equal(getWatchlistEntry(D)?.lastAlertedScore, null); // owed, retry later
  });
});

describe('claim flow + watchlist integration', () => {
  beforeEach(() => {
    resetClaims();
    resetWatchlist();
    _resetScanLog();
  });

  function dnsForToken(token: string): DnsLookup {
    return async () => [[txtRecordValue(token)]];
  }

  function claimToken(domain: string, opts?: { email?: unknown; alerts?: unknown }): string {
    const outcome = createClaim(domain, opts);
    assert.equal(outcome.ok, true);
    return outcome.ok ? outcome.record.token : '';
  }

  it('watchlist entry lands ONLY on successful verify with email + opt-in', async () => {
    const token = claimToken(DOMAIN, { email: ' Founder@Stripe.COM ', alerts: true });
    assert.equal(getWatchlistEntry(DOMAIN), null); // token request alone: nothing
    const outcome = await verifyClaim(DOMAIN, dnsForToken(token));
    assert.equal(outcome.verified, true);
    const entry = getWatchlistEntry(DOMAIN);
    assert.ok(entry);
    assert.equal(entry.email, 'founder@stripe.com');
  });

  it('alerts:false means verify leaves no watchlist entry', async () => {
    const token = claimToken(DOMAIN, { email: EMAIL, alerts: false });
    assert.equal((await verifyClaim(DOMAIN, dnsForToken(token))).verified, true);
    assert.equal(getWatchlistEntry(DOMAIN), null);
  });

  it('no email means no watchlist entry (legacy callers unchanged)', async () => {
    const token = claimToken(DOMAIN); // one-arg compatible call
    assert.equal((await verifyClaim(DOMAIN, dnsForToken(token))).verified, true);
    assert.equal(getWatchlistEntry(DOMAIN), null);
  });

  it('email defaults alerts on when no alerts flag is passed', async () => {
    const token = claimToken(DOMAIN, { email: EMAIL });
    assert.equal((await verifyClaim(DOMAIN, dnsForToken(token))).verified, true);
    assert.ok(getWatchlistEntry(DOMAIN));
  });

  it('idempotent verify path also upserts (email added between checks)', async () => {
    const token = claimToken(DOMAIN, { email: EMAIL });
    assert.equal((await verifyClaim(DOMAIN, dnsForToken(token))).verified, true);
    assert.ok(getWatchlistEntry(DOMAIN));
    // A second check (already-verified path, no DNS) keeps it watched.
    const neverLookup: DnsLookup = async () => {
      throw new Error('should not be called');
    };
    assert.equal((await verifyClaim(DOMAIN, neverLookup)).verified, true);
    assert.ok(getWatchlistEntry(DOMAIN));
  });

  it('re-claim updates the stored email without rotating the token', () => {
    const first = createClaim(DOMAIN, { email: 'old@stripe.com', alerts: true });
    assert.equal(first.ok, true);
    const second = createClaim(DOMAIN, { email: 'new@stripe.com' });
    assert.equal(first.ok && second.ok, true);
    if (first.ok && second.ok) {
      assert.equal(second.isNew, false);
      assert.equal(second.record.token, first.record.token);
      assert.equal(second.record.email, 'new@stripe.com');
    }
  });

  it('garbage email fails with invalid_email at the lib level', () => {
    for (const bad of ['not-an-email', 'a@b', '@x.com', 42, {}, ['x']]) {
      const outcome = createClaim(DOMAIN, { email: bad });
      assert.equal(outcome.ok, false);
      if (!outcome.ok) assert.equal(outcome.error, 'invalid_email');
    }
    // Empty values are just "no email", not errors.
    for (const empty of [undefined, null, '', '   ']) {
      const outcome = createClaim(DOMAIN, { email: empty });
      assert.equal(outcome.ok, true);
      if (outcome.ok) assert.equal(outcome.record.email, null);
      resetClaims();
    }
  });

  it('normalizeAlertEmail never returns the raw address for bad input', async () => {
    const outcome = createClaim(DOMAIN, { email: '!!!bad!!!' });
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.error, 'invalid_email');
      assert.ok(!JSON.stringify(outcome).includes('!!!bad!!!'), 'error must not echo the email');
    }
  });

  it('end-to-end: verify → 10-point drop re-scan → alert queued', async () => {
    const token = claimToken(DOMAIN, { email: EMAIL, alerts: true });
    assert.equal((await verifyClaim(DOMAIN, dnsForToken(token))).verified, true);
    const { sender, calls } = fakeSender();
    await scan(DOMAIN, 90, 'CERTIFIED REAL', sender);
    await scan(DOMAIN, 78, 'ALMOST REAL', sender);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].to, EMAIL);
    assert.equal(calls[0].prevScore, 90);
    assert.equal(calls[0].newScore, 78);
  });
});

describe('watchlist endpoints', () => {
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

  beforeEach(() => {
    resetClaims();
    resetWatchlist();
    _resetScanLog();
  });

  async function post(path: string, body: unknown) {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  async function getHtml(path: string) {
    const res = await fetch(`${base}${path}`);
    return { status: res.status, text: await res.text() };
  }

  it('POST /claim with garbage email → 400 invalid_email, no address echoed', async () => {
    const { status, body } = await post('/api/vapor/claim', {
      domain: DOMAIN,
      email: 'not-an-email',
    });
    assert.equal(status, 400);
    assert.equal(body.error, 'invalid_email');
    assert.ok(!String(body.detail).includes('not-an-email'), 'detail must not echo the email');
  });

  it('POST /claim accepts an email; the response never carries it', async () => {
    const { status, body } = await post('/api/vapor/claim', {
      domain: DOMAIN,
      email: EMAIL,
      alerts: true,
    });
    assert.equal(status, 200);
    assert.ok(!JSON.stringify(body).includes(EMAIL), 'response must not echo the email');
  });

  it('unsubscribe with a real token stops the alerts', async () => {
    const entry = upsertWatchlist(DOMAIN, EMAIL);
    assert.ok(entry);
    const { status, text } = await getHtml(
      `/api/vapor/watchlist/unsubscribe?token=${entry.unsubToken}`,
    );
    assert.equal(status, 200);
    assert.ok(text.includes('You&rsquo;re off the list') || text.includes('You’re off the list') || text.includes('off the list'));
    assert.ok(text.includes('stripe.com'));
    assert.ok(!text.includes(EMAIL));
    assert.equal(getWatchlistEntry(DOMAIN), null);

    // After unsubscribe, a 10-point drop sends nothing.
    const { sender, calls } = fakeSender();
    const r1 = fakeResult(90, 'CERTIFIED REAL');
    recordBoardScan({ finalUrl: `https://${DOMAIN}/`, result: r1 });
    const r2 = fakeResult(75, 'ALMOST REAL');
    recordBoardScan({ finalUrl: `https://${DOMAIN}/`, result: r2 });
    await processScanForWatchlist(`https://${DOMAIN}/`, r2, sender);
    assert.equal(calls.length, 0);
  });

  it('unsubscribe with an unknown or missing token is a calm 200, no leaks', async () => {
    for (const path of [
      '/api/vapor/watchlist/unsubscribe?token=deadbeef',
      '/api/vapor/watchlist/unsubscribe',
    ]) {
      const { status, text } = await getHtml(path);
      assert.equal(status, 200);
      assert.ok(text.includes('spent or wrong'));
      assert.ok(!text.includes(EMAIL));
    }
  });
});
