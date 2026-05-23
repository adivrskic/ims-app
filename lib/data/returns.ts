import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";

/**
 * Cross-request cached fetcher for the Returns list page.
 *
 * Same pattern as lib/data/orders.ts:
 *   - Admin (service-role) client → BYPASSES RLS, so every query filters
 *     org_id explicitly; the cache key includes org_id.
 *   - Tagged tags.returns(orgId).
 *
 * Returns are created/dispositioned EXTERNALLY (mobile receiving-dock app /
 * API), not from any web mutation — there is no returns/actions.ts. So the
 * only invalidation paths are ReturnsRealtime (a postgres_changes event on
 * the `returns` table busts tags.returns while a returns view is mounted)
 * and the 5-minute revalidate safety net. That's why the returns page mounts
 * ReturnsRealtime: without it, a freshly logged return wouldn't appear on
 * navigation until the revalidate window elapsed.
 *
 * Returns plain JSON (no Map); the page rebuilds the Map it uses from
 * `counts` via new Map(Object.entries(counts)).
 */

type Disposition =
  | "restock"
  | "damaged"
  | "hold_for_inspection"
  | "supplier_return";

export interface ReturnListRow {
  id: string;
  quantity: number;
  disposition: Disposition;
  reason: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  product:
    | { id: string; name: string; barcode: string }
    | { id: string; name: string; barcode: string }[]
    | null;
  received_by_profile:
    | { full_name: string | null; email: string }
    | { full_name: string | null; email: string }[]
    | null;
}

export interface ReturnsListData {
  rows: ReturnListRow[];
  counts: Record<string, number>;
  total: number;
  pendingReview: number;
}

const RETURNS_SELECT =
  "id, quantity, disposition, reason, reviewed_at, created_at, product:products ( id, name, barcode ), received_by_profile:profiles!returns_received_by_fkey ( full_name, email )";

/**
 * @param orgId        resolved active workspace id (getCurrentOrgContext().orgId)
 * @param facilityId   active facility id, or null for workspace-wide ("all")
 * @param disposition  disposition filter for the active chip, or null for "All"
 */
export function getReturnsList(
  orgId: string,
  facilityId: string | null,
  disposition: string | null
): Promise<ReturnsListData> {
  const dispKey = disposition ?? "all";

  return unstable_cache(
    async (): Promise<ReturnsListData> => {
      const admin = createAdminClient();

      let listQuery = admin
        .from("returns")
        .select(RETURNS_SELECT)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (facilityId) listQuery = listQuery.eq("warehouse_id", facilityId);
      if (disposition) listQuery = listQuery.eq("disposition", disposition);

      let countsQuery = admin
        .from("returns")
        .select("disposition, reviewed_at")
        .eq("org_id", orgId);
      if (facilityId) countsQuery = countsQuery.eq("warehouse_id", facilityId);

      const [{ data: listData }, { data: countData }] = await Promise.all([
        listQuery,
        countsQuery,
      ]);

      const counts: Record<string, number> = {};
      let total = 0;
      let pendingReview = 0;
      for (const r of (countData ?? []) as Array<{
        disposition: string;
        reviewed_at: string | null;
      }>) {
        counts[r.disposition] = (counts[r.disposition] ?? 0) + 1;
        total++;
        if (!r.reviewed_at) pendingReview++;
      }

      return {
        rows: (listData ?? []) as ReturnListRow[],
        counts,
        total,
        pendingReview,
      };
    },
    ["returns-list", orgId, facilityId ?? "all", dispKey],
    { tags: [tags.returns(orgId)], revalidate: 300 }
  )();
}