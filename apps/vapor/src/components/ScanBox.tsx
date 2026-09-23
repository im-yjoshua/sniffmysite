import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dices, FlaskConical } from 'lucide-react';
import { rollRandomSeed } from '../lib/randomSeeds';

interface ScanBoxProps {
  /** External seed: set when a leaderboard row's "test again" is clicked. */
  seedUrl: string;
  onSeedConsumed: () => void;
}

/**
 * The hero scan box (§2.3): URL input + the one CTA, "Test the page".
 * Hands off to the real engine — submits navigate to `/scan?url=…` where
 * Task 5's result page runs the live POST /api/vapor/scan flow.
 * (The Task 3 inline mock result was removed; the engine is real now.)
 */
export function ScanBox({ seedUrl, onSeedConsumed }: ScanBoxProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // A leaderboard "test again" click seeds the input and focuses it.
  useEffect(() => {
    if (seedUrl) {
      setUrl(seedUrl);
      setError('');
      onSeedConsumed();
      document.getElementById('scan-input')?.focus();
      document.getElementById('scan-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // onSeedConsumed is stable from the parent; seedUrl is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedUrl]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = url.trim();
    if (!cleaned || !cleaned.includes('.')) {
      setError('That doesn\u2019t look like a web address. Try something like example.ai.');
      return;
    }
    setError('');
    // The API requires an http(s) scheme; default bare domains to https.
    const withScheme = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
    navigate(`/scan?url=${encodeURIComponent(withScheme)}`);
  };

  return (
    <div className="w-full">
      {/* Stacks on small phones so the input and button never squeeze. */}
      <form
        onSubmit={onSubmit}
        className="flex w-full flex-col gap-3 sm:flex-row sm:gap-0"
        role="search"
        aria-label="Sniff a startup page"
      >
        <input
          id="scan-input"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="paste a startup's web address…"
          aria-label="Startup web address"
          className="tap-target min-w-0 flex-1 border border-ink bg-paper px-4 py-3.5 font-data text-base text-ink placeholder:text-ink-faint sm:border-r-0"
        />
        <button
          type="submit"
          className="tap-target flex shrink-0 items-center justify-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
        >
          <FlaskConical className="h-5 w-5" strokeWidth={2.25} />
          Sniff it
        </button>
      </form>

      {error && (
        <p className="mt-2 font-data text-sm text-hazard-ink" role="alert">
          {error}
        </p>
      )}

      <p className="mt-3 text-sm uppercase tracking-[0.14em] text-ink-faint">
        Free forever · No account · Scores are public, obviously
      </p>

      {/* The dice: one tap picks a famous startup page and tests it. */}
      <RandomSniffButton />
    </div>
  );
}

/**
 * "Feeling brave?" — rolls a random famous startup page from the curated
 * seed list (lib/randomSeeds.ts — the one file Joshua edits) and hands it
 * to the normal scan flow. Never picks the same site twice in a row
 * (sessionStorage, see rollRandomSeed). Exported so the scan page's empty
 * state can offer it too.
 */
export function RandomSniffButton() {
  const navigate = useNavigate();
  const [rolling, setRolling] = useState(false);
  const [line, setLine] = useState('');

  const roll = () => {
    if (rolling) return;
    const pick = rollRandomSeed();
    const lines = ['Consulting the nose…', 'Rolling the dice…'];
    setLine(lines[Math.floor(Math.random() * lines.length)]);
    setRolling(true);
    // A beat of theatre, then the normal scan flow takes over.
    window.setTimeout(() => {
      navigate(`/scan?url=${encodeURIComponent(pick.url)}`);
    }, 700);
  };

  if (rolling) {
    return (
      <p
        className="mt-4 font-data text-sm text-ink-soft"
        aria-live="polite"
      >
        <span
          className="mr-2 inline-block h-2 w-2 animate-pulse bg-hazard"
          aria-hidden="true"
        />
        {line}
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={roll}
      className="tap-target mt-4 inline-flex min-h-[44px] items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
      aria-label="Sniff a random famous startup page"
    >
      <Dices className="h-5 w-5" strokeWidth={2.25} />
      Feeling brave?
    </button>
  );
}
