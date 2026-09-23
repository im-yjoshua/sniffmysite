/**
 * Biggest-movers roundup — GET /api/vapor/movers.
 *
 * Covers: same-algo-version gating (a v1→v2 formula jump never appears as
 * a mover — the Most Improved rule), |delta| ordering per side, the 10/side
 * cap, trailing-window filtering, the honest thin-window note, and 400 on
 * an invalid `?window=`.
 *
 * Seeds via recordBoardScan (the same seam POST /scan uses) with synthetic
 * ScanResults on `.test` domains — never seed-listed hosts, so no adopted
 * seed chapters interfere with the window math. Real scans can't run in
 * this sandbox (DNS is blocked, so fetchPage always 403s).
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  getMovers,
  isMoversWindow,
  MOVERS_PER_SIDE,
  type MoversWindow,
} from '../lib/movers.js';
import {
  recordBoardScan,
  _resetScanLog,
} from '../lib/scanlog.js';
import { vaporRouter } from '../routes/vapor.js';
import { _resetRateLimits } from '../lib/ratelimit.js';
import { ALGO_VERSION, tierFor, type ScanResult, type Tier } from '../lib/score.js';

const NOW = new Date('2026-09-23T12:00:00.000Z').getTime();
const isoAgo = (days: number) =>
  new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

function fakeResult(
  score: number,
  iso: string,
  algoVersion: string = ALGO_VERSION,
): ScanResult {
  const tier: Tier = tierFor(score);
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
    url: 'https://mover.test/',
    scanned_at: iso,
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

/** Record one scan for a host, newest-first ordering handled by the log. */
function scan(host: string, score: number, daysAgo: number, algo: string = ALGO_VERSION) {
  const r = recordBoardScan({
    finalUrl: `https://${host}/`,
    result: fakeResult(score, isoAgo(daysAgo), algo),
  });
  assert.ok(r, `recordBoardScan failed for ${host}`);
}

describe('isMoversWindow', () => {
  it('accepts 7d and 30d only', () => {
    assert.equal(isMoversWindow('7d'), true);
    assert.equal(isMoversWindow('30d'), true);
    assert.equal(isMoversWindow('1d'), false);
    assert.equal(isMoversWindow('7D'), false);
    assert.equal(isMoversWindow(''), false);
    assert.equal(isMoversWindow(undefined), false);
  });
});

describe('getMovers', () => {
  beforeEach(() => _resetScanLog());

  it('ranks gainers and losers by |delta|, newest minus oldest in-window', () => {
    // gainer.test: 60 → 75 (delta +15); loser.test: 80 → 62 (delta −18)
    scan('gainer.test', 60, 6);
    scan('gainer.test', 75, 1);
    scan('loser.test', 80, 5);
    scan('loser.test', 62, 1);
    const m = getMovers('7d', NOW);
    assert.equal(m.gainers.length, 1);
    assert.equal(m.gainers[0].domain, 'gainer.test');
    assert.equal(m.gainers[0].old_score, 60);
    assert.equal(m.gainers[0].new_score, 75);
    assert.equal(m.gainers[0].delta, 15);
    assert.equal(m.losers.length, 1);
    assert.equal(m.losers[0].delta, -18);
    assert.equal(m.hosts_tracked, 2);
    assert.equal(m.window, '7d');
  });

  it('never mixes algo versions — a v1→v2 jump is not a move', () => {
    scan('mixed.test', 40, 6, 'v1');
    scan('mixed.test', 90, 1, 'v2');
    const m = getMovers('7d', NOW);
    assert.equal(m.gainers.length, 0);
    assert.equal(m.losers.length, 0);
    assert.equal(m.hosts_tracked, 0);
  });

  it('anchors on the latest scan: only same-version scans count', () => {
    // v1,v1 old chapters + two v2 chapters in window → delta from the v2 pair
    scan('anchored.test', 30, 6, 'v1');
    scan('anchored.test', 35, 5, 'v1');
    scan('anchored.test', 70, 2, 'v2');
    scan('anchored.test', 85, 1, 'v2');
    const m = getMovers('7d', NOW);
    assert.equal(m.gainers.length, 1);
    assert.equal(m.gainers[0].old_score, 70);
    assert.equal(m.gainers[0].new_score, 85);
    assert.equal(m.gainers[0].delta, 15);
  });

  it('ignores scans outside the trailing window', () => {
    scan('stale.test', 50, 20);
    scan('stale.test', 90, 1);
    const m7 = getMovers('7d', NOW);
    assert.equal(m7.hosts_tracked, 0, '20-day-old scan is outside 7d');
    const m30 = getMovers('30d', NOW);
    assert.equal(m30.hosts_tracked, 1, 'both scans inside 30d');
    assert.equal(m30.gainers[0].delta, 40);
  });

  it('a single scan in the window never qualifies', () => {
    scan('lonely.test', 70, 1);
    const m = getMovers('7d', NOW);
    assert.equal(m.hosts_tracked, 0);
  });

  it('orders each side by |delta| descending and caps at 10', () => {
    for (let i = 1; i <= 12; i++) {
      // deltas +1..+12 → gainers sorted 12,11,…,3 (top 10)
      scan(`cap${i}.test`, 50, 3);
      scan(`cap${i}.test`, 50 + i, 1);
    }
    const m = getMovers('7d', NOW);
    assert.equal(m.gainers.length, MOVERS_PER_SIDE);
    assert.equal(m.gainers[0].delta, 12);
    assert.equal(m.gainers[9].delta, 3);
    assert.ok(
      m.gainers.every((g, i, a) => i === 0 || Math.abs(a[i - 1].delta) >= Math.abs(g.delta)),
      'gainers sorted by |delta| desc',
    );
  });

  it('zero-delta hosts count as tracked but appear on neither list', () => {
    scan('flat.test', 70, 3);
    scan('flat.test', 70, 1);
    const m = getMovers('7d', NOW);
    assert.equal(m.hosts_tracked, 1);
    assert.equal(m.gainers.length, 0);
    assert.equal(m.losers.length, 0);
  });

  it('thin window → honest note; full window → no note', () => {
    scan('thin1.test', 60, 3);
    scan('thin1.test', 75, 1);
    const thin = getMovers('7d', NOW);
    assert.ok(thin.note, 'note present when <5 qualify');
    assert.match(thin.note!, /Early days/);
    assert.match(thin.note!, /only 1 site has two sniffs this week/);

    for (let i = 2; i <= 6; i++) {
      scan(`thin${i}.test`, 60, 3);
      scan(`thin${i}.test`, 75, 1);
    }
    const full = getMovers('7d', NOW);
    assert.equal(full.hosts_tracked, 6);
    assert.equal(full.note, undefined);
  });

  it('30d thin note names the 30-day span', () => {
    const m = getMovers('30d', NOW);
    assert.match(m.note!, /last 30 days/);
  });

  it('rows link to dossiers: slug + has_profile present', () => {
    scan('gainer.test', 60, 3);
    scan('gainer.test', 75, 1);
    const m = getMovers('7d', NOW);
    assert.equal(m.gainers[0].slug, 'gainer.test');
    assert.equal(typeof m.gainers[0].has_profile, 'boolean');
  });
});

describe('GET /api/vapor/movers', () => {
  let app: Express;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    _resetScanLog();
    _resetRateLimits();
    app = express();
    app.use('/api/vapor', vaporRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });

  async function teardown() {
    await new Promise<void>((resolve, reject) => {
      server.close((e) => (e ? reject(e) : resolve()));
    });
  }

  it('defaults to 7d and returns the documented shape', async () => {
    try {
      const res = await fetch(`${base}/api/vapor/movers`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        window: MoversWindow;
        generated_at: string;
        gainers: unknown[];
        losers: unknown[];
        hosts_tracked: number;
        note?: string;
      };
      assert.equal(body.window, '7d');
      assert.ok(body.generated_at);
      assert.ok(Array.isArray(body.gainers));
      assert.ok(Array.isArray(body.losers));
      assert.equal(typeof body.hosts_tracked, 'number');
      assert.ok(body.note, 'empty journal → thin note');
    } finally {
      await teardown();
    }
  });

  it('rejects an invalid window with 400 + a friendly message', async () => {
    try {
      const res = await fetch(`${base}/api/vapor/movers?window=1y`);
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: string; detail: string };
      assert.equal(body.error, 'invalid_window');
      assert.match(body.detail, /7d.*30d/);
    } finally {
      await teardown();
    }
  });

  it('accepts window=30d', async () => {
    try {
      const res = await fetch(`${base}/api/vapor/movers?window=30d`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { window: MoversWindow };
      assert.equal(body.window, '30d');
    } finally {
      await teardown();
    }
  });
});
