import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, RotateCcw, Swords } from 'lucide-react';
import { VSMedallion } from '../components/seals/VSMedallion';
import { TierMark } from '../components/seals/TierMark';
import { BattleTape } from '../components/BattleTape';
import { DuelVerdict } from '../components/DuelVerdict';
import { useCountUp } from '../hooks/useCountUp';
import { buildSniffOffChallenge } from '../lib/share';
import {
  scanUrl,
  ScanApiError,
  type ApiScanResult,
} from '../lib/api';
import { toLabError, hostnameOf, type LabError } from './ScanPage';

/**
 * The Duel: two pages enter, the score decides. Route `/battle`.
 * Runs two real POST /api/vapor/scan tests side by side — each counts
 * against the normal 30/hr scan budget (the UI says so honestly).
 *
 * The two sides are fully independent: per-side loading/error/result, so
 * one slow or broken scan never blocks the other. When both land, the
 * thumb falls — VICTOR (laurel) vs CONDEMNED (thumb-down) — over the
 * tale of the tape (all six checks, side by side), with an auto
 * "X DESTROYED Y" share card and a rematch button.
 *
 * Challenge links: /battle?a=stripe.com&b=lemonsqueezy.com pre-fills
 * both inputs and auto-runs the duel when both are valid and
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

/** Who takes it. Higher sniff score = more real = wins; null on a tie. */
function duelWinner(a: ApiScanResult, b: ApiScanResult): SideKey | null {
  if (a.sniff_score > b.sniff_score) return 'a';
  if (b.sniff_score > a.sniff_score) return 'b';
  return null;
}

/** Budget honesty for a battle side that hit the scan-budget wall. */
function budgetError(): LabError {
  return {
    title: 'Out of free tests.',
    detail:
      'A battle runs two tests, and each one counts against your 30 free tests per hour — this side hit the limit.',
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
  // One attempt counter PER SIDE. The two duels run independent scans, so a
  // result from side A must never be discarded just because side B started
  // after it. A single shared counter made the earlier side's result look
  // "stale" forever — one contender always stuck on "Sniffing...".
  const attempt = useRef<Record<SideKey, number>>({ a: 0, b: 0 });
  const challengeAutoRan = useRef(false);

  const setSide = (key: SideKey, s: SideState) =>
    key === 'a' ? setSideA(s) : setSideB(s);

  const runSide = async (key: SideKey, url: string) => {
    const id = ++attempt.current[key];
    setSide(key, { phase: 'loading' });
    try {
      const result = await scanUrl(url);
      if (attempt.current[key] !== id) return;
      setSide(key, { phase: 'done', result });
    } catch (e) {
      if (attempt.current[key] !== id) return;
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

  /** Rematch: same contenders, fresh judgment. Costs two fresh tests. */
  const rematch = () => {
    if (!urlA.trim() || !urlB.trim()) return;
    setFormError('');
    runSide('a', withScheme(urlA));
    runSide('b', withScheme(urlB));
    document
      .getElementById('battle-sides')
      ?.scrollIntoView({ block: 'start' });
  };

  const bothDone =
    sideA.phase === 'done' && sideB.phase === 'done';

  const winner = bothDone ? duelWinner(sideA.result, sideB.result) : null;

  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pt-14">
      <div className="border-b-2 border-ink pb-6">
        <p className="eyebrow text-ink-soft">Head to head</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-4">
          <h1 className="font-inscription text-5xl font-bold uppercase tracking-tight md:text-6xl">
            The Duel<span className="text-hazard">.</span>
          </h1>
          <VSMedallion size={88} className="text-hazard" title="Two pages enter — the score decides" />
        </div>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          Two pages enter. The score decides — no votes, no judges, no
          mercy. Each side gets a full test, run side by side.
        </p>
      </div>

      {/* The ring: two inputs, one button. */}
      <form onSubmit={onSubmit} className="mt-8">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="battle-a"
              className="font-data text-sm font-bold uppercase tracking-[0.18em] text-ink-soft"
            >
              Contender one
            </label>
            <input
              id="battle-a"
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
              htmlFor="battle-b"
              className="font-data text-sm font-bold uppercase tracking-[0.18em] text-ink-soft"
            >
              Contender two
            </label>
            <input
              id="battle-b"
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
            Begin the battle
          </button>
          <p className="text-[13px] uppercase tracking-[0.14em] text-ink-faint">
            Honest math: two tests — each counts against your 30 free tests
            per hour
          </p>
        </div>
      </form>

      {/* The verdict, once both tests land: the thumb has fallen. */}
      {bothDone && (
        <DuelVerdict a={sideA.result} b={sideB.result} onRematch={rematch} />
      )}

      {/* The gauntlet — challenge the loser to a rematch, publicly. */}
      {bothDone && (
        <ChallengeBlock a={sideA.result} b={sideB.result} />
      )}

      {/* The two sides: loading → error → result, independently. */}
      <div id="battle-sides" className="mt-10 grid scroll-mt-24 gap-8 md:grid-cols-2">
        <SideCard
          key="a"
          label="Contender one"
          url={urlA}
          state={sideA}
          onRetry={() => runSideAgain('a')}
          winner={winner}
          sideKey="a"
        />
        {/* On phones the sides stack — the medallion is the ring bell
            between them. Side by side on tablet/desktop it hides. */}
        <div className="flex items-center gap-4 md:hidden" aria-hidden="true">
          <span className="h-px flex-1 bg-hairline" />
          <VSMedallion size={56} className="text-hazard" />
          <span className="h-px flex-1 bg-hairline" />
        </div>
        <SideCard
          key="b"
          label="Contender two"
          url={urlB}
          state={sideB}
          onRetry={() => runSideAgain('b')}
          winner={winner}
          sideKey="b"
        />
      </div>

      {/* Tale of the tape — all six checks, side by side. */}
      {bothDone && <BattleTape a={sideA.result} b={sideB.result} />}

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
      <h2 className="mt-3 font-inscription text-3xl font-bold uppercase tracking-tight md:text-4xl">
        Think {hostB} can do better?
      </h2>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-soft">
        Post this battle and dare them to answer. The link replays the
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
  winner: SideKey | null;
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
          <span className="ml-3 text-hazard">Battle champion</span>
        )}
      </p>

      {state.phase === 'idle' && (
        <p className="mt-6 text-lg leading-relaxed text-ink-faint">
          Waiting for a page. Paste an address above and begin the battle.
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
          <h2 className="max-w-xl font-inscription text-2xl font-bold uppercase tracking-tight md:text-3xl">
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
              <TierMark tier={state.result.tier} size={72} />
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
