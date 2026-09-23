import { METRIC_META, type MetricScores } from '../lib/api';
import { CHECK_INFO, findingFor } from '../lib/score-explainer';

/**
 * The six v1 smell checks, findings first (shared presentational block —
 * scan page and profile page).
 * Each check reads like a mini verdict: a human sentence leads, the bar and
 * the number back it up. Weights are shown in words ("counts the most"),
 * never percentages-as-math. Ink bars — hazard stays reserved for scores,
 * rosettes, and CTAs.
 *
 * The bars are smell-intensity bars, keyed the engine's way (0–100, higher
 * = more smell): they explain what kept the page from a perfect 100.
 */
export function MetricBars({ metrics }: { metrics: MetricScores }) {
  return (
    <div className="mt-6 max-w-3xl">
      <p className="pb-4 text-base leading-relaxed text-ink-faint">
        Each check shows how much it stank — that&rsquo;s what kept
        this page from a perfect 100.
      </p>
      <dl>
        {METRIC_META.map((m) => {
        const value = metrics[m.key];
        const info = CHECK_INFO[m.key];
        return (
          <div
            key={m.key}
            className="border-b border-hairline py-5 first:border-t"
            aria-label={`${info.name}: ${value} out of 100`}
          >
            <dt>
              <span className="font-display text-lg font-bold tracking-tight">
                {info.name}
              </span>{' '}
              <span className="ml-2 align-middle font-data text-sm uppercase tracking-[0.14em] text-ink-faint">
                {info.weightNote}
              </span>
            </dt>
            <dd className="mt-2 max-w-2xl text-lg leading-relaxed text-ink-soft">
              {findingFor(m.key, value)}
            </dd>
            <dd className="mt-3 flex items-center gap-4" aria-hidden="true">
              <span className="h-2 flex-1 bg-hairline">
                <span
                  className="score-bar-fill block h-2 bg-ink"
                  style={{ width: `${value}%` }}
                />
              </span>
              <span className="font-data text-base tabular-nums text-ink-soft">
                {value}/100
              </span>
            </dd>
          </div>
        );
      })}
      </dl>
    </div>
  );
}
