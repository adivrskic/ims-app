import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";

/**
 * Cross-request cached fetcher for the Overview dashboard.
 *
 * Returns the RAW datasets + scalar counts the page needs; the page keeps
 * doing its own lowStock / totalStock / trend (bucketByDay) computation
 * unchanged. Mirrors the old Promise.all of eight queries, just cached.
 *
 * Admin (service-role) client → BYPASSES RLS, so every query filters org_id
 * explicitly; the cache key includes org_id + facilityId.
 *
 * Tagged across every domain the dashboard reads:
 *   - products      → productCount + stockByProduct (low-stock)
 *   - sections      → sectionCount + validSectionIds
 *   - warehouses    → warehouseCount
 *   - inventory     → stockRows (on-hand)  [also busted by location writes]
 *   - scans         → scansToday / scans14d / recentScans
 *
 * OverviewRealtime busts scans + inventory on scan_history/location events,
 * keeping the "live" header honest; the 60s revalidate is a short safety net
 * since this is the landing dashboard.
 *
 * NOTE: validSectionIds is returned as a string[] (not a Set) because
 * unstable_cache serializes its result to JSON. The page rebuilds the Set.
 */

export interface OverviewRecentScan {
  id: string;
  action: string;
  scanned_at: string | null;
  quantity: number | null;
  product:
    | { name: string; barcode: string }
    | { name: string; barcode: string }[]
    | null;
}

export interface OverviewStockByProduct {
  id: string;
  name: string;
  barcode: string;
  reorder_point: number;
  category: { name: string } | { name: string }[] | null;
  locations: Array<{
    quantity: number | null;
    section_id: string | null;
  }> | null;
}

export interface OverviewData {
  productCount: number;
  sectionCount: number;
  warehouseCount: number;
  scansTodayCount: number;
  stockRows: Array<{ quantity: number | null }>;
  scans14d: Array<{ scanned_at: string | null }>;
  recentScans: OverviewRecentScan[];
  stockByProduct: OverviewStockByProduct[];
  /** Section ids at the active facility, or null when workspace-wide. */
  validSectionIds: string[] | null;
}

/**
 * @param orgId       resolved active workspace id (getCurrentOrgContext().orgId)
 * @param facilityId  active facility id, or null for workspace-wide ("all")
 */
export function getOverviewData(
  orgId: string,
  facilityId: string | null
): Promise<OverviewData> {
  return unstable_cache(
    async (): Promise<OverviewData> => {
      const admin = createAdminClient();

      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const fourteenDaysAgo = new Date(today);
      fourteenDaysAgo.setDate(today.getDate() - 14);

      // Active-facility section ids (scoped). null = workspace-wide.
      let validSectionIds: string[] | null = null;
      if (facilityId) {
        const { data: sec } = await admin
          .from("sections")
          .select("id")
          .eq("org_id", orgId)
          .eq("warehouse_id", facilityId);
        validSectionIds = (sec ?? []).map((s) => s.id as string);
      }

      // Scope helpers for the warehouse-bearing tables.
      // Conditionally apply a warehouse_id filter, preserving the concrete
      // query-builder type. The previous self-referential constraint
      // (`T extends { eq: (...) => T }`) trips "excessively deep" inference
      // because PostgrestFilterBuilder.eq returns a fresh generic instance,
      // not `this`. Type the param as a minimal structural shape and cast back.
      const scoped = <T>(q: T): T => {
        if (!facilityId) return q;
        return (q as { eq: (col: string, val: string) => T }).eq(
          "warehouse_id",
          facilityId
        );
      };

      const [
        { count: productCount },
        { count: sectionCount },
        { count: warehouseCount },
        { data: stockRows },
        { count: scansTodayCount },
        { data: scans14d },
        { data: recentScans },
        { data: stockByProduct },
      ] = await Promise.all([
        admin
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId),
        scoped(
          admin
            .from("sections")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
        ),
        admin
          .from("warehouses")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId),
        scoped(
          admin.from("locations").select("quantity").eq("org_id", orgId)
        ),
        scoped(
          admin
            .from("scan_history")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .gte("scanned_at", today.toISOString())
        ),
        scoped(
          admin
            .from("scan_history")
            .select("scanned_at")
            .eq("org_id", orgId)
            .gte("scanned_at", fourteenDaysAgo.toISOString())
        ),
        scoped(
          admin
            .from("scan_history")
            .select(
              "id, action, scanned_at, quantity, product:products ( name, barcode )"
            )
            .eq("org_id", orgId)
            .order("scanned_at", { ascending: false })
            .limit(10)
        ),
        admin
          .from("products")
          .select(
            "id, name, barcode, reorder_point, category:categories ( name ), locations:locations ( quantity, section_id )"
          )
          .eq("org_id", orgId)
          .gt("reorder_point", 0),
      ]);

      return {
        productCount: productCount ?? 0,
        sectionCount: sectionCount ?? 0,
        warehouseCount: warehouseCount ?? 0,
        scansTodayCount: scansTodayCount ?? 0,
        stockRows: (stockRows ?? []) as Array<{ quantity: number | null }>,
        scans14d: (scans14d ?? []) as Array<{ scanned_at: string | null }>,
        recentScans: (recentScans ?? []) as OverviewRecentScan[],
        stockByProduct: (stockByProduct ?? []) as OverviewStockByProduct[],
        validSectionIds,
      };
    },
    ["overview", orgId, facilityId ?? "all"],
    {
      tags: [
        tags.products(orgId),
        tags.sections(orgId),
        tags.warehouses(orgId),
        tags.inventory(orgId),
        tags.scans(orgId),
      ],
      revalidate: 60,
    }
  )();
}