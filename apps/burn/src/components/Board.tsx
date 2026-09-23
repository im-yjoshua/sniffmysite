import { Link } from 'react-router-dom';
import { Flame } from 'lucide-react';
import type { Company } from '../lib/mock';
import { companySlug, formatBurn, formatRunway } from '../lib/mock';

/**
 * The burn board — top 10 by monthly burn (§3.3, §3.7).
 *
 * No cards, no boxes: 1px dividers and whitespace do the layout work.
 * Every money figure is tabular JetBrains Mono so columns read like a
 * terminal. The #1 row is the crown — Lucide Flame + .money-glow on the
 * figure (§3.7). Rows stagger in on load; reduced-motion kills it (§0.4).
 */

function HeaderRow() {
  const label = 'font-data text-[11px] font-bold uppercase tracking-[0.18em] text-ash';
  return (
    <div
      className="grid grid-cols-[2.5rem_minmax(0,1fr)_8rem_6.5rem] items-baseline gap-4 border-b border-divider pb-3 sm:grid-cols-[3rem_minmax(0,1fr)_9rem_7rem_4rem]"
      role="row"
    >
      <span className={label} role="columnheader">Rank</span>
      <span className={label} role="columnheader">Startup</span>
      <span className={`${label} text-right`} role="columnheader">Burn/mo</span>
      <span className={`${label} text-right`} role="columnheader">Runway</span>
      <span className={`${label} hidden text-right sm:block`} role="columnheader">Team</span>
    </div>
  );
}

function BoardRow({ company, rank, index }: { company: Company; rank: number; index: number }) {
  const crowned = rank === 1;
  // Whole row links to the company page (§3.3 /c/:slug).
  return (
    <Link
      to={`/c/${companySlug(company)}`}
      className="row-in block transition-colors hover:bg-white/[0.025]"
      style={{ animationDelay: `${index * 70}ms` }}
    >
    <div
      className="grid grid-cols-[2.5rem_minmax(0,1fr)_8rem_6.5rem] items-baseline gap-4 border-b border-divider py-5 sm:grid-cols-[3rem_minmax(0,1fr)_9rem_7rem_4rem]"
      role="row"
    >
      <span className="tabular font-data text-sm text-ash" role="cell">
        {String(rank).padStart(2, '0')}
      </span>

      <div className="min-w-0" role="cell">
        <p className="truncate font-display text-base font-bold text-text">
          {company.name}
          {crowned && (
            <span className="ml-2 inline-flex items-center gap-1 align-middle font-data text-[10px] font-bold uppercase tracking-[0.22em] text-ember">
              <Flame className="h-3.5 w-3.5" aria-hidden="true" />
              crown
            </span>
          )}
        </p>
        <p className="mt-0.5 font-data text-xs text-ash">{company.domain}</p>
      </div>

      <span
        className={
          crowned
            ? 'money-glow tabular text-right font-data text-lg font-bold'
            : 'tabular text-right font-data text-base font-bold text-text'
        }
        role="cell"
      >
        {formatBurn(company.monthly_burn)}
      </span>

      <span className="tabular text-right font-data text-sm text-ash" role="cell">
        {formatRunway(company.runway_months)}
      </span>

      <span className="hidden tabular text-right font-data text-sm text-ash sm:block" role="cell">
        {company.headcount}
      </span>
    </div>
    </Link>
  );
}

export function Board({ companies }: { companies: Company[] }) {
  return (
    <div role="table" aria-label="Top 10 burn board">
      <HeaderRow />
      {companies.map((company, i) => (
        <BoardRow key={company.domain} company={company} rank={i + 1} index={i} />
      ))}
    </div>
  );
}
