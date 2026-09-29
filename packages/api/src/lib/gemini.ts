/**
 * Gemini one-liner — a single human-sounding roast line per scan, meant to
 * be screenshot and shared.
 *
 * Model: `gemini-3.5-flash`, verified against the official Gemini API models
 * doc (ai.google.dev/gemini-api/docs/models — "Gemini 3.5 Flash … Stable").
 *
 * Hard rules, in order:
 *  1. No `GEMINI_API_KEY` → null. The scan page simply hides the one-liner.
 *  2. 6s hard timeout on the API call.
 *  3. In-memory spend guard: 30 calls/minute, 300 calls/day. Over the cap →
 *     null (the key's wallet matters more than a joke).
 *  4. Cache per (domain, snapshot_hash) — re-scanning an unchanged page
 *     never re-spends.
 *  5. ANY failure → null. Gemini must never block or break a scan.
 *
 * The rule-based `verdict` is always present; the one-liner is a bonus field
 * (`one_liner: string | null`) on the scan response.
 */

const GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const TIMEOUT_MS = 6000;
const MAX_OUTPUT_TOKENS = 80;
const MAX_PER_MINUTE = 30;
const MAX_PER_DAY = 300;
const CACHE_MAX = 300;

// A tiny denylist as a last-resort filter behind the prompt's own
// guardrails. If the model ever emits one of these, we drop the line.
const DENY_RE =
  /\b(n[i1]gg[e3]r|f[a4]gg[o0]t|r[e3]t[a4]rd|k[i1]k[e3]|ch[i1]nk|sp[i1]c|tr[a4]nn[yie]|c[u*]nt)\b/i;

export interface OneLinerInput {
  domain: string;
  sniffScore: number;
  tier: string;
  verdict: string;
  topPhrases: string[];
  /** Cache key: lines are regenerated only when the page changed. */
  snapshotHash: string;
}

interface Caps {
  perMinute: number;
  perDay: number;
}

let caps: Caps = { perMinute: MAX_PER_MINUTE, perDay: MAX_PER_DAY };
let minuteWindowStart = 0;
let minuteCount = 0;
let dayKey = '';
let dayCount = 0;
const cache = new Map<string, string>();

function overCap(): boolean {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== dayKey) {
    dayKey = today;
    dayCount = 0;
  }
  if (now - minuteWindowStart >= 60_000) {
    minuteWindowStart = now;
    minuteCount = 0;
  }
  if (minuteCount >= caps.perMinute || dayCount >= caps.perDay) return true;
  minuteCount += 1;
  dayCount += 1;
  return false;
}

function buildPrompt(input: OneLinerInput): string {
  const phrases =
    input.topPhrases.length > 0 ? input.topPhrases.slice(0, 5).join(', ') : 'none worth quoting';
  return [
    'You are the arena announcer at SniffMySite, a satirical site that scores startup marketing from 0 (all hype) to 100 (all real).',
    `Write EXACTLY ONE line roasting this website's MARKETING — never its people, never any protected group.`,
    `Site: ${input.domain} — sniff score ${input.sniffScore}/100 (${input.tier}).`,
    `The verdict we already gave: "${input.verdict}"`,
    `Top hype phrases its page actually used: ${phrases}.`,
    'Rules:',
    '- Exactly one line, under 140 characters.',
    '- Dry, human, funny — something someone would screenshot and share.',
    '- Roast the marketing copy, not any person. No profanity, no slurs, no punching down.',
    '- Plain text only: no quotes around it, no hashtags, no emojis.',
  ].join('\n');
}

/**
 * Scrub the model's raw text into one safe line, or null if unusable.
 *
 * The floor matters: the model occasionally emits a fragment ("GL") instead
 * of a line. A real roast line is a sentence — anything under a dozen chars
 * is a misfire, and accepting it would cache the dud for every re-scan.
 */
const MIN_LINE_CHARS = 12;

function cleanLine(raw: string): string | null {
  let line = raw.split('\n')[0].trim();
  // Strip wrapping quotes the model sometimes adds despite instructions.
  line = line.replace(/^["'“”]+|["'“”]+$/g, '').trim();
  line = line.replace(/\s+/g, ' ');
  if (line.length < MIN_LINE_CHARS || line.length > 200) return null;
  if (DENY_RE.test(line)) return null;
  return line;
}

export interface GenerateOpts {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function generateOneLiner(
  input: OneLinerInput,
  opts: GenerateOpts = {},
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const cacheKey = `${input.domain.toLowerCase()}::${input.snapshotHash}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  if (overCap()) {
    // Loud about it: an exhausted budget is the #1 reason the heckler goes
    // quiet, and the Render logs are the only place the owner can see it.
    console.warn('[gemini] one-liner skipped: spend cap reached');
    return null;
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  try {
    const res = await fetchImpl(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(input) }] }],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.9,
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Status only — never the key, prompt, or body. A 429 here almost
      // always means the key's daily quota is spent.
      console.warn(`[gemini] one-liner HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('');
    if (!text) {
      console.warn('[gemini] one-liner: empty candidates');
      return null;
    }
    const line = cleanLine(text);
    if (!line) {
      console.warn('[gemini] one-liner rejected (too short/long or filtered)');
      return null;
    }
    cache.set(cacheKey, line);
    if (cache.size > CACHE_MAX) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    return line;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Test-only: reset caps, counters, and cache between tests. */
export function __testReset(): void {
  caps = { perMinute: MAX_PER_MINUTE, perDay: MAX_PER_DAY };
  minuteWindowStart = 0;
  minuteCount = 0;
  dayKey = '';
  dayCount = 0;
  cache.clear();
}

/** Test-only: shrink the spend caps so cap behavior is testable. */
export function __testSetCaps(next: Caps): void {
  caps = next;
}
