import { useCallback, useState } from 'react';
import { Megaphone, RotateCcw } from 'lucide-react';
import { Laurel } from './seals/Laurel';
import { ThumbSeal } from './seals/ThumbSeal';
import { TierMark } from './seals/TierMark';
import { SharePopup } from './SharePopup';
import { useCountUp } from '../hooks/useCountUp';
import { API_URL, type ApiScanResult } from '../lib/api';
import { hostnameOf } from '../pages/ScanPage';

/**
 * The verdict moment: the thumb has fallen. The winner gets the laurel
 * and the VICTOR stamp; the loser gets the thumb-down seal and CONDEMNED.
 * The headline is the auto "X DESTROYED Y" — the same line the share card
 * carries. Then: share the destruction, or demand a rematch.
 *
 * Score decides. Higher sniff score = more real = wins.
 */
export function DuelVerdict({
  a,
  b,
  onRematch,
}: {
  a: ApiScanResult;
  b: ApiScanResult;
  onRematch: () => void;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const hostA = hostnameOf(a.url);
  const hostB = hostnameOf(b.url);
  const aWins = a.sniff_score > b.sniff_score;
  const tie = a.sniff_score === b.sniff_score;
  const winner = aWins ? a : b;
  const loser = aWins ? b : a;

  const headline = tie
    ? 'A dead tie. The nose shrugs.'
    : `${hostnameOf(winner.url).toUpperCase()} DESTROYED ${hostnameOf(
        loser.url,
      ).toUpperCase()}`;
  const subline = tie
    ? `Both pages scored ${a.sniff_score}. Come back with two pages that aren't equally suspicious.`
    : `${winner.sniff_score} to ${loser.sniff_score}. ${hostnameOf(
        loser.url,
      )}'s page had more to hide — the nose noticed.`;

  const shareText = tie
    ? `${hostA} tied ${hostB} — both scored ${a.sniff_score} on SniffMySite. Rematch?`
    : `${hostnameOf(winner.url).toUpperCase()} DESTROYED ${hostnameOf(
        loser.url,
      ).toUpperCase()} — ${winner.sniff_score} to ${loser.sniff_score} on SniffMySite.`;

  /** The share popup POSTs the finished battle to /api/vapor/card/battle. */
  const getBattleCardBlob = useCallback(async (): Promise<Blob> => {
    const res = await fetch(`${API_URL}/api/vapor/card/battle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain_a: hostA,
        sniff_score_a: a.sniff_score,
        tier_a: a.tier,
        domain_b: hostB,
        sniff_score_b: b.sniff_score,
        tier_b: b.tier,
      }),
    });
    if (!res.ok) throw new Error('battle card failed');
    return res.blob();
    // hostA/hostB derive from a.url/b.url — listing a and b covers them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b]);

  return (
    <section
      className="mt-12 border-y-2 border-ink py-10"
      aria-live="polite"
      aria-label="The verdict"
    >
      <p className="eyebrow text-ink-faint">The thumb has fallen</p>
      <h2 className="verdict-rise mt-3 max-w-4xl font-inscription text-3xl font-bold uppercase leading-snug tracking-tight md:text-5xl">
        {headline}
      </h2>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-soft">
        {subline}
      </p>

      {/* Victor and condemned, side by side. */}
      <div className="mt-10 grid gap-8 md:grid-cols-2">
        {tie ? (
          <>
            <TieCard result={a} />
            <TieCard result={b} />
          </>
        ) : (
          <>
            <VictorCard result={winner} />
            <CondemnedCard result={loser} />
          </>
        )}
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="tap-target inline-flex min-h-[44px] items-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
        >
          <Megaphone className="h-5 w-5" strokeWidth={2.25} />
          Share the destruction
        </button>
        <button
          type="button"
          onClick={onRematch}
          className="tap-target inline-flex min-h-[44px] items-center gap-2 border border-ink px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-ink transition-colors hover:border-hazard hover:text-hazard"
        >
          <RotateCcw className="h-5 w-5" strokeWidth={2.25} />
          Rematch
        </button>
      </div>

      {shareOpen && (
        <SharePopup
          domain={`${hostA}-vs-${hostB}`}
          score={winner.sniff_score}
          tier={winner.tier}
          shareText={shareText}
          pageUrl={window.location.href}
          getImageBlob={getBattleCardBlob}
          onClose={() => setShareOpen(false)}
        />
      )}
    </section>
  );
}

function VictorCard({ result }: { result: ApiScanResult }) {
  const shown = useCountUp(result.sniff_score, true);
  return (
    <div className="border border-hairline p-6">
      <div className="seal-stamp flex justify-center" aria-hidden="true">
        <Laurel size={120} className="text-gold" />
      </div>
      <p className="mt-4 text-center font-data text-sm font-bold uppercase tracking-[0.22em] text-gold">
        Victor
      </p>
      <p className="mt-3 break-all text-center font-data text-base font-bold text-ink">
        {hostnameOf(result.url)}
      </p>
      <p className="mt-2 text-center font-data text-6xl font-bold tabular-nums text-hazard">
        {shown}
      </p>
      <p className="mt-3 flex items-center justify-center gap-2">
        <TierMark tier={result.tier} size={40} />
        <span className="font-data text-sm font-bold uppercase tracking-[0.14em] text-ink">
          {result.tier}
        </span>
      </p>
    </div>
  );
}

function CondemnedCard({ result }: { result: ApiScanResult }) {
  const shown = useCountUp(result.sniff_score, true);
  return (
    <div className="border border-hairline p-6">
      <div className="seal-stamp flex justify-center" aria-hidden="true">
        <ThumbSeal direction="down" size={120} filled />
      </div>
      <p className="mt-4 text-center font-data text-sm font-bold uppercase tracking-[0.22em] text-roman-red">
        Condemned
      </p>
      <p className="mt-3 break-all text-center font-data text-base font-bold text-ink">
        {hostnameOf(result.url)}
      </p>
      <p className="mt-2 text-center font-data text-6xl font-bold tabular-nums text-ink-soft">
        {shown}
      </p>
      <p className="mt-3 flex items-center justify-center gap-2">
        <TierMark tier={result.tier} size={40} />
        <span className="font-data text-sm font-bold uppercase tracking-[0.14em] text-ink">
          {result.tier}
        </span>
      </p>
    </div>
  );
}

function TieCard({ result }: { result: ApiScanResult }) {
  const shown = useCountUp(result.sniff_score, true);
  return (
    <div className="border border-hairline p-6">
      <div className="flex justify-center" aria-hidden="true">
        <TierMark tier={result.tier} size={120} />
      </div>
      <p className="mt-4 text-center font-data text-sm font-bold uppercase tracking-[0.22em] text-ink-faint">
        No victor
      </p>
      <p className="mt-3 break-all text-center font-data text-base font-bold text-ink">
        {hostnameOf(result.url)}
      </p>
      <p className="mt-2 text-center font-data text-6xl font-bold tabular-nums text-ink">
        {shown}
      </p>
      <p className="mt-3 text-center font-data text-sm font-bold uppercase tracking-[0.14em] text-ink">
        {result.tier}
      </p>
    </div>
  );
}
