import { Router } from 'express';
import { fetchPage, FetchError, MAX_URL_LENGTH, fetchErrorHttpStatus, fetchErrorPublicDetail } from '../lib/fetch';
import { scorePage, sniffScoreFor, ALGO_VERSION } from '../lib/score';
import { type LeaderboardSort } from '../lib/seed';
import { recordBoardScan, getBoard } from '../lib/boardStore';
import { normalizeSlug, getProfile } from '../lib/profile';
import { getVaporCardPNG, vaporCardCacheKey, getBattleCardPNG, battleOutcome } from '../lib/vapor-card';
import { resolveBadge } from '../lib/badge';
import {
  createClaim,
  verifyClaim,
  txtRecordHost,
  txtRecordValue,
  claimInstructions,
} from '../lib/vapor-claim';
import {
  processScanForWatchlist,
  unsubscribeByToken,
} from '../lib/watchlist';

import { verifyTurnstile } from '../lib/turnstile';
import { consumeCredit, creditsFor } from '../lib/billing';
import {
  rateLimit,
  clientIp,
  SCAN_FREE_WINDOW_MS,
  SCAN_PRIORITY_LIMIT,
  SCAN_PRIORITY_WINDOW_MS,
  LEADERBOARD_LIMIT,
  LEADERBOARD_WINDOW_MS,
  CLAIM_LIMIT,
  CLAIM_WINDOW_MS,
  CLAIM_VERIFY_LIMIT,
  CLAIM_VERIFY_WINDOW_MS,
  WEBHOOK_LIMIT,
  WEBHOOK_WINDOW_MS,
  setShareCardHeaders,
} from '../lib/security';
import { hitRateLimit } from '../lib/ratelimit';
import { scanAllowance, recordScan, recordGrant } from '../lib/scan-budget';
import { recordRecentScan, getRecentScans, getTrendingHosts } from '../lib/recent';
import { generateOneLiner } from '../lib/gemini';
import { getMovers, isMoversWindow } from '../lib/movers';
import { verifyPolarSignature, parsePolarEvent } from '../lib/polar';
import {
  applyPolarOrderPaid,
  applyPolarOrderRefunded,
  supabaseFeaturedStore,
  type PriorityScanResult,
} from '../lib/featured';
import {
  supabaseThroneStore,
  applyThroneOrderPaid,
  applyThroneOrderRefunded,
  formatCents,
  THRONE_FLOOR_CENTS,
} from '../lib/throne';
import {
  createThroneCheckout,
  PolarNotConfiguredError,
  PolarCheckoutError,
} from '../lib/polarCheckout';
import { polarRefundClient } from '../lib/polarRefund';

/**
 * VaporRank routes (§2.11).
 *   Task 4:  POST /scan (SSRF-safe fetch + scoring engine v1) — LIVE
 *   Task 6:  GET /leaderboard — LIVE (seed: 20 Task-4 fixture pages)
 *   Task 7:  GET /startup/:slug (profile + history) — LIVE
 *            GET /og/:slug.png (share card PNG) — LIVE
 *   Task 8:  POST /claim, POST /claim/verify (DNS TXT verification)
 *   Task 10: rate limiting + Turnstile + priority lane (real now)
 *
 * POST /scan is an unauthenticated fetch+score endpoint — an abuse magnet
 * (it makes outbound requests on the attacker's behalf). Defenses, in order:
 *   1. Turnstile-gated scan budget: 30 free scans/hr per IP; past that, each
 *      fresh Turnstile solve grants +10 scans (grants stack: 30 + 10k).
 *      Over budget with no/failing token → 429 `turnstile_required: true`
 *      so the frontend can pop the challenge inline and auto-retry. Tokens
 *      are single-use (Cloudflare rejects a second verification of the same
 *      token), so every grant costs a fresh human solve. Dev-friendly: with
 *      no TURNSTILE_SECRET_KEY the check warns + passes, so over-budget
 *      scans auto-grant locally.
 *   2. Priority lane: a `priority_email` holding a Priority Re-scan credit
 *      gets its own 60/hr bucket and never touches the IP budget — this is
 *      what Task 9 sold ("jump the line"), now actually enforced instead of
 *      honorary.
 */
export const vaporRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

vaporRouter.post('/scan', async (req, res) => {
  const { url, turnstile_token, priority_email } = req.body ?? {};
  if (typeof url !== 'string' || url.trim().length === 0 || url.length > MAX_URL_LENGTH) {
    return res.status(400).json({
      error: 'invalid_url',
      detail: 'Provide a "url" string: an http(s) URL under 2048 characters.',
    });
  }

  // 1. Priority lane: a paid Priority Re-scan credit skips the anonymous
  //    budget entirely. The credit is consumed here — not by the client
  //    first — so a rejected scan never eats a credit. Credits are
  //    purchase-gated, so this lane needs no Turnstile check.
  let priority = false;
  let priorityEmail: string | null = null;
  if (typeof priority_email === 'string' && priority_email.trim().length > 0) {
    const email = priority_email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({
        error: 'invalid_email',
        detail: 'Provide a valid "priority_email" to use the priority lane.',
      });
    }
    const balance = creditsFor(email).products.rescan;
    if (balance <= 0) {
      return res.status(402).json({
        error: 'no_credits',
        detail: 'No priority re-tests left for this email. Free tests still work.',
      });
    }
    priorityEmail = email;
    priority = true;
  }

  // 2. Anonymous path: the Turnstile-gated scan budget (lib/scan-budget.ts).
  //    30 free scans/hr per IP; past that, one fresh Turnstile solve grants
  //    +10 (grants stack). The token is verified at most once per request —
  //    Cloudflare rejects a second verification of the same token, so the
  //    grant check doubles as the bot check; there is no separate gate.
  if (priority && priorityEmail) {
    const key = `scan:priority:${priorityEmail}`;
    if (hitRateLimit(key, SCAN_PRIORITY_LIMIT, SCAN_PRIORITY_WINDOW_MS)) {
      return res.status(429).json({
        error: 'rate_limited',
        detail:
          'Too many priority tests — the lab needs a breather. Wait a bit and try again.',
      });
    }
    // Spend the credit only once we're committed to scanning.
    const spent = consumeCredit(priorityEmail, 'rescan');
    if (!spent.ok) {
      // Raced away between the balance check and now — be honest about it.
      return res.status(402).json({
        error: 'no_credits',
        detail: 'No priority re-tests left for this email. Free tests still work.',
      });
    }
  } else {
    const ip = clientIp(req);
    const { used, limit } = scanAllowance(ip);
    if (used >= limit) {
      const token =
        typeof turnstile_token === 'string' && turnstile_token.length > 0
          ? turnstile_token
          : undefined;
      // Dev: no TURNSTILE_SECRET_KEY → verifyTurnstile warns + passes, so
      // over-budget scans auto-grant locally and dev never bricks.
      if (!(await verifyTurnstile(token))) {
        res.setHeader('Retry-After', String(Math.ceil(SCAN_FREE_WINDOW_MS / 1000)));
        return res.status(429).json({
          error: 'rate_limited',
          turnstile_required: true,
          detail:
            'You\u2019ve used your 30 free tests this hour. Pass the human check for 10 more.',
        });
      }
      recordGrant(ip);
    }
    recordScan(ip);
  }

  try {
    const page = await fetchPage(url.trim());
    const result = scorePage(page.html, page.finalUrl);
    // The navbar's "latest sniffs" ticker feeds from here. Priority-lane
    // scans count too — a scan is a scan.
    recordRecentScan({
      finalUrl: page.finalUrl,
      vapor_score: result.vapor_score,
      sniff_score: result.sniff_score,
      tier: result.tier,
      scanned_at: result.scanned_at,
    });
    // The LIVE leaderboard feeds from here too: every successful scan
    // lands in the journal — new hosts appear on the board, re-scans
    // update the row and append a history chapter (the Most Improved fuel).
    // Awaited: the write is best-effort (never fails the scan), and the
    // watchlist hook below must see this scan as its baseline.
    await recordBoardScan({ finalUrl: page.finalUrl, result });
    // Growth plan §3: score-drop alerts. Fire-and-forget — the lookup runs
    // AFTER recordBoardScan (so the baseline is the previous scan, no
    // ordering trap), and it never slows or breaks the scan response.
    void processScanForWatchlist(page.finalUrl, result).catch((e) =>
      console.error('[watchlist]', e),
    );
    // The Gemini one-liner: a single shareable roast line. Bonus field —
    // generateOneLiner resolves null on any failure (no key, timeout, cap),
    // so the scan response never waits on it breaking.
    let oneLiner: string | null = null;
    try {
      const domain = new URL(page.finalUrl).hostname.replace(/^www\./i, '');
      oneLiner = await generateOneLiner({
        domain,
        sniffScore: result.sniff_score,
        tier: result.tier,
        verdict: result.verdict,
        topPhrases: result.evidence.top_phrases.map((p) => p.phrase),
        snapshotHash: result.snapshot_hash,
      });
    } catch {
      oneLiner = null;
    }
    const one_liner = oneLiner;
    return res.json(priority ? { ...result, priority: true, one_liner } : { ...result, one_liner });
  } catch (err) {
    if (err instanceof FetchError) {
      // Every fetch failure leaves here as a structured, machine-readable
      // code. The detail is the PUBLIC one-liner — never err.message, which
      // can name IPs, DNS records, and upstream statuses (an SSRF oracle).
      // `upstream_status` is included for `blocked` / `http_error` so the
      // frontend can tailor its message (404 vs 500 need different advice).
      const body: { error: string; detail: string; upstream_status?: number } = {
        error: err.code,
        detail: fetchErrorPublicDetail(err.code),
      };
      if (typeof err.upstreamStatus === 'number') {
        body.upstream_status = err.upstreamStatus;
      }
      return res.status(fetchErrorHttpStatus(err.code)).json(body);
    }
    console.error('[scan] unexpected error', err);
    return res.status(500).json({ error: 'scan_failed', detail: 'Unexpected error while scanning.' });
  }
});

/**
 * GET /api/vapor/recent — the navbar's "latest sniffs" ticker feed.
 * Public, no auth. Returns the last ~15 successful scans, newest first.
 * Domain/host only — no emails, IPs, or full URLs ever leave this route.
 * Empty log → `{ count: 0, scans: [] }` (the frontend hides the ticker).
 */
vaporRouter.get(
  '/recent',
  rateLimit('recent', LEADERBOARD_LIMIT, LEADERBOARD_WINDOW_MS),
  (_req, res) => {
    const scans = getRecentScans();
    return res.json({ count: scans.length, scans });
  },
);

/**
 * GET /api/vapor/trending — the "Most sniffed" board (§2.12 depth feature).
 * Public, no auth. Returns the top ~10 hosts by total successful-scan
 * count, most-sniffed first. Host only — no emails, IPs, or full URLs ever
 * leave this route. Empty tally → `{ count: 0, hosts: [] }` (the frontend
 * shows its honest empty line).
 */
vaporRouter.get(
  '/trending',
  rateLimit('trending', LEADERBOARD_LIMIT, LEADERBOARD_WINDOW_MS),
  (_req, res) => {
    const hosts = getTrendingHosts();
    return res.json({ count: hosts.length, hosts });
  },
);

/**
 * GET /api/vapor/movers — the weekly biggest-movers roundup (Growth Plan §4).
 * Public, no auth. `?window=7d` (default) or `?window=30d`; anything else
 * → 400. Returns the biggest same-algo-version gainers ("Climbing") and
 * losers ("Face-plants") among hosts with ≥2 scans in the trailing window,
 * ranked by |delta|, 10 per side. A v1→v2 formula change never appears as
 * a move (same rule as Most Improved). Thin windows carry an honest
 * `note` — the list is never padded. Host only in every row — no IPs,
 * emails, or full URLs ever leave this route.
 */
vaporRouter.get(
  '/movers',
  rateLimit('movers', LEADERBOARD_LIMIT, LEADERBOARD_WINDOW_MS),
  async (req, res) => {
    const raw = req.query.window;
    const window: string =
      typeof raw === 'string' && raw.length > 0 ? raw : '7d';
    if (!isMoversWindow(window)) {
      return res.status(400).json({
        error: 'invalid_window',
        detail:
          "window must be '7d' or '30d' — how far back should the nose look?",
      });
    }
    return res.json(await getMovers(window));
  },
);

/**
 * GET /api/vapor/leaderboard — the board (§2.3). LIVE: the in-memory scan
 * journal (lib/scanlog.ts) merges every successful scan with the 20 seed
 * rows — new hosts appear, re-scans override their fixture row and append
 * a history chapter. Default sort is 'real': the Sniff Score hall of fame,
 * most real first. 'vapor' is the Wall of Shame (most vapor first);
 * 'improved' ranks the biggest sniff-score gains first (positive = more
 * real). Host only in every entry — no IPs, emails, or full URLs.
 */
vaporRouter.get(
  '/leaderboard',
  rateLimit('leaderboard', LEADERBOARD_LIMIT, LEADERBOARD_WINDOW_MS),
  async (req, res) => {
  const raw = req.query.sort;
  const sort: string = typeof raw === 'string' && raw.length > 0 ? raw : 'real';
  if (sort !== 'vapor' && sort !== 'real' && sort !== 'improved') {
    return res.status(400).json({
      error: 'invalid_sort',
      detail: 'sort must be one of: vapor, real, improved',
    });
  }
  const entries = await getBoard(sort as LeaderboardSort);
  return res.json({
    sort,
    count: entries.length,
    algo_version: ALGO_VERSION,
    entries,
  });
});
/**
 * GET /api/vapor/startup/:slug — the specimen dossier (Task 7, §2.3).
 * Slug = normalized domain (§2.9). Unknown slugs 404; malformed slugs 400.
 */
vaporRouter.get('/startup/:slug', async (req, res) => {
  const slug = normalizeSlug(req.params.slug);
  if (!slug) {
    return res.status(400).json({
      error: 'invalid_slug',
      detail: 'Slug must be a normalized domain, e.g. "character.ai".',
    });
  }
  const profile = await getProfile(slug);
  if (!profile) {
    return res.status(404).json({
      error: 'startup_not_found',
      detail: `No dossier on file for "${slug}". Only board-listed specimens have profiles.`,
    });
  }
  return res.json(profile);
});

/**
 * GET /api/vapor/badge/:slug.svg — the embeddable "Sniffed" badge
 * (Growth Plan §1). Self-contained SVG: live sniff score + tier name in
 * the tier's color + wordmark. The score is read from the dossier source
 * of truth (lib/badge.ts → getProfile: live journal first, seed
 * fallback), so the badge always shows the true latest score. Unknown
 * slugs get a 404 SVG ("not sniffed yet") — never a fabricated score.
 * `Cache-Control: public, max-age=3600` — scores move slowly, hourly
 * refresh is honest. `Cross-Origin-Resource-Policy: cross-origin`
 * because badges are MEANT to be hotlinked on other people's sites
 * (same reasoning as the share-card PNGs, Task 10).
 */
vaporRouter.get('/badge/:slug.svg', async (req, res) => {
  const { status, svg } = await resolveBadge(req.params.slug);
  res
    .status(status)
    .type('image/svg+xml')
    .set('Cache-Control', 'public, max-age=3600')
    .set('Cross-Origin-Resource-Policy', 'cross-origin')
    .send(svg);
});

/**
 * GET /api/vapor/og/:slug.png — the auto-generated share card (Task 7, §2.5).
 * Hand-built SVG → resvg PNG (see lib/vapor-card.ts). Cached in memory keyed
 * by slug + snapshot hash; ETag/304 supported. Unknown slugs 404 (JSON — a
 * social crawler just won't get an image).
 */
vaporRouter.get('/og/:slug.png', async (req, res) => {
  const slug = normalizeSlug(req.params.slug);
  if (!slug) {
    return res.status(400).json({
      error: 'invalid_slug',
      detail: 'Slug must be a normalized domain, e.g. "character.ai".',
    });
  }
  const profile = await getProfile(slug);
  if (!profile) {
    return res.status(404).json({ error: 'startup_not_found' });
  }

  const key = vaporCardCacheKey(slug, {
    sniff_score: profile.current.sniff_score,
    hash: profile.current.snapshot_hash,
  });
  const etag = `"${key}"`;
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  const siteUrl = (process.env.PUBLIC_SITE_URL ?? 'https://sniffmysite.lol').replace(
    /\/+$/,
    '',
  );
  let png: Buffer;
  try {
    png = await getVaporCardPNG(key, {
      slug: profile.slug,
      domain: profile.domain,
      sniff_score: profile.current.sniff_score,
      tier: profile.current.tier,
      verdict: profile.current.verdict,
      siteUrl,
      metrics: profile.current.metrics,
      evidence: profile.current.evidence,
    });
  } catch (err) {
    console.error('[api] vapor og render failed:', (err as Error).message);
    return res.status(500).json({
      error: 'render_failed',
      message: 'The printer jammed. Try again.',
    });
  }

  setShareCardHeaders(res, etag, 86400);
  return res.send(png);
});

/**
 * POST /api/vapor/card — render a share card for an arbitrary scan result.
 * The /scan page has no profile (profiles only exist for seeded domains),
 * so the share popup POSTs the finished scan result here and gets the same
 * PNG the /og endpoint serves. No outbound fetch — just CPU — so the limit
 * is generous. Cached in memory keyed by the card's content hash.
 */
const TIERS = [
  'LAUREATE',
  'GLADIATOR',
  'RECRUIT',
  'JESTER',
  'LION FOOD',
] as const;
const METRIC_KEYS = [
  'buzzword_density',
  'claim_to_proof',
  'vague_verb',
  'social_proof',
  'pricing_opacity',
  'freshness',
] as const;

function isMetricScores(v: unknown): v is Record<(typeof METRIC_KEYS)[number], number> {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return METRIC_KEYS.every(
    (k) => typeof o[k] === 'number' && o[k] >= 0 && o[k] <= 100,
  );
}

vaporRouter.post('/card', rateLimit('vapor-card', 60, 3_600_000), async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const slug = normalizeSlug(body.domain);
  // Primary: the public sniff score. Legacy clients may still send the old
  // internal vapor_score — convert it with the same one clean flip so the
  // card always renders the public number.
  const sniffRaw = body.sniff_score;
  const vaporRaw = body.vapor_score;
  let score: number | null = null;
  if (typeof sniffRaw === 'number' && Number.isInteger(sniffRaw) && sniffRaw >= 0 && sniffRaw <= 100) {
    score = sniffRaw;
  } else if (typeof vaporRaw === 'number' && Number.isInteger(vaporRaw) && vaporRaw >= 0 && vaporRaw <= 100) {
    score = sniffScoreFor(vaporRaw);
  }
  const tier = body.tier;
  const verdict = body.verdict;
  if (
    !slug ||
    score === null ||
    typeof tier !== 'string' ||
    !(TIERS as readonly string[]).includes(tier) ||
    typeof verdict !== 'string' ||
    verdict.length === 0 ||
    verdict.length > 2000 ||
    !isMetricScores(body.metrics)
  ) {
    return res.status(400).json({
      error: 'invalid_card',
      detail: 'Need a domain, a 0–100 sniff score, a tier, a verdict, and six metric scores.',
    });
  }

  // Evidence is optional: without it the card's joke and why-line fall back
  // to tier-flavored closers. When present it must at least be an object.
  const evidence = body.evidence;
  const safeEvidence =
    typeof evidence === 'object' && evidence !== null
      ? (evidence as import('../lib/score').ScoreEvidence)
      : undefined;

  const siteUrl = (process.env.PUBLIC_SITE_URL ?? 'https://sniffmysite.lol').replace(
    /\/+$/,
    '',
  );
  const key = vaporCardCacheKey(`card:${slug}`, {
    sniff_score: score,
    tier,
    verdict,
    metrics: body.metrics,
    evidence: safeEvidence ?? null,
  });
  const etag = `"${key}"`;
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  let png: Buffer;
  try {
    png = await getVaporCardPNG(key, {
      slug,
      domain: slug,
      sniff_score: score,
      tier: tier as (typeof TIERS)[number],
      verdict,
      siteUrl,
      metrics: body.metrics as import('../lib/score').MetricScores,
      evidence:
        safeEvidence ??
        ({
          words: 0,
          sentences: 0,
          buzzword_hits: 0,
          top_phrases: [],
          claim_sentences: 0,
          evidence_links: 0,
          vague_sentences: 0,
          trust_mentions: 0,
          anonymous_testimonials: 0,
          logo_images: 0,
          has_pricing: false,
          has_price_signals: false,
          sales_only_cta: false,
          copyright_year: null,
          language_note: null,
        } satisfies import('../lib/score').ScoreEvidence),
    });
  } catch (err) {
    console.error('[api] vapor card render failed:', (err as Error).message);
    return res.status(500).json({
      error: 'render_failed',
      message: 'The printer jammed. Try again.',
    });
  }

  setShareCardHeaders(res, etag, 3600);
  return res.send(png);
});

/**
 * POST /api/vapor/card/battle — render the "X DESTROYED Y" share card for a
 * finished battle. The /battle page POSTs both finished scan results here
 * and gets a 1200×630 PNG for the share popup. No outbound fetch — just
 * CPU — so the limit is generous. Cached in memory keyed by the card's
 * content hash. Winner rule (higher sniff score wins) matches the page.
 */
function isBattleScore(v: unknown): v is number {
  return (
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100
  );
}

vaporRouter.post(
  '/card/battle',
  rateLimit('vapor-card-battle', 60, 3_600_000),
  async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const slugA = normalizeSlug(body.domain_a);
    const slugB = normalizeSlug(body.domain_b);
    const tierA = body.tier_a;
    const tierB = body.tier_b;
    if (
      !slugA ||
      !slugB ||
      !isBattleScore(body.sniff_score_a) ||
      !isBattleScore(body.sniff_score_b) ||
      typeof tierA !== 'string' ||
      !(TIERS as readonly string[]).includes(tierA) ||
      typeof tierB !== 'string' ||
      !(TIERS as readonly string[]).includes(tierB)
    ) {
      return res.status(400).json({
        error: 'invalid_battle_card',
        detail:
          'Need two domains, two 0–100 sniff scores, and two tiers.',
      });
    }

    const siteUrl = (
      process.env.PUBLIC_SITE_URL ?? 'https://sniffmysite.lol'
    ).replace(/\/+$/, '');
    const input = {
      slugA,
      domainA: slugA,
      sniff_score_a: body.sniff_score_a as number,
      tier_a: tierA as (typeof TIERS)[number],
      slugB,
      domainB: slugB,
      sniff_score_b: body.sniff_score_b as number,
      tier_b: tierB as (typeof TIERS)[number],
      siteUrl,
    };
    // Sanity: the route never disagrees with the card about who won.
    void battleOutcome(input);
    const key = vaporCardCacheKey(`battle:${slugA}:vs:${slugB}`, {
      ...input,
    });
    const etag = `"${key}"`;
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    let png: Buffer;
    try {
      png = await getBattleCardPNG(key, input);
    } catch (err) {
      console.error('[api] battle card render failed:', (err as Error).message);
      return res.status(500).json({
        error: 'render_failed',
        message: 'The printer jammed. Try again.',
      });
    }

    setShareCardHeaders(res, etag, 3600);
    return res.send(png);
  },
);

/**
 * POST /api/vapor/claim — issue a DNS TXT verification token (Task 8, §2.11).
 * Seed/board-listed domains only (§2.9 claim scope). Idempotent: re-claiming
 * an unexpired token returns the SAME token so a published record stays valid.
 *
 * Growth plan §3: optionally captures an alert email at claim time. The
 * email is validated with the same shape as the priority lane; a bad value
 * 400s with a plain-language detail that NEVER echoes the address. The
 * watchlist entry itself is created only on a successful /claim/verify —
 * never on token request alone.
 */
vaporRouter.post(
  '/claim',
  rateLimit('vapor-claim', CLAIM_LIMIT, CLAIM_WINDOW_MS),
  async (req, res) => {
  const { domain, email, alerts } = req.body ?? {};
  const outcome = await createClaim(domain, { email, alerts });
  if (!outcome.ok) {
    if (outcome.error === 'invalid_email') {
      return res.status(400).json({
        error: 'invalid_email',
        // The supplied address is never echoed back — log or response.
        detail: 'That email doesn\u2019t look right. Check it and try again.',
      });
    }
    const status = outcome.error === 'invalid_domain' ? 400 : 404;
    return res.status(status).json({
      error: outcome.error,
      detail:
        outcome.error === 'invalid_domain'
          ? 'Provide a "domain" string, e.g. "stripe.com".'
          : `No record on file for that domain. Only ranked pages can be claimed — sniff it first.`,
    });
  }
  const r = outcome.record;
  return res.json({
    domain: r.domain,
    token: r.token,
    txt_host: txtRecordHost(r.domain),
    txt_value: txtRecordValue(r.token),
    expires_at: r.expiresAt,
    instructions: claimInstructions(r.token),
  });
});

/**
 * POST /api/vapor/claim/verify — check the TXT record (Task 8, §2.11).
 * The client sends ONLY the domain; the server compares DNS against the
 * token it issued. The expected token is never revealed in this response.
 * Always 200 (false is an answer, not an error); 400/404 for bad input.
 */
vaporRouter.post(
  '/claim/verify',
  rateLimit('vapor-claim-verify', CLAIM_VERIFY_LIMIT, CLAIM_VERIFY_WINDOW_MS),
  async (req, res) => {
  const { domain } = req.body ?? {};
  const slug = normalizeSlug(domain);
  if (!slug) {
    return res.status(400).json({
      error: 'invalid_domain',
      detail: 'Provide a "domain" string, e.g. "stripe.com".',
    });
  }
  if (!(await getProfile(slug))) {
    return res.status(404).json({ error: 'startup_not_found' });
  }
  try {
    const outcome = await verifyClaim(slug);
    if (outcome.verified) {
      return res.json({
        verified: true,
        domain: slug,
        claimed_at: outcome.claimedAt,
      });
    }
    return res.json({ verified: false, domain: slug, reason: outcome.reason });
  } catch (err) {
    console.error('[claim/verify] unexpected error', err);
    return res.status(500).json({ error: 'verify_failed' });
  }
});

/**
 * GET /api/vapor/watchlist/unsubscribe?token=... — one-click unsubscribe
 * (growth plan §3). The token is a bearer credential: an unknown or missing
 * token gets the same calm 200 as a real one (no leaks, no 404 drama).
 * Returns plain-language HTML, never the email address — only the domain.
 */
vaporRouter.get(
  '/watchlist/unsubscribe',
  rateLimit('vapor-watchlist-unsub', CLAIM_VERIFY_LIMIT, CLAIM_VERIFY_WINDOW_MS),
  (req, res) => {
  const raw = req.query.token;
  const token = typeof raw === 'string' ? raw : '';
  const domain = token ? unsubscribeByToken(token) : null;

  const page = (title: string, body: string): string =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${title} — SniffMySite</title></head>` +
    `<body style="font-family: Georgia, serif; max-width: 40rem; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.6; color: #1a1a1a;">` +
    `<h1 style="font-size: 1.75rem;">${title}</h1><p>${body}</p>` +
    `</body></html>`;

  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  if (!domain) {
    return res
      .status(200)
      .type('text/html')
      .send(
        page(
          'Nothing to cancel.',
          'That link is spent or wrong — you&rsquo;re not on the alert list.',
        ),
      );
  }
  return res
    .status(200)
    .type('text/html')
    .send(
      page(
        'You&rsquo;re off the list.',
        `No more drop alerts for <strong>${esc(domain)}</strong>. The listing ` +
          `stays claimed — this only stops the emails.`,
      ),
    );
});

/**
 * Phase A1 — Polar webhook + Featured Roast fulfillment.
 *
 * Polar fires here (Standard Webhooks signature, HMAC-verified — no auth
 * header; authenticity comes from the signature alone):
 *   POST /api/vapor/webhooks/polar
 *
 * order.paid     → validate website-url → priority scan (same v2 engine,
 *                  no budget gate — it's paid) → publish roast → 7-day pin.
 *                  Idempotent on the Polar order id.
 * order.refunded → revoke the pin (the roast stays as history).
 *
 * 200 for handled AND ignored events — only bad signatures get a retry.
 * Retryable failures (scan fetch blew up, store down) answer 500 so Polar
 * redelivers; idempotency makes redelivery safe.
 */
vaporRouter.post(
  '/webhooks/polar',
  // Applied BEFORE signature verification — per-IP, so it only throttles a
  // flooding source, never Polar's own servers. Unsigned floods get 429s
  // instead of burning HMAC CPU and log lines.
  rateLimit('polar-webhook', WEBHOOK_LIMIT, WEBHOOK_WINDOW_MS),
  async (req: import('express').Request & { rawBody?: Buffer }, res) => {
    const secret = (process.env.POLAR_WEBHOOK_SECRET ?? '').trim();
    if (!secret) {
      return res.status(503).json({ error: 'webhook_not_configured' });
    }
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    if (!verifyPolarSignature(rawBody, (name) => req.get(name), secret)) {
      return res.status(401).json({ error: 'invalid_signature' });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'invalid_payload' });
    }

    const parsed = parsePolarEvent(payload);
    if (!parsed.ok) {
      console.log(
        `[polar] webhook ${(payload as { type?: unknown })?.type ?? 'unknown'} → ${parsed.reason}`,
      );
      // 200 — Polar must not retry what we'll never handle.
      return res.json({ received: true, handled: false, reason: parsed.reason });
    }

    try {
      const order = parsed.order;
      const md = order.metadata;
      const isThroneBid =
        typeof md === 'object' &&
        md !== null &&
        (md as Record<string, unknown>).throne_bid === 'true';
      let outcome;
      if (isThroneBid) {
        // Phase B7: the throne auction. A paid bid takes the throne
        // immediately (dethroning the holder); a refund vacates it.
        const store = supabaseThroneStore();
        outcome =
          parsed.type === 'order.paid'
            ? await applyThroneOrderPaid(parsed, {
                store,
                scan: runPriorityScan,
                refund: polarRefundClient(),
              })
            : await applyThroneOrderRefunded(parsed.orderId, { store });
      } else {
        // Legacy fixed-price Featured Roast checkout link (Phase A).
        const store = supabaseFeaturedStore();
        outcome =
          parsed.type === 'order.paid'
            ? await applyPolarOrderPaid(parsed, { store, scan: runPriorityScan })
            : await applyPolarOrderRefunded(parsed.orderId, { store });
      }
      console.log(`[polar] webhook ${parsed.type} ${parsed.orderId} →`, outcome);
      if (!outcome.handled && 'retryable' in outcome && outcome.retryable) {
        // 500 — Polar redelivers; idempotency makes that safe.
        return res.status(500).json({ received: true, ...outcome });
      }
      return res.json({ received: true, ...outcome });
    } catch (err) {
      console.error('[polar] fulfillment error', err);
      return res.status(500).json({ error: 'fulfillment_failed' });
    }
  },
);

/**
 * GET /api/vapor/throne — the current throne state. Public, no auth.
 * The auction's single source of truth: who holds it, what they paid,
 * and the minimum the next bid must be ($19 floor, +$3 per steal).
 */
vaporRouter.get('/throne', async (_req, res) => {
  try {
    const status = await supabaseThroneStore().getStatus();
    const h = status.holder;
    return res.json({
      occupied: status.occupied,
      floor_cents: status.floor_cents,
      increment_cents: status.increment_cents,
      min_bid_cents: status.min_bid_cents,
      holder: h
        ? {
            domain: h.domain,
            url: h.url,
            price_cents: h.price_cents,
            score: h.score,
            tier: h.tier,
            verdict:
              typeof h.roast === 'object' && h.roast !== null
                ? (h.roast as { verdict?: unknown }).verdict ?? null
                : null,
            held_since: h.held_since,
            expires_at: h.expires_at,
          }
        : null,
    });
  } catch (err) {
    console.error('[throne] status lookup failed', err);
    return res.status(500).json({ error: 'store_unavailable' });
  }
});

/**
 * POST /api/vapor/throne/checkout — start a throne bid.
 * Body: { url }. Validates the URL (same syntactic rules as the scan
 * box — SSRF safety lives in fetchPage), quotes the current minimum bid,
 * and creates one Polar checkout session with an ad-hoc fixed price.
 * The buyer pays on Polar's hosted page; fulfillment is webhook-driven
 * (order.paid → applyThroneOrderPaid). 503 when Polar isn't wired up —
 * Joshua's step (POLAR_ACCESS_TOKEN + POLAR_THRONE_PRODUCT_ID on Render).
 */
vaporRouter.post(
  '/throne/checkout',
  rateLimit('throne-checkout', 10, 60_000),
  async (req, res) => {
    const raw = (req.body as { url?: unknown } | undefined)?.url;
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return res
        .status(400)
        .json({ error: 'missing_url', detail: 'Tell us which site wants the throne.' });
    }
    let candidate = raw.trim();
    if (candidate.length > MAX_URL_LENGTH) {
      return res.status(400).json({ error: 'invalid_url' });
    }
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return res.status(400).json({ error: 'invalid_url' });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ error: 'invalid_url' });
    }
    const url = parsed.toString();

    let minBid: number;
    try {
      minBid = (await supabaseThroneStore().getStatus()).min_bid_cents;
    } catch (err) {
      console.error('[throne] status lookup failed', err);
      return res.status(500).json({ error: 'store_unavailable' });
    }
    try {
      const session = await createThroneCheckout(url, minBid);
      return res.json(session);
    } catch (err) {
      if (err instanceof PolarNotConfiguredError) {
        return res.status(503).json({
          error: 'throne_not_configured',
          detail: 'Throne bidding is being set up — try again soon.',
        });
      }
      console.error('[throne] checkout creation failed', err);
      const status = err instanceof PolarCheckoutError && err.status === 0 ? 502 : 502;
      return res.status(status).json({ error: 'checkout_failed' });
    }
  },
);

/**
 * GET /api/vapor/featured — legacy Phase A endpoint, now reads the throne.
 * The pinned spotlight IS the throne holder; kept so nothing that cached
 * the old shape breaks during the transition.
 */
vaporRouter.get('/featured', async (_req, res) => {
  try {
    const status = await supabaseThroneStore().getStatus();
    const h = status.holder;
    if (!h) return res.json({ featured: null });
    return res.json({
      featured: {
        url: h.url,
        slug: h.domain,
        score: h.score,
        tier: h.tier,
        roast: h.roast,
        paid_at: h.held_since,
        expires_at: h.expires_at,
      },
    });
  } catch (err) {
    console.error('[polar] featured lookup failed', err);
    return res.status(500).json({ error: 'store_unavailable' });
  }
});

/**
 * The paid priority scan: the exact same fetch + v2 scoring pipeline as
 * POST /scan, minus the anonymous budget and Turnstile (the buyer paid —
 * they jump the line). The scan feeds the ticker, the standings journal,
 * and watchlist alerts exactly like a normal scan — a scan is a scan.
 * Payment never changes the score; the engine scores what it sees.
 */
async function runPriorityScan(url: string): Promise<PriorityScanResult> {
  const page = await fetchPage(url);
  const result = scorePage(page.html, page.finalUrl);
  recordRecentScan({
    finalUrl: page.finalUrl,
    vapor_score: result.vapor_score,
    sniff_score: result.sniff_score,
    tier: result.tier,
    scanned_at: result.scanned_at,
  });
  await recordBoardScan({ finalUrl: page.finalUrl, result });
  void processScanForWatchlist(page.finalUrl, result).catch((e) =>
    console.error('[watchlist]', e),
  );
  return {
    finalUrl: page.finalUrl,
    sniff_score: result.sniff_score,
    tier: result.tier,
    verdict: result.verdict,
    scanned_at: result.scanned_at,
  };
}
