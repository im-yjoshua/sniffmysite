import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Frame } from 'lucide-react';

/**
 * The "live specimen" — an interactive, sandboxed iframe of the site's
 * actual landing page, beside the dossier.
 *
 * Many sites send `X-Frame-Options: DENY`, and a blocked frame never fires
 * a reliable error — so a 10s watchdog decides: if the frame hasn't loaded
 * by then, we say so plainly and hand over the direct link instead of
 * showing an eternal blank box.
 */
export function LiveSpecimen({ domain }: { domain: string }) {
  const url = `https://${domain}`;
  const [status, setStatus] = useState<'loading' | 'ready' | 'stalled'>(
    'loading',
  );
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setStatus('loading');
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setStatus((s) => (s === 'loading' ? 'stalled' : s));
    }, 10_000);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [domain]);

  return (
    <aside
      aria-label={`Live page: ${domain}`}
      className="overflow-hidden border border-hairline"
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <p className="flex items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft">
          <Frame className="h-4 w-4" strokeWidth={2.25} />
          Live page
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-target flex items-center gap-1.5 font-data text-sm font-medium uppercase tracking-[0.18em] text-hazard hover:underline"
        >
          Open the site
          <ExternalLink className="h-4 w-4" strokeWidth={2.25} />
        </a>
      </div>

      <div className="relative aspect-[4/5] w-full bg-paper sm:aspect-[3/4] lg:aspect-[4/5]">
        <iframe
          key={domain}
          src={url}
          title={`Live web page of ${domain}`}
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
          onLoad={() => setStatus('ready')}
          className="absolute inset-0 h-full w-full border-0"
        />

        {status !== 'ready' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
            <p className="text-[13px] uppercase tracking-[0.18em] text-ink-faint">
              {status === 'loading' ? 'Loading the page…' : 'Can\u2019t show it here'}
            </p>
            {status === 'stalled' && (
              <>
                <p className="max-w-xs text-base leading-relaxed text-ink-soft">
                  This site doesn&rsquo;t allow previews inside other pages.
                  Open the live site instead.
                </p>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-target pointer-events-auto mt-2 inline-flex items-center bg-hazard px-6 py-3 font-data text-sm font-bold uppercase tracking-[0.18em] text-paper transition-colors hover:bg-hazard-deep"
                >
                  Open the live site
                </a>
              </>
            )}
          </div>
        )}
      </div>

      <p className="border-t border-hairline px-4 py-3 text-sm leading-relaxed text-ink-faint">
        Live and unedited — we scored a snapshot, so the page may have
        changed since. {domain}
      </p>
    </aside>
  );
}
