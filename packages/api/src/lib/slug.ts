/**
 * Domain slug normalization (§2.9).
 *
 * Slug = canonical domain: lowercase, no `www.` prefix, no trailing dot.
 * One listing per domain — this is the single function every lane uses to
 * decide whether `www.x.com`, `X.COM`, and `x.com` are the same host
 * (they are). Extracted from lib/profile.ts so the live scan journal
 * (lib/scanlog.ts) can share it without a circular import — profile.ts
 * re-exports it, so every existing importer keeps working.
 */

const SLUG_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

/**
 * Normalize a user-supplied slug to a canonical domain. Returns null when
 * the input can't be a domain — the router maps that to 400 `invalid_slug`.
 */
export function normalizeSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim().toLowerCase();
  if (s.startsWith('www.')) s = s.slice(4);
  if (s.endsWith('.')) s = s.slice(0, -1);
  if (s.length === 0 || s.length > 253) return null;
  if (!s.includes('.')) return null;
  if (s.includes('..')) return null;
  if (!SLUG_RE.test(s)) return null;
  return s;
}
