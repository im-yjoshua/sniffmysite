import { Router, type Request, type Response } from 'express';
import { getSupabase } from '../lib/supabase';
import { hitRateLimit } from '../lib/ratelimit';
import { createLemonCheckout, LemonApiError } from '../lib/billing';
import {
  BURN_PRODUCTS,
  MIN_BID_CENTS,
  OUTBID_STEP_CENTS,
  isBurnProductKey,
  isPurchasableTheme,
  spotlightWeekStart,
  validateBidCents,
} from '../lib/burn-billing';
import { testModeGuard, lemonConfig } from './billing';

/**
 * BurnRate billing routes — Task 8 (§3.6, §3.11, §3.13).
 * Mounted at `/api/burn/billing/*`.
 *
 * POST /checkout {product, company_id, email?, theme?, bid_amount_cents?}
 *   → validates the product + company → creates a Lemon Squeezy hosted
 *   checkout in TEST MODE → returns the checkout URL. Rate-limited.
 *
 * Products:
 *   - badge: $9, requires the company to be CLAIMED (Task 7). The receipt
 *     goes to the claim email — looked up server-side, never from the client.
 *   - theme: $4, requires a purchasable theme + buyer email.
 *   - spotlight_bid: $5 minimum, and must beat the current top bid by $1+.
 *     Bids are final (§3.12) — no refunds on being outbid.
 *
 * Live mode is hard-blocked by the shared testModeGuard: 503 unless
 * LEMONSQUEEZY_TEST_MODE=true, until the seller application is approved.
 * Without LS credentials: honest 503 billing_not_configured.
 */
export const burnBillingRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFoundCompany = (res: Response) =>
  res.status(404).json({
    error: 'not_found',
    message: "This burner doesn't exist. Or it burned out completely.",
  });

burnBillingRouter.post('/checkout', async (req: Request, res: Response) => {
  if (!testModeGuard(res)) return;
  const cfg = lemonConfig();
  if (!cfg) {
    return res.status(503).json({
      error: 'billing_not_configured',
      detail: 'Lemon Squeezy test credentials are not set on the server.',
    });
  }

  const ip = req.ip ?? 'unknown';
  if (hitRateLimit(`burn-checkout:${ip}`, 10, 60 * 60 * 1000)) {
    return res.status(429).json({
      error: 'rate_limited',
      message: 'Whoa. One purchase at a time — try again in a bit.',
    });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const product = body.product;
  if (!isBurnProductKey(product)) {
    return res.status(400).json({
      error: 'unknown_product',
      detail: 'product must be "badge", "theme", or "spotlight_bid".',
    });
  }
  const companyId =
    typeof body.company_id === 'string' ? body.company_id.trim() : '';
  if (!UUID_RE.test(companyId)) {
    return res.status(400).json({ error: 'invalid_company' });
  }

  const def = BURN_PRODUCTS[product];
  const variantId = (process.env[def.variantEnv] ?? '').trim();
  if (!variantId) {
    return res.status(503).json({
      error: 'billing_not_configured',
      detail: `No Lemon Squeezy variant configured for "${product}".`,
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

  const { data: company, error: companyErr } = await supabase
    .schema('burn')
    .from('companies')
    .select('id, domain, name, claimed_by_email, report_card_theme')
    .eq('id', companyId)
    .eq('status', 'live')
    .maybeSingle();
  if (companyErr) {
    console.error('[api] burn checkout company lookup failed:', companyErr.message);
    return res.status(500).json({
      error: 'lookup_failed',
      message: 'The furnace hiccuped. Try again.',
    });
  }
  if (!company) return notFoundCompany(res);

  const custom: Record<string, string> = {
    product: def.eventProduct,
    company_id: company.id,
  };
  let email = '';
  let spotlightNote: string | undefined;

  if (product === 'badge') {
    // The badge is a founder flex — no claim, no flame.
    if (!company.claimed_by_email) {
      return res.status(400).json({
        error: 'not_claimed',
        message:
          'Claim this burn first — the badge is only for founders who proved it\u2019s theirs.',
      });
    }
    const { data: existing } = await supabase
      .schema('burn')
      .from('badges')
      .select('id')
      .eq('company_id', company.id)
      .eq('type', 'verified_burner')
      .maybeSingle();
    if (existing) {
      return res.status(409).json({
        error: 'already_verified',
        message: 'This burn is already certified. The flame is lit.',
      });
    }
    // The receipt goes to the verified claim email — server-side lookup,
    // never a client-supplied address (no paying for someone else's badge).
    email = company.claimed_by_email as string;
    custom.email = email;
  }

  if (product === 'theme') {
    const theme = body.theme;
    if (!isPurchasableTheme(theme)) {
      return res.status(400).json({
        error: 'unknown_theme',
        detail: 'theme must be "doom", "copium", or "diamond_hands".',
      });
    }
    if (company.report_card_theme === theme) {
      return res.status(409).json({
        error: 'already_owned',
        message: 'This company already wears that skin.',
      });
    }
    email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'invalid_email' });
    }
    custom.email = email;
    custom.theme = theme;
  }

  if (product === 'spotlight_bid') {
    const bid = validateBidCents(body.bid_amount_cents);
    if (!bid.ok) {
      return res.status(400).json({ error: 'invalid_bid', detail: bid.reason });
    }
    email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'invalid_email' });
    }
    // Outbid by $1+ to take the slot (§3.4). Checked at checkout time;
    // the highest PAID bid at week close wins, so a near-simultaneous
    // higher bid still wins fairly.
    const weekStart = spotlightWeekStart();
    const { data: auction } = await supabase
      .schema('burn')
      .from('spotlight_auctions')
      .select('current_bid')
      .eq('week_start', weekStart)
      .maybeSingle();
    const currentCents = Math.round(Number(auction?.current_bid ?? 0) * 100);
    const floor = Math.max(MIN_BID_CENTS, currentCents + OUTBID_STEP_CENTS);
    if (bid.cents < floor) {
      return res.status(400).json({
        error: 'bid_too_low',
        detail: `Current top bid is $${(currentCents / 100).toFixed(2)} — beat it by at least $1.`,
        minimum_cents: floor,
      });
    }
    custom.email = email;
    custom.bid_amount_cents = String(bid.cents);
    spotlightNote =
      'Bids are final. No refunds for being outbid — that\u2019s the game.';
  }

  try {
    const checkout = await createLemonCheckout({
      variantId,
      storeId: cfg.storeId,
      apiKey: cfg.apiKey,
      email,
      custom,
      testMode: true,
    });
    res.json({
      checkout_url: checkout.url,
      checkout_id: checkout.checkoutId,
      test_mode: true,
      product,
      company_id: company.id,
      ...(spotlightNote ? { note: spotlightNote } : {}),
    });
  } catch (e) {
    // The API key never leaves the server; the client gets no LS details.
    if (e instanceof LemonApiError) {
      return res.status(502).json({
        error: 'checkout_failed',
        detail: 'Lemon Squeezy did not return a checkout. Try again in a minute.',
      });
    }
    throw e;
  }
});
