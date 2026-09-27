import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { MeanderDivider } from '../components/seals/MeanderDivider';

/**
 * Pricing — one product, one button.
 *
 * The shop sells exactly ONE thing: the Featured Roast ($19, one time).
 * The button goes straight to Polar's hosted checkout — no API checkout,
 * no email capture, no accounts. Polar collects the email and the
 * website-url custom field; the webhook (A1) does the fulfillment.
 *
 * The law, stated twice so nobody misses it: paid money NEVER moves a
 * score. The pin is labeled paid; the score is earned in the open by the
 * same engine that judges everyone.
 */
const POLAR_CHECKOUT_URL =
  'https://buy.polar.sh/polar_cl_vGWoiToDhNX81DJJuQirCyn3MbwmTQ9cfZhuo02Ugt0';

const STEPS = [
  {
    n: 'I',
    title: 'Pay, and name your site.',
    body: 'At checkout you enter your site\u2019s address. That\u2019s the whole form.',
  },
  {
    n: 'II',
    title: 'Your site jumps the line.',
    body: 'Scanned first, roasted in full, and published for the crowd to see.',
  },
  {
    n: 'III',
    title: 'Pinned above the standings.',
    body: 'Your roast holds the top of the board for 7 days \u2014 clearly labeled as paid.',
  },
];

export function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pt-14">
      {/* Header row */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-ink pb-4">
        <p className="eyebrow text-ink-soft">The shop</p>
        <Link
          to="/"
          className="tap-target flex items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
          Back to the start
        </Link>
      </div>

      {/* The pitch */}
      <div className="max-w-3xl py-10 md:py-14">
        <h1 className="font-inscription text-5xl font-bold uppercase tracking-tight md:text-6xl">
          Buy the spotlight.
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-soft">
          Scanning is free. The standings are free. Sharing is free. There
          is exactly one thing money buys in this arena &mdash; and it
          isn&rsquo;t a score.
        </p>
      </div>

      <MeanderDivider className="mb-10 md:mb-14" />

      {/* The only product */}
      <section aria-labelledby="featured-roast" className="border-y border-hairline py-10 md:py-12">
        <p className="eyebrow text-ink-soft">The only product</p>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <h2
            id="featured-roast"
            className="font-inscription text-4xl font-bold uppercase tracking-tight md:text-5xl"
          >
            Featured Roast
          </h2>
          <p className="font-data text-4xl font-bold tabular-nums text-hazard">
            $19
          </p>
          <p className="font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-faint">
            One time &middot; no subscription
          </p>
        </div>

        <ol className="mt-8 grid gap-6 md:grid-cols-3 md:gap-8">
          {STEPS.map((s) => (
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
          <a
            href={POLAR_CHECKOUT_URL}
            className="tap-target inline-flex w-full items-center justify-center gap-2 bg-hazard px-8 py-4 font-data text-base font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep md:w-auto"
          >
            Get featured &mdash; $19
          </a>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-soft">
            Secure checkout by Polar. After payment your roast goes live on
            its own &mdash; nothing else to do, no emails to wait for.
          </p>
        </div>
      </section>

      {/* The law */}
      <section aria-labelledby="the-law" className="mt-14 md:mt-20">
        <p className="eyebrow text-ink-soft">The law</p>
        <h2
          id="the-law"
          className="mt-4 font-inscription text-4xl font-bold uppercase tracking-tight md:text-5xl"
        >
          Money can&rsquo;t buy a score.
        </h2>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          No amount of money moves a score &mdash; not by a point, not ever.
          The pin is labeled paid. The score is earned in the open, by the
          same engine that judges everyone. If cash could buy rank, the whole
          arena would be a joke. Not the funny kind.
        </p>
      </section>
    </main>
  );
}
