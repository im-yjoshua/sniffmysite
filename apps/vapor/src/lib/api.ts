/**
 * VaporRank API client (Task 5–8).
 * Talks to the shared Express API (`POST /api/vapor/scan`, live since Task 4;
 * `GET /api/vapor/leaderboard`, live since Task 6;
 * `POST /api/vapor/claim` + `POST /api/vapor/claim/verify`, live since Task 8).
 * Types mirror `packages/api/src/lib/score.ts` — kept in sync by hand.
 */

export type TierLabel =
  | 'CERTIFIED REAL'
  | 'ALMOST REAL'
  | 'SUS'
  | 'JUST VIBES'
  | 'CERTIFIED FAKE';

export interface MetricScores {
  buzzword_density: number;
  claim_to_proof: number;
  vague_verb: number;
  social_proof: number;
  pricing_opacity: number;
  freshness: number;
}

export interface ApiScanResult {
  /** Internal vapor measurement (higher = more hype) — never displayed. */
  vapor_score: number;
  /** THE public number: 100 − vapor_score. Higher = more real. */
  sniff_score: number;
  tier: TierLabel;
  metrics: MetricScores;
  verdict: string;
  algo_version: string;
  snapshot_hash: string;
  url: string;
  scanned_at: string;
  /** Raw counts behind the score — mirrors packages/api score.ts. */
  evidence: ScoreEvidence;
  /** Present and true when the scan ran on the paid priority lane (Task 10). */
  priority?: boolean;
}

export interface ScoreEvidence {
  words: number;
  sentences: number;
  buzzword_hits: number;
  top_phrases: { phrase: string; count: number }[];
  claim_sentences: number;
  evidence_links: number;
  vague_sentences: number;
  trust_mentions: number;
  anonymous_testimonials: number;
  logo_images: number;
  has_pricing: boolean;
  has_price_signals: boolean;
  sales_only_cta: boolean;
  copyright_year: number | null;
  /** Present when the page isn't predominantly English — the buzzword,
   * claim, and vague-verb checks were skipped for this scan. */
  language_note: string | null;
}

/** POST a URL to the scoring engine. Throws ScanApiError on HTTP errors. */
export async function scanUrl(
  url: string,
  opts?: { turnstileToken?: string | null; priorityEmail?: string | null },
): Promise<ApiScanResult> {
  return requestJson<ApiScanResult>('/api/vapor/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      turnstile_token: opts?.turnstileToken ?? undefined,
      priority_email: opts?.priorityEmail ?? undefined,
    }),
  });
}

export type LeaderboardSort = 'vapor' | 'real' | 'improved';

export interface ApiLeaderboardEntry {
  domain: string;
  /** Internal vapor measurement (higher = more hype) — never displayed. */
  vapor_score: number;
  /** THE public number: 100 − vapor_score. Higher = more real. */
  sniff_score: number;
  tier: TierLabel;
  metrics: MetricScores;
  scanned_at: string;
  algo_version: string;
  /** Sniff-score delta vs the previous scan — positive means the page got
   * MORE real. Null until a domain has scan history (re-scans, Tasks 8–9). */
  delta: number | null;
}

export interface ApiLeaderboard {
  sort: LeaderboardSort;
  count: number;
  algo_version: string;
  entries: ApiLeaderboardEntry[];
}

/** GET the Hall of Vapor board. Throws ScanApiError on HTTP errors. */
export async function fetchLeaderboard(
  sort: LeaderboardSort,
): Promise<ApiLeaderboard> {
  return requestJson<ApiLeaderboard>(
    `/api/vapor/leaderboard?sort=${sort}`,
  );
}

export interface ApiHistoryEntry {
  algo_version: string;
  /** Internal vapor measurement (higher = more hype) — never displayed. */
  vapor_score: number;
  /** THE public number: 100 − vapor_score. Higher = more real. */
  sniff_score: number;
  tier: TierLabel;
  scanned_at: string;
}

export interface ApiStartupProfile {
  slug: string;
  domain: string;
  name: string;
  current: {
    /** Internal vapor measurement (higher = more hype) — never displayed. */
    vapor_score: number;
    /** THE public number: 100 − vapor_score. Higher = more real. */
    sniff_score: number;
    tier: TierLabel;
    metrics: MetricScores;
    /** Raw counts behind the score — served by the profile endpoint. */
    evidence: ScoreEvidence;
    verdict: string;
    algo_version: string;
    scanned_at: string;
    snapshot_hash: string;
  };
  /** Score history, newest first. Single v1 chapter until re-scans land. */
  history: ApiHistoryEntry[];
}

/** GET a specimen dossier. Throws ScanApiError (404 startup_not_found, 400 invalid_slug). */
export async function fetchStartupProfile(slug: string): Promise<ApiStartupProfile> {
  return requestJson<ApiStartupProfile>(
    `/api/vapor/startup/${encodeURIComponent(slug)}`,
  );
}

/** Absolute URL of the per-profile OG share card PNG (Task 7). */
export function ogCardUrl(slug: string): string {
  return `${API_URL}/api/vapor/og/${encodeURIComponent(slug)}.png`;
}

/** Absolute URL of the embeddable "Sniffed" badge SVG (Growth Plan §1). */
export function badgeUrl(slug: string): string {
  return `${API_URL}/api/vapor/badge/${encodeURIComponent(slug)}.svg`;
}

/* ---- Claim flow (Task 8: DNS TXT verification, §2.9) ---- */

export interface ApiClaimToken {
  domain: string;
  token: string;
  txt_host: string;
  txt_value: string;
  expires_at: string;
  instructions: string[];
}

export type ClaimVerifyReason =
  | 'no_pending_claim'
  | 'expired'
  | 'token_not_found'
  | 'dns_error';

export interface ApiClaimVerify {
  verified: boolean;
  domain: string;
  claimed_at?: string;
  reason?: ClaimVerifyReason;
}

/** POST a domain to mint a TXT verification token. Throws ScanApiError.
 * Optional alert email (growth plan §3): only sent when it looks like an
 * email — garbage never leaves the client. */
export async function requestClaimToken(
  domain: string,
  email?: string,
  alerts?: boolean,
): Promise<ApiClaimToken> {
  const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const body: Record<string, unknown> = { domain };
  if (typeof email === 'string' && EMAIL_LIKE.test(email.trim())) {
    body.email = email.trim().toLowerCase();
    body.alerts = typeof alerts === 'boolean' ? alerts : true;
  }
  return requestJson<ApiClaimToken>('/api/vapor/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** POST a domain to check its TXT record. Always 200 — false is an answer. */
export async function checkClaim(domain: string): Promise<ApiClaimVerify> {
  return requestJson<ApiClaimVerify>('/api/vapor/claim/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain }),
  });
}

/** Display metadata for the six v1 signals: label + plan weight (§2.4). */
export const METRIC_META = [
  { key: 'buzzword_density', label: 'Buzzword density', weight: 25 },
  { key: 'claim_to_proof', label: 'Claim-to-proof ratio', weight: 25 },
  { key: 'vague_verb', label: 'Vague-verb index', weight: 15 },
  { key: 'social_proof', label: 'Social-proof sketchiness', weight: 15 },
  { key: 'pricing_opacity', label: 'Pricing opacity', weight: 10 },
  { key: 'freshness', label: 'Freshness', weight: 10 },
] as const;

/* ---- Sponsored banners (homepage banner slots) ---- */

export type SponsorProductKey = 'banner7' | 'banner30';

export interface SponsorProductMeta {
  key: SponsorProductKey;
  name: string;
  priceDisplay: string;
  tagline: string;
  termLabel: string;
}

/** Mirror of the server catalog (packages/api/src/lib/sponsors.ts).
 *  Prices are placeholder — Joshua sets final pricing before live. */
export const SPONSOR_PRODUCTS: SponsorProductMeta[] = [
  {
    key: 'banner7',
    name: 'Homepage banner — 7 days',
    priceDisplay: '$19',
    tagline:
      'Your banner on the homepage for a week, clearly labeled Sponsored.',
    termLabel: '7-day run · pay once, no subscription',
  },
  {
    key: 'banner30',
    name: 'Homepage banner — 30 days',
    priceDisplay: '$59',
    tagline:
      'Your banner on the homepage for a month, clearly labeled Sponsored.',
    termLabel: '30-day run · pay once, no subscription',
  },
];

export interface AdvertiserInput {
  brand_name: string;
  image_url: string;
  dest_url: string;
  alt_text: string;
}

export interface ApiSponsorCheckout {
  checkout_url: string;
  checkout_id: string;
  test_mode: boolean;
  product: SponsorProductKey;
}

/** Create a Lemon Squeezy hosted checkout for a banner product. The
 *  advertiser inputs are validated again server-side. Redirect to
 *  checkout_url. Payment alone never publishes — a human approves later. */
export async function createSponsorCheckout(
  product: SponsorProductKey,
  email: string,
  advertiser: AdvertiserInput,
): Promise<ApiSponsorCheckout> {
  return requestJson<ApiSponsorCheckout>('/api/vapor/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product, email, ...advertiser }),
  });
}

export interface PublicSponsor {
  id: string;
  brand_name: string;
  image_url: string;
  dest_url: string;
  alt_text: string;
}

/** Live approved sponsors, oldest first. Returns [] on failure so the
 *  landing page degrades to its honest empty state. */
export async function fetchSponsors(): Promise<PublicSponsor[]> {
  try {
    const r = await requestJson<{ sponsors: PublicSponsor[] }>(
      '/api/vapor/sponsors',
    );
    return Array.isArray(r.sponsors) ? r.sponsors : [];
  } catch {
    return [];
  }
}

/* ---- Admin: sponsor approvals (token lives in sessionStorage) ---- */

export interface AdminSponsor extends PublicSponsor {
  buyer_email: string;
  term_days: number;
  status: 'pending_approval' | 'approved' | 'rejected';
  order_id: string;
  created_at: string;
  starts_at: string | null;
  ends_at: string | null;
}

function adminHeaders(token: string): Record<string, string> {
  return { 'x-admin-token': token };
}

export async function fetchAdminSponsors(
  token: string,
  status?: string,
): Promise<AdminSponsor[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const r = await requestJson<{ sponsors: AdminSponsor[] }>(
    `/api/vapor/admin/sponsors${q}`,
    { headers: adminHeaders(token) },
  );
  return r.sponsors;
}

export async function approveSponsorAdmin(
  token: string,
  id: string,
): Promise<AdminSponsor> {
  const r = await requestJson<{ sponsor: AdminSponsor }>(
    `/api/vapor/admin/sponsors/${encodeURIComponent(id)}/approve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders(token) },
      body: '{}',
    },
  );
  return r.sponsor;
}

export async function rejectSponsorAdmin(
  token: string,
  id: string,
): Promise<AdminSponsor> {
  const r = await requestJson<{ sponsor: AdminSponsor }>(
    `/api/vapor/admin/sponsors/${encodeURIComponent(id)}/reject`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders(token) },
      body: '{}',
    },
  );
  return r.sponsor;
}

/* ---- Billing (Task 9: Lemon Squeezy test mode, §2.6) ---- */

export type BillingProductKey = 'rescan' | 'audit';

export interface BillingProductMeta {
  key: BillingProductKey;
  name: string;
  priceDisplay: string;
  tagline: string;
  creditLabel: string;
}

/** Mirror of the server catalog (packages/api/src/lib/billing.ts). */
export const BILLING_PRODUCTS: BillingProductMeta[] = [
  {
    key: 'rescan',
    name: 'Priority Re-scan',
    priceDisplay: '$5',
    tagline:
      'Jump the line: test your page again right now. Every re-test is public — win or lose.',
    creditLabel: '1 priority re-test',
  },
  {
    key: 'audit',
    name: 'Certified Real Audit',
    priceDisplay: '$29',
    tagline:
      'A real human reviews your page, and the badge goes on your report.',
    creditLabel: '1 audit credit',
  },
];

export interface ApiCheckout {
  checkout_url: string;
  checkout_id: string;
  test_mode: boolean;
  product: BillingProductKey;
}

/** Create a Lemon Squeezy hosted checkout. Redirect to checkout_url. */
export async function createCheckout(
  product: BillingProductKey,
  email: string,
  startupDomain?: string,
): Promise<ApiCheckout> {
  return requestJson<ApiCheckout>('/api/vapor/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product,
      email,
      ...(startupDomain ? { startup_domain: startupDomain } : {}),
    }),
  });
}

export interface ApiCredits {
  email: string;
  products: Record<BillingProductKey, number>;
}

/** Look up remaining credits for an email. Throws ScanApiError. */
export async function fetchCredits(email: string): Promise<ApiCredits> {
  return requestJson<ApiCredits>(
    `/api/vapor/billing/credits?email=${encodeURIComponent(email)}`,
  );
}

export interface ApiConsume {
  ok: boolean;
  product: BillingProductKey;
  remaining: number;
}

/** Spend one credit. Throws ScanApiError (402 no_credits when empty). */
export async function consumeCredit(
  email: string,
  product: BillingProductKey,
): Promise<ApiConsume> {
  return requestJson<ApiConsume>('/api/vapor/billing/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, product }),
  });
}

export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ||
  'http://localhost:4000';

export class ScanApiError extends Error {
  status: number;
  code: string;
  /** True when a 429 rate_limited answer carries the server's
   *  `turnstile_required` flag — the scan budget is spent and one fresh
   *  human solve buys 10 more scans. */
  turnstileRequired: boolean;
  /** The upstream site's HTTP status, for `blocked` / `http_error` — lets
   *  the scan page tailor its advice (404 vs 500 need different words). */
  upstreamStatus: number | null;

  constructor(
    status: number,
    code: string,
    detail?: string,
    turnstileRequired = false,
    upstreamStatus: number | null = null,
  ) {
    super(detail || code);
    this.name = 'ScanApiError';
    this.status = status;
    this.code = code;
    this.turnstileRequired = turnstileRequired;
    this.upstreamStatus = upstreamStatus;
  }
}

interface ApiErrorBody {
  error?: string;
  detail?: string;
  turnstile_required?: boolean;
  upstream_status?: number;
}

/**
 * Hard ceiling on any API call: 60s. The scan engine itself caps at ~8s,
 * but a cold host or a hung connection must never mean an infinite
 * spinner — the scan page always lands somewhere.
 */
const REQUEST_TIMEOUT_MS = 60_000;

/** Shared GET/POST JSON helper. Throws ScanApiError on HTTP or network errors. */
async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ScanApiError(0, 'request_timeout');
    }
    // Network-level failure (API down, CORS, offline) — distinct from API errors.
    throw new ScanApiError(0, 'lab_unreachable');
  }
  clearTimeout(timer);
  let body: ApiErrorBody = {};
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    // Non-JSON response — keep the status, fall back to a generic code.
  }
  if (!res.ok) {
    throw new ScanApiError(
      res.status,
      body.error || 'scan_failed',
      body.detail,
      body.turnstile_required === true,
      typeof body.upstream_status === 'number' ? body.upstream_status : null,
    );
  }
  return body as T;
}

/**
 * One entry of the "latest sniffs" ticker feed (GET /api/vapor/recent).
 * Mirrors packages/api/src/lib/recent.ts — host only, never full URLs.
 */
export interface ApiRecentScan {
  /** Normalized domain — doubles as the dossier slug. */
  slug: string;
  /** Host only, no scheme/path. */
  domain: string;
  /** Internal vapor measurement — never displayed. */
  vapor_score: number;
  /** THE public number: 0 = pure vapor, 100 = certified real. */
  sniff_score: number;
  tier: TierLabel;
  /** ISO timestamp of the scan. */
  scanned_at: string;
  /** True when /s/:slug has a dossier for this scan. */
  has_profile: boolean;
}

export interface ApiRecentScans {
  count: number;
  scans: ApiRecentScan[];
}

/**
 * GET the latest successful scans for the navbar ticker. Throws
 * ScanApiError on HTTP or network errors — the ticker treats that as
 * "no tape" rather than fabricating one.
 */
export async function fetchRecentScans(): Promise<ApiRecentScan[]> {
  const body = await requestJson<ApiRecentScans>('/api/vapor/recent');
  return body.scans;
}

/* ---- Trending board ("Most sniffed") ---- */

/**
 * One row of the "Most sniffed" board (GET /api/vapor/trending). Mirrors
 * packages/api/src/lib/recent.ts — host only, never full URLs.
 */
export interface ApiTrendingHost {
  /** Normalized domain — doubles as the dossier slug. */
  host: string;
  slug: string;
  /** How many successful scans this host has had. */
  sniff_count: number;
  /** The sniff score of the latest successful scan. */
  latest_sniff_score: number;
  tier: TierLabel;
  /** True when /s/:slug has a dossier for this host. */
  has_profile: boolean;
}

export interface ApiTrending {
  count: number;
  hosts: ApiTrendingHost[];
}

/**
 * GET the most-sniffed hosts. Throws ScanApiError on HTTP or network
 * errors — the board hides itself rather than fabricating rows.
 */
export async function fetchTrending(): Promise<ApiTrendingHost[]> {
  const body = await requestJson<ApiTrending>('/api/vapor/trending');
  return Array.isArray(body.hosts) ? body.hosts : [];
}

/** Trailing window for the biggest-movers roundup. */
export type MoversWindow = '7d' | '30d';

/**
 * One mover row (GET /api/vapor/movers). Mirrors
 * packages/api/src/lib/movers.ts — host only, never full URLs. delta is
 * new_score − old_score; positive = the page got MORE real.
 */
export interface ApiMoverRow {
  /** Normalized domain — doubles as the dossier slug. */
  slug: string;
  domain: string;
  old_score: number;
  new_score: number;
  delta: number;
  tier: TierLabel;
  /** True when /s/:slug has a dossier for this host. */
  has_profile: boolean;
}

export interface ApiMovers {
  window: MoversWindow;
  generated_at: string;
  gainers: ApiMoverRow[];
  losers: ApiMoverRow[];
  /** Re-sniffed in the window to the exact same score — "Held their ground". */
  steady: ApiMoverRow[];
  /** Hosts with ≥2 same-version scans inside the window. */
  hosts_tracked: number;
  /** Honest "early days" note when the window is thin. */
  note?: string;
}

/**
 * GET the biggest movers in the trailing window. Throws ScanApiError on
 * HTTP or network errors — the page shows its honest error state.
 */
export async function fetchMovers(window: MoversWindow): Promise<ApiMovers> {
  return requestJson<ApiMovers>(`/api/vapor/movers?window=${window}`);
}
