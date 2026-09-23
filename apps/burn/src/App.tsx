import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { SubmitPage } from './pages/SubmitPage';
import { CompanyPage } from './pages/CompanyPage';
import { ClaimPage } from './pages/ClaimPage';
import { PricingPage } from './pages/PricingPage';
import { BillingSuccessPage, BillingCancelPage } from './pages/BillingPages';
import { SpotlightPage } from './pages/SpotlightPage';
import { BoardPage } from './pages/BoardPage';

/**
 * Chat B routing (§3.3) — one route per task, growing with the build:
 *   Task 3 → `/`        Task 4 → `/list`        Task 5 → `/c/:slug`
 *   Task 7 → `/claim`   Task 8 → `/pricing`, `/billing/success`, `/billing/cancel`
 *   Task 9 → `/spotlight` (auction), `/board` (full rankings)
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/list" element={<SubmitPage />} />
        <Route path="/c/:slug" element={<CompanyPage />} />
        <Route path="/claim" element={<ClaimPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/billing/success" element={<BillingSuccessPage />} />
        <Route path="/billing/cancel" element={<BillingCancelPage />} />
        <Route path="/spotlight" element={<SpotlightPage />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <p className="font-data text-sm uppercase tracking-[0.22em] text-ember">404</p>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-text">
        This page burned down.
      </h1>
      <p className="mt-2 text-ash">It was mostly vibes anyway.</p>
      <Link
        to="/"
        className="mt-6 font-data text-xs uppercase tracking-[0.2em] text-ash underline-offset-4 hover:text-text hover:underline"
      >
        ← Back to the burn board
      </Link>
    </div>
  );
}
