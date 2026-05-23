import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";

/**
 * Cross-request cached fetcher for the Inventory list page.
 *
 * Mirrors lib/data/org.ts / lib/data/orders.ts:
 *   - Admin (service-role) client → BYPASSES RLS, so every query filters
 *     org_id explicitly. The cache key includes org_id so entries never
 *     cross workspaces.
 *   - Tagged tags.products(orgId) + tags.inventory(orgId). Product writes
 *     bust the products tag; location / scan / cycle-count writes bust the
 *     inventory tag (see lib/cache-tags.tagsForTable). InventoryRealtime
 *     invalidates the same tags on a postgres_changes event. The 5-minute
 *     revalidate is a safety net, not the primary invalidation path.
 *
 * Products are org-scoped (the catalog doesn't change per facility). When a
 * facility is active we resolve its section ids and strip non-matching
 * locations from each product's `locations` array — products stay in the
 * list with a facility-specific on-hand (possibly 0), same as before.
 */

const SORT_COLUMNS: Record<string, string> = {
  name: "name",
  updated: "updated_at",
  reorder: "reorder_point",
  manufacturer: "manufacturer",
};

export interface InventoryProductRow {
  id: string;
  name: string;
  barcode: string;
  internal_sku: string | null;
  manufacturer: string | null;
  reorder_point: number | null;
  updated_at: string | null;
  category:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
  locations: Array<{
    quantity: number | null;
    bay: number | null;
    level: number | null;
    section_id: string | null;
    section:
      | { code: string | null; name: string | null }
      | { code: string | null; name: string | null }[]
      | null;
  }> | null;
}

export interface InventoryListData {
  products: InventoryProductRow[];
  totalCount: number;
}

interface Filters {
  q?: string;
  category?: string;
  sort: string;
  order: string;
}

const PRODUCTS_SELECT = `
  id, name, barcode, internal_sku, manufacturer, reorder_point, updated_at,
  category:categories ( id, name ),
  locations:locations ( quantity, bay, level, section_id, section:sections ( code, name ) )
`;

/**
 * @param orgId       resolved active workspace id (getCurrentOrgContext().orgId)
 * @param facilityId  active facility id, or null for workspace-wide ("all")
 * @param filters     search / category / sort / order from the URL
 */
export function getInventoryList(
  orgId: string,
  facilityId: string | null,
  { q, category, sort, order }: Filters
): Promise<InventoryListData> {
  const sortCol = SORT_COLUMNS[sort] ?? "updated_at";

  return unstable_cache(
    async (): Promise<InventoryListData> => {
      const admin = createAdminClient();

      // Resolve the active facility's section ids (scoped).
      let validSectionIds: Set<string> | null = null;
      if (facilityId) {
        const { data: sec } = await admin
          .from("sections")
          .select("id")
          .eq("org_id", orgId)
          .eq("warehouse_id", facilityId);
        validSectionIds = new Set((sec ?? []).map((s) => s.id as string));
      }

      let query = admin
        .from("products")
        .select(PRODUCTS_SELECT)
        .eq("org_id", orgId)
        .order(sortCol, { ascending: order === "asc", nullsFirst: false })
        .limit(200);

      if (q && q.trim().length > 0) {
        const term = `%${q.trim()}%`;
        query = query.or(
          `name.ilike.${term},barcode.ilike.${term},internal_sku.ilike.${term}`
        );
      }
      if (category) query = query.eq("category_id", category);

      const { data: rawProducts } = await query;

      const products = (
        (rawProducts as InventoryProductRow[] | null) ?? []
      ).map((p) => {
        if (!validSectionIds) return p;
        return {
          ...p,
          locations: (p.locations ?? []).filter(
            (l) => l.section_id && validSectionIds!.has(l.section_id)
          ),
        };
      });

      return { products, totalCount: products.length };
    },
    [
      "inventory-list",
      orgId,
      facilityId ?? "all",
      q?.trim() || "none",
      category || "all",
      sort,
      order,
    ],
    { tags: [tags.products(orgId), tags.inventory(orgId)], revalidate: 300 }
  )();
}