import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";

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
  total: number;
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
  statuses: string[] | null
): Promise<OrdersListData> {
  const statusKey = statuses && statuses.length ? statuses.join(",") : "all";

  return unstable_cache(
    async (): Promise<OrdersListData> => {
      const admin = createAdminClient();

      // ── Listing ──────────────────────────────────────────────────
      let listQuery = admin
        .from("orders")
        .select(ORDERS_SELECT)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (facilityId) listQuery = listQuery.eq("warehouse_id", facilityId);
      if (statuses) listQuery = listQuery.in("status", statuses);

      // ── Chip counts (all statuses, same scope) ───────────────────
      let countsQuery = admin
        .from("orders")
        .select("status")
        .eq("org_id", orgId);
      if (facilityId) countsQuery = countsQuery.eq("warehouse_id", facilityId);

      const [{ data: listData }, { data: countData }] = await Promise.all([
        listQuery,
        countsQuery,
      ]);

      const counts: Record<string, number> = {};
      let total = 0;
      for (const r of (countData ?? []) as Array<{ status: string }>) {
        counts[r.status] = (counts[r.status] ?? 0) + 1;
        total++;
      }

      return {
        orders: (listData ?? []) as OrderListRow[],
        counts,
        total,
      };
    },
    // Cache key parts — distinct entry per workspace / facility / filter.
    ["orders-list", orgId, facilityId ?? "all", statusKey],
    { tags: [tags.orders(orgId)], revalidate: 300 }
  )();
}