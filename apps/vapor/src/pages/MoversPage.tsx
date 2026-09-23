import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Copy,
  Check,
  TrendingDown,
  TrendingUp,
  FlaskConical,
} from 'lucide-react';
import {
  fetchMovers,
  ScanApiError,
  type ApiMoverRow,
  type ApiMovers,
  type MoversWindow,
} from '../lib/api';
import { RosetteBadge } from '../components/RosetteBadge';
import { SiteLogo } from '../components/SiteLogo';

/**
 * The weekly sniff report: biggest movers in the trailing window.
 * "Climbing" = biggest same-test score gains; "Face-plants" = biggest
 * drops. Every row is a real re-sniff — the API never compares across
 * algo versions, so a formula change can't pose as a product move.
 *
 * Thin windows render the API's honest "early days" note; empty sides
 * get a plain line, never padded rows. The "Copy the roundup" button
 * builds a postable social post in the lab's voice.
 */

const WINDOWS: Array<{ key: MoversWindow; label: string }> = [
  { key: '7d', label: 'This week' },
  { key: '30d', label: '30 days' },
];

/** Pre-written social post in the lab's voice. 5th-grade plain. */
export function buildRoundupPost(m: ApiMovers, origin: string): string {
  const span = m.window === '7d' ? "This week's" : 'This month\'s';
  const lines = [`${span} biggest movers on SniffMySite:`];
  const g = m.gainers[0];
  const l = m.losers[0];
  if (g) {
    lines.push(
      `Climbing: ${g.domain} up ${g.delta} (${g.old_score} to ${g.new_score}).`,
    );
  }
  if (l) {
    lines.push(
      `Face-plant: ${l.domain} down ${Math.abs(l.delta)} (${l.old_score} to ${l.new_score}).`,
    );
  }
  if (!g && !l) lines.push('Nobody moved. The internet held its breath.');
  lines.push(`Full board: ${origin}/movers`);
  return lines.join('\n');
}

function rowLink(row: ApiMoverRow): string {
  return row.has_profile
    ? `/s/${row.slug}`
    : `/scan?url=${encodeURIComponent(`https://${row.domain}`)}`;
}

function MoverRow({
  row,
  rank,
  up,
}: {
  row: ApiMoverRow;
  rank: number;
  up: boolean;
}) {
  return (
    <li>
      <Link
        to={rowLink(row)}
        title={`Open the ${row.domain} report`}
        className="tap-target group flex w-full items-center gap-3 border-b border-hairline py-4 transition-transform duration-150 hover:-translate-y-px focus:-translate-y-px sm:gap-4"
      >
        <span className="w-10 shrink-0 font-display text-lg font-bold tabular-nums text-ink-faint">
          {String(rank).padStart(2, '0')}
        </span>
        <SiteLogo domain={row.domain} size="md" />
        <span className="min-w-0 flex-1">
          <span
            className="block truncate font-display text-lg font-bold leading-tight tracking-tight"
            title={row.domain}
          >
            {row.domain}
          </span>
          <span className="block truncate font-data text-sm tabular-nums text-ink-faint">
            {row.old_score} → {row.new_score}
          </span>
        </span>
        <span
          className={`shrink-0 font-data text-xl font-bold tabular-nums ${
            up ? 'text-ink' : 'text-hazard'
          }`}
          title={`Score change: ${row.delta > 0 ? '+' : ''}${row.delta}`}
        >
          {row.delta > 0 ? '+' : ''}
          {row.delta}
        </span>
        <span className="hidden w-44 shrink-0 items-center justify-end gap-3 md:flex">
          <RosetteBadge tier={row.tier} size={44} />
        </span>
      </Link>
    </li>
  );
}

function MoverSection({
  title,
  icon,
  rows,
  up,
  emptyLine,
}: {
  title: string;
  icon: React.ReactNode;
  rows: ApiMoverRow[];
  up: boolean;
  emptyLine: string;
}) {
  return (
    <section aria-label={title} className="mt-12">
      <h2 className="flex items-center gap-3 font-display text-3xl font-bold tracking-tight md:text-4xl">
        <span className={up ? 'text-ink' : 'text-hazard'} aria-hidden="true">
          {icon}
        </span>
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-6 text-lg leading-relaxed text-ink-faint">
          {emptyLine}
        </p>
      ) : (
        <ol className="mt-6 border-t border-hairline">
          {rows.map((row, i) => (
            <MoverRow key={row.domain} row={row} rank={i + 1} up={up} />
          ))}
        </ol>
      )}
    </section>
  );
}

export function MoversPage() {
  const [win, setWin] = useState<MoversWindow>('7d');
  const [data, setData] = useState<ApiMovers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (w: MoversWindow) => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchMovers(w));
    } catch (e) {
      setData(null);
      setError(
        e instanceof ScanApiError
          ? 'The movers board would not load. Try again in a bit.'
          : 'Something broke on our end. Try again in a bit.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(win);
  }, [win, load]);

  const copyRoundup = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(
        buildRoundupPost(data, window.location.origin),
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the button stays, the user can retry.
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pt-14">
      <div className="border-b-2 border-ink pb-4">
        <p className="eyebrow text-ink-soft">The weekly sniff report</p>
        <h1 className="mt-3 font-display text-5xl font-bold tracking-tight md:text-6xl">
          Biggest movers<span className="text-hazard">.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          Who climbed, who face-planted. Every move below is a real re-sniff
          — same test, same nose. A lab formula change never counts as a
          move.
        </p>
      </div>

      {/* Window toggle + copy button */}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <div
          role="group"
          aria-label="Time window"
          className="inline-flex border border-ink"
        >
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => setWin(w.key)}
              aria-pressed={win === w.key}
              className={`tap-target px-5 py-3 font-data text-sm font-bold uppercase tracking-wider transition-colors ${
                win === w.key
                  ? 'bg-ink text-paper'
                  : 'bg-paper text-ink-soft hover:text-ink'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        {data && (
          <button
            type="button"
            onClick={copyRoundup}
            className="tap-target inline-flex items-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
          >
            {copied ? (
              <Check className="h-5 w-5" strokeWidth={2.25} />
            ) : (
              <Copy className="h-5 w-5" strokeWidth={2.25} />
            )}
            {copied ? 'Copied' : 'Copy the roundup'}
          </button>
        )}
      </div>

      {loading && (
        <div className="mt-12" aria-live="polite">
          <p className="font-data text-base text-ink-soft">
            <span
              className="mr-2 inline-block h-2 w-2 animate-pulse bg-hazard"
              aria-hidden="true"
            />
            Sniffing out the movers…
          </p>
        </div>
      )}

      {error && (
        <div className="mt-12" role="alert">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            The board is taking a nap.
          </h2>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-soft">
            {error}
          </p>
          <button
            type="button"
            onClick={() => load(win)}
            className="tap-target mt-6 inline-flex items-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
          >
            <FlaskConical className="h-5 w-5" strokeWidth={2.25} />
            Try again
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {data.note && (
            <p
              className="mt-8 border border-hairline bg-paper px-5 py-4 text-lg leading-relaxed text-ink-soft"
              aria-live="polite"
            >
              {data.note}
            </p>
          )}
          <MoverSection
            title="Climbing"
            icon={<TrendingUp className="h-8 w-8" strokeWidth={2.25} />}
            rows={data.gainers}
            up
            emptyLine="No climbs in this window. Everyone held their ground — suspiciously disciplined."
          />
          <MoverSection
            title="Face-plants"
            icon={<TrendingDown className="h-8 w-8" strokeWidth={2.25} />}
            rows={data.losers}
            up={false}
            emptyLine="No face-plants in this window. Either the internet got honest, or nobody got re-sniffed."
          />
          <p className="mt-10 text-[13px] uppercase tracking-[0.14em] text-ink-faint">
            {data.hosts_tracked}{' '}
            {data.hosts_tracked === 1 ? 'site' : 'sites'} with two sniffs{' '}
            {win === '7d' ? 'this week' : 'in the last 30 days'} · moves
            compare scans from the same test version only
          </p>
        </>
      )}

      <Link
        to="/"
        className="tap-target mt-12 inline-flex items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
        Back to the start
      </Link>
    </main>
  );
}
