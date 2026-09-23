/**
 * Server-side validation for POST /api/burn/submit (§3.4, §3.9).
 * Pure functions — unit-tested in src/test/submit.test.ts.
 * The client mirrors these rules, but the server is the source of truth.
 */

export interface SubmitData {
  name: string;
  domain: string;
  monthlyBurn: number;
  runwayMonths: number;
  headcount: number | null;
  fundingRaised: number | null;
  email: string;
}

export type ValidationResult =
  | { ok: true; data: SubmitData }
  | { ok: false; fields: Record<string, string> };

// Caps keep the joke honest: nobody burns $10B/month, nobody has 100 years of runway.
const LIMITS = {
  nameMax: 120,
  burnMax: 100_000_000,
  runwayMax: 1200,
  headcountMax: 1_000_000,
  fundingMax: 1_000_000_000_000,
  emailMax: 254,
} as const;

const DOMAIN_RE =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Normalize a user-supplied domain to its canonical form:
 * lowercase, no scheme/userinfo/port/path, no leading www.
 * Returns null when it isn't a plausible public domain.
 */
export function normalizeDomain(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // scheme (http://, https://)
  d = d.replace(/^[^@/]*@/, ''); // userinfo
  d = d.split(/[/:?#]/)[0]; // path, port, query, fragment
  d = d.replace(/^www\./, '');
  if (d === '' || d === 'localhost') return null;
  if (IPV4_RE.test(d)) return null; // listings are for domains, not IPs
  if (!DOMAIN_RE.test(d)) return null;
  return d;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim().replace(/[$,\s]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function validateSubmit(body: unknown): ValidationResult {
  const fields: Record<string, string> = {};
  const b = (body ?? {}) as Record<string, unknown>;

  // --- name ---
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) {
    fields.name = 'Give it a name. Even "Stealth" counts.';
  } else if (name.length > LIMITS.nameMax) {
    fields.name = `Keep it under ${LIMITS.nameMax} characters. Brevity burns less.`;
  }

  // --- domain (normalized; one listing per domain enforced at insert) ---
  const domain = normalizeDomain(b.domain);
  if (!domain) {
    fields.domain = "That doesn't look like a domain. Try yourdomain.com.";
  }

  // --- monthly burn ---
  const monthlyBurn = toNumber(b.monthlyBurn ?? b.monthly_burn);
  if (monthlyBurn === null) {
    fields.monthlyBurn = 'How much per month? A number — ideally a scary one.';
  } else if (monthlyBurn <= 0) {
    fields.monthlyBurn = 'Burn has to be above $0. $0 is just a hobby.';
  } else if (monthlyBurn > LIMITS.burnMax) {
    fields.monthlyBurn = 'Sure it is. Keep it under $100M/month.';
  }

  // --- runway ---
  const runwayMonths = toNumber(b.runwayMonths ?? b.runway_months);
  if (runwayMonths === null) {
    fields.runwayMonths = 'Months of runway left. 0 is allowed — 0 is a lifestyle.';
  } else if (runwayMonths < 0) {
    fields.runwayMonths = "Runway can't be negative. That's just debt with extra steps.";
  } else if (runwayMonths > LIMITS.runwayMax) {
    fields.runwayMonths = 'Nobody has 100 years of runway.';
  }

  // --- headcount (optional) ---
  let headcount: number | null = null;
  const hcRaw = b.headcount;
  if (hcRaw !== undefined && hcRaw !== null && hcRaw !== '') {
    const hc = toNumber(hcRaw);
    if (hc === null || !Number.isInteger(hc)) {
      fields.headcount = 'Headcount must be a whole human.';
    } else if (hc < 0) {
      fields.headcount = 'Negative employees? Bold.';
    } else if (hc > LIMITS.headcountMax) {
      fields.headcount = 'That many people would notice the burn.';
    } else {
      headcount = hc;
    }
  }

  // --- funding raised (optional) ---
  let fundingRaised: number | null = null;
  const frRaw = b.fundingRaised ?? b.funding_raised;
  if (frRaw !== undefined && frRaw !== null && frRaw !== '') {
    const fr = toNumber(frRaw);
    if (fr === null) {
      fields.fundingRaised = 'Funding raised must be a number.';
    } else if (fr < 0) {
      fields.fundingRaised = 'Negative funding is just... spending.';
    } else if (fr > LIMITS.fundingMax) {
      fields.fundingRaised = 'Sure it is. Keep it under $1T.';
    } else {
      fundingRaised = round2(fr);
    }
  }

  // --- email ---
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!email) {
    fields.email = "We need an email for the claim step. No spam — we're too busy burning.";
  } else if (email.length > LIMITS.emailMax || !EMAIL_RE.test(email)) {
    fields.email = "That email won't survive the trip. Check it.";
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  return {
    ok: true,
    data: {
      name,
      domain: domain as string,
      monthlyBurn: round2(monthlyBurn as number),
      runwayMonths: round2(runwayMonths as number),
      headcount,
      fundingRaised,
      email,
    },
  };
}
