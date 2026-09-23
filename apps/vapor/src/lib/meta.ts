/**
 * Tiny per-page meta manager (Task 7).
 *
 * Sets document.title + description/OG tags for shareable pages. The profile
 * page sets its tags on load and restores the site defaults on unmount.
 *
 * HONEST LIMITATION (recorded in PROGRESS.md): this app is a client-rendered
 * SPA, so link-preview crawlers (X, iMessage, Discord) that don't execute JS
 * will NOT see these per-profile tags until deploy-time prerendering or edge
 * injection exists (Cloudflare Pages). The PNG endpoint itself
 * (`/api/vapor/og/:slug.png`) is fully crawler-ready today — the missing
 * piece is only getting the tag into the HTML the crawler fetches.
 */

const DEFAULT_TITLE = 'SniffMySite — We sniff startups so you don\u2019t have to.';
const DEFAULT_DESCRIPTION =
  'SniffMySite — we sniff startups so you don\u2019t have to. Paste any startup\u2019s web address and get an honest hype score from 0 to 100.';

export interface PageMeta {
  title: string;
  description: string;
  ogImage?: string;
  ogUrl?: string;
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function removeMeta(attr: 'name' | 'property', key: string) {
  document.head
    .querySelector(`meta[${attr}="${key}"]`)
    ?.remove();
}

/** Set per-page tags (title, description, OG). Tags are created if missing. */
export function setPageMeta(meta: PageMeta) {
  document.title = meta.title;
  upsertMeta('name', 'description', meta.description);
  upsertMeta('property', 'og:title', meta.title);
  upsertMeta('property', 'og:description', meta.description);
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('name', 'twitter:card', 'summary_large_image');
  if (meta.ogImage) {
    upsertMeta('property', 'og:image', meta.ogImage);
    upsertMeta('name', 'twitter:image', meta.ogImage);
  }
  if (meta.ogUrl) upsertMeta('property', 'og:url', meta.ogUrl);
}

/** Restore the site-wide defaults (matches index.html). */
export function resetPageMeta() {
  document.title = DEFAULT_TITLE;
  upsertMeta('name', 'description', DEFAULT_DESCRIPTION);
  upsertMeta('property', 'og:title', DEFAULT_TITLE);
  upsertMeta('property', 'og:description', DEFAULT_DESCRIPTION);
  removeMeta('property', 'og:image');
  removeMeta('name', 'twitter:image');
  removeMeta('property', 'og:url');
}
