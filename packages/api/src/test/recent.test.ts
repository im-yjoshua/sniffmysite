/**
 * Recent-scans ring log + GET /api/vapor/recent.
 *
 * Covers: record on scan input (slug/domain derived from the final URL),
 * newest-first order, the 15-scan cap, both scores present, has_profile
 * true/false via getProfile, the empty-log shape, public-field privacy
 * (no emails, IPs, or full URLs), and sane 429 behavior on the endpoint.
 *
 * "Push on scan" is tested at the recordRecentScan seam (the exact call
 * the POST /scan route makes on every successful scan, anonymous and
 * priority alike) — real successful scans can't run in this sandbox
 * (DNS is blocked, so fetchPage always 403s).
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  RECENT_MAX,
  recordRecentScan,
  getRecentScans,
  _resetRecentScans,
  type RecentScanInput,
} from '../lib/recent.js';
import { vaporRouter } from '../routes/vapor.js';
import { _resetRateLimits } from '../lib/ratelimit.js';

function inputFor(host: string, sniff = 74): RecentScanInput {
  return {
    finalUrl: `https://${host}/some/landing/page`,
    vapor_score: 100 - sniff,
    sniff_score: sniff,
    tier: sniff >= 81 ? 'CERTIFIED REAL' : sniff >= 61 ? 'ALMOST REAL' : 'SUS',
    scanned_at: new Date('2026-09-21T12:00:00Z').toISOString(),
  };
}

describe('recordRecentScan', () => {
  beforeEach(() => _resetRecentScans());

  it('derives slug + domain from the final URL and stores both scores', () => {
    const rec = recordRecentScan(inputFor('www.example.org', 74));
    assert.ok(rec);
    assert.equal(rec.slug, 'example.org');
    assert.equal(rec.domain, 'example.org');
    assert.equal(rec.sniff_score, 74);
    assert.equal(rec.vapor_score, 26);
    assert.equal(rec.tier, 'ALMOST REAL');
    assert.equal(rec.scanned_at, '2026-09-21T12:00:00.000Z');
  });

  it('has_profile is true for a board-listed slug, false otherwise', () => {
    const known = recordRecentScan(inputFor('character.ai', 53));
    const unknown = recordRecentScan(inputFor('example.org', 74));
    assert.ok(known && unknown);
    assert.equal(known.has_profile, true, 'character.ai has a dossier');
    assert.equal(unknown.has_profile, false);
  });

  it('keeps newest first', () => {
    recordRecentScan(inputFor('first.example', 60));
    recordRecentScan(inputFor('second.example', 80));
    const scans = getRecentScans();
    assert.deepEqual(
      scans.map((s) => s.domain),
      ['second.example', 'first.example'],
    );
  });

  it('re-scanning the same host keeps ONE entry, with the latest score', () => {
    recordRecentScan(inputFor('example.org', 60));
    recordRecentScan(inputFor('other.example', 80));
    recordRecentScan(inputFor('www.example.org', 90)); // re-scan: www stripped, fresh score
    const scans = getRecentScans();
    assert.equal(scans.length, 2, 'no duplicate hosts on the tape');
    assert.equal(scans[0].domain, 'example.org');
    assert.equal(scans[0].sniff_score, 90, 'the latest scan wins');
    assert.equal(scans[1].domain, 'other.example');
  });

  it('a re-scan bumps its host to the front, newest-first holds', () => {
    recordRecentScan(inputFor('a.example', 60));
    recordRecentScan(inputFor('b.example', 70));
    recordRecentScan(inputFor('a.example', 65));
    const scans = getRecentScans();
    assert.deepEqual(
      scans.map((s) => s.domain),
      ['a.example', 'b.example'],
    );
    assert.equal(scans[0].sniff_score, 65);
  });

  it('caps the log at 15, dropping the oldest', () => {
    assert.equal(RECENT_MAX, 15);
    for (let i = 0; i < 20; i++) {
      recordRecentScan(inputFor(`site${i}.example`, 50));
    }
    const scans = getRecentScans();
    assert.equal(scans.length, 15);
    assert.equal(scans[0].domain, 'site19.example');
    assert.equal(scans[14].domain, 'site5.example');
  });

  it('returns null for an un-parseable final URL (nothing pushed)', () => {
    const rec = recordRecentScan({
      ...inputFor('example.org'),
      finalUrl: 'not a url at all',
    });
    assert.equal(rec, null);
    assert.equal(getRecentScans().length, 0);
  });
});

describe('GET /api/vapor/recent', () => {
  let app: Express;
  let server: Server;
  let base: string;

  before(async () => {
    app = express();
    app.use(express.json({ limit: '256kb' }));
    app.use('/api/vapor', vaporRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}/api/vapor/recent`;
  });

  after(
    async () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  );

  beforeEach(() => {
    _resetRateLimits();
    _resetRecentScans();
  });

  it('empty log → { count: 0, scans: [] }', async () => {
    const res = await fetch(base);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.deepEqual(body, { count: 0, scans: [] });
  });

  it('returns seeded scans newest-first with only public fields', async () => {
    recordRecentScan(inputFor('character.ai', 53));
    recordRecentScan(inputFor('example.org', 90));
    const res = await fetch(base);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.count, 2);
    assert.equal(body.scans[0].domain, 'example.org');
    assert.equal(body.scans[1].domain, 'character.ai');
    for (const s of body.scans) {
      assert.deepEqual(
        Object.keys(s).sort(),
        [
          'domain',
          'has_profile',
          'scanned_at',
          'slug',
          'sniff_score',
          'tier',
          'vapor_score',
        ].sort(),
        'only the documented public fields',
      );
      assert.ok(!s.domain.includes('/') && !s.domain.includes('@'));
      assert.ok(!s.domain.includes('http'));
      assert.ok(!Number.isNaN(Date.parse(s.scanned_at)), 'scanned_at is ISO');
    }
  });

  it('429s past 300 hits/hr with a Retry-After (generous, not punitive)', async () => {
    const batch = (n: number) =>
      Promise.all(Array.from({ length: n }, () => fetch(base)));
    // 300 hits in chunks of 30.
    for (let i = 0; i < 10; i++) {
      const rs = await batch(30);
      for (const r of rs) assert.equal(r.status, 200);
    }
    const over = await fetch(base);
    assert.equal(over.status, 429, '301st request is rate limited');
    assert.ok(over.headers.get('retry-after'), 'Retry-After header present');
    const body = (await over.json()) as any;
    assert.equal(body.error, 'rate_limited');
  });
});
