/**
 * BurnRate.lol — canonical site constants.
 *
 * The domain is NOT purchased yet (Joshua buys burn-rate.lol on Sep 21).
 * This constant is the single source of truth for the canonical domain so
 * components never hardcode it; no DNS or hosting work lives here.
 */
export const SITE_DOMAIN = 'burn-rate.lol';

/** Public URL of the site (no trailing slash). */
export const SITE_URL = `https://${SITE_DOMAIN}`;
