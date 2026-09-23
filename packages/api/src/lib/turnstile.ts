/**
 * Cloudflare Turnstile verification for public write endpoints (§1.5).
 *
 * TODO (deploy-time): set TURNSTILE_SECRET_KEY in the Render env and add the
 * Turnstile widget to the submit form. Until then this logs a warning and
 * lets the request through — the honeypot field + rate limiting are the
 * active bot defenses in dev.
 */
export async function verifyTurnstile(token: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
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
  });
  const data = (await res.json()) as { success?: boolean };
  return data?.success === true;
}
