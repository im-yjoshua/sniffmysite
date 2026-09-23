import { useEffect, useRef } from 'react';
import { useTheme } from '../hooks/useTheme';

/**
 * Cloudflare Turnstile bot check (Task 10).
 *
 * Renders only when VITE_TURNSTILE_SITE_KEY is set — in dev (no key) the
 * widget is skipped entirely and the server lets scans through with a
 * warning. If the Turnstile script can't load (offline, blocked CDN), the
 * widget hides itself instead of breaking the page; the server then decides
 * (403 + a plain-English message when its secret is set).
 */
export function TurnstileWidget({
  onToken,
}: {
  /** Called with the token on success, or null when it expires/errors. */
  onToken: (token: string | null) => void;
}) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    const render = () => {
      const w = (window as any).turnstile;
      if (cancelled || !w || !containerRef.current) return;
      widgetId.current = w.render(containerRef.current, {
        sitekey: siteKey,
        // The widget is a third-party iframe — tokens can't reach it,
        // so hand it the current theme and re-render on theme change.
        theme: theme === 'dark' ? 'dark' : 'light',
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(null),
        'error-callback': () => onTokenRef.current(null),
      });
    };

    if ((window as any).turnstile) {
      render();
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      script.onload = render;
      // Graceful fallback: script blocked/offline → no widget, no crash.
      // The server-side check still applies when its secret is configured.
      script.onerror = () => onTokenRef.current(null);
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      const w = (window as any).turnstile;
      if (w && widgetId.current) {
        try {
          w.remove(widgetId.current);
        } catch {
          /* already gone */
        }
        widgetId.current = null;
      }
    };
  }, [siteKey, theme]);

  if (!siteKey) return null;

  return (
    <div className="mt-6">
      <p className="mb-2 text-[13px] uppercase tracking-[0.14em] text-ink-faint">
        One quick human check first
      </p>
      <div ref={containerRef} />
    </div>
  );
}
