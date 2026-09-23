import { Link } from 'react-router-dom';
import { Flame, FlameKindling } from 'lucide-react';
import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';

/**
 * Post-checkout pages (Task 8). Lemon Squeezy hosts the actual payment;
 * these are where the story continues. Entitlements land via webhook, so
 * both pages are honest about the (short) delay — nothing here claims a
 * purchase succeeded, because only the webhook knows.
 */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <SiteHeader />
      <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
        {children}
        <p className="mt-10">
          <Link
            to="/"
            className="font-data text-xs uppercase tracking-[0.2em] text-ash underline-offset-4 hover:text-ember hover:underline"
          >
            ← back to the board
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

export function BillingSuccessPage() {
  return (
    <Shell>
      <Flame className="h-10 w-10 text-ember" aria-hidden="true" />
      <h1 className="mt-6 font-display text-3xl font-bold tracking-tight md:text-4xl">
        Your money is now officially certified as burning.
      </h1>
      <p className="mt-4 max-w-md text-ash">
        Payment received. The badge, skin, or spotlight lands on your company
        page within a minute — the moment our webhook hears back. Refresh like
        it owes you money.
      </p>
      <p className="mt-4 font-data text-xs uppercase tracking-[0.2em] text-ash">
        test mode — no real money moved. the flame is still real.
      </p>
    </Shell>
  );
}

export function BillingCancelPage() {
  return (
    <Shell>
      <FlameKindling className="h-10 w-10 text-ash" aria-hidden="true" />
      <h1 className="mt-6 font-display text-3xl font-bold tracking-tight md:text-4xl">
        No charge. The burn continues, uncertified.
      </h1>
      <p className="mt-4 max-w-md text-ash">
        You backed out at the register. The money stays unburned, the badge
        stays unlit. The gift shop is open whenever the FOMO hits.
      </p>
      <p className="mt-6">
        <Link
          to="/pricing"
          className="inline-block border border-ember px-6 py-3 font-data text-xs font-bold uppercase tracking-[0.2em] text-ember transition-colors hover:bg-ember hover:text-bg"
        >
          Reconsider — $9
        </Link>
      </p>
    </Shell>
  );
}
