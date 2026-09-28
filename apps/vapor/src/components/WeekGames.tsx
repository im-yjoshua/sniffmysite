import { Link } from 'react-router-dom';
import type { ApiLeaderboardEntry, MetricScores } from '../lib/api';

/** Trailing window the Games look back over. */
const GAMES_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface Superlative {
  /** The metric the game is played on. */
  key: keyof MetricScores;
  /** The arena name of the game. */
  title: string;
  /** One plain-words line on what the metric sniffs. */
  blurb: string;
}

const GAMES: Superlative[] = [
  {
    key: 'buzzword_density',
    title: 'Most Delusional Hero Section',
    blurb: 'Highest buzzword density — the hype-words per sentence.',
  },
  {
    key: 'claim_to_proof',
    title: 'Boldest Claims, Thinnest Proof',
    blurb: 'Biggest gap between what the page claims and what it proves.',
  },
  {
    key: 'vague_verb',
    title: 'Vaguest Verbs in the Arena',
    blurb: 'Most sentences that say nothing with great confidence.',
  },
  {
    key: 'social_proof',
    title: 'Shadiest Social Proof',
    blurb: 'Sketchiest testimonials, vaguest logos, loudest "trusted by".',
  },
  {
    key: 'pricing_opacity',
    title: 'Most Mysterious Pricing',
    blurb: 'Hardest prices to actually find on the page.',
  },
  {
    key: 'freshness',
    title: 'Stalest News in Rome',
    blurb: 'Oldest, dustiest page — last updated when togas were in.',
  },
];

interface Crowned {
  game: Superlative;
  entry: ApiLeaderboardEntry;
  value: number;
}

/**
 * This Week's Games: superlatives computed fresh from the week's scans —
 * no human judges, the metric extremes crown themselves. Each domain can
 * only win one game (its most extreme), so the week has six different
 * champions of shame.
 *
 * A game with no positive score has no winner: a 0 winning "Most
 * Delusional" would be a lie, so the game sits out.
 */
export function WeekGames({ entries }: { entries: ApiLeaderboardEntry[] | null }) {
  const cutoff = Date.now() - GAMES_WINDOW_MS;
  const fresh =
    entries === null
      ? null
      : entries.filter((e) => {
          const t = Date.parse(e.scanned_at);
          return Number.isFinite(t) && t >= cutoff;
        });

  const crowned: Crowned[] | null =
    fresh === null
      ? null
      : (() => {
          const taken = new Set<string>();
          const out: Crowned[] = [];
          for (const game of GAMES) {
            let best: ApiLeaderboardEntry | null = null;
            let bestValue = 0;
            for (const e of fresh) {
              if (taken.has(e.domain)) continue;
              const v = e.metrics[game.key];
              if (v > bestValue) {
                bestValue = v;
                best = e;
              }
            }
            if (best) {
              taken.add(best.domain);
              out.push({ game, entry: best, value: bestValue });
            }
          }
          return out;
        })();

  return (
    <section aria-label="This Week's Games" className="mt-16">
      <p className="eyebrow text-ink-faint">The weekly superlatives</p>
      <h2 className="mt-3 font-inscription text-3xl font-bold uppercase tracking-tight md:text-4xl">
        This Week&rsquo;s Games
      </h2>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-soft">
        Six titles, awarded by the numbers — the most extreme pages of the
        last seven days, in categories nobody wants to win.
      </p>

      {crowned === null && (
        <p className="eyebrow mt-8 border-t border-hairline py-10 text-ink-faint">
          Setting up the games…
        </p>
      )}

      {crowned !== null && crowned.length === 0 && (
        <div className="mt-8 border-t border-hairline py-10">
          <p className="font-inscription text-2xl font-bold uppercase tracking-tight">
            No games this week.
          </p>
          <p className="mt-2 max-w-xl text-lg leading-relaxed text-ink-soft">
            The arena is quiet — no fresh scans to judge. Sniff a page and
            give the crowd something to laugh at.
          </p>
        </div>
      )}

      {crowned !== null && crowned.length > 0 && (
        <div className="mt-8 grid gap-px border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
          {crowned.map(({ game, entry, value }) => (
            <Link
              key={game.key}
              to={`/scan?url=${encodeURIComponent(`https://${entry.domain}`)}`}
              title={`Read the ${entry.domain} roast`}
              className="group flex min-h-[44px] flex-col bg-paper p-6"
            >
              <p className="font-data text-xs font-bold uppercase tracking-[0.18em] text-hazard">
                {game.title}
              </p>
              <p
                className="mt-3 truncate text-xl font-bold tracking-tight group-hover:text-hazard"
                title={entry.domain}
              >
                {entry.domain}
              </p>
              <p className="mt-1 font-data text-sm tabular-nums text-ink-soft">
                {value}
                <span className="text-ink-faint">/100 on the {metricName(game.key)}</span>
              </p>
              <p className="mt-3 text-base leading-relaxed text-ink-faint">
                {game.blurb}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function metricName(key: keyof MetricScores): string {
  switch (key) {
    case 'buzzword_density':
      return 'buzzword check';
    case 'claim_to_proof':
      return 'claim-to-proof check';
    case 'vague_verb':
      return 'vague-verb check';
    case 'social_proof':
      return 'social-proof check';
    case 'pricing_opacity':
      return 'pricing check';
    case 'freshness':
      return 'freshness check';
  }
}
