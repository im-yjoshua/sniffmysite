import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  ScanApiError,
  requestClaimToken,
  checkClaim,
  type ApiClaimToken,
  type ClaimVerifyReason,
} from '../lib/api';

/**
 * Founder claim, inline on the scan report (Phase 0.0).
 *
 * Two steps, no accounts: request a DNS TXT token (optional alert email),
 * add the record, then verify. Only ranked pages can be claimed — the API
 * 404s anything without a board record, and we say so plainly.
 */

const VERIFY_REASON_COPY: Record<ClaimVerifyReason, string> = {
  no_pending_claim: 'No claim token on file for this page. Request one first.',
  expired: 'That token expired. Request a fresh one — they last 7 days.',
  token_not_found: 'That token fell off the shelf. Request a fresh one.',
  dns_error: 'DNS hiccup on our end. Wait a minute and check again.',
};

type Phase =
  | { kind: 'teaser' }
  | { kind: 'form'; error?: string }
  | { kind: 'token'; token: ApiClaimToken }
  | { kind: 'verified'; at: string };

export function ClaimCard({ domain }: { domain: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'teaser' });
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);

  async function requestToken() {
    setBusy(true);
    try {
      const token = await requestClaimToken(domain, email || undefined);
      setPhase({ kind: 'token', token });
      setVerifyNote(null);
    } catch (err) {
      const detail =
        err instanceof ScanApiError
          ? err.message
          : 'Something broke on our end. Try again.';
      setPhase({ kind: 'form', error: detail });
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setVerifyNote(null);
    try {
      const res = await checkClaim(domain);
      if (res.verified) {
        setPhase({ kind: 'verified', at: res.claimed_at ?? '' });
      } else {
        setVerifyNote(
          (res.reason && VERIFY_REASON_COPY[res.reason]) ??
            'Not verified yet. DNS can take minutes — or hours.',
        );
      }
    } catch (err) {
      setVerifyNote(
        err instanceof ScanApiError
          ? err.message
          : 'Something broke on our end. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="border-t border-hairline py-8 md:py-10"
      aria-label="Claim this page"
    >
      <p className="eyebrow text-ink-faint">Founders</p>
      <h2 className="mt-4 font-inscription text-3xl font-bold uppercase tracking-tight md:text-4xl">
        Your page? Prove it.
      </h2>

      {phase.kind === 'teaser' && (
        <div className="mt-4">
          <p className="max-w-2xl text-lg leading-relaxed text-ink-soft">
            Think the nose got it wrong? Claim the page. One DNS record —
            no account, no password — and it&rsquo;s yours.
          </p>
          <button
            type="button"
            onClick={() => setPhase({ kind: 'form' })}
            className="tap-target mt-5 inline-flex items-center gap-2 border-2 border-ink bg-paper px-6 py-3 font-data text-sm font-bold uppercase tracking-wider text-ink transition-colors hover:bg-ink hover:text-paper"
          >
            <ShieldCheck className="h-5 w-5" strokeWidth={2.25} />
            Claim this page
          </button>
        </div>
      )}

      {phase.kind === 'form' && (
        <form
          className="mt-5 max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            void requestToken();
          }}
        >
          <label
            htmlFor="claim-email"
            className="block font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft"
          >
            Email for score-drop alerts — optional
          </label>
          <input
            id="claim-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="founder@yourpage.com"
            autoComplete="email"
            className="tap-target mt-3 w-full border border-ink bg-paper px-4 py-3 font-data text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-hazard"
          />
          {phase.error && (
            <p className="mt-3 font-data text-sm text-hazard" role="alert">
              {phase.error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="tap-target mt-4 inline-flex items-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep disabled:opacity-60"
          >
            {busy ? 'Minting…' : 'Get the token'}
          </button>
        </form>
      )}

      {phase.kind === 'token' && (
        <div className="mt-5 max-w-2xl">
          <p className="text-lg leading-relaxed text-ink-soft">
            Add this TXT record where your domain&rsquo;s DNS lives:
          </p>
          <dl className="mt-4 space-y-3 border border-hairline bg-paper p-5">
            <div>
              <dt className="font-data text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
                Host
              </dt>
              <dd className="mt-1 break-all font-data text-base font-bold text-ink">
                {phase.token.txt_host}
              </dd>
            </div>
            <div>
              <dt className="font-data text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
                Value
              </dt>
              <dd className="mt-1 break-all font-data text-base font-bold text-ink">
                {phase.token.txt_value}
              </dd>
            </div>
          </dl>
          <ol className="mt-4 list-decimal space-y-2 pl-6 text-base leading-relaxed text-ink-soft">
            {phase.token.instructions.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          {verifyNote && (
            <p className="mt-4 font-data text-sm text-hazard" role="status">
              {verifyNote}
            </p>
          )}
          <button
            type="button"
            onClick={() => void verify()}
            disabled={busy}
            className="tap-target mt-5 inline-flex items-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep disabled:opacity-60"
          >
            {busy ? 'Checking…' : 'I added it — check now'}
          </button>
        </div>
      )}

      {phase.kind === 'verified' && (
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink" role="status">
          <strong>Claimed.</strong> This page is yours — the nose knows its
          master now.
        </p>
      )}
    </section>
  );
}
