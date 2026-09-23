/**
 * Tiny in-memory per-IP rate limiter (v1).
 *
 * Good enough for launch: one Render instance, low volume. If we ever scale
 * past one instance (or an attacker rotates IPs), replace with a shared store
 * (Upstash Redis has a free tier). Buckets are pruned on a timer so the map
 * can't grow forever.
 */

const buckets = new Map<string, number[]>();

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const pruneTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, stamps] of buckets) {
    const fresh = stamps.filter((t) => now - t < PRUNE_INTERVAL_MS);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}, PRUNE_INTERVAL_MS);
// Don't keep the process alive just for pruning.
pruneTimer.unref?.();

/**
 * Record a hit for `key`. Returns true when the key is OVER the limit
 * (i.e. the caller should reject with 429). Over-limit hits are not counted,
 * so a blocked client doesn't poison its own bucket forever.
 */
export function hitRateLimit(key: string, limit: number, windowMs: number): boolean {  const now = Date.now();
  const stamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (stamps.length >= limit) {
    buckets.set(key, stamps);
    return true;
  }
  stamps.push(now);
  buckets.set(key, stamps);
  return false;
}

/** Test seam — wipes all rate-limit buckets. Never called in production. */
export function _resetRateLimits(): void {
  buckets.clear();
}
