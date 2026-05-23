import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";

/**
 * Cross-request cached fetcher for the Inventory list page.
 *
 * All filtering / sorting / pagination / aggregation happens in Postgres via
 * the `app.inventory_list` RPC (migration app_inventory_list_function_fix).
 * That function:
 *   - sums on-hand per product (excluding soft-deleted locations, is_active=false)
 *   - is facility-aware: pass p_facility to scope on-hand + primary location to
 *     one warehouse's sections (null = workspace-wide)
 *   - joins app.categories for the display name; filters by category_id
 *   - supports sort by name | updated | reorder | manufacturer | onhand
 *   - supports a low-stock-only filter (reorder_point > 0 AND on_hand <= reorder_point)
 *   - returns an exact total_count via count(*) over() so pagination is real
 *
 * Admin (service-role) client → BYPASSES RLS, so the RPC filters org_id
 * explicitly (p_org); the cache key includes org_id so entries never cross
 * workspaces. Tagged products/inventory so product + location/scan/cycle-count
 * writes (and InventoryRealtime) bust it. The schema is "app" (admin client is
 * configured with NEXT_PUBLIC_SUPABASE_DB_SCHEMA=app), so .rpc resolves to
 * app.inventory_list.
 */

export const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;

export type SortKey =
  | "name"
  | "updated"
  | "reorder"
  | "manufacturer"
  | "onhand";
export type SortOrder = "asc" | "desc";

const SORT_KEYS: readonly SortKey[] = [
  "name",
  "updated",
  "reorder",
  "manufacturer",
  "onhand",
];

export interface InventoryRow {
  id: string;
  name: string;
  barcode: string;
  internal_sku: string | null;
  manufacturer: string | null;
  category_id: string | null;
  category_name: string | null;
  reorder_point: number | null;
  updated_at: string | null;
  on_hand: number;
  primary_location: string;
}

export interface InventoryListData {
  products: InventoryRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Filters {
  q?: string;
  /** category_id (uuid) or undefined */
  category?: string;
  low?: boolean;
  sort: SortKey;
  order: SortOrder;
  page?: number;
  pageSize?: number;
}

function clampPageSize(raw: number | undefined): number {
  if (!raw) return DEFAULT_PAGE_SIZE;
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw)
    ? raw
    : DEFAULT_PAGE_SIZE;
}

export function parseSort(raw: string | undefined): SortKey {
  return SORT_KEYS.includes(raw as SortKey) ? (raw as SortKey) : "updated";
}

export function parseOrder(raw: string | undefined): SortOrder {
  return raw === "asc" ? "asc" : "desc";
}

/**
 * @param orgId       resolved active workspace id (getCurrentOrgContext().orgId)
 * @param facilityId  active facility id, or null for workspace-wide ("all")
 */
export function getInventoryList(
  orgId: string,
  facilityId: string | null,
  { q, category, low = false, sort, order, page = 1, pageSize }: Filters
): Promise<InventoryListData> {
  const size = clampPageSize(pageSize);
  const requestedPage =
    Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const trimmedQ = q?.trim() || null;

  return unstable_cache(
    async (): Promise<InventoryListData> => {
      const admin = createAdminClient();

      const call = (offset: number) =>
        admin.rpc("inventory_list", {
          p_org: orgId,
          p_facility: facilityId,
          p_q: trimmedQ,
          p_category: category || null,
          p_low_only: low,
          p_sort: sort,
          p_order: order,
          p_limit: size,
          p_offset: offset,
        });

      let { data, error } = await call((requestedPage - 1) * size);
      if (error) {
        console.error("inventory_list rpc failed:", error.message);
        return {
          products: [],
          totalCount: 0,
          page: 1,
          pageSize: size,
          totalPages: 1,
        };
      }

      let rows = (data as (InventoryRow & { total_count: number })[]) ?? [];
      const totalCount = Number(rows[0]?.total_count ?? 0);
      const totalPages = Math.max(1, Math.ceil(totalCount / size));

      // If a stale ?page= overshot after filtering, the window came back empty
      // — re-fetch the last valid page so the UI isn't blank.
      let servedPage = requestedPage;
      if (rows.length === 0 && totalCount > 0 && requestedPage > totalPages) {
        servedPage = totalPages;
        const retry = await call((servedPage - 1) * size);
        rows = (retry.data as (InventoryRow & { total_count: number })[]) ?? [];
      }

      const products: InventoryRow[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        barcode: r.barcode,
        internal_sku: r.internal_sku,
        manufacturer: r.manufacturer,
        category_id: r.category_id,
        category_name: r.category_name,
        reorder_point: r.reorder_point,
        updated_at: r.updated_at,
        on_hand: Number(r.on_hand ?? 0),
        primary_location: r.primary_location,
      }));

      return {
        products,
        totalCount,
        page: servedPage,
        pageSize: size,
        totalPages,
      };
    },
    [
      "inventory-list",
      orgId,
      facilityId ?? "all",
      trimmedQ || "none",
      category || "all",
      low ? "low" : "any",
      sort,
      order,
      String(requestedPage),
      String(size),
    ],
    { tags: [tags.products(orgId), tags.inventory(orgId)], revalidate: 300 }
  )();
}
