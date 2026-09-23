/**
 * Burn report card renderer — Task 6 (§3.5, §3.6).
 *
 * Tech choice: hand-built SVG → PNG via @resvg/resvg-js.
 *
 * Why not puppeteer: a full Chromium (~170MB) is too heavy for the Render
 * free tier and adds a browser attack surface for a static image. Why not
 * sharp: its SVG path uses librsvg, which renders <text> only with fonts it
 * can find via fontconfig — on Render's minimal image that means mystery
 * fallback type. resvg-js is a Rust renderer with explicit font loading, so
 * we bundle JetBrains Mono + Space Grotesk as TTFs in this repo
 * (src/assets/fonts/) and the card looks identical everywhere.
 *
 * Font fallback (LOUD): if the bundled TTFs are missing at runtime — e.g.
 * someone runs `dist/` without the copy:fonts build step — we fall back to
 * system fonts and log a warning. The card still renders; the typography
 * just isn't guaranteed. Fix: always build with `npm run build` (fonts are
 * copied to dist/assets/fonts automatically).
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { themePalette } from './burn-billing';

// ---------------------------------------------------------------------------
// Palette — After-Hours Trading Floor (§3.7)
// ---------------------------------------------------------------------------
export const PAL = {
  bg: '#0B0B0C',
  surface: '#131315',
  text: '#F5F1E8',
  ember: '#FF5C1A',
  ash: '#8A877F',
  divider: '#1F1F22',
} as const;

export const CARD_W = 1200;
export const CARD_H = 630;

/** In-memory render cache: max 200 cards, FIFO eviction (v1, single instance). */
const MAX_CACHE = 200;
const cache = new Map<string, Buffer>();

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Escape user-controlled strings for the SVG template. Never skip this. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** $212,000/mo — tabular mono figures everywhere money appears. */
export function formatMoney(usdPerMonth: number): string {
  return `$${Math.round(usdPerMonth).toLocaleString('en-US')}/mo`;
}

/**
 * Runway line for the card, §3.8 voice.
 * `days` = fractional days remaining (null = unknown, negative = airborne).
 */
export function formatRunwayLine(days: number | null): string {
  if (days == null || Number.isNaN(days)) return 'RUNWAY: UNKNOWN. BOLD STRATEGY.';
  if (days <= 0) return 'RUNWAY: 0 DAYS. STATUS: AIRBORNE.';
  if (days < 7) return `RUNWAY: ${Math.floor(days)} DAYS. STATUS: CRITICAL.`;
  if (days < 60) {
    const weeks = Math.max(1, Math.round(days / 7));
    return `RUNWAY: ${weeks} WEEK${weeks === 1 ? '' : 'S'}.`;
  }
  const months = Math.max(2, Math.floor(days / 30.4375));
  return `RUNWAY: ${months} MONTH${months === 1 ? '' : 'S'}.`;
}

/**
 * Shrink-to-fit: largest font size ≤ maxSize such that `text` fits maxWidth.
 * Width is estimated from the average glyph advance (conservative factors,
 * plus a 6% safety margin) — good enough for a card, exact enough for tests.
 */
export function fitFontSize(
  text: string,
  maxWidth: number,
  maxSize: number,
  avgAdvance: number,
  minSize = 28,
): number {
  let size = maxSize;
  while (size > minSize && text.length * size * avgAdvance * 1.06 > maxWidth) {
    size -= 4;
  }
  return size;
}

/** Hard truncate so one absurd name can't break the layout. */
export function clampName(name: string, maxChars = 42): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  return clean.length > maxChars ? clean.slice(0, maxChars - 1).trimEnd() + '…' : clean;
}

// Lucide Flame path (24x24, stroke style) — the only icon on the card.
const FLAME_PATH =
  'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z';

export interface ReportCardInput {
  name: string;
  domain: string;
  slug: string;
  monthlyBurn: number;
  runwayDaysRemaining: number | null;
  /** Canonical site URL, no trailing slash, e.g. https://burn-rate.lol */
  siteUrl: string;
  /** Card skin — 'terminal' (default) or a purchased theme (Task 8, §3.6).
   *  The route gates this against the company's purchased theme; unknown
   *  names fall back to 'terminal'. */
  theme?: string;
}

/**
 * Build the 1200×630 report card SVG. Pure — no I/O, fully unit-testable.
 *
 * Layout (no card grids, no gradients — §0.4):
 *   header row → hairline → name / domain → GIANT burn figure →
 *   runway line → hairline → footer (page URL · disclaimer)
 *
 * The `theme` field swaps the palette (Task 8 §3.6 skins: doom, copium,
 * diamond_hands). Same layout, different lighting — the anti-slop law
 * applies to every skin equally.
 */
export function buildReportCardSVG(input: ReportCardInput): string {
  const name = escapeXml(clampName(input.name));
  const domain = escapeXml(input.domain.trim().toLowerCase());
  const pageUrl = escapeXml(`${input.siteUrl.replace(/\/+$/, '')}/c/${input.slug}`);
  const burn = escapeXml(formatMoney(input.monthlyBurn));
  const runway = escapeXml(formatRunwayLine(input.runwayDaysRemaining));
  const T = themePalette(input.theme);

  const innerX = 72;
  const innerW = CARD_W - innerX * 2;
  const nameSize = fitFontSize(input.name, innerW, 84, 0.58);
  const burnSize = fitFontSize(formatMoney(input.monthlyBurn), innerW, 168, 0.6);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <rect width="${CARD_W}" height="${CARD_H}" fill="${T.bg}"/>
  <rect x="28" y="28" width="${CARD_W - 56}" height="${CARD_H - 56}" fill="none" stroke="${T.divider}" stroke-width="2"/>

  <g transform="translate(${innerX},86)">
    <g transform="translate(0,-13)" stroke="${T.ember}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="${FLAME_PATH}" transform="scale(1.5)"/>
    </g>
    <text x="46" y="0" font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="32" letter-spacing="6" fill="${T.text}">BURNRATE.LOL</text>
    <text x="${innerW}" y="0" text-anchor="end" font-family="'JetBrains Mono',monospace" font-weight="700" font-size="21" letter-spacing="4" fill="${T.ash}">AUDITED BY VIBES&#8482;</text>
  </g>

  <line x1="${innerX}" y1="128" x2="${CARD_W - innerX}" y2="128" stroke="${T.divider}" stroke-width="2"/>

  <text x="${innerX}" y="218" font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="${nameSize}" fill="${T.text}">${name}</text>
  <text x="${innerX}" y="262" font-family="'JetBrains Mono',monospace" font-weight="700" font-size="26" letter-spacing="2" fill="${T.ash}">${domain}</text>

  <text x="${innerX}" y="400" font-family="'JetBrains Mono',monospace" font-weight="700" font-size="${burnSize}" fill="${T.ember}">${burn}</text>
  <text x="${innerX}" y="452" font-family="'JetBrains Mono',monospace" font-weight="700" font-size="30" letter-spacing="2" fill="${T.text}">BURNING&#160;&#160;&#183;&#160;&#160;VIBES: IMMACULATE</text>
  <text x="${innerX}" y="496" font-family="'JetBrains Mono',monospace" font-weight="700" font-size="30" letter-spacing="2" fill="${T.ash}">${runway}</text>

  <line x1="${innerX}" y1="536" x2="${CARD_W - innerX}" y2="536" stroke="${T.divider}" stroke-width="2"/>
  <text x="${innerX}" y="578" font-family="'JetBrains Mono',monospace" font-size="23" letter-spacing="1" fill="${T.ash}">${pageUrl}</text>
  <text x="${CARD_W - innerX}" y="578" text-anchor="end" font-family="'JetBrains Mono',monospace" font-size="23" letter-spacing="1" fill="${T.ash}">not financial advice. obviously.</text>
</svg>`;
}

/**
 * Site-wide default OG image (1200×630): the hero one-liner as a share card.
 * Used for `/` and anywhere a per-company card doesn't apply.
 */
export function buildDefaultOgSVG(siteUrl: string): string {
  const url = escapeXml(siteUrl.replace(/\/+$/, ''));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <rect width="${CARD_W}" height="${CARD_H}" fill="${PAL.bg}"/>
  <rect x="28" y="28" width="${CARD_W - 56}" height="${CARD_H - 56}" fill="none" stroke="${PAL.divider}" stroke-width="2"/>

  <g transform="translate(72,86)">
    <g transform="translate(0,-13)" stroke="${PAL.ember}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="${FLAME_PATH}" transform="scale(1.5)"/>
    </g>
    <text x="46" y="0" font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="32" letter-spacing="6" fill="${PAL.text}">BURNRATE.LOL</text>
    <text x="1056" y="0" text-anchor="end" font-family="'JetBrains Mono',monospace" font-weight="700" font-size="21" letter-spacing="4" fill="${PAL.ash}">AUDITED BY VIBES&#8482;</text>
  </g>

  <line x1="72" y1="128" x2="1128" y2="128" stroke="${PAL.divider}" stroke-width="2"/>

  <text x="72" y="290" font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="88" fill="${PAL.text}">Revenue is vanity.</text>
  <text x="72" y="392" font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="88" fill="${PAL.text}">Burn is sanity. <tspan fill="${PAL.ember}">Probably.</tspan></text>

  <text x="72" y="470" font-family="'JetBrains Mono',monospace" font-weight="700" font-size="30" letter-spacing="2" fill="${PAL.ash}">THE LEADERBOARD THAT RANKS STARTUPS BY MONTHLY BURN</text>

  <line x1="72" y1="536" x2="1128" y2="536" stroke="${PAL.divider}" stroke-width="2"/>
  <text x="72" y="578" font-family="'JetBrains Mono',monospace" font-size="23" letter-spacing="1" fill="${PAL.ash}">${url}</text>
  <text x="1128" y="578" text-anchor="end" font-family="'JetBrains Mono',monospace" font-size="23" letter-spacing="1" fill="${PAL.ash}">not financial advice. obviously.</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Rendering (impure: resvg + font files)
// ---------------------------------------------------------------------------

/**
 * Resolve the bundled font files. In dev they live at src/assets/fonts; after
 * `npm run build` the copy:fonts step puts them at dist/assets/fonts. Both
 * are handled by resolving relative to this module's own directory.
 * (CommonJS build, so plain __dirname — no import.meta games needed.)
 */
function fontDir(): string {
  const candidates = [join(__dirname, 'assets', 'fonts'), join(__dirname, '..', 'assets', 'fonts')];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'JetBrainsMono-Bold.ttf'))) return dir;
  }
  return '';
}

/**
 * SVG → PNG (1200×630) via resvg. Bundled fonts are loaded by file so the
 * card's typography is identical on every machine — no fontconfig roulette.
 */
export async function renderPNG(svg: string): Promise<Buffer> {
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
            // LOUD FALLBACK: fonts weren't copied. Render still works, but the
            // card falls back to whatever the host has. Rebuild properly.
            console.warn(
              '[api] report-card: bundled fonts missing — falling back to system fonts. ' +
                'Run `npm run build` (copy:fonts) to fix.',
            );
            return { loadSystemFonts: true };
          })(),
  });
  const png = resvg.render();
  return Buffer.from(png.asPng());
}

/** Cache key: slug + hash of every field that appears on the card. */
export function reportCardCacheKey(
  slug: string,
  fields: Record<string, unknown>,
): string {
  const hash = createHash('sha1').update(JSON.stringify(fields)).digest('hex').slice(0, 16);
  return `${slug}:${hash}`;
}

/**
 * Render (or fetch from cache) a report card PNG.
 * Returns the same Buffer instance on cache hits — callers must not mutate it.
 */
export async function getReportCardPNG(
  key: string,
  input: ReportCardInput,
): Promise<Buffer> {
  const hit = cache.get(key);
  if (hit) return hit;
  const png = await renderPNG(buildReportCardSVG(input));
  cache.set(key, png);
  // FIFO eviction — oldest inserted key goes first (Map preserves insertion order).
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
