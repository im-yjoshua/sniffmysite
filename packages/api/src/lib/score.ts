/**
 * Vapor Score v2 — the scoring engine (§2.4).
 *
 * Six metrics, each 0–100 (higher = more vapor), combined by fixed weights
 * that sum to 100. Every constant below is documented and was calibrated
 * against the 20-site fixture suite (see PROGRESS.md); change a constant and
 * you change history, so bump ALGO_VERSION if you touch the formula.
 *
 * v2 changes (2026-09-22, full audit trail in PROGRESS.md):
 *  1. Language guard: the buzzword/claim/vague detectors only smell
 *     English. On non-Latin-dominant pages those three checks are skipped
 *     and the remaining weights renormalize to 100.
 *  2. AI-slop additions to the buzzword lexicon ("delve", "tapestry",
 *     "furthermore", …) — 2025–26 LLM filler the old lexicon missed.
 *  3. "best practices" no longer counts as a grand claim (negative
 *     lookahead on the `best` pattern).
 *  4. Pricing v2: real price signals ($20/mo, per user, free tier, …) now
 *     required — a bare /pricing link with no numbers scores 50.
 *  5. Evidence links counted from main content only (nav/footer chrome
 *     stripped) — the proof discount is earned, not free.
 *  6. Freshness: unknown © lowered 30 → 15, age curve smoothed
 *     (0/20/40/70).
 *
 * THE PUBLIC NUMBER: the Sniff Score. The engine measures VAPOR internally
 * (higher = more hype) with the six checks below — that math is untouched.
 * What users see is the flipped number: sniff = 100 − vapor, so 100 is
 * certified real and 0 is pure vapor. The conversion lives in exactly ONE
 * place — sniffScoreFor() — and display layers must never show a raw vapor
 * number. Tiers are keyed off the sniff score.
 *
 * Satire guardrail (§2.12): the verdict roasts the PAGE, never people.
 * It quotes the site's own marketing phrases and structural facts only —
 * no names of any kind are extracted or emitted.
 */
import { createHash } from 'node:crypto';
import { extractImages, extractLinks, extractTitle, extractVisibleText } from './fetch';

export const ALGO_VERSION = 'v2' as const;

/** Metric weights — MUST sum to 100 (asserted in tests). */
export const WEIGHTS = {
  buzzword_density: 25,
  claim_to_proof: 25,
  vague_verb: 15,
  social_proof: 15,
  pricing_opacity: 10,
  freshness: 10,
} as const;

/** Public tiers — keyed off the SNIFF score (higher = more real).
 * 81+ CERTIFIED REAL · 61–80 ALMOST REAL · 41–60 SUS
 * 21–40 JUST VIBES · 0–20 CERTIFIED FAKE.
 * This is the same partition as the old vapor-keyed tiers, flipped:
 * sniff = 100 − vapor, so the boundaries sit in exactly the same places. */
export type Tier =
  | 'CERTIFIED REAL'
  | 'ALMOST REAL'
  | 'SUS'
  | 'JUST VIBES'
  | 'CERTIFIED FAKE';

/** Tier for a SNIFF score (0–100, higher = more real). */
export function tierFor(sniff: number): Tier {
  if (sniff >= 81) return 'CERTIFIED REAL';
  if (sniff >= 61) return 'ALMOST REAL';
  if (sniff >= 41) return 'SUS';
  if (sniff >= 21) return 'JUST VIBES';
  return 'CERTIFIED FAKE';
}

export interface MetricScores {
  buzzword_density: number;
  claim_to_proof: number;
  vague_verb: number;
  social_proof: number;
  pricing_opacity: number;
  freshness: number;
}

export interface PhraseHit {
  phrase: string;
  count: number;
}

/** Raw counts behind the scores — useful for debugging and verdict copy. */
export interface ScoreEvidence {
  words: number;
  sentences: number;
  buzzword_hits: number;
  top_phrases: PhraseHit[];
  claim_sentences: number;
  evidence_links: number;
  vague_sentences: number;
  trust_mentions: number;
  anonymous_testimonials: number;
  logo_images: number;
  has_pricing: boolean;
  has_price_signals: boolean;
  sales_only_cta: boolean;
  copyright_year: number | null;
  /**
   * Set when the page's visible text is not predominantly Latin-script
   * English. The buzzword / claim / vague-verb detectors only smell
   * English, so those checks were skipped and the remaining weights
   * renormalized to 100. Display layers may show this as a small note.
   */
  language_note: string | null;
}

export interface ScanResult {
  /** Internal vapor measurement (higher = more hype). Kept in the payload
   * for transparency — display layers must show sniff_score instead. */
  vapor_score: number;
  /** THE public number: 100 − vapor_score. This is what every display
   * layer shows. */
  sniff_score: number;
  /** Tier for the SNIFF score (see tierFor). */
  tier: Tier;
  metrics: MetricScores;
  verdict: string;
  algo_version: typeof ALGO_VERSION;
  /** sha256 of the normalized visible text — pins the score to the exact page version (§2.12). */
  snapshot_hash: string;
  url: string;
  scanned_at: string;
  evidence: ScoreEvidence;
}

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/**
 * THE public-number conversion — the one clean place. Sniff = 100 − vapor,
 * rounded to an integer and clamped to 0–100. 0 = pure vapor, 100 =
 * certified real. Every display layer (leaderboard, profiles, share cards)
 * reads sniff_score from the API and never converts vapor itself.
 */
export function sniffScoreFor(vapor: number): number {
  return clamp(Math.round(100 - vapor));
}

/* ------------------------------------------------------------------ */
/* 1. Buzzword density (25%)                                           */
/* ------------------------------------------------------------------ */

// The vapor lexicon. Deliberately EXCLUDES neutral dev vocabulary
// ("scalable", "robust", "open source") so legit infra pages don't inflate.
const BUZZWORDS = [
  'ai-powered', 'ai powered',
  'revolutionize', 'revolutionizing', 'revolutionary',
  'cutting-edge', 'cutting edge',
  'game-changer', 'game changer', 'game-changing', 'game changing',
  'unlock', 'unlocks', 'unlocking', 'unlocked',
  'supercharge', 'supercharged', 'supercharging',
  'next-gen', 'next gen', 'next-generation', 'next generation',
  'seamless', 'seamlessly',
  'leverage', 'leveraging', 'leveraged',
  'disrupt', 'disrupts', 'disrupting', 'disruption', 'disruptive',
  'synergy', 'synergies',
  'paradigm', 'paradigm shift',
  'holistic', 'holistically',
  'end-to-end', 'end to end',
  'world-class', 'world class',
  'state-of-the-art', 'state of the art',
  'turbocharge', 'turbocharged', 'turbocharging',
  'elevate', 'elevates', 'elevating',
  'frictionless',
  'groundbreaking',
  'unprecedented',
  'reimagine', 'reimagined', 'reimagining',
  'unleash', 'unleashed', 'unleashing',
  'empower', 'empowers', 'empowering',
  'transform', 'transforms', 'transforming', 'transformation', 'transformative',
  'future-proof', 'future proof',
  'best-in-class', 'best in class',
  'all-in-one', 'all in one',
  'one-stop',
  'magical', 'magically',
  'delight', 'delights', 'delightful',
  '10x', '100x',
  'move the needle',
  'secret sauce',
  // --- Current-era (2025–26) hype vocabulary. The classic lexicon above
  // catches 2021-era copy ("synergy", "paradigm"); real AI landing pages
  // now hype with these instead. Calibrated against the 20-site fixture
  // suite: sober dev pages rarely use them, hype pages can't stop.
  'agentic',
  'ai agents', 'ai agent',
  'on autopilot', 'autopilot',
  'effortlessly', 'effortless',
  'instantly',
  'in seconds',
  'say goodbye to', 'goodbye to',
  'superhuman',
  'unfair advantage',
  'skyrocket', 'skyrockets', 'skyrocketing',
  'lightning-fast', 'lightning fast',
  'blazing-fast', 'blazing fast',
  'one-click', 'one click',
  'done-for-you', 'done for you',
  'enterprise-grade', 'enterprise grade',
  'bank-level', 'bank level', 'military-grade', 'military grade',
  'no-code', 'no code',
  'like magic',
  'at the click of a button',
  'set and forget',
  'secret weapon',
  'limitless',
  'never been easier', 'has never been easier',
  'redefine', 'redefines', 'redefined', 'redefining',
  'reinvent', 'reinvents', 'reinvented', 'reinventing',
  'from zero to',
  // --- LLM-slop tell-words (2025–26). The classic lexicon catches 2021-era
  // copy; AI-written landing pages now hype with these instead. Each was
  // checked against the 20-site fixture suite: rare on sober dev pages,
  // common on hype pages. "landscape" is deliberately NOT bare — only the
  // LLM-phrases "digital landscape" / "evolving landscape" count, since
  // legit pages write about competitive landscapes.
  'delve', 'delves', 'delving',
  'tapestry',
  'furthermore',
  'moreover',
  "in today's fast-paced",
  "it's important to note",
  'in the ever-evolving',
  'digital landscape',
  'evolving landscape',
];
// Matches hyper-personalized, hyper-growth, hyperscale… — the laziest prefix in SaaS.
const HYPER_RE = /\bhyper[\w-]*/g;

/**
 * Buzzwords per 100 words, scaled to 0–100.
 * BUZZWORD_SLOPE = 20: ~5 hits/100 words saturates. Calibrated against the
 * 20-site fixture suite (2026-09-20): real hype-drunk AI pages sit at
 * 1–2.5/100 (20–50 pts); sober dev-tool pages sit under ~0.3/100 (<6 pts).
 * The old slope of 12 was tuned on a synthetic fixture and let every real
 * page off the hook.
 */
const BUZZWORD_SLOPE = 20;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countBuzzwords(text: string): { hits: number; top: PhraseHit[] } {
  const lower = text.toLowerCase();
  // Longest phrases first so "revolutionizing" wins over "revolutionize"
  // on the same span — each span counts exactly once.
  const alts = [...BUZZWORDS].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
  const re = new RegExp(`\\b(?:${alts})\\b`, 'g');
  const counts = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower)) !== null) {
    counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
  }
  const hyper = lower.match(HYPER_RE) ?? [];
  if (hyper.length > 0) counts.set('hyper-*', hyper.length);
  const top = [...counts.entries()]
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase))
    .slice(0, 8);
  const hits = [...counts.values()].reduce((a, b) => a + b, 0);
  return { hits, top };
}

/* ------------------------------------------------------------------ */
/* 2. Claim-to-proof ratio (25%)                                       */
/* ------------------------------------------------------------------ */

const CLAIM_PATTERNS = [
  /\brevolutioniz\w*/i,
  /#1\b/,
  /\bnumber one\b/i,
  // "best practices" is an innocent compound (docs, style guides) — the
  // negative lookahead keeps grand-claim detection honest. Changed in v2:
  // was /\bbest\b/i, which fired on every best-practices mention.
  /\bbest\b(?!\s+practices\b)/i,
  /\bfirst ever\b/i,
  /world'?s first/i,
  /\b10x\b/,
  /\b100x\b/,
  /\bguarantee\w*/i,
  /\bnever before\b/i,
  /\bunprecedented\b/i,
  /\bgame-?chang\w*/i,
  /\bcutting-?edge\b/i,
  /\bmarket-?lead\w*/i,
  /\bindustry-?lead\w*/i,
  /\bmost powerful\b/i,
  /\bultimate\b/i,
];

// Links that constitute evidence a real product exists behind the copy.
const EVIDENCE_PATTERNS = [
  /\/docs?\b/i, /documentation/i, /pricing/i, /\bdemo\b/i, /github\.com/i,
  /changelog/i, /\/api\b/i, /\bapi\b/i, /\bstatus\b/i, /download/i,
  /whitepaper/i, /case[- ]stud/i, /tutorial/i, /quickstart/i,
  /playground/i, /open[- ]source/i, /\bblog\b/i,
];

/**
 * Grand-claim sentences per 100 sentences, discounted by evidence.
 * CLAIM_SLOPE = 9: ~11 claim-sentences/100 saturates before the discount.
 * EVIDENCE_FULL_AT = 8: eight distinct evidence links earn the max discount.
 * PROOF_DISCOUNT = 0.5: evidence MITIGATES grand claims, it doesn't erase
 * them — a docs link shouldn't zero out twenty "world's first" claims.
 * (The old 0.75 discount let every real page with a nav bar off the hook.)
 */
const CLAIM_SLOPE = 9;
const EVIDENCE_FULL_AT = 8;
const PROOF_DISCOUNT = 0.5;

function isEvidenceLink(href: string, text: string): boolean {
  return EVIDENCE_PATTERNS.some((re) => re.test(href) || re.test(text));
}

/* ------------------------------------------------------------------ */
/* 3. Vague-verb index (15%)                                           */
/* ------------------------------------------------------------------ */

// A sentence is "concrete" if it names something checkable: a number, money,
// a version, a proper noun, or a specific product artifact. Everything else
// with 5+ words is vibes.
//
// Headline-style guard: marketing copy capitalizes Every Word, which is not
// the same as naming a proper noun. If over half the (non-first) words are
// capitalized, the capitalization carries no proper-noun signal and the
// sentence can't claim concreteness through it.
function isConcreteSentence(s: string): boolean {
  if (/\d/.test(s)) return true;
  if (/[$€£¥%]/.test(s)) return true;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const rest = words.slice(1);
    const capped = rest.filter((w) => /^[A-Z]/.test(w)).length;
    const headlineStyle = capped / rest.length > 0.5;
    if (!headlineStyle && rest.some((w) => /^[A-Z][a-z]{1,}/.test(w))) return true; // proper noun
  }
  if (/\b(API|SDK|CLI|SSO|SOC\s?2|GitHub|dashboard|pricing|docs|changelog)\b/i.test(s)) return true;
  return false;
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?…\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/* ------------------------------------------------------------------ */
/* 4. Social-proof sketchiness (15%)                                   */
/* ------------------------------------------------------------------ */

/** First hostname label of the scanned URL ("stripe" for stripe.com).
 *  Used to exclude the site's own logo from logo-wall detection.
 *  Returns '' for single-char labels (e.g. x.ai) to avoid \bx\b matching
 *  every other word. */
function ownBrandLabel(url: string): string {
  try {
    const label = new URL(url).hostname.replace(/^www\./i, '').split('.')[0] ?? '';
    return label.length >= 3 ? label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
  } catch {
    return '';
  }
}

const TRUST_PHRASES = /trusted by|loved by|used by|join [\d,]+\+?/gi;
// NOTE: bare "powering" was deliberately removed (2026-09-20 calibration).
// "Powering businesses of all sizes" is a product statement, not a
// social-proof claim — the sketch pattern per §2.4 is unattributed
// ENDORSEMENT ("trusted by …" with no names), not the verb "power".
// "…," Name, Title  → named. Quote followed by a bare role → anonymous.
const ANON_TESTIMONIAL_RE =
  /"[^"]{25,220}"\s*[-–—]\s*(?:([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*,)?\s*(CEO|CMO|CTO|CFO|VP|SVP|founder|co-founder|head of [a-z ]+|marketing manager|product manager|director)\b/gi;

/**
 * Sketch points, capped at 100:
 *  +45 "trusted by…" with no named companies nearby,
 *  +30 per anonymous (role-only) testimonial, capped at 30,
 *  +30 logo wall: 4+ brand-logo images NOT wrapped in links. Per §2.4 the
 *    sketch pattern is "logo walls without links" — an unlinked logo is an
 *    unverifiable endorsement. (The old page-level `links.length < 15`
 *    condition was dead code: every real page has 100+ nav links.)
 */
const TRUST_NO_NAMES_PTS = 45;
const ANON_TESTIMONIAL_PTS = 30;
const LOGO_WALL_PTS = 30;
const LOGO_WALL_MIN = 4;

/* ------------------------------------------------------------------ */
/* 5. Pricing opacity (10%)                                            */
/* ------------------------------------------------------------------ */

const SALES_ONLY_RE = /contact sales|talk to sales|book a demo|request a demo|schedule a demo|get a demo/i;
// No pricing page but real dev artifacts (docs/GitHub) → softer penalty.
const NO_PRICING_DEV_MITIGATED = 40;
const NO_PRICING_SALES_ONLY = 75;
const NO_PRICING_BARE = 100;

/* ------------------------------------------------------------------ */
/* 6. Freshness (10%)                                                  */
/* ------------------------------------------------------------------ */

// ©-year age → points. No © found → mild 15 (unknown, not guilty — the
// old 30 punished minimal pages for the crime of minimalism).
const FRESHNESS_UNKNOWN = 15;

/* ------------------------------------------------------------------ */
/* Verdict copy — reverse psychology. The lab is GRUDGING about good      */
/* scores and DELIGHTED by bad ones. Roasts the page's own words; NEVER   */
/* names people: only buzzword phrases + structural facts.                */
/* ------------------------------------------------------------------ */

function buildVerdict(
  sniff: number,
  tier: Tier,
  top: PhraseHit[],
  claimSentences: number,
  missing: string[],
  evidence: ScoreEvidence,
): string {
  const quoted =
    top.length > 0
      ? top
          .slice(0, 3)
          .map((p) => `"${p.phrase}" ×${p.count}`)
          .join(', ')
      : 'zero buzzwords detected';
  // Join detail bits with commas only where bits exist — no stray ", —".
  const bits = [quoted];
  if (claimSentences > 0) bits.push(`${claimSentences} grand claim${claimSentences === 1 ? '' : 's'}`);
  const detail = bits.join(', ');
  // Grammar guard: every missing item already reads "no X", so the joiner
  // must NOT add a second negative. The old template produced
  // "no live demo is nowhere to be found" — a double negative.
  const missingStr =
    missing.length > 0 ? ` — and ${missing.slice(0, 3).join(', ')} to be found` : '';

  switch (tier) {
    case 'CERTIFIED REAL': {
      // Grudging respect. Ground the praise in real findings: pricing and
      // the actual hype-word count, never invented.
      const hype =
        evidence.buzzword_hits === 0
          ? 'zero hype words'
          : `only ${evidence.buzzword_hits} hype word${evidence.buzzword_hits === 1 ? '' : 's'}`;
      return `${sniff}/100. Fine. ${evidence.has_pricing ? 'Prices are public, ' : ''}the claims stay in their lane, and we found ${hype}. We checked twice.`;
    }
    case 'ALMOST REAL':
      // Damning with faint praise, plus the one real finding.
      return `${sniff}/100. So close. Yet so far. ${detail}${missingStr} — one honest paragraph and this page would put us out of a job.`;
    case 'SUS':
      // The fulcrum — the classic sus voice, unchanged in spirit.
      return `${sniff}/100 — solidly sus. ${detail}${missingStr}. Proceed with eyebrows raised.`;
    case 'JUST VIBES':
      return `${sniff}/100. This page is just vibes: ${detail}${missingStr}. Somewhere under the adjectives there might be a product. Might.`;
    case 'CERTIFIED FAKE':
      // The lab is thrilled.
      return `A new record! ${sniff}/100 — we've mounted this landing page on the Wall of Shame. ${detail}${missingStr}.`;
  }
}

/* ------------------------------------------------------------------ */
/* Language guard (v2) + chrome stripping (v2)                        */
/* ------------------------------------------------------------------ */

const LANGUAGE_NOTE = 'nose only smells English — hype checks skipped';

/**
 * True when the page's visible text is not predominantly Latin-script
 * English. The buzzword, grand-claim, and vague-verb detectors only smell
 * English: on a German/Japanese/Arabic page they would either hand out a
 * fake clean bill ("zero hype words found!") or trip on coincidence. When
 * this fires, those three checks are skipped (metrics read 0) and the
 * remaining three weights renormalize to 100, so the page is judged only
 * on the language-independent checks: social proof, pricing, freshness.
 * Needs 50+ letters before it dares to judge.
 */
function isNonEnglishText(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 50) return false;
  const latin = letters.filter((ch) => ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z').length;
  return latin / letters.length < 0.5;
}

/**
 * Strip header/nav/footer chrome (and common nav/menu containers) from the
 * HTML before counting evidence links. §2.4's proof discount is for EVIDENCE
 * — docs, changelog, live demo — and every real page's nav bar already
 * links those, which maxed the discount for free. Main content only now.
 */
function stripChrome(html: string): string {
  let h = html.replace(/<(header|nav|footer)[\s>][\s\S]*?<\/\1\s*>/gi, ' ');
  h = h.replace(
    /<div\b[^>]*\bclass\s*=\s*["'][^"']*\b(nav|navbar|nav-bar|menu|menubar|site-?header|site-?footer|topbar|breadcrumb)\b[^"']*["'][^>]*>[\s\S]*?<\/div\s*>/gi,
    ' ',
  );
  return h;
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export function scorePage(html: string, url: string, now: Date = new Date()): ScanResult {
  const text = extractVisibleText(html);
  const title = extractTitle(html);
  const links = extractLinks(html, url);
  const images = extractImages(html);
  const fullText = `${title}\n${text}`;
  // Evidence links (§2.4 proof discount) are counted from main content
  // only — nav/footer chrome is stripped so real pages don't max the
  // discount for free. Pricing/missing-link detection still uses the full
  // link list: a /pricing link in the footer is still a pricing link.
  const contentLinks = extractLinks(stripChrome(html), url);

  const words = fullText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = splitSentences(fullText).filter((s) => s.split(/\s+/).length >= 3);

  // --- Language guard (v2) ---
  // The hype detectors only smell English. On non-English pages, skip
  // buzzword/claim/vague entirely and judge on the remaining three checks.
  const languageSkipped = isNonEnglishText(fullText);

  // --- 1. Buzzword density ---
  const { hits: buzzHits, top: topPhrases } = languageSkipped
    ? { hits: 0, top: [] as PhraseHit[] }
    : countBuzzwords(fullText);
  const buzzDensity = wordCount > 0 ? (buzzHits / wordCount) * 100 : 0;
  const mBuzzword = clamp(buzzDensity * BUZZWORD_SLOPE);

  // --- 2. Claim-to-proof ---
  const claimSentences = languageSkipped
    ? 0
    : sentences.filter((s) => CLAIM_PATTERNS.some((re) => re.test(s))).length;
  // Evidence counted from MAIN CONTENT only (v2) — the proof discount must
  // be earned by the page, not gifted by its nav bar.
  const evidenceLinks = contentLinks.filter((l) => isEvidenceLink(l.href, l.text)).length;
  const claimDensity = sentences.length > 0 ? (claimSentences / sentences.length) * 100 : 0;
  const proofFactor = 1 - PROOF_DISCOUNT * Math.min(1, evidenceLinks / EVIDENCE_FULL_AT);
  const mClaimProof = clamp(claimDensity * CLAIM_SLOPE * proofFactor);

  // --- 3. Vague-verb index ---
  const judged = sentences.filter((s) => s.split(/\s+/).length >= 5);
  const vague = languageSkipped ? 0 : judged.filter((s) => !isConcreteSentence(s)).length;
  const mVague = judged.length > 0 ? clamp((vague / judged.length) * 100) : 0;

  // --- 4. Social-proof sketchiness ---
  let mSocial = 0;
  const trustMatches = [...fullText.matchAll(TRUST_PHRASES)];
  if (trustMatches.length > 0) {
    const named = trustMatches.reduce((acc, mt) => {
      const window = fullText.slice((mt.index ?? 0) + mt[0].length, (mt.index ?? 0) + mt[0].length + 300);
      const names = window.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) ?? [];
      return acc + names.length;
    }, 0);
    if (named < trustMatches.length) mSocial += TRUST_NO_NAMES_PTS; // "trusted by" + no names = sketchy
  }
  const anonTestimonials = [...fullText.matchAll(ANON_TESTIMONIAL_RE)].filter((mt) => !mt[1]).length;
  if (anonTestimonials > 0) mSocial += ANON_TESTIMONIAL_PTS;
  // Unwrapped logos: strip link-wrapped content, recount. Unlinked brand
  // logos presented as endorsement are unverifiable (§2.4). The site's OWN
  // logo is excluded — brand imagery named after itself ("…imitating the
  // Stripe logo") is not a customer logo wall.
  const htmlNoAnchors = html.replace(/<a[\s>][\s\S]*?<\/a\s*>/gi, ' ');
  const ownLabel = ownBrandLabel(url);
  const isLogoImg = (img: { alt: string; src: string }): boolean => {
    const s = `${img.alt} ${img.src}`;
    if (!/logo/i.test(s)) return false;
    if (ownLabel && new RegExp(`\\b${ownLabel}\\b`, 'i').test(s)) return false;
    return true;
  };
  const logoImages = images.filter(isLogoImg).length;
  const unwrappedLogos = extractImages(htmlNoAnchors).filter(isLogoImg).length;
  if (unwrappedLogos >= LOGO_WALL_MIN) mSocial += LOGO_WALL_PTS;
  mSocial = clamp(mSocial);

  // --- 5. Pricing opacity (v2) ---
  // Real price signals: currency amounts ($20, €9), /mo /month /year,
  // "per user"/"per seat", "free tier"/"free plan". A /pricing link with
  // zero actual prices is the page hiding the numbers — it scores 50,
  // not 0. Prices stated but no pricing page → 30 (the info exists, just
  // not where you'd look).
  const PRICE_SIGNAL_RE = /[$€£¥]\s*\d|\/(mo|month|year)\b|per user|per seat|free tier|free plan/i;
  const PRICING_LINK_NO_SIGNALS = 50;
  const PRICING_SIGNALS_NO_LINK = 30;
  const hasPricing = links.some((l) => /pricing/i.test(l.href) || /pricing/i.test(l.text));
  const hasPriceSignals = PRICE_SIGNAL_RE.test(fullText);
  const salesOnly = !hasPricing && SALES_ONLY_RE.test(fullText);
  const mPricing = hasPricing
    ? hasPriceSignals
      ? 0
      : PRICING_LINK_NO_SIGNALS
    : salesOnly
      ? NO_PRICING_SALES_ONLY
      : hasPriceSignals
        ? PRICING_SIGNALS_NO_LINK
        : evidenceLinks >= 2
          ? NO_PRICING_DEV_MITIGATED
          : NO_PRICING_BARE;

  // --- 6. Freshness (v2) ---
  // Age curve smoothed: 0yr → 0, 1yr → 20, 2yr → 40, 3+yr → 70.
  const years = [...fullText.matchAll(/(?:©|\(c\)|copyright)\s*(19|20)(\d{2})/gi)].map((mt) => Number(`20${mt[2]}`));
  // Also catch year ranges like "© 2020–2026": take the max year on the page.
  const allYears = [...fullText.matchAll(/\b(20\d{2})\b/g)].map((mt) => Number(mt[1]));
  const copyrightYear = years.length > 0 ? Math.max(...years) : null;
  const newestYear = allYears.length > 0 ? Math.max(...allYears) : null;
  const refYear = copyrightYear ?? newestYear;
  const currentYear = now.getFullYear();
  let mFreshness: number;
  if (refYear === null) {
    mFreshness = FRESHNESS_UNKNOWN;
  } else {
    const age = currentYear - refYear;
    mFreshness = age <= 0 ? 0 : age === 1 ? 20 : age === 2 ? 40 : 70;
  }

  const metrics: MetricScores = {
    buzzword_density: mBuzzword,
    claim_to_proof: mClaimProof,
    vague_verb: mVague,
    social_proof: mSocial,
    pricing_opacity: mPricing,
    freshness: mFreshness,
  };

  // The language guard (v2): when the hype detectors are skipped, their
  // weights are EXCLUDED and the remaining weights renormalize to 100 —
  // a skipped check must not drag the score toward zero. Weights still
  // sum to 100 in the normal case (asserted in tests).
  const activeTotal = languageSkipped
    ? WEIGHTS.social_proof + WEIGHTS.pricing_opacity + WEIGHTS.freshness
    : 100;
  const vapor_score = clamp(
    (metrics.buzzword_density * (languageSkipped ? 0 : WEIGHTS.buzzword_density) +
      metrics.claim_to_proof * (languageSkipped ? 0 : WEIGHTS.claim_to_proof) +
      metrics.vague_verb * (languageSkipped ? 0 : WEIGHTS.vague_verb) +
      metrics.social_proof * WEIGHTS.social_proof +
      metrics.pricing_opacity * WEIGHTS.pricing_opacity +
      metrics.freshness * WEIGHTS.freshness) /
      activeTotal,
  );
  // The public number is the FLIP of the internal vapor measurement.
  // sniffScoreFor() is the one clean place this conversion happens —
  // the engine's constants, weights, and calibration are untouched.
  const sniff_score = sniffScoreFor(vapor_score);
  const tier = tierFor(sniff_score);

  // Missing-evidence list for the verdict (structural facts only).
  const missing: string[] = [];
  if (!hasPricing) missing.push('no pricing page');
  if (!links.some((l) => /\/docs?\b|documentation/i.test(l.href) || /docs|documentation/i.test(l.text))) missing.push('no docs link');
  if (!links.some((l) => /\bdemo\b/i.test(l.href) || /\bdemo\b/i.test(l.text))) missing.push('no live demo');
  if (!links.some((l) => /github\.com/i.test(l.href))) missing.push('no GitHub');

  const evidence: ScoreEvidence = {
    words: wordCount,
    sentences: sentences.length,
    buzzword_hits: buzzHits,
    top_phrases: topPhrases.slice(0, 5),
    claim_sentences: claimSentences,
    evidence_links: evidenceLinks,
    vague_sentences: vague,
    trust_mentions: trustMatches.length,
    anonymous_testimonials: anonTestimonials,
    logo_images: logoImages,
    has_pricing: hasPricing,
    has_price_signals: hasPriceSignals,
    sales_only_cta: salesOnly,
    copyright_year: copyrightYear,
    language_note: languageSkipped ? LANGUAGE_NOTE : null,
  };

  const verdict = buildVerdict(sniff_score, tier, topPhrases, claimSentences, missing, evidence);

  // snapshot_hash pins the score to the exact page version scanned (§2.12).
  const normalized = fullText.toLowerCase().replace(/\s+/g, ' ').trim();
  const snapshot_hash = createHash('sha256').update(normalized, 'utf8').digest('hex');

  return {
    vapor_score,
    sniff_score,
    tier,
    metrics,
    verdict,
    algo_version: ALGO_VERSION,
    snapshot_hash,
    url,
    scanned_at: now.toISOString(),
    evidence,
  };
}
