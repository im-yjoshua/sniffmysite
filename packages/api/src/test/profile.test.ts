/**
 * Profile + OG share card tests (Task 7 + Sniff Score flip): slug
 * normalization, the GET /api/vapor/startup/:slug contract (public
 * sniff_score on current + history), and the GET /api/vapor/og/:slug.png
 * renderer. Ephemeral Express app for route tests — zero new dependencies.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { normalizeSlug, displayName, getProfile } from '../lib/profile';
import {
  ROSETTE_COLORS,
  rosetteColor,
  rosetteBadgeLines,
  rosetteBadgeSVG,
  cardJoke,
  buildVaporCardSVG,
  getVaporCardPNG,
  vaporCardCacheKey,
  _testClearCache,
  _testCacheSize,
} from '../lib/vapor-card';
import { sniffScoreFor } from '../lib/score';
import { vaporRouter } from '../routes/vapor';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** Shared card-test evidence: a buzzy, claim-heavy page. */
const TEST_EVIDENCE = {
  words: 1200,
  sentences: 90,
  buzzword_hits: 48,
  top_phrases: [{ phrase: 'revolutionary', count: 11 }],
  claim_sentences: 9,
  evidence_links: 1,
  vague_sentences: 22,
  trust_mentions: 2,
  anonymous_testimonials: 3,
  logo_images: 4,
  has_pricing: false,
  has_price_signals: false,
  sales_only_cta: true,
  copyright_year: null,
  language_note: null,
};

describe('normalizeSlug', () => {
  it('lowercases, trims, and strips www.', () => {
    assert.equal(normalizeSlug('Character.AI'), 'character.ai');
    assert.equal(normalizeSlug('  www.character.ai  '), 'character.ai');
    assert.equal(normalizeSlug('character.ai.'), 'character.ai');
  });
  it('rejects non-domains', () => {
    assert.equal(normalizeSlug('!!!'), null);
    assert.equal(normalizeSlug(''), null);
    assert.equal(normalizeSlug('localhost'), null);
    assert.equal(normalizeSlug('not a domain'), null);
    assert.equal(normalizeSlug('a..b.com'), null);
    assert.equal(normalizeSlug(42), null);
    assert.equal(normalizeSlug('x'.repeat(300) + '.com'), null);
  });
});

describe('displayName', () => {
  it('uses the curated map, falls back to capitalized first label', () => {
    assert.equal(displayName('openai.com'), 'OpenAI');
    assert.equal(displayName('huggingface.co'), 'Hugging Face');
    assert.equal(displayName('some-new-thing.io'), 'Some-new-thing');
  });
});

describe('getProfile', () => {
  it('resolves every seed domain with the full profile shape', () => {
    const slugs = [
      'character.ai', 'copy.ai', 'vercel.com', 'synthesia.io', 'elevenlabs.io',
      'mistral.ai', 'runwayml.com', 'openai.com', 'huggingface.co', 'jasper.ai',
      'stripe.com', 'github.com', 'supabase.com', 'x.ai', 'linear.app',
      'replit.com', 'anthropic.com', 'notion.so', 'apple.com', 'deepseek.com',
    ];
    for (const slug of slugs) {
      const p = getProfile(slug);
      assert.ok(p, `${slug} should resolve`);
      assert.equal(p!.slug, slug);
      assert.equal(p!.domain, slug);
      assert.ok(p!.name.length > 0, 'name is never empty');
      const c = p!.current;
      assert.ok(c.vapor_score >= 0 && c.vapor_score <= 100);
      // The public number is the flip — display layers read this, never
      // vapor_score.
      assert.equal(c.sniff_score, sniffScoreFor(c.vapor_score), `${slug}: sniff flip`);
      assert.equal(c.sniff_score, 100 - c.vapor_score);
      assert.ok(c.verdict.length > 0, 'verdict is never empty');
      assert.match(c.snapshot_hash, /^[0-9a-f]{64}$/, 'snapshot_hash is sha256 hex');
      assert.equal(c.algo_version, 'v2');
      assert.equal(p!.history.length, 1, 'single v2 chapter for now');
      assert.equal(p!.history[0].vapor_score, c.vapor_score);
      assert.equal(p!.history[0].sniff_score, c.sniff_score, 'history shows the sniff score too');
    }
  });

  it('returns null for valid-but-unknown and invalid slugs', () => {
    assert.equal(getProfile('definitely-not-real.xyz'), null);
    assert.equal(getProfile('!!!'), null);
  });

  it('normalizes before lookup', () => {
    const p = getProfile('WWW.OPENAI.COM');
    assert.ok(p);
    assert.equal(p!.slug, 'openai.com');
  });
});

describe('rosette badge pure helpers', () => {
  it('rosetteColor matches the per-tier palette', () => {
    assert.equal(rosetteColor('CERTIFIED REAL'), '#B98A1D');
    assert.equal(rosetteColor('CERTIFIED FAKE'), '#9A958A');
    assert.deepEqual(Object.keys(ROSETTE_COLORS).sort(), [
      'ALMOST REAL',
      'CERTIFIED FAKE',
      'CERTIFIED REAL',
      'JUST VIBES',
      'SUS',
    ]);
  });

  it('rosetteBadgeLines chunks tier names the same way the old stamp did', () => {
    assert.deepEqual(rosetteBadgeLines('CERTIFIED REAL'), ['CERTIFIED REAL']);
    assert.deepEqual(rosetteBadgeLines('SUS'), ['SUS']);
    assert.deepEqual(rosetteBadgeLines('JUST VIBES'), ['JUST VIBES']);
    assert.deepEqual(rosetteBadgeLines('ALMOST REAL'), ['ALMOST REAL']);
    assert.deepEqual(rosetteBadgeLines('CERTIFIED FAKE'), ['CERTIFIED FAKE']);
  });

  it('rosetteBadgeSVG renders the serrated medal, tier text, and ribbon tails', () => {
    const svg = rosetteBadgeSVG('SUS', 100, 100, 60);
    assert.ok(svg.includes('<polygon'), 'medal + ribbons');
    assert.ok(svg.includes('SUS'), 'tier text');
    // 24 teeth → 48 polygon points on the medal.
    const medal = svg.split('<polygon')[1];
    assert.equal(medal.split('points="')[1].split('"')[0].split(' ').length, 48);
  });

  it('buildVaporCardSVG embeds domain, sniff score, tier, and canonical URL', () => {
    const svg = buildVaporCardSVG({
      slug: 'character.ai',
      domain: 'character.ai',
      sniff_score: 47, // the PUBLIC number (was 53 vapor)
      tier: 'SUS',
      verdict: '47/100 — solidly sus.',
      siteUrl: 'https://sniffmysite.lol',
      metrics: {
        buzzword_density: 80,
        claim_to_proof: 60,
        vague_verb: 40,
        social_proof: 30,
        pricing_opacity: 20,
        freshness: 10,
      },
      evidence: TEST_EVIDENCE,
    });
    assert.ok(svg.includes('character.ai'));
    assert.ok(svg.includes('SNIFF SCORE'), 'public label');
    assert.ok(svg.includes('>47<'), 'flipped score present');
    assert.ok(svg.includes('SUS'));
    assert.ok(svg.includes('width="1200"') && svg.includes('height="630"'));
    assert.ok(svg.includes('https://sniffmysite.lol/s/character.ai'));
    assert.ok(svg.includes('we joke about the page, never the people.'));
    // No banned patterns on the card.
    assert.ok(!/linear-gradient|radial-gradient/i.test(svg), 'no gradients');
    assert.ok(!/vaporrank/i.test(svg), 'no VAPORRANK');
  });

  it('cardJoke is deterministic and evidence-based', () => {
    const input = {
      sniff_score: 47,
      tier: 'SUS' as const,
      metrics: {
        buzzword_density: 80,
        claim_to_proof: 60,
        vague_verb: 40,
        social_proof: 30,
        pricing_opacity: 20,
        freshness: 10,
      },
      evidence: TEST_EVIDENCE,
    };
    assert.equal(cardJoke(input), cardJoke(input));
    assert.ok(cardJoke(input).includes('48 hype-words'), 'real findings cited');
  });

  it('buildVaporCardSVG escapes hostile input', () => {
    const svg = buildVaporCardSVG({
      slug: 'evil.com',
      domain: 'evil<script>.com',
      sniff_score: 5,
      tier: 'CERTIFIED FAKE',
      verdict: '"><img src=x onerror=alert(1)>',
      siteUrl: 'https://sniffmysite.lol',
      metrics: {
        buzzword_density: 90,
        claim_to_proof: 90,
        vague_verb: 90,
        social_proof: 90,
        pricing_opacity: 90,
        freshness: 90,
      },
      evidence: {
        ...TEST_EVIDENCE,
        top_phrases: [{ phrase: '"><script>alert(1)</script>', count: 3 }],
      },
    });
    assert.ok(!svg.includes('<script>'), 'script tag escaped');
    assert.ok(svg.includes('&lt;script&gt;'));
  });
});

describe('vapor-card render + cache', () => {
  const input = {
    slug: 'stripe.com',
    domain: 'stripe.com',
    sniff_score: 86, // the PUBLIC number
    tier: 'CERTIFIED REAL' as const,
    verdict: '86/100. Fine. Prices are public, the claims stay in their lane. We checked twice.',
    siteUrl: 'https://sniffmysite.lol',
    metrics: {
      buzzword_density: 5,
      claim_to_proof: 8,
      vague_verb: 10,
      social_proof: 4,
      pricing_opacity: 0,
      freshness: 6,
    },
    evidence: TEST_EVIDENCE,
  };

  it('renders a real PNG and caches by key', async () => {
    _testClearCache();
    const key = vaporCardCacheKey(input.slug, { sniff_score: 86, hash: 'abc' });
    const png = await getVaporCardPNG(key, input);
    assert.ok(png.subarray(0, 4).equals(PNG_MAGIC), 'PNG magic bytes');
    assert.ok(png.length > 10_000, `non-trivial body, got ${png.length} bytes`);
    assert.equal(png.readUInt32BE(16), 1200, 'PNG width');
    assert.equal(png.readUInt32BE(20), 630, 'PNG height');
    assert.equal(_testCacheSize(), 1);
    const again = await getVaporCardPNG(key, input);
    assert.equal(again, png, 'cache hit returns the same Buffer');
    assert.equal(_testCacheSize(), 1);
  });
});

describe('vapor routes', () => {
  let app: Express;
  let server: Server;
  let base: string;

  before(async () => {
    app = express();
    app.use('/api/vapor', vaporRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}/api/vapor`;
  });

  after(() => {
    server.close();
  });

  it('GET /startup/:slug returns the dossier with the public sniff score', async () => {
    const res = await fetch(`${base}/startup/character.ai`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(
      Object.keys(body).sort(),
      ['current', 'domain', 'history', 'name', 'slug'].sort(),
    );
    assert.equal((body as any).domain, 'character.ai');
    assert.equal((body as any).current.vapor_score, 52);
    assert.equal((body as any).current.sniff_score, 48, 'public number is the flip');
    assert.equal((body as any).history[0].sniff_score, 48);
  });

  it('GET /startup/:slug 404s on unknown domains', async () => {
    const res = await fetch(`${base}/startup/nope-not-real.xyz`);
    assert.equal(res.status, 404);
    assert.equal(((await res.json()) as any).error, 'startup_not_found');
  });

  it('GET /startup/:slug 400s on malformed slugs', async () => {
    const res = await fetch(`${base}/startup/${encodeURIComponent('!!!')}`);
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as any).error, 'invalid_slug');
  });

  it('GET /og/:slug.png returns a PNG', async () => {
    const res = await fetch(`${base}/og/character.ai.png`);
    assert.equal(res.status, 200);
    assert.ok(
      (res.headers.get('content-type') ?? '').includes('image/png'),
      'content-type is image/png',
    );
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.subarray(0, 4).equals(PNG_MAGIC), 'PNG magic bytes');
    assert.ok(buf.length > 10_000, 'non-empty body');
    assert.equal(
      res.headers.get('cross-origin-resource-policy'),
      'cross-origin',
      'CORP allows cross-origin embedding (social + in-app preview)',
    );
  });

  it('GET /og/:slug.png supports ETag/304', async () => {
    const first = await fetch(`${base}/og/stripe.com.png`);
    const etag = first.headers.get('etag');
    assert.ok(etag, 'ETag present');
    const second = await fetch(`${base}/og/stripe.com.png`, {
      headers: { 'if-none-match': etag! },
    });
    assert.equal(second.status, 304);
  });

  it('GET /og/:slug.png 404s on unknown slugs', async () => {
    const res = await fetch(`${base}/og/nope-not-real.xyz.png`);
    assert.equal(res.status, 404);
  });
});
