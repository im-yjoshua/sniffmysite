import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { MeanderDivider } from './seals/MeanderDivider';

/**
 * Shared shell for the legal pages (/terms, /privacy, /refunds).
 *
 * Legal copy stays plain — the Roman flavor lives in the eyebrow and
 * headings, never in the substance. Cinzel headings are uppercase and
 * never below 24px; body is Inter, big enough for a 90-year-old.
 */
export function LegalShell({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-ink pb-4">
        <p className="eyebrow text-ink-soft">{eyebrow}</p>
        <Link
          to="/"
          className="tap-target flex items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
          Back to the start
        </Link>
      </div>

      <div className="max-w-3xl py-10 md:py-14">
        <h1 className="font-inscription text-4xl font-bold uppercase tracking-tight md:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          {intro}
        </p>
        <p className="mt-4 font-data text-xs uppercase tracking-[0.22em] text-ink-faint">
          Last updated · 28 September 2026
        </p>
      </div>

      <MeanderDivider className="mb-10 md:mb-14" />

      <div className="max-w-3xl">{children}</div>
    </main>
  );
}

/** One numbered law: Cinzel heading, plain Inter body. */
export function Law({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="border-t-2 border-ink py-8 first:border-t-0 first:pt-0">
      <p
        className="font-inscription text-2xl font-bold text-hazard"
        aria-hidden="true"
      >
        {n}
      </p>
      <h2 className="mt-2 font-inscription text-2xl font-bold uppercase tracking-tight">
        {title}
      </h2>
      <div className="mt-3 space-y-4 text-lg leading-relaxed text-ink-soft">
        {children}
      </div>
    </section>
  );
}
