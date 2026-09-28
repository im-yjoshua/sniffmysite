/**
 * withFakeBoardScans — an in-memory stand-in for the Supabase client
 * surface that lib/boardStore.ts uses (`vapor.board_scans` +
 * `vapor.board_bookends`).
 *
 * The builder is a minimal thenable (supabase-js builders are thenables,
 * and boardStore awaits them directly) supporting exactly the calls
 * boardStore makes: select/eq/gte/order/limit, insert, delete/in.
 * The `board_bookends` view is emulated from the rows with the same
 * bookend rule as migration 009 (latest per host + oldest per
 * algo_version).
 *
 * Usage:
 *   await withFakeBoardScans([], async (rows) => {
 *     await recordBoardScan({ finalUrl: 'https://x.test/', result });
 *     const host = await getLiveHost('x.test');
 *     ...
 *   });
 */
export interface FakeBoardRow {
  id: number;
  domain: string;
  result: unknown;
  scanned_at: string;
}

type RowFilter = (r: FakeBoardRow) => boolean;

function scannedDesc(a: FakeBoardRow, b: FakeBoardRow): number {
  return b.scanned_at.localeCompare(a.scanned_at) || b.id - a.id;
}

function scannedAsc(a: FakeBoardRow, b: FakeBoardRow): number {
  return a.scanned_at.localeCompare(b.scanned_at) || a.id - b.id;
}

/** Emulate vapor.board_bookends from raw board_scans rows. */
function computeBookends(rows: FakeBoardRow[]): FakeBoardRow[] {
  const byDomain = new Map<string, FakeBoardRow[]>();
  for (const r of rows) {
    const list = byDomain.get(r.domain) ?? [];
    list.push(r);
    byDomain.set(r.domain, list);
  }
  const out: FakeBoardRow[] = [];
  const seen = new Set<number>();
  const emit = (r: FakeBoardRow, isLatest: boolean, isFirst: boolean) => {
    const existing = out.find((e) => e.id === r.id);
    if (existing) {
      (existing as unknown as Record<string, unknown>).is_latest =
        (existing as unknown as Record<string, unknown>).is_latest || isLatest;
      (existing as unknown as Record<string, unknown>).is_first_in_version =
        (existing as unknown as Record<string, unknown>).is_first_in_version || isFirst;
    } else {
      seen.add(r.id);
      out.push({
        ...r,
        is_latest: isLatest,
        is_first_in_version: isFirst,
      } as FakeBoardRow);
    }
  };
  for (const rs of byDomain.values()) {
    const latest = [...rs].sort(scannedDesc)[0];
    emit(latest, true, false);
    const byVersion = new Map<string, FakeBoardRow[]>();
    for (const r of rs) {
      const v = (r.result as { algo_version?: string }).algo_version ?? '';
      const list = byVersion.get(v) ?? [];
      list.push(r);
      byVersion.set(v, list);
    }
    for (const vrs of byVersion.values()) {
      emit([...vrs].sort(scannedAsc)[0], false, true);
    }
  }
  return out;
}

export async function withFakeBoardScans(
  initial: FakeBoardRow[],
  fn: (rows: FakeBoardRow[]) => Promise<void>,
): Promise<void> {
  const { rows, restore } = await installFakeBoardScans(initial);
  try {
    await fn(rows);
  } finally {
    restore();
  }
}

/**
 * Lower-level install for beforeEach/afterEach flows. Returns the live
 * rows array plus a restore() that puts the real getSupabase back.
 */
export async function installFakeBoardScans(
  initial: FakeBoardRow[],
): Promise<{ rows: FakeBoardRow[]; restore: () => void }> {
  const supabaseMod = (await import('../../lib/supabase.js')) as Record<
    string,
    unknown
  >;
  const real = supabaseMod.getSupabase;
  const rows: FakeBoardRow[] = initial.map((r) => ({ ...r }));
  let nextId = rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;

  class FakeQuery {
    private filters: RowFilter[] = [];
    private orders: { col: string; asc: boolean }[] = [];
    private limitN: number | null = null;
    private op: 'select' | 'insert' | 'delete' = 'select';
    private insertPayload: Record<string, unknown> | null = null;
    private deleteIds: number[] | null = null;

    constructor(private table: string) {}

    select(_cols: string): this {
      this.op = 'select';
      return this;
    }
    insert(payload: Record<string, unknown>): this {
      this.op = 'insert';
      this.insertPayload = payload;
      return this;
    }
    delete(): this {
      this.op = 'delete';
      return this;
    }
    eq(col: string, val: unknown): this {
      this.filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val);
      return this;
    }
    gte(col: string, val: string): this {
      this.filters.push(
        (r) => (r as unknown as Record<string, unknown>)[col] as string >= val,
      );
      return this;
    }
    in(col: string, vals: unknown[]): this {
      if (col === 'id') this.deleteIds = vals as number[];
      return this;
    }
    order(col: string, opts: { ascending: boolean }): this {
      this.orders.push({ col, asc: opts.ascending });
      return this;
    }
    limit(n: number): this {
      this.limitN = n;
      return this;
    }
    // Thenable — boardStore awaits the builder directly.
    then(
      onFulfilled: (v: { data: unknown; error: unknown }) => void,
      onRejected?: (e: unknown) => void,
    ): void {
      try {
        onFulfilled(this.exec());
      } catch (e) {
        if (onRejected) onRejected(e);
        else throw e;
      }
    }
    private exec(): { data: unknown; error: unknown } {
      if (this.op === 'insert') {
        rows.push({ id: nextId++, ...(this.insertPayload as object) } as FakeBoardRow);
        return { data: null, error: null };
      }
      if (this.op === 'delete') {
        const ids = new Set(this.deleteIds ?? []);
        for (let i = rows.length - 1; i >= 0; i--) {
          if (ids.has(rows[i].id)) rows.splice(i, 1);
        }
        return { data: null, error: null };
      }
      let out: FakeBoardRow[] =
        this.table === 'board_bookends' ? computeBookends(rows) : [...rows];
      for (const f of this.filters) out = out.filter(f);
      for (let i = this.orders.length - 1; i >= 0; i--) {
        const { col, asc } = this.orders[i];
        out = [...out].sort((a, b) => {
          const av = (a as unknown as Record<string, unknown>)[col] as string | number;
          const bv = (b as unknown as Record<string, unknown>)[col] as string | number;
          const c = av < bv ? -1 : av > bv ? 1 : 0;
          return asc ? c : -c;
        });
      }
      if (this.limitN !== null) out = out.slice(0, this.limitN);
      return { data: out, error: null };
    }
  }

  const fakeClient = {
    schema: (_s: string) => ({
      from: (table: string) => new FakeQuery(table),
    }),
  };
  supabaseMod.getSupabase = () => fakeClient;
  const restore = () => {
    supabaseMod.getSupabase = real;
  };
  return { rows, restore };
}
