/**
 * Fictional demo companies for the BurnRate.lol landing page (§3.3, §3.5).
 *
 * Every name and domain here is OBVIOUSLY invented — never a real startup.
 * This mock drives the hero top-10 board until the live feed (Task 6+)
 * aggregates burn.companies from Supabase. Self-reported satire, per §3.9.
 */

export interface Company {
  /** Display name — fictional, never a real startup. */
  name: string;
  /** Fictional domain (used as the stable key). */
  domain: string;
  /** Self-reported monthly burn, USD. */
  monthly_burn: number;
  /** Self-reported runway, months. 0 = already airborne. */
  runway_months: number;
  /** Headcount (mouths to feed). */
  headcount: number;
  /** Self-reported funding raised, USD. Null = undisclosed. */
  funding_raised: number | null;
  /** When the burn was listed (ISO). Demo: staggered relative to page load. */
  listed_at: string;
}

/** Demo helper — an ISO timestamp N days in the past. */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

export const COMPANIES: Company[] = [
  { name: 'StealthMode AI', domain: 'stealthmode.lol', monthly_burn: 212_000, runway_months: 0.5, headcount: 41, funding_raised: 4_200_000, listed_at: daysAgo(12) },
  { name: 'PromptFi', domain: 'promptfi.io', monthly_burn: 168_000, runway_months: 1.2, headcount: 33, funding_raised: 3_000_000, listed_at: daysAgo(20) },
  { name: 'VibeStack', domain: 'vibestack.lol', monthly_burn: 134_000, runway_months: 2.6, headcount: 27, funding_raised: 1_800_000, listed_at: daysAgo(30) },
  { name: 'Copium Labs', domain: 'copiumlabs.io', monthly_burn: 97_000, runway_months: 3.8, headcount: 21, funding_raised: 2_500_000, listed_at: daysAgo(10) },
  { name: 'PreSeedEnjoyer', domain: 'preseed.lol', monthly_burn: 81_000, runway_months: 0, headcount: 18, funding_raised: 500_000, listed_at: daysAgo(5) },
  { name: 'RunwayZero', domain: 'runwayzero.io', monthly_burn: 66_000, runway_months: 0.2, headcount: 14, funding_raised: 900_000, listed_at: daysAgo(8) },
  { name: 'DilutionDAO', domain: 'dilutiondao.lol', monthly_burn: 52_000, runway_months: 6.4, headcount: 12, funding_raised: 6_000_000, listed_at: daysAgo(40) },
  { name: 'PivotAgain', domain: 'pivotagain.io', monthly_burn: 43_000, runway_months: 0.75, headcount: 10, funding_raised: 1_200_000, listed_at: daysAgo(20) },
  { name: 'Moonshotly', domain: 'moonshotly.lol', monthly_burn: 33_000, runway_months: 9.2, headcount: 8, funding_raised: null, listed_at: daysAgo(60) },
  { name: 'CashFurnace', domain: 'cashfurnace.io', monthly_burn: 26_000, runway_months: 14, headcount: 6, funding_raised: 8_000_000, listed_at: daysAgo(90) },
].sort((a, b) => b.monthly_burn - a.monthly_burn);

/** Sum of listed monthly burns, USD — drives the "incinerated today" strip. */
export const TOTAL_MONTHLY_BURN = COMPANIES.reduce((sum, c) => sum + c.monthly_burn, 0);

/** "$212,000/mo" — tabular money, always. */
export function formatBurn(usdPerMonth: number): string {
  return `$${usdPerMonth.toLocaleString('en-US')}/mo`;
}

/**
 * Runway in founder-friendly units. Deadpan by design:
 * "0 days · airborne" is the §3.8 copy bank, not an error state.
 */
export function formatRunway(months: number): string {
  const days = Math.round(months * 30);
  if (days <= 0) return '0 days · airborne';
  if (days < 7) return `${days} days`;
  if (days < 30) return `${Math.round(days / 7)} weeks`;
  const label = months >= 10 ? String(Math.round(months)) : months.toFixed(1).replace(/\.0$/, '');
  return `${label} mo`;
}

/**
 * The v1 slug for a company: first DNS label of the domain.
 * Mirrors packages/api/src/lib/company.ts `slugifyDomain` — keep in sync.
 */
export function companySlug(company: Pick<Company, 'domain'>): string {
  return company.domain.toLowerCase().split('.')[0];
}

/**
 * Days per month for runway math. MUST match DAYS_PER_MONTH in
 * packages/api/src/lib/company.ts. One constant, two copies, big comment —
 * the day these drift, countdowns lie, and lying about money is the one
 * thing this site must never do (even satirically).
 */
export const DAYS_PER_MONTH = 30.4375;

/** End of runway as an ISO string, for the demo fallback path. */
export function runwayEndsAt(listedAt: string, runwayMonths: number): string {
  return new Date(new Date(listedAt).getTime() + runwayMonths * DAYS_PER_MONTH * 86_400_000).toISOString();
}

/** "$2.5M raised" / "$500K raised" — compact money for stat strips. */
export function formatRaised(usd: number | null): string {
  if (usd == null) return 'undisclosed';
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1).replace(/\.0$/, '')}M raised`;
  return `$${Math.round(usd / 1_000)}K raised`;
}
