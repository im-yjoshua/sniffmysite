/**
 * Share-card tests for the Sniff Score flip: the original serrated rosette
 * seal (two ribbon tails), the deterministic evidence joke, escaping, PNG
 * dimensions, and the POST /api/vapor/card endpoint that powers the
 * /scan share popup.
 *
 * The card shows the PUBLIC number — the sniff score (100 − vapor) — with
 * SNIFFMYSITE branding, no VAPORRANK, no purple gradients, no emojis.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import {
  ROSETTE_COLORS,
  rosetteColor,
  rosetteBadgeLines,
  rosetteBadgeSVG,
  cardJoke,
  JOKE_THRESHOLD,
  buildVaporCardSVG,
  renderVaporPNG,
  type JokeInput,
  type VaporCardInput,
} from '../lib/vapor-card';
import { sniffScoreFor, type Tier } from '../lib/score';
import { vaporRouter } from '../routes/vapor';
import { _resetRateLimits } from '../lib/ratelimit';
import type { MetricScores, ScoreEvidence } from '../lib/score';

const TIERS: Tier[] = [
  'CERTIFIED REAL',
  'ALMOST REAL',
  'SUS',
  'JUST VIBES',
  'CERTIFIED FAKE',
];

const METRICS: MetricScores = {
  buzzword_density: 82,
  claim_to_proof: 64,
  vague_verb: 41,
  social_proof: 30,
  pricing_opacity: 22,
  freshness: 12,
};

const EVIDENCE: ScoreEvidence = {
  words: 1400,
  sentences: 100,
  buzzword_hits: 52,
  top_phrases: [{ phrase: 'revolutionary', count: 14 }],
  claim_sentences: 11,
  evidence_links: 2,
  vague_sentences: 25,
  trust_mentions: 3,
  anonymous_testimonials: 2,
  logo_images: 5,
  has_pricing: false,
  has_price_signals: false,
  sales_only_cta: true,
  copyright_year: null,
  language_note: null,
};

const CARD_INPUT: VaporCardInput = {
  slug: 'hype.ai',
  domain: 'hype.ai',
  sniff_score: 22, // the PUBLIC number (was 78 vapor)
  tier: 'JUST VIBES',
  verdict: '22/100. This page is just vibes.',
  siteUrl: 'https://sniffmysite.lol',
  metrics: METRICS,
  evidence: EVIDENCE,
};

describe('rosette seal', () => {
  it('has a tier color for every tier', () => {
    for (const tier of TIERS) {
      assert.ok(/^#[0-9A-F]{6}$/i.test(ROSETTE_COLORS[tier]), `${tier}: hex color`);
      assert.equal(rosetteColor(tier), ROSETTE_COLORS[tier]);
    }
  });

  it('gold for the prize, hazard red-orange for vibes, sad gray for fake', () => {
    assert.equal(rosetteColor('CERTIFIED REAL'), '#B98A1D');
    assert.equal(rosetteColor('JUST VIBES'), '#FF4D00');
    assert.equal(rosetteColor('CERTIFIED FAKE'), '#9A958A');
  });

  it('rosetteBadgeLines chunks tiers the same way the old stamp did', () => {
    // 1–2 words stay on one line; 3+ words chunk into two lines.
    assert.deepEqual(rosetteBadgeLines('SUS'), ['SUS']);
    assert.deepEqual(rosetteBadgeLines('ALMOST REAL'), ['ALMOST REAL']);
    assert.deepEqual(rosetteBadgeLines('CERTIFIED REAL'), ['CERTIFIED REAL']);
    assert.deepEqual(rosetteBadgeLines('CERTIFIED FAKE'), ['CERTIFIED FAKE']);
    assert.deepEqual(rosetteBadgeLines('JUST VIBES'), ['JUST VIBES']);
  });

  it('renders a serrated medal with ribbon tails and tier words for every tier', () => {
    for (const tier of TIERS) {
      const svg = rosetteBadgeSVG(tier, 100, 100, 60);
      assert.equal(svg.match(/<polygon/g)?.length, 1, `${tier}: one medal polygon`);
      assert.equal(svg.match(/<path d="M/g)?.length, 2, `${tier}: two ribbon tails as <path>`);
      // 24 teeth × 2 = 48 points on the medal polygon.
      const medal = svg.split('<polygon')[1];
      assert.equal(
        medal.split('points="')[1].split('"')[0].split(' ').length,
        48,
        `${tier}: 24 serrated teeth`,
      );
      assert.ok(svg.includes('<circle'), `${tier}: inner circle`);
      for (const line of rosetteBadgeLines(tier)) {
        assert.ok(svg.includes(line), `${tier}: shows "${line}"`);
      }
    }
  });

  it('escapes hostile tier content (defense in depth)', () => {
    const svg = rosetteBadgeSVG('SUS"><script>' as never, 100, 100, 60);
    assert.ok(!svg.includes('<script>'));
  });
});

describe('cardJoke', () => {
  const input = (over: Partial<JokeInput> = {}): JokeInput => ({
    sniff_score: 22,
    tier: 'JUST VIBES',
    metrics: METRICS,
    evidence: EVIDENCE,
    ...over,
  });

  it('is deterministic: same findings → same joke', () => {
    assert.equal(cardJoke(input()), cardJoke(input()));
    assert.equal(
      cardJoke(input()),
      cardJoke(input({ evidence: { ...EVIDENCE } })),
      'deep-equal evidence gives the same joke',
    );
  });

  it('cites the real findings when they clear the threshold', () => {
    const joke = cardJoke(input());
    assert.ok(joke.includes('52 hype-words'), 'real buzzword count');
    assert.ok(joke.includes('11 grand claims'), 'real claim count');
  });

  it('falls back to sniff-keyed tier closers when findings are thin', () => {
    const thin = { ...EVIDENCE, buzzword_hits: 1, top_phrases: [], claim_sentences: 0 };
    assert.ok(
      cardJoke(input({ sniff_score: 94, tier: 'CERTIFIED REAL', evidence: thin })).includes('Grudgingly'),
      'high sniff: grudging respect',
    );
    assert.ok(
      cardJoke(input({ sniff_score: 70, tier: 'ALMOST REAL', evidence: thin })).includes('So close'),
      'almost real: damning with faint praise',
    );
    assert.ok(
      cardJoke(input({ sniff_score: 50, tier: 'SUS', evidence: thin })).includes('sus'),
      'sus closer',
    );
    assert.ok(
      cardJoke(input({ sniff_score: 30, tier: 'JUST VIBES', evidence: thin })).includes('vibes'),
      'just vibes closer',
    );
    assert.ok(
      cardJoke(input({ sniff_score: 5, tier: 'CERTIFIED FAKE', evidence: thin })).includes('third adjective'),
      'certified fake closer',
    );
  });

  it('the full joke needs real findings (threshold documented)', () => {
    const below = { ...EVIDENCE, buzzword_hits: JOKE_THRESHOLD - 1, claim_sentences: 9 };
    assert.ok(
      !cardJoke(input({ evidence: below })).includes('hype-words'),
      'below threshold → tier closer, not the full joke',
    );
  });

  it('never names people — jokes stay on copy and structure', () => {
    const joke = cardJoke(input());
    assert.ok(!/founder|ceo|mr\.|ms\.|dr\./i.test(joke), `no people in jokes, got: ${joke}`);
    assert.ok(joke.length > 0 && joke.length <= 200, 'fits the card');
  });
});

describe('buildVaporCardSVG', () => {
  it('shows the public sniff score with the SNIFF SCORE label', () => {
    const svg = buildVaporCardSVG(CARD_INPUT);
    assert.ok(svg.includes('SNIFF SCORE'), 'public label, not VAPOR SCORE');
    assert.ok(svg.includes('>22<'), 'the flipped number');
    assert.ok(!svg.includes('>78<'), 'the old vapor number is gone');
    assert.ok(svg.includes('JUST VIBES'), 'tier name');
  });

  it('carries SniffMySite branding and the canonical URL', () => {
    const svg = buildVaporCardSVG(CARD_INPUT);
    assert.ok(svg.includes('SNIFFMYSITE'), 'brand');
    assert.ok(svg.includes('INSPECTION LAB'), 'lab branding');
    assert.ok(svg.includes('https://sniffmysite.lol/s/hype.ai'), 'canonical share URL');
    assert.ok(svg.includes('we joke about the page, never the people.'), 'footer sign-off');
  });

  it('has no banned branding, gradients, or emojis', () => {
    const svg = buildVaporCardSVG(CARD_INPUT);
    assert.ok(!/vaporrank/i.test(svg), 'no VAPORRANK');
    assert.ok(!/linear-gradient|radial-gradient/i.test(svg), 'no gradients');
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(svg), 'no emojis');
  });

  it('escapes hostile page content (the joke carries page quotes)', () => {
    const evil: ScoreEvidence = {
      ...EVIDENCE,
      top_phrases: [{ phrase: '"><img src=x>', count: 9 }],
    };
    const svg = buildVaporCardSVG({ ...CARD_INPUT, evidence: evil });
    assert.ok(!svg.includes('<img src=x>'), 'page quote escaped');
  });

  it('renders a real 1200×630 PNG via resvg', async () => {
    const png = await renderVaporPNG(buildVaporCardSVG(CARD_INPUT));
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
    assert.ok(png.length > 20_000, `suspiciously small PNG: ${png.length} bytes`);
  });
});

describe('POST /api/vapor/card', () => {
  let base: string;
  let server: Server;

  before(async () => {
    const app: Express = express();
    app.use(express.json());
    app.use('/api/vapor', vaporRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}/api/vapor`;
  });

  after(() => {
    server.close();
  });

  function postBody(body: Record<string, unknown>) {
    return fetch(`${base}/card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('renders a PNG for the public sniff score', async () => {
    _resetRateLimits();
    const res = await postBody({
      domain: 'hype.ai',
      sniff_score: 22,
      tier: 'JUST VIBES',
      verdict: '22/100. This page is just vibes.',
      metrics: METRICS,
      evidence: EVIDENCE,
    });
    assert.equal(res.status, 200);
    assert.ok((res.headers.get('content-type') ?? '').includes('image/png'));
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.readUInt32BE(16), 1200);
    assert.equal(buf.readUInt32BE(20), 630);
  });

  it('converts a legacy vapor_score with the same flip (compatibility)', async () => {
    _resetRateLimits();
    const res = await postBody({
      domain: 'hype.ai',
      vapor_score: 78,
      tier: 'JUST VIBES',
      verdict: 'x',
      metrics: METRICS,
    });
    assert.equal(res.status, 200, 'legacy vapor_score accepted and converted');
  });

  it('400s on a bad tier, bad score, or missing metrics', async () => {
    _resetRateLimits();
    const badTier = await postBody({
      domain: 'hype.ai',
      sniff_score: 22,
      tier: 'NOT A TIER',
      verdict: 'x',
      metrics: METRICS,
    });
    assert.equal(badTier.status, 400);
    const badScore = await postBody({
      domain: 'hype.ai',
      sniff_score: 140,
      tier: 'SUS',
      verdict: 'x',
      metrics: METRICS,
    });
    assert.equal(badScore.status, 400);
    const badVapor = await postBody({
      domain: 'hype.ai',
      vapor_score: -3,
      tier: 'SUS',
      verdict: 'x',
      metrics: METRICS,
    });
    assert.equal(badVapor.status, 400);
  });

  it('works without evidence (tier-flavored joke fallback)', async () => {
    _resetRateLimits();
    const res = await postBody({
      domain: 'clean.dev',
      sniff_score: 88,
      tier: 'CERTIFIED REAL',
      verdict: '88/100. Fine.',
      metrics: {
        buzzword_density: 5,
        claim_to_proof: 4,
        vague_verb: 6,
        social_proof: 3,
        pricing_opacity: 0,
        freshness: 8,
      },
    });
    assert.equal(res.status, 200);
  });

  it('the rendered card names the sniff score, not vapor', async () => {
    _resetRateLimits();
    const svg = buildVaporCardSVG({
      ...CARD_INPUT,
      sniff_score: sniffScoreFor(78),
    });
    assert.ok(svg.includes('SNIFF SCORE'));
    assert.ok(svg.includes('>22<'), 'flip applied to the legacy vapor 78');
  });
});
