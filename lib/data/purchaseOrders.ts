import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllPaged } from "@/lib/data/paginate";
import { tags } from "@/lib/cache-tags";

/**
 * Cross-request cached fetcher for the Purchase Orders list page.
 *
 * Same pattern as lib/data/orders.ts:
 *   - Admin (service-role) client → BYPASSES RLS, so every query filters
 *     org_id explicitly; the cache key includes org_id.
 *   - Tagged tags.purchaseOrders(orgId). PO mutations (draft / create /
 *     send / cancel / receive, and anything touching po_line_items) MUST
 *     revalidateTag the same tag, and PurchaseOrdersRealtime invalidates it
 *     on a postgres_changes event. The 5-minute revalidate is a safety net.
 *
 * Returns plain JSON (no Map); the page rebuilds the Map it uses from
 * `counts` via new Map(Object.entries(counts)).
 */

type PoStatus =
  | "draft"
  | "sent"
  | "partially_received"
  | "fully_received"
  | "cancelled";

export interface PoListRow {
  id: string;
  po_number: string;
  supplier_name: string;
  status: PoStatus;
  expected_date: string | null;
  created_at: string | null;
  items: Array<{ count: number }> | { count: number } | null;
}

export interface PurchaseOrdersListData {
  pos: PoListRow[];
  counts: Record<string, number>;
  total: number;
}

const PO_SELECT =
  "id, po_number, supplier_name, status, expected_date, created_at, items:po_line_items ( count )";

/**
 * @param orgId       resolved active workspace id (getCurrentOrgContext().orgId)
 * @param facilityId  active facility id, or null for workspace-wide ("all")
 * @param statuses    status filter for the active chip, or null for "All"
 */
export function getPurchaseOrdersList(
  orgId: string,
  facilityId: string | null,
  statuses: string[] | null
): Promise<PurchaseOrdersListData> {
  const statusKey = statuses && statuses.length ? statuses.join(",") : "all";

  return unstable_cache(
    async (): Promise<PurchaseOrdersListData> => {
      const admin = createAdminClient();

      // Paginate both: a plain select caps at PostgREST's ~1000 rows, which
      // truncates the list and undercounts the status chips / total past 1000 POs.
      const listPromise = fetchAllPaged<PoListRow>((from, to) => {
        let q = admin
          .from("purchase_orders")
          .select(PO_SELECT)
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false });
        if (facilityId) q = q.eq("warehouse_id", facilityId);
        if (statuses) q = q.in("status", statuses);
        return q.range(from, to);
      });

      const countsPromise = fetchAllPaged<{ status: string }>((from, to) => {
        let q = admin
          .from("purchase_orders")
          .select("status")
          .eq("org_id", orgId)
          .order("id", { ascending: false });
        if (facilityId) q = q.eq("warehouse_id", facilityId);
        return q.range(from, to);
      });

      const [listData, countData] = await Promise.all([
        listPromise,
        countsPromise,
      ]);

      const counts: Record<string, number> = {};
      let total = 0;
      for (const r of countData) {
        counts[r.status] = (counts[r.status] ?? 0) + 1;
        total++;
      }

      return { pos: listData, counts, total };
    },
    ["purchase-orders-list", orgId, facilityId ?? "all", statusKey],
    { tags: [tags.purchaseOrders(orgId)], revalidate: 300 }
  )();
}