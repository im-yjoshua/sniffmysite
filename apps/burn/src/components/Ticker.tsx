import { Flame } from 'lucide-react';

/**
 * "Money incinerated today" ticker tape (§3.3, §3.7) — a marquee pinned to
 * the very top of the page. JetBrains Mono figures, ash separators, ember
 * only on the headline number. Pauses on hover.
 *
 * Mock figures are the product's real demo copy (§3.8); the live feed
 * (Task 6+) will aggregate burn.companies from Supabase.
 */
const TAPE_ITEMS: { label: string; figure?: string }[] = [
  { label: 'incinerated today (allegedly)', figure: '$1.2M' },
  { label: 'vaporstack.ai — burning', figure: '$84,000/mo', },
  { label: 'runway: 3 weeks · vibes: immaculate', figure: '$42,000/mo' },
  { label: 'promptly.app — shortest runway on the board', figure: '11 days' },
  { label: 'audited by vibes™', figure: '1,204 burners listed' },
  { label: 'not financial advice. obviously.', figure: '+$312K/mo vs. yesterday' },
];

export function Ticker() {
  const loop = [...TAPE_ITEMS, ...TAPE_ITEMS];

  return (
    <div className="tape" role="marquee" aria-label="Money incinerated today">
      <div className="tape-track py-2">
        <span className="mx-6 inline-flex shrink-0 items-center gap-2 font-data text-[11px] font-bold uppercase tracking-[0.22em] text-ember">
          <Flame className="h-3.5 w-3.5" aria-hidden="true" />
          Incineration feed
        </span>
        {loop.map((item, i) => (
          <span
            key={i}
            aria-hidden={i >= TAPE_ITEMS.length}
            className="mx-6 inline-flex shrink-0 items-baseline gap-2 whitespace-nowrap font-data text-xs text-ash"
          >
            {item.figure && <span className="tabular font-bold text-text">{item.figure}</span>}
            <span>{item.label}</span>
            <span className="text-divider" aria-hidden="true">
              ///
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
