/**
 * Turnstile-gated scan budget (Chat A, post-Task-10 feature batch).
 *
 * The model: every IP gets 30 free scans per rolling hour. Past that, each
 * fresh Turnstile solve grants 10 more scans in the same window. Grants
 * stack: 30 + 10k. A solve that arrives with no token (or a failed one)
 * means the request is answered 429 with `turnstile_required: true` so the
 * frontend can pop the challenge inline and auto-retry.
 *
 * Why this shape instead of a flat cap: a flat cap punishes real humans for
 * the product's core loop (sniff → share → sniff again). Turnstile solves
 * are cheap for humans and expensive at bot scale, so the challenge is the
 * real bot gate; the 30/hr floor just bounds one IP's free burn.
 *
 * Dev behavior (documented choice): without TURNSTILE_SECRET_KEY the
 * verification helper warns and passes, so over-budget scans auto-grant
 * with no token at all. Local dev never bricks; the 30/hr counting still
 * runs so the budget math is exercised.
 *
 * In-memory (v1, single instance) — same documented deploy seam as
 * lib/ratelimit.ts: move to a shared store when we outgrow one box.
 * Priority scans never touch this budget (own lane in routes/vapor.ts).
 */

export const SCAN_FREE_LIMIT = 30;
export const SCAN_WINDOW_MS = 60 * 60 * 1000;
/** One verified Turnstile solve buys this many extra scans. */
export const SCAN_GRANT_SIZE = 10;

interface Budget {
  scans: number[];
  grants: number[];
}

const budgets = new Map<string, Budget>();

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const pruneTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, b] of budgets) {
    const scans = b.scans.filter((t) => now - t < SCAN_WINDOW_MS);
    const grants = b.grants.filter((t) => now - t < SCAN_WINDOW_MS);
    if (scans.length === 0 && grants.length === 0) budgets.delete(key);
    else budgets.set(key, { scans, grants });
  }
}, PRUNE_INTERVAL_MS);
// Don't keep the process alive just for pruning.
pruneTimer.unref?.();

function fresh(b: Budget, now: number): Budget {
  return {
    scans: b.scans.filter((t) => now - t < SCAN_WINDOW_MS),
    grants: b.grants.filter((t) => now - t < SCAN_WINDOW_MS),
  };
}

function forIp(ip: string, now: number): Budget {
  const b = fresh(budgets.get(ip) ?? { scans: [], grants: [] }, now);
  budgets.set(ip, b);
  return b;
}

/** Current budget state: how many scans used vs. the effective limit. */
export function scanAllowance(
  ip: string,
  now: number = Date.now(),
): { used: number; limit: number } {
  const b = forIp(ip, now);
  return { used: b.scans.length, limit: SCAN_FREE_LIMIT + b.grants.length * SCAN_GRANT_SIZE };
}

/**
 * Record a scan against the budget. Call only when the scan is allowed
 * (under budget, or after a grant was recorded).
 */
export function recordScan(ip: string, now: number = Date.now()): void {
  const b = forIp(ip, now);
  b.scans.push(now);
}

/**
 * Record a grant: one verified Turnstile solve = +SCAN_GRANT_SIZE scans of
 * headroom in the current window. Grants stack.
 */
export function recordGrant(ip: string, now: number = Date.now()): void {
  const b = forIp(ip, now);
  b.grants.push(now);
}

/** Test seam — wipes all scan budgets. Never called in production. */
export function _resetScanBudgets(): void {
  budgets.clear();
}
