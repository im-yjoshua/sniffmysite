/**
 * Burn board rankings — Task 9 (§3.3, §3.4).
 *
 * Three tabs:
 *   burn       — highest monthly burn (the crown)
 *   runway     — shortest runway, "living dangerously"
 *   efficiency — lowest monthly burn PER EMPLOYEE (see below)
 *
 * Efficiency definition (v1, stated on the page): monthly burn divided by
 * headcount. Companies with unknown or zero headcount are labeled
 * "headcount undisclosed" and sort LAST — we don't guess; the joke is that
 * the "most efficient" award goes to the startup spending the least per
 * human, with maximum irony. This is deliberately distinct from the burn
 * tab (pure burn, descending) — otherwise "efficient" would just be that
 * tab upside down.
 *
 * All helpers here are pure and unit-tested (test/board.test.ts).
 */

export type BoardSort = 'burn' | 'runway' | 'efficiency';

export const DEFAULT_BOARD_SORT: BoardSort = 'burn';
export const BOARD_PER_PAGE = 50;

/** Accept the plan's `efficient` and the looser `efficiency`; default burn. */
export function normalizeBoardSort(raw: unknown): BoardSort {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'burn') return 'burn';
  if (s === 'runway') return 'runway';
  if (s === 'efficient' || s === 'efficiency') return 'efficiency';
  return DEFAULT_BOARD_SORT;
}

export function normalizeBoardPage(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Monthly burn per employee. null = "headcount undisclosed" — the company
 * opts out of the efficiency ranking instead of being silently misranked.
 */
export function burnPerEmployee(
  monthlyBurn: number,
  headcount: number | null | undefined,
): number | null {
  if (headcount == null || !Number.isFinite(headcount) || headcount <= 0) return null;
  if (!Number.isFinite(monthlyBurn) || monthlyBurn < 0) return null;
  return monthlyBurn / headcount;
}

export interface BoardCandidate {
  id: string;
  slug: string;
  domain: string;
  name: string;
  monthly_burn: number;
  runway_months: number | null;
  headcount: number | null;
  funding_raised: number | null;
  created_at: string;
  /** Computed days remaining; null when runway is unknown. */
  runway_days_remaining: number | null;
  claimed: boolean;
}

/**
 * Pure comparators for the three tabs. Ties break by higher burn first
 * (the board's identity), then slug for determinism.
 */
export function compareBoard(a: BoardCandidate, b: BoardCandidate, sort: BoardSort): number {
  if (sort === 'burn') {
    return b.monthly_burn - a.monthly_burn || slugTie(a, b);
  }
  if (sort === 'runway') {
    // Shortest runway first; unknown runways sort last (not "zero").
    const da = a.runway_days_remaining;
    const db = b.runway_days_remaining;
    if (da == null && db == null) return slugTie(a, b);
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db || b.monthly_burn - a.monthly_burn || slugTie(a, b);
  }
  // efficiency: lowest burn/employee first; undisclosed headcount sorts last.
  const ea = burnPerEmployee(a.monthly_burn, a.headcount);
  const eb = burnPerEmployee(b.monthly_burn, b.headcount);
  if (ea == null && eb == null) return slugTie(a, b);
  if (ea == null) return 1;
  if (eb == null) return -1;
  return ea - eb || b.monthly_burn - a.monthly_burn || slugTie(a, b);
}

function slugTie(a: BoardCandidate, b: BoardCandidate): number {
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

/** Sorted copy — never mutates the input array. */
export function sortBoard(rows: BoardCandidate[], sort: BoardSort): BoardCandidate[] {
  return [...rows].sort((a, b) => compareBoard(a, b, sort));
}

export interface BoardPage {
  sort: BoardSort;
  page: number;
  per_page: number;
  total: number;
  rows: BoardCandidate[];
}

/** Slice a sorted list into a page. Page beyond the end → empty rows. */
export function paginateBoard(sorted: BoardCandidate[], page: number): BoardCandidate[] {
  const start = (page - 1) * BOARD_PER_PAGE;
  return sorted.slice(start, start + BOARD_PER_PAGE);
}
