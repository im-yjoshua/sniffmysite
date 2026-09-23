/**
 * One-shot asset generator for Task 6 — NOT part of the running API.
 * Run with: npx tsx scripts/gen-cards.ts
 *
 * - Sample report card → /tmp/report-card-sample.png (for review)
 * - Site-wide default OG image → apps/burn/public/og-default.png (shipped)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReportCardSVG,
  buildDefaultOgSVG,
  renderPNG,
} from '../src/lib/report-card';

const here = dirname(fileURLToPath(import.meta.url));
// packages/api/scripts → repo root is two levels up.

async function main() {
  const siteUrl = process.env.PUBLIC_SITE_URL ?? 'https://burn-rate.lol';

  // 1. Sample card — StealthMode AI, the fictional #1 from the mock board.
  const sample = await renderPNG(
    buildReportCardSVG({
      name: 'StealthMode AI',
      domain: 'stealthmode.lol',
      slug: 'stealthmode',
      monthlyBurn: 212000,
      runwayDaysRemaining: 21,
      siteUrl,
    }),
  );
  writeFileSync('/tmp/report-card-sample.png', sample);
  console.log(`[gen-cards] sample card → /tmp/report-card-sample.png (${sample.length} bytes)`);

  // 2. Default OG image — shipped with the frontend bundle.
  const og = await renderPNG(buildDefaultOgSVG(siteUrl));
  const outDir = join(here, '..', '..', 'apps', 'burn', 'public');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'og-default.png'), og);
  console.log(`[gen-cards] default OG → apps/burn/public/og-default.png (${og.length} bytes)`);
}

main().catch((err) => {
  console.error('[gen-cards] failed:', err);
  process.exit(1);
});
