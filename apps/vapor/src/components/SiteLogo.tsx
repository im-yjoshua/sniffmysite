import { useEffect, useState } from 'react';

/**
 * The specimen's own logo — pulled client-side from Google's favicon
 * service. The monogram tile is always rendered underneath: it holds the
 * box's exact size (no layout shift while the favicon loads) and it is
 * what you see if the favicon is missing or blocked (no broken-image
 * flash — the <img> only fades in on a successful load). No fake logos
 * anywhere: a real favicon, or the lab's initial stamp.
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

  // A recycled row can get a new domain (the live board re-sorts) —
  // start the load cycle over so a stale favicon never lingers.
  useEffect(() => {
    setStatus('loading');
  }, [domain]);

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
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`}
          alt=""
          loading="lazy"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('failed')}
          className={`absolute inset-0 h-full w-full bg-paper object-contain p-1 transition-opacity duration-200 ${
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </span>
  );
}
