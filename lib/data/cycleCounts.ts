import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";

/**
 * Cross-request cached fetcher for the Cycle Counts page.
 *
 * Bundles the page's four parallel queries (form products, form locations,
 * filtered history, org-wide summary) plus the location rollup + summary
 * math, so navigations serve from cache.
 *
 * Admin (service-role) client → BYPASSES RLS, so every query filters org_id
 * explicitly; the cache key includes org_id (plus the product/variance
 * filters that affect the history list).
 *
 * Tagged tags.cycleCounts(orgId) + tags.inventory(orgId):
 *   - recordCycleCount busts cycleCounts always, and inventory when a
 *     variance changed a location's on-hand.
 *   - voidCycleCount busts cycleCounts.
 *   - CycleCountsRealtime busts both (cycle_counts → [inventory, cycleCounts]).
 *   - Any location change (placements, adjustments) busts inventory, which
 *     also refreshes the form's "on hand" hints here.
 */

export interface CycleCountProductOption {
  id: string;
  name: string;
  barcode: string;
}

export interface CycleCountLocationOption {
  id: string;
  product_id: string;
  bay: number | null;
  level: number | null;
  quantity: number | null;
  section_code: string | null;
  warehouse_name: string | null;
}

export interface CycleCountsPageData {
  products: CycleCountProductOption[];
  locations: CycleCountLocationOption[];
  /** History rows with embeds; the page casts these to its local Row type. */
  rows: unknown[];
  totalCounts: number;
  totalAdjustments: number;
  accuracyPct: number | null;
  netUnits: number;
}

export function getCycleCountsPageData(
  orgId: string,
  opts: { productId?: string | null; varianceOnly: boolean }
): Promise<CycleCountsPageData> {
  const productKey = opts.productId || "all";
  const varKey = opts.varianceOnly ? "variance" : "all";

  return unstable_cache(
    async (): Promise<CycleCountsPageData> => {
      const admin = createAdminClient();

      const [
        { data: productsData },
        { data: locationsData },
        { data: counts },
        { data: totalCountsRow, count: totalCounts },
      ] = await Promise.all([
        admin
          .from("products")
          .select("id, name, barcode")
          .eq("org_id", orgId)
          .order("name", { ascending: true }),
        admin
          .from("locations")
          .select(
            `id, product_id, bay, level, quantity,
             section:sections ( code ),
             warehouse:warehouses ( name )`
          )
          .eq("org_id", orgId)
          .not("product_id", "is", null),
        (() => {
          let q = admin
            .from("cycle_counts")
            .select(
              `id, expected_qty, counted_qty, variance, status, counted_at, notes,
               product:products ( id, name, barcode ),
               location:locations (
                 bay, level,
                 section:sections ( code ),
                 warehouse:warehouses ( name )
               ),
               counter:profiles!cycle_counts_counted_by_fkey ( full_name, email )`
            )
            .eq("org_id", orgId)
            .order("counted_at", { ascending: false })
            .limit(100);
          if (opts.productId) q = q.eq("product_id", opts.productId);
          if (opts.varianceOnly) q = q.neq("variance", 0);
          return q;
        })(),
        admin
          .from("cycle_counts")
          .select("id, variance", { count: "exact" })
          .eq("org_id", orgId),
      ]);

      const products = (productsData ?? []) as CycleCountProductOption[];

      const locations: CycleCountLocationOption[] = (
        (locationsData ?? []) as Array<{
          id: string;
          product_id: string | null;
          bay: number | null;
          level: number | null;
          quantity: number | null;
          section: { code: string | null } | { code: string | null }[] | null;
          warehouse: { name: string } | { name: string }[] | null;
        }>
      )
        .filter((l): l is typeof l & { product_id: string } => !!l.product_id)
        .map((l) => {
          const sec = Array.isArray(l.section) ? l.section[0] : l.section;
          const wh = Array.isArray(l.warehouse) ? l.warehouse[0] : l.warehouse;
          return {
            id: l.id,
            product_id: l.product_id,
            bay: l.bay,
            level: l.level,
            quantity: l.quantity,
            section_code: sec?.code?.trim() ?? null,
            warehouse_name: wh?.name ?? null,
          };
        });

      // Aggregate stats — across ALL counts in the org, not filter-affected.
      type SummaryRow = { id: string; variance: number };
      const allCounts = (totalCountsRow ?? []) as SummaryRow[];
      const totalAdjustments = allCounts.filter((c) => c.variance !== 0).length;
      const accuracyPct =
        (totalCounts ?? 0) > 0
          ? Math.round((1 - totalAdjustments / (totalCounts ?? 1)) * 100)
          : null;
      const netUnits = allCounts.reduce((s, c) => s + c.variance, 0);

      return {
        products,
        locations,
        rows: (counts ?? []) as unknown[],
        totalCounts: totalCounts ?? 0,
        totalAdjustments,
        accuracyPct,
        netUnits,
      };
    },
    ["cycle-counts-page", orgId, productKey, varKey],
    { tags: [tags.cycleCounts(orgId), tags.inventory(orgId)], revalidate: 300 }
  )();
}