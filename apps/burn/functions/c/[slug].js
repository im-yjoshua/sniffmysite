/**
 * Cloudflare Pages Function — per-company link previews (Task 6, §3.6 virality).
 *
 * The SPA is client-rendered, so social crawlers (Twitterbot, Slackbot, …)
 * would see an empty shell and no og:image. This function sniffs the
 * User-Agent on /c/:slug:
 *   - human (or unknown agent) → straight passthrough to the SPA via
 *     env.ASSETS. Zero added latency, no fetches on this path.
 *   - crawler → tiny HTML shell with per-company og:title / og:description /
 *     og:image (pointing at the API's report-card PNG). Falls back to the
 *     generic default shell when the API is unreachable.
 *
 * This is the standard crawler-vs-human pattern. It runs on every /c/* visit,
 * so keep it small.
 *
 * Env (set in the Cloudflare Pages dashboard):
 *   PUBLIC_API_BASE_URL — the Render API origin, e.g. https://burnrate-api.onrender.com
 *   PUBLIC_SITE_URL     — canonical site URL, defaults to https://burn-rate.lol
 *
 * Functions take precedence over the /* /index.html _redirects rule for
 * matching routes, so humans still land on the SPA through env.ASSETS.
 */

const CRAWLER_RE =
  /twitterbot|facebookexternalhit|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|pinterest|embedly|quora bot|outbrain|skypeuripreview|google.*snippet/i;

const DEFAULT_SITE_URL = 'https://burn-rate.lol';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function fmtMoney(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString('en-US')}/mo`;
}

/** Chat-voice runway line for og:description — mirrors the API's formatRunwayLine. */
function runwayText(days) {
  if (days == null || Number.isNaN(days)) return 'runway unknown (bold strategy)';
  if (days <= 0) return '0 days. Status: airborne.';
  if (days < 7) return `${Math.floor(days)} days. Status: critical.`;
  if (days < 60) {
    const w = Math.max(1, Math.round(days / 7));
    return `${w} week${w === 1 ? '' : 's'}`;
  }
  const m = Math.max(2, Math.floor(days / 30.4375));
  return `${m} month${m === 1 ? '' : 's'}`;
}

export async function onRequest({ request, env, params }) {
  const slug = String(params.slug ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 63);

  // Humans (and unrecognized agents): passthrough, no work done.
  const ua = request.headers.get('user-agent') ?? '';
  if (!CRAWLER_RE.test(ua)) {
    return env.ASSETS.fetch(request);
  }

  // --- crawler path below ---
  const apiBase = String(env.PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, '');
  const siteUrl = String(env.PUBLIC_SITE_URL ?? DEFAULT_SITE_URL).replace(/\/+$/, '');
  const pageUrl = `${siteUrl}/c/${encodeURIComponent(slug)}`;

  let detail = null;
  if (apiBase && slug) {
    try {
      // One call to the public company endpoint — live rows only, so pending
      // listings never leak into previews.
      const r = await fetch(`${apiBase}/api/burn/company/${encodeURIComponent(slug)}`, {
        headers: { 'user-agent': 'burnrate-ogbot/1.0' },
      });
      if (r.ok) detail = await r.json();
    } catch {
      // API down → generic shell below. The crawler still gets a valid card.
    }
  }

  const title = detail
    ? `${detail.name} is burning ${fmtMoney(detail.monthly_burn)} — BurnRate.lol`
    : 'BurnRate.lol — Revenue is vanity. Burn is sanity. Probably.';
  const description = detail
    ? `Runway: ${runwayText(detail.runway_days_remaining)} Vibes: immaculate. Self-reported. Audited by vibes.`
    : 'The leaderboard that ranks startups by monthly burn. Self-reported. Audited by vibes.';
  const image =
    detail && apiBase
      ? `${apiBase}/api/burn/report-card/${encodeURIComponent(slug)}.png`
      : `${siteUrl}/og-default.png`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<meta property="og:type" content="website" />
<meta property="og:site_name" content="BurnRate.lol" />
<meta property="og:url" content="${esc(pageUrl)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(image)}" />
<meta http-equiv="refresh" content="0;url=${esc(pageUrl)}" />
</head>
<body><p>Crawler shell — humans see the app at <a href="${esc(pageUrl)}">${esc(pageUrl)}</a>.</p></body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Previews are cheap to serve; revalidate hourly so new listings propagate.
      'cache-control': 'public, max-age=3600',
    },
  });
}
