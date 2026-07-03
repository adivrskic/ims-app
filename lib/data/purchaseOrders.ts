import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";
import { clampPageSize } from "@/lib/listParams";

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
  /** Overall total across every status (the "All" chip / header meta). */
  total: number;
  /** Total matching the active status filter — drives pagination. */
  filteredTotal: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
  statuses: string[] | null,
  { page = 1, pageSize }: { page?: number; pageSize?: number } = {}
): Promise<PurchaseOrdersListData> {
  const statusKey = statuses && statuses.length ? statuses.join(",") : "all";
  const size = clampPageSize(pageSize);
  const requestedPage =
    Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

  return unstable_cache(
    async (): Promise<PurchaseOrdersListData> => {
      const admin = createAdminClient();

      // One page window; the totals come from the counts RPC below, so no
      // full-table fetch and no second count query.
      const call = (offset: number) => {
        let q = admin
          .from("purchase_orders")
          .select(PO_SELECT)
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }); // stable tiebreak across pages
        if (facilityId) q = q.eq("warehouse_id", facilityId);
        if (statuses) q = q.in("status", statuses);
        return q.range(offset, offset + size - 1);
      };

      // One SQL GROUP BY instead of fetching every row's status.
      const countsPromise = admin.rpc("po_status_counts", {
        p_org: orgId,
        p_warehouse: facilityId,
      });

      const [{ data: listData }, { data: countData }] = await Promise.all([
        call((requestedPage - 1) * size),
        countsPromise,
      ]);

      const counts: Record<string, number> = {};
      let total = 0;
      for (const r of (countData ?? []) as Array<{
        status: string;
        count: number;
      }>) {
        counts[r.status] = Number(r.count);
        total += Number(r.count);
      }

      const filteredTotal = statuses
        ? statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0)
        : total;
      const totalPages = Math.max(1, Math.ceil(filteredTotal / size));

      // If a stale ?page= overshot after a filter change, the window came
      // back empty — re-fetch the last valid page so the UI isn't blank.
      let rows = (listData ?? []) as PoListRow[];
      let servedPage = requestedPage;
      if (rows.length === 0 && filteredTotal > 0 && requestedPage > totalPages) {
        servedPage = totalPages;
        const retry = await call((servedPage - 1) * size);
        rows = (retry.data ?? []) as PoListRow[];
      }

      return {
        pos: rows,
        counts,
        total,
        filteredTotal,
        page: servedPage,
        pageSize: size,
        totalPages,
      };
    },
    [
      "purchase-orders-list",
      orgId,
      facilityId ?? "all",
      statusKey,
      String(requestedPage),
      String(size),
    ],
    { tags: [tags.purchaseOrders(orgId)], revalidate: 300 }
  )();
}