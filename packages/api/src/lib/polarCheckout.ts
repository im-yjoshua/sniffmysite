/**
 * Polar ad-hoc checkout sessions (Phase B7 — the throne auction).
 *
 * The throne price moves ($19 floor, +$3 per steal), so we can't use a
 * fixed-price checkout link. Instead the API creates one checkout session
 * per bid with an ad-hoc fixed price, via raw REST (no SDK dependency):
 *
 *   POST https://api.polar.sh/v1/checkouts/
 *   { products: [id], prices: { [id]: [{ amount_type: "fixed",
 *     price_amount: <cents>, price_currency: "usd" }] },
 *     success_url, metadata, allow_discount_codes }
 *
 * The buyer's site URL is collected in OUR form first (so we can validate
 * it before any money moves) and passed through `metadata.website_url` —
 * the webhook's extractWebsiteUrl() reads it from there. `metadata.throne_bid`
 * marks the order so the webhook takes the throne path instead of the
 * legacy featured path.
 *
 * Required env: POLAR_ACCESS_TOKEN (scope checkouts:write — Joshua creates
 * this in the Polar dashboard) and POLAR_THRONE_PRODUCT_ID (the existing
 * Featured Roast product, reused).
 */

export class PolarNotConfiguredError extends Error {
  constructor() {
    super(
      'polar checkout not configured: set POLAR_ACCESS_TOKEN and POLAR_THRONE_PRODUCT_ID',
    );
    this.name = 'PolarNotConfiguredError';
  }
}

export class PolarCheckoutError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`polar checkout creation failed (status ${status})`);
    this.name = 'PolarCheckoutError';
    this.status = status;
  }
}

export interface ThroneCheckoutResult {
  checkout_url: string;
  checkout_id: string;
  price_cents: number;
}

const POLAR_API = 'https://api.polar.sh/v1/checkouts/';
const SUCCESS_URL = 'https://sniffmysite.lol/roasted?checkout_id={CHECKOUT_ID}';

/**
 * Create one throne-bid checkout session at the quoted price. Throws
 * PolarNotConfiguredError when the server isn't wired for it (the route
 * turns this into a 503 with a plain-words message), PolarCheckoutError
 * on a Polar-side failure (route → 502, Polar may be retried by the user).
 */
export async function createThroneCheckout(
  url: string,
  priceCents: number,
  fetchFn: typeof fetch = fetch,
): Promise<ThroneCheckoutResult> {
  const token = (process.env.POLAR_ACCESS_TOKEN ?? '').trim();
  const productId = (process.env.POLAR_THRONE_PRODUCT_ID ?? '').trim();
  if (!token || !productId) throw new PolarNotConfiguredError();

  let res: Response;
  try {
    res = await fetchFn(POLAR_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        products: [productId],
        prices: {
          [productId]: [
            {
              amount_type: 'fixed',
              price_amount: priceCents,
              price_currency: 'usd',
            },
          ],
        },
        success_url: SUCCESS_URL,
        metadata: {
          throne_bid: 'true',
          website_url: url,
          throne_price_cents: String(priceCents),
        },
        allow_discount_codes: true,
      }),
    });
  } catch {
    throw new PolarCheckoutError(0);
  }
  if (!res.ok) throw new PolarCheckoutError(res.status);
  const body = (await res.json()) as { url?: unknown; id?: unknown };
  if (typeof body.url !== 'string' || typeof body.id !== 'string') {
    throw new PolarCheckoutError(res.status);
  }
  return { checkout_url: body.url, checkout_id: body.id, price_cents: priceCents };
}
