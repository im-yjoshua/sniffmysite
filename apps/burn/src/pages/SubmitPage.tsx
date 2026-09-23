import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Flame } from 'lucide-react';
import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';
import { TurnstileWidget } from '../components/TurnstileWidget';

/**
 * /list — the 60-second burn listing form (§3.3, §3.4).
 *
 * No account needed to submit; email is collected for the Task 7 claim step.
 * Every submission lands in burn.companies with status='pending' — the
 * moderation queue (§3.9). Client validation mirrors the server, but the
 * server is the source of truth.
 */

type Values = {
  name: string;
  domain: string;
  monthlyBurn: string;
  runwayMonths: string;
  headcount: string;
  fundingRaised: string;
  email: string;
  website: string; // honeypot — bots fill it, humans never see it
};

const EMPTY: Values = {
  name: '',
  domain: '',
  monthlyBurn: '',
  runwayMonths: '',
  headcount: '',
  fundingRaised: '',
  email: '',
  website: '',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clientValidate(v: Values): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v.name.trim()) e.name = 'Give it a name. Even "Stealth" counts.';
  else if (v.name.trim().length > 120) e.name = 'Keep it under 120 characters. Brevity burns less.';

  if (!v.domain.trim()) e.domain = "Your domain. The thing you're setting on fire.";
  else if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(v.domain.trim().replace(/^https?:\/\//i, '').split('/')[0])) {
    e.domain = "That doesn't look like a domain. Try yourdomain.com.";
  }

  const burn = Number(v.monthlyBurn.replace(/[$,\s]/g, ''));
  if (v.monthlyBurn.trim() === '' || !Number.isFinite(burn)) {
    e.monthlyBurn = 'How much per month? A number — ideally a scary one.';
  } else if (burn <= 0) {
    e.monthlyBurn = 'Burn has to be above $0. $0 is just a hobby.';
  }

  const runway = Number(v.runwayMonths.trim());
  if (v.runwayMonths.trim() === '' || !Number.isFinite(runway)) {
    e.runwayMonths = 'Months of runway left. 0 is allowed — 0 is a lifestyle.';
  } else if (runway < 0) {
    e.runwayMonths = "Runway can't be negative. That's just debt with extra steps.";
  }

  if (v.headcount.trim() !== '') {
    const hc = Number(v.headcount.trim());
    if (!Number.isInteger(hc) || hc < 0) e.headcount = 'Headcount must be a whole human.';
  }
  if (v.fundingRaised.trim() !== '') {
    const fr = Number(v.fundingRaised.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(fr) || fr < 0) e.fundingRaised = 'Funding raised must be a positive number.';
  }

  if (!v.email.trim()) {
    e.email = "We need an email for the claim step. No spam — we're too busy burning.";
  } else if (!EMAIL_RE.test(v.email.trim())) {
    e.email = "That email won't survive the trip. Check it.";
  }
  return e;
}

const inputCls =
  'w-full border-b border-divider bg-transparent py-3 text-text placeholder:text-ash/40 focus:border-ember focus:outline-none';

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="py-6">
      <span className="block font-data text-[11px] uppercase tracking-[0.22em] text-ash">
        {label}
      </span>
      <p className="mt-1.5 text-sm leading-relaxed text-ash">{hint}</p>
      <div className="mt-2">{children}</div>
      {error && <p className="mt-2 font-data text-xs text-ember">{error}</p>}
    </div>
  );
}

export function SubmitPage() {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(undefined);
  const [done, setDone] = useState(false);

  const set = (key: keyof Values) => (ev: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: ev.target.value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setBanner(null);
    const errs = clientValidate(values);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/burn/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          domain: values.domain.trim(),
          monthlyBurn: values.monthlyBurn.trim(),
          runwayMonths: values.runwayMonths.trim(),
          headcount: values.headcount.trim(),
          fundingRaised: values.fundingRaised.trim(),
          email: values.email.trim(),
          website: values.website, // honeypot
          turnstileToken,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        fields?: Record<string, string>;
      };

      if (res.status === 201) {
        setDone(true);
        window.scrollTo({ top: 0 });
        return;
      }
      if (res.status === 400 && data.error === 'validation_failed' && data.fields) {
        setErrors(data.fields);
        setBanner('A few fields need attention. The server has standards.');
        return;
      }
      if (res.status === 409) {
        setErrors({ domain: data.message ?? 'This domain already burns here.' });
        return;
      }
      if (res.status === 429) {
        setBanner(data.message ?? 'Whoa. One burn at a time — try again in a bit.');
        return;
      }
      setBanner(
        data.message ?? "The furnace didn't answer. Check your connection and try again.",
      );
    } catch {
      setBanner("The furnace didn't answer. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 pb-20 pt-12">
        {done ? (
          <section className="py-16 text-center" aria-live="polite">
            <div className="inline-block -rotate-2 border-2 border-ember px-6 py-3">
              <span className="font-data text-sm font-bold uppercase tracking-[0.3em] text-ember">
                In the queue
              </span>
            </div>
            <h1 className="mt-8 flex items-center justify-center gap-3 font-display text-4xl font-bold tracking-tight">
              <BadgeCheck className="h-8 w-8 text-ember" aria-hidden="true" />
              You&apos;re in the queue.
            </h1>
            <p className="mx-auto mt-4 max-w-md leading-relaxed text-ash">
              Your burn is pending audit by vibes. It goes live on the board once a human
              squints at it — usually within a day.
            </p>
            <Link
              to="/"
              className="mt-8 inline-block font-data text-xs uppercase tracking-[0.2em] text-ash underline-offset-4 hover:text-text hover:underline"
            >
              ← Back to the burn board
            </Link>
          </section>
        ) : (
          <>
            <h1 className="flex items-center gap-3 font-display text-4xl font-bold tracking-tight md:text-5xl">
              <Flame className="h-9 w-9 text-ember" aria-hidden="true" />
              List your burn
            </h1>
            <p className="mt-3 max-w-xl leading-relaxed text-ash">
              60 seconds. Self-reported. Audited by vibes. One listing per domain — no
              take-backs once you&apos;re on the board.
            </p>

            {banner && (
              <p
                role="alert"
                className="mt-6 border-b border-ember/60 pb-4 font-data text-sm text-ember"
              >
                {banner}
              </p>
            )}

            <form onSubmit={onSubmit} noValidate className="mt-4 divide-y divide-divider">
              {/* Honeypot — invisible to humans, irresistible to bots. */}
              <input
                name="website"
                value={values.website}
                onChange={set('website')}
                autoComplete="off"
                tabIndex={-1}
                aria-hidden="true"
                className="absolute left-[-9999px] h-px w-px opacity-0"
              />

              <Field
                label="Startup name"
                hint="What are you setting on fire?"
                error={errors.name}
              >
                <input
                  value={values.name}
                  onChange={set('name')}
                  placeholder="StealthMode AI"
                  maxLength={120}
                  className={inputCls}
                />
              </Field>

              <Field
                label="Domain"
                hint="yourdomain.com — one listing per domain, and the board never forgets."
                error={errors.domain}
              >
                <input
                  value={values.domain}
                  onChange={set('domain')}
                  placeholder="yourdomain.com"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={`${inputCls} font-data`}
                />
              </Field>

              <Field
                label="Monthly burn · USD"
                hint="Be honest. Nobody fakes losing money this fast."
                error={errors.monthlyBurn}
              >
                <div className="flex items-baseline gap-2 border-b border-divider focus-within:border-ember">
                  <span className="font-data text-3xl text-ash">$</span>
                  <input
                    value={values.monthlyBurn}
                    onChange={set('monthlyBurn')}
                    placeholder="42,000"
                    inputMode="decimal"
                    className="w-full bg-transparent py-4 font-data text-3xl tabular text-text placeholder:text-ash/40 focus:outline-none"
                  />
                  <span className="shrink-0 font-data text-sm text-ash">/mo</span>
                </div>
              </Field>

              <Field
                label="Runway · months"
                hint="How long until the money runs out? 0 is allowed — 0 is a lifestyle."
                error={errors.runwayMonths}
              >
                <input
                  value={values.runwayMonths}
                  onChange={set('runwayMonths')}
                  placeholder="3"
                  inputMode="decimal"
                  className={`${inputCls} font-data tabular`}
                />
              </Field>

              <Field
                label="Headcount · optional"
                hint="Souls aboard the ship."
                error={errors.headcount}
              >
                <input
                  value={values.headcount}
                  onChange={set('headcount')}
                  placeholder="12"
                  inputMode="numeric"
                  className={`${inputCls} font-data tabular`}
                />
              </Field>

              <Field
                label="Funding raised · USD · optional"
                hint="How much kindling the investors gave you."
                error={errors.fundingRaised}
              >
                <input
                  value={values.fundingRaised}
                  onChange={set('fundingRaised')}
                  placeholder="2,000,000"
                  inputMode="decimal"
                  className={`${inputCls} font-data tabular`}
                />
              </Field>

              <Field
                label="Email"
                hint="For the claim step later. We won't spam you — we're too busy burning."
                error={errors.email}
              >
                <input
                  value={values.email}
                  onChange={set('email')}
                  placeholder="founder@yourdomain.com"
                  type="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={`${inputCls} font-data`}
                />
              </Field>

              <div className="pt-8">
                <TurnstileWidget onToken={setTurnstileToken} />
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 bg-ember px-6 py-4 font-display text-sm font-bold uppercase tracking-[0.12em] text-bg transition-colors hover:bg-ember-deep disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                >
                  {submitting ? 'Lighting it up…' : 'Light it up'}
                </button>
                <p className="mt-4 font-data text-xs leading-relaxed text-ash">
                  By listing, you confirm these numbers are yours to report and that the
                  board is satire — audited by vibes, not accountants.
                </p>
              </div>
            </form>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
