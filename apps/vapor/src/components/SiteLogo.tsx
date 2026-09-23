import { useEffect, useState } from 'react';

/**
 * Logo sources, tried in order. Google's favicon service is the
 * prettiest but it gets blocked by some ad-blockers and networks —
 * DuckDuckGo's icon endpoint is the backup. Both are the site's OWN
 * favicon (never a fabricated logo); the monogram tile underneath is
 * the last resort.
 */
function logoSources(domain: string): string[] {
  const d = encodeURIComponent(domain);
  return [
    `https://icons.duckduckgo.com/ip3/${d}.ico`,
    `https://www.google.com/s2/favicons?domain=${d}&sz=128`,
  ];
}

/**
 * The specimen's own logo — pulled client-side from public favicon
 * services, with a fallback chain. The monogram tile is always rendered
 * underneath: it holds the box's exact size (no layout shift while the
 * favicon loads) and it is what you see if every source fails or is
 * blocked (no broken-image flash — the <img> only fades in on a
 * successful load). No fake logos anywhere: a real favicon, or the
 * lab's initial stamp.
 */
export function SiteLogo({
  domain,
  size = 'md',
  className = '',
}: {
  domain: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>(
    'loading',
  );
  const [sourceIdx, setSourceIdx] = useState(0);

  // A recycled row can get a new domain (the live board re-sorts) —
  // start the load cycle over so a stale favicon never lingers.
  useEffect(() => {
    setSourceIdx(0);
    setStatus('loading');
  }, [domain]);

  const sources = logoSources(domain);

  const dims =
    size === 'sm'
      ? 'h-8 w-8'
      : size === 'lg'
        ? 'h-14 w-14'
        : 'h-10 w-10';
  const textSize =
    size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-2xl' : 'text-lg';

  const initial = domain.replace(/^www\./i, '').charAt(0).toUpperCase() || '?';

  return (
    <span
      aria-hidden="true"
      className={`${dims} ${className} relative shrink-0 select-none overflow-hidden border border-hairline bg-paper`}
    >
      <span
        className={`absolute inset-0 flex items-center justify-center font-data ${textSize} font-bold uppercase text-ink-soft`}
      >
        {initial}
      </span>
      {status !== 'failed' && (
        <img
          key={`${domain}-${sourceIdx}`}
          src={sources[sourceIdx]}
          alt=""
          loading="lazy"
          onLoad={() => setStatus('loaded')}
          onError={() => {
            // Try the next source; only surrender to the monogram when
            // every source has failed.
            if (sourceIdx < sources.length - 1) {
              setSourceIdx(sourceIdx + 1);
            } else {
              setStatus('failed');
            }
          }}
          className={`absolute inset-0 h-full w-full bg-paper object-contain p-1 transition-opacity duration-200 ${
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </span>
  );
}
