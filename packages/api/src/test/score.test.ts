/**
 * Unit tests for the scoring engine (Vapor Score v2 internals) + the public
 * Sniff Score flip. Hand-built HTML snippets per metric + edge cases.
 * Zero network.
 *
 * The engine still measures VAPOR internally (the six checks, weights,
 * constants, calibration fixtures are untouched — ALGO_VERSION is v2).
 * What users see is the FLIP: sniff = 100 − vapor, via sniffScoreFor(),
 * the one clean place the conversion happens. Tiers are keyed off the
 * sniff score: higher = more real.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scorePage, sniffScoreFor, tierFor, WEIGHTS, ALGO_VERSION } from '../lib/score';

const FIXED_NOW = new Date('2026-09-20T12:00:00.000Z');

const HIGH_VAPOR_HTML = `<!DOCTYPE html><html><head><title>HypeAI — Revolutionize Everything</title></head><body>
<h1>Revolutionize your workflow with our AI-powered, cutting-edge platform</h1>
<p>Unlock unprecedented synergy with our next-gen, game-changing solution. Our seamless, frictionless
experience will supercharge your holistic paradigm and elevate your end-to-end transformation.
Leverage our world-class, state-of-the-art magic to turbocharge growth and reimagine what's possible.</p>
<p>We are the #1 best platform ever. The first ever ultimate solution, guaranteed to 10x your results.
The most powerful choice the world has never seen before.</p>
<h2>Trusted by innovative teams everywhere</h2>
<p>"Amazing product, totally transformed our workflow." \u2014 VP of Marketing</p>
<a href="/about">About</a> <a href="/contact">Contact sales</a>
<footer>\u00a9 2021 HypeAI. All rights reserved.</footer>
</body></html>`;

const CLEAN_HTML = `<!DOCTYPE html><html><head><title>PlainDB \u2014 Postgres hosting</title></head><body>
<nav><a href="/pricing">Pricing</a> <a href="/docs">Docs</a> <a href="https://github.com/plaindb/plaindb">GitHub</a></nav>
<h1>Managed Postgres, $20/month</h1>
<p>PlainDB runs Postgres 16 on dedicated VMs. Backups every 6 hours, point-in-time recovery, 99.99% uptime SLA.</p>
<p>Read the <a href="/docs">documentation</a>, check the <a href="/changelog">changelog</a>,
or try the <a href="/demo">live demo</a>. SOC 2 Type II certified.</p>
<h2>Trusted by Acme Corp and Globex Inc</h2>
<p>"PlainDB cut our backup costs by 40%." \u2014 Jane Smith, CTO of Acme Corp</p>
<footer>\u00a9 2026 PlainDB</footer>
</body></html>`;

const EMPTY_HTML = `<html><head><title></title></head><body></body></html>`;

const NON_ENGLISH_HTML = `<!DOCTYPE html><html><head><title>DatenBank \u2014 Sichere Speicherung</title></head><body>
<h1>Willkommen bei DatenBank</h1>
<p>Wir bieten sichere Datenspeicherung f\u00fcr 10 Euro pro Monat. Unsere Server stehen in Frankfurt.</p>
<a href="/preise">Preise</a> <a href="/dokumentation">Dokumentation</a>
<footer>\u00a9 2026 DatenBank</footer>
</body></html>`;

describe('scorePage', () => {
  it('weights sum to 100', () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(sum, 100);
  });

  it('algo_version is v3', () => {
    assert.equal(ALGO_VERSION, 'v3');
    const r = scorePage(CLEAN_HTML, 'https://example.com', FIXED_NOW);
    assert.equal(r.algo_version, 'v3');
  });

  it('tier boundaries match the spec (sniff-keyed: higher = more real)', () => {
    assert.equal(tierFor(0), 'LION FOOD');
    assert.equal(tierFor(24), 'LION FOOD');
    assert.equal(tierFor(25), 'JESTER');
    assert.equal(tierFor(49), 'JESTER');
    assert.equal(tierFor(50), 'RECRUIT');
    assert.equal(tierFor(74), 'RECRUIT');
    assert.equal(tierFor(75), 'GLADIATOR');
    assert.equal(tierFor(89), 'GLADIATOR');
    assert.equal(tierFor(90), 'LAUREATE');
    assert.equal(tierFor(100), 'LAUREATE');
  });

  it('rates a hype-drunk page as JESTER or worse', () => {
    const r = scorePage(HIGH_VAPOR_HTML, 'https://hypeai.example', FIXED_NOW);
    assert.ok(r.vapor_score > 60, `expected > 60, got ${r.vapor_score}`);
    assert.ok(r.tier === 'JESTER' || r.tier === 'LION FOOD');
    assert.ok(r.metrics.buzzword_density > 50, `buzzword metric ${r.metrics.buzzword_density}`);
    assert.ok(r.evidence.buzzword_hits > 10);
    assert.ok(r.evidence.top_phrases.length > 0);
    // Verdict quotes the page's own words back at it.
    assert.ok(r.verdict.includes('"'), 'verdict should quote buzzword phrases');
    assert.ok(r.verdict.includes(`${r.sniff_score}/100`));
  });

  it('rates a clean dev-tool page as GLADIATOR or better', () => {
    const r = scorePage(CLEAN_HTML, 'https://plaindb.example', FIXED_NOW);
    assert.ok(r.vapor_score <= 40, `expected <= 40, got ${r.vapor_score}`);
    assert.ok(r.tier === 'LAUREATE' || r.tier === 'GLADIATOR');
    assert.equal(r.metrics.pricing_opacity, 0);
    assert.equal(r.metrics.freshness, 0);
    assert.ok(r.evidence.has_pricing);
  });

  it('handles an empty page without crashing', () => {
    const r = scorePage(EMPTY_HTML, 'https://empty.example', FIXED_NOW);
    assert.ok(r.vapor_score >= 0 && r.vapor_score <= 100);
    assert.equal(r.evidence.words, 0);
    assert.ok(r.snapshot_hash.length === 64);
  });

  it('handles a non-English page without crashing', () => {
    const r = scorePage(NON_ENGLISH_HTML, 'https://datenbank.example', FIXED_NOW);
    assert.ok(r.vapor_score >= 0 && r.vapor_score <= 100);
    // German pricing words aren't in the detector — documented limitation,
    // but numbers + proper nouns still count as concrete.
    assert.ok(r.metrics.vague_verb < 100);
  });

  it('handles a huge page quickly', () => {
    const para = '<p>Revolutionize your workflow with our seamless AI-powered platform and world-class synergy.</p>';
    const big = `<html><body>${para.repeat(20000)}</body></html>`;
    const start = Date.now();
    const r = scorePage(big, 'https://big.example', FIXED_NOW);
    const elapsed = Date.now() - start;
    assert.ok(r.vapor_score >= 0 && r.vapor_score <= 100);
    assert.ok(elapsed < 10000, `scoring took ${elapsed}ms`);
  });

  it('is deterministic: same input → byte-identical result', () => {
    const a = scorePage(HIGH_VAPOR_HTML, 'https://hypeai.example', FIXED_NOW);
    const b = scorePage(HIGH_VAPOR_HTML, 'https://hypeai.example', FIXED_NOW);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it('snapshot_hash pins the exact page version', () => {
    const a = scorePage(HIGH_VAPOR_HTML, 'https://hypeai.example', FIXED_NOW);
    const b = scorePage(HIGH_VAPOR_HTML.replace('Revolutionize', 'Revolutionise'), 'https://hypeai.example', FIXED_NOW);
    assert.match(a.snapshot_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(a.snapshot_hash, b.snapshot_hash, 'one word changed → different hash');
  });

  it('never puts names in the verdict (satire guardrail)', () => {
    const r = scorePage(CLEAN_HTML, 'https://plaindb.example', FIXED_NOW);
    assert.ok(!r.verdict.includes('Jane Smith'), 'verdict must not name people');
    assert.ok(!r.verdict.includes('Acme Corp'), 'verdict must not name companies either');
  });

  it('all metrics stay within 0–100', () => {
    for (const html of [HIGH_VAPOR_HTML, CLEAN_HTML, EMPTY_HTML, NON_ENGLISH_HTML]) {
      const r = scorePage(html, 'https://x.example', FIXED_NOW);
      for (const [k, v] of Object.entries(r.metrics)) {
        assert.ok(v >= 0 && v <= 100, `${k} out of range: ${v}`);
      }
    }
  });

  it('v2: language guard skips the English-only hype checks on non-Latin pages', () => {
    const zh = `<!DOCTYPE html><html><head><title>深度求索</title></head><body>
<h1>深度求索发布全新模型，性能全面提升</h1>
<p>欢迎测试和反馈。我们的服务器运行稳定，文档齐全，价格公开透明，每月仅需 ¥10。</p>
<a href="/docs">文档</a> <a href="/pricing">价格</a>
<footer>© 2026 深度求索</footer></body></html>`;
    const r = scorePage(zh, 'https://zh.example', FIXED_NOW);
    assert.equal(r.evidence.language_note, 'nose only smells English — hype checks skipped');
    assert.equal(r.metrics.buzzword_density, 0);
    assert.equal(r.metrics.claim_to_proof, 0);
    assert.equal(r.metrics.vague_verb, 0);
    // Still judged on the language-independent checks: the /pricing link
    // is real (10 元 is a price signal) → 0; fresh © → 0.
    assert.equal(r.metrics.pricing_opacity, 0);
    assert.equal(r.metrics.freshness, 0);
  });

  it('v2: "best practices" is not a grand claim', () => {
    const html = `<!DOCTYPE html><html><head><title>Docs</title></head><body>
<h1>Engineering best practices</h1>
<p>These are the best practices our team follows. The best practices guide covers deploys.</p>
<p>Concrete numbers: 99.99% uptime, 40ms p99 latency.</p>
<footer>© 2026 Docs</footer></body></html>`;
    const r = scorePage(html, 'https://docs.example', FIXED_NOW);
    assert.equal(r.evidence.claim_sentences, 0, 'best practices must not count as grand claims');
    // But a real "best" claim still counts.
    const hype = scorePage(
      `<html><head><title>X</title></head><body><h1>The best platform on Earth</h1>
<p>We are the best. Period. © 2026 X</p></body></html>`,
      'https://x.example',
      FIXED_NOW,
    );
    assert.ok(hype.evidence.claim_sentences > 0, 'bare "best" still counts as a grand claim');
  });

  it('v2: pricing needs real price signals, not just a /pricing link', () => {
    const linkNoPrices = `<html><head><title>P</title></head><body>
<nav><a href="/pricing">Pricing</a></nav><h1>Plans for everyone</h1><p>Contact us for details.</p>
<footer>© 2026 P</footer></body></html>`;
    const linkWithPrices = `<html><head><title>P</title></head><body>
<nav><a href="/pricing">Pricing</a></nav><h1>Plans start at $20/mo</h1><p>Per user billing.</p>
<footer>© 2026 P</footer></body></html>`;
    const signalsNoLink = `<html><head><title>P</title></head><body>
<h1>Plans start at $20/mo</h1><p>Per user billing, free tier available.</p>
<footer>© 2026 P</footer></body></html>`;
    const a = scorePage(linkNoPrices, 'https://a.example', FIXED_NOW);
    const b = scorePage(linkWithPrices, 'https://b.example', FIXED_NOW);
    const c = scorePage(signalsNoLink, 'https://c.example', FIXED_NOW);
    assert.equal(a.metrics.pricing_opacity, 50, 'pricing link with no prices → 50');
    assert.equal(a.evidence.has_price_signals, false);
    assert.equal(b.metrics.pricing_opacity, 0, 'pricing link + real prices → 0');
    assert.equal(b.evidence.has_price_signals, true);
    assert.equal(c.metrics.pricing_opacity, 30, 'price signals but no pricing page → 30');
    assert.equal(c.evidence.has_price_signals, true);
  });

  it('v2: nav-bar evidence links no longer max the proof discount for free', () => {
    // Docs + changelog links live ONLY in the <nav> on one page, only in
    // the body on the other. One soft claim ("the best") against ten sober
    // sentences keeps the metric below saturation, so the discount gap is
    // visible: the nav-only page keeps more of its claim penalty.
    const sober = Array.from(
      { length: 10 },
      (_, i) => `<p>Feature ${i + 1} ships in the dashboard today.</p>`,
    ).join('\n');
    const claims = `<h1>Welcome to our platform</h1>
<p>We are the best.</p>
${sober}
<footer>© 2026 X</footer>`;
    const withNav = scorePage(
      `<html><head><title>X</title></head><body><nav><a href="/docs">Docs</a><a href="/changelog">Changelog</a></nav>${claims}</body></html>`,
      'https://x.example',
      FIXED_NOW,
    );
    const inBody = scorePage(
      `<html><head><title>X</title></head><body>${claims}<p><a href="/docs">Docs</a> <a href="/changelog">Changelog</a></p></body></html>`,
      'https://y.example',
      FIXED_NOW,
    );
    assert.equal(withNav.evidence.evidence_links, 0, 'chrome links excluded from the evidence count');
    assert.equal(inBody.evidence.evidence_links, 2, 'body links still count');
    assert.ok(
      withNav.metrics.claim_to_proof > inBody.metrics.claim_to_proof,
      `nav-only page keeps more of its claim penalty: nav=${withNav.metrics.claim_to_proof} body=${inBody.metrics.claim_to_proof}`,
    );
  });

  it('v2: freshness is kinder — unknown © is 15, curve is 0/20/40/70', () => {
    const noYear = scorePage(
      `<html><head><title>P</title></head><body><h1>Hi</h1><p>Minimal page, no footer.</p></body></html>`,
      'https://a.example',
      FIXED_NOW,
    );
    assert.equal(noYear.metrics.freshness, 15, 'unknown © → 15, not 30');
    const mk = (year: string) =>
      scorePage(
        `<html><head><title>P</title></head><body><h1>Hi</h1><footer>© ${year} P</footer></body></html>`,
        'https://b.example',
        FIXED_NOW,
      );
    assert.equal(mk('2026').metrics.freshness, 0);
    assert.equal(mk('2025').metrics.freshness, 20);
    assert.equal(mk('2024').metrics.freshness, 40);
    assert.equal(mk('2021').metrics.freshness, 70);
  });

  it('v2: LLM-slop tell-words ("delve", "tapestry", …) count as buzzwords', () => {
    const html = `<html><head><title>S</title></head><body>
<h1>Delve into the tapestry of data</h1>
<p>Furthermore, in today's fast-paced digital landscape, it's important to note that our platform is unmatched.</p>
<footer>© 2026 S</footer></body></html>`;
    const r = scorePage(html, 'https://s.example', FIXED_NOW);
    // Six slop phrases, six hits — the evidence top-5 display list is
    // truncated, so assert the count plus one phrase-level check.
    assert.ok(r.evidence.buzzword_hits >= 6, `expected 6+ slop hits, got ${r.evidence.buzzword_hits}`);
    const phrases = r.evidence.top_phrases.map((p) => p.phrase);
    assert.ok(phrases.some((p) => p.includes('delve')), `delve counted: ${phrases.join(', ')}`);
    assert.ok(
      phrases.some((p) => p.includes('digital landscape')),
      `digital landscape counted: ${phrases.join(', ')}`,
    );
    // Phrase-level: tapestry alone on an otherwise sober page.
    const tapestryOnly = scorePage(
      `<html><head><title>S</title></head><body><h1>Our data tapestry</h1>
<p>Postgres hosting with backups every 6 hours. 99.99% uptime SLA.</p>
<footer>© 2026 S</footer></body></html>`,
      'https://u.example',
      FIXED_NOW,
    );
    assert.ok(
      tapestryOnly.evidence.top_phrases.some((p) => p.phrase === 'tapestry'),
      `tapestry counted: ${tapestryOnly.evidence.top_phrases.map((p) => p.phrase).join(', ')}`,
    );
    // Bare "landscape" stays legit — only the LLM phrases count.
    const bare = scorePage(
      `<html><head><title>S</title></head><body><h1>Market report</h1>
<p>The competitive landscape shifted this quarter. Analysts track the landscape closely.</p>
<footer>© 2026 S</footer></body></html>`,
      'https://t.example',
      FIXED_NOW,
    );
    const barePhrases = bare.evidence.top_phrases.map((p) => p.phrase);
    assert.ok(
      !barePhrases.some((p) => p === 'landscape'),
      'bare "landscape" must not count',
    );
  });
});

describe('sniffScoreFor — the one public-number conversion', () => {
  it('flips the scale: 0 vapor → 100 sniff, 100 vapor → 0 sniff', () => {
    assert.equal(sniffScoreFor(0), 100);
    assert.equal(sniffScoreFor(100), 0);
  });

  it('converts exactly: sniff = 100 − vapor', () => {
    assert.equal(sniffScoreFor(53), 47);
    assert.equal(sniffScoreFor(1), 99);
    assert.equal(sniffScoreFor(99), 1);
  });

  it('rounds to the nearest integer', () => {
    // Engine scores are integers, but the conversion must be safe for
    // anything a future caller hands it.
    assert.equal(sniffScoreFor(33.4), 67); // 66.6 → 67
    assert.equal(sniffScoreFor(33.6), 66); // 66.4 → 66
    assert.equal(sniffScoreFor(50.5), 50); // 49.5 → 50 (Math.round)
  });

  it('clamps out-of-range input to 0–100', () => {
    assert.equal(sniffScoreFor(-5), 100);
    assert.equal(sniffScoreFor(105), 0);
  });
});

describe('scorePage public-number contract', () => {
  it('carries BOTH scores, and the tier matches the sniff score', () => {
    const r = scorePage(HIGH_VAPOR_HTML, 'https://hypeai.example', FIXED_NOW);
    assert.equal(r.sniff_score, 100 - r.vapor_score);
    assert.equal(r.tier, tierFor(r.sniff_score));
    const clean = scorePage(CLEAN_HTML, 'https://plaindb.example', FIXED_NOW);
    assert.equal(clean.sniff_score, 100 - clean.vapor_score);
    assert.equal(clean.tier, tierFor(clean.sniff_score));
  });

  it('tiers the seed-fixture range 0–53 vapor as 47–100 sniff', () => {
    // Seed vapor tops out at 53 (character.ai); nothing in the seed should
    // ever land below 47 sniff or below the JESTER band.
    assert.equal(tierFor(sniffScoreFor(53)), 'JESTER');
    assert.equal(tierFor(sniffScoreFor(0)), 'LAUREATE');
  });

  it('verdicts read in the flipped voice, not the old vapor voice', () => {
    const hype = scorePage(HIGH_VAPOR_HTML, 'https://hypeai.example', FIXED_NOW);
    assert.ok(!hype.verdict.includes('% vapor'), 'no old vapor phrasing');
    assert.ok(
      hype.verdict.startsWith(`${hype.sniff_score}/100`) ||
        hype.verdict.startsWith('A new record!'),
      `verdict leads with the sniff score, got: ${hype.verdict.slice(0, 60)}`,
    );
    const clean = scorePage(CLEAN_HTML, 'https://plaindb.example', FIXED_NOW);
    assert.ok(!clean.verdict.includes('% vapor'), 'no old vapor phrasing');
    assert.ok(clean.verdict.includes(`${clean.sniff_score}/100`));
  });

  it('does not double-negate missing evidence (grammar regression)', () => {
    // The missing items already read "no X"; the sentence must not add a
    // second negative like "no live demo is nowhere to be found".
    const r = scorePage(HIGH_VAPOR_HTML, 'https://hypeai.example', FIXED_NOW);
    assert.ok(
      !/nowhere to be found/.test(r.verdict),
      `double negative in verdict: ${r.verdict}`,
    );
    assert.ok(
      r.verdict.includes('no live demo to be found'),
      `missing-evidence sentence intact: ${r.verdict}`,
    );
  });
});

describe('scorePage v3 — sharper detection (weights and tiers locked)', () => {
  it('v3: hero buzzwords count double', () => {
    const filler =
      'Our company builds software tools for teams. We publish documentation and changelogs every week. Support answers within one business day. ';
    const hero = `<html><head><title>H</title></head><body>
<h1>Our seamless onboarding</h1>
<p>Plain text here with enough words to be normal.</p>
<p>${filler.repeat(3)}</p>
<footer>© 2026 H</footer></body></html>`;
    const body = `<html><head><title>B</title></head><body>
<h1>Our onboarding</h1>
<p>Our seamless onboarding flow is plain and normal here.</p>
<p>${filler.repeat(3)}</p>
<footer>© 2026 B</footer></body></html>`;
    const a = scorePage(hero, 'https://a.example', FIXED_NOW);
    const b = scorePage(body, 'https://b.example', FIXED_NOW);
    assert.equal(a.evidence.buzzword_hits, 2, 'h1 hit counts twice');
    assert.equal(b.evidence.buzzword_hits, 1, 'body hit counts once');
    assert.ok(
      a.metrics.buzzword_density > b.metrics.buzzword_density,
      'hero hype scores hotter',
    );
  });

  it('v3: 2026-era hype words count ("vibe coding", "dominate", …)', () => {
    const html = `<html><head><title>V</title></head><body>
<h1>Ship it</h1>
<p>We do vibe coding to help you dominate your market and crush your goals, from idea to hockey stick growth in record time.</p>
<footer>© 2026 V</footer></body></html>`;
    const r = scorePage(html, 'https://v.example', FIXED_NOW);
    // All six phrases detected (hits), and the top-5 display list keeps the
    // alphabetically-first ones — evidence.top_phrases truncates at 5.
    assert.ok(r.evidence.buzzword_hits >= 6, `expected 6+ hits, got ${r.evidence.buzzword_hits}`);
    const phrases = r.evidence.top_phrases.map((p) => p.phrase);
    assert.ok(phrases.some((p) => p.includes('dominate')), `dominate counted: ${phrases.join(', ')}`);
    assert.ok(phrases.some((p) => p.includes('crush your')), `crush your counted: ${phrases.join(', ')}`);
  });

  it('v3: new grand-claim shapes fire', () => {
    const html = `<html><head><title>X</title></head><body>
<h1>X</h1>
<p>We are the only platform that does this. It is the first of its kind. This has never been done before. Impossible outcomes delivered daily.</p>
<p>Concrete detail: the dashboard ships today with docs. © 2026 X</p>
</body></html>`;
    const r = scorePage(html, 'https://x.example', FIXED_NOW);
    assert.ok(
      r.evidence.claim_sentences >= 4,
      `expected 4+ claim sentences, got ${r.evidence.claim_sentences}`,
    );
    // …but the innocent "the only thing we store" stays innocent.
    const innocent = scorePage(
      `<html><head><title>Y</title></head><body><h1>Y</h1>
<p>The only thing we store is your email. Concrete numbers: 40ms p99. © 2026 Y</p>
</body></html>`,
      'https://y.example',
      FIXED_NOW,
    );
    assert.equal(innocent.evidence.claim_sentences, 0, '"the only thing we store" is not a grand claim');
  });

  it('v3: hard proof discounts more than soft proof', () => {
    const sober = Array.from(
      { length: 8 },
      (_, i) => `<p>Feature ${i + 1} ships in the dashboard today.</p>`,
    ).join('\n');
    const mk = (links: string) =>
      `<html><head><title>E</title></head><body>
<h1>Welcome</h1>
<p>We are the best platform on Earth, honestly.</p>
${sober}
<p>${links}</p>
<footer>© 2026 E</footer></body></html>`;
    const hard = scorePage(
      mk('<a href="/docs">Docs</a> <a href="/changelog">Changelog</a>'),
      'https://hard.example',
      FIXED_NOW,
    );
    const soft = scorePage(
      mk('<a href="/blog">Blog</a> <a href="/whitepaper">Whitepaper</a>'),
      'https://soft.example',
      FIXED_NOW,
    );
    assert.equal(hard.evidence.evidence_links, 2);
    assert.equal(soft.evidence.evidence_links, 2);
    assert.ok(
      soft.metrics.claim_to_proof > hard.metrics.claim_to_proof,
      `soft proof discounts less: soft=${soft.metrics.claim_to_proof} hard=${hard.metrics.claim_to_proof}`,
    );
  });

  it('v3: short hype slogans are judged ("Unlock your potential.")', () => {
    const html = `<html><head><title>V</title></head><body>
<h1>Hi</h1>
<p>Unlock your potential.</p>
<p>The cat sat.</p>
<p>Concrete numbers: 99% uptime SLA.</p>
<footer>© 2026 V</footer></body></html>`;
    const r = scorePage(html, 'https://v.example', FIXED_NOW);
    assert.equal(r.evidence.vague_sentences, 1, 'only the imperative slogan is vague');
    assert.equal(r.metrics.vague_verb, 50, '1 of 2 judged sentences vague → 50');
  });

  it('v3: verifiable testimonials buy back sketch points', () => {
    const anon = `<html><head><title>A</title></head><body>
<h1>A</h1>
<p>"This product changed everything" — CEO</p>
<footer>© 2026 A</footer></body></html>`;
    const verified = `<html><head><title>B</title></head><body>
<h1>B</h1>
<p>"This product changed everything" — Jane Smith, VP Marketing at Acme Corp</p>
<footer>© 2026 B</footer></body></html>`;
    const a = scorePage(anon, 'https://a.example', FIXED_NOW);
    const b = scorePage(verified, 'https://b.example', FIXED_NOW);
    assert.equal(a.metrics.social_proof, 30, 'anonymous role-only testimonial → +30');
    assert.equal(b.metrics.social_proof, 0, 'verifiable testimonial → credit wipes it');
    assert.equal(b.evidence.verified_testimonials, 1);
  });

  it('v3: price numbers with no billing period are half-hidden', () => {
    const mk = (priceLine: string) =>
      `<html><head><title>P</title></head><body>
<nav><a href="/pricing">Pricing</a></nav><h1>Plans</h1><p>${priceLine}</p>
<footer>© 2026 P</footer></body></html>`;
    const bare = scorePage(mk('Only $49. No hidden fees.'), 'https://a.example', FIXED_NOW);
    const termed = scorePage(mk('Only $49/mo. No hidden fees.'), 'https://b.example', FIXED_NOW);
    assert.equal(bare.metrics.pricing_opacity, 15, '"$49" with no period → 15');
    assert.equal(termed.metrics.pricing_opacity, 0, '"$49/mo" → 0');
  });

  it('v3: abandoned blog floors the freshness penalty', () => {
    const mk = (blog: string) =>
      `<html><head><title>A</title></head><body>
<h1>Hi</h1>${blog}<footer>© 2024 A</footer></body></html>`;
    const abandoned = scorePage(mk('<p><a href="/blog">Blog</a></p>'), 'https://a.example', FIXED_NOW);
    const quiet = scorePage(mk(''), 'https://b.example', FIXED_NOW);
    assert.equal(quiet.metrics.freshness, 40, '2-year-old ©, no blog → 40');
    assert.equal(abandoned.metrics.freshness, 50, '2-year-old © + blog link → floored at 50');
  });
});
