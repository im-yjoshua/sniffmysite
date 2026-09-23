import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, RotateCcw, Swords } from 'lucide-react';
import { RosetteBadge } from '../components/RosetteBadge';
import { useCountUp } from '../hooks/useCountUp';
import { buildSniffOffChallenge } from '../lib/share';
import {
  scanUrl,
  ScanApiError,
  METRIC_META,
  type ApiScanResult,
  type MetricScores,
} from '../lib/api';
import { toLabError, hostnameOf, type LabError } from './ScanPage';

/**
 * The sniff-off: two pages, one nose (§2.12 depth feature, `/compare`).
 * Runs two real POST /api/vapor/scan tests side by side — each counts
 * against the normal 30/hr scan budget (the UI says so honestly).
 *
 * The two sides are fully independent: per-side loading/error/result, so
 * one slow or broken scan never blocks the other. Verdicts compare the
 * six smell-check metrics both scans return and surface the 2–3 biggest
 * gaps.
 *
 * Challenge links: /compare?a=stripe.com&b=lemonsqueezy.com pre-fills
 * both inputs and auto-runs the sniff-off when both are valid and
 * different. Invalid params show the normal form with a friendly error —
 * never a wasted scan. Once both sides land, a challenge block offers
 * pre-written X/LinkedIn posts plus a copy-link button that replays the
 * exact same matchup.
 */

type SideKey = 'a' | 'b';

type SideState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; result: ApiScanResult }
  | { phase: 'error'; error: LabError };

const IDLE: SideState = { phase: 'idle' };

/** The API needs a scheme; default bare domains to https (ScanBox rule). */
function withScheme(raw: string): string {
  const cleaned = raw.trim();
  return /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
}

/**
 * Canonical form for the "same URL twice" check: lowercased host + path,
 * no scheme, no www, no trailing slash, no query/fragment.
 */
function canonical(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split(/[?#]/)[0].replace(/\/+$/, '');
  return s;
}

/** Budget honesty for a sniff-off side that hit the scan-budget wall. */
function budgetError(): LabError {
  return {
    title: 'Out of free tests.',
    detail:
      'A sniff-off runs two tests, and each one counts against your 30 free tests per hour — this side hit the limit.',
    primary: 'retry',
  };
}

export function ComparePage() {
  const [urlA, setUrlA] = useState('');
  const [urlB, setUrlB] = useState('');
  const [formError, setFormError] = useState('');
  const [sideA, setSideA] = useState<SideState>(IDLE);
  const [sideB, setSideB] = useState<SideState>(IDLE);
  const [searchParams] = useSearchParams();
  const attempt = useRef(0);
  const challengeAutoRan = useRef(false);

  const setSide = (key: SideKey, s: SideState) =>
    key === 'a' ? setSideA(s) : setSideB(s);

  const runSide = async (key: SideKey, url: string) => {
    const id = ++attempt.current;
    setSide(key, { phase: 'loading' });
    try {
      const result = await scanUrl(url);
      if (attempt.current !== id) return;
      setSide(key, { phase: 'done', result });
    } catch (e) {
      if (attempt.current !== id) return;
      setSide(
        key,
        e instanceof ScanApiError && e.code === 'rate_limited'
          ? { phase: 'error', error: budgetError() }
          : { phase: 'error', error: toLabError(e) },
      );
    }
  };

  const runSideAgain = (key: SideKey) => {
    const raw = key === 'a' ? urlA : urlB;
    if (!raw.trim()) return;
    runSide(key, withScheme(raw));
  };

  // Challenge links: pre-fill both inputs from ?a= and ?b=, then auto-run
  // when both are valid and different. Runs once, on mount only — invalid
  // params show the normal form with a friendly error, never a wasted scan.
  useEffect(() => {
    if (challengeAutoRan.current) return;
    challengeAutoRan.current = true;
    const rawA = (searchParams.get('a') ?? '').trim();
    const rawB = (searchParams.get('b') ?? '').trim();
    if (!rawA && !rawB) return;
    setUrlA(rawA);
    setUrlB(rawB);
    if (!rawA.includes('.') || !rawB.includes('.')) {
      setFormError(
        'That challenge link needs two real web addresses — like stripe.com and lemonsqueezy.com.',
      );
      return;
    }
    const fullA = withScheme(rawA);
    const fullB = withScheme(rawB);
    if (canonical(fullA) === canonical(fullB)) {
      setFormError(
        'That challenge lists the same page twice — pick two different pages to sniff off.',
      );
      return;
    }
    setFormError('');
    runSide('a', fullA);
    runSide('b', fullB);
    // Mount-only: runSide is intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rawA = urlA.trim();
    const rawB = urlB.trim();
    if (!rawA.includes('.') || !rawB.includes('.')) {
      setFormError(
        'Both sides need a real web address — something like stripe.com.',
      );
      return;
    }
    const fullA = withScheme(rawA);
    const fullB = withScheme(rawB);
    if (canonical(fullA) === canonical(fullB)) {
      // Same page twice: friendly error, zero scans wasted.
      setFormError(
        'You entered the same page twice — pick two different pages to sniff off.',
      );
      return;
    }
    setFormError('');
    runSide('a', fullA);
    runSide('b', fullB);
  };

  const bothDone =
    sideA.phase === 'done' && sideB.phase === 'done';

  const verdict = bothDone
    ? scoreDiffVerdict(sideA.result, sideB.result)
    : null;

  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pt-14">
      <div className="border-b-2 border-ink pb-4">
        <p className="eyebrow text-ink-soft">Head to head</p>
        <h1 className="mt-3 font-display text-5xl font-bold tracking-tight md:text-6xl">
          The sniff-off<span className="text-hazard">.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          Two pages. One nose. Paste two startup pages and find out which one
          smells worse. Each side gets a full test, run side by side.
        </p>
      </div>

      {/* The ring: two inputs, one button. */}
      <form onSubmit={onSubmit} className="mt-8">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="sniff-off-a"
              className="font-data text-sm font-bold uppercase tracking-[0.18em] text-ink-soft"
            >
              Page one
            </label>
            <input
              id="sniff-off-a"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={urlA}
              onChange={(e) => setUrlA(e.target.value)}
              placeholder="stripe.com"
              aria-label="First page's web address"
              className="tap-target mt-2 w-full border border-ink bg-paper px-4 py-3.5 font-data text-base text-ink placeholder:text-ink-faint"
            />
          </div>
          <div>
            <label
              htmlFor="sniff-off-b"
              className="font-data text-sm font-bold uppercase tracking-[0.18em] text-ink-soft"
            >
              Page two
            </label>
            <input
              id="sniff-off-b"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={urlB}
              onChange={(e) => setUrlB(e.target.value)}
              placeholder="notion.so"
              aria-label="Second page's web address"
              className="tap-target mt-2 w-full border border-ink bg-paper px-4 py-3.5 font-data text-base text-ink placeholder:text-ink-faint"
            />
          </div>
        </div>
        {formError && (
          <p className="mt-3 font-data text-sm text-hazard" role="alert">
            {formError}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button
            type="submit"
            className="tap-target inline-flex items-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
          >
            <Swords className="h-5 w-5" strokeWidth={2.25} />
            Start the sniff-off
          </button>
          <p className="text-[13px] uppercase tracking-[0.14em] text-ink-faint">
            Honest math: two tests — each counts against your 30 free tests
            per hour
          </p>
        </div>
      </form>

      {/* The verdict, once both tests land. */}
      {verdict && (
        <section className="mt-12 border-y-2 border-ink py-10" aria-live="polite">
          <p className="eyebrow text-ink-faint">The verdict</p>
          <h2 className="mt-3 max-w-3xl font-display text-3xl font-bold leading-snug tracking-tight md:text-5xl">
            {verdict.headline}
          </h2>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-soft">
            {verdict.subline}
          </p>
        </section>
      )}

      {/* The gauntlet — challenge the loser to a rematch, publicly. */}
      {bothDone && (
        <ChallengeBlock a={sideA.result} b={sideB.result} />
      )}

      {/* The two sides: loading → error → result, independently. */}
      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <SideCard
          key="a"
          label="Page one"
          url={urlA}
          state={sideA}
          onRetry={() => runSideAgain('a')}
          winner={verdict?.winner}
          sideKey="a"
        />
        {/* On phones the sides stack — this divider is the ring bell
            between them. Side by side on tablet/desktop it hides. */}
        <div className="flex items-center gap-4 md:hidden" aria-hidden="true">
          <span className="h-px flex-1 bg-hairline" />
          <span className="font-data text-sm font-bold uppercase tracking-[0.18em] text-hazard">
            VS
          </span>
          <span className="h-px flex-1 bg-hairline" />
        </div>
        <SideCard
          key="b"
          label="Page two"
          url={urlB}
          state={sideB}
          onRetry={() => runSideAgain('b')}
          winner={verdict?.winner}
          sideKey="b"
        />
      </div>

      {/* Where they differ most — derived from the six smell checks. */}
      {bothDone && <MetricDiffs a={sideA.result} b={sideB.result} />}

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

interface Verdict {
  headline: string;
  subline: string;
  /** 'a' | 'b' | null for a tie. */
  winner: SideKey | null;
}

/** Who takes it, in the lab's voice. Score: higher = more real. */
function scoreDiffVerdict(a: ApiScanResult, b: ApiScanResult): Verdict {
  const hostA = hostnameOf(a.url);
  const hostB = hostnameOf(b.url);
  if (a.sniff_score > b.sniff_score) {
    return {
      headline: `${hostA} takes the sniff-off.`,
      subline: `${a.sniff_score} to ${b.sniff_score}. ${hostB}'s page had more to hide — the nose noticed.`,
      winner: 'a',
    };
  }
  if (b.sniff_score > a.sniff_score) {
    return {
      headline: `${hostB} takes the sniff-off.`,
      subline: `${b.sniff_score} to ${a.sniff_score}. ${hostA}'s page had more to hide — the nose noticed.`,
      winner: 'b',
    };
  }
  return {
    headline: 'A dead tie. The nose shrugs.',
    subline: `Both pages scored ${a.sniff_score}. Come back with two pages that aren't equally suspicious.`,
    winner: null,
  };
}

/**
 * The two sides run independent scans, so one page can answer in a second
 * while the other chews through redirect chains. After ~15s with no
 * answer, say so quietly — an indefinite "Sniffing…" with no feedback
 * reads as broken. The 60s frontend hard timeout (lib/api.ts) still
 * resolves the side to the actionable error card, never a hang.
 */
function SlowSideNote() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 15_000);
    return () => clearTimeout(id);
  }, []);
  if (!slow) return null;
  return (
    <p className="mt-3 text-sm leading-relaxed text-ink-soft" aria-live="polite">
      Still working — some pages take a while to answer.
    </p>
  );
}

/**
 * The gauntlet: once both sides land, offer the pre-written challenge —
 * post to X, post to LinkedIn, or copy the challenge link (which replays
 * this exact matchup for anyone who opens it). Plain words, 44px targets.
 */
function ChallengeBlock({ a, b }: { a: ApiScanResult; b: ApiScanResult }) {
  const [copied, setCopied] = useState(false);
  const hostA = hostnameOf(a.url);
  const hostB = hostnameOf(b.url);
  const challenge = buildSniffOffChallenge(
    window.location.origin,
    hostA,
    a.sniff_score,
    hostB,
    b.sniff_score,
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(challenge.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the same link sits in the address bar.
    }
  };

  return (
    <section
      className="mt-10 border-y border-hairline py-8"
      aria-label="Challenge a founder"
    >
      <p className="eyebrow text-ink-faint">Throw down the gauntlet</p>
      <h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">
        Think {hostB} can do better?
      </h2>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-soft">
        Post this sniff-off and dare them to answer. The link replays the
        exact same matchup for anyone who opens it.
      </p>
      <blockquote className="mt-5 max-w-2xl border-l-2 border-hazard pl-4 text-lg leading-relaxed text-ink">
        {challenge.text}
      </blockquote>
      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href={challenge.xHref}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-target inline-flex min-h-[44px] items-center bg-hazard px-6 py-3 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
        >
          Post to X
        </a>
        <a
          href={challenge.linkedInHref}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-target inline-flex min-h-[44px] items-center border border-ink px-6 py-3 font-data text-sm font-bold uppercase tracking-wider text-ink transition-colors hover:border-hazard hover:text-hazard"
        >
          Post to LinkedIn
        </a>
        <button
          type="button"
          onClick={copyLink}
          className="tap-target inline-flex min-h-[44px] items-center gap-2 border border-hairline px-6 py-3 font-data text-sm font-bold uppercase tracking-wider text-ink transition-colors hover:border-hazard hover:text-hazard"
        >
          {copied ? (
            <Check className="h-5 w-5" strokeWidth={2.25} />
          ) : (
            <Copy className="h-5 w-5" strokeWidth={2.25} />
          )}
          {copied ? 'Copied' : 'Copy challenge link'}
        </button>
      </div>
    </section>
  );
}

function SideCard({
  label,
  url,
  state,
  onRetry,
  winner,
  sideKey,
}: {
  label: string;
  url: string;
  state: SideState;
  onRetry: () => void;
  winner: SideKey | null | undefined;
  sideKey: SideKey;
}) {
  const done = state.phase === 'done';
  const shown = useCountUp(
    done ? state.result.sniff_score : 0,
    done,
  );

  return (
    <section
      className="border-t border-hairline pt-6"
      aria-label={`${label}: ${state.phase}`}
      aria-live="polite"
    >
      <p className="eyebrow text-ink-faint">
        {label}
        {winner === sideKey && (
          <span className="ml-3 text-hazard">Sniff-off champion</span>
        )}
      </p>

      {state.phase === 'idle' && (
        <p className="mt-6 text-lg leading-relaxed text-ink-faint">
          Waiting for a page. Paste an address above and start the sniff-off.
        </p>
      )}

      {state.phase === 'loading' && (
        <div className="mt-6">
          <p className="break-all font-data text-base text-ink">
            {hostnameOf(url)}
          </p>
          <p className="mt-8 font-data text-base text-ink-soft">
            <span
              className="mr-2 inline-block h-2 w-2 animate-pulse bg-hazard"
              aria-hidden="true"
            />
            Sniffing…
          </p>
          <p className="mt-3 text-[13px] uppercase tracking-[0.14em] text-ink-faint">
            This side runs on its own — the other one won&rsquo;t wait for it.
          </p>
          <SlowSideNote />
        </div>
      )}

      {state.phase === 'error' && (
        <div className="mt-6" role="alert">
          <h2 className="max-w-xl font-display text-2xl font-bold tracking-tight md:text-3xl">
            {state.error.title}
          </h2>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-soft">
            {state.error.detail}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="tap-target mt-6 inline-flex items-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
          >
            <RotateCcw className="h-5 w-5" strokeWidth={2.25} />
            Sniff this side again
          </button>
        </div>
      )}

      {done && (
        <div>
          <p className="mt-6 break-all font-data text-base text-ink">
            {hostnameOf(state.result.url)}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-6">
            <p className="font-data text-7xl font-bold tabular-nums leading-none text-hazard">
              {shown}
            </p>
            <div className="flex items-center gap-3">
              <RosetteBadge tier={state.result.tier} size={72} />
              <span className="font-data text-sm font-bold uppercase tracking-[0.14em] text-ink">
                {state.result.tier}
              </span>
            </div>
          </div>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">
            {state.result.verdict}
          </p>
          <Link
            to={`/scan?url=${encodeURIComponent(state.result.url)}`}
            className="tap-target mt-5 inline-flex items-center font-data text-sm font-medium uppercase tracking-[0.18em] text-hazard hover:underline"
          >
            Full report →
          </Link>
        </div>
      )}
    </section>
  );
}

interface MetricDiff {
  key: keyof MetricScores;
  label: string;
  a: number;
  b: number;
  diff: number;
}

/**
 * The 2–3 biggest evidence gaps: compare each smell check's two scores,
 * rank by absolute gap. On every check a higher number means more
 * suspicious — so the gap's owner is named as the smellier one.
 */
function topMetricDiffs(a: ApiScanResult, b: ApiScanResult): MetricDiff[] {
  return METRIC_META.map((m) => {
    const av = a.metrics[m.key];
    const bv = b.metrics[m.key];
    return { key: m.key, label: m.label, a: av, b: bv, diff: Math.abs(av - bv) };
  })
    .filter((d) => d.diff > 0)
    .sort((x, y) => y.diff - x.diff)
    .slice(0, 3);
}

function MetricDiffs({ a, b }: { a: ApiScanResult; b: ApiScanResult }) {
  const hostA = hostnameOf(a.url);
  const hostB = hostnameOf(b.url);
  const diffs = topMetricDiffs(a, b);

  return (
    <section className="mt-12 border-t border-hairline pt-8" aria-label="Where they differ most">
      <p className="eyebrow text-ink-faint">Where they differ most</p>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-soft">
        The six smell checks, side by side. On every check, a higher number
        means more suspicious.
      </p>
      {diffs.length === 0 ? (
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
          Nothing — these two pages smell identical on all six checks. Spooky.
        </p>
      ) : (
        <div className="mt-6 space-y-0">
          {diffs.map((d) => {
            const smellier = d.a > d.b ? hostA : hostB;
            return (
              <div
                key={d.key}
                className="grid min-w-0 gap-2 border-t border-hairline py-5 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-6"
              >
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold tracking-tight">
                    {d.label}
                  </p>
                  <p className="mt-1 break-all font-data text-sm text-ink-soft">
                    {hostA} {d.a} · {hostB} {d.b}
                  </p>
                </div>
                <p className="break-all font-data text-sm font-bold uppercase tracking-[0.14em] text-hazard">
                  {smellier} smells worse here
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
