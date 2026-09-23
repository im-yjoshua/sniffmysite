import { getSeedResults } from './seed';
import { getLiveHost } from './scanlog';
import { normalizeSlug } from './slug';
export { normalizeSlug } from './slug';
import { sniffScoreFor } from './score';
import type { MetricScores, ScoreEvidence, ScanResult, Tier } from './score';

/**
 * Startup profiles — Task 7 (§2.3 `/s/:slug`, §2.11).
 *
 * Slug = normalized domain (lowercase, no www.), deduped per §2.9.
 * Data comes from the live scan journal (lib/scanlog.ts) first — every
 * successful scan lands there — and falls back to the boot-scored seed
 * fixtures for hosts never re-scanned. When Supabase persistence lands
 * (replacing the journal's in-memory map), profiles read from the same
 * seam — this module only reshapes, never stores.
 */

export interface HistoryEntry {
  algo_version: string;
  vapor_score: number;
  /** THE public number: 100 − vapor_score. Display layers show this. */
  sniff_score: number;
  tier: Tier;
  scanned_at: string;
}

export interface StartupProfile {
  slug: string;
  domain: string;
  name: string;
  current: {
    vapor_score: number;
    /** THE public number: 100 − vapor_score. Display layers show this. */
    sniff_score: number;
    tier: Tier;
    metrics: MetricScores;
    verdict: string;
    algo_version: string;
    scanned_at: string;
    snapshot_hash: string;
    /** Raw counts behind the score — feeds the share card's joke + why-line. */
    evidence: ScoreEvidence;
  };
  /**
   * Score history, newest first. Today every profile holds exactly one
   * chapter (the v1 seed scan). Re-scans (Tasks 8–9) append chapters —
   * the public "redemption arc" from §2.4 writes itself from this array.
   */
  history: HistoryEntry[];
}

/**
 * The slug normalization lives in lib/slug.ts (re-exported above) so the
 * live scan journal (lib/scanlog.ts) can share it without a circular
 * import.
 */

/**
 * Human-readable names for the seed specimens. The real `startups` table
 * will carry proper names at deploy time; until then this map beats
 * "Openai" (naive capitalization) and falls back gracefully for anything
 * unlisted.
 */
const DISPLAY_NAMES: Record<string, string> = {
  'anthropic.com': 'Anthropic',
  'apple.com': 'Apple',
  'character.ai': 'Character',
  'copy.ai': 'Copy',
  'deepseek.com': 'DeepSeek',
  'elevenlabs.io': 'ElevenLabs',
  'github.com': 'GitHub',
  'huggingface.co': 'Hugging Face',
  'jasper.ai': 'Jasper',
  'linear.app': 'Linear',
  'mistral.ai': 'Mistral',
  'notion.so': 'Notion',
  'openai.com': 'OpenAI',
  'replit.com': 'Replit',
  'runwayml.com': 'Runway',
  'stripe.com': 'Stripe',
  'supabase.com': 'Supabase',
  'synthesia.io': 'Synthesia',
  'vercel.com': 'Vercel',
  'x.ai': 'xAI',
};

export function displayName(domain: string): string {
  const hit = DISPLAY_NAMES[domain];
  if (hit) return hit;
  const first = domain.split('.')[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Profile for a normalized slug, or null when the slug isn't on the board. */
export function getProfile(slug: string): StartupProfile | null {
  const domain = normalizeSlug(slug);
  if (!domain) return null;

  // Live scans win. The board, the dossier, the share card, and the claim
  // gate all read the same journal, so one re-scan updates every surface at
  // once — the seed row below only serves hosts never re-scanned.
  const liveHost = getLiveHost(domain);
  if (liveHost) return profileFromScans(domain, liveHost.scans);

  const hit = getSeedResults().find((e) => e.domain === domain);
  if (!hit) return null;
  return profileFromScans(domain, [hit.result]);
}

/**
 * Build a profile from a host's full scan history (newest first). The
 * seed-only path passes a single chapter, so its output is byte-identical
 * to the old seed-only behavior.
 */
function profileFromScans(domain: string, scans: ScanResult[]): StartupProfile {
  const r = scans[0];
  // The profile reads the scan result's public number; sniff_score already
  // carries the flip. The explicit sniffScoreFor call here guards any
  // future caller that passes a raw-vapor-only seed row.
  const sniff_score = r.sniff_score ?? sniffScoreFor(r.vapor_score);
  return {
    slug: domain,
    domain,
    name: displayName(domain),
    current: {
      vapor_score: r.vapor_score,
      sniff_score,
      tier: r.tier,
      metrics: r.metrics,
      verdict: r.verdict,
      algo_version: r.algo_version,
      scanned_at: r.scanned_at,
      snapshot_hash: r.snapshot_hash,
      evidence: r.evidence,
    },
    /**
     * Score history, newest first. Re-scans append chapters — the public
     * "redemption arc" from §2.4 writes itself from this array.
     */
    history: scans.map((s) => ({
      algo_version: s.algo_version,
      vapor_score: s.vapor_score,
      sniff_score: s.sniff_score ?? sniffScoreFor(s.vapor_score),
      tier: s.tier,
      scanned_at: s.scanned_at,
    })),
  };
}
