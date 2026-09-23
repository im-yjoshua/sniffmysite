/**
 * Unit tests for the burn report card renderer (Task 6).
 * Template + copy logic are pure and network-free; renderPNG exercises the
 * full resvg pipeline (fonts bundled in the repo).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeXml,
  formatMoney,
  formatRunwayLine,
  fitFontSize,
  clampName,
  buildReportCardSVG,
  buildDefaultOgSVG,
  renderPNG,
  getReportCardPNG,
  reportCardCacheKey,
  _testClearCache,
  _testCacheSize,
  PAL,
  CARD_W,
  CARD_H,
} from '../lib/report-card';

const INPUT = {
  name: 'StealthMode AI',
  domain: 'stealthmode.lol',
  slug: 'stealthmode',
  monthlyBurn: 212000,
  runwayDaysRemaining: 21,
  siteUrl: 'https://burn-rate.lol',
};

describe('escapeXml', () => {
  it('escapes the five XML metacharacters', () => {
    assert.equal(escapeXml('A&B <C> "D" \'E\''), 'A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;');
  });

  it('neutralizes an SVG injection attempt in a company name', () => {
    const evil = 'Evil"><script>alert(1)</script>';
    const svg = buildReportCardSVG({ ...INPUT, name: evil });
    assert.ok(!svg.includes('<script>'), 'raw script tag must not survive');
    assert.ok(svg.includes('Evil&quot;&gt;&lt;script&gt;'), 'escaped form present');
  });
});

describe('formatMoney', () => {
  it('formats with commas and /mo', () => {
    assert.equal(formatMoney(212000), '$212,000/mo');
    assert.equal(formatMoney(999), '$999/mo');
    assert.equal(formatMoney(1200000), '$1,200,000/mo');
  });
});

describe('formatRunwayLine', () => {
  it('speaks §3.8 across every branch', () => {
    assert.equal(formatRunwayLine(null), 'RUNWAY: UNKNOWN. BOLD STRATEGY.');
    assert.equal(formatRunwayLine(-3), 'RUNWAY: 0 DAYS. STATUS: AIRBORNE.');
    assert.equal(formatRunwayLine(0), 'RUNWAY: 0 DAYS. STATUS: AIRBORNE.');
    assert.equal(formatRunwayLine(3), 'RUNWAY: 3 DAYS. STATUS: CRITICAL.');
    assert.equal(formatRunwayLine(14), 'RUNWAY: 2 WEEKS.');
    assert.equal(formatRunwayLine(21), 'RUNWAY: 3 WEEKS.');
    assert.equal(formatRunwayLine(7), 'RUNWAY: 1 WEEK.');
    assert.equal(formatRunwayLine(200), 'RUNWAY: 6 MONTHS.');
  });
});

describe('fitFontSize', () => {
  it('keeps the max size when the text fits', () => {
    assert.equal(fitFontSize('Short', 1000, 84, 0.58), 84);
  });

  it('shrinks until a long string fits', () => {
    const text = 'A'.repeat(30);
    const size = fitFontSize(text, 1000, 168, 0.6);
    assert.ok(size < 168, `expected shrink, got ${size}`);
    assert.ok(text.length * size * 0.6 * 1.06 <= 1000 + 1, 'fits after shrink');
  });

  it('never goes below the floor', () => {
    assert.equal(fitFontSize('A'.repeat(500), 100, 168, 0.6, 28), 28);
  });
});

describe('clampName', () => {
  it('collapses whitespace and truncates absurd names', () => {
    assert.equal(clampName('  Stealth   Mode  AI '), 'Stealth Mode AI');
    const long = clampName('X'.repeat(100));
    assert.ok(long.length <= 42 && long.endsWith('…'), long);
  });
});

describe('buildReportCardSVG', () => {
  it('is a 1200x630 card with the design tokens and key content', () => {
    const svg = buildReportCardSVG(INPUT);
    assert.ok(svg.includes(`width="${CARD_W}"`) && svg.includes(`height="${CARD_H}"`));
    assert.ok(svg.includes(PAL.bg) && svg.includes(PAL.ember) && svg.includes(PAL.ash));
    assert.ok(svg.includes('StealthMode AI'));
    assert.ok(svg.includes('stealthmode.lol'));
    assert.ok(svg.includes('$212,000/mo'));
    assert.ok(svg.includes('RUNWAY: 3 WEEKS.'));
    assert.ok(svg.includes('https://burn-rate.lol/c/stealthmode'));
    assert.ok(svg.includes('not financial advice. obviously.'));
    assert.ok(svg.includes('VIBES: IMMACULATE'));
  });

  it('lowercases domains and renders the airborne state', () => {
    const svg = buildReportCardSVG({ ...INPUT, domain: 'PROMPTFI.IO', runwayDaysRemaining: -1 });
    assert.ok(svg.includes('promptfi.io'));
    assert.ok(svg.includes('RUNWAY: 0 DAYS. STATUS: AIRBORNE.'));
  });
});

describe('buildDefaultOgSVG', () => {
  it('carries the hero one-liner and canonical URL', () => {
    const svg = buildDefaultOgSVG('https://burn-rate.lol');
    assert.ok(svg.includes('Revenue is vanity.'));
    assert.ok(svg.includes('Burn is sanity.'));
    assert.ok(svg.includes('https://burn-rate.lol'));
    assert.ok(svg.includes(PAL.ember));
  });
});

describe('renderPNG', () => {
  it('produces a real 1200x630 PNG via resvg', async () => {
    const png = await renderPNG(buildReportCardSVG(INPUT));
    // PNG magic bytes
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    // IHDR width/height (bytes 16-23, big-endian)
    assert.equal(png.readUInt32BE(16), CARD_W);
    assert.equal(png.readUInt32BE(20), CARD_H);
    assert.ok(png.length > 20_000, `suspiciously small PNG: ${png.length} bytes`);
  });
});

describe('reportCardCacheKey', () => {
  it('changes when any card field changes, stable otherwise', () => {
    const a = { id: '1', name: 'X', burn: 100 };
    const k1 = reportCardCacheKey('x', a);
    const k2 = reportCardCacheKey('x', { ...a });
    const k3 = reportCardCacheKey('x', { ...a, burn: 200 });
    const k4 = reportCardCacheKey('y', a);
    assert.equal(k1, k2);
    assert.notEqual(k1, k3);
    assert.notEqual(k1, k4);
  });
});

describe('getReportCardPNG (cache)', () => {
  it('returns the same instance on cache hits', async () => {
    _testClearCache();
    const key = reportCardCacheKey(INPUT.slug, { v: 1 });
    const first = await getReportCardPNG(key, INPUT);
    const second = await getReportCardPNG(key, INPUT);
    assert.equal(first, second, 'cache hit should return the identical buffer');
    assert.equal(_testCacheSize(), 1);
    _testClearCache();
  });
});
