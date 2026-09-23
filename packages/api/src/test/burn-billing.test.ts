import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  BURN_PRODUCTS,
  MIN_BID_CENTS,
  PURCHASABLE_THEMES,
  _resetBurnBillingState,
  applyBurnEvent,
  isBurnProductKey,
  isPurchasableTheme,
  parseBurnEvent,
  resolveCardTheme,
  spotlightEndsAt,
  spotlightStatus,
  spotlightWeekStart,
  themePalette,
  validateBidCents,
  verifyWebhookSignature,
  type BurnDb,
  type ParsedBurnEvent,
} from '../lib/burn-billing.js';
import { buildReportCardSVG } from '../lib/report-card.js';

/* ------------------------------------------------------------------ */
/* Fake Supabase client (structural BurnDb)                             */
/* ------------------------------------------------------------------ */

interface FakeTableSpec {
  maybeSingle?: () => { data: any; error: any };
  single?: () => { data: any; error: any };
  limit?: () => { data: any; error: any };
  upsertResult?: { error: any };
  updateEqResult?: { error: any };
  deleteEqResult?: { data: any; error: any };
  insertSingleResult?: { data: any; error: any };
}

function createFakeDb(
  specs: Record<string, FakeTableSpec>,
  calls: string[],
): BurnDb {
  const table = (name: string): any => {
    const spec = specs[name] ?? {};
    const chain: any = {
      eq: () => chain,
      order: () => chain,
      limit: async () => spec.limit?.() ?? { data: [], error: null },
      maybeSingle: async () =>
        spec.maybeSingle?.() ?? { data: null, error: null },
      single: async () => spec.single?.() ?? { data: null, error: null },
    };
    return {
      upsert: async (row: any, opts: any) => {
        calls.push(`${name}.upsert:${JSON.stringify(row)}`);
        return spec.upsertResult ?? { error: null };
      },
      update: (row: any) => {
        calls.push(`${name}.update:${JSON.stringify(row)}`);
        return {
          eq: async (col: string, val: any) => {
            calls.push(`${name}.update.eq:${col}=${val}`);
            return spec.updateEqResult ?? { error: null };
          },
        };
      },
      delete: () => ({
        eq: async (col: string, val: any) => {
          calls.push(`${name}.delete.eq:${col}=${val}`);
          return (
            spec.deleteEqResult ?? { data: null, error: null }
          );
        },
      }),
      insert: (row: any) => {
        calls.push(`${name}.insert:${JSON.stringify(row)}`);
        return {
          select: () => ({
            single: async () =>
              spec.insertSingleResult ?? {
                data: { id: 'auction-new' },
                error: null,
              },
          }),
        };
      },
      select: (cols: string) => {
        calls.push(`${name}.select:${cols}`);
        return chain;
      },
    };
  };
  return { schema: () => ({ from: (t: string) => table(t) }) };
}

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';

function lsPayload(overrides: {
  eventName?: string;
  orderId?: string;
  custom?: Record<string, any>;
} = {}): any {
  return {
    meta: {
      event_name: overrides.eventName ?? 'order_created',
      custom_data: {
        product: 'burn_badge',
        company_id: COMPANY_ID,
        email: 'founder@example.com',
        ...(overrides.custom ?? {}),
      },
    },
    data: { id: overrides.orderId ?? 'order-123' },
  };
}

function parsedBadge(): ParsedBurnEvent {
  return {
    eventName: 'order_created',
    orderId: 'order-123',
    product: 'burn_badge',
    companyId: COMPANY_ID,
    email: 'founder@example.com',
    theme: null,
    bidCents: null,
  };
}

/* ------------------------------------------------------------------ */

describe('burn products', () => {
  it('defines the three §3.6 products with the right prices', () => {
    assert.equal(BURN_PRODUCTS.badge.priceCents, 900);
    assert.equal(BURN_PRODUCTS.theme.priceCents, 400);
    assert.equal(BURN_PRODUCTS.spotlight_bid.priceCents, MIN_BID_CENTS);
    assert.equal(isBurnProductKey('badge'), true);
    assert.equal(isBurnProductKey('audit'), false);
    assert.equal(isPurchasableTheme('doom'), true);
    assert.equal(isPurchasableTheme('terminal'), false);
    assert.deepEqual(PURCHASABLE_THEMES, ['doom', 'copium', 'diamond_hands']);
  });
});

describe('themePalette', () => {
  it('falls back to terminal for unknown, null, and undefined names', () => {
    for (const name of ['bogus', null, undefined, '']) {
      assert.equal(themePalette(name).bg, '#0B0B0C');
      assert.equal(themePalette(name).ember, '#FF5C1A');
    }
  });

  it('gives each skin a distinct, gradient-free palette', () => {
    const doom = themePalette('doom');
    assert.equal(doom.bg, '#050505');
    assert.equal(doom.ember, '#FF2B1A');
    const copium = themePalette('copium');
    assert.equal(copium.bg, '#F5F1E8');
    assert.equal(copium.text, '#141310');
    const dh = themePalette('diamond_hands');
    assert.equal(dh.ember, '#3DFF9E');
    // All flat colors — no gradient stops anywhere.
    for (const p of [doom, copium, dh, themePalette('terminal')]) {
      for (const v of Object.values(p)) {
        assert.match(v, /^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
});

describe('resolveCardTheme', () => {
  it('applies the requested theme only when it matches the purchased one', () => {
    assert.equal(resolveCardTheme('doom', 'doom'), 'doom');
    assert.equal(resolveCardTheme('copium', 'copium'), 'copium');
  });

  it('falls back to terminal for unpurchased, mismatched, or bogus themes', () => {
    assert.equal(resolveCardTheme('doom', null), 'terminal');
    assert.equal(resolveCardTheme('doom', 'copium'), 'terminal');
    assert.equal(resolveCardTheme('bogus', 'bogus'), 'terminal');
    assert.equal(resolveCardTheme(null, 'doom'), 'terminal');
    assert.equal(resolveCardTheme('terminal', 'doom'), 'terminal');
  });
});

describe('buildReportCardSVG themes', () => {
  const base = {
    name: 'StealthMode AI',
    domain: 'stealthmode.lol',
    slug: 'stealthmode',
    monthlyBurn: 212000,
    runwayDaysRemaining: 21,
    siteUrl: 'https://burn-rate.lol',
  };

  it('renders the default terminal card without a theme', () => {
    const svg = buildReportCardSVG(base);
    assert.ok(svg.includes('#0B0B0C'));
    assert.ok(svg.includes('#FF5C1A'));
  });

  it('applies the doom skin when requested', () => {
    const svg = buildReportCardSVG({ ...base, theme: 'doom' });
    assert.ok(svg.includes('#050505'));
    assert.ok(svg.includes('#FF2B1A'));
    assert.ok(!svg.includes('#0B0B0C'));
  });
});

describe('spotlight week math', () => {
  it('computes Monday 00:00 UTC week_start', () => {
    // 2026-09-20 is a Sunday.
    assert.equal(
      spotlightWeekStart(new Date('2026-09-20T12:00:00Z')),
      '2026-09-14',
    );
    // Monday stays on its own week, even 1 second in.
    assert.equal(
      spotlightWeekStart(new Date('2026-09-21T00:00:01Z')),
      '2026-09-21',
    );
    // Sunday night is still the old week.
    assert.equal(
      spotlightWeekStart(new Date('2026-09-20T23:59:59Z')),
      '2026-09-14',
    );
  });

  it('closes exactly 7 days after opening', () => {
    const ends = spotlightEndsAt('2026-09-14');
    assert.equal(ends.toISOString(), '2026-09-21T00:00:00.000Z');
  });

  it('reports open vs closed status (lazy winner, no cron)', () => {
    assert.equal(
      spotlightStatus('2026-09-14', new Date('2026-09-20T12:00:00Z')),
      'open',
    );
    assert.equal(
      spotlightStatus('2026-09-14', new Date('2026-09-21T00:00:00Z')),
      'closed',
    );
  });
});

describe('validateBidCents', () => {
  it('accepts $5 and above, numbers or numeric strings', () => {
    assert.deepEqual(validateBidCents(500), { ok: true, cents: 500 });
    assert.deepEqual(validateBidCents('750'), { ok: true, cents: 750 });
    assert.deepEqual(validateBidCents(500.4), { ok: true, cents: 500 });
  });

  it('rejects below-minimum, zero, negative, and garbage', () => {
    for (const v of [499, 0, -5, NaN, 'abc', '', null, undefined]) {
      const r = validateBidCents(v);
      assert.equal(r.ok, false, `expected rejection for ${String(v)}`);
    }
  });
});

describe('parseBurnEvent', () => {
  it('parses a valid badge order_created', () => {
    const r = parseBurnEvent(lsPayload());
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.event.product, 'burn_badge');
    assert.equal(r.ok && r.event.orderId, 'order-123');
  });

  it('parses theme and spotlight events with their extras', () => {
    const theme = parseBurnEvent(
      lsPayload({ custom: { product: 'burn_theme', theme: 'copium' } }),
    );
    assert.equal(theme.ok && theme.event.theme, 'copium');
    const spot = parseBurnEvent(
      lsPayload({
        custom: { product: 'burn_spotlight', bid_amount_cents: '750' },
      }),
    );
    assert.equal(spot.ok && spot.event.bidCents, 750);
  });

  it('ignores non-order events instead of erroring', () => {
    const r = parseBurnEvent(lsPayload({ eventName: 'subscription_created' }));
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.error.startsWith('ignored:'));
  });

  it('rejects missing order id, unknown product, bad company id, bad email', () => {
    assert.equal(
      parseBurnEvent({ meta: { event_name: 'order_created', custom_data: {} }, data: {} }).ok,
      false,
    );
    assert.equal(
      parseBurnEvent(lsPayload({ custom: { product: 'vapor_rescan' } })).ok,
      false,
    );
    assert.equal(
      parseBurnEvent(lsPayload({ custom: { company_id: 'not-a-uuid' } })).ok,
      false,
    );
    assert.equal(
      parseBurnEvent(lsPayload({ custom: { email: 'not-an-email' } })).ok,
      false,
    );
  });

  it('rejects unpurchasable themes and sub-minimum bids', () => {
    assert.equal(
      parseBurnEvent(
        lsPayload({ custom: { product: 'burn_theme', theme: 'terminal' } }),
      ).ok,
      false,
    );
    assert.equal(
      parseBurnEvent(
        lsPayload({
          custom: { product: 'burn_spotlight', bid_amount_cents: '499' },
        }),
      ).ok,
      false,
    );
  });
});

describe('applyBurnEvent — idempotency and grants', () => {
  let calls: string[];

  beforeEach(() => {
    calls = [];
    _resetBurnBillingState();
  });

  it('grants a badge via upsert, then treats a replay as duplicate', async () => {
    const db = createFakeDb({}, calls);
    const first = await applyBurnEvent(parsedBadge(), db);
    assert.deepEqual(first, { handled: true, action: 'granted' });
    assert.ok(
      calls.some((c) =>
        c.startsWith(
          `badges.upsert:{"company_id":"${COMPANY_ID}","type":"verified_burner","ls_order_id":"order-123"}`,
        ),
      ),
    );

    const before = calls.length;
    const replay = await applyBurnEvent(parsedBadge(), db);
    assert.deepEqual(replay, { handled: true, action: 'duplicate' });
    assert.equal(calls.length, before, 'replay must not touch the DB');
  });

  it('revokes a badge by order id on refund', async () => {
    const db = createFakeDb({}, calls);
    const refund: ParsedBurnEvent = { ...parsedBadge(), eventName: 'order_refunded' };
    const out = await applyBurnEvent(refund, db);
    assert.deepEqual(out, { handled: true, action: 'revoked' });
    assert.ok(calls.includes('badges.delete.eq:ls_order_id=order-123'));
  });

  it('grants and revokes a theme by updating companies.report_card_theme', async () => {
    const db = createFakeDb({}, calls);
    const grant: ParsedBurnEvent = {
      ...parsedBadge(),
      product: 'burn_theme',
      theme: 'doom',
    };
    assert.deepEqual(await applyBurnEvent(grant, db), {
      handled: true,
      action: 'granted',
    });
    assert.ok(
      calls.includes('companies.update:{"report_card_theme":"doom"}'),
    );

    const refund: ParsedBurnEvent = { ...grant, eventName: 'order_refunded' };
    assert.deepEqual(await applyBurnEvent(refund, db), {
      handled: true,
      action: 'revoked',
    });
    assert.ok(
      calls.includes('companies.update:{"report_card_theme":"terminal"}'),
    );
  });

  it('records a spotlight bid against the current week and recomputes the top', async () => {
    const db = createFakeDb(
      {
        spotlight_auctions: {
          maybeSingle: () => ({ data: null, error: null }),
        },
        spotlight_bids: {
          limit: () => ({
            data: [{ company_id: COMPANY_ID, amount: '7.50' }],
            error: null,
          }),
        },
      },
      calls,
    );
    const bid: ParsedBurnEvent = {
      ...parsedBadge(),
      product: 'burn_spotlight',
      bidCents: 750,
      orderId: 'order-777',
    };
    const out = await applyBurnEvent(
      bid,
      db,
      new Date('2026-09-20T12:00:00Z'),
    );
    assert.deepEqual(out, { handled: true, action: 'granted' });
    // New weekly auction row…
    assert.ok(
      calls.some((c) => c.includes('spotlight_auctions.insert:{"week_start":"2026-09-14"')),
    );
    // …the bid, keyed by order id…
    assert.ok(
      calls.some((c) =>
        c.includes('"company_id":"11111111-1111-4111-8111-111111111111","amount":7.5,"ls_order_id":"order-777"'),
      ),
    );
    // …and the top-bid recompute.
    assert.ok(
      calls.some((c) => c.includes('spotlight_auctions.update:{"current_bid":7.5')),
    );
  });

  it('removes the refunded bid and recomputes on spotlight refund', async () => {
    const db = createFakeDb(
      {
        spotlight_auctions: {
          maybeSingle: () => ({ data: { id: 'auction-1' }, error: null }),
          limit: () => ({ data: [], error: null }),
        },
      },
      calls,
    );
    const refund: ParsedBurnEvent = {
      ...parsedBadge(),
      eventName: 'order_refunded',
      product: 'burn_spotlight',
      bidCents: 750,
      orderId: 'order-777',
    };
    const out = await applyBurnEvent(refund, db);
    assert.deepEqual(out, { handled: true, action: 'revoked' });
    assert.ok(calls.includes('spotlight_bids.delete.eq:ls_order_id=order-777'));
    // No bids left → top resets to zero.
    assert.ok(
      calls.some((c) =>
        c.includes('spotlight_auctions.update:{"current_bid":0,"current_holder_id":null}'),
      ),
    );
  });
});

describe('webhook signature on the burn path', () => {
  const SECRET = 'whsec_burn_test';
  const body = Buffer.from(
    JSON.stringify(lsPayload({ orderId: 'order-999' })),
    'utf8',
  );
  const sign = (b: Buffer) =>
    crypto.createHmac('sha256', SECRET).update(b).digest('hex');

  it('accepts a valid signature', () => {
    assert.equal(verifyWebhookSignature(body, sign(body), SECRET), true);
  });

  it('rejects a tampered signature and a tampered body', () => {
    const bad = sign(body).replace(/^./, sign(body)[0] === 'a' ? 'b' : 'a');
    assert.equal(verifyWebhookSignature(body, bad, SECRET), false);
    const other = Buffer.from(JSON.stringify({ nope: true }), 'utf8');
    assert.equal(verifyWebhookSignature(other, sign(body), SECRET), false);
  });

  it('treats a re-delivered event as a replay at the ledger level', async () => {
    _resetBurnBillingState();
    const calls: string[] = [];
    const db = createFakeDb({}, calls);
    const event: ParsedBurnEvent = {
      ...parsedBadge(),
      orderId: 'order-999',
    };
    const first = await applyBurnEvent(event, db);
    assert.equal(first.handled, true);
    assert.equal(first.handled && first.action, 'granted');
    const second = await applyBurnEvent(event, db);
    assert.equal(second.handled, true);
    assert.equal(second.handled && second.action, 'duplicate');
  });
});
