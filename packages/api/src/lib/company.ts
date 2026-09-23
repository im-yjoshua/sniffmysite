/**
 * Company-page helpers — slug scheme + runway countdown math (§3.4).
 *
 * Pure functions only; covered by test/company.test.ts.
 */

/**
 * Slug scheme (v1).
 *
 * `burn.companies` has no slug column, and `domain` is unique + normalized
 * at insert time (see lib/validate.ts). Slug = the first DNS label of the
 * normalized domain: "stealthmode.lol" -> "stealthmode".
 *
 * Documented v1 caveat: "foo.lol" and "foo.io" would collide on "foo".
 * The lookup picks the earliest-listed row on collision. If collisions ever
 * matter, the fix is a real `slug` column with a unique constraint.
 */
export function slugifyDomain(domain: string): string {
  return domain.toLowerCase().split('.')[0];
}

/**
 * Days per month used for runway math: 365.25 / 12.
 * Deliberately explicit — this must match the frontend fallback in
 * apps/burn/src/lib/mock.ts. One constant, two copies, big comment.
 */
export const DAYS_PER_MONTH = 30.4375;

/** End of runway: listing date + runway_months. Null when runway unknown. */
export function runwayEndsAt(
  listedAt: Date | string,
  runwayMonths: number | null,
): Date | null {
  if (runwayMonths == null || Number.isNaN(runwayMonths)) return null;
  const start = listedAt instanceof Date ? listedAt : new Date(listedAt);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + runwayMonths * DAYS_PER_MONTH * 86_400_000);
}

/**
 * Days of runway remaining, fractional. Negative = already airborne.
 * `now` is injectable so tests don't depend on the clock.
 */
export function runwayDaysRemaining(
  listedAt: Date | string,
  runwayMonths: number | null,
  now: Date = new Date(),
): number | null {
  const end = runwayEndsAt(listedAt, runwayMonths);
  if (!end) return null;
  return (end.getTime() - now.getTime()) / 86_400_000;
}

/**
 * Sanitize a raw route param into a slug: [a-z0-9-], max 63 chars.
 * Returns '' when nothing usable remains.
 */
export function sanitizeSlug(raw: unknown): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 63);
}

/**
 * Row shape returned by findLiveCompanyBySlug — the safe subset the public
 * endpoints expose. Never include emails or internal state here.
 */
export interface LiveCompanyRow {
  id: string;
  domain: string;
  name: string;
  logo_url: string | null;
  monthly_burn: number;
  runway_months: number | null;
  headcount: number | null;
  funding_raised: number | null;
  created_at: string;
  /** True when a founder has proved email + domain ownership (Task 7).
   *  Task 8 (Verified Burner badge, $9) gates on this. Not an email — safe. */
  claimed: boolean;
  /** Purchased report card theme (Task 8, $4). 'terminal' = free default. */
  theme: string;
}

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Look up one `live` company by slug (first DNS label of the domain).
 * Pending/rejected rows are invisible — returns null exactly like an
 * unknown slug. The caller supplies the server-side Supabase client.
 */
export async function findLiveCompanyBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<LiveCompanyRow | null> {
  // Slug is sanitized to [a-z0-9-], so the LIKE pattern has no metachar
  // surprises; the exact first-label match happens in JS below.
  const { data: candidates, error } = await supabase
    .schema('burn')
    .from('companies')
    .select(
      'id, domain, name, logo_url, monthly_burn, runway_months, headcount, funding_raised, created_at, claimed_by_email, report_card_theme',
    )
    .eq('status', 'live')
    .like('domain', `${slug}.%`)
    .order('created_at', { ascending: true })
    .limit(5);
  if (error) throw new Error(`lookup_failed: ${error.message}`);
  const row = (candidates ?? []).find((c: { domain: string }) => slugifyDomain(c.domain) === slug);
  if (!row) return null;
  return {
    id: row.id,
    domain: row.domain,
    name: row.name,
    logo_url: row.logo_url,
    monthly_burn: Number(row.monthly_burn),
    runway_months: row.runway_months != null ? Number(row.runway_months) : null,
    headcount: row.headcount,
    funding_raised: row.funding_raised != null ? Number(row.funding_raised) : null,
    created_at: row.created_at,
    claimed: row.claimed_by_email != null,
    theme: row.report_card_theme ?? 'terminal',
  };
}
