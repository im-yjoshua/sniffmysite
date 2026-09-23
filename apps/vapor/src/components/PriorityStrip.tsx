import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { fetchCredits } from '../lib/api';

export const PRIORITY_EMAIL_KEY = 'vaporrank_email';

/**
 * The priority lane strip on the lab report (Task 9, made real in Task 10).
 * Credits are keyed by email — no auth in the MVP. Shows the balance and
 * hands the email to the scan: the SERVER spends one credit inside the scan
 * and jumps the rate-limit line. A rejected scan never eats a credit.
 */
export function PriorityStrip({
  onPriorityScan,
  refreshSignal,
}: {
  onPriorityScan: (email: string) => void;
  /** Bump to re-read the balance — e.g. after the server spends a credit. */
  refreshSignal?: number;
}) {
  const [email, setEmail] = useState(
    () => window.localStorage.getItem(PRIORITY_EMAIL_KEY) ?? '',
  );
  const [credits, setCredits] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  useEffect(() => {
    if (!validEmail) {
      setCredits(null);
      return;
    }
    let cancelled = false;
    fetchCredits(email.trim())
      .then((c) => {
        if (!cancelled) setCredits(c.products.rescan);
      })
      .catch(() => {
        if (!cancelled) setCredits(null);
      });
    return () => {
      cancelled = true;
    };
  }, [email, validEmail, refreshSignal]);

  const spend = async () => {
    const trimmed = email.trim();
    window.localStorage.setItem(PRIORITY_EMAIL_KEY, trimmed);
    setNotice(null);
    // The server spends the credit inside the scan (Task 10) — the button
    // only shows when the balance is above zero, so this is a formality.
    try {
      const c = await fetchCredits(trimmed);
      if (c.products.rescan <= 0) {
        setCredits(0);
        setNotice('No priority re-tests left for this email.');
        return;
      }
      setCredits(c.products.rescan);
    } catch {
      // Balance check failed — let the server be the judge.
    }
    onPriorityScan(trimmed);
  };

  return (
    <section
      aria-label="Priority lane"
      className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-hairline py-4"
    >
      <span className="flex items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft">
        <Zap className="h-4 w-4 text-hazard" strokeWidth={2.25} />
        Priority lane
      </span>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="founder@yourstartup.com"
        autoComplete="email"
        aria-label="Your email"
        className="tap-target w-full max-w-64 border border-hairline bg-paper px-3 py-2 font-data text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-hazard"
      />
      {validEmail && credits !== null && (
        <span className="font-data text-sm tabular-nums text-ink-soft">
          {credits} priority re-test{credits === 1 ? '' : 's'} left
        </span>
      )}
      {validEmail && credits !== null && credits > 0 && (
        <button
          type="button"
          onClick={spend}
          className="tap-target bg-ink px-5 py-2.5 font-data text-sm font-bold uppercase tracking-[0.18em] text-paper transition-colors hover:bg-hazard disabled:cursor-wait disabled:opacity-60"
        >
          Re-test with priority
        </button>
      )}
      {validEmail && credits === 0 && (
        <Link
          to="/pricing"
          className="tap-target inline-flex items-center font-data text-sm font-medium uppercase tracking-[0.18em] text-hazard hover:underline"
        >
          Get priority →
        </Link>
      )}
      {notice && (
        <span role="alert" className="font-data text-sm text-hazard">
          {notice}
        </span>
      )}
    </section>
  );
}
