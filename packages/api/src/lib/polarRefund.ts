/**
 * Polar refunds for stale throne bids (Phase B7 hardening).
 *
 * When a throne quote goes stale (the throne moved past the quoted price
 * while the buyer was on Polar's checkout page), the bid is never
 * installed — and the buyer is refunded in full, automatically. This
 * module wraps Polar's refund API with a reconciliation read so a
 * redelivered webhook can never double-refund:
 *
 *   alreadyRefunded(orderId) → true when Polar holds a pending/succeeded
 *   refund for the order → skip creation, just mark our row refunded.
 *
 * Raw REST (no SDK dependency), like polarCheckout.ts. Requires
 * POLAR_ACCESS_TOKEN with the refunds:write scope.
 */

export class PolarRefundNotConfiguredError extends Error {
  constructor() {
    super('polar refunds not configured: set POLAR_ACCESS_TOKEN (refunds:write)');
    this.name = 'PolarRefundNotConfiguredError';
  }
}

export class PolarRefundError extends Error {
  readonly status: number;
  constructor(status: number, what: string) {
    super(`polar refund ${what} failed (status ${status})`);
    this.name = 'PolarRefundError';
    this.status = status;
  }
}

export interface PolarRefundClient {
  /** True when Polar already has a pending or succeeded refund for the order. */
  alreadyRefunded(orderId: string): Promise<boolean>;
  /** Full refund of a stale throne bid. Never throws for a duplicate. */
  refundOrder(orderId: string, amountCents: number): Promise<void>;
}

const POLAR_API = 'https://api.polar.sh/v1/refunds/';

const STALE_COMMENT =
  'Throne bid went stale: the throne moved past the quoted price while the buyer was paying. Throne not granted — full refund.';

function authHeaders(): Record<string, string> {
  const token = (process.env.POLAR_ACCESS_TOKEN ?? '').trim();
  if (!token) throw new PolarRefundNotConfiguredError();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function polarRefundClient(
  fetchFn: typeof fetch = fetch,
): PolarRefundClient {
  return {
    async alreadyRefunded(orderId: string): Promise<boolean> {
      // Auth first, outside try/catch: a missing token is a config error,
      // not a lookup failure.
      const headers = authHeaders();
      let res: Response;
      try {
        res = await fetchFn(
          `${POLAR_API}?order_id=${encodeURIComponent(orderId)}&limit=10`,
          { headers },
        );
      } catch {
        throw new PolarRefundError(0, 'lookup');
      }
      if (!res.ok) throw new PolarRefundError(res.status, 'lookup');
      const body = (await res.json()) as {
        items?: Array<{ status?: unknown }>;
      };
      const items = Array.isArray(body.items) ? body.items : [];
      return items.some(
        (r) => r.status === 'succeeded' || r.status === 'pending',
      );
    },

    async refundOrder(orderId: string, amountCents: number): Promise<void> {
      // Reconcile first: a redelivered webhook must never double-refund.
      if (await this.alreadyRefunded(orderId)) return;
      const headers = authHeaders();
      let res: Response;
      try {
        res = await fetchFn(POLAR_API, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            order_id: orderId,
            amount: Math.max(1, Math.round(amountCents)),
            reason: 'other',
            comment: STALE_COMMENT,
          }),
        });
      } catch {
        throw new PolarRefundError(0, 'creation');
      }
      if (!res.ok) throw new PolarRefundError(res.status, 'creation');
    },
  };
}
