import "server-only";

/**
 * Fetch every row of a query in 1000-row pages.
 *
 * PostgREST caps a single response at ~1000 rows (Supabase's default
 * `max-rows`), so a plain `.select()` silently truncates large tables — fatal
 * for aggregations like inventory on-hand, valuation, or demand series. Use this
 * for COLD paths (reports, analytics) where pulling every row is acceptable. For
 * HOT read paths (ATP, dashboards) prefer an SQL-side aggregate RPC that sums in
 * Postgres and returns one round-trip instead.
 *
 * `build` MUST apply `.range(from, to)` to the query it returns.
 */
export const PAGE = 1000;

export async function fetchAllPaged<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  cap = 100_000
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const to = Math.min(from + PAGE, cap) - 1;
    const { data } = await build(from, to);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    if (out.length >= cap) {
      console.warn(`[paginate] hit ${cap}-row cap; output truncated`);
      break;
    }
  }
  return out;
}
