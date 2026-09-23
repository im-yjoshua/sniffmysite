/**
 * Embeddable "Sniffed" badge tests (Growth Plan §1).
 *
 * The badge SVG must show the TRUE live score + tier (same source as the
 * dossier: getProfile = live journal first, seed fallback), unknown slugs
 * must 404 with "not sniffed yet" (never a fabricated score), and the
 * route must serve it hotlink-friendly (SVG content type, hourly cache,
 * CORP cross-origin).
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import {
  badgeSvg,
  notSniffedSvg,
  resolveBadge,
  BADGE_W,
  BADGE_H,
} from '../lib/badge';
import { ROSETTE_COLORS } from '../lib/vapor-card';
import { getProfile } from '../lib/profile';
import { recordBoardScan, _resetScanLog } from '../lib/scanlog';
import { scorePage } from '../lib/score';
import { vaporRouter } from '../routes/vapor';

const CLEAN_HTML = `
  <html><head><title>Socks — $5 a pair</title></head><body>
  <h1>We sell socks. $5 a pair.</h1>
  <p>Three colors: black, white, gray. Free shipping on orders over $20.
  Email us at hello@example.com with questions. We ship every weekday.
  Returns are free for 30 days. Copyright 2026.</p>
  <a href="/pricing">Pricing</a><a href="/docs">Docs</a>
  </body></html>`;

describe('badgeSvg', () => {
  const cases = [
    { score: 92, tier: 'CERTIFIED REAL' },
    { score: 74, tier: 'ALMOST REAL' },
    { score: 53, tier: 'SUS' },
  ] as const;

  for (const { score, tier } of cases) {
    it(`renders the true score and tier for ${tier}`, () => {
      const svg = badgeSvg(score, tier);
      assert.ok(svg.includes(`>${score}<`), 'score number missing');
      assert.ok(svg.includes('/100'), '/100 context missing');
      assert.ok(svg.includes(tier), 'tier name missing');
      assert.ok(
        svg.includes(ROSETTE_COLORS[tier]),
        'tier color missing',
      );
      assert.ok(svg.includes('SNIFFED BY SNIFFMYSITE'), 'wordmark missing');
      assert.ok(
        svg.includes(`width="${BADGE_W}"`) && svg.includes(`height="${BADGE_H}"`),
        'badge canvas size wrong',
      );
    });
  }

  it('is self-contained: no external assets or webfonts', () => {
    const svg = badgeSvg(92, 'CERTIFIED REAL');
    // (The xmlns namespace URI is an identifier, not a fetched asset.)
    const withoutXmlns = svg.replace(/xmlns="[^"]*"/g, '');
    assert.ok(!withoutXmlns.includes('http://') && !withoutXmlns.includes('https://'), 'external URL leaked');
    assert.ok(!svg.includes('@font-face') && !svg.includes('<image'), 'external asset leaked');
  });
});

describe('resolveBadge', () => {
  beforeEach(() => _resetScanLog());

  it('matches the dossier source of truth for a seed host', () => {
    const profile = getProfile('apple.com');
    assert.ok(profile, 'seed host apple.com should have a profile');
    const { status, svg } = resolveBadge('apple.com');
    assert.equal(status, 200);
    assert.ok(svg.includes(`>${profile.current.sniff_score}<`), 'badge score != dossier score');
    assert.ok(svg.includes(profile.current.tier), 'badge tier != dossier tier');
  });

  it('follows a re-scan: badge always shows the latest score', () => {
    const first = recordBoardScan({
      finalUrl: 'https://freshbadge.test/',
      result: scorePage(CLEAN_HTML, 'https://freshbadge.test/', new Date('2026-09-21T10:00:00.000Z')),
    });
    assert.ok(first);
    const second = recordBoardScan({
      finalUrl: 'https://freshbadge.test/',
      result: scorePage(CLEAN_HTML, 'https://freshbadge.test/', new Date('2026-09-21T11:00:00.000Z')),
    });
    assert.ok(second);
    const { status, svg } = resolveBadge('freshbadge.test');
    assert.equal(status, 200);
    assert.ok(
      svg.includes(`>${second.sniff_score}<`),
      'badge must show the latest scan, not the first',
    );
  });

  it('unknown slug → 404 SVG, "not sniffed yet", no fabricated score', () => {
    const { status, svg } = resolveBadge('never-sniffed-xyz.test');
    assert.equal(status, 404);
    assert.ok(svg.includes('Not sniffed yet'), 'honest 404 copy missing');
    assert.ok(!/\/\d+\/100/.test(svg) && !svg.includes('/100'), '404 SVG must not carry a score');
    assert.equal(svg, notSniffedSvg());
  });

  it('malformed slug → 400 SVG', () => {
    const { status, svg } = resolveBadge('not a domain!!');
    assert.equal(status, 400);
    assert.ok(svg.includes('Bad address'));
  });

  it('normalizes www. to the canonical slug', () => {
    const plain = resolveBadge('apple.com');
    const www = resolveBadge('www.apple.com');
    assert.equal(www.status, 200);
    assert.equal(www.svg, plain.svg);
  });
});

describe('GET /api/vapor/badge/:slug.svg', () => {
  let app: Express;
  let server: Server;
  let base: string;

  before(async () => {
    app = express();
    app.use('/api/vapor', vaporRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}/api/vapor/badge`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  async function getBadge(slug: string) {
    const res = await fetch(`${base}/${encodeURIComponent(slug)}.svg`);
    return {
      status: res.status,
      contentType: res.headers.get('content-type'),
      cacheControl: res.headers.get('cache-control'),
      corp: res.headers.get('cross-origin-resource-policy'),
      body: await res.text(),
    };
  }

  it('serves the live badge with hotlink-friendly headers', async () => {
    const r = await getBadge('apple.com');
    assert.equal(r.status, 200);
    assert.ok(r.contentType?.includes('image/svg+xml'), `content-type: ${r.contentType}`);
    assert.equal(r.cacheControl, 'public, max-age=3600');
    assert.equal(r.corp, 'cross-origin');
    const profile = getProfile('apple.com');
    assert.ok(profile);
    assert.ok(r.body.includes(`>${profile.current.sniff_score}<`));
    assert.ok(r.body.includes(profile.current.tier));
  });

  it('unknown slug → 404 SVG, still cached + hotlinkable', async () => {
    const r = await getBadge('never-sniffed-xyz.test');
    assert.equal(r.status, 404);
    assert.ok(r.contentType?.includes('image/svg+xml'));
    assert.equal(r.cacheControl, 'public, max-age=3600');
    assert.ok(r.body.includes('Not sniffed yet'));
  });
});
