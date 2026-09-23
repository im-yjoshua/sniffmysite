/**
 * Leaderboard tests (Task 6 + Sniff Score flip): seed shape, sort
 * correctness, and the GET /api/vapor/leaderboard endpoint contract.
 *
 * The engine still measures vapor internally; the public board ranks the
 * FLIPPED number — sniff = 100 − vapor. "Most Vapor" sorts sniff ascending
 * (the Wall of Shame), "Most Real" sorts sniff descending (the prize),
 * and "Most Improved" ranks positive sniff deltas first.
 *
 * The route test spins up an ephemeral Express app — zero new dependencies,
 * same pattern as fetch.test.ts (node:http + global fetch).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import {
  getLeaderboard,
  getSeedEntries,
  sortImproved,
  type LeaderboardEntry,
} from '../lib/seed';
import { vaporRouter } from '../routes/vapor';
import { ALGO_VERSION } from '../lib/score';

const EXPECTED_KEYS = [
  'domain',
  'vapor_score',
  'sniff_score',
  'tier',
  'metrics',
  'scanned_at',
  'algo_version',
  'delta',
].sort();

describe('seed data', () => {
  it('loads the 20 Task-4 fixture pages with the full entry shape', () => {
    const entries = getSeedEntries();
    assert.equal(entries.length, 20, `expected 20 seed entries, got ${entries.length}`);
    for (const e of entries) {
      assert.deepEqual(Object.keys(e).sort(), EXPECTED_KEYS);
      assert.equal(e.algo_version, ALGO_VERSION);
      assert.equal(e.delta, null, `${e.domain}: seed entries are single snapshots`);
      assert.ok(typeof e.domain === 'string' && e.domain.length > 0);
      assert.ok(e.vapor_score >= 0 && e.vapor_score <= 100);
      // The public number is the flip: sniff = 100 − vapor.
      assert.equal(e.sniff_score, 100 - e.vapor_score, `${e.domain}: sniff flip`);
      assert.ok(!Number.isNaN(Date.parse(e.scanned_at)), 'scanned_at is ISO');
    }
  });

  it('sort=vapor puts the most vapor first (sniff ascending — the Wall of Shame)', () => {
    const entries = getLeaderboard('vapor');
    assert.equal(entries.length, 20);
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1];
      const cur = entries[i];
      assert.ok(
        prev.sniff_score < cur.sniff_score ||
          (prev.sniff_score === cur.sniff_score && prev.domain < cur.domain),
        `out of order at ${i}: ${prev.domain}=${prev.sniff_score} vs ${cur.domain}=${cur.sniff_score}`,
      );
    }
    // character.ai is still the most vapor (52) → the lowest sniff (48).
    assert.equal(entries[0].domain, 'character.ai');
    assert.equal(entries[0].sniff_score, 48);
  });

  it('sort=real puts the most real first (sniff descending — the prize)', () => {
    const entries = getLeaderboard('real');
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1];
      const cur = entries[i];
      assert.ok(
        prev.sniff_score > cur.sniff_score ||
          (prev.sniff_score === cur.sniff_score && prev.domain < cur.domain),
        `out of order at ${i}`,
      );
    }
    // apple.com is the least vapor (8) → the highest sniff (92).
    assert.equal(entries[0].domain, 'apple.com');
    assert.equal(entries[0].sniff_score, 92);
  });

  it('sort=improved is stable alphabetical with delta: null everywhere', () => {
    const entries = getLeaderboard('improved');
    const domains = entries.map((e) => e.domain);
    assert.deepEqual(domains, [...domains].sort());
    assert.ok(entries.every((e) => e.delta === null));
  });

  it('sortImproved ranks positive SNIFF deltas first, nulls last', () => {
    // Most Improved means the page got MORE real — a vapor drop is a sniff
    // gain, so the sort keys off positive sniff deltas descending.
    const make = (domain: string, delta: number | null): LeaderboardEntry =>
      ({
        domain,
        vapor_score: 0,
        sniff_score: 0,
        tier: 'SUS' as const,
        metrics: {
          buzzword_density: 0,
          claim_to_proof: 0,
          vague_verb: 0,
          social_proof: 0,
          pricing_opacity: 0,
          freshness: 0,
        },
        scanned_at: '2026-09-20T12:00:00.000Z',
        algo_version: ALGO_VERSION,
        delta,
      }) as LeaderboardEntry;
    const ranked = sortImproved([
      make('zz-no-history.io', null),
      make('worse.io', -12),
      make('better.io', 25),
      make('aa-no-history.io', null),
    ]);
    assert.deepEqual(
      ranked.map((e) => e.domain),
      ['better.io', 'worse.io', 'aa-no-history.io', 'zz-no-history.io'],
      'positive sniff gain first, then negative, then nulls alphabetical',
    );
  });

  it('does not mutate the underlying seed across sorts', () => {
    getLeaderboard('vapor');
    getLeaderboard('real');
    const again = getSeedEntries();
    assert.equal(again.length, 20);
  });
});

describe('GET /api/vapor/leaderboard', () => {
  let app: Express;
  let server: Server;
  let base: string;

  before(async () => {
    app = express();
    app.use('/api/vapor', vaporRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}/api/vapor/leaderboard`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  async function get(path: string) {
    const res = await fetch(base + path);
    return { status: res.status, body: (await res.json()) as any };
  }

  it('defaults to sort=real, Most Real first (highest sniff first)', async () => {
    const { status, body } = await get('');
    assert.equal(status, 200);
    assert.equal(body.sort, 'real');
    assert.equal(body.count, 20);
    assert.equal(body.algo_version, 'v2');
    assert.equal(body.entries[0].domain, 'apple.com');
    assert.equal(body.entries[0].sniff_score, 92);
    assert.ok(body.entries[0].sniff_score >= body.entries[1].sniff_score);
  });

  it('sort=vapor returns the Wall of Shame (sniff ascending)', async () => {
    const { status, body } = await get('?sort=vapor');
    assert.equal(status, 200);
    assert.equal(body.sort, 'vapor');
    assert.equal(body.entries[0].domain, 'character.ai');
    const scores = body.entries.map((e: any) => e.sniff_score);
    assert.deepEqual(scores, [...scores].sort((a, b) => a - b));
  });

  it('sort=improved returns delta: null on every entry', async () => {
    const { status, body } = await get('?sort=improved');
    assert.equal(status, 200);
    assert.equal(body.sort, 'improved');
    assert.equal(body.entries.length, 20);
    assert.ok(body.entries.every((e: any) => e.delta === null));
  });

  it('rejects unknown sort values with 400 invalid_sort', async () => {
    for (const bad of ['?sort=bogus', '?sort=VAPOR', '?sort=vapor,real']) {
      const { status, body } = await get(bad);
      assert.equal(status, 400, bad);
      assert.equal(body.error, 'invalid_sort');
    }
  });
});
