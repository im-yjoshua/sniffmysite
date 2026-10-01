/**
 * Cloudflare Turnstile verification for public write endpoints (§1.5).
 *
 * Fail-CLOSED in production: when TURNSTILE_SECRET_KEY is unset and
 * NODE_ENV=production, verification returns false instead of silently
 * disabling bot protection. Dev keeps the warn-and-pass so local work
 * never bricks. (Fixes #4.)
 */
export async function verifyTurnstile(token: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[api] TURNSTILE_SECRET_KEY is not set — refusing to skip the bot check in production.',
      );
      return false;
    }
    console.warn(
      '[api] TURNSTILE_SECRET_KEY not set — skipping bot check (set it before launch).',
    );
    return true;
  }
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token }),
    // A hung Cloudflare must not stall the scan request (fixes #9).
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json()) as { success?: boolean };
  return data?.success === true;
}
