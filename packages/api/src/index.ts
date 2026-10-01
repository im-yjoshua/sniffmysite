import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { vaporRouter } from './routes/vapor';
import { burnRouter } from './routes/burn';
import { billingRouter } from './routes/billing';
import { burnBillingRouter } from './routes/burn-billing';
import { sponsorsRouter } from './routes/sponsors';
import { initScanBudgets } from './lib/scan-budget';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

// One hop of trusted proxy: Render's TLS terminator. This makes `req.ip`
// the real client IP (not the proxy's), which the Task 10 rate limiter
// depends on. Safe: only the first X-Forwarded-For hop is trusted.
app.set('trust proxy', 1);

// CORS allowlist: only the two production domains + local dev.
// Tightened to production origins before launch (§1.5).
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

// Task 10 security headers (helmet 8 defaults, made deliberate):
//   CSP default-src 'self' · CORP same-origin (the OG share-card PNG route
//   overrides this per-response with `cross-origin` — cards are MEANT to be
//   hotlinked; see routes/vapor.ts) · X-Frame-Options SAMEORIGIN ·
//   nosniff · no-referrer · HSTS (honored on HTTPS at deploy) · no X-Powered-By.
app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
// Capture the raw body for webhook HMAC verification (Lemon Squeezy
// signs the raw bytes; express.json's parsed object can't be re-signed).
app.use(
  express.json({
    limit: '256kb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'vaporrank-burnrate-api',
    version: '0.1.0',
    time: new Date().toISOString(),
  });
});

// Namespaced product routers — one service, both products.
app.use('/api/vapor', vaporRouter);
app.use('/api/vapor', sponsorsRouter);
app.use('/api/burn', burnRouter);
// Billing serves the shared `/api/billing/*` (master plan §2.11) and the
// VaporRank namespace `/api/vapor/billing/*`. The router is stateless; both
// mounts share the same entitlement ledger in lib/billing.ts.
// BurnRate checkouts live at `/api/burn/billing/*` (Task 8); the webhook
// stays shared at /api/billing/webhook and dispatches burn products.
app.use('/api/billing', billingRouter);
app.use('/api/vapor/billing', billingRouter);
app.use('/api/burn/billing', burnBillingRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// Hydrate the durable scan budget before serving traffic (fixes #6).
// Fire-and-forget safe: a failure only logs, the budget keeps working
// in-memory.
initScanBudgets().catch((e) =>
  console.error('[api] scan-budget init failed:', e),
);

// Centralized error middleware (fixes #15): any route error forwarded via
// next(err) — including async rejections caught by asyncHandler — lands
// here as a JSON 500 instead of Express's default HTML page. The 500
// status is preserved because payment webhooks (Polar) depend on it for
// redelivery.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('[api] unhandled route error:', err);
    res.status(500).json({
      error: 'internal_error',
      detail: 'Something broke on our end. Try again in a bit.',
    });
  },
);

app.listen(PORT, () => {
  console.log(`[api] listening on :${PORT}`);
});
