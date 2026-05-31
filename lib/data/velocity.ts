import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dailyVelocity } from "@/lib/replenishment";

/**
 * Lookback window (days) for per-product velocity from scan_history.
 * 60 days balances "enough signal to smooth noise" against "recent enough to
 * reflect current demand." Kept in sync with the value draftReorderPO used
 * inline before this was extracted — change in one place now.
 */
export const VELOCITY_LOOKBACK_DAYS = 60;

/**
 * Average daily pick rate per product, computed from the last
 * `days` of `pick` + `adjust` scans (adjustments include shrink/damage).
 *
 * One batched query for all requested products. Returns a Map keyed by
 * product_id; products with no scans in the window are simply absent — the
 * caller should treat "absent" the same as velocity 0 (no demand signal),
 * which is how dailyVelocity already behaves.
 *
 * Takes the Supabase client as a parameter so both the request-scoped RLS
 * client (server actions, server components) and any future caller can reuse
 * it without this helper deciding the auth model. Pass the same client you'd
 * use for any other read on this request.
 *
 * NOTE: this is org-wide velocity (matching the original draftReorderPO
 * behaviour). If you want it facility-scoped, add the same `.eq("warehouse_id",
 * …)` filter that overview.ts's `scoped()` applies — but do it consistently
 * with how on-hand is summed at the call site, or days-to-stockout will divide
 * facility-scoped stock by org-wide velocity.
 */
export async function productVelocities(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "app", any>,
  {
    productIds,
    days = VELOCITY_LOOKBACK_DAYS,
  }: { productIds: string[]; days?: number }
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (productIds.length === 0) return result;

  // Midnight-aligned start, `days` back. Matches the window draftReorderPO
  // used inline before this was extracted (setDate(-days) + setHours(0,0,0,0)),
  // so velocity — and therefore drafted PO quantities — are unchanged by the
  // refactor.
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  sinceDate.setHours(0, 0, 0, 0);
  const since = sinceDate.toISOString();

  const { data, error } = await supabase
    .from("scan_history")
    .select("product_id, quantity")
    .in("product_id", productIds)
    .in("action", ["pick", "adjust"])
    .gte("scanned_at", since);

  if (error || !data) return result;

  // Sum absolute consumed quantity per product.
  const totals = new Map<string, number>();
  for (const row of data as Array<{
    product_id: string | null;
    quantity: number | null;
  }>) {
    if (!row.product_id) continue;
    totals.set(
      row.product_id,
      (totals.get(row.product_id) ?? 0) + Math.abs(row.quantity ?? 0)
    );
  }

  for (const [productId, totalUnitsConsumed] of totals) {
    result.set(productId, dailyVelocity({ totalUnitsConsumed, days }));
  }

  return result;
}

/** Convenience for a single product. Returns 0 when there's no signal. */
export async function productVelocity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "app", any>,
  productId: string,
  days = VELOCITY_LOOKBACK_DAYS
): Promise<number> {
  const map = await productVelocities(supabase, {
    productIds: [productId],
    days,
  });
  return map.get(productId) ?? 0;
}
