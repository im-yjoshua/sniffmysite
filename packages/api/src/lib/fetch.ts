/**
 * SSRF-hardened page fetcher (§2.4, §2.12).
 *
 * Every fetch goes through validatedEndpoint(), which:
 *   1. allows only http/https, rejects credentialed URLs,
 *   2. resolves the hostname and requires EVERY resolved IP to be public
 *      (private / loopback / link-local / multicast / reserved / doc ranges),
 *   3. pins the TCP/TLS connection to a validated IP via a custom `lookup`
 *      so no second DNS resolution can rebind the host mid-request.
 *
 * Redirects are followed manually (≤3) and each hop is re-validated.
 * Hardening: 8s total timeout, 2MB body cap, HTML-only content types.
 */
import { lookup } from 'node:dns/promises';
import type { LookupOptions } from 'node:dns';
import { isIP } from 'node:net';
import { request as httpRequest, type ClientRequestArgs } from 'node:http';
import { request as httpsRequest } from 'node:https';

export const FETCH_TIMEOUT_MS = 8_000; // §2.4: 8s total timeout
export const MAX_BODY_BYTES = 2 * 1024 * 1024; // §2.4: 2MB cap
export const MAX_REDIRECTS = 3; // §2.4: follow ≤3 redirects
export const MAX_URL_LENGTH = 2048;
export const MAX_LINKS = 2000;
export const MAX_IMAGES = 500;
export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 SniffMySiteBot/1.0';

export type FetchErrorCode =
  | 'invalid_url'
  | 'ssrf_blocked'
  | 'dns_error'
  | 'too_many_redirects'
  | 'timeout'
  | 'body_too_large'
  | 'unsupported_content_type'
  | 'fetch_failed'
  /** The site actively refused our scanner: HTTP 403/429, or a
   *  bot-protection / captcha challenge page instead of real content. */
  | 'blocked'
  /** The site answered with an HTTP error (4xx/5xx, other than 403/429). */
  | 'http_error'
  /** TLS handshake / certificate failure — we won't sniff through those. */
  | 'tls_error'
  /** The page loaded but had nothing readable on it (JS shell, empty body). */
  | 'empty_page';

export class FetchError extends Error {
  readonly code: FetchErrorCode;
  /** The upstream HTTP status for `blocked` / `http_error`, when known. */
  readonly upstreamStatus?: number;
  constructor(code: FetchErrorCode, message: string, upstreamStatus?: number) {
    super(message);
    this.name = 'FetchError';
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

/**
 * HTTP status for a fetch failure, as seen by OUR caller. Only the caller's
 * own bad input (400) and our own refusal to fetch (403) are theirs; every
 * upstream problem is a 502 — we are the gateway that failed.
 */
export function fetchErrorHttpStatus(code: FetchErrorCode): number {
  if (code === 'invalid_url') return 400;
  if (code === 'ssrf_blocked') return 403;
  return 502;
}

/**
 * Public-facing one-liner for every fetch failure. Deliberately generic: the
 * raw FetchError messages can name IPs, DNS records, and upstream statuses —
 * an SSRF oracle if echoed back. API routes must use this, never err.message.
 */
export function fetchErrorPublicDetail(code: FetchErrorCode): string {
  switch (code) {
    case 'invalid_url':
      return 'Provide an http(s) web address under 2048 characters.';
    case 'ssrf_blocked':
      return 'We only test public web pages — that address is off limits.';
    case 'dns_error':
      return 'That domain doesn\u2019t resolve — the internet has no record of it.';
    case 'timeout':
      return 'The site took too long to answer (over 8 seconds).';
    case 'too_many_redirects':
      return 'The site redirected us in circles and never landed.';
    case 'blocked':
      return 'The site blocked our scanner (bot protection).';
    case 'http_error':
      return 'The site answered with an error instead of a page.';
    case 'tls_error':
      return 'The site\u2019s security certificate looks broken.';
    case 'empty_page':
      return 'The page loaded but had nothing readable on it.';
    case 'body_too_large':
      return 'The page is too big to scan (over 2MB).';
    case 'unsupported_content_type':
      return 'That\u2019s not a web page we can read — we only score HTML.';
    case 'fetch_failed':
      return 'We couldn\u2019t reach the site at all.';
  }
}

/** Below this many visible-text characters, a page has nothing to sniff. */
export const MIN_READABLE_CHARS = 100;

/**
 * Bot-protection / captcha interstitials (Cloudflare, PerimeterX, DataDome…)
 * sometimes come back as HTTP 200 with a challenge page instead of content.
 * Scoring one would produce a garbage result, so we refuse loudly instead.
 * Patterns are conservative: challenge-specific titles, asset markers, and
 * phrases that never appear on real landing pages.
 */
export function isChallengePage(html: string, title: string, text: string): boolean {
  if (/<title[^>]*>\s*(just a moment|attention required)/i.test(html)) return true;
  if (/<title[^>]*>[^<]*captcha/i.test(html)) return true;
  if (/cf-chl|cf_chl|px-captcha|datadome/i.test(html)) return true;
  if (/verify you are human|are you a robot|complete the security check/i.test(`${title}\n${text}`)) return true;
  return false;
}

const TLS_ERROR_RE = /certificate|ssl|tls|EPROTO|UNABLE_TO_VERIFY|DEPTH_ZERO_SELF_SIGNED|ERR_TLS_CERT|CERT_/i;

/** TLS/cert failures get their own code (honest, actionable); everything
 *  else transport-level (refused, reset, hung up) stays `fetch_failed`. */
export function classifyTransportError(e: unknown): 'tls_error' | 'fetch_failed' {
  const msg = e instanceof Error ? e.message : String(e);
  return TLS_ERROR_RE.test(msg) ? 'tls_error' : 'fetch_failed';
}

/* ------------------------------------------------------------------ */
/* IP classification                                                   */
/* ------------------------------------------------------------------ */

function ipv4ToInt(ip: string): number {
  const p = ip.split('.').map(Number);
  return ((p[0] * 256 + p[1]) * 256 + p[2]) * 256 + p[3];
}

// [start, end] inclusive ranges that are NEVER public (RFC 1918, RFC 3927,
// RFC 5735/5737, CGNAT, multicast, reserved…). If it's on this list we refuse.
const IPV4_NONPUBLIC: Array<[number, number]> = [
  [ipv4ToInt('0.0.0.0'), ipv4ToInt('0.255.255.255')], // "this network"
  [ipv4ToInt('10.0.0.0'), ipv4ToInt('10.255.255.255')], // RFC 1918
  [ipv4ToInt('100.64.0.0'), ipv4ToInt('100.127.255.255')], // CGNAT (RFC 6598)
  [ipv4ToInt('127.0.0.0'), ipv4ToInt('127.255.255.255')], // loopback
  [ipv4ToInt('169.254.0.0'), ipv4ToInt('169.254.255.255')], // link-local (cloud metadata!)
  [ipv4ToInt('172.16.0.0'), ipv4ToInt('172.31.255.255')], // RFC 1918
  [ipv4ToInt('192.0.0.0'), ipv4ToInt('192.0.0.255')], // IETF special-purpose
  [ipv4ToInt('192.0.2.0'), ipv4ToInt('192.0.2.255')], // TEST-NET-1 (docs)
  [ipv4ToInt('192.168.0.0'), ipv4ToInt('192.168.255.255')], // RFC 1918
  [ipv4ToInt('198.18.0.0'), ipv4ToInt('198.19.255.255')], // benchmark (RFC 2544)
  [ipv4ToInt('198.51.100.0'), ipv4ToInt('198.51.100.255')], // TEST-NET-2 (docs)
  [ipv4ToInt('203.0.113.0'), ipv4ToInt('203.0.113.255')], // TEST-NET-3 (docs)
  [ipv4ToInt('224.0.0.0'), ipv4ToInt('239.255.255.255')], // multicast
  [ipv4ToInt('240.0.0.0'), ipv4ToInt('255.255.255.255')], // reserved
];

function ipv6ToBigInt(ip: string): bigint {
  // Split off an embedded IPv4 tail (::ffff:1.2.3.4) if present.
  let v4tail: number | null = null;
  let head = ip;
  const v4match = ip.match(/:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4match?.[1]) {
    v4tail = ipv4ToInt(v4match[1]);
    head = ip.slice(0, v4match.index);
  }
  const [left, right = ''] = head.split('::');
  const l = left ? left.split(':').filter(Boolean) : [];
  const r = right ? right.split(':').filter(Boolean) : [];
  const missing = 8 - l.length - r.length - (v4tail !== null ? 2 : 0);
  const groups = [...l, ...Array(Math.max(0, missing)).fill('0'), ...r];
  let out = 0n;
  for (const g of groups) out = (out << 16n) + BigInt(parseInt(g || '0', 16));
  if (v4tail !== null) out = (out << 32n) + BigInt(v4tail);
  return out;
}

function v6cidr(cidr: string): [bigint, bigint] {
  const [addr, bitsStr] = cidr.split('/');
  const bits = BigInt(Number(bitsStr));
  const base = ipv6ToBigInt(addr);
  const hostBits = 128n - bits;
  const mask = ((1n << 128n) - 1n) ^ ((1n << hostBits) - 1n);
  const start = base & mask;
  return [start, start | ((1n << hostBits) - 1n)];
}

const IPV6_NONPUBLIC: Array<[bigint, bigint]> = [
  v6cidr('::1/128'), // loopback
  v6cidr('::/128'), // unspecified
  v6cidr('64:ff9b::/96'), // NAT64 translation prefix
  v6cidr('100::/64'), // discard
  v6cidr('2001::/23'), // IETF special-purpose
  v6cidr('2001:db8::/32'), // documentation
  v6cidr('fc00::/7'), // unique-local (private)
  v6cidr('fe80::/10'), // link-local
  v6cidr('ff00::/8'), // multicast
];

/** True only for globally routable unicast addresses. Unknown formats → false (deny). */
export function isPublicIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) {
    const n = ipv4ToInt(ip);
    return !IPV4_NONPUBLIC.some(([a, b]) => n >= a && n <= b);
  }
  if (fam === 6) {
    // IPv4-mapped IPv6 (::ffff:a.b.c.d): judge by the embedded IPv4 address.
    const mapped = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped?.[1]) return isPublicIp(mapped[1]);
    const n = ipv6ToBigInt(ip.toLowerCase());
    return !IPV6_NONPUBLIC.some(([a, b]) => n >= a && n <= b);
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Endpoint validation (runs on the initial URL and EVERY redirect hop) */
/* ------------------------------------------------------------------ */

export interface ValidatedEndpoint {
  url: URL;
  ip: string;
  family: 4 | 6;
}

export async function validatedEndpoint(rawUrl: string): Promise<ValidatedEndpoint> {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > MAX_URL_LENGTH) {
    throw new FetchError('invalid_url', 'URL must be a non-empty string under 2048 chars');
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new FetchError('invalid_url', 'Malformed URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError('invalid_url', 'Only http:// and https:// URLs can be scanned');
  }
  if (url.username || url.password) {
    throw new FetchError('invalid_url', 'URLs containing credentials are not allowed');
  }
  const host = url.hostname
    .replace(/^\[([\s\S]*)\]$/, '$1') // strip brackets: http://[::1]/ → ::1
    .replace(/\.$/, '')
    .toLowerCase();
  if (!host) throw new FetchError('invalid_url', 'URL has no hostname');

  // Literal IP: check it directly, no DNS involved.
  if (isIP(host)) {
    if (!isPublicIp(host)) {
      throw new FetchError('ssrf_blocked', `Refusing to fetch non-public IP ${host}`);
    }
    return { url, ip: host, family: isIP(host) as 4 | 6 };
  }

  // Hostname: EVERY resolved address must be public. One private record = block.
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new FetchError('dns_error', `Could not resolve hostname ${host}`);
  }
  if (addrs.length === 0) throw new FetchError('dns_error', `No DNS records for ${host}`);
  for (const a of addrs) {
    if (!isPublicIp(a.address)) {
      throw new FetchError('ssrf_blocked', `Hostname ${host} resolves to non-public IP ${a.address}`);
    }
  }
  const first = addrs[0];
  return { url, ip: first.address, family: (first.family === 6 ? 6 : 4) as 4 | 6 };
}

/* ------------------------------------------------------------------ */
/* Low-level GET with the connection pinned to the validated IP        */
/* ------------------------------------------------------------------ */

export interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

/** Test seam: inject a stub to simulate redirect chains / huge bodies without network. */
export type StubGet = (url: URL, ip: string, family: 4 | 6) => Promise<RawResponse>;

function getHeader(headers: RawResponse['headers'], name: string): string | undefined {
  const v = headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Builds the DNS-pinning `lookup` for one validated endpoint.
 *
 * Node ≥20 resolves via Happy Eyeballs (`lookupAndConnectMultiple`) and calls
 * custom lookups with `{ all: true }`, expecting an ARRAY of
 * `{ address, family }`. Answering that call with a bare string makes Node
 * iterate the string's characters, destructure `.address` → `undefined`, and
 * fail the request with
 * `ERR_INVALID_IP_ADDRESS: Invalid IP address: undefined`.
 * Both shapes are honored here so the pin holds on every Node version.
 */
export function createPinnedLookup(
  ep: ValidatedEndpoint,
): (
  hostname: string,
  options: LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
) => void {
  return (_hostname, options, callback): void => {
    if (options.all) {
      // Happy-Eyeballs shape: an array holding our single pinned address.
      const arrayCb = callback as unknown as (
        err: NodeJS.ErrnoException | null,
        address: Array<{ address: string; family: number }>,
        family: number,
      ) => void;
      arrayCb(null, [{ address: ep.ip, family: ep.family }], ep.family);
    } else {
      callback(null, ep.ip, ep.family);
    }
  };
}

/** Real transport behind fetchPage. Exported for the transport regression test. */
export async function rawGet(
  ep: ValidatedEndpoint,
  signal: AbortSignal,
  stub?: StubGet,
): Promise<RawResponse> {
  if (stub) return stub(ep.url, ep.ip, ep.family);
  const isHttps = ep.url.protocol === 'https:';
  const reqFn = isHttps ? httpsRequest : httpRequest;
  return new Promise<RawResponse>((resolve, reject) => {
    const req = reqFn(
      ep.url,
      {
        method: 'GET',
        headers: {
          'user-agent': DESKTOP_UA,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
        },
        // Pin the socket to the validated IP. The request library performs NO
        // further DNS, so rebinding between validation and connect is impossible.
        // Host header and TLS SNI still use the real hostname.
        // `family` forces the single-lookup path: Happy-Eyeballs
        // re-resolution is pointless for an already-pinned IP.
        lookup: createPinnedLookup(ep),
        family: ep.family,
        servername: ep.url.hostname,
        signal,
      } as ClientRequestArgs,
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_BODY_BYTES) {
            req.destroy();
            reject(new FetchError('body_too_large', `Response exceeded the ${MAX_BODY_BYTES}-byte cap`));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers as RawResponse['headers'], body: Buffer.concat(chunks) }),
        );
        res.on('error', (e) =>
          reject(new FetchError(classifyTransportError(e), `Response error: ${(e as Error).message}`)),
        );
      },
    );
    req.on('error', (e) =>
      reject(new FetchError(classifyTransportError(e), `Request error: ${(e as Error).message}`)),
    );
    req.on('timeout', () => req.destroy());
    req.end();
  });
}

/* ------------------------------------------------------------------ */
/* HTML → text / links / images extraction (no dependencies)            */
/* ------------------------------------------------------------------ */

export interface PageLink {
  href: string;
  text: string;
}
export interface PageImage {
  src: string;
  alt: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ');
}

/** Visible text with scripts, styles, templates, svg and <nav> stripped. Footer kept (© year). */
export function extractVisibleText(html: string): string {
  let t = html;
  t = t.replace(/<script[\s>][\s\S]*?<\/script\s*>/gi, ' ');
  t = t.replace(/<style[\s>][\s\S]*?<\/style\s*>/gi, ' ');
  t = t.replace(/<noscript[\s>][\s\S]*?<\/noscript\s*>/gi, ' ');
  t = t.replace(/<template[\s>][\s\S]*?<\/template\s*>/gi, ' ');
  t = t.replace(/<svg[\s>][\s\S]*?<\/svg\s*>/gi, ' ');
  t = t.replace(/<nav[\s>][\s\S]*?<\/nav\s*>/gi, ' ');
  t = t.replace(/<!--[\s\S]*?-->/g, ' ');
  // Preserve block boundaries as newlines so sentence splitting survives tag removal.
  t = t.replace(/<\/(p|div|h[1-6]|li|tr|td|section|article|header|footer|blockquote|dd|dt)>/gi, '\n');
  t = t.replace(/<(br|hr)[\s/>]/gi, '\n');
  t = t.replace(/<[^>]+>/g, ' ');
  t = decodeEntities(t);
  return t
    .replace(/[ \t\u00a0\u2000-\u200b]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

export function extractLinks(html: string, base: string): PageLink[] {
  const links: PageLink[] = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && links.length < MAX_LINKS) {
    const rawHref = m[1].trim();
    if (!rawHref || rawHref.startsWith('#') || rawHref.toLowerCase().startsWith('javascript:')) continue;
    let href = rawHref;
    try {
      href = new URL(rawHref, base).toString();
    } catch {
      continue;
    }
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 200);
    links.push({ href, text });
  }
  return links;
}

export function extractImages(html: string): PageImage[] {
  const images: PageImage[] = [];
  const re = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && images.length < MAX_IMAGES) {
    const tag = m[0];
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() ?? '';
    const alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1]?.trim() ?? '';
    if (src) images.push({ src: src.slice(0, 500), alt: decodeEntities(alt).slice(0, 200) });
  }
  return images;
}

export function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title\s*>/i);
  return m ? decodeEntities(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 200) : '';
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

export interface PageFetch {
  html: string;
  finalUrl: string;
  text: string;
  title: string;
  links: PageLink[];
  images: PageImage[];
  contentType: string;
}

export interface FetchOptions {
  timeoutMs?: number;
  /** Test seam: stub the network layer (redirect chains, huge bodies, hangs). */
  stub?: StubGet;
}

export async function fetchPage(rawUrl: string, opts: FetchOptions = {}): Promise<PageFetch> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    let current = rawUrl;
    let hops = 0;
    let finalUrl = '';
    let res: RawResponse;

    for (;;) {
      const ep = await validatedEndpoint(current); // re-validated on EVERY hop
      // Race the request against the abort signal so a hanging upstream
      // (or stub) can't outlive the timeout — the await must always settle.
      // The loser's rejection is swallowed: the race already reported it.
      const getPromise = rawGet(ep, controller.signal, opts.stub);
      getPromise.catch(() => {});
      let onAbort: (() => void) | undefined;
      const abortPromise = new Promise<never>((_, reject) => {
        onAbort = () =>
          reject(new FetchError('timeout', `Fetch exceeded the ${opts.timeoutMs ?? FETCH_TIMEOUT_MS}ms timeout`));
        if (controller.signal.aborted) onAbort();
        else controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      try {
        res = await Promise.race([getPromise, abortPromise]);
      } finally {
        if (onAbort) controller.signal.removeEventListener('abort', onAbort);
      }
      finalUrl = ep.url.toString();
      const location = getHeader(res.headers, 'location');
      if (res.status >= 300 && res.status < 400 && location) {
        hops += 1;
        if (hops > MAX_REDIRECTS) {
          throw new FetchError('too_many_redirects', `Exceeded the ${MAX_REDIRECTS}-redirect limit`);
        }
        try {
          current = new URL(location, ep.url).toString();
        } catch {
          throw new FetchError('fetch_failed', 'Redirect had an invalid Location header');
        }
        continue;
      }
      break;
    }

    if (res!.status === 403 || res!.status === 429) {
      // The site refused OUR scanner specifically — a bot wall, not a
      // broken page. Reported honestly as `blocked`, never scored.
      throw new FetchError('blocked', `Upstream refused the scan (HTTP ${res!.status})`, res!.status);
    }
    if (res!.status >= 400) {
      throw new FetchError('http_error', `Upstream returned HTTP ${res!.status}`, res!.status);
    }
    // Belt-and-braces: the streaming check in rawGet aborts early, but a
    // stubbed/injected transport could hand back an oversized body at once.
    if (res!.body.length > MAX_BODY_BYTES) {
      throw new FetchError('body_too_large', `Response exceeded the ${MAX_BODY_BYTES}-byte cap`);
    }
    const contentType = getHeader(res!.headers, 'content-type') ?? '';
    // We score landing pages, not PDFs or images. Missing header → assume HTML.
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
      throw new FetchError('unsupported_content_type', `Refusing to score content-type "${contentType}"`);
    }

    const html = res!.body.toString('utf8');
    const text = extractVisibleText(html);
    const title = extractTitle(html);
    // A 200 with a captcha / bot-protection interstitial instead of content:
    // refuse loudly rather than scoring garbage.
    if (isChallengePage(html, title, text)) {
      throw new FetchError('blocked', 'Bot-protection challenge page detected');
    }
    // A page with nothing readable (JS shell, empty body) would score as
    // suspiciously perfect — honest failure instead of a fake result.
    if (text.trim().length < MIN_READABLE_CHARS) {
      throw new FetchError(
        'empty_page',
        `Only ${text.trim().length} readable characters on the page`,
      );
    }
    return {
      html,
      finalUrl,
      text,
      title,
      links: extractLinks(html, finalUrl),
      images: extractImages(html),
      contentType,
    };
  } catch (e) {
    if (controller.signal.aborted && !(e instanceof FetchError)) {
      throw new FetchError('timeout', 'Fetch timed out');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
