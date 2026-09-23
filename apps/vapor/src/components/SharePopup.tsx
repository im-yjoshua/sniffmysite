import { useEffect, useRef, useState } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  Share2,
  ImageOff,
  Link2,
} from 'lucide-react';
import { RosetteBadge } from './RosetteBadge';
import type { TierLabel } from '../lib/api';

export interface SharePopupProps {
  domain: string;
  score: number;
  tier: TierLabel;
  /** The text posted to socials. */
  shareText: string;
  /** The URL being shared (the profile or report URL). */
  pageUrl: string;
  /** Resolves the share-card PNG. Called once when the popup opens. */
  getImageBlob: () => Promise<Blob>;
  onClose: () => void;
}

type Phase = 'loading' | 'ready' | 'error';

/**
 * The share popup: the site's score, the card preview, and three ways to
 * spread it — download the PNG, copy the image, or post it to socials.
 * Plain words, 44px tap targets, usable at 360px.
 */
export function SharePopup({
  domain,
  score,
  tier,
  shareText,
  pageUrl,
  getImageBlob,
  onClose,
}: SharePopupProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [copiedImage, setCopiedImage] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  // Load the card image once, when the popup opens.
  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    getImageBlob()
      .then((b) => {
        if (!alive) return;
        url = URL.createObjectURL(b);
        setBlob(b);
        setBlobUrl(url);
        setPhase('ready');
      })
      .catch(() => {
        if (alive) setPhase('error');
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [getImageBlob]);

  // Dialog manners: Escape closes, backdrop clicks close, body scroll locks,
  // focus moves into the dialog and back out on close.
  useEffect(() => {
    prevFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      prevFocus.current?.focus();
    };
  }, [onClose]);

  const downloadPng = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${domain}-sniffmysite.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const copyImage = async () => {
    setCopyNote(null);
    if (typeof window.ClipboardItem === 'undefined' || !blob) {
      setCopyNote('Copying images doesn\u2019t work in this browser \u2014 download it instead.');
      return;
    }
    try {
      await navigator.clipboard.write([
        new window.ClipboardItem({ 'image/png': blob }),
      ]);
      setCopiedImage(true);
      window.setTimeout(() => setCopiedImage(false), 2000);
    } catch {
      setCopyNote('Couldn\u2019t copy the image \u2014 download it instead.');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setCopyNote('Couldn\u2019t copy the link \u2014 copy it from the address bar.');
    }
  };

  const text = encodeURIComponent(shareText);
  const url = encodeURIComponent(pageUrl);
  const socials: { label: string; href: string }[] = [
    { label: 'X', href: `https://x.com/intent/tweet?text=${text}&url=${url}` },
    {
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    },
    {
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    },
    {
      label: 'WhatsApp',
      href: `https://wa.me/?text=${text}%20${url}`,
    },
    {
      label: 'Telegram',
      href: `https://t.me/share/url?url=${url}&text=${text}`,
    },
  ];
  const canNativeShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function';
  const nativeShare = () => {
    navigator
      .share({ title: `${domain} on SniffMySite`, text: shareText, url: pageUrl })
      .catch(() => {
        /* dismissed — nothing to do */
      });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${domain}'s score`}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto border border-hairline bg-paper shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <p className="font-data text-sm font-bold uppercase tracking-[0.18em] text-ink">
            Share this score
          </p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap-target flex h-11 w-11 items-center justify-center text-ink-soft transition-colors hover:text-hazard"
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="flex items-center gap-4">
            <RosetteBadge tier={tier} size={96} className="shrink-0" />
            <div>
              <p className="break-all font-display text-2xl font-bold tracking-tight">
                {domain}
              </p>
              <p className="mt-1 font-data text-3xl font-bold tabular-nums text-hazard">
                {score}
                <span className="ml-2 align-middle font-body text-base font-normal text-ink-soft">
                  sniff score · {tier}
                </span>
              </p>
            </div>
          </div>

          {/* Card preview well — hairline tint so it reads as an inset
              well in BOTH themes (the old bg-white/40 glowed wrong in dark). */}
          <div className="mt-5 border border-hairline bg-hairline/50">
            {phase === 'loading' && (
              <p className="px-4 py-10 text-center text-base text-ink-faint" aria-live="polite">
                Drawing the card…
              </p>
            )}
            {phase === 'error' && (
              <p className="flex items-center justify-center gap-2 px-4 py-10 text-center text-base text-ink-soft" role="alert">
                <ImageOff className="h-5 w-5" strokeWidth={2.25} />
                The card didn&rsquo;t load. Try again in a bit.
              </p>
            )}
            {phase === 'ready' && blobUrl && (
              <img
                src={blobUrl}
                alt={`${domain} sniff score ${score}/100 on SniffMySite`}
                width={1200}
                height={630}
                className="block w-full"
              />
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={downloadPng}
              disabled={phase !== 'ready'}
              className="tap-target flex min-h-[44px] items-center justify-center gap-2 bg-hazard px-4 py-3 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-5 w-5" strokeWidth={2.25} />
              Download PNG
            </button>
            <button
              type="button"
              onClick={copyImage}
              disabled={phase !== 'ready'}
              className="tap-target flex min-h-[44px] items-center justify-center gap-2 border border-ink px-4 py-3 font-data text-sm font-bold uppercase tracking-wider text-ink transition-colors hover:border-hazard hover:text-hazard disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copiedImage ? (
                <Check className="h-5 w-5" strokeWidth={2.25} />
              ) : (
                <Copy className="h-5 w-5" strokeWidth={2.25} />
              )}
              {copiedImage ? 'Copied' : 'Copy image'}
            </button>
          </div>
          {copyNote && (
            <p className="mt-2 text-base text-ink-soft" role="status">
              {copyNote}
            </p>
          )}

          <p className="mt-6 font-data text-sm font-bold uppercase tracking-[0.18em] text-ink-faint">
            Post it
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-target inline-flex min-h-[44px] items-center border border-hairline px-4 py-2 font-data text-sm font-medium uppercase tracking-wider text-ink transition-colors hover:border-hazard hover:text-hazard"
              >
                {s.label}
              </a>
            ))}
            {canNativeShare && (
              <button
                type="button"
                onClick={nativeShare}
                className="tap-target inline-flex min-h-[44px] items-center gap-2 border border-hairline px-4 py-2 font-data text-sm font-medium uppercase tracking-wider text-ink transition-colors hover:border-hazard hover:text-hazard"
              >
                <Share2 className="h-4 w-4" strokeWidth={2.25} />
                More
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={copyLink}
            className="tap-target mt-4 inline-flex min-h-[44px] items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
          >
            {copiedLink ? (
              <Check className="h-5 w-5" strokeWidth={2.25} />
            ) : (
              <Link2 className="h-5 w-5" strokeWidth={2.25} />
            )}
            {copiedLink ? 'Link copied' : 'Copy the link'}
          </button>

          <p className="mt-4 text-base leading-relaxed text-ink-faint">
            We joke about the page, never the people behind it.
          </p>
        </div>
      </div>
    </div>
  );
}
