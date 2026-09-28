import { METRIC_META, type ApiScanResult, type MetricScores } from '../lib/api';
import { hostnameOf } from '../pages/ScanPage';

/**
 * The tale of the tape: all six smell checks, side by side, boxing style.
 * On every check a higher number means more suspicious — the smellier
 * side's bar burns hazard-orange and gets named. Plain words, no jargon,
 * readable at 390px.
 */
export function BattleTape({ a, b }: { a: ApiScanResult; b: ApiScanResult }) {
  const hostA = hostnameOf(a.url);
  const hostB = hostnameOf(b.url);

  return (
    <section className="mt-12 border-t border-hairline pt-8" aria-label="Tale of the tape">
      <p className="eyebrow text-ink-faint">Tale of the tape</p>
      <h2 className="mt-3 font-inscription text-3xl font-bold uppercase tracking-tight md:text-4xl">
        Six checks, side by side.
      </h2>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-soft">
        On every check, a higher number means more suspicious. The side
        that smells worse on a check burns orange.
      </p>

      <div className="mt-8 space-y-8">
        {METRIC_META.map((m) => (
          <TapeRow
            key={m.key}
            label={m.label}
            weight={m.weight}
            hostA={hostA}
            hostB={hostB}
            scoreA={a.metrics[m.key as keyof MetricScores]}
            scoreB={b.metrics[m.key as keyof MetricScores]}
          />
        ))}
      </div>
    </section>
  );
}

function TapeRow({
  label,
  weight,
  hostA,
  hostB,
  scoreA,
  scoreB,
}: {
  label: string;
  weight: number;
  hostA: string;
  hostB: string;
  scoreA: number;
  scoreB: number;
}) {
  const gap = Math.abs(scoreA - scoreB);
  const smellier = scoreA === scoreB ? null : scoreA > scoreB ? hostA : hostB;

  return (
    <div className="border-t border-hairline pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold tracking-tight">{label}</h3>
        <p className="font-data text-xs uppercase tracking-[0.18em] text-ink-faint">
          Counts {weight}% of the score
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <TapeBar
          host={hostA}
          score={scoreA}
          smellsWorse={smellier === hostA}
        />
        <TapeBar
          host={hostB}
          score={scoreB}
          smellsWorse={smellier === hostB}
        />
      </div>

      {smellier && gap > 0 ? (
        <p className="mt-3 break-all font-data text-sm font-bold uppercase tracking-[0.14em] text-hazard">
          {smellier} smells worse here — by {gap}
        </p>
      ) : (
        <p className="mt-3 font-data text-sm uppercase tracking-[0.14em] text-ink-faint">
          Dead even on this one
        </p>
      )}
    </div>
  );
}

function TapeBar({
  host,
  score,
  smellsWorse,
}: {
  host: string;
  score: number;
  smellsWorse: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 flex-1 truncate break-all font-data text-sm font-bold text-ink">
          {host}
        </p>
        <p
          className={`font-data text-2xl font-bold tabular-nums ${
            smellsWorse ? 'text-hazard' : 'text-ink'
          }`}
        >
          {score}
        </p>
      </div>
      <div
        className="mt-2 h-2 w-full bg-hairline"
        role="img"
        aria-label={`${host} scored ${score} out of 100 on this check`}
      >
        <div
          className={`h-full ${smellsWorse ? 'bg-hazard' : 'bg-ink-soft'}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
