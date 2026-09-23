/**
 * BurnRate billing — Task 8 (§3.6, §3.13). Lemon Squeezy, **TEST MODE ONLY**.
 *
 * Products (from the master plan §3.6 — the plan's real offering, not invented):
 *   - badge        $9  "Verified Burner"        — flame stamp on the company page
 *                                            + report card, for claimed founders
 *   - theme        $4  "Custom report card themes" — Doom / Copium / Diamond hands
 *   - spotlight_bid  $5+ "Weekly spotlight"   — auction for the #1 board slot
 *
 * Flow: hosted checkout (we never touch card data) → Lemon Squeezy signs a
 * webhook → we HMAC-verify it (shared `verifyWebhookSignature`) → idempotent
 * entitlement grant. `order_refunded` claws the entitlement back.
 * Entitlements come ONLY from verified webhooks — never from client-side
 * "payment succeeded" claims.
 *
 * TEST MODE GATE: checkout creation hard-refuses unless
 * `LEMONSQUEEZY_TEST_MODE=true`. Live mode stays blocked until Joshua's
 * Lemon Squeezy seller application is approved. Never log the API key,
 * the webhook secret, or buyer emails.
 *
 * State: replay protection + refund-grant ledger live in-memory (v1, single
 * instance — same deal as Task 9's billing ledger). Deploy seam: Supabase
 * `billing.entitlements` replaces the in-memory maps; the badge/spotlight/
 * theme writes already go to real tables (`burn.badges`, `burn.spotlight_*`,
 * `burn.companies.report_card_theme`), so a restart only loses the
 * just-processed replay window, not the entitlements themselves.
 *
 * Env naming follows the existing repo convention (LEMONSQUEEZY_*, no space):
 *   LEMONSQUEEZY_TEST_MODE, LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID,
 *   LEMONSQUEEZY_WEBHOOK_SECRET,
 *   LEMONSQUEEZY_BADGE_VARIANT_ID, LEMONSQUEEZY_THEME_VARIANT_ID,
 *   LEMONSQUEEZY_SPOTLIGHT_VARIANT_ID
 */

import { verifyWebhookSignature } from './billing';

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

export type BurnProductKey = 'badge' | 'theme' | 'spotlight_bid';

/** Product name as it appears in checkout `custom_data.product`. */
export type BurnEventProduct = 'burn_badge' | 'burn_theme' | 'burn_spotlight';

export interface BurnProductDef {
  key: BurnProductKey;
  /** The custom_data.product string the webhook carries. */
  eventProduct: BurnEventProduct;
  name: string;
  blurb: string;
  /** Fixed price in cents (spotlight is variable, min only). */
  priceCents: number;
  priceDisplay: string;
  /** Env var holding this product's Lemon Squeezy variant ID. */
  variantEnv:
    | 'LEMONSQUEEZY_BADGE_VARIANT_ID'
    | 'LEMONSQUEEZY_THEME_VARIANT_ID'
    | 'LEMONSQUEEZY_SPOTLIGHT_VARIANT_ID';
}

export const BURN_PRODUCTS: Record<BurnProductKey, BurnProductDef> = {
  badge: {
    key: 'badge',
    eventProduct: 'burn_badge',
    name: 'Verified Burner',
    blurb:
      'A flame stamp on your company page and report card. Proof you actually set the money on fire — and lived to verify it.',
    priceCents: 900,
    priceDisplay: '$9',
    variantEnv: 'LEMONSQUEEZY_BADGE_VARIANT_ID',
  },
  theme: {
    key: 'theme',
    eventProduct: 'burn_theme',
    name: 'Custom report card theme',
    blurb:
      'Dress your burn report card in Doom, Copium, or Diamond hands. The numbers stay bleak; the aesthetics improve.',
    priceCents: 400,
    priceDisplay: '$4',
    variantEnv: 'LEMONSQUEEZY_THEME_VARIANT_ID',
  },
  spotlight_bid: {
    key: 'spotlight_bid',
    eventProduct: 'burn_spotlight',
    name: 'Weekly spotlight bid',
    blurb:
      'Bid for the #1 slot at the top of the board for a week. Bids are final — outbid or be outbid.',
    priceCents: 500,
    priceDisplay: '$5 min',
    variantEnv: 'LEMONSQUEEZY_SPOTLIGHT_VARIANT_ID',
  },
};

export function isBurnProductKey(v: unknown): v is BurnProductKey {
  return v === 'badge' || v === 'theme' || v === 'spotlight_bid';
}

export function isBurnEventProduct(v: unknown): v is BurnEventProduct {
  return v === 'burn_badge' || v === 'burn_theme' || v === 'burn_spotlight';
}

/* ------------------------------------------------------------------ */
/* Report card themes (§3.6) — palette overrides for the Task 6 card.  */
/* No gradients, no gloss — trading floor only, just different lighting. */
/* ------------------------------------------------------------------ */

export type CardTheme = 'terminal' | 'doom' | 'copium' | 'diamond_hands';

export const DEFAULT_THEME: CardTheme = 'terminal';

/** Skins money can buy. `terminal` is the free default. */
export const PURCHASABLE_THEMES: CardTheme[] = ['doom', 'copium', 'diamond_hands'];

export const THEME_BLURBS: Record<CardTheme, string> = {
  terminal: 'The house style. Near-black, ember numbers, audited by vibes.',
  doom: 'Total blackout. The burn figure glows blood-red. For ends of runways.',
  copium: 'Paper mode. Your burn, but make it a quarterly report that lies to itself.',
  diamond_hands: 'After-hours, but green. You are not selling. You cannot sell. There is no liquidity.',
};

export function isPurchasableTheme(
  v: unknown,
): v is Exclude<CardTheme, 'terminal'> {
  return v === 'doom' || v === 'copium' || v === 'diamond_hands';
}

export interface ThemePalette {
  bg: string;
  surface: string;
  text: string;
  ember: string;
  ash: string;
  divider: string;
}

/**
 * Palette for a card theme. Unknown names fall back to the default —
 * an unpurchased or misspelled theme renders the house card, never an error.
 */
export function themePalette(name: string | null | undefined): ThemePalette {
  switch (name) {
    case 'doom':
      return {
        bg: '#050505',
        surface: '#0E0B0B',
        text: '#F5F1E8',
        ember: '#FF2B1A',
        ash: '#8A877F',
        divider: '#2A1F1F',
      };
    case 'copium':
      return {
        bg: '#F5F1E8',
        surface: '#EDE8D8',
        text: '#141310',
        ember: '#FF5C1A',
        ash: '#6E6A5E',
        divider: '#D9D2BE',
      };
    case 'diamond_hands':
      return {
        bg: '#0A140F',
        surface: '#0F1B15',
        text: '#F5F1E8',
        ember: '#3DFF9E',
        ash: '#8A877F',
        divider: '#1E2A24',
      };
    case 'terminal':
    default:
      return {
        bg: '#0B0B0C',
        surface: '#131315',
        text: '#F5F1E8',
        ember: '#FF5C1A',
        ash: '#8A877F',
        divider: '#1F1F22',
      };
  }
}

/**
 * Theme gating for the report-card endpoint: the requested theme applies
 * only when it matches the company's PURCHASED theme; anything else
 * renders the free default 'terminal'.
 */
export function resolveCardTheme(
  requested: string | null | undefined,
  purchased: string | null | undefined,
): CardTheme {
  if (
    requested != null &&
    purchased != null &&
    requested === purchased &&
    (requested === 'terminal' || isPurchasableTheme(requested))
  ) {
    return requested as CardTheme;
  }
  return DEFAULT_THEME;
}

/* ------------------------------------------------------------------ */
/* Spotlight auction — week math (pure, unit-tested)                    */
/* ------------------------------------------------------------------ */

/** Minimum bid: $5.00, in cents. */
export const MIN_BID_CENTS = 500;

/** Outbid step: a new bid must beat the current top by at least $1. */
export const OUTBID_STEP_CENTS = 100;

/**
 * The week_start (YYYY-MM-DD) of the auction week containing `now`:
 * Monday 00:00 UTC, per §3.4. Weeks are wall-clock UTC; no timezone games.
 */
export function spotlightWeekStart(now: Date = new Date()): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // getUTCDay: 0=Sunday … 6=Saturday. Monday-based offset.
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

/** The week closes exactly 7 days after it opens. */
export function spotlightEndsAt(weekStart: string): Date {
  const open = Date.parse(`${weekStart}T00:00:00.000Z`);
  return new Date(open + 7 * 24 * 60 * 60 * 1000);
}

/**
 * No cron in v1: the winner is computed lazily. An auction is 'open' until
 * its ends_at passes; after that the current_holder (top paid bid) is the
 * winner and the next week's auction starts on demand. Documented in the
 * GET /api/burn/spotlight handler.
 */
export function spotlightStatus(
  weekStart: string,
  now: Date = new Date(),
): 'open' | 'closed' {
  return now.getTime() >= spotlightEndsAt(weekStart).getTime()
    ? 'closed'
    : 'open';
}

/**
 * Validate a bid amount (cents). Returns the parsed cents or a reason.
 * The $5 floor is the plan's rule; the outbid-by-$1 rule is enforced at
 * checkout against the current top bid (see routes/burn-billing.ts).
 */
export function validateBidCents(
  v: unknown,
): { ok: true; cents: number } | { ok: false; reason: string } {
  let cents = NaN;
  if (typeof v === 'number') cents = Math.round(v);
  else if (typeof v === 'string' && v.trim() !== '') cents = Math.round(Number(v));
  if (!Number.isFinite(cents) || cents <= 0) {
    return { ok: false, reason: 'Bid amount must be a positive number.' };
  }
  if (cents < MIN_BID_CENTS) {
    return {
      ok: false,
      reason: 'Minimum bid is $5. The furnace has standards.',
    };
  }
  return { ok: true, cents };
}

/* ------------------------------------------------------------------ */
/* Webhook event parsing (pure) + replay ledger                        */
/* ------------------------------------------------------------------ */

export interface ParsedBurnEvent {
  eventName: 'order_created' | 'order_refunded';
  orderId: string;
  product: BurnEventProduct;
  companyId: string;
  email: string;
  /** burn_theme only. */
  theme: string | null;
  /** burn_spotlight only, in cents. */
  bidCents: number | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Parse + validate a Lemon Squeezy webhook payload into a Burn event.
 * Returns `{ ok: false }` for anything we can't act on — the route answers
 * 200 anyway (a 4xx would make LS retry a payload that will never parse).
 */
export function parseBurnEvent(
  payload: any,
): { ok: true; event: ParsedBurnEvent } | { ok: false; error: string } {
  const eventName = payload?.meta?.event_name;
  if (eventName !== 'order_created' && eventName !== 'order_refunded') {
    return { ok: false, error: `ignored:${String(eventName)}` };
  }
  const data = payload?.data;
  const orderId = data?.id != null ? String(data.id) : '';
  if (!orderId) return { ok: false, error: 'missing_order_id' };

  const custom = payload?.meta?.custom_data ?? {};
  if (!isBurnEventProduct(custom.product)) {
    return { ok: false, error: 'unknown_product' };
  }
  const companyId = String(custom.company_id ?? '');
  if (!UUID_RE.test(companyId)) return { ok: false, error: 'invalid_company_id' };
  const email = String(custom.email ?? '').trim();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'invalid_email' };

  let theme: string | null = null;
  if (custom.product === 'burn_theme') {
    theme = String(custom.theme ?? '');
    if (!isPurchasableTheme(theme)) return { ok: false, error: 'unknown_theme' };
  }
  let bidCents: number | null = null;
  if (custom.product === 'burn_spotlight') {
    const bid = validateBidCents(Number(custom.bid_amount_cents));
    if (!bid.ok) return { ok: false, error: 'invalid_bid' };
    bidCents = bid.cents;
  }
  return {
    ok: true,
    event: { eventName, orderId, product: custom.product, companyId, email, theme, bidCents },
  };
}

/**
 * Replay ledger: Lemon Squeezy has no per-event IDs, so the idempotency key
 * is `event_name:order_id` — a retried delivery of the same order event is a
 * replay by definition (same as the vapor billing ledger's order-id keying).
 * In-memory for v1; the Supabase `billing.entitlements` table is the deploy
 * seam (its `idempotency_key` column exists for exactly this).
 */
const seenEvents = new Set<string>();
/** order_id → what it granted, so refunds claw back the right thing. */
const grantLedger = new Map<string, ParsedBurnEvent>();

function replayKey(event: ParsedBurnEvent): string {
  return `${event.eventName}:${event.orderId}`;
}

/** Test seam — wipes in-memory billing state. Never called in production. */
export function _resetBurnBillingState(): void {
  seenEvents.clear();
  grantLedger.clear();
}

/* ------------------------------------------------------------------ */
/* Entitlement application (DB-touching; supabase client is injected)   */
/* ------------------------------------------------------------------ */

/**
 * Structural query-chain types for the Supabase calls below — the real
 * client satisfies these, and tests stub them. Only what we actually call.
 */
export interface BurnSelectChain {
  eq(col: string, val: unknown): BurnSelectChain;
  order(col: string, opts: { ascending: boolean }): BurnSelectChain;
  limit(n: number): Promise<{ data: any; error: any }>;
  maybeSingle(): Promise<{ data: any; error: any }>;
  single(): Promise<{ data: any; error: any }>;
}
export interface BurnUpdateChain {
  eq(col: string, val: unknown): Promise<{ error: any }>;
}
export interface BurnDeleteChain {
  eq(col: string, val: unknown): Promise<{ data: any; error: any }>;
}
export interface BurnInsertChain {
  select(cols: string): { single(): Promise<{ data: any; error: any }> };
}
export interface BurnTable {
  upsert(row: Record<string, unknown>, opts?: Record<string, unknown>): Promise<{ error: any }>;
  update(row: Record<string, unknown>): BurnUpdateChain;
  delete(): BurnDeleteChain;
  insert(row: Record<string, unknown>): BurnInsertChain;
  select(cols: string): BurnSelectChain;
}
export interface BurnDb {
  schema(schema: string): { from(table: string): BurnTable };
}

export type BurnWebhookOutcome =
  | { handled: true; action: 'granted' | 'duplicate' | 'revoked' }
  | { handled: false; reason: string };

/**
 * Apply a parsed, signature-verified event. Idempotent:
 * - replay (same event_name:order_id) → 'duplicate', no DB writes
 * - badge/theme/spotlight grants use upserts + conditional updates, so a
 *   grant that somehow runs twice is still a single entitlement
 */
export async function applyBurnEvent(
  event: ParsedBurnEvent,
  db: BurnDb,
  now: Date = new Date(),
): Promise<BurnWebhookOutcome> {
  const key = replayKey(event);
  if (seenEvents.has(key)) {
    return { handled: true, action: 'duplicate' };
  }

  const outcome =
    event.eventName === 'order_created'
      ? await grantBurnEntitlement(event, db, now)
      : await revokeBurnEntitlement(event, db);

  if (outcome.handled) {
    seenEvents.add(key);
    if (seenEvents.size > 10_000) {
      const oldest = seenEvents.values().next();
      if (!oldest.done) seenEvents.delete(oldest.value);
    }
    if (outcome.action === 'granted') grantLedger.set(event.orderId, event);
    else if (outcome.action === 'revoked') grantLedger.delete(event.orderId);
  }
  return outcome;
}

async function grantBurnEntitlement(
  event: ParsedBurnEvent,
  db: BurnDb,
  now: Date,
): Promise<BurnWebhookOutcome> {
  const burn = db.schema('burn');

  if (event.product === 'burn_badge') {
    const { error } = await burn.from('badges').upsert(
      {
        company_id: event.companyId,
        type: 'verified_burner',
        ls_order_id: event.orderId,
      },
      { onConflict: 'company_id,type' },
    );
    if (error) return { handled: false, reason: `db_error:${error.message ?? 'upsert'}` };
    return { handled: true, action: 'granted' };
  }

  if (event.product === 'burn_theme') {
    const { error } = await burn
      .from('companies')
      .update({ report_card_theme: event.theme })
      .eq('id', event.companyId);
    if (error) return { handled: false, reason: `db_error:${error.message ?? 'update'}` };
    return { handled: true, action: 'granted' };
  }

  // burn_spotlight: record the bid against the current week, then recompute
  // the auction's top bid. Highest PAID bid wins — bids are final (§3.12),
  // so no refund path for being outbid exists by design.
  const weekStart = spotlightWeekStart(now);
  const endsAt = spotlightEndsAt(weekStart).toISOString();
  const auctions = burn.from('spotlight_auctions');
  const { data: existing, error: selErr } = await auctions
    .select('id')
    .eq('week_start', weekStart)
    .maybeSingle();
  if (selErr) return { handled: false, reason: `db_error:${selErr.message ?? 'select'}` };
  let auctionId: string = existing?.id;
  if (!auctionId) {
    const { data: created, error: insErr } = await auctions
      .insert({ week_start: weekStart, ends_at: endsAt, current_bid: 0 })
      .select('id')
      .single();
    if (insErr || !created) {
      return { handled: false, reason: `db_error:${insErr?.message ?? 'insert'}` };
    }
    auctionId = created.id;
  }
  const amount = (event.bidCents as number) / 100;
  const { error: bidErr } = await burn.from('spotlight_bids').upsert(
    {
      auction_id: auctionId,
      company_id: event.companyId,
      amount,
      ls_order_id: event.orderId,
    },
    { onConflict: 'ls_order_id', ignoreDuplicates: true },
  );
  if (bidErr) return { handled: false, reason: `db_error:${bidErr.message ?? 'bid'}` };
  await recomputeAuctionTop(burn, auctionId);
  return { handled: true, action: 'granted' };
}

async function revokeBurnEntitlement(
  event: ParsedBurnEvent,
  db: BurnDb,
): Promise<BurnWebhookOutcome> {
  const burn = db.schema('burn');

  if (event.product === 'burn_badge') {
    // Delete by order id — exact clawback, never touches another order's badge.
    const { error } = await burn.from('badges').delete().eq('ls_order_id', event.orderId);
    if (error) return { handled: false, reason: `db_error:${error.message ?? 'delete'}` };
    return { handled: true, action: 'revoked' };
  }

  if (event.product === 'burn_theme') {
    // Revert to the default skin. A newer purchase would have overwritten
    // report_card_theme anyway; the in-memory grant ledger keeps the exact
    // theme for the common case, but a restart-safe v2 would track
    // theme order ids in billing.entitlements (deploy seam, documented).
    const { error } = await burn
      .from('companies')
      .update({ report_card_theme: DEFAULT_THEME })
      .eq('id', event.companyId);
    if (error) return { handled: false, reason: `db_error:${error.message ?? 'update'}` };
    return { handled: true, action: 'revoked' };
  }

  // burn_spotlight: remove the bid, recompute the top. An order unknown to
  // us (e.g. replay after a restart lost the ledger) is a no-op delete +
  // recompute — still a 200 so LS stops retrying.
  await burn.from('spotlight_bids').delete().eq('ls_order_id', event.orderId);
  const weekStart = spotlightWeekStart();
  const { data: auction } = await burn
    .from('spotlight_auctions')
    .select('id')
    .eq('week_start', weekStart)
    .maybeSingle();
  if (auction?.id) await recomputeAuctionTop(burn, auction.id);
  return { handled: true, action: 'revoked' };
}

/** Set an auction's current_bid / current_holder_id from its top bid. */
async function recomputeAuctionTop(
  burn: { from(table: string): BurnTable },
  auctionId: string,
): Promise<void> {
  const { data: top } = await burn
    .from('spotlight_bids')
    .select('company_id, amount')
    .eq('auction_id', auctionId)
    .order('amount', { ascending: false })
    .limit(1);
  const winner = top?.[0];
  await burn
    .from('spotlight_auctions')
    .update({
      current_bid: winner ? Number(winner.amount) : 0,
      current_holder_id: winner ? winner.company_id : null,
    })
    .eq('id', auctionId);
}

/* Re-export the shared verifier for route convenience. */
export { verifyWebhookSignature };
