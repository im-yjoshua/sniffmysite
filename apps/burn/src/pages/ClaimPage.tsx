import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Flame, BadgeCheck, Copy, Check } from 'lucide-react';
import { SiteHeader } from '../components/SiteHeader';
import { TurnstileWidget } from '../components/TurnstileWidget';

/**
 * /claim — the founder claim flow (§3.9, Task 7).
 *
 * Two steps, no accounts:
 *   1. Email: pick a company (?company=<slug>), enter your email → magic link.
 *      The API always answers "check your inbox" (it never says which emails
 *      exist — opsec).
 *   2. DNS: click the magic link → API marks the claim email-verified and
 *      302s here (?claim=<uuid>) → add a TXT record
 *      `burnrate-verify=<challenge>` on your domain → hit verify. The API
 *      resolves your TXT records and marks the company claimed, which is
 *      what Task 8's Verified Burner badge ($9) gates on.
 *
 * API base: VITE_PUBLIC_API_BASE_URL, unset in local dev (Vite /api proxy).
 */

const API_BASE = (import.meta.env.VITE_PUBLIC_API_BASE_URL as string | undefined) ?? '';

interface CompanySummary {
  id: string;
  slug: string;
  name: string;
  domain: string;
  claimed: boolean;
}

interface ClaimStatus {
  claim_id: string;
  company: { id: string; slug: string; name: string; domain: string };
  email_verified: boolean;
  expired: boolean;
  claimed: boolean;
}

async function apiJson(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API_BASE}${path}`, init);
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON (proxies, 404 pages) — body stays null */
  }
  return { status: res.status, body };
}

function StepMark({ n, label, active }: { n: number; label: string; active: boolean }) {
  return (
    <span
      className={`font-data text-[11px] uppercase tracking-[0.22em] ${
        active ? 'text-ember' : 'text-ash'
      }`}
    >
      {n} · {label}
    </span>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-6 border-b border-ember/60 pb-4 font-data text-sm text-ember">
      {children}
    </p>
  );
}

function EmberButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 bg-ember px-6 py-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-bg transition-colors hover:bg-ember-deep disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/* ---------- step 1: email ---------- */

function EmailStep({ company }: { company: CompanySummary }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(undefined);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    if (busy) return;
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setError('That email won\u2019t survive the trip. Check it.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { status, body } = await apiJson('/api/burn/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: company.id, email: value, turnstileToken }),
      });
      if (status === 200 && body?.status === 'already_claimed') {
        setError('This burn is already spoken for.');
      } else if (status === 429) {
        setError('Whoa. One claim at a time — try again in a bit.');
      } else if (status >= 500) {
        setError('The furnace is offline. Try again later.');
      } else {
        // 200 check_your_inbox (the API always says this — opsec), and any
        // other 4xx lands here too: same screen, nothing leaked.
        setSent(true);
      }
    } catch {
      setError('The furnace is offline. Try again later.');
    } finally {
      setBusy(false);
    }
  }, [busy, email, company.id, turnstileToken]);

  if (sent) {
    return (
      <section className="py-10" aria-live="polite">
        <div className="flex items-center gap-6">
          <StepMark n={1} label="email" active={false} />
          <span className="font-data text-[11px] uppercase tracking-[0.22em] text-ash">→</span>
          <StepMark n={2} label="dns" active={false} />
        </div>
        <h1 className="mt-8 font-display text-4xl font-bold tracking-tight md:text-5xl">
          Check your inbox.
        </h1>
        <p className="mt-4 max-w-xl leading-relaxed text-ash">
          If that inbox belongs to a burner, a magic link is on its way. It expires in 24
          hours and works exactly once — then you prove you own the domain.
        </p>
        <p className="mt-4 font-data text-xs text-ash">
          nothing arrived? check spam, then request another link.
        </p>
      </section>
    );
  }

  return (
    <section className="py-10">
      <div className="flex items-center gap-6">
        <StepMark n={1} label="email" active />
        <span className="font-data text-[11px] uppercase tracking-[0.22em] text-ash">→</span>
        <StepMark n={2} label="dns" active={false} />
      </div>
      <h1 className="mt-8 font-display text-4xl font-bold tracking-tight md:text-5xl">
        Claim {company.name}&rsquo;s burn
      </h1>
      <p className="mt-3 max-w-xl leading-relaxed text-ash">
        Prove you&rsquo;re the one setting the money on fire. First your email, then a DNS
        record — no accounts, no passwords, no mercy.
      </p>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mt-6 divide-y divide-divider border-t border-divider">
        <div className="py-6">
          <span className="block font-data text-[11px] uppercase tracking-[0.22em] text-ash">
            work email
          </span>
          <p className="mt-1.5 text-sm leading-relaxed text-ash">
            The one on the domain you&rsquo;re claiming. We send one link, once.
          </p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="founder@stealthmode.lol"
            autoComplete="email"
            className="mt-3 w-full max-w-md border-b border-divider bg-transparent py-2 font-data text-lg text-text placeholder:text-ash/50 focus:border-ember focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-2">
        <TurnstileWidget onToken={setTurnstileToken} />
      </div>

      <div className="mt-6">
        <EmberButton onClick={submit} disabled={busy}>
          {busy ? 'Sending…' : 'Send the magic link'}
        </EmberButton>
      </div>
    </section>
  );
}

/* ---------- step 2: dns ---------- */

function DnsStep({ claim }: { claim: ClaimStatus }) {
  const [record, setRecord] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'claimed' | 'pending' | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiJson(`/api/burn/claim/${claim.claim_id}/dns`).then(({ status, body }) => {
      if (cancelled) return;
      if (status === 200 && body?.record_value) {
        setRecord(body.record_value as string);
      } else if (body?.status === 'already_claimed') {
        setResult('claimed');
      } else {
        setLoadError('Could not load the DNS instructions. Try reloading.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [claim.claim_id]);

  const copy = useCallback(async () => {
    if (!record) return;
    try {
      await navigator.clipboard.writeText(record);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the value is visible to copy manually */
    }
  }, [record]);

  const verify = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setVerifyError(null);
    try {
      const { status, body } = await apiJson('/api/burn/verify-dns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_id: claim.claim_id }),
      });
      if (status === 200 && (body?.status === 'claimed' || body?.status === 'already_claimed')) {
        setResult('claimed');
      } else if (status === 422) {
        setResult('pending');
        setVerifyError(
          body?.message ??
            'No matching TXT record found yet. DNS can take a few minutes — grab a coffee and try again.',
        );
      } else if (status === 429) {
        setVerifyError('Whoa. DNS is slow; hammering it won\u2019t help. Try again in a bit.');
      } else {
        setVerifyError('The furnace hiccuped. Try again.');
      }
    } catch {
      setVerifyError('The furnace is offline. Try again later.');
    } finally {
      setBusy(false);
    }
  }, [busy, claim.claim_id]);

  if (result === 'claimed') {
    return (
      <section className="py-16 text-center" aria-live="polite">
        <div className="inline-block -rotate-2 border-2 border-ember px-6 py-3">
          <span className="font-data text-sm font-bold uppercase tracking-[0.3em] text-ember">
            claimed
          </span>
        </div>
        <h1 className="mt-8 flex items-center justify-center gap-3 font-display text-4xl font-bold tracking-tight">
          <BadgeCheck className="h-8 w-8 text-ember" aria-hidden="true" />
          This burn is officially yours.
        </h1>
        <p className="mx-auto mt-4 max-w-md leading-relaxed text-ash">
          Email verified, domain proven. The Verified Burner flame badge drops soon — you&rsquo;re
          first in line.
        </p>
        <Link
          to={`/c/${claim.company.slug}`}
          className="mt-8 inline-block font-data text-xs uppercase tracking-[0.2em] text-ash underline-offset-4 hover:text-text hover:underline"
        >
          ← Back to {claim.company.name}
        </Link>
      </section>
    );
  }

  return (
    <section className="py-10">
      <div className="flex items-center gap-6">
        <StepMark n={1} label="email" active={false} />
        <span className="font-data text-[11px] uppercase tracking-[0.22em] text-ash">→</span>
        <StepMark n={2} label="dns" active />
      </div>
      <h1 className="mt-8 font-display text-4xl font-bold tracking-tight md:text-5xl">
        Email&rsquo;s good. Now the domain.
      </h1>
      <p className="mt-3 max-w-xl leading-relaxed text-ash">
        Add this TXT record to <span className="font-data text-text">{claim.company.domain}</span>.
        Anyone can fake an email — only the domain owner can fake DNS. (They can&rsquo;t. That&rsquo;s
        the point.)
      </p>

      {loadError ? (
        <ErrorNote>{loadError}</ErrorNote>
      ) : (
        <div className="mt-8 divide-y divide-divider border-y border-divider">
          <div className="flex items-center justify-between gap-4 py-4">
            <span className="font-data text-[11px] uppercase tracking-[0.22em] text-ash">type</span>
            <span className="font-data text-sm text-text">TXT</span>
          </div>
          <div className="flex items-center justify-between gap-4 py-4">
            <span className="font-data text-[11px] uppercase tracking-[0.22em] text-ash">host</span>
            <span className="font-data text-sm text-text">@</span>
          </div>
          <div className="py-4">
            <div className="flex items-center justify-between gap-4">
              <span className="font-data text-[11px] uppercase tracking-[0.22em] text-ash">
                value
              </span>
              <button
                onClick={copy}
                className="inline-flex items-center gap-1.5 font-data text-[11px] uppercase tracking-[0.18em] text-ash hover:text-text"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-ember" aria-hidden="true" /> copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" /> copy
                  </>
                )}
              </button>
            </div>
            <p className="mt-2 break-all font-data text-sm leading-relaxed text-ember">
              {record ?? 'loading…'}
            </p>
          </div>
        </div>
      )}

      {verifyError && <ErrorNote>{verifyError}</ErrorNote>}

      <div className="mt-8">
        <EmberButton onClick={verify} disabled={busy || !record}>
          {busy ? 'Reading your DNS…' : result === 'pending' ? 'Try verify again' : 'I\u2019ve added it — verify'}
        </EmberButton>
        <p className="mt-4 font-data text-xs text-ash">
          dns can take a few minutes to propagate. the furnace is patient.
        </p>
      </div>
    </section>
  );
}

/* ---------- page shell ---------- */

type PageState =
  | { kind: 'loading' }
  | { kind: 'link-error'; reason: 'expired' | 'invalid' }
  | { kind: 'email-step'; company: CompanySummary }
  | { kind: 'already-claimed'; name: string }
  | { kind: 'claim-status'; claim: ClaimStatus }
  | { kind: 'not-found' };

export function ClaimPage() {
  const [params] = useSearchParams();
  const companySlug = params.get('company');
  const claimId = params.get('claim');
  const linkError = params.get('claim_error');
  const [state, setState] = useState<PageState>({ kind: 'loading' });

  useEffect(() => {
    if (linkError === 'expired' || linkError === 'invalid') {
      setState({ kind: 'link-error', reason: linkError });
      return;
    }
    if (claimId) {
      if (!/^[0-9a-f-]{36}$/i.test(claimId)) {
        setState({ kind: 'not-found' });
        return;
      }
      let cancelled = false;
      apiJson(`/api/burn/claim/${claimId}/status`).then(({ status, body }) => {
        if (cancelled) return;
        if (status !== 200 || !body?.claim_id) {
          setState({ kind: 'not-found' });
          return;
        }
        setState({ kind: 'claim-status', claim: body as ClaimStatus });
      });
      return () => {
        cancelled = true;
      };
    }
    if (companySlug) {
      let cancelled = false;
      apiJson(`/api/burn/company/${encodeURIComponent(companySlug)}`).then(
        ({ status, body }) => {
          if (cancelled) return;
          if (status !== 200 || !body?.id) {
            setState({ kind: 'not-found' });
            return;
          }
          const company: CompanySummary = {
            id: body.id,
            slug: companySlug,
            name: body.name,
            domain: body.domain,
            claimed: body.claimed === true,
          };
          setState(
            company.claimed
              ? { kind: 'already-claimed', name: company.name }
              : { kind: 'email-step', company },
          );
        },
      );
      return () => {
        cancelled = true;
      };
    }
    setState({ kind: 'not-found' });
  }, [companySlug, claimId, linkError]);

  return (
    <div className="min-h-screen bg-bg text-text">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 pb-20 pt-12">
        {state.kind === 'loading' && (
          <p className="py-20 font-data text-sm uppercase tracking-[0.22em] text-ash">
            stoking the furnace…
          </p>
        )}

        {state.kind === 'link-error' && (
          <section className="py-16 text-center">
            <Flame className="mx-auto h-10 w-10 text-ember" aria-hidden="true" />
            <h1 className="mt-6 font-display text-3xl font-bold tracking-tight md:text-4xl">
              {state.reason === 'expired' ? 'That link expired.' : 'That link is bogus.'}
            </h1>
            <p className="mx-auto mt-3 max-w-md text-ash">
              {state.reason === 'expired'
                ? 'Magic links live 24 hours, then they die with dignity. Request a fresh one.'
                : 'We have no record of that link. If you copied it by hand, check for missing characters.'}
            </p>
            <Link
              to="/"
              className="mt-8 inline-block font-data text-xs uppercase tracking-[0.2em] text-ash underline-offset-4 hover:text-text hover:underline"
            >
              ← Back to the burn board
            </Link>
          </section>
        )}

        {state.kind === 'not-found' && (
          <section className="py-16 text-center">
            <Flame className="mx-auto h-10 w-10 text-ember" aria-hidden="true" />
            <h1 className="mt-6 font-display text-3xl font-bold tracking-tight md:text-4xl">
              Nothing to claim here.
            </h1>
            <p className="mx-auto mt-3 max-w-md text-ash">
              Pick a burn from the board first — you can&rsquo;t claim the void.
            </p>
            <Link
              to="/"
              className="mt-8 inline-block font-data text-xs uppercase tracking-[0.2em] text-ash underline-offset-4 hover:text-text hover:underline"
            >
              ← Back to the burn board
            </Link>
          </section>
        )}

        {state.kind === 'already-claimed' && (
          <section className="py-16 text-center">
            <BadgeCheck className="mx-auto h-10 w-10 text-ember" aria-hidden="true" />
            <h1 className="mt-6 font-display text-3xl font-bold tracking-tight md:text-4xl">
              This burn is already spoken for.
            </h1>
            <p className="mx-auto mt-3 max-w-md text-ash">
              Someone beat you to {state.name}&rsquo;s money fire. If that someone
              wasn&rsquo;t you, the listing was probably yours to begin with — awkward.
            </p>
            <Link
              to="/"
              className="mt-8 inline-block font-data text-xs uppercase tracking-[0.2em] text-ash underline-offset-4 hover:text-text hover:underline"
            >
              ← Back to the burn board
            </Link>
          </section>
        )}

        {state.kind === 'email-step' && <EmailStep company={state.company} />}

        {state.kind === 'claim-status' && (
          <>
            {state.claim.claimed ? (
              <section className="py-16 text-center">
                <BadgeCheck className="mx-auto h-10 w-10 text-ember" aria-hidden="true" />
                <h1 className="mt-6 font-display text-3xl font-bold tracking-tight md:text-4xl">
                  This burn is already spoken for.
                </h1>
                <Link
                  to={`/c/${state.claim.company.slug}`}
                  className="mt-8 inline-block font-data text-xs uppercase tracking-[0.2em] text-ash underline-offset-4 hover:text-text hover:underline"
                >
                  ← Back to {state.claim.company.name}
                </Link>
              </section>
            ) : state.claim.expired && !state.claim.email_verified ? (
              <section className="py-16 text-center">
                <Flame className="mx-auto h-10 w-10 text-ember" aria-hidden="true" />
                <h1 className="mt-6 font-display text-3xl font-bold tracking-tight md:text-4xl">
                  That link expired.
                </h1>
                <p className="mx-auto mt-3 max-w-md text-ash">
                  Magic links live 24 hours. Start the claim again from the company page.
                </p>
                <Link
                  to={`/c/${state.claim.company.slug}`}
                  className="mt-8 inline-block font-data text-xs uppercase tracking-[0.2em] text-ash underline-offset-4 hover:text-text hover:underline"
                >
                  ← Back to {state.claim.company.name}
                </Link>
              </section>
            ) : !state.claim.email_verified ? (
              <section className="py-16 text-center">
                <Flame className="mx-auto h-10 w-10 text-ember" aria-hidden="true" />
                <h1 className="mt-6 font-display text-3xl font-bold tracking-tight md:text-4xl">
                  Check your inbox first.
                </h1>
                <p className="mx-auto mt-3 max-w-md text-ash">
                  This claim hasn&rsquo;t been email-verified yet. The magic link is waiting.
                </p>
              </section>
            ) : (
              <DnsStep claim={state.claim} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
