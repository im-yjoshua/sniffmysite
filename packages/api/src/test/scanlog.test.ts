/**
 * Live leaderboard tests: the scan journal (lib/scanlog.ts).
 *
 * The sandbox has no usable DNS, so real POST /api/vapor/scan runs are
 * impossible here. Instead these tests walk the exact seam the route calls:
 *   scorePage(synthetic HTML)          ← the real v1 engine, zero network
 *   recordBoardScan({ finalUrl, result })  ← the same call POST /scan makes
 *   getBoard(sort) / GET /api/vapor/leaderboard  ← the real board
 * That is the full scan → journal → board path, minus the fetch.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { scorePage, type ScanResult } from '../lib/score';
import {
  recordBoardScan,
  getBoard,
  getBoardEntries,
  getLiveEntries,
  getLiveHost,
  _resetScanLog,
} from '../lib/scanlog';
import { getSeedEntries } from '../lib/seed';
import { getProfile } from '../lib/profile';
import { vaporRouter } from '../routes/vapor';

const VAPOROUS_HTML = `
  <html><head><title>HyperAI — Revolutionary</title></head><body>
  <h1>Our revolutionary AI-powered platform is game-changing</h1>
  <p>We're disrupting the industry with cutting-edge machine learning.
  Say goodbye to manual work. 10x your productivity effortlessly, like magic.
  Join thousands of happy customers. Trusted by teams everywhere.
  Our revolutionary engine delivers game-changing results on autopilot.
  Unlock your unfair advantage with our cutting-edge AI-powered platform.
  The future is here. The revolution starts now. Don't get left behind.</p>
  </body></html>`;

const CLEAN_HTML = `
  <html><head><title>Socks — $5 a pair</title></head><body>
  <h1>We sell socks. $5 a pair.</h1>
  <p>Three colors: black, white, gray. Free shipping on orders over $20.
  Email us at hello@example.com with questions. We ship every weekday.
  Returns are free for 30 days. Copyright 2026.</p>
  <a href="/pricing">Pricing</a><a href="/docs">Docs</a>
  </body></html>`;

function fakeScan(html: string, url: string, iso: string): ScanResult {
  return scorePage(html, url, new Date(iso));
}

/** Sanity: the two synthetic pages must actually land on opposite ends. */
function checkFixturesDiffer(): { vaporous: ScanResult; clean: ScanResult } {
  const vaporous = fakeScan(VAPOROUS_HTML, 'https://vapor.test/', '2026-09-21T10:00:00.000Z');
  const clean = fakeScan(CLEAN_HTML, 'https://clean.test/', '2026-09-21T10:00:00.000Z');
  assert.ok(
    clean.sniff_score > vaporous.sniff_score,
    `test pages must differ: clean=${clean.sniff_score} vaporous=${vaporous.sniff_score}`,
  );
  return { vaporous, clean };
}

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

describe('live scan journal', () => {
  beforeEach(() => _resetScanLog());

  it('a new scan appears on the board with its latest sniff score', () => {
    const { clean } = checkFixturesDiffer();
    const row = recordBoardScan({
      finalUrl: 'https://example.com/',
      result: fakeScan(CLEAN_HTML, 'https://example.com/', '2026-09-21T10:00:00.000Z'),
    });
    assert.ok(row);
    assert.equal(row.domain, 'example.com');
    assert.equal(row.sniff_score, clean.sniff_score);

    const board = getBoard('real');
    assert.equal(board.length, 21, '20 seeds + 1 live host');
    const found = board.find((e) => e.domain === 'example.com');
    assert.ok(found);
    assert.equal(found.sniff_score, clean.sniff_score);
    assert.equal(found.delta, null, 'single scan → no delta yet');
    assert.deepEqual(Object.keys(found).sort(), EXPECTED_KEYS);
  });

  it('a re-scan updates the latest score and appends history', () => {
    const { vaporous, clean } = checkFixturesDiffer();
    recordBoardScan({
      finalUrl: 'https://example.com/',
      result: fakeScan(VAPOROUS_HTML, 'https://example.com/', '2026-09-21T10:00:00.000Z'),
    });
    const row = recordBoardScan({
      finalUrl: 'https://example.com/',
      result: fakeScan(CLEAN_HTML, 'https://example.com/', '2026-09-21T11:00:00.000Z'),
    });
    assert.ok(row);
    assert.equal(row.sniff_score, clean.sniff_score, 'latest wins');
    assert.equal(row.delta, clean.sniff_score - vaporous.sniff_score);
    assert.ok((row.delta as number) > 0, 'page got more real → positive delta');

    const host = getLiveHost('example.com');
    assert.ok(host);
    assert.equal(host.scans.length, 2);
    assert.equal(host.scans[0].sniff_score, clean.sniff_score, 'history newest first');
    assert.equal(host.scans[1].sniff_score, vaporous.sniff_score);
  });

  it('a live re-scan of a fixture host overrides its entry (seed score untouched)', () => {
    const { clean } = checkFixturesDiffer();
    const seedScore = getSeedEntries().find((e) => e.domain === 'character.ai')!.sniff_score;
    assert.equal(seedScore, 48, 'fixture score is what we think it is');

    const row = recordBoardScan({
      finalUrl: 'https://www.character.ai/',
      result: fakeScan(CLEAN_HTML, 'https://www.character.ai/', '2026-09-21T12:00:00.000Z'),
    });
    assert.ok(row);
    assert.equal(row.sniff_score, clean.sniff_score, 'live scan replaces the fixture row');

    const board = getBoardEntries();
    assert.equal(board.length, 20, 'no duplicate row for the fixture host');
    assert.equal(
      board.filter((e) => e.domain === 'character.ai').length,
      1,
    );

    // The seed scan became history chapter 1 — never edited.
    const host = getLiveHost('character.ai');
    assert.ok(host);
    assert.equal(host.scans.length, 2);
    assert.equal(host.scans[1].sniff_score, seedScore, 'chapter 1 is the original seed scan');
    assert.equal(row.delta, clean.sniff_score - seedScore);

    // And the seed itself is byte-identical to before.
    const seedAfter = getSeedEntries().find((e) => e.domain === 'character.ai')!;
    assert.equal(seedAfter.sniff_score, seedScore);
    assert.equal(seedAfter.delta, null);
  });

  it('Most Improved compares scans within the same algo version only', () => {
    // Simulate a legacy v1 chapter (cast: the live type is always current).
    const legacyV1 = {
      ...fakeScan(VAPOROUS_HTML, 'https://legacy.test/', '2026-09-21T09:00:00.000Z'),
      algo_version: 'v1',
    } as unknown as ScanResult;
    recordBoardScan({ finalUrl: 'https://legacy.test/', result: legacyV1 });
    // First current-version scan: the only v2 chapter → no delta yet.
    // A v1→v2 formula jump must not masquerade as "improvement".
    const row1 = recordBoardScan({
      finalUrl: 'https://legacy.test/',
      result: fakeScan(VAPOROUS_HTML, 'https://legacy.test/', '2026-09-21T10:00:00.000Z'),
    });
    assert.ok(row1);
    assert.equal(row1.delta, null, 'single v2 chapter → no delta across versions');

    // Second current-version scan: delta now compares v2↔v2.
    const { vaporous, clean } = checkFixturesDiffer();
    const row2 = recordBoardScan({
      finalUrl: 'https://legacy.test/',
      result: fakeScan(CLEAN_HTML, 'https://legacy.test/', '2026-09-21T11:00:00.000Z'),
    });
    assert.ok(row2);
    assert.equal(
      row2.delta,
      clean.sniff_score - vaporous.sniff_score,
      'delta is latest v2 minus first v2, ignoring the legacy chapter',
    );
  });

  it('www/case/path variants dedupe to a single host', () => {
    recordBoardScan({
      finalUrl: 'https://WWW.Example.COM/',
      result: fakeScan(VAPOROUS_HTML, 'https://WWW.Example.COM/', '2026-09-21T10:00:00.000Z'),
    });
    const row = recordBoardScan({
      finalUrl: 'https://example.com/pricing?utm_source=x',
      result: fakeScan(CLEAN_HTML, 'https://example.com/pricing', '2026-09-21T11:00:00.000Z'),
    });
    assert.ok(row);
    assert.equal(row.domain, 'example.com');

    const board = getBoardEntries();
    assert.equal(
      board.filter((e) => e.domain === 'example.com').length,
      1,
      'www/case/path variants never double-list',
    );
    assert.equal(board.length, 21);
    assert.equal(getLiveHost('example.com')!.scans.length, 2);
  });

  it('Most Improved ranks biggest sniff gains first, nulls last', () => {
    const { vaporous, clean } = checkFixturesDiffer();
    // Big glow-up: vaporous → clean.
    recordBoardScan({
      finalUrl: 'https://glowup.test/',
      result: fakeScan(VAPOROUS_HTML, 'https://glowup.test/', '2026-09-21T10:00:00.000Z'),
    });
    recordBoardScan({
      finalUrl: 'https://glowup.test/',
      result: fakeScan(CLEAN_HTML, 'https://glowup.test/', '2026-09-21T11:00:00.000Z'),
    });
    // Got worse: clean → vaporous.
    recordBoardScan({
      finalUrl: 'https://downbad.test/',
      result: fakeScan(CLEAN_HTML, 'https://downbad.test/', '2026-09-21T10:00:00.000Z'),
    });
    recordBoardScan({
      finalUrl: 'https://downbad.test/',
      result: fakeScan(VAPOROUS_HTML, 'https://downbad.test/', '2026-09-21T11:00:00.000Z'),
    });
    // Single scan: no history, no delta.
    recordBoardScan({
      finalUrl: 'https://onetime.test/',
      result: fakeScan(CLEAN_HTML, 'https://onetime.test/', '2026-09-21T10:00:00.000Z'),
    });

    const improved = getBoard('improved');
    const idx = (d: string) => improved.findIndex((e) => e.domain === d);
    assert.ok(idx('glowup.test') < idx('downbad.test'), 'biggest gain first');
    assert.ok(idx('downbad.test') < idx('onetime.test'), 'negative delta before null');
    assert.equal(improved[idx('glowup.test')].delta, clean.sniff_score - vaporous.sniff_score);
    assert.equal(improved[idx('downbad.test')].delta, vaporous.sniff_score - clean.sniff_score);
    assert.equal(improved[idx('onetime.test')].delta, null);
    // The 20 untouched seeds still sit at the back, nulls, alphabetical.
    const nulls = improved.filter((e) => e.delta === null).map((e) => e.domain);
    assert.deepEqual(nulls, [...nulls].sort());
  });

  it('empty journal keeps the honest empty state: every delta null', () => {
    const improved = getBoard('improved');
    assert.equal(improved.length, 20);
    assert.ok(improved.every((e) => e.delta === null));
  });

  it('leaderboard shape is identical for live rows and seed rows', () => {
    recordBoardScan({
      finalUrl: 'https://example.com/',
      result: fakeScan(CLEAN_HTML, 'https://example.com/', '2026-09-21T10:00:00.000Z'),
    });
    for (const e of getBoardEntries()) {
      assert.deepEqual(Object.keys(e).sort(), EXPECTED_KEYS, e.domain);
    }
    for (const e of getLiveEntries()) {
      assert.deepEqual(Object.keys(e).sort(), EXPECTED_KEYS, e.domain);
    }
  });

  it('garbage final URLs are rejected and never journaled', () => {
    const row = recordBoardScan({
      finalUrl: 'not a url at all',
      result: fakeScan(CLEAN_HTML, 'https://example.com/', '2026-09-21T10:00:00.000Z'),
    });
    assert.equal(row, null);
    assert.equal(getBoardEntries().length, 20);
  });

  it('profiles follow the journal: current = latest scan, history grows', () => {
    const { vaporous, clean } = checkFixturesDiffer();
    recordBoardScan({
      finalUrl: 'https://newkid.test/',
      result: fakeScan(VAPOROUS_HTML, 'https://newkid.test/', '2026-09-21T10:00:00.000Z'),
    });
    recordBoardScan({
      finalUrl: 'https://newkid.test/',
      result: fakeScan(CLEAN_HTML, 'https://newkid.test/', '2026-09-21T11:00:00.000Z'),
    });
    const p = getProfile('newkid.test');
    assert.ok(p);
    assert.equal(p.current.sniff_score, clean.sniff_score);
    assert.equal(p.history.length, 2);
    assert.equal(p.history[0].sniff_score, clean.sniff_score, 'newest first');
    assert.equal(p.history[1].sniff_score, vaporous.sniff_score);
  });

  it('a fixture host re-scan updates its dossier too', () => {
    const { clean } = checkFixturesDiffer();
    recordBoardScan({
      finalUrl: 'https://www.stripe.com/',
      result: fakeScan(CLEAN_HTML, 'https://www.stripe.com/', '2026-09-21T12:00:00.000Z'),
    });
    const p = getProfile('www.stripe.com');
    assert.ok(p);
    assert.equal(p.domain, 'stripe.com');
    assert.equal(p.current.sniff_score, clean.sniff_score);
    assert.equal(p.history.length, 2, 'seed chapter + live chapter');
  });
});

describe('GET /api/vapor/leaderboard (live merge)', () => {
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

  it('merges a live scan into the endpoint response', async () => {
    _resetScanLog();
    const { clean } = checkFixturesDiffer();
    recordBoardScan({
      finalUrl: 'https://freshmeat.test/',
      result: fakeScan(CLEAN_HTML, 'https://freshmeat.test/', '2026-09-21T10:00:00.000Z'),
    });
    const { status, body } = await get('?sort=real');
    assert.equal(status, 200);
    assert.equal(body.count, 21);
    const row = body.entries.find((e: any) => e.domain === 'freshmeat.test');
    assert.ok(row, 'the new scan is on the board');
    assert.equal(row.sniff_score, clean.sniff_score);
  });

  it('live re-scan of a fixture host replaces its endpoint row', async () => {
    _resetScanLog();
    const { clean } = checkFixturesDiffer();
    recordBoardScan({
      finalUrl: 'https://character.ai/',
      result: fakeScan(CLEAN_HTML, 'https://character.ai/', '2026-09-21T10:00:00.000Z'),
    });
    const { status, body } = await get('?sort=real');
    assert.equal(status, 200);
    assert.equal(body.count, 20, 'no duplicate row');
    const row = body.entries.find((e: any) => e.domain === 'character.ai');
    assert.ok(row);
    assert.equal(row.sniff_score, clean.sniff_score, 'fixture row overridden by the live scan');
    assert.notEqual(row.sniff_score, 48, 'the old fixture score is gone from the board');

    const { body: improved } = await get('?sort=improved');
    const imp = improved.entries.find((e: any) => e.domain === 'character.ai');
    assert.ok(imp);
    assert.equal(imp.delta, clean.sniff_score - 48, 'delta vs the seed chapter');
  });
});
