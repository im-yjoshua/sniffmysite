import { Router, type Request, type Response } from 'express';
import { setShareCardHeaders } from '../lib/security';
import { validateSubmit } from '../lib/validate';
import { getSupabase } from '../lib/supabase';
import { hitRateLimit } from '../lib/ratelimit';
import { verifyTurnstile } from '../lib/turnstile';
import { promises as dnsPromises } from 'node:dns';
import { slugifyDomain, runwayEndsAt, runwayDaysRemaining, sanitizeSlug, findLiveCompanyBySlug } from '../lib/company';
import {
  newClaimToken,
  hashToken,
  claimExpired,
  normalizeClaimEmail,
  sanitizeClaimId,
  getClaimDnsSecret,
  dnsChallengeToken,
  dnsRecordValue,
  findMatchingTxt,
  CLAIM_TTL_MS,
} from '../lib/claim';
import { sendMagicLinkEmail } from '../lib/resend';
import {
  getReportCardPNG,
  reportCardCacheKey,
  type ReportCardInput,
} from '../lib/report-card';
import {
  MIN_BID_CENTS,
  OUTBID_STEP_CENTS,
  resolveCardTheme,
  spotlightEndsAt,
  spotlightStatus,
  spotlightWeekStart,
} from '../lib/burn-billing';
import {
  BOARD_PER_PAGE,
  normalizeBoardPage,
  normalizeBoardSort,
  paginateBoard,
  sortBoard,
  type BoardCandidate,
} from '../lib/board';

/**
 * BurnRate routes (§3.11). Chat B build lane.
 *
 * POST /submit is live. Everything else is stubbed until its task ships.
 */
export const burnRouter = Router();

const notImplemented = (feature: string) => (_req: unknown, res: any) =>
  res.status(501).json({ error: 'not_implemented', feature });

/**
 * POST /api/burn/submit — the 60-second burn listing form (§3.4).
 *
 * Pipeline: honeypot → rate limit → Turnstile → validation → duplicate
 * check → insert as `pending` (the moderation queue). Pending rows are
 * reviewed directly in Supabase (§1.6 — no admin dashboard in v1); a row
 * goes live when its status flips to `live`, which is the only status the
 * public read policy exposes.
 */
burnRouter.post('/submit', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  // 1. Honeypot — bots fill hidden fields; humans never see it.
  //    Fake success keeps bots from learning they were caught.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return res.status(201).json({ id: null, status: 'pending' });
  }

  // 2. Rate limit: 10 submissions/hour per IP (§1.5).
  const ip = req.ip ?? 'unknown';
  if (hitRateLimit(`burn-submit:${ip}`, 10, 60 * 60 * 1000)) {
    return res.status(429).json({
      error: 'rate_limited',
      message: 'Whoa. One burn at a time — try again in a bit.',
    });
  }

  // 3. Turnstile — enforced only when the secret is configured (deploy-time).
  const turnstileOk = await verifyTurnstile(
    typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined,
  );
  if (!turnstileOk) {
    return res.status(400).json({
      error: 'bot_check_failed',
      message: 'The bot check failed. Try again — humans only.',
    });
  }

  // 4. Server-side validation (the server is the source of truth).
  const result = validateSubmit(body);
  if (!result.ok) {
    return res.status(400).json({ error: 'validation_failed', fields: result.fields });
  }
  const data = result.data;

  // 5. Insert with the service-role key (anon has no INSERT grant — §1.5).
  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return res.status(500).json({
      error: 'server_not_configured',
      message: 'The burn furnace is offline. Try again later.',
    });
  }
  // Tables live in the `burn` schema, not `public`.
  const companies = supabase.schema('burn').from('companies');

  // 6. One listing per domain — friendly pre-check for the common case…
  const { data: existing } = await companies
    .select('id')
    .eq('domain', data.domain)
    .maybeSingle();
  if (existing) {
    return res.status(409).json({
      error: 'domain_taken',
      message: 'This domain already burns here.',
    });
  }

  const { data: row, error } = await companies
    .insert({
      domain: data.domain,
      name: data.name,
      monthly_burn: data.monthlyBurn,
      runway_months: data.runwayMonths,
      headcount: data.headcount,
      funding_raised: data.fundingRaised,
      listed_by_email: data.email,
      status: 'pending',
    })
    .select('id, status')
    .single();

  if (error || !row) {
    // …and the unique constraint catches the check-then-insert race.
    if ((error as { code?: string } | null)?.code === '23505') {
      return res.status(409).json({
        error: 'domain_taken',
        message: 'This domain already burns here.',
      });
    }
    console.error('[api] burn submit insert failed:', error?.message ?? 'unknown');
    return res.status(500).json({
      error: 'submit_failed',
      message: 'The furnace hiccuped. Try again.',
    });
  }

  // Safe subset only — never leak emails, keys, or internal state.
  return res.status(201).json({ id: row.id, status: row.status });
});

/**
 * GET /api/burn/board?sort=burn|runway|efficiency&page=1 (§3.11, Task 9).
 *
 * The full rankings page: highest burn (the crown), shortest runway
 * ("living dangerously"), most efficient (lowest burn per employee —
 * undisclosed headcounts sort last). Live rows only; the same safe-subset
 * discipline as the company endpoint — no emails, keys, or internal state.
 * Paginated at 50/page; sorting is the pure lib/board comparators so the
 * ranking logic is unit-testable without a database.
 */
burnRouter.get('/board', async (req: Request, res: Response) => {
  const sort = normalizeBoardSort(req.query.sort);
  const page = normalizeBoardPage(req.query.page);

  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return res.status(500).json({
      error: 'server_not_configured',
      message: 'The burn furnace is offline. Try again later.',
    });
  }

  const { data: rows, error } = await supabase
    .schema('burn')
    .from('companies')
    .select(
      'id, domain, name, monthly_burn, runway_months, headcount, funding_raised, created_at, claimed_by_email',
    )
    .eq('status', 'live');

  if (error) {
    console.error('[api] burn board lookup failed:', error.message);
    return res.status(500).json({
      error: 'lookup_failed',
      message: 'The furnace hiccuped. Try again.',
    });
  }

  const candidates: BoardCandidate[] = (rows ?? []).map((c) => {
    const runwayMonths = c.runway_months != null ? Number(c.runway_months) : null;
    return {
      id: c.id,
      slug: slugifyDomain(c.domain),
      domain: c.domain,
      name: c.name,
      monthly_burn: Number(c.monthly_burn),
      runway_months: runwayMonths,
      headcount: c.headcount != null ? Number(c.headcount) : null,
      funding_raised: c.funding_raised != null ? Number(c.funding_raised) : null,
      created_at: c.created_at,
      runway_days_remaining: runwayDaysRemaining(c.created_at, runwayMonths),
      claimed: c.claimed_by_email != null,
    };
  });

  const sorted = sortBoard(candidates, sort);

  return res.json({
    sort,
    page,
    per_page: BOARD_PER_PAGE,
    total: sorted.length,
    rows: paginateBoard(sorted, page),
  });
});

/**
 * GET /api/burn/company/:slug — company page data (§3.11, Task 5).
 *
 * Slug scheme: first DNS label of the normalized domain
 * ("stealthmode.lol" -> "stealthmode"); see lib/company.ts for the
 * documented v1 collision caveat.
 *
 * Only `live` rows are returned. Pending/rejected rows 404 exactly like
 * unknown slugs — the moderation queue is invisible from the outside.
 */
burnRouter.get('/company/:slug', async (req: Request, res: Response) => {
  const slug = String(req.params.slug ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 63);

  const notFound = () =>
    res.status(404).json({
      error: 'not_found',
      message: "This burner doesn't exist. Or it burned out completely.",
    });

  if (!slug) return notFound();

  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return res.status(500).json({
      error: 'server_not_configured',
      message: 'The burn furnace is offline. Try again later.',
    });
  }

  // Slug is sanitized to [a-z0-9-], so the LIKE pattern has no metachar
  // surprises; the exact first-label match happens in JS below.
  const { data: candidates, error } = await supabase
    .schema('burn')
    .from('companies')
    .select('id, domain, name, logo_url, monthly_burn, runway_months, headcount, funding_raised, created_at, claimed_by_email, report_card_theme')
    .eq('status', 'live')
    .like('domain', `${slug}.%`)
    .order('created_at', { ascending: true })
    .limit(5);

  if (error) {
    console.error('[api] burn company lookup failed:', error.message);
    return res.status(500).json({
      error: 'lookup_failed',
      message: 'The furnace hiccuped. Try again.',
    });
  }

  const row = (candidates ?? []).find((c) => slugifyDomain(c.domain) === slug);
  if (!row) return notFound();

  const listedAt: string = row.created_at;
  const runwayMonths = row.runway_months != null ? Number(row.runway_months) : null;
  const end = runwayEndsAt(listedAt, runwayMonths);

  // Badge shelf (Task 8): badge types this company holds. Public by design —
  // the flame is the whole point of paying for it.
  const { data: badgeRows } = await supabase
    .schema('burn')
    .from('badges')
    .select('type')
    .eq('company_id', row.id);
  const badges = (badgeRows ?? []).map((b) => String(b.type));

  // Safe subset only — never leak emails or internal state.
  return res.json({
    id: row.id,
    slug,
    domain: row.domain,
    name: row.name,
    logo_url: row.logo_url,
    monthly_burn: Number(row.monthly_burn),
    runway_months: runwayMonths,
    headcount: row.headcount,
    funding_raised: row.funding_raised != null ? Number(row.funding_raised) : null,
    listed_at: listedAt,
    runway_ends_at: end ? end.toISOString() : null,
    runway_days_remaining: runwayDaysRemaining(listedAt, runwayMonths),
    // True when a founder proved email + domain ownership. Task 8's badge
    // gates on this; it's a boolean, not an email — safe to expose.
    claimed: row.claimed_by_email != null,
    badges,
    theme: row.report_card_theme ?? 'terminal',
  });
});

/**
 * GET /api/burn/report-card/:slug.png — shareable burn report card (§3.5, Task 6).
 *
 * Renders a 1200×630 PNG in the After-Hours Trading Floor style via
 * hand-built SVG → resvg (see lib/report-card.ts for the tech rationale).
 *
 * Live rows only; pending/rejected/unknown slugs get a 404 (JSON — the
 * social crawler just won't have an image). Rendered cards are cached in
 * memory keyed by slug + a hash of the card's data fields; repeat shares
 * don't re-render. ETag/304 supported.
 *
 * Absolute site URL comes from PUBLIC_SITE_URL (deploy-time env), falling
 * back to the canonical domain constant until DNS is live. No secrets are
 * embedded — the card only shows public company data.
 */
burnRouter.get('/report-card/:slug.png', async (req: Request, res: Response) => {
  const slug = sanitizeSlug(req.params.slug);
  const notFound = () =>
    res.status(404).json({
      error: 'not_found',
      message: "This burner doesn't exist. Or it burned out completely.",
    });
  if (!slug) return notFound();

  // PNG endpoints are cheap to hit but render on CPU — generous per-IP budget.
  const ip = req.ip ?? 'unknown';
  if (hitRateLimit(`burn-report:${ip}`, 120, 60 * 60 * 1000)) {
    return res.status(429).json({
      error: 'rate_limited',
      message: 'Whoa. One card at a time — try again in a bit.',
    });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return res.status(500).json({
      error: 'server_not_configured',
      message: 'The burn furnace is offline. Try again later.',
    });
  }

  let row;
  try {
    row = await findLiveCompanyBySlug(supabase, slug);
  } catch (err) {
    console.error('[api] burn report-card lookup failed:', (err as Error).message);
    return res.status(500).json({
      error: 'lookup_failed',
      message: 'The furnace hiccuped. Try again.',
    });
  }
  if (!row) return notFound();

  const siteUrl = (process.env.PUBLIC_SITE_URL ?? 'https://burn-rate.lol').replace(/\/+$/, '');
  // Theme gating (Task 8): ?theme= applies only when it matches the
  // company's PURCHASED theme. Unpurchased/unknown → the free default.
  const theme = resolveCardTheme(
    typeof req.query.theme === 'string' ? req.query.theme : null,
    row.theme,
  );
  const input: ReportCardInput = {
    name: row.name,
    domain: row.domain,
    slug,
    monthlyBurn: row.monthly_burn,
    runwayDaysRemaining: runwayDaysRemaining(row.created_at, row.runway_months),
    siteUrl,
    theme,
  };
  const key = reportCardCacheKey(slug, {
    id: row.id,
    name: row.name,
    domain: row.domain,
    monthly_burn: row.monthly_burn,
    runway_months: row.runway_months,
    created_at: row.created_at,
    theme,
  });

  // ETag: slug + data hash — a card is immutable for a given data version.
  const etag = `"${key}"`;
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  let png: Buffer;
  try {
    png = await getReportCardPNG(key, input);
  } catch (err) {
    console.error('[api] burn report-card render failed:', (err as Error).message);
    return res.status(500).json({
      error: 'render_failed',
      message: 'The printer jammed. Try again.',
    });
  }

  setShareCardHeaders(res, etag, 3600);
  return res.send(png);
});
/**
 * POST /api/burn/claim — step 1 of the founder claim flow (§3.9, Task 7).
 *
 * Body: { company_id, email }. Creates a burn.claims row with a HASHED
 * magic-link token (+ 24h expiry) and emails the public token. The response
 * is ALWAYS "check your inbox" — we never reveal whether the email or the
 * company exists (anti-enumeration). The only exception: an already-claimed
 * company says so, because claim status is public (the badge shelf will
 * show it in Task 8).
 */
burnRouter.post('/claim', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const ip = req.ip ?? 'unknown';

  const inboxReply = () =>
    res.status(200).json({
      status: 'check_your_inbox',
      message:
        'If that inbox belongs to a burner, a magic link is on its way. ' +
        '(It always says this. Opsec.)',
    });

  // Rate limit: claiming is a rare action; 5/hr/IP is plenty.
  if (hitRateLimit(`burn-claim:${ip}`, 5, 60 * 60 * 1000)) {
    return res.status(429).json({
      error: 'rate_limited',
      message: 'Whoa. One claim at a time — try again in a bit.',
    });
  }

  // Turnstile — enforced only when the secret is configured (same deal as
  // /submit; deploy-time config, honeypot + rate limiting are the v1 defense).
  const turnstileOk = await verifyTurnstile(
    typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined,
  );
  if (!turnstileOk) {
    return res.status(400).json({
      error: 'bot_check_failed',
      message: 'The bot check failed. Try again — humans only.',
    });
  }

  const companyId = sanitizeClaimId(body.company_id);
  const email = normalizeClaimEmail(body.email);
  if (!companyId || !email) return inboxReply();

  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return res.status(500).json({
      error: 'server_not_configured',
      message: 'The burn furnace is offline. Try again later.',
    });
  }
  const claims = supabase.schema('burn').from('claims');

  // Live rows only — pending/rejected listings can't be claimed (and the
  // lookup 404s exactly like an unknown id, so the queue stays invisible).
  const { data: company } = await supabase
    .schema('burn')
    .from('companies')
    .select('id, name, domain, claimed_by_email')
    .eq('id', companyId)
    .eq('status', 'live')
    .maybeSingle();

  if (!company) return inboxReply();
  if (company.claimed_by_email) {
    return res.status(200).json({
      status: 'already_claimed',
      message: 'This burn is already spoken for.',
    });
  }

  const { publicToken, tokenHash } = newClaimToken();
  const expiresAt = new Date(Date.now() + CLAIM_TTL_MS).toISOString();

  const { error: insertError } = await claims.insert({
    company_id: companyId,
    verification_token: tokenHash,
    claim_email: email,
    expires_at: expiresAt,
  });
  if (insertError) {
    console.error('[api] burn claim insert failed:', insertError.message);
    return res.status(500).json({
      error: 'claim_failed',
      message: 'The furnace hiccuped. Try again.',
    });
  }

  const apiUrl = (process.env.PUBLIC_API_URL ?? process.env.PUBLIC_SITE_URL ?? '')
    .replace(/\/+$/, '');
  const magicLink = `${apiUrl}/api/burn/claim/verify?token=${publicToken}`;

  const sent = await sendMagicLinkEmail({
    to: email,
    companyName: company.name,
    magicLink,
  });
  if (!sent.ok) {
    // The claim row exists; the founder can request another link.
    return res.status(500).json({
      error: 'email_send_failed',
      message: 'The email refused to leave the building. Try again in a bit.',
    });
  }

  return inboxReply();
});

/**
 * GET /api/burn/claim/verify?token=… — the magic-link landing (§3.9).
 *
 * Hashes the public token, finds the matching UNVERIFIED claim (single-use:
 * verified rows never match), checks the 24h expiry, marks verified_at, then
 * 302s to the /claim page in "email verified" state. Invalid/expired tokens
 * redirect to /claim with an honest error flag instead of a scary 500.
 */
burnRouter.get('/claim/verify', async (req: Request, res: Response) => {
  const siteUrl = (process.env.PUBLIC_SITE_URL ?? 'https://burn-rate.lol').replace(/\/+$/, '');
  const fail = (reason: 'invalid' | 'expired') =>
    res.redirect(302, `${siteUrl}/claim?claim_error=${reason}`);

  const raw = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (!/^[0-9a-f]{64}$/i.test(raw)) return fail('invalid');

  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return fail('invalid');
  }

  const { data: claim, error } = await supabase
    .schema('burn')
    .from('claims')
    .select('id, expires_at')
    .eq('verification_token', hashToken(raw))
    .is('verified_at', null)
    .maybeSingle();

  if (error || !claim) return fail('invalid');
  if (claimExpired(claim.expires_at)) return fail('expired');

  const { error: updateError } = await supabase
    .schema('burn')
    .from('claims')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', claim.id)
    .is('verified_at', null);

  if (updateError) {
    console.error('[api] burn claim verify failed:', updateError.message);
    return fail('invalid');
  }

  return res.redirect(302, `${siteUrl}/claim?claim=${claim.id}`);
});

interface ClaimStatusRow {
  id: string;
  company_id: string;
  claim_email: string | null;
  verified_at: string | null;
  expires_at: string | null;
  created_at: string;
}

async function loadClaimWithCompany(
  supabase: ReturnType<typeof getSupabase>,
  claimId: string,
): Promise<{ claim: ClaimStatusRow; company: { id: string; name: string; domain: string; claimed_by_email: string | null } } | null> {
  const { data: claim, error } = await supabase
    .schema('burn')
    .from('claims')
    .select('id, company_id, claim_email, verified_at, expires_at, created_at')
    .eq('id', claimId)
    .maybeSingle();
  if (error || !claim) return null;
  const { data: company } = await supabase
    .schema('burn')
    .from('companies')
    .select('id, name, domain, claimed_by_email')
    .eq('id', claim.company_id)
    .maybeSingle();
  if (!company) return null;
  return { claim: claim as ClaimStatusRow, company };
}

/**
 * GET /api/burn/claim/:claim_id/status — claim state for the /claim page.
 * Safe subset only: never returns the email. The claim id is a random UUID;
 * the DNS record itself is only revealed via the /dns endpoint below, which
 * requires email verification.
 */
burnRouter.get('/claim/:claim_id/status', async (req: Request, res: Response) => {
  const claimId = sanitizeClaimId(req.params.claim_id);
  if (!claimId) {
    return res.status(404).json({
      error: 'not_found',
      message: "That claim doesn't exist. Or it burned out completely.",
    });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return res.status(500).json({
      error: 'server_not_configured',
      message: 'The burn furnace is offline. Try again later.',
    });
  }

  const loaded = await loadClaimWithCompany(supabase, claimId);
  if (!loaded) {
    return res.status(404).json({
      error: 'not_found',
      message: "That claim doesn't exist. Or it burned out completely.",
    });
  }
  const { claim, company } = loaded;
  const expired = claimExpired(claim.expires_at);

  return res.json({
    claim_id: claim.id,
    company: {
      id: company.id,
      slug: slugifyDomain(company.domain),
      name: company.name,
      domain: company.domain,
    },
    email_verified: claim.verified_at != null,
    expired,
    claimed: company.claimed_by_email != null,
  });
});

/**
 * GET /api/burn/claim/:claim_id/dns — the TXT record to publish.
 * Gated on email verification: only the inbox owner ever sees the challenge.
 * The challenge is HMAC(claim_id) under CLAIM_DNS_SECRET — recomputed on
 * demand, never stored in plaintext.
 */
burnRouter.get('/claim/:claim_id/dns', async (req: Request, res: Response) => {
  const claimId = sanitizeClaimId(req.params.claim_id);
  if (!claimId) {
    return res.status(404).json({ error: 'not_found', message: "That claim doesn't exist." });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return res.status(500).json({
      error: 'server_not_configured',
      message: 'The burn furnace is offline. Try again later.',
    });
  }

  const loaded = await loadClaimWithCompany(supabase, claimId);
  if (!loaded) {
    return res.status(404).json({ error: 'not_found', message: "That claim doesn't exist." });
  }
  const { claim, company } = loaded;

  if (claim.verified_at == null) {
    return res.status(403).json({
      error: 'email_not_verified',
      message: 'Verify your email first — the magic link comes before the DNS ritual.',
    });
  }
  if (claimExpired(claim.expires_at)) {
    return res.status(410).json({
      error: 'claim_expired',
      message: 'This claim expired. Start over — the furnace is patient.',
    });
  }
  if (company.claimed_by_email) {
    return res.status(200).json({ status: 'already_claimed' });
  }

  return res.json({
    domain: company.domain,
    record_type: 'TXT',
    record_name: '@',
    record_value: dnsRecordValue(claim.id, getClaimDnsSecret()),
  });
});

/**
 * POST /api/burn/verify-dns — step 2 of the claim flow (§3.9, Task 7).
 *
 * Body: { claim_id }. The claim must be email-verified and unexpired. We
 * resolve TXT records for the company's domain and look for an exact
 * `burnrate-verify=<challenge>` match. On match, the company is marked
 * claimed (claimed_by_email + claimed_at) — this is what Task 8's $9
 * Verified Burner badge gates on. DNS can be slow; a miss returns 422 with
 * a "try again in a few minutes" message, not an error.
 */
burnRouter.post('/verify-dns', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const ip = req.ip ?? 'unknown';

  // DNS lookups are outbound work we pay for — tight per-IP budget.
  if (hitRateLimit(`burn-verify-dns:${ip}`, 10, 60 * 60 * 1000)) {
    return res.status(429).json({
      error: 'rate_limited',
      message: 'Whoa. DNS is slow; hammering it won\u2019t help. Try again in a bit.',
    });
  }

  const claimId = sanitizeClaimId(body.claim_id);
  if (!claimId) {
    return res.status(400).json({
      error: 'invalid_claim',
      message: "That claim doesn't look right.",
    });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return res.status(500).json({
      error: 'server_not_configured',
      message: 'The burn furnace is offline. Try again later.',
    });
  }

  const loaded = await loadClaimWithCompany(supabase, claimId);
  if (!loaded) {
    return res.status(404).json({
      error: 'not_found',
      message: "That claim doesn't exist. Or it burned out completely.",
    });
  }
  const { claim, company } = loaded;

  if (claim.verified_at == null) {
    return res.status(400).json({
      error: 'email_not_verified',
      message: 'Verify your email first — the magic link comes before the DNS ritual.',
    });
  }
  if (claimExpired(claim.expires_at)) {
    return res.status(410).json({
      error: 'claim_expired',
      message: 'This claim expired. Start over — the furnace is patient.',
    });
  }
  if (company.claimed_by_email) {
    return res.status(200).json({
      status: 'already_claimed',
      message: 'This burn is already spoken for.',
    });
  }

  const challenge = dnsChallengeToken(claim.id, getClaimDnsSecret());
  let records: string[][];
  try {
    records = await dnsPromises.resolveTxt(company.domain);
  } catch {
    return res.status(422).json({
      error: 'dns_lookup_failed',
      message: 'Could not read your DNS. Check the domain and try again in a few minutes.',
    });
  }

  if (!findMatchingTxt(records, challenge)) {
    return res.status(422).json({
      error: 'dns_not_found',
      message:
        'No matching TXT record found yet. DNS can take a few minutes to propagate — ' +
        'grab a coffee and hit verify again.',
    });
  }

  const { error: updateError } = await supabase
    .schema('burn')
    .from('companies')
    .update({
      claimed_by_email: claim.claim_email,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', company.id)
    .is('claimed_by_email', null);

  if (updateError) {
    console.error('[api] burn claim dns-update failed:', updateError.message);
    return res.status(500).json({
      error: 'claim_failed',
      message: 'The furnace hiccuped. Try again.',
    });
  }

  return res.status(200).json({
    status: 'claimed',
    message: 'Domain proven. This burn is officially yours.',
  });
});
/**
 * GET /api/burn/spotlight — current week's auction state (§3.11, Task 8).
 *
 * No auto-close cron in v1: the endpoint computes the week lazily from
 * Monday 00:00 UTC. An auction row is created on the first paid bid of the
 * week (by the webhook); before that the response is an honest empty state.
 * After ends_at passes, `status` is 'closed' and current_holder is the
 * winner; the next week's auction opens on its first bid.
 *
 * Response: { week_start, ends_at, status, current_bid, minimum_bid_cents,
 *             current_holder: { name, domain, slug } | null,
 *             bids: [{ amount, created_at, company: { name, domain, slug } }] }
 */
burnRouter.get('/spotlight', async (req: Request, res: Response) => {
  const weekStart = spotlightWeekStart();
  const endsAt = spotlightEndsAt(weekStart).toISOString();

  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return res.status(500).json({
      error: 'server_not_configured',
      message: 'The burn furnace is offline. Try again later.',
    });
  }

  const { data: auction, error } = await supabase
    .schema('burn')
    .from('spotlight_auctions')
    .select('id, current_bid, current_holder_id')
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) {
    console.error('[api] burn spotlight lookup failed:', error.message);
    return res.status(500).json({
      error: 'lookup_failed',
      message: 'The furnace hiccuped. Try again.',
    });
  }

  let holder: { name: string; domain: string; slug: string } | null = null;
  const currentBid = Number(auction?.current_bid ?? 0);
  if (auction?.current_holder_id) {
    const { data: company } = await supabase
      .schema('burn')
      .from('companies')
      .select('domain, name')
      .eq('id', auction.current_holder_id)
      .maybeSingle();
    if (company) {
      holder = {
        name: company.name,
        domain: company.domain,
        slug: slugifyDomain(company.domain),
      };
    }
  }

  return res.json({
    week_start: weekStart,
    ends_at: endsAt,
    status: spotlightStatus(weekStart),
    current_bid: currentBid,
    // Minimum to take the slot right now: $5 floor, or top bid + $1.
    minimum_bid_cents: Math.max(
      MIN_BID_CENTS,
      Math.round(currentBid * 100) + OUTBID_STEP_CENTS,
    ),
    current_holder: holder,
    bids: await spotlightBidHistory(supabase, auction?.id ?? null),
  });
});

/**
 * Recent paid bids for this week's auction, newest first. Safe subset only —
 * no emails: just who paid what, and when. Drives the /spotlight page's
 * bid history. Caps at 20 to keep the page a ledger, not a ledger novel.
 */
async function spotlightBidHistory(
  supabase: ReturnType<typeof getSupabase>,
  auctionId: string | null,
): Promise<
  Array<{
    amount: number;
    created_at: string;
    company: { name: string; domain: string; slug: string };
  }>
> {
  if (!auctionId) return [];
  const { data: bids, error } = await supabase
    .schema('burn')
    .from('spotlight_bids')
    .select('amount, created_at, company_id')
    .eq('auction_id', auctionId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error || !bids?.length) return [];

  // Hydrate company names in one query — N+1 is for startups with investors.
  const ids = [...new Set(bids.map((b) => b.company_id))];
  const { data: companies } = await supabase
    .schema('burn')
    .from('companies')
    .select('id, domain, name')
    .in('id', ids);
  const byId = new Map((companies ?? []).map((c) => [c.id, c]));

  return bids
    .map((b) => {
      const c = byId.get(b.company_id);
      if (!c) return null;
      return {
        amount: Number(b.amount),
        created_at: b.created_at,
        company: { name: c.name, domain: c.domain, slug: slugifyDomain(c.domain) },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
