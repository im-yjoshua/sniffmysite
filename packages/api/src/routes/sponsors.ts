import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
  approveSponsor,
  isSponsorStatus,
  listActiveSponsors,
  listSponsors,
  rejectSponsor,
  type SponsorStatus,
} from '../lib/sponsors';
import { rateLimit } from '../lib/security';

/**
 * Sponsor routes — rentable homepage banner slots.
 * Mounted at `/api/vapor` (so public = GET /api/vapor/sponsors,
 * admin = /api/vapor/admin/sponsors/*).
 *
 * - GET  /sponsors                    public: approved + in-window only,
 *                                     oldest-first, no buyer email / order id
 * - GET  /admin/sponsors              all records, optional ?status=
 * - POST /admin/sponsors/:id/approve  body optional { starts_at } → window
 *                                     starts now by default
 * - POST /admin/sponsors/:id/reject
 *
 * ALL /admin/* routes are gated by a constant-time token comparison:
 * client sends `x-admin-token`, server compares against ADMIN_TOKEN.
 * ADMIN_TOKEN unset → 503 on every admin route. The token never appears
 * in frontend source, docs, or commits (see README "Admin token").
 */
export const sponsorsRouter = Router();

/** True (and calls next) when the admin token checks out. */
function adminGuard(req: Request, res: Response, next: () => void): void {
  const expected = (process.env.ADMIN_TOKEN ?? '').trim();
  if (!expected) {
    res.status(503).json({
      error: 'admin_not_configured',
      detail:
        'The admin token is not set on the server. Set ADMIN_TOKEN on the server and try again.',
    });
    return;
  }
  const given = (req.get('x-admin-token') ?? '').trim();
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'invalid_admin_token' });
    return;
  }
  next();
}

sponsorsRouter.get(
  '/sponsors',
  // Cheap in-memory read; same anti-scrape floor as the leaderboard.
  rateLimit('vapor-sponsors', 300, 3_600_000),
  (_req: Request, res: Response) => {
    res.json({ sponsors: listActiveSponsors() });
  },
);

const adminRouter = Router();
adminRouter.use(rateLimit('vapor-admin', 60, 3_600_000));
adminRouter.use((req: Request, res: Response, next: () => void) =>
  adminGuard(req, res, next),
);

adminRouter.get('/sponsors', (req: Request, res: Response) => {
  const status = (req.query.status ?? '').toString().trim();
  if (status && !isSponsorStatus(status)) {
    return res.status(400).json({
      error: 'invalid_status',
      detail: 'status must be pending_approval, approved, or rejected.',
    });
  }
  res.json({ sponsors: listSponsors((status || undefined) as SponsorStatus | undefined) });
});

adminRouter.post('/sponsors/:id/approve', (req: Request, res: Response) => {
  const startsAt = req.body?.starts_at;
  let startsAtMs: number | null = null;
  if (startsAt !== undefined) {
    if (typeof startsAt !== 'string' || Number.isNaN(Date.parse(startsAt))) {
      return res.status(400).json({
        error: 'invalid_starts_at',
        detail: 'starts_at must be an ISO date string.',
      });
    }
    startsAtMs = Date.parse(startsAt);
  }
  const record = approveSponsor(req.params.id, startsAtMs);
  if (!record) {
    return res.status(404).json({ error: 'sponsor_not_found' });
  }
  console.log(
    `[sponsors] approved ${record.id} (${record.brand_name}) — window ${record.starts_at} → ${record.ends_at}`,
  );
  res.json({ sponsor: record });
});

adminRouter.post('/sponsors/:id/reject', (req: Request, res: Response) => {
  const record = rejectSponsor(req.params.id);
  if (!record) {
    return res.status(404).json({ error: 'sponsor_not_found' });
  }
  console.log(`[sponsors] rejected ${record.id} (${record.brand_name})`);
  res.json({ sponsor: record });
});

sponsorsRouter.use('/admin', adminRouter);
