/**
 * Share-text builders for the viral loops. Pure functions — the caller
 * passes `window.location.origin` in — so the copy stays testable and
 * identical everywhere it's used. No emojis anywhere; Inspection Lab
 * voice, plain 5th-grade words.
 */

/** One ready-to-post sniff-off challenge: text, link, and intent URLs. */
export interface SniffOffChallenge {
  /** The pre-written post text. */
  text: string;
  /** Canonical absolute challenge URL (/compare?a=..&b=..). */
  url: string;
  /** X intent link (text + url). */
  xHref: string;
  /** LinkedIn share-offsite link (url only — LinkedIn pulls the rest). */
  linkedInHref: string;
}

/**
 * Build the "I challenge you to a sniff-off" share pack.
 *
 * `origin` is `window.location.origin` at the call site. Hosts are the
 * bare canonical hosts (no scheme, no www) so the challenge link replays
 * the exact same matchup for anyone who opens it.
 */
export function buildSniffOffChallenge(
  origin: string,
  hostA: string,
  scoreA: number,
  hostB: string,
  scoreB: number,
): SniffOffChallenge {
  const text =
    `I challenged ${hostB} to a sniff-off on SniffMySite — ` +
    `${hostA} scored ${scoreA}, ${hostB} scored ${scoreB}. Beat that.`;
  const url =
    `${origin}/compare` +
    `?a=${encodeURIComponent(hostA)}&b=${encodeURIComponent(hostB)}`;
  const encText = encodeURIComponent(text);
  const encUrl = encodeURIComponent(url);
  return {
    text,
    url,
    xHref: `https://x.com/intent/tweet?text=${encText}&url=${encUrl}`,
    linkedInHref: `https://www.linkedin.com/sharing/share-offsite/?url=${encUrl}`,
  };
}
