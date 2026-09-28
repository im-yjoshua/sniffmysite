/**
 * Battle card tests (B1): the "X DESTROYED Y" share card.
 *
 * Covers the pure pieces (battleOutcome, battleHeadline, SVG build —
 * escaping, no gradients/emojis, VICTOR/CONDEMNED stamps, tie handling)
 * and the POST /api/vapor/card/battle endpoint (200 PNG, 400s on bad
 * input, cache hit).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import {
  battleOutcome,
  battleHeadline,
  buildBattleCardSVG,
  renderVaporPNG,
  getBattleCardPNG,
  _testClearBattleCache,
  _testBattleCacheSize,
  type BattleCardInput,
} from '../lib/vapor-card';
import { vaporRouter } from '../routes/vapor';
import { _resetRateLimits } from '../lib/ratelimit';

function battleInput(over: Partial<BattleCardInput> = {}): BattleCardInput {
  return {
    slugA: 'stripe.com',
    domainA: 'stripe.com',
    sniff_score_a: 82,
    tier_a: 'GLADIATOR',
    slugB: 'hype.ai',
    domainB: 'hype.ai',
    sniff_score_b: 34,
    tier_b: 'JESTER',
    siteUrl: 'https://sniffmysite.lol',
    ...over,
  };
}

describe('battleOutcome', () => {
  it('higher sniff score wins — a, b, and the tie', () => {
    assert.equal(battleOutcome({ sniff_score_a: 82, sniff_score_b: 34 }), 'a');
    assert.equal(battleOutcome({ sniff_score_a: 20, sniff_score_b: 91 }), 'b');
    assert.equal(battleOutcome({ sniff_score_a: 55, sniff_score_b: 55 }), 'tie');
  });
});

describe('battleHeadline', () => {
  it('auto-generates X DESTROYED Y with uppercased domains', () => {
    assert.equal(
      battleHeadline(battleInput()),
      'STRIPE.COM DESTROYED HYPE.AI',
    );
    assert.equal(
      battleHeadline(
        battleInput({ sniff_score_a: 10, sniff_score_b: 90 }),
      ),
      'HYPE.AI DESTROYED STRIPE.COM',
    );
  });

  it('handles the tie without a destroyer', () => {
    const h = battleHeadline(
      battleInput({ sniff_score_a: 50, sniff_score_b: 50 }),
    );
    assert.ok(h.includes('TIED'), `tie headline, got: ${h}`);
    assert.ok(!h.includes('DESTROYED'), 'no destroyer on a tie');
  });
});

describe('buildBattleCardSVG', () => {
  it('stamps VICTOR on the winner and CONDEMNED on the loser', () => {
    const svg = buildBattleCardSVG(battleInput());
    assert.ok(svg.includes('VICTOR'), 'winner stamped');
    assert.ok(svg.includes('CONDEMNED'), 'loser stamped');
    assert.ok(svg.includes('STRIPE.COM DESTROYED HYPE.AI'), 'headline');
  });

  it('stamps nobody on a tie', () => {
    const svg = buildBattleCardSVG(
      battleInput({ sniff_score_a: 50, sniff_score_b: 50 }),
    );
    assert.ok(!svg.includes('VICTOR'), 'no victor on a tie');
    assert.ok(!svg.includes('CONDEMNED'), 'no condemned on a tie');
  });

  it('carries branding, the margin line, and the battle URL', () => {
    const svg = buildBattleCardSVG(battleInput());
    assert.ok(svg.includes('SNIFFMYSITE'), 'brand');
    assert.ok(svg.includes('BATTLE REPORT'), 'report kind');
    assert.ok(svg.includes('48 points between them'), 'the margin');
    assert.ok(svg.includes('sniffmysite.lol/battle'), 'canonical URL');
    assert.ok(
      svg.includes('we joke about the page, never the people.'),
      'footer sign-off',
    );
  });

  it('has no banned branding, gradients, or emojis', () => {
    const svg = buildBattleCardSVG(battleInput());
    assert.ok(!/vaporrank/i.test(svg), 'no VAPORRANK');
    assert.ok(!/linear-gradient|radial-gradient/i.test(svg), 'no gradients');
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(svg), 'no emojis');
  });

  it('escapes hostile domains', () => {
    const svg = buildBattleCardSVG(
      battleInput({ domainA: '"><img src=x>', slugA: 'evil' }),
    );
    assert.ok(!svg.includes('<img src=x>'), 'domain escaped');
  });

  it('renders a real 1200×630 PNG via resvg', async () => {
    const png = await renderVaporPNG(buildBattleCardSVG(battleInput()));
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
    assert.ok(png.length > 20_000, `suspiciously small PNG: ${png.length} bytes`);
  });
});

describe('getBattleCardPNG cache', () => {
  it('returns the same buffer on a cache hit', async () => {
    _testClearBattleCache();
    const input = battleInput();
    const first = await getBattleCardPNG('k1', input);
    const second = await getBattleCardPNG('k1', input);
    assert.equal(_testBattleCacheSize(), 1);
    assert.ok(first === second, 'cache hit returns the same instance');
  });
});

describe('POST /api/vapor/card/battle', () => {
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
    return fetch(`${base}/card/battle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const good = {
    domain_a: 'stripe.com',
    sniff_score_a: 82,
    tier_a: 'GLADIATOR',
    domain_b: 'hype.ai',
    sniff_score_b: 34,
    tier_b: 'JESTER',
  };

  it('renders a PNG for a finished battle', async () => {
    _resetRateLimits();
    const res = await postBody(good);
    assert.equal(res.status, 200);
    assert.ok((res.headers.get('content-type') ?? '').includes('image/png'));
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.readUInt32BE(16), 1200);
    assert.equal(buf.readUInt32BE(20), 630);
  });

  it('answers 304 when the ETag matches', async () => {
    _resetRateLimits();
    const first = await postBody(good);
    const etag = first.headers.get('etag');
    assert.ok(etag, 'etag present');
    await first.arrayBuffer();
    const second = await fetch(`${base}/card/battle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'If-None-Match': etag as string,
      },
      body: JSON.stringify(good),
    });
    assert.equal(second.status, 304);
  });

  it('400s on a bad score, bad tier, or missing domain', async () => {
    _resetRateLimits();
    const badScore = await postBody({ ...good, sniff_score_a: 101 });
    assert.equal(badScore.status, 400);
    const badTier = await postBody({ ...good, tier_b: 'EMPORER' });
    assert.equal(badTier.status, 400);
    const noDomain = await postBody({ ...good, domain_a: '' });
    assert.equal(noDomain.status, 400);
  });
});
