import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { SITE_URL } from '../config';
import { formatBurn } from '../lib/mock';

/**
 * Report card share button — Task 6 (§3.5, §3.6).
 *
 * Downloads the 1200×630 PNG from the API; on mobile / share-capable
 * browsers it opens the native share sheet with the card attached instead.
 *
 * API base URL: `VITE_PUBLIC_API_BASE_URL`. In local dev this is unset, so
 * same-origin requests ride the Vite /api proxy (vite.config.ts). The
 * Cloudflare Pages production build MUST set it to the Render API origin
 * (e.g. https://burnrate-api.onrender.com) — the API and the frontend are
 * different origins in production.
 */
const API_BASE = (import.meta.env.VITE_PUBLIC_API_BASE_URL as string | undefined) ?? '';

interface Props {
  slug: string;
  name: string;
  monthlyBurn: number;
  /** ISO end-of-runway, or null when unknown (mirrors the server's runway math). */
  runwayEndsAt: string | null;
}

/** Chat-voice runway line for the share text — lowercase sibling of the server's formatRunwayLine. */
function runwayShareText(runwayEndsAt: string | null): string {
  if (!runwayEndsAt) return 'runway unknown (bold strategy)';
  const days = (new Date(runwayEndsAt).getTime() - Date.now()) / 86_400_000;
  if (Number.isNaN(days)) return 'runway unknown (bold strategy)';
  if (days <= 0) return '0 days. Status: airborne.';
  if (days < 7) return `${Math.floor(days)} days. Status: critical.`;
  if (days < 60) {
    const w = Math.max(1, Math.round(days / 7));
    return `${w} week${w === 1 ? '' : 's'}`;
  }
  const m = Math.max(2, Math.floor(days / 30.4375));
  return `${m} month${m === 1 ? '' : 's'}`;
}

type ShareState = 'idle' | 'working' | 'error';

export function ReportCardButton({ slug, name, monthlyBurn, runwayEndsAt }: Props) {
  const [state, setState] = useState<ShareState>('idle');

  async function onShare() {
    setState('working');
    try {
      const res = await fetch(
        `${API_BASE}/api/burn/report-card/${encodeURIComponent(slug)}.png`,
      );
      if (!res.ok) throw new Error(`card ${res.status}`);
      const blob = await res.blob();
      const filename = `${slug}-burn-report.png`;
      const text =
        `${name} is burning ${formatBurn(monthlyBurn)} · ` +
        `Runway: ${runwayShareText(runwayEndsAt)} · Vibes: immaculate — ${SITE_URL}/c/${slug}`;

      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        // Native share sheet (mobile): card attached, deadpan text included.
        await navigator.share({
          files: [file],
          title: `${name} — burn report card`,
          text,
        });
      } else {
        // Desktop fallback: straight download.
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      setState('idle');
    } catch (err) {
      // A cancelled share sheet is not an error — user just closed it.
      if (err instanceof DOMException && err.name === 'AbortError') {
        setState('idle');
      } else {
        setState('error');
      }
    }
  }

  if (state === 'error') {
    return (
      <button
        type="button"
        onClick={onShare}
        className="mt-4 inline-flex items-center gap-2 border border-ember/60 px-6 py-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-ember transition-colors hover:bg-ember hover:text-bg"
      >
        The printer jammed. Try again.
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onShare}
      disabled={state === 'working'}
      className="mt-4 inline-flex items-center gap-2 border border-divider px-6 py-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-text transition-colors hover:border-ember hover:text-ember disabled:cursor-wait disabled:opacity-60"
    >
      {state === 'working' ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-4 w-4" aria-hidden="true" />
      )}
      {state === 'working' ? 'Printing the card…' : 'Report card'}
    </button>
  );
}
