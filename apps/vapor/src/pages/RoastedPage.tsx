import { Link } from 'react-router-dom';
import { ArrowLeft, Trophy } from 'lucide-react';
import { MeanderDivider } from '../components/seals/MeanderDivider';

/**
 * /roasted — the thank-you page.
 *
 * This is Polar's success URL (/roasted?checkout_id=…). The checkout_id
 * query param is DISPLAY-ONLY: it is never treated as proof of payment.
 * Fulfillment is webhook-driven (A1) — this page just welcomes the buyer
 * and says what happens next. So the copy never claims "payment
 * confirmed"; the receipt in their inbox does that.
 */
const NEXT = [
  {
    n: 'I',
    title: 'The scan runs first in line.',
    body: 'The moment payment clears, your site jumps the queue.',
  },
  {
    n: 'II',
    title: 'The roast is published.',
    body: 'Scored by the same engine as everyone. Written for the crowd.',
  },
  {
    n: 'III',
    title: 'The throne is yours — for now.',
    body: 'Your roast takes the throne for up to 3 days \u2014 labeled as paid, until someone outbids you by $3.',
  },
];

export function RoastedPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-ink pb-4">
        <p className="eyebrow text-ink-soft">The gates open</p>
        <Link
          to="/"
          className="tap-target flex items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
          Back to the start
        </Link>
      </div>

      <div className="max-w-3xl py-10 md:py-14">
        <span className="text-hazard" aria-hidden="true">
          <Trophy className="h-12 w-12" strokeWidth={1.5} />
        </span>
        <h1 className="mt-6 font-inscription text-5xl font-bold uppercase tracking-tight md:text-6xl">
          Your roast is entering the arena.
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-soft">
          Your site has been named. Give it a few minutes &mdash; the receipt
          in your inbox is your proof of payment, this page is just the
          welcome.
        </p>
      </div>

      <MeanderDivider className="mb-10 md:mb-14" />

      <section aria-label="What happens next">
        <p className="eyebrow text-ink-soft">What happens next</p>
        <ol className="mt-6 grid gap-6 md:grid-cols-3 md:gap-8">
          {NEXT.map((s) => (
            <li key={s.n} className="border-t-2 border-ink pt-4">
              <p
                className="font-inscription text-2xl font-bold text-hazard"
                aria-hidden="true"
              >
                {s.n}
              </p>
              <p className="mt-2 text-lg font-semibold leading-snug">
                {s.title}
              </p>
              <p className="mt-1 text-lg leading-relaxed text-ink-soft">
                {s.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-10">
          <Link
            to="/leaderboard"
            className="tap-target inline-flex w-full items-center justify-center gap-2 bg-hazard px-8 py-4 font-data text-base font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep md:w-auto"
          >
            Watch the Grand Hall
          </Link>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-soft">
            Your roast appears at the top of the board the moment it&rsquo;s
            ready. Paid money bought the spotlight &mdash; the score is still
            earned.
          </p>
        </div>
      </section>
    </main>
  );
}
