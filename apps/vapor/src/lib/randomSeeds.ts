/**
 * The "Feeling brave?" seed list — famous startup landing pages the random
 * sniff button can pick from. This is the ONE file Joshua edits to add,
 * remove, or reorder sites: just keep each entry `{ name, url }` with a
 * plain https homepage URL (no deep links — the engine scores whole pages
 * better from the front door).
 *
 * The button never picks the same site twice in a row (it tracks the last
 * pick in sessionStorage).
 */
export interface RandomSeed {
  /** Human name, shown while rolling ("Consulting the nose…"). */
  name: string;
  /** Plain https homepage URL — no deep links, no query strings. */
  url: string;
}

export const RANDOM_SEEDS: RandomSeed[] = [
  { name: 'Stripe', url: 'https://stripe.com' },
  { name: 'Notion', url: 'https://notion.so' },
  { name: 'Figma', url: 'https://figma.com' },
  { name: 'Vercel', url: 'https://vercel.com' },
  { name: 'Linear', url: 'https://linear.app' },
  { name: 'Anthropic', url: 'https://anthropic.com' },
  { name: 'OpenAI', url: 'https://openai.com' },
  { name: 'Shopify', url: 'https://shopify.com' },
  { name: 'Slack', url: 'https://slack.com' },
  { name: 'Discord', url: 'https://discord.com' },
  { name: 'Spotify', url: 'https://spotify.com' },
  { name: 'Airbnb', url: 'https://airbnb.com' },
  { name: 'Duolingo', url: 'https://duolingo.com' },
  { name: 'Canva', url: 'https://canva.com' },
  { name: 'Netflix', url: 'https://netflix.com' },
  { name: 'Dropbox', url: 'https://dropbox.com' },
  { name: 'HubSpot', url: 'https://hubspot.com' },
  { name: 'Zoom', url: 'https://zoom.us' },
];

/** sessionStorage key holding the last rolled seed's URL. */
const LAST_PICK_KEY = 'sniffmysite-last-random';

/**
 * Pick a seed, never repeating the last pick back-to-back. Falls back to
 * the full list when there's only one seed (or none left to pick).
 */
export function rollRandomSeed(): RandomSeed {
  const last =
    typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem(LAST_PICK_KEY)
      : null;
  const pool =
    RANDOM_SEEDS.length > 1
      ? RANDOM_SEEDS.filter((s) => s.url !== last)
      : RANDOM_SEEDS;
  const list = pool.length > 0 ? pool : RANDOM_SEEDS;
  const pick = list[Math.floor(Math.random() * list.length)];
  try {
    sessionStorage.setItem(LAST_PICK_KEY, pick.url);
  } catch {
    // Private mode / blocked storage: just roll, don't crash.
  }
  return pick;
}
