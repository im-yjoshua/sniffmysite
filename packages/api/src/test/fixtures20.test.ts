/**
 * 20-site fixture suite for the Vapor Score v1 engine.
 *
 * Each fixture is {domain, url, html} JSON captured from the site's real
 * public landing page on 2026-09-20 (sanitized: scripts/styles stripped,
 * <head> reduced to <title>, body truncated head+tail to ~60KB).
 * Two substitutions from the original plan: perplexity.ai returned 403, so
 * deepseek.com takes its slot; openai.com's apex refused connections, so the
 * fixture was captured from www.openai.com.
 *
 * What this proves: the engine doesn't crash on real-world markup, its
 * scores spread across tiers instead of calling everything vapor (or
 * nothing), and scoring is deterministic.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { scorePage, tierFor, ALGO_VERSION, type ScanResult } from '../lib/score';

const FIXED_NOW = new Date('2026-09-20T12:00:00.000Z');
// Tests run from dist/test/; copy:fixtures places the JSON next to them.
const FIXTURE_DIR = join(dirname(__filename), 'fixtures');

interface Fixture {
  domain: string;
  url: string;
  html: string;
}

function loadFixtures(): Fixture[] {
  const files = readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  return files.map((f) => JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8')) as Fixture);
}

function scoreAll(): Array<{ fixture: Fixture; result: ScanResult }> {
  return loadFixtures().map((fixture) => ({
    fixture,
    result: scorePage(fixture.html, fixture.url, FIXED_NOW),
  }));
}

const VALID_TIERS = [
  'CERTIFIED REAL',
  'ALMOST REAL',
  'SUS',
  'JUST VIBES',
  'CERTIFIED FAKE',
] as const;

describe('20-site fixture suite (vapor v2 engine, sniff v2 display)', () => {
  it('loads exactly 20 fixtures', () => {
    const fixtures = loadFixtures();
    assert.equal(fixtures.length, 20, `expected 20 fixtures, got ${fixtures.length}`);
    for (const f of fixtures) {
      assert.ok(f.domain.length > 0);
      assert.ok(f.url.startsWith('https://'));
      assert.ok(f.html.length > 100, `${f.domain}: fixture suspiciously small`);
    }
  });

  it('scores every fixture without crashing, with a valid result shape', () => {
    for (const { fixture, result } of scoreAll()) {
      assert.ok(
        Number.isInteger(result.vapor_score) && result.vapor_score >= 0 && result.vapor_score <= 100,
        `${fixture.domain}: bad score ${result.vapor_score}`,
      );
      // The public number is the flip; the tier is keyed off it.
      assert.equal(result.sniff_score, 100 - result.vapor_score, `${fixture.domain}: sniff flip`);
      assert.ok(
        (VALID_TIERS as readonly string[]).includes(result.tier),
        `${fixture.domain}: bad tier ${result.tier}`,
      );
      assert.equal(result.tier, tierFor(result.sniff_score), `${fixture.domain}: tier mismatch`);
      assert.equal(result.algo_version, 'v2');
      assert.equal(result.algo_version, ALGO_VERSION);
      assert.match(result.snapshot_hash, /^[0-9a-f]{64}$/, `${fixture.domain}: bad hash`);
      assert.ok(result.verdict.includes(`${result.sniff_score}/100`), `${fixture.domain}: verdict missing score`);
      for (const m of Object.values(result.metrics)) {
        assert.ok(m >= 0 && m <= 100, `${fixture.domain}: metric out of range`);
      }
    }
  });

  it('spans at least 3 of the 5 tiers (no flatline)', () => {
    const tiers = new Set(scoreAll().map(({ result }) => result.tier));
    assert.ok(
      tiers.size >= 3,
      `only ${tiers.size} tier(s) hit: ${[...tiers].join(', ')} — engine is not discriminating`,
    );
  });

  it('is deterministic: same fixture scored twice → byte-identical', () => {
    const fixtures = loadFixtures();
    for (const f of fixtures.slice(0, 5)) {
      const a = scorePage(f.html, f.url, FIXED_NOW);
      const b = scorePage(f.html, f.url, FIXED_NOW);
      assert.equal(JSON.stringify(a), JSON.stringify(b), `${f.domain}: non-deterministic`);
    }
  });

  it('quotes the page back at itself on the vapor end (verdict integrity)', () => {
    const scored = scoreAll().sort((x, y) => y.result.vapor_score - x.result.vapor_score);
    const top = scored[0];
    assert.ok(top.result.verdict.includes('"'), `${top.fixture.domain}: top verdict quotes nothing`);
  });
});
