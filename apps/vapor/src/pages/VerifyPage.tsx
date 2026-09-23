import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, RotateCcw, ShieldCheck } from 'lucide-react';
import {
  requestClaimToken,
  checkClaim,
  ScanApiError,
  type ApiClaimToken,
  type ApiClaimVerify,
} from '../lib/api';

type Phase = 'enter' | 'instructions' | 'checking' | 'unverified' | 'verified' | 'error';

/** Mirror of the server's email shape — only well-formed values leave. */
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface PageError {
  title: string;
  detail: string;
}

/** Plain-language copy for every claim outcome. */
function reasonCopy(reason: ApiClaimVerify['reason']): PageError {
  switch (reason) {
    case 'expired':
      return {
        title: 'Your code expired.',
        detail:
          'Codes last 7 days. Get a fresh one and add it the same way.',
      };
    case 'token_not_found':
      return {
        title: 'We can\u2019t see your TXT record yet.',
        detail:
          'We looked and found nothing. Changes can take minutes — sometimes hours — to show up. Your code stays good for 7 days.',
      };
    case 'dns_error':
      return {
        title: 'We couldn\u2019t check your domain\u2019s records.',
        detail: 'Give it a minute and check again.',
      };
    case 'no_pending_claim':
    default:
      return {
        title: 'No claim started for this address.',
        detail: 'Ask for a code first — we give the code before we check.',
      };
  }
}

function toPageError(e: unknown): PageError {
  if (e instanceof ScanApiError) {
    if (e.code === 'startup_not_found') {
      return {
        title: 'Only ranked pages can be claimed.',
        detail:
          'If this page should be on the board, test it first — then claim it.',
      };
    }
    if (e.code === 'invalid_domain') {
      return {
        title: 'That doesn\u2019t look like a web address.',
        detail: 'Check it and try again.',
      };
    }
    if (e.code === 'lab_unreachable') {
      return {
        title: 'We couldn\u2019t reach the claim server.',
        detail: 'Check your connection and try again.',
      };
    }
    if (e.code === 'invalid_email') {
      return {
        title: 'That email doesn\u2019t look right.',
        detail: 'Fix it and try again — or leave it blank to skip the alerts.',
      };
    }
  }
  return {
    title: 'Something went wrong on our end.',
    detail: 'Nothing was filed, nothing was lost — try again.',
  };
}

/**
 * Claim the specimen (§2.3 `/verify`, Task 8).
 * DNS TXT ownership proof, staged as a lab custody procedure:
 * request token → publish record → check verification.
 */
export function VerifyPage() {
  const [params] = useSearchParams();
  const [domain, setDomain] = useState(params.get('domain') ?? '');
  const [phase, setPhase] = useState<Phase>('enter');
  const [claim, setClaim] = useState<ApiClaimToken | null>(null);
  const [failure, setFailure] = useState<PageError | null>(null);
  const [copied, setCopied] = useState<'host' | 'value' | null>(null);
  // Score-drop alerts (growth plan §3). The checkbox ships checked; the
  // plain-language copy next to it is what makes that acceptable.
  const [alertEmail, setAlertEmail] = useState('');
  const [alertsOn, setAlertsOn] = useState(true);
  // Whether this claim went through WITH an alert email — drives the
  // verified-phase note. Never renders the address back from the server;
  // the response doesn't carry one.
  const [alertsRequested, setAlertsRequested] = useState(false);

  const requestToken = useCallback(async () => {
    const d = domain.trim();
    if (!d) return;
    const email = alertEmail.trim();
    if (email.length > 0 && !EMAIL_LIKE.test(email)) {
      setFailure({
        title: 'That email doesn\u2019t look right.',
        detail: 'Fix it and try again — or leave it blank to skip the alerts.',
      });
      setPhase('error');
      return;
    }
    setPhase('checking');
    setFailure(null);
    try {
      const c = await requestClaimToken(d, email || undefined, alertsOn);
      setAlertsRequested(email.length > 0 && alertsOn);
      setClaim(c);
      setPhase('instructions');
    } catch (e) {
      setAlertsRequested(false);
      setFailure(toPageError(e));
      setPhase('error');
    }
  }, [domain, alertEmail, alertsOn]);

  const checkVerification = useCallback(async () => {
    if (!claim) return;
    setPhase('checking');
    setFailure(null);
    try {
      const v = await checkClaim(claim.domain);
      if (v.verified) {
        setPhase('verified');
      } else {
        setFailure(reasonCopy(v.reason));
        setPhase('unverified');
      }
    } catch (e) {
      setFailure(toPageError(e));
      setPhase('error');
    }
  }, [claim]);

  const copyText = useCallback(async (text: string, which: 'host' | 'value') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-6 pb-20 pt-10 md:pt-14">
      <div className="border-b-2 border-ink pb-4">
        <p className="eyebrow text-ink-soft">
          Claim your listing
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight md:text-5xl">
          This page is yours? Prove it.
        </h1>
        <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-soft">
          Add a small note (a TXT record) to your domain&rsquo;s settings.
          That proves you own the site — then the listing is yours.
        </p>
      </div>

      {/* Step 1 — the domain. */}
      {(phase === 'enter' || phase === 'error') && (
        <section className="py-10 md:py-14" aria-label="Get your code">
          <p className="eyebrow text-ink-faint">
            Step 1 — type your web address
          </p>
          <form
            className="mt-4 flex max-w-xl flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              requestToken();
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="stripe.com"
                autoComplete="off"
                spellCheck={false}
                className="tap-target min-w-0 flex-1 border border-hairline bg-paper px-4 py-3 font-data text-base text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                aria-label="Web address to claim"
              />
              <button
                type="submit"
                disabled={!domain.trim()}
                className="tap-target bg-hazard px-6 py-3 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                Get my code
              </button>
            </div>
            <div className="border border-hairline px-4 py-3">
              <label
                htmlFor="alert-email"
                className="text-[13px] uppercase tracking-[0.2em] text-ink-faint"
              >
                Email for score-drop alerts (optional)
              </label>
              <input
                id="alert-email"
                type="email"
                value={alertEmail}
                onChange={(e) => setAlertEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                spellCheck={false}
                className="tap-target mt-2 w-full border border-hairline bg-paper px-4 py-3 font-data text-base text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
              />
              <label
                htmlFor="alert-opt-in"
                className="tap-target mt-1 flex cursor-pointer items-center gap-3"
              >
                <input
                  id="alert-opt-in"
                  type="checkbox"
                  checked={alertsOn}
                  onChange={(e) => setAlertsOn(e.target.checked)}
                  className="h-6 w-6 shrink-0 accent-hazard"
                />
                <span className="text-base leading-relaxed text-ink-soft">
                  Email me if this page&rsquo;s score drops by 10+ points.
                  One email per drop — never spam. Unsubscribe anytime with
                  one click.
                </span>
              </label>
            </div>
          </form>
          {phase === 'error' && failure && (
            <div className="mt-8 max-w-xl" role="alert">
              <p className="eyebrow text-hazard">
                That didn&rsquo;t work
              </p>
              <p className="mt-3 font-display text-2xl font-bold tracking-tight">
                {failure.title}
              </p>
              <p className="mt-2 text-lg leading-relaxed text-ink-soft">
                {failure.detail}
              </p>
            </div>
          )}
        </section>
      )}

      {phase === 'checking' && (
        <section className="py-20 md:py-28" aria-live="polite">
          <p className="font-data text-base text-ink-soft">
            <span
              className="mr-2 inline-block h-2 w-2 animate-pulse bg-hazard"
              aria-hidden="true"
            />
            Checking…
          </p>
          <p className="mt-3 text-[13px] uppercase tracking-[0.14em] text-ink-faint">
            This can take a few seconds.
          </p>
        </section>
      )}

      {/* Step 2 — publish the record. */}
      {(phase === 'instructions' || phase === 'unverified') && claim && (
        <div className="py-10 md:py-14">
          <section aria-label="Add the TXT record">
            <p className="eyebrow text-ink-faint">
              Step 2 — add this to your domain&rsquo;s settings
            </p>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-soft">
              Add a TXT record where you manage your domain (like Cloudflare
              or your registrar). Just this one spot:
            </p>
            <div className="mt-6 max-w-2xl space-y-3">
              <RecordLine
                label="Host"
                value={claim.txt_host}
                copied={copied === 'host'}
                onCopy={() => copyText(claim.txt_host, 'host')}
              />
              <RecordLine
                label="Value"
                value={claim.txt_value}
                copied={copied === 'value'}
                onCopy={() => copyText(claim.txt_value, 'value')}
              />
            </div>
            <ol className="mt-8 max-w-2xl list-none space-y-3 border-t border-hairline pt-6">
              {claim.instructions.map((step, i) => (
                <li key={i} className="flex gap-4">
                  <span className="font-data text-sm tabular-nums text-ink-faint">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <p className="text-lg leading-relaxed text-ink-soft">{step}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-faint">
              Your code expires{' '}
              {new Date(claim.expires_at).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              .
            </p>
          </section>

          {/* Step 3 — check. */}
          <section className="border-t border-hairline py-8 md:py-10" aria-label="Check verification">
            <p className="eyebrow text-ink-faint">
              Step 3 — we check
            </p>
            {phase === 'unverified' && failure && (
              <div className="mt-4 max-w-2xl" role="alert">
                <p className="font-display text-2xl font-bold tracking-tight">
                  {failure.title}
                </p>
                <p className="mt-2 text-lg leading-relaxed text-ink-soft">
                  {failure.detail}
                </p>
              </div>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <button
                type="button"
                onClick={checkVerification}
                className="tap-target flex items-center gap-2 bg-hazard px-6 py-3 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
              >
                <RotateCcw className="h-5 w-5" strokeWidth={2.25} />
                {phase === 'unverified' ? 'Check again' : 'Check now'}
              </button>
              <Link
                to={`/s/${claim.domain}`}
                className="tap-target inline-flex items-center font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
              >
                Back to the report
              </Link>
            </div>
          </section>
        </div>
      )}

      {/* Verified — the listing is yours. */}
      {phase === 'verified' && claim && (
        <section className="py-20 md:py-28" aria-live="polite">
          <p className="eyebrow text-hazard">
            <ShieldCheck className="mr-2 inline h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
            Claimed
          </p>
          <h2 className="mt-4 font-display text-4xl font-bold tracking-tight md:text-5xl">
            It&rsquo;s yours.
          </h2>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-soft">
            <span className="break-all font-data text-base text-ink">{claim.domain}</span>
            {' '}now belongs to you. Re-tests and the Certified Real audit
            unlock at checkout — your claim is saved either way.
          </p>
          {alertsRequested && (
            <p className="mt-4 max-w-xl border border-hairline px-4 py-3 text-base leading-relaxed text-ink-soft">
              We&rsquo;ll email you if this page&rsquo;s score drops. One email
              per drop — unsubscribe anytime.
            </p>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              to={`/s/${claim.domain}`}
              className="tap-target bg-hazard px-6 py-3 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
            >
              View the report
            </Link>
            <Link
              to="/"
              className="tap-target inline-flex items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
              Back to the start
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}

function RecordLine({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-stretch justify-between gap-3 border border-hairline px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] uppercase tracking-[0.2em] text-ink-faint">
          {label}
        </p>
        <p className="mt-1 break-all font-data text-base text-ink">{value}</p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="tap-target flex shrink-0 items-center gap-1.5 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink transition-colors hover:text-hazard"
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        {copied ? (
          <Check className="h-5 w-5" strokeWidth={2.25} />
        ) : (
          <Copy className="h-5 w-5" strokeWidth={2.25} />
        )}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
