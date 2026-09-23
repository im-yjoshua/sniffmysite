import type { Request, Response, NextFunction } from 'express';
import { hitRateLimit } from './ratelimit';

/**
 * Shared security helpers — Task 10 (§2.13.10).
 *
 * Rate limits (per IP unless noted), chosen for a one-instance Render box:
 *   - scan (anonymous):   30/hr free, then +10 per Turnstile solve (grants
 *                         stack: 30 + 10k) — the Turnstile-gated scan budget
 *                         (lib/scan-budget.ts). Over budget with no/failing
 *                         token → 429 with `turnstile_required: true` so the
 *                         frontend can pop the challenge inline.
 *   - scan (priority):    60/hr per buyer email — paying founders jump the
 *                         line; the priority lane never touches the IP budget.
 *   - leaderboard:       300/hr  — cheap in-memory read, anti-scrape floor
 *   - claim:               5/hr  — DNS checks cost a lookup
 *   - claim/verify:       10/hr  — same
 *   - billing checkout:   10/hr  — hosted checkout creation
 *   - billing webhook:   120/hr  — generous; Lemon Squeezy retries are legit
 *
 * The priority lane is real now: a Priority Re-scan credit buys a scan that
 * skips the anonymous bucket (Task 9's queue-jump was honorary until this).
 * In-memory buckets (lib/ratelimit.ts, lib/scan-budget.ts); the deploy seam
 * is a shared store when we outgrow one instance.
 */

export const SCAN_PRIORITY_LIMIT = 60;
export const SCAN_PRIORITY_WINDOW_MS = 60 * 60 * 1000;
/** Scan-budget constants (lib/scan-budget.ts) — re-exported here so the
 *  scan route keeps a single import site. */
export {
  SCAN_FREE_LIMIT,
  SCAN_WINDOW_MS as SCAN_FREE_WINDOW_MS,
  SCAN_GRANT_SIZE,
} from './scan-budget';
export const LEADERBOARD_LIMIT = 300;
export const LEADERBOARD_WINDOW_MS = 60 * 60 * 1000;
export const CLAIM_LIMIT = 5;
export const CLAIM_WINDOW_MS = 60 * 60 * 1000;
export const CLAIM_VERIFY_LIMIT = 10;
export const CLAIM_VERIFY_WINDOW_MS = 60 * 60 * 1000;
export const CHECKOUT_LIMIT = 10;
export const CHECKOUT_WINDOW_MS = 60 * 60 * 1000;
export const WEBHOOK_LIMIT = 120;
export const WEBHOOK_WINDOW_MS = 60 * 60 * 1000;

/**
 * The client IP for rate limiting. The app sets `trust proxy` (one hop:
 * Render's TLS terminator) in index.ts, so `req.ip` is the real client.
 * Strips the IPv4-mapped IPv6 prefix so 127.0.0.1 and ::ffff:127.0.0.1
 * share one bucket.
 */
export function clientIp(req: Request): string {
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}

/**
 * Express middleware factory: per-IP sliding-window rate limit.
 * Over the limit → 429 JSON in plain language (readability pass applies to
 * error payloads too) + a Retry-After hint. Over-limit hits are not counted,
 * so a blocked client recovers instead of digging deeper.
 */
export function rateLimit(
  bucket: string,
  limit: number,
  windowMs: number,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${bucket}:${clientIp(req)}`;
    if (hitRateLimit(key, limit, windowMs)) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({
        error: 'rate_limited',
        detail:
          'Too many requests — the lab needs a breather. Wait a bit and try again.',
      });
    }
    next();
  };
}

/**
 * Response headers for the public share-card PNG endpoints (vapor OG cards,
 * burn report cards). These images are MEANT to be hotlinked cross-origin —
 * social crawlers, chat embeds, and the in-app <img> previews. Helmet's
 * default CORP: same-origin would break those embeds, so both card routes
 * explicitly opt out. Cards are public, non-sensitive, and keyed by ETag.
 *
 * Kept in one helper so the two routes can't drift apart (Task 10 found the
 * burn route was missing the CORP override the vapor route already had).
 */
export function setShareCardHeaders(
  res: Response,
  etag: string,
  maxAgeSeconds: number,
): void {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}`);
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('ETag', etag);
}
