/**
 * Per-host sniff tallies + GET /api/vapor/trending.
 *
 * Covers: count increments only on recorded (successful) scans, the latest
 * sniff score/tier always reflecting the most recent scan, newest-scan
 * tiebreak, the 10-host cap, the empty-tally shape, public-field privacy
 * (host only — no emails, IPs, or full URLs), and sane 429 behavior on the
 * endpoint.
 *
 * "Only successful scans count" is tested at the recordRecentScan seam (the
 * exact call the POST /scan route makes on every successful scan — failures
 * never reach it, so there's nothing to record).
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  TRENDING_MAX,
  recordRecentScan,
  getTrendingHosts,
  _resetTrendingScans,
  type RecentScanInput,
} from '../lib/recent.js';
import { vaporRouter } from '../routes/vapor.js';
import { _resetRateLimits } from '../lib/ratelimit.js';

function inputFor(host: string, sniff = 74, at = '2026-09-21T12:00:00Z'): RecentScanInput {
  return {
    finalUrl: `https://${host}/some/landing/page`,
    vapor_score: 100 - sniff,
    sniff_score: sniff,
    tier: sniff >= 81 ? 'CERTIFIED REAL' : sniff >= 61 ? 'ALMOST REAL' : 'SUS',
    scanned_at: new Date(at).toISOString(),
  };
}

describe('per-host sniff tallies', () => {
  beforeEach(() => _resetTrendingScans());

  it('counts one sniff per recorded successful scan', () => {
    recordRecentScan(inputFor('example.org', 70));
    recordRecentScan(inputFor('example.org', 80));
    const [top] = getTrendingHosts();
    assert.ok(top);
    assert.equal(top.host, 'example.org');
    assert.equal(top.slug, 'example.org');
    assert.equal(top.sniff_count, 2);
  });

  it('only counts scans that reach recordRecentScan (failures never get here)', () => {
    // POST /scan only calls recordRecentScan on success, so "only
    // successful scans count" is structural — what this asserts is that
    // a failed parse never tallies anything.
    const rec = recordRecentScan({
      ...inputFor('example.org'),
      finalUrl: 'not a url at all',
    });
    assert.equal(rec, null);
    assert.deepEqual(getTrendingHosts(), []);
  });

  it('latest_sniff_score and tier reflect the most recent scan', () => {
    recordRecentScan(inputFor('example.org', 40, '2026-09-21T12:00:00Z'));
    recordRecentScan(inputFor('example.org', 88, '2026-09-21T13:00:00Z'));
    const [top] = getTrendingHosts();
    assert.equal(top.sniff_count, 2);
    assert.equal(top.latest_sniff_score, 88);
    assert.equal(top.tier, 'CERTIFIED REAL');
  });

  it('www and path variants of one domain tally together', () => {
    recordRecentScan(inputFor('www.example.org', 70));
    recordRecentScan(inputFor('example.org', 75));
    const hosts = getTrendingHosts();
    assert.equal(hosts.length, 1);
    assert.equal(hosts[0].sniff_count, 2);
    assert.equal(hosts[0].host, 'example.org');
  });

  it('sorts most-sniffed first; ties break toward the latest scan', () => {
    recordRecentScan(inputFor('old.example', 60, '2026-09-21T10:00:00Z'));
    recordRecentScan(inputFor('busy.example', 60, '2026-09-21T11:00:00Z'));
    recordRecentScan(inputFor('busy.example', 61, '2026-09-21T12:00:00Z'));
    recordRecentScan(inputFor('fresh.example', 60, '2026-09-21T13:00:00Z'));
    const hosts = getTrendingHosts().map((h) => h.host);
    assert.deepEqual(hosts, ['busy.example', 'fresh.example', 'old.example']);
  });

  it('caps at 10 hosts', () => {
    assert.equal(TRENDING_MAX, 10);
    for (let i = 0; i < 14; i++) {
      recordRecentScan(inputFor(`site${i}.example`, 50));
    }
    assert.equal(getTrendingHosts().length, 10);
    assert.equal(getTrendingHosts(3).length, 3, 'custom limit honored');
  });
});

describe('GET /api/vapor/trending', () => {
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
    base = `http://127.0.0.1:${port}/api/vapor/trending`;
  });

  after(
    async () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  );

  beforeEach(() => {
    _resetRateLimits();
    _resetTrendingScans();
  });

  it('empty tally → { count: 0, hosts: [] }', async () => {
    const res = await fetch(base);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.deepEqual(body, { count: 0, hosts: [] });
  });

  it('returns top hosts with only public fields', async () => {
    recordRecentScan(inputFor('character.ai', 53));
    recordRecentScan(inputFor('example.org', 90));
    recordRecentScan(inputFor('example.org', 85));
    const res = await fetch(base);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.count, 2);
    assert.equal(body.hosts[0].host, 'example.org');
    assert.equal(body.hosts[0].sniff_count, 2);
    assert.equal(body.hosts[0].latest_sniff_score, 85);
    assert.equal(body.hosts[1].host, 'character.ai');
    for (const h of body.hosts) {
      assert.deepEqual(
        Object.keys(h).sort(),
        [
          'has_profile',
          'host',
          'latest_sniff_score',
          'slug',
          'sniff_count',
          'tier',
        ].sort(),
        'only the documented public fields',
      );
      assert.ok(!h.host.includes('/') && !h.host.includes('@'));
      assert.ok(!h.host.includes('http'));
    }
  });

  it('has_profile is true for a board-listed host, false otherwise', async () => {
    recordRecentScan(inputFor('character.ai', 53));
    recordRecentScan(inputFor('example.org', 74));
    const body = (await (await fetch(base)).json()) as any;
    const byHost = Object.fromEntries(
      body.hosts.map((h: any) => [h.host, h]),
    );
    assert.equal(byHost['character.ai'].has_profile, true);
    assert.equal(byHost['example.org'].has_profile, false);
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
