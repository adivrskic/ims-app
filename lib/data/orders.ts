import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";
import { clampPageSize } from "@/lib/listParams";

/**
 * Cross-request cached fetcher for the Orders list page.
 *
 * Mirrors the pattern in lib/data/org.ts:
 *   - Uses the admin (service-role) client, which BYPASSES RLS, so every
 *     query MUST filter by org_id explicitly. The cache key also includes
 *     org_id so entries never cross workspaces.
 *   - Tagged with tags.orders(orgId). Order mutations (create / advance /
 *     cancel, and anything touching order_items) MUST revalidateTag the
 *     same tag, and OrdersRealtime invalidates it on a postgres_changes
 *     event. The 5-minute revalidate is a safety net, not the primary
 *     invalidation path.
 *
 * The result is plain JSON (no Map) because unstable_cache serializes its
 * return value across requests. The page rebuilds the Map it already uses
 * from `counts` via `new Map(Object.entries(counts))`.
 */

type OrderStatus =
  | "created"
  | "pick_list_assigned"
  | "in_progress"
  | "staged"
  | "ready"
  | "out_for_delivery"
  | "complete"
  | "cancelled";

type OrderType =
  | "installer_job"
  | "customer_pickup"
  | "internal_transfer"
  | "restock";

export interface OrderListRow {
  id: string;
  order_number: string | null;
  order_type: OrderType;
  status: OrderStatus;
  customer_name: string | null;
  delivery_date: string | null;
  delivery_window: string | null;
  created_at: string | null;
  items: Array<{ count: number }> | { count: number } | null;
}

export interface OrdersListData {
  orders: OrderListRow[];
  /** status → count, scoped the same way as the listing. */
  counts: Record<string, number>;
  /** Overall total across every status (the "All" chip / header meta). */
  total: number;
  /** Total matching the active status filter — drives pagination. */
  filteredTotal: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const ORDERS_SELECT =
  "id, order_number, order_type, status, customer_name, delivery_date, delivery_window, created_at, items:order_items ( count )";

/**
 * @param orgId       resolved active workspace id (getCurrentOrgContext().orgId)
 * @param facilityId  active facility id, or null for workspace-wide ("all")
 * @param statuses    status filter for the active chip, or null for "All"
 */
export function getOrdersList(
  orgId: string,
  facilityId: string | null,
  statuses: string[] | null,
  { page = 1, pageSize }: { page?: number; pageSize?: number } = {}
): Promise<OrdersListData> {
  const statusKey = statuses && statuses.length ? statuses.join(",") : "all";
  const size = clampPageSize(pageSize);
  const requestedPage =
    Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

  return unstable_cache(
    async (): Promise<OrdersListData> => {
      const admin = createAdminClient();

      // ── Listing (one page window; total comes from the counts RPC) ──
      const call = (offset: number) => {
        let q = admin
          .from("orders")
          .select(ORDERS_SELECT)
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }); // stable tiebreak across pages
        if (facilityId) q = q.eq("warehouse_id", facilityId);
        if (statuses) q = q.in("status", statuses);
        return q.range(offset, offset + size - 1);
      };

      // ── Chip counts (all statuses, same scope) ───────────────────
      // One SQL GROUP BY instead of fetching every row's status. The
      // chip-filtered sum doubles as the pagination total — no second
      // count query needed.
      const countPromise = admin.rpc("order_status_counts", {
        p_org: orgId,
        p_warehouse: facilityId,
      });

      const [{ data: listData }, { data: countData }] = await Promise.all([
        call((requestedPage - 1) * size),
        countPromise,
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
      let rows = (listData ?? []) as OrderListRow[];
      let servedPage = requestedPage;
      if (rows.length === 0 && filteredTotal > 0 && requestedPage > totalPages) {
        servedPage = totalPages;
        const retry = await call((servedPage - 1) * size);
        rows = (retry.data ?? []) as OrderListRow[];
      }

      return {
        orders: rows,
        counts,
        total,
        filteredTotal,
        page: servedPage,
        pageSize: size,
        totalPages,
      };
    },
    // Cache key parts — distinct entry per workspace / facility / filter / page.
    [
      "orders-list",
      orgId,
      facilityId ?? "all",
      statusKey,
      String(requestedPage),
      String(size),
    ],
    { tags: [tags.orders(orgId)], revalidate: 300 }
  )();
}