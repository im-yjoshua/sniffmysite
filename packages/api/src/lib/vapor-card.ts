/**
 * SniffMySite share card renderer (1200×630) — Task 7 (§2.5 "Share cards
 * (OG images auto-generated per result)"), rebuilt for the Sniff Score
 * flip. The card shows the PUBLIC number (sniff = 100 − vapor) with the
 * original SniffMySite rosette seal: a serrated circular medal, the tier
 * name across the middle, two ribbon tails, the deterministic evidence
 * joke, and the canonical share URL.
 *
 * Tech: hand-built SVG → PNG via @resvg/resvg-js (already a dependency —
 * shared with the BurnRate lane; no new deps). Same rationale as
 * lib/report-card.ts: no Chromium on the Render free tier, and resvg loads
 * our bundled TTFs explicitly so the card looks identical everywhere.
 *
 * Design: the Inspection Lab voice. Paper background, hairline rules, giant
 * score, the rosette seal, one deadpan field note. No gradients, no stock
 * imagery, no emoji — §0.4. No VAPORRANK anywhere; this is SniffMySite.
 *
 * Satire guardrail (§2.12): the joke roasts the PAGE's copy and structural
 * facts only — buzzword counts, claim counts, missing prices. Never people,
 * never founder names.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import type { MetricScores, ScoreEvidence, Tier } from './score';

export interface VaporCardInput {
  slug: string;
  domain: string;
  /** THE public number: the sniff score (100 − vapor), 0–100. */
  sniff_score: number;
  tier: Tier;
  verdict: string;
  siteUrl: string;
  metrics: MetricScores;
  evidence: ScoreEvidence;
}

// ---------------------------------------------------------------------------
// Rosette badge — the original SniffMySite seal. A serrated circular medal,
// the tier name set across the middle, two ribbon tails hanging below.
// ---------------------------------------------------------------------------

/** Tier colors — Inspection Lab palette, all readable on paper. */
export const ROSETTE_COLORS: Record<Tier, string> = {
  'CERTIFIED REAL': '#B98A1D', // gold — the prize
  'ALMOST REAL': '#6E7681', // silver/slate
  SUS: '#D97A1F', // orange
  'JUST VIBES': '#FF4D00', // hazard red-orange
  'CERTIFIED FAKE': '#9A958A', // sad gray
};

export function rosetteColor(tier: Tier): string {
  return ROSETTE_COLORS[tier];
}

/**
 * Split a tier label into badge lines — same 2-word chunking the old
 * rubber-stamp badge used, so every tier is recognizable at a glance.
 */
export function rosetteBadgeLines(tier: Tier): string[] {
  const words = tier.split(' ');
  if (words.length <= 2) return [tier];
  if (words.length === 3) return [`${words[0]} ${words[1]}`, words[2]];
  return [`${words[0]} ${words[1]}`, words.slice(2).join(' ')];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Shrink-to-fit font size for a text line. longest = characters of the
 * longest line, maxWidth/maxSize = bounding constraints, ratio = average
 * glyph width as a fraction of font size for bold uppercase Inter/Space
 * Grotesk (narrow enough to keep tier names inside the seal).
 */
function fitFontSize(
  longest: number,
  maxWidth: number,
  maxSize: number,
  ratio: number,
  minSize: number,
): number {
  return Math.max(
    minSize,
    Math.min(maxSize, maxWidth / (Math.max(1, longest) * ratio)),
  );
}

/**
 * Original SniffMySite rosette: a serrated circular medal with the tier
 * name set across the middle and two ribbon tails hanging below.
 * Coordinates are relative to (cx, cy, r) so the same seal scales from
 * the 28px leaderboard chip to the 300px card medallion.
 */
export function rosetteBadgeSVG(
  tier: Tier,
  cx: number,
  cy: number,
  r: number,
): string {
  const color = rosetteColor(tier);

  // Serrated edge: 24 teeth alternating outer/inner radius.
  const teeth = 24;
  const pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (Math.PI * i) / teeth;
    const rad = i % 2 === 0 ? r : r * 0.87;
    pts.push(
      `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`,
    );
  }

  const lines = rosetteBadgeLines(tier);
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
  const fontSize = fitFontSize(longest, r * 1.02, r * 0.34, 0.62, 9);
  const lineHeight = fontSize * 1.12;
  const startY = cy - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35;
  const texts = lines
    .map(
      (line, i) =>
        `<text x="${cx}" y="${(startY + i * lineHeight).toFixed(1)}" text-anchor="middle" font-family="'Space Grotesk','Inter',sans-serif" font-weight="700" font-size="${fontSize.toFixed(1)}" letter-spacing="1" fill="${color}">${escapeXml(line)}</text>`,
    )
    .join('');

  // Two ribbon tails with notched swallowtail cuts.
  const y0 = cy + r * 0.42;
  const f = (n: number): string => n.toFixed(1);
  const left = `M${f(cx - r * 0.55)},${f(y0)} L${f(cx - r * 0.15)},${f(y0)} L${f(cx - r * 0.32)},${f(cy + r * 1.18)} L${f(cx - r * 0.46)},${f(cy + r * 1.02)} L${f(cx - r * 0.6)},${f(cy + r * 1.18)} Z`;
  const right = `M${f(cx + r * 0.15)},${f(y0)} L${f(cx + r * 0.55)},${f(y0)} L${f(cx + r * 0.6)},${f(cy + r * 1.18)} L${f(cx + r * 0.46)},${f(cy + r * 1.02)} L${f(cx + r * 0.32)},${f(cy + r * 1.18)} Z`;

  return (
    `<polygon points="${pts.join(' ')}" fill="${color}"/>` +
    `<path d="${left}" fill="${color}"/>` +
    `<path d="${right}" fill="${color}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${f(r * 0.66)}" fill="${VPAL.paper}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${f(r * 0.58)}" fill="none" stroke="${color}" stroke-width="${f(Math.max(1, r * 0.03))}"/>` +
    texts
  );
}

// ---------------------------------------------------------------------------
// Palette — The Inspection Lab (§2.7)
// ---------------------------------------------------------------------------
export const VPAL = {
  paper: '#F6F1E7',
  ink: '#141310',
  hazard: '#FF4D00',
  gold: '#B98A1D',
  hairline: '#141310',
  soft: '#3A352C',
  faint: '#6B6257',
} as const;

// ---------------------------------------------------------------------------
// Deterministic evidence joke — field notes from the inspection lab
// ---------------------------------------------------------------------------

export interface JokeInput {
  /** THE public number: the sniff score (100 − vapor), 0–100. */
  sniff_score: number;
  tier: Tier;
  metrics: MetricScores;
  evidence: ScoreEvidence;
}

/** Only pages with real findings get the full joke; below this, the
 * tier-specific one-liners carry the card. */
export const JOKE_THRESHOLD = 6;

/**
 * The joke is deterministic per domain: no Math.random anywhere. It cites
 * real findings (buzzword hits, claim sentences) and never names people.
 */
export function cardJoke(input: JokeInput): string {
  const { sniff_score, tier, evidence } = input;
  const buzz = evidence.buzzword_hits;
  const claims = evidence.claim_sentences;
  if (buzz >= JOKE_THRESHOLD && claims >= 3) {
    return `The judge counted ${buzz} hype-words and ${claims} grand claims before lunch. It stopped counting when lunch ended.`;
  }
  // Fallbacks keyed by tier — the sniff score only picks the wording.
  if (sniff_score >= 81) return 'The judge re-checked this page twice. Grudgingly.';
  if (sniff_score >= 61)
    return 'One honest paragraph and this page would be unroastable. So close.';
  if (sniff_score >= 41) return "The judge marked this page 'sus' and moved on.";
  if (sniff_score >= 21)
    return 'The judge found vibes where the features should be.';
  return 'The judge stopped reading after the third adjective. Allegedly.';
}

// ---------------------------------------------------------------------------
// Card layout (1200×630)
// ---------------------------------------------------------------------------

const CARD_W = 1200;
const CARD_H = 630;

/** Plain-words "why" line for the card — names the top smell-check driver. */
function whyLine(input: VaporCardInput): string {
  const m = input.metrics;
  const ranked: Array<[string, number]> = [
    ['buzzwords', m.buzzword_density],
    ['big claims', m.claim_to_proof],
    ['vague verbs', m.vague_verb],
    ['trust theater', m.social_proof],
    ['hidden prices', m.pricing_opacity],
    ['old news', m.freshness],
  ].map((pair) => pair as [string, number]);
  ranked.sort((a, b) => b[1] - a[1]);
  const [label, value] = ranked[0];
  if (input.sniff_score >= 81)
    return `Why so real? ${label} barely registered (${value}/100 smell).`;
  return `Why so vapor? ${label} scored ${value}/100 on the smell checks.`;
}

/** Deterministic report number from the slug — no randomness. */
function reportNumber(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return `#${String((h % 9000) + 1000)}`;
}

export function buildVaporCardSVG(input: VaporCardInput): string {
  const color = rosetteColor(input.tier);
  const mono = "'JetBrains Mono',monospace";
  const sans = "'Space Grotesk','Inter',sans-serif";
  const innerX = 72;

  // Shrink-to-fit for long jokes/why-lines so nothing clips.
  const joke = cardJoke({
    sniff_score: input.sniff_score,
    tier: input.tier,
    metrics: input.metrics,
    evidence: input.evidence,
  });
  const why = whyLine(input);
  const jokeSize = fitFontSize(joke.length, CARD_W - innerX * 2, 22, 0.55, 15);
  const whySize = fitFontSize(why.length, CARD_W - innerX * 2, 22, 0.55, 15);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
<rect width="${CARD_W}" height="${CARD_H}" fill="${VPAL.paper}"/>
<rect x="0" y="0" width="${CARD_W}" height="12" fill="${VPAL.ink}"/>
<!-- header: monogram + SniffMySite + inspection lab -->
<circle cx="${innerX}" cy="86" r="34" fill="${VPAL.ink}"/>
<text x="${innerX}" y="99" text-anchor="middle" font-family="${sans}" font-weight="700" font-size="30" fill="${VPAL.paper}">S</text>
<text x="${innerX + 50}" y="80" font-family="${sans}" font-weight="700" font-size="30" letter-spacing="3" fill="${VPAL.ink}">SNIFFMYSITE</text>
<text x="${innerX + 50}" y="106" font-family="${mono}" font-size="16" letter-spacing="4" fill="${VPAL.faint}">INSPECTION LAB</text>
<text x="${CARD_W - innerX}" y="80" text-anchor="end" font-family="${mono}" font-size="16" letter-spacing="2" fill="${VPAL.faint}">SNIFF REPORT ${reportNumber(input.slug)}</text>
<text x="${CARD_W - innerX}" y="106" text-anchor="end" font-family="${mono}" font-size="16" fill="${VPAL.faint}">${escapeXml(input.domain)}</text>
<line x1="${innerX - 24}" y1="146" x2="${CARD_W - innerX + 24}" y2="146" stroke="${VPAL.hairline}" stroke-width="2"/>
<!-- score block: the public sniff score, giant -->
<text x="${innerX}" y="208" font-family="${mono}" font-size="22" letter-spacing="5" fill="${VPAL.faint}">SNIFF SCORE</text>
<text x="${innerX - 4}" y="386" font-family="${sans}" font-weight="700" font-size="190" letter-spacing="-4" fill="${VPAL.ink}">${input.sniff_score}</text>
<text x="${innerX}" y="452" font-family="${sans}" font-weight="700" font-size="34" letter-spacing="2" fill="${color}">${escapeXml(input.tier)}</text>
<!-- rosette seal -->
${rosetteBadgeSVG(input.tier, 952, 292, 128)}
<!-- evidence: why-line + deterministic field note -->
<text x="${innerX}" y="522" font-family="${sans}" font-weight="600" font-size="${whySize}" fill="${VPAL.soft}">${escapeXml(why)}</text>
<text x="${innerX}" y="556" font-family="${sans}" font-style="italic" font-size="${jokeSize}" fill="${VPAL.faint}">${escapeXml(joke)}</text>
<!-- footer -->
<line x1="${innerX - 24}" y1="584" x2="${CARD_W - innerX + 24}" y2="584" stroke="${VPAL.hairline}" stroke-width="2"/>
<text x="${innerX}" y="610" font-family="${mono}" font-size="15" fill="${VPAL.faint}">we joke about the page, never the people.</text>
<text x="${CARD_W - innerX}" y="610" text-anchor="end" font-family="${mono}" font-size="15" fill="${VPAL.faint}">https://sniffmysite.lol/s/${escapeXml(input.slug)}</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Rendering (impure: resvg + font files)
// ---------------------------------------------------------------------------

/**
 * Resolve the bundled font files. In dev they live at src/assets/fonts; after
 * `npm run build` the copy:fonts step puts them at dist/assets/fonts. Both
 * are handled by resolving relative to this module's own directory.
 */
function fontDir(): string {
  const candidates = [
    join(__dirname, 'assets', 'fonts'),
    join(__dirname, '..', 'assets', 'fonts'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'JetBrainsMono-Bold.ttf'))) return dir;
  }
  return '';
}

/** SVG → PNG (1200×630) via resvg, with the repo's bundled TTFs. */
export async function renderVaporPNG(svg: string): Promise<Buffer> {
  const dir = fontDir();
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: CARD_W },
    font:
      dir !== ''
        ? {
            loadSystemFonts: false,
            fontFiles: [
              join(dir, 'JetBrainsMono-Bold.ttf'),
              join(dir, 'SpaceGrotesk-Bold.ttf'),
            ],
          }
        : (() => {
            console.warn(
              '[api] vapor-card: bundled fonts missing — falling back to system fonts. ' +
                'Run `npm run build` (copy:fonts) to fix.',
            );
            return { loadSystemFonts: true };
          })(),
  });
  const png = resvg.render();
  return Buffer.from(png.asPng());
}

/**
 * Cache key: slug + the fields that appear on the card. Seed data is static
 * today, so the slug alone would do — the sniff score future-proofs the key
 * for re-scans (Tasks 8–9), where the same slug gets a new score.
 */
export function vaporCardCacheKey(
  slug: string,
  fields: Record<string, unknown>,
): string {
  const hash = createHash('sha1')
    .update(JSON.stringify(fields))
    .digest('hex')
    .slice(0, 16);
  return `${slug}:${hash}`;
}

const cache = new Map<string, Buffer>();
const MAX_CACHE = 100;

/**
 * Render (or fetch from cache) a share card PNG.
 * Returns the same Buffer instance on cache hits — callers must not mutate it.
 */
export async function getVaporCardPNG(
  key: string,
  input: VaporCardInput,
): Promise<Buffer> {
  const hit = cache.get(key);
  if (hit) return hit;
  const png = await renderVaporPNG(buildVaporCardSVG(input));
  cache.set(key, png);
  while (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
  return png;
}

/** Exposed for tests: cache internals stay module-private otherwise. */
export function _testClearCache(): void {
  cache.clear();
}
export function _testCacheSize(): number {
  return cache.size;
}
