/**
 * Magic-link email sending via the Resend HTTPS API (plain fetch, no SDK).
 *
 * Production needs two env vars:
 *   RESEND_API_KEY    — the Resend API key (server-side only, never VITE_*).
 *   RESEND_FROM_EMAIL — a VERIFIED sender domain on the Resend account,
 *                      e.g. noreply@burn-rate.lol. Resend rejects sends from
 *                      unverified domains.
 *
 * Dev mode: when RESEND_API_KEY is unset, no email is sent — the magic link
 * is logged to the server console with a loud warning and the endpoint still
 * returns "check your inbox". Claim flows are fully testable locally without
 * a Resend account; just remember production needs the key + verified domain.
 */

import type { Tier } from './score';

export interface MagicLinkEmail {
  to: string;
  companyName: string;
  magicLink: string;
}

/** Score-drop alert (SniffMySite watchlist, growth plan §3). The `to`
 * address is only ever used as the Resend recipient — the dev-mode console
 * path logs the domain + scores and NEVER the email. */
export interface ScoreDropAlert {
  to: string;
  domain: string;
  slug: string;
  prevScore: number;
  newScore: number;
  tier: Tier;
  unsubUrl: string;
  siteUrl: string;
}

export interface SendResult {
  ok: boolean;
  devMode: boolean;
  error?: string;
}

export async function sendMagicLinkEmail(input: MagicLinkEmail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM_EMAIL ?? 'noreply@burn-rate.lol';

  if (!apiKey) {
    console.warn(
      '[api] DEV MODE — RESEND_API_KEY is unset, no email sent. ' +
        'Set RESEND_API_KEY + a verified RESEND_FROM_EMAIL before launch.',
    );
    console.warn(`[api] DEV MODE — magic link for ${input.to}: ${input.magicLink}`);
    return { ok: true, devMode: true };
  }

  const subject = `Claim your burn: ${input.companyName}`;
  const text =
    `Someone (hopefully you) asked to claim "${input.companyName}" on BurnRate.lol.\n\n` +
    `Prove you're the one setting the money on fire:\n${input.magicLink}\n\n` +
    `This link expires in 24 hours and works exactly once. After that you'll ` +
    `prove domain ownership with a DNS TXT record.\n\n` +
    `Didn't ask for this? Ignore it — the burn stays unclaimed.\n\n` +
    `Audited by vibes.`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `BurnRate.lol <${from}>`,
        to: [input.to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[api] resend send failed:', res.status, detail.slice(0, 200));
      return { ok: false, devMode: false, error: `resend_${res.status}` };
    }
    return { ok: true, devMode: false };
  } catch (err) {
    console.error('[api] resend request failed:', (err as Error).message);
    return { ok: false, devMode: false, error: 'email_send_failed' };
  }
}

/**
 * Score-drop alert email (SniffMySite watchlist, growth plan §3). Same
 * pattern as the magic-link sender: real POST to api.resend.com when
 * RESEND_API_KEY is set, loud console log when unset.
 *
 * PRIVACY: the dev-mode log shows the domain and scores but NEVER the email
 * address, and no email ever appears in an error message.
 *
 * Copy rules: lab voice, 5th-grade plain, roast the PAGE never people.
 */
export async function sendScoreDropAlert(input: ScoreDropAlert): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? 'noreply@sniffmysite.lol';
  const drop = input.prevScore - input.newScore;
  const dossierUrl = `${input.siteUrl}/s/${input.slug}`;

  if (!apiKey) {
    console.warn(
      '[api] DEV MODE — RESEND_API_KEY is unset, no alert email sent. ' +
        'Set RESEND_API_KEY + a verified RESEND_FROM_EMAIL before launch.',
    );
    // Deliberately domain + scores only: the recipient address is private.
    console.warn(
      `[api] DEV MODE — score-drop alert for ${input.domain}: ` +
        `${input.prevScore} → ${input.newScore}/100 (${drop}-point drop, tier ${input.tier}).`,
    );
    console.warn(`[api] DEV MODE — dossier: ${dossierUrl}`);
    console.warn(`[api] DEV MODE — unsubscribe: ${input.unsubUrl}`);
    return { ok: true, devMode: true };
  }

  const subject = `${input.domain} dropped to ${input.newScore}/100 — the nose noticed`;
  const text =
    `Heads up: ${input.domain} just got tested again and dropped from ` +
    `${input.prevScore} to ${input.newScore}/100 — a ${drop}-point drop.\n\n` +
    `See the full report: ${dossierUrl}\n\n` +
    `Fix the page and test it again — the score moves with the page. ` +
    `No appeals, no bribes.\n\n` +
    `Done with these? One click, you're off the list: ${input.unsubUrl}\n\n` +
    `— The SniffMySite lab`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `SniffMySite <${from}>`,
        to: [input.to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // The address never appears in error logs.
      console.error('[api] score-drop alert send failed:', res.status, detail.slice(0, 200));
      return { ok: false, devMode: false, error: `resend_${res.status}` };
    }
    return { ok: true, devMode: false };
  } catch (err) {
    console.error('[api] score-drop alert request failed:', (err as Error).message);
    return { ok: false, devMode: false, error: 'email_send_failed' };
  }
}
