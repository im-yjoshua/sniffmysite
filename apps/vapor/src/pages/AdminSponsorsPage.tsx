import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  KeyRound,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  approveSponsorAdmin,
  fetchAdminSponsors,
  rejectSponsorAdmin,
  ScanApiError,
  type AdminSponsor,
} from '../lib/api';

/**
 * Internal banner-approval page (NOT linked from the site).
 *
 * Flow: Joshua opens /admin/sponsors, enters the admin token once (kept in
 * sessionStorage for the tab only — the token never appears in frontend
 * source, docs, or commits). Pending banners show their creative previewed;
 * approve starts the paid window now, reject kills it.
 *
 * PRODUCT RULE: payment alone never publishes. A record only reaches the
 * homepage after a human presses Approve here.
 */
const TOKEN_KEY = 'sniffmysite_admin_token';

type StatusFilter = '' | 'pending_approval' | 'approved' | 'rejected';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'pending_approval', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: '', label: 'All' },
];

export function AdminSponsorsPage() {
  const [token, setToken] = useState<string | null>(
    () => window.sessionStorage.getItem(TOKEN_KEY),
  );
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('pending_approval');
  const [sponsors, setSponsors] = useState<AdminSponsor[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (t: string, f: StatusFilter) => {
      setLoading(true);
      setError(null);
      try {
        setSponsors(await fetchAdminSponsors(t, f || undefined));
      } catch (e) {
        if (e instanceof ScanApiError && e.status === 401) {
          window.sessionStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setError('Wrong token. Try again.');
        } else if (e instanceof ScanApiError && e.status === 503) {
          setError(
            'The admin token is not set on the server yet. Set ADMIN_TOKEN on the server and try again.',
          );
        } else {
          setError('Could not load the list. Try again in a minute.');
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (token) void load(token, filter);
  }, [token, filter, load]);

  const unlock = (e: React.FormEvent) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    window.sessionStorage.setItem(TOKEN_KEY, t);
    setDraft('');
    setToken(t);
  };

  const act = async (id: string, kind: 'approve' | 'reject') => {
    if (!token || acting) return;
    setActing(id + kind);
    setError(null);
    try {
      if (kind === 'approve') await approveSponsorAdmin(token, id);
      else await rejectSponsorAdmin(token, id);
      await load(token, filter);
    } catch (e) {
      setError(
        e instanceof ScanApiError && e.status === 401
          ? 'Wrong token. Try again.'
          : 'That did not work. Try again.',
      );
    } finally {
      setActing(null);
    }
  };

  const lock = () => {
    window.sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setSponsors([]);
  };

  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-ink pb-4">
        <p className="eyebrow text-ink-soft">Internal · staff only</p>
        <Link
          to="/"
          className="tap-target flex items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
          Back to the site
        </Link>
      </div>

      <div className="py-10 md:py-14">
        <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
          Banner approvals
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          Every paid banner lands here first. Nothing goes on the homepage
          until a human presses <strong>Approve</strong>. Anything shady gets
          rejected — the buyer is refunded, and the banner never shows.
        </p>
        <p className="mt-3 flex max-w-2xl items-start gap-2 text-base text-ink-faint">
          <ShieldAlert
            className="mt-1 h-5 w-5 shrink-0"
            strokeWidth={2}
            aria-hidden="true"
          />
          This page is not linked anywhere on the site. The token lives in
          this tab only (session storage) — it is never written into the
          page or saved anywhere else.
        </p>
      </div>

      {!token ? (
        <form onSubmit={unlock} className="max-w-md border-t border-hairline pt-8">
          <label
            htmlFor="admin-token"
            className="block font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft"
          >
            Admin token
          </label>
          <input
            id="admin-token"
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste the ADMIN_TOKEN from the server"
            autoComplete="off"
            className="tap-target mt-3 w-full border border-ink bg-paper px-4 py-3 font-data text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-hazard"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="tap-target mt-4 inline-flex items-center gap-2 bg-ink px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            <KeyRound className="h-5 w-5" strokeWidth={2.25} />
            Unlock
          </button>
          {error && (
            <p role="alert" className="mt-4 font-data text-sm text-hazard">
              {error}
            </p>
          )}
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-6">
            <div
              className="flex gap-1 overflow-x-auto"
              role="tablist"
              aria-label="Filter by status"
            >
              {FILTERS.map((f) => (
                <button
                  key={f.key || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={`tap-target whitespace-nowrap px-4 font-data text-sm font-medium uppercase tracking-[0.14em] transition-colors ${
                    filter === f.key
                      ? 'text-hazard underline decoration-hazard decoration-2 underline-offset-8'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={lock}
              className="tap-target font-data text-sm uppercase tracking-[0.18em] text-ink-faint transition-colors hover:text-hazard"
            >
              Lock this tab
            </button>
          </div>

          {error && (
            <p role="alert" className="mt-6 font-data text-sm text-hazard">
              {error}
            </p>
          )}

          <div className="mt-6">
            {loading ? (
              <p className="py-10 text-lg text-ink-soft">
                Checking the queue…
              </p>
            ) : sponsors.length === 0 ? (
              <p className="border-t border-hairline py-10 text-lg text-ink-soft">
                Nothing here. The queue is clear.
              </p>
            ) : (
              sponsors.map((s) => (
                <article
                  key={s.id}
                  className="grid gap-5 border-t border-hairline py-8 md:grid-cols-[auto_1fr_auto] md:gap-8"
                >
                  <img
                    src={s.image_url}
                    alt={s.alt_text}
                    className="creative-preview"
                    loading="lazy"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <h2 className="font-display text-2xl font-bold tracking-tight">
                        {s.brand_name}
                      </h2>
                      <p className="font-data text-sm uppercase tracking-[0.18em] text-ink-faint">
                        {s.term_days}-day run · {s.status.replace('_', ' ')}
                      </p>
                    </div>
                    <p className="mt-2 break-all font-data text-sm text-ink-soft">
                      Links to:{' '}
                      <a
                        href={s.dest_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:text-hazard"
                      >
                        {s.dest_url}
                      </a>
                    </p>
                    <p className="mt-1 font-data text-sm text-ink-faint">
                      Buyer {s.buyer_email} · order{' '}
                      <span className="break-all">{s.order_id.slice(0, 12)}…</span> ·
                      paid {new Date(s.created_at).toLocaleDateString()}
                      {s.starts_at && (
                        <>
                          {' '}· live from{' '}
                          {new Date(s.starts_at).toLocaleDateString()} to{' '}
                          {s.ends_at
                            ? new Date(s.ends_at).toLocaleDateString()
                            : '—'}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-start gap-3 md:flex-col">
                    {s.status === 'pending_approval' && (
                      <>
                        <button
                          type="button"
                          onClick={() => act(s.id, 'approve')}
                          disabled={acting !== null}
                          className="tap-target inline-flex items-center gap-2 bg-hazard px-6 py-3 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep disabled:cursor-wait disabled:opacity-60"
                        >
                          <Check className="h-5 w-5" strokeWidth={2.25} />
                          {acting === s.id + 'approve' ? 'Working…' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={() => act(s.id, 'reject')}
                          disabled={acting !== null}
                          className="tap-target inline-flex items-center gap-2 border border-ink px-6 py-3 font-data text-sm font-bold uppercase tracking-wider text-ink transition-colors hover:border-hazard hover:text-hazard disabled:cursor-wait disabled:opacity-60"
                        >
                          <X className="h-5 w-5" strokeWidth={2.25} />
                          {acting === s.id + 'reject' ? 'Working…' : 'Reject'}
                        </button>
                      </>
                    )}
                    {s.status === 'approved' && (
                      <button
                        type="button"
                        onClick={() => act(s.id, 'reject')}
                        disabled={acting !== null}
                        className="tap-target inline-flex items-center gap-2 border border-ink px-6 py-3 font-data text-sm font-bold uppercase tracking-wider text-ink transition-colors hover:border-hazard hover:text-hazard disabled:cursor-wait disabled:opacity-60"
                      >
                        <X className="h-5 w-5" strokeWidth={2.25} />
                        Pull it down
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </>
      )}
    </main>
  );
}
