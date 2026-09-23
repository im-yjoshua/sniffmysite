/**
 * The "Sniffed" badge — GET /api/vapor/badge/:slug.svg (Growth Plan §1).
 *
 * A self-contained SVG (no external assets, no webfonts — the system font
 * stack keeps it crisp everywhere it's hotlinked). It shows the host's LIVE
 * sniff score + tier name in the tier's color + the SniffMySite wordmark,
 * and links back to the dossier wherever the snippet is pasted.
 *
 * The score comes from `getProfile(slug)` — the exact same source the
 * dossier page, the leaderboard, and the share card read (live journal
 * first, seed fallback). One re-scan updates the badge, the board, and the
 * dossier together; the badge can never show a stale or fabricated score.
 *
 * Unknown slugs get a 404 SVG ("not sniffed yet") — never a made-up
 * number. Malformed slugs get a 400 SVG. The route sets
 * `Cache-Control: public, max-age=3600` (scores move slowly; hourly
 * refresh is honest) and `Cross-Origin-Resource-Policy: cross-origin`
 * because badges are MEANT to be hotlinked on other people's sites.
 *
 * Design language: Inspection Lab paper/ink, tier-color accent bar (the
 * rosette seal doesn't read below ~120px, so the badge leads with a big
 * number and a small tier label instead). No gradients, no emojis.
 */

import { normalizeSlug } from './slug';
import { getProfile } from './profile';
import { ROSETTE_COLORS } from './vapor-card';
import type { Tier } from './score';

/** Badge canvas. Reads fine down to ~120px wide. */
export const BADGE_W = 320;
export const BADGE_H = 112;

const PAL = {
  paper: '#F6F1E7',
  ink: '#141310',
  soft: '#3A352C',
  faint: '#6B6257',
  gray: '#9A958A',
} as const;

const FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * The live badge: big score (with /100 context), tier name in the tier's
 * color, and the wordmark. The score and tier are the whole message at
 * this size — no domain text is rendered.
 */
export function badgeSvg(sniffScore: number, tier: Tier): string {
  const color = ROSETTE_COLORS[tier];
  const score = Math.max(0, Math.min(100, Math.round(sniffScore)));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_W}" height="${BADGE_H}" viewBox="0 0 ${BADGE_W} ${BADGE_H}" font-family="${FONT_STACK}" role="img" aria-label="SniffMySite score ${score} out of 100, ${escapeXml(tier)}">` +
    `<rect width="${BADGE_W}" height="${BADGE_H}" fill="${PAL.paper}" stroke="${PAL.ink}" stroke-width="3"/>` +
    `<rect width="10" height="${BADGE_H}" fill="${color}"/>` +
    `<text x="28" y="64"><tspan font-size="58" font-weight="800" fill="${PAL.ink}">${score}</tspan><tspan dx="6" font-size="22" fill="${PAL.faint}">/100</tspan></text>` +
    `<text x="28" y="96" font-size="21" font-weight="800" letter-spacing="1" fill="${color}">${escapeXml(tier)}</text>` +
    `<text x="296" y="32" text-anchor="end" font-size="11" font-weight="700" letter-spacing="1.5" fill="${PAL.faint}">SNIFFED BY SNIFFMYSITE</text>` +
    `</svg>`
  );
}

/** Shared frame for the honest non-score badges (404 / 400). */
function messageBadge(main: string, sub: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_W}" height="${BADGE_H}" viewBox="0 0 ${BADGE_W} ${BADGE_H}" font-family="${FONT_STACK}" role="img" aria-label="${escapeXml(main)}">` +
    `<rect width="${BADGE_W}" height="${BADGE_H}" fill="${PAL.paper}" stroke="${PAL.ink}" stroke-width="3"/>` +
    `<rect width="10" height="${BADGE_H}" fill="${PAL.gray}"/>` +
    `<text x="28" y="56" font-size="24" font-weight="800" fill="${PAL.soft}">${escapeXml(main)}</text>` +
    `<text x="28" y="84" font-size="14" fill="${PAL.faint}">${escapeXml(sub)}</text>` +
    `<text x="296" y="32" text-anchor="end" font-size="11" font-weight="700" letter-spacing="1.5" fill="${PAL.faint}">SNIFFED BY SNIFFMYSITE</text>` +
    `</svg>`
  );
}

/** 404 body: the host has never been sniffed — no score is invented. */
export function notSniffedSvg(): string {
  return messageBadge('Not sniffed yet', 'Run a sniff to earn a badge.');
}

/** 400 body: the slug can't be a domain at all. */
export function badSlugSvg(): string {
  return messageBadge('Bad address', "That doesn't look like a website.");
}

export interface BadgeResolution {
  status: 200 | 400 | 404;
  svg: string;
}

/**
 * Resolve a badge for a raw slug. Reads the dossier source of truth
 * (getProfile: live journal first, seed fallback), so the badge always
 * shows the true latest score.
 */
export function resolveBadge(raw: unknown): BadgeResolution {
  const slug = normalizeSlug(raw);
  if (!slug) return { status: 400, svg: badSlugSvg() };
  const profile = getProfile(slug);
  if (!profile) return { status: 404, svg: notSniffedSvg() };
  return {
    status: 200,
    svg: badgeSvg(profile.current.sniff_score, profile.current.tier),
  };
}
