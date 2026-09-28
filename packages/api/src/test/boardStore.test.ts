/**
 * boardStore tests — the Supabase-backed scan journal (migration 009).
 *
 * Supabase is faked in-memory (test/helpers/fakeBoardStore.ts), which
 * emulates the `vapor.board_bookends` view with the same bookend rule as
 * the migration. Covers: journaling + board-row math, seed adoption,
 * trailing-window reads for movers, the per-host prune cap, and the
 * seed-fallback behavior when Supabase isn't configured.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordBoardScan,
  getBoard,
  getLiveHost,
  getHostsScannedSince,
  BOARD_SCAN_CAP,
} from '../lib/boardStore';
import { withFakeBoardScans } from './helpers/fakeBoardStore';
import { ALGO_VERSION, tierFor, type ScanResult, type Tier } from '../lib/score';
import { scorePage } from '../lib/score';
import { getSeedEntries, getSeedResults } from '../lib/seed';
import { getProfile } from '../lib/profile';

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
    url: 'https://journal.test/',
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

describe('boardStore', () => {
  it('recordBoardScan journals a scan and returns its board row', async () => {
    await withFakeBoardScans([], async (rows) => {
      const row = await recordBoardScan({
        finalUrl: 'https://newjournal.test/',
        result: fakeResult(70, '2026-09-20T10:00:00.000Z'),
      });
      assert.ok(row);
      assert.equal(row.domain, 'newjournal.test');
      assert.equal(row.sniff_score, 70);
      assert.equal(row.delta, null); // single scan: no delta yet
      assert.equal(rows.length, 1);
      assert.equal(rows[0].domain, 'newjournal.test');
      assert.equal(
        (rows[0].result as ScanResult).scanned_at,
        '2026-09-20T10:00:00.000Z',
      );
    });
  });

  it('re-scans append chapters; delta spans oldest→latest of the latest version', async () => {
    await withFakeBoardScans([], async () => {
      await recordBoardScan({
        finalUrl: 'https://arc.test/',
        result: fakeResult(60, '2026-09-18T10:00:00.000Z'),
      });
      const row = await recordBoardScan({
        finalUrl: 'https://arc.test/',
        result: fakeResult(80, '2026-09-20T10:00:00.000Z'),
      });
      assert.equal(row?.delta, 20);
      const host = await getLiveHost('arc.test');
      assert.ok(host);
      assert.equal(host.scans.length, 2);
      assert.equal(host.scans[0].sniff_score, 80); // newest first
      assert.equal(host.scans[1].sniff_score, 60);
    });
  });

  it('adopts the seed scan as history chapter 1 on first live sighting', async () => {
    await withFakeBoardScans([], async () => {
      const seed = getSeedResults().find((e) => e.domain === 'apple.com');
      assert.ok(seed, 'apple.com must be a seed host');
      const live = fakeResult(70, '2026-09-20T10:00:00.000Z');
      const row = await recordBoardScan({
        finalUrl: 'https://apple.com/',
        result: live,
      });
      const host = await getLiveHost('apple.com');
      assert.ok(host);
      assert.equal(host.scans.length, 2);
      assert.deepEqual(host.scans[1], seed.result); // seed is the oldest chapter
      // The board delta frames against the adopted seed, same as the
      // in-memory journal did.
      assert.equal(row?.delta, 70 - seed.result.sniff_score);
    });
  });

  it('getBoard merges live rows with untouched seeds, sorted', async () => {
    await withFakeBoardScans([], async () => {
      await recordBoardScan({
        finalUrl: 'https://newjournal.test/',
        result: fakeResult(95, '2026-09-20T10:00:00.000Z'),
      });
      const board = await getBoard('real');
      const live = board.find((e) => e.domain === 'newjournal.test');
      assert.ok(live);
      assert.equal(live.sniff_score, 95);
      // Seeds for never-scanned hosts are untouched.
      assert.ok(board.find((e) => e.domain === 'openai.com'));
      assert.equal(board.length, getSeedEntries().length + 1);
      // 'real' sort invariant: sniff descending.
      for (let i = 1; i < board.length; i++) {
        assert.ok(
          board[i - 1].sniff_score >= board[i].sniff_score,
          'board not sorted most-real-first',
        );
      }
    });
  });

  it('a live re-scan overrides its seed row on the board', async () => {
    await withFakeBoardScans([], async () => {
      const seed = getSeedResults().find((e) => e.domain === 'apple.com')!;
      await recordBoardScan({
        finalUrl: 'https://apple.com/',
        result: fakeResult(10, '2026-09-20T10:00:00.000Z'),
      });
      const board = await getBoard('real');
      const rows = board.filter((e) => e.domain === 'apple.com');
      assert.equal(rows.length, 1); // live wins, no duplicate
      assert.equal(rows[0].sniff_score, 10);
      assert.notEqual(rows[0].sniff_score, seed.result.sniff_score);
    });
  });

  it('getHostsScannedSince returns in-window histories, newest first', async () => {
    await withFakeBoardScans([], async () => {
      await recordBoardScan({
        finalUrl: 'https://recent.test/',
        result: fakeResult(70, '2026-09-22T10:00:00.000Z'),
      });
      await recordBoardScan({
        finalUrl: 'https://recent.test/',
        result: fakeResult(75, '2026-09-23T10:00:00.000Z'),
      });
      await recordBoardScan({
        finalUrl: 'https://old.test/',
        result: fakeResult(70, '2026-08-01T10:00:00.000Z'),
      });
      const hosts = await getHostsScannedSince('2026-09-15T00:00:00.000Z');
      assert.equal(hosts.length, 1);
      assert.equal(hosts[0].domain, 'recent.test');
      assert.equal(hosts[0].scans.length, 2);
      assert.equal(hosts[0].scans[0].sniff_score, 75);
    });
  });

  it('prunes per-host history to BOARD_SCAN_CAP chapters', async () => {
    await withFakeBoardScans([], async (rows) => {
      for (let i = 0; i < BOARD_SCAN_CAP + 5; i++) {
        const iso = new Date(Date.UTC(2026, 8, 20, 10, i)).toISOString();
        await recordBoardScan({
          finalUrl: 'https://chatty.test/',
          result: fakeResult(50 + (i % 10), iso),
        });
      }
      const mine = rows.filter((r) => r.domain === 'chatty.test');
      assert.equal(mine.length, BOARD_SCAN_CAP);
      // The survivors are the LATEST chapters.
      const oldest = mine
        .map((r) => (r.result as ScanResult).scanned_at)
        .sort()[0];
      assert.equal(
        oldest,
        new Date(Date.UTC(2026, 8, 20, 10, 5)).toISOString(),
      );
    });
  });

  it('falls back to the seed board when Supabase is not configured', async () => {
    // No fake installed: getSupabase() throws → seed-only board, sorted.
    const board = await getBoard('real');
    assert.deepEqual(
      board.map((e) => e.domain).sort(),
      getSeedEntries().map((e) => e.domain).sort(),
    );
  });

  it('getLiveHost returns null for never-scanned hosts and on read failure', async () => {
    await withFakeBoardScans([], async () => {
      assert.equal(await getLiveHost('never-scanned-xyz.test'), null);
    });
    // No fake installed → read failure → null (callers fall back to seeds).
    assert.equal(await getLiveHost('never-scanned-xyz.test'), null);
  });

  it('getHostsScannedSince returns [] on read failure', async () => {
    assert.deepEqual(await getHostsScannedSince('2026-09-15T00:00:00.000Z'), []);
  });
});

const VAPOROUS_HTML = `
  <html><head><title>HyperAI — Revolutionary</title></head><body>
  <h1>Our revolutionary AI-powered platform is game-changing</h1>
  <p>We're disrupting the industry with cutting-edge machine learning.
  Say goodbye to manual work. 10x your productivity effortlessly, like magic.
  Join thousands of happy customers. Trusted by teams everywhere.</p>
  </body></html>`;

const CLEAN_HTML = `
  <html><head><title>Socks — $5 a pair</title></head><body>
  <h1>We sell socks. $5 a pair.</h1>
  <p>Three colors: black, white, gray. Free shipping on orders over $20.
  Email us at hello@example.com with questions. We ship every weekday.
  Returns are free for 30 days. Copyright 2026.</p>
  </body></html>`;

describe('profiles follow the journal (integration)', () => {
  it('current = latest scan, history grows newest-first', async () => {
    await withFakeBoardScans([], async () => {
      const vaporous = scorePage(VAPOROUS_HTML, 'https://newkid.test/', new Date('2026-09-21T10:00:00.000Z'));
      const clean = scorePage(CLEAN_HTML, 'https://newkid.test/', new Date('2026-09-21T11:00:00.000Z'));
      assert.ok(
        clean.sniff_score > vaporous.sniff_score,
        'test pages must differ',
      );
      await recordBoardScan({
        finalUrl: 'https://newkid.test/',
        result: vaporous,
      });
      await recordBoardScan({
        finalUrl: 'https://newkid.test/',
        result: clean,
      });
      const p = await getProfile('newkid.test');
      assert.ok(p);
      assert.equal(p.current.sniff_score, clean.sniff_score);
      assert.equal(p.history.length, 2);
      assert.equal(p.history[0].sniff_score, clean.sniff_score, 'newest first');
      assert.equal(p.history[1].sniff_score, vaporous.sniff_score);
    });
  });

  it('a seed host re-scan updates its dossier, seed kept as oldest chapter', async () => {
    await withFakeBoardScans([], async () => {
      const clean = scorePage(CLEAN_HTML, 'https://www.stripe.com/', new Date('2026-09-21T12:00:00.000Z'));
      await recordBoardScan({
        finalUrl: 'https://www.stripe.com/',
        result: clean,
      });
      const p = await getProfile('www.stripe.com');
      assert.ok(p);
      assert.equal(p.domain, 'stripe.com');
      assert.equal(p.current.sniff_score, clean.sniff_score);
      assert.equal(p.history.length, 2, 'seed chapter + live chapter');
    });
  });
});
