import { Router, Request, Response } from 'express';
import {
  PRODUCTS,
  applyBillingEvent,
  consumeCredit,
  createLemonCheckout,
  creditsFor,
  isBillingTestMode,
  isProductKey,
  LemonApiError,
  verifyWebhookSignature,
} from '../lib/billing';
import {
  applyBurnEvent,
  isBurnEventProduct,
  parseBurnEvent,
} from '../lib/burn-billing';
import {
  SPONSOR_PRODUCTS,
  applySponsorEvent,
  isSponsorProductKey,
  validateAdvertiser,
  type SponsorProductKey,
} from '../lib/sponsors';
import { getSupabase } from '../lib/supabase';
import {
  rateLimit,
  CHECKOUT_LIMIT,
  CHECKOUT_WINDOW_MS,
  WEBHOOK_LIMIT,
  WEBHOOK_WINDOW_MS,
} from '../lib/security';

/**
 * VaporRank billing routes — Task 9 (§2.6, §2.11). Lemon Squeezy TEST MODE.
 * Mounted at both `/api/billing/*` (shared, per the master plan) and
 * `/api/vapor/billing/*` (product namespace). The router is stateless; the
 * ledger lives in `lib/billing.ts`.
 *
 * - POST /checkout {product, email, startup_domain?} → hosted LS URL
 *   Banner products (banner7/banner30) also accept {brand_name, image_url,
 *   dest_url, alt_text}; the advertiser inputs are validated server-side and
 *   passed through as checkout `custom` data. Banner webhooks create a
 *   `pending_approval` sponsor record — never credits.
 * - POST /webhook  Lemon Squeezy events (X-Signature HMAC-verified)
 * - GET  /credits?email=… → entitlement summary
 * - POST /consume {email, product} → spend one credit
 *
 * Live mode is hard-blocked: checkout creation 503s unless
 * LEMONSQUEEZY_TEST_MODE=true, until the seller application is approved.
 */
export const billingRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Live-mode gate. Returns false (and already responded) when blocked. */
export function testModeGuard(res: Response): boolean {
  if (!isBillingTestMode()) {
    res.status(503).json({
      error: 'billing_live_blocked',
      detail:
        'Live payments are disabled until the Lemon Squeezy seller application is approved. Run the lab in test mode (LEMONSQUEEZY_TEST_MODE=true).',
    });
    return false;
  }
  return true;
}

export function lemonConfig(): { apiKey: string; storeId: string } | null {
  const apiKey = (process.env.LEMONSQUEEZY_API_KEY ?? '').trim();
  const storeId = (process.env.LEMONSQUEEZY_STORE_ID ?? '').trim();
  if (!apiKey || !storeId) return null;
  return { apiKey, storeId };
}

billingRouter.post(
  '/checkout',
  // Task 10: spam checkouts cost us Lemon Squeezy API calls.
  rateLimit('billing-checkout', CHECKOUT_LIMIT, CHECKOUT_WINDOW_MS),
  async (req: Request, res: Response) => {
  if (!testModeGuard(res)) return;
  const cfg = lemonConfig();
  if (!cfg) {
    return res.status(503).json({
      error: 'billing_not_configured',
      detail: 'Lemon Squeezy test credentials are not set on the server.',
    });
  }

  const { product, email, startup_domain } = req.body ?? {};
  const isBanner = isSponsorProductKey(product);
  if (!isProductKey(product) && !isBanner) {
    return res.status(400).json({
      error: 'unknown_product',
      detail: 'product must be "rescan", "audit", "banner7" or "banner30".',
    });
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  // Banner products use their own catalog — they never touch the
  // rescan/audit credit ledger.
  const catalogDef = isBanner
    ? SPONSOR_PRODUCTS[product as SponsorProductKey]
    : PRODUCTS[product as 'rescan' | 'audit'];
  const variantId = (process.env[catalogDef.variantEnv] ?? '').trim();
  if (!variantId) {
    return res.status(503).json({
      error: 'billing_not_configured',
      detail: `No Lemon Squeezy variant configured for "${product}".`,
    });
  }

  const custom: Record<string, string> = { product };
  if (isBanner) {
    // Advertiser inputs ride along as checkout `custom` data (kept small:
    // URLs + names only) so the webhook can build the sponsor record.
    const advertiser = validateAdvertiser(req.body ?? {});
    if (!advertiser.ok) {
      return res.status(400).json({
        error: 'invalid_advertiser_input',
        detail: advertiser.error,
      });
    }
    custom.brand_name = advertiser.value.brand_name;
    custom.image_url = advertiser.value.image_url;
    custom.dest_url = advertiser.value.dest_url;
    custom.alt_text = advertiser.value.alt_text;
  } else {
    const domain =
      typeof startup_domain === 'string'
        ? startup_domain.trim().toLowerCase()
        : '';
    if (domain) custom.startup_domain = domain;
  }

  try {
    const checkout = await createLemonCheckout({
      variantId,
      storeId: cfg.storeId,
      apiKey: cfg.apiKey,
      email: email.trim(),
      custom,
      testMode: true,
    });
    res.json({
      checkout_url: checkout.url,
      checkout_id: checkout.checkoutId,
      test_mode: true,
      product,
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

billingRouter.post(
  '/webhook',
  // Task 10: applied BEFORE signature verification — per-IP, so it only
  // throttles a flooding source, never Lemon Squeezy's own servers. Unsigned
  // floods get 429s instead of burning HMAC CPU and log lines.
  rateLimit('billing-webhook', WEBHOOK_LIMIT, WEBHOOK_WINDOW_MS),
  async (req: Request & { rawBody?: Buffer }, res: Response) => {
    const secret = (process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? '').trim();
    if (!secret) {
      return res.status(503).json({ error: 'webhook_not_configured' });
    }
    const signature = req.get('x-signature');
    if (
      !verifyWebhookSignature(req.rawBody ?? Buffer.alloc(0), signature, secret)
    ) {
      return res.status(401).json({ error: 'invalid_signature' });
    }

    let payload: any;
    try {
      payload = JSON.parse((req.rawBody as Buffer).toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'invalid_payload' });
    }

    // Shared endpoint (§3.11): burn products dispatch to the BurnRate
    // handler; banner products dispatch to the sponsor handler; everything
    // else keeps the existing VaporRank credit ledger.
    if (isBurnEventProduct(payload?.meta?.custom_data?.product)) {
      return handleBurnWebhook(payload, res);
    }
    if (isSponsorProductKey(payload?.meta?.custom_data?.product)) {
      const sponsorOutcome = applySponsorEvent(payload);
      console.log(
        `[billing] webhook sponsor ${payload?.meta?.event_name ?? 'unknown'} →`,
        sponsorOutcome.handled ? sponsorOutcome.action : sponsorOutcome.reason,
      );
      // 200 for handled AND ignored events — only bad signatures get a retry.
      return res.json({ received: true, ...sponsorOutcome });
    }

    const outcome = applyBillingEvent(payload);
    console.log(
      `[billing] webhook vapor ${payload?.meta?.event_name ?? 'unknown'} →`,
      outcome.handled ? outcome.action : outcome.reason,
    );
    // 200 for handled AND ignored events — only bad signatures get a retry.
    res.json({ received: true, ...outcome });
  },
);

/**
 * Burn product dispatch for the SHARED webhook. The event is parsed and
 * applied by lib/burn-billing (badge / theme / spotlight bid grants and
 * refund clawbacks). Signature verification already happened above.
 */
async function handleBurnWebhook(
  payload: any,
  res: Response,
): Promise<void> {
  const parsed = parseBurnEvent(payload);
  if (!parsed.ok) {
    console.log(`[billing] webhook burn → ${parsed.error}`);
    // A payload that will never parse must not trigger LS retries.
    res.json({ received: true, handled: false, reason: parsed.error });
    return;
  }
  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    res.status(500).json({
      error: 'server_not_configured',
      detail: 'The burn furnace is offline. Try again later.',
    });
    return;
  }
  const outcome = await applyBurnEvent(parsed.event, supabase as any);
  // Never log the raw event — it carries the buyer's email.
  console.log(
    `[billing] webhook burn ${parsed.event.eventName} ${parsed.event.product} order=${parsed.event.orderId.slice(0, 8)}… →`,
    outcome.handled ? outcome.action : outcome.reason,
  );
  res.json({ received: true, ...outcome });
}

billingRouter.get('/credits', (req: Request, res: Response) => {
  const email = (req.query.email ?? '').toString().trim();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  res.json(creditsFor(email));
});

billingRouter.post('/consume', (req: Request, res: Response) => {
  const { email, product } = req.body ?? {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  if (!isProductKey(product)) {
    return res.status(400).json({ error: 'unknown_product' });
  }
  const { ok, remaining } = consumeCredit(email.trim(), product);
  if (!ok) {
    return res.status(402).json({
      error: 'no_credits',
      detail: 'No credits left for this product.',
      remaining,
    });
  }
  res.json({ ok: true, product, remaining });
});
