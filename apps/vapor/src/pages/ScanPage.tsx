import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Languages, RotateCcw, Share2 } from 'lucide-react';
import { RosetteBadge } from '../components/RosetteBadge';
import { MetricBars } from '../components/MetricBars';
import { SharePopup } from '../components/SharePopup';
import { BadgeSnippet } from '../components/BadgeSnippet';
import { RandomSniffButton } from '../components/ScanBox';
import { PriorityStrip } from '../components/PriorityStrip';
import { TurnstileWidget } from '../components/TurnstileWidget';
import { useCountUp } from '../hooks/useCountUp';
import { SCORE_STORY } from '../lib/score-explainer';
import { scanUrl, ScanApiError, type ApiScanResult } from '../lib/api';
import { SNIFF_PHASES } from '../lib/sniff-phases';

type Phase = 'loading' | 'done' | 'error' | 'challenge';

export interface LabError {
  title: string;
  detail: string;
  /** Which control is the filled primary button: 'retry' (Try again) or
   *  'back' (Back to the start). Pointless retries get the back door. */
  primary: 'retry' | 'back';
}

/**
 * Every API failure code → plain-language lab voice. The table is keyed by
 * code so an unmapped code can never slip through silently — it falls back
 * to the generic entry. Never renders raw server text: the backend already
 * sanitizes, and the voice here is what the user reads.
 */
const LAB_ERRORS: Record<string, LabError> = {
  lab_unreachable: {
    title: 'We couldn\u2019t reach the tester.',
    detail: 'Check your internet connection and try again.',
    primary: 'retry',
  },
  request_timeout: {
    title: 'The tester is taking too long.',
    detail:
      'Your connection might be slow, or our lab is waking up. Try again.',
    primary: 'retry',
  },
  invalid_url: {
    title: 'That web address doesn\u2019t look right.',
    detail: 'Check the address for typos, then come back and sniff it.',
    primary: 'back',
  },
  invalid_email: {
    title: 'That email doesn\u2019t look right.',
    detail: 'Check it for typos and try again.',
    primary: 'back',
  },
  ssrf_blocked: {
    title: 'We can\u2019t test that address.',
    detail:
      'We only test public web pages — private and internal addresses are off limits, even for us.',
    primary: 'back',
  },
  dns_error: {
    title: 'That address doesn\u2019t exist.',
    detail:
      'The internet has no record of this domain. Check the spelling — one wrong letter and it\u2019s a ghost town.',
    primary: 'retry',
  },
  timeout: {
    title: 'The site took too long to answer.',
    detail:
      'We waited 8 seconds and gave up. The site might just be slow — sniff it again.',
    primary: 'retry',
  },
  too_many_redirects: {
    title: 'This site sent us in circles.',
    detail:
      'It kept redirecting and never landed anywhere. Try the homepage instead of a deep link.',
    primary: 'retry',
  },
  blocked: {
    title: 'This site blocked our nose.',
    detail:
      'Bot protection stopped us at the door — there\u2019s nothing to sniff through a wall. Try the homepage, or come back later.',
    primary: 'retry',
  },
  tls_error: {
    title: 'This site\u2019s security certificate looks broken.',
    detail:
      'Our nose won\u2019t go near a busted certificate. That\u2019s on the site owner to fix — nothing you can do from here.',
    primary: 'back',
  },
  empty_page: {
    title: 'The page came back empty.',
    detail:
      'There\u2019s nothing readable on it — it might need JavaScript to load. Try the homepage instead of a deep link.',
    primary: 'retry',
  },
  body_too_large: {
    title: 'This page is too enormous to sniff.',
    detail:
      'It\u2019s over our 2MB limit. Try a lighter page on the same site.',
    primary: 'back',
  },
  unsupported_content_type: {
    title: 'That\u2019s not a page we can read.',
    detail:
      'We only score web pages — that link points to a file or something else.',
    primary: 'back',
  },
  fetch_failed: {
    title: 'We couldn\u2019t reach this site.',
    detail:
      'Check the URL and sniff it again — the site might be down, or blocking visitors.',
    primary: 'retry',
  },
  rate_limited: {
    title: 'Slow down \u2014 the lab is busy.',
    detail: 'Too many tests in a short time. Wait a bit, then try again.',
    primary: 'retry',
  },
  no_credits: {
    title: 'No priority re-tests left.',
    detail:
      'This email is out of priority re-tests. Free tests still work fine.',
    primary: 'retry',
  },
  scan_failed: {
    title: 'Our tester hit a snag.',
    detail: 'Something broke on our side mid-test. Try again in a bit.',
    primary: 'retry',
  },
};

const FALLBACK_ERROR: LabError = {
  title: 'Something went wrong.',
  detail: 'Our tester hit a snag mid-test. Try again.',
  primary: 'retry',
};

/** Map API/network failures to plain-language lab voice. Never a stack trace. */
export function toLabError(e: unknown): LabError {
  if (e instanceof ScanApiError) {
    // http_error gets tailored advice: a 404 means "fix your URL", a 500
    // means "their server is down, wait it out".
    if (e.code === 'http_error') {
      const s = e.upstreamStatus;
      if (s === 404 || s === 410) {
        return {
          title: 'That page doesn\u2019t exist.',
          detail:
            'The site answered 404. Check the URL — or try the homepage instead of a deep link.',
          primary: 'retry',
        };
      }
      if (s !== null && s >= 500) {
        return {
          title: 'The site\u2019s server is having a bad day.',
          detail:
            'Nothing wrong with your URL — their server is down. Try again in a bit.',
          primary: 'retry',
        };
      }
      return {
        title: 'The site answered with an error.',
        detail:
          'It sent back an error instead of a page. Check the URL and try again.',
        primary: 'retry',
      };
    }
    return LAB_ERRORS[e.code] ?? FALLBACK_ERROR;
  }
  return FALLBACK_ERROR;
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * The scan result page (§2.3 `/scan?url=…`, Task 5).
 * A lab report, not a dashboard: hairline rules, big whitespace, mono data
 * type, and the rosette seal as the hero moment. Reveal sequence is staged —
 * the score counts up first, THEN the verdict seal slams in, like a lab
 * result being certified.
 */
export function ScanPage() {
  const [params] = useSearchParams();
  const rawUrl = (params.get('url') ?? '').trim();

  const [phase, setPhase] = useState<Phase>('loading');
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [result, setResult] = useState<ApiScanResult | null>(null);
  const [error, setError] = useState<LabError | null>(null);
  const [sealVisible, setSealVisible] = useState(false);
  /** Increments every time a scan finishes — refreshes the credit balance. */
  const [scanCount, setScanCount] = useState(0);
  /** True when the latest scan was paid for with a priority re-scan credit. */
  const [priorityUsed, setPriorityUsed] = useState(false);
  /** The share popup (download PNG · copy image · post it). */
  const [shareOpen, setShareOpen] = useState(false);
  /** Bumps to mount a fresh Turnstile widget for the over-budget challenge. */
  const [challengeKey, setChallengeKey] = useState(0);
  /** True when the challenge widget failed to load (script blocked/offline). */
  const [widgetFailed, setWidgetFailed] = useState(false);
  const attempt = useRef(0);

  // No upfront human check anymore: the first 30 tests each hour are free
  // and frictionless. The server answers 429 + turnstile_required when the
  // budget is spent — only then do we pop the challenge (see run()).
  const siteKey = (import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as
    | string
    | undefined;

  const run = useCallback(
    async (overrides?: {
      token?: string | null;
      email?: string | null;
    }) => {
      const id = ++attempt.current;
      setPhase('loading');
      setPhaseIdx(0);
      setResult(null);
      setError(null);
      setSealVisible(false);
      setShareOpen(false);
      setWidgetFailed(false);
      try {
        const r = await scanUrl(rawUrl, {
          turnstileToken: overrides?.token ?? null,
          priorityEmail: overrides?.email ?? null,
        });
        if (attempt.current !== id) return;
        setResult(r);
        setPhase('done');
        setShareOpen(true);
        setScanCount((c) => c + 1);
      } catch (e) {
        if (attempt.current !== id) return;
        // Over the free budget: the server asks for one human solve, which
        // buys 10 more tests. Pop the challenge instead of an error state.
        if (
          e instanceof ScanApiError &&
          e.code === 'rate_limited' &&
          e.turnstileRequired
        ) {
          setChallengeKey((k) => k + 1);
          setPhase('challenge');
          return;
        }
        setError(toLabError(e));
        setPhase('error');
        setScanCount((c) => c + 1);
      }
    },
    [rawUrl],
  );

  useEffect(() => {
    if (rawUrl) run();
  }, [run, rawUrl]);

  /** Priority lane: the credit is spent by the server, inside the scan. */
  const runPriority = useCallback(
    (email: string) => {
      setPriorityUsed(true);
      run({ email });
    },
    [run],
  );

  /** Retry after an error — the challenge phase handles budget issues. */
  const retry = useCallback(() => {
    run();
  }, [run]);

  // Cycle the §2.8 loading lines while the real engine works.
  useEffect(() => {
    if (phase !== 'loading') return;
    const t = window.setInterval(
      () => setPhaseIdx((i) => (i + 1) % SNIFF_PHASES.length),
      1500,
    );
    return () => window.clearInterval(t);
  }, [phase]);

  // Stage the reveal: count-up runs (~1200ms), then the seal slams in.
  // Under reduced motion the count-up is instant, so the seal lands at once.
  useEffect(() => {
    if (phase !== 'done') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setSealVisible(true);
      return;
    }
    const t = window.setTimeout(() => setSealVisible(true), 1350);
    return () => window.clearTimeout(t);
  }, [phase]);

  const shown = useCountUp(result?.sniff_score ?? 0, phase === 'done' && result !== null);

  /** The share popup POSTs the finished scan to /api/vapor/card (arbitrary
   * URLs have no profile, so the /og endpoint can't serve them). */
  const getCardBlob = useCallback(async (): Promise<Blob> => {
    if (!result) throw new Error('no result yet');
    const res = await fetch('/api/vapor/card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: hostnameOf(result.url),
        sniff_score: result.sniff_score,
        tier: result.tier,
        metrics: result.metrics,
        verdict: result.verdict,
        evidence: result.evidence,
      }),
    });
    if (!res.ok) throw new Error('card failed');
    return res.blob();
  }, [result]);

  if (!rawUrl) {
    return (
      <ReportShell>
        <div className="py-20 md:py-28">
          <p className="eyebrow text-hazard">
            Test failed
          </p>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight md:text-5xl">
            No web address entered.
          </h1>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-soft">
            We need a web address to test. Go back and paste a startup&rsquo;s
            page — or let the nose pick one for you.
          </p>
          <RandomSniffButton />
          <BackToLab />
        </div>
      </ReportShell>
    );
  }

  return (
    <ReportShell url={phase === 'done' && result ? result.url : rawUrl}>
      <PriorityStrip onPriorityScan={runPriority} refreshSignal={scanCount} />
      {phase === 'loading' && (
        <div className="py-20 md:py-28" aria-live="polite">
          <p className="eyebrow text-ink-faint">
            Sniffing
          </p>
          <p className="mt-2 break-all font-data text-base text-ink">
            {hostnameOf(rawUrl)}
          </p>
          <p className="mt-12 font-data text-base text-ink-soft">
            <span
              className="mr-2 inline-block h-2 w-2 animate-pulse bg-hazard"
              aria-hidden="true"
            />
            {SNIFF_PHASES[phaseIdx]}
          </p>
          <p className="mt-3 text-[13px] uppercase tracking-[0.14em] text-ink-faint">
            A real sniff takes a few seconds.
          </p>
        </div>
      )}

      {phase === 'challenge' && (
        <div className="py-20 md:py-28" role="alert">
          <p className="eyebrow text-hazard">
            Out of free tests
          </p>
          <h1 className="mt-4 max-w-2xl font-display text-4xl font-bold tracking-tight md:text-5xl">
            You&rsquo;ve used your 30 free tests this hour.
          </h1>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-soft">
            Prove you&rsquo;re human for 10 more.
          </p>
          {siteKey ? (
            widgetFailed ? (
              <>
                <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-soft">
                  The human check couldn&rsquo;t load. Check your connection,
                  then try the check again.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setWidgetFailed(false);
                    setChallengeKey((k) => k + 1);
                  }}
                  className="tap-target mt-6 inline-flex items-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
                >
                  <RotateCcw className="h-5 w-5" strokeWidth={2.25} />
                  Try the check again
                </button>
              </>
            ) : (
              <TurnstileWidget
                key={challengeKey}
                onToken={(token) => {
                  // One solve = 10 more tests; auto-retry the failed scan.
                  // A null token means the widget errored or expired.
                  if (token) run({ token });
                  else setWidgetFailed(true);
                }}
              />
            )
          ) : (
            <>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-soft">
                The human check isn&rsquo;t switched on in this build. Try
                again in a bit — your free tests reset every hour.
              </p>
              <button
                type="button"
                onClick={retry}
                className="tap-target mt-6 inline-flex items-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
              >
                <RotateCcw className="h-5 w-5" strokeWidth={2.25} />
                Try again
              </button>
            </>
          )}
          <div className="mt-8">
            <BackToLab />
          </div>
        </div>
      )}

      {phase === 'error' && error && (
        <div className="py-20 md:py-28" role="alert">
          <p className="eyebrow text-hazard">
            Test failed
          </p>
          <h1 className="mt-4 max-w-2xl font-display text-4xl font-bold tracking-tight md:text-5xl">
            {error.title}
          </h1>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-soft">
            {error.detail}
          </p>
          <p className="mt-2 break-all font-data text-sm text-ink-faint">
            {hostnameOf(rawUrl)}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            {error.primary === 'back' ? (
              <>
                <Link
                  to="/"
                  className="tap-target inline-flex items-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
                >
                  <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
                  Back to the start
                </Link>
                <button
                  type="button"
                  onClick={retry}
                  className="tap-target font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
                >
                  Try again anyway
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={retry}
                  className="tap-target flex items-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
                >
                  <RotateCcw className="h-5 w-5" strokeWidth={2.25} />
                  Try again
                </button>
                <BackToLab />
              </>
            )}
          </div>
        </div>
      )}

      {phase === 'done' && result && (
        <div aria-live="polite">
          {/* The verdict moment: number first, rosette seal second. */}
          <div className="flex flex-wrap items-end gap-x-8 gap-y-8 py-10 md:gap-x-12 md:py-14">
            <div>
              <p className="eyebrow text-ink-faint">
                The lab has spoken
              </p>
              <p className="mt-3 font-data text-8xl font-bold tabular-nums leading-none text-hazard md:text-9xl">
                {shown}
              </p>
              <p className="mt-3 max-w-xs text-base leading-relaxed text-ink-soft">
                Sniff Score — 0 is pure vapor, 100 is certified real. Higher
                means more real.
              </p>
            </div>
            {sealVisible && (
              <div className="pb-3">
                <RosetteBadge
                  key={result.snapshot_hash}
                  tier={result.tier}
                  size={128}
                />
              </div>
            )}
          </div>

          {/* The findings — the verdict, in plain words. */}
          <section className="border-t border-hairline py-8 md:py-10" aria-label="The findings">
            <p className="eyebrow text-ink-faint">
              The findings
            </p>
            <p className="mt-4 max-w-3xl font-display text-2xl font-bold leading-snug tracking-tight md:text-4xl">
              {result.verdict}
            </p>
            {result.evidence.language_note && (
              <p className="mt-5 flex max-w-3xl items-start gap-2.5 border border-hairline bg-paper px-4 py-3 text-base leading-relaxed text-ink-soft">
                <Languages className="mt-0.5 h-5 w-5 shrink-0 text-hazard" strokeWidth={2.25} aria-hidden="true" />
                <span>
                  <span className="font-data text-sm font-bold uppercase tracking-wider">Lab note — </span>
                  {result.evidence.language_note}. The score above comes from
                  the checks that work in any language.
                </span>
              </p>
            )}
          </section>

          {/* Show your work — six smell checks, findings first. */}
          <section className="border-t border-hairline py-8 md:py-10" aria-label="Show your work">
            <p className="eyebrow text-ink-faint">
              Show your work
            </p>
            <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-soft">
              {SCORE_STORY}
            </p>
            <MetricBars metrics={result.metrics} />
          </section>

          {/* Spread the word — the popup: download, copy, post. */}
          <section className="border-t border-hairline py-8 md:py-10" aria-label="Spread the word">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="tap-target inline-flex items-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
            >
              <Share2 className="h-5 w-5" strokeWidth={2.25} />
              Spread the word
            </button>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-soft">
              Download the card, copy the image, post it anywhere. Make it
              famous.
            </p>
          </section>

          {/* The badge — only offered to the top two tiers. */}
          <BadgeSnippet
            slug={hostnameOf(result.url).replace(/^www\./i, '')}
            sniffScore={result.sniff_score}
            tier={result.tier}
          />

          {/* Scan details — quiet mono meta line (§2.12). */}          <section className="border-t border-hairline py-6" aria-label="Scan details">
            <p className="break-all font-data text-sm leading-relaxed text-ink-faint">
              {hostnameOf(result.url)}
              {' · '}
              tested{' '}
              {new Date(result.scanned_at).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              {' · '}
              scoring {result.algo_version}
              {' · '}
              snapshot {result.snapshot_hash.slice(0, 12)}…
              {priorityUsed && (
                <>
                  {' · '}
                  <span className="text-hazard">priority test</span>
                </>
              )}
            </p>
            <Link
              to={`/s/${hostnameOf(result.url)}`}
              className="tap-target mt-4 inline-flex items-center font-data text-sm font-medium uppercase tracking-[0.18em] text-hazard hover:underline"
            >
              Full report →
            </Link>
          </section>
          {shareOpen && (
            <SharePopup
              domain={hostnameOf(result.url)}
              score={result.sniff_score}
              tier={result.tier}
              shareText={`${hostnameOf(result.url)} scored ${result.sniff_score}/100 on SniffMySite. Verdict: ${result.tier}.`}
              pageUrl={window.location.href}
              getImageBlob={getCardBlob}
              onClose={() => setShareOpen(false)}
            />
          )}
        </div>
      )}
    </ReportShell>
  );
}

/** Shared report chrome: report header row + "test another" exit. */
function ReportShell({ url, children }: { url?: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-ink pb-4">
        <p className="eyebrow text-ink-soft">
          Test report
        </p>
        <Link
          to="/"
          className="tap-target flex items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
          Sniff another
        </Link>
      </div>
      {url && (
        <p className="mt-4 break-all font-data text-sm text-ink-faint">
          testing: {hostnameOf(url)}
        </p>
      )}
      {children}
    </main>
  );
}

function BackToLab() {
  return (
    <Link
      to="/"
      className="tap-target mt-8 inline-flex items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
      Back to the start
    </Link>
  );
}
