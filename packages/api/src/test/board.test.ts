import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_PER_PAGE,
  burnPerEmployee,
  compareBoard,
  normalizeBoardPage,
  normalizeBoardSort,
  paginateBoard,
  sortBoard,
  type BoardCandidate,
} from '../lib/board';

function row(over: Partial<BoardCandidate> & { slug: string }): BoardCandidate {
  return {
    id: over.slug,
    domain: `${over.slug}.lol`,
    name: over.slug,
    monthly_burn: 1000,
    runway_months: 6,
    headcount: 4,
    funding_raised: null,
    created_at: '2026-09-01T00:00:00.000Z',
    runway_days_remaining: 180,
    claimed: false,
    ...over,
  };
}

describe('normalizeBoardSort', () => {
  it('defaults to burn for missing/garbage input', () => {
    assert.equal(normalizeBoardSort(undefined), 'burn');
    assert.equal(normalizeBoardSort(''), 'burn');
    assert.equal(normalizeBoardSort('revenue'), 'burn');
    assert.equal(normalizeBoardSort(42), 'burn');
  });
  it('accepts burn and runway', () => {
    assert.equal(normalizeBoardSort('burn'), 'burn');
    assert.equal(normalizeBoardSort('RUNWAY'), 'runway');
  });
  it('accepts both efficient and efficiency as aliases', () => {
    assert.equal(normalizeBoardSort('efficient'), 'efficiency');
    assert.equal(normalizeBoardSort('efficiency'), 'efficiency');
  });
});

describe('normalizeBoardPage', () => {
  it('floors to 1 for garbage', () => {
    assert.equal(normalizeBoardPage(undefined), 1);
    assert.equal(normalizeBoardPage(0), 1);
    assert.equal(normalizeBoardPage(-3), 1);
    assert.equal(normalizeBoardPage('zzz'), 1);
  });
  it('floors fractional pages', () => {
    assert.equal(normalizeBoardPage(2.9), 2);
    assert.equal(normalizeBoardPage('3'), 3);
  });
});

describe('burnPerEmployee', () => {
  it('divides burn by headcount', () => {
    assert.equal(burnPerEmployee(10000, 4), 2500);
    assert.equal(burnPerEmployee(999, 3), 333);
  });
  it('returns null for null, zero, or negative headcount', () => {
    assert.equal(burnPerEmployee(10000, null), null);
    assert.equal(burnPerEmployee(10000, undefined), null);
    assert.equal(burnPerEmployee(10000, 0), null);
    assert.equal(burnPerEmployee(10000, -2), null);
  });
  it('returns null for non-finite or negative burn', () => {
    assert.equal(burnPerEmployee(NaN, 4), null);
    assert.equal(burnPerEmployee(-500, 4), null);
  });
  it('zero burn with a real team is free, not undisclosed', () => {
    assert.equal(burnPerEmployee(0, 5), 0);
  });
});

describe('compareBoard — burn tab', () => {
  it('sorts highest burn first', () => {
    const rows = [row({ slug: 'low', monthly_burn: 100 }), row({ slug: 'high', monthly_burn: 50000 })];
    assert.deepEqual(sortBoard(rows, 'burn').map((r) => r.slug), ['high', 'low']);
  });
});

describe('compareBoard — runway tab', () => {
  it('sorts shortest runway first, unknown last', () => {
    const rows = [
      row({ slug: 'unknown', runway_days_remaining: null }),
      row({ slug: 'long', runway_days_remaining: 400 }),
      row({ slug: 'dead', runway_days_remaining: 0 }),
      row({ slug: 'short', runway_days_remaining: 9 }),
    ];
    assert.deepEqual(
      sortBoard(rows, 'runway').map((r) => r.slug),
      ['dead', 'short', 'long', 'unknown'],
    );
  });
  it('does not treat unknown runway as zero — unknowns never crown', () => {
    const rows = [row({ slug: 'unknown', runway_days_remaining: null }), row({ slug: 'alive', runway_days_remaining: 3 })];
    assert.equal(sortBoard(rows, 'runway')[0].slug, 'alive');
  });
});

describe('compareBoard — efficiency tab', () => {
  it('sorts lowest burn-per-employee first', () => {
    const rows = [
      row({ slug: 'splurging', monthly_burn: 100000, headcount: 4 }), // 25k/emp
      row({ slug: 'frugal', monthly_burn: 2000, headcount: 2 }), // 1k/emp
      row({ slug: 'mid', monthly_burn: 9000, headcount: 3 }), // 3k/emp
    ];
    assert.deepEqual(
      sortBoard(rows, 'efficiency').map((r) => r.slug),
      ['frugal', 'mid', 'splurging'],
    );
  });
  it('headcount undisclosed sorts after every disclosed company', () => {
    const rows = [
      row({ slug: 'shy', monthly_burn: 1, headcount: null }), // tiny burn but undisclosed
      row({ slug: 'open', monthly_burn: 999999, headcount: 10 }),
    ];
    assert.deepEqual(
      sortBoard(rows, 'efficiency').map((r) => r.slug),
      ['open', 'shy'],
    );
  });
  it('zero-headcount solo shells are undisclosed, not infinite-efficiency', () => {
    const rows = [
      row({ slug: 'ghost', monthly_burn: 500, headcount: 0 }),
      row({ slug: 'real', monthly_burn: 500, headcount: 2 }),
    ];
    assert.deepEqual(
      sortBoard(rows, 'efficiency').map((r) => r.slug),
      ['real', 'ghost'],
    );
  });
});

describe('sortBoard', () => {
  it('does not mutate the input', () => {
    const rows = [row({ slug: 'b', monthly_burn: 1 }), row({ slug: 'a', monthly_burn: 2 })];
    sortBoard(rows, 'burn');
    assert.deepEqual(rows.map((r) => r.slug), ['b', 'a']);
  });
  it('breaks ties deterministically by slug', () => {
    const rows = [row({ slug: 'zed', monthly_burn: 5 }), row({ slug: 'abc', monthly_burn: 5 })];
    assert.deepEqual(sortBoard(rows, 'burn').map((r) => r.slug), ['abc', 'zed']);
  });
});

describe('paginateBoard', () => {
  it('pages 50 at a time', () => {
    const rows = Array.from({ length: 120 }, (_, i) => row({ slug: `c${i}`, monthly_burn: i }));
    const sorted = sortBoard(rows, 'burn');
    const p1 = paginateBoard(sorted, 1);
    const p3 = paginateBoard(sorted, 3);
    assert.equal(p1.length, 50);
    assert.equal(p3.length, 20);
    assert.equal(BOARD_PER_PAGE, 50);
    assert.ok(p1[0].monthly_burn > p1[49].monthly_burn);
  });
  it('returns empty rows past the end', () => {
    const rows = [row({ slug: 'only' })];
    assert.deepEqual(paginateBoard(rows, 99), []);
  });
});
