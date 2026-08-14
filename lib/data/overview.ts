import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";

/**
 * Cross-request cached fetcher for the Overview dashboard.
 *
 * Returns FINISHED values, not raw datasets. Total on-hand, the activity
 * sparkline and the low-stock worklist are all aggregated in Postgres by
 * app.overview_stock_total / overview_scan_trend / overview_low_stock
 * (20260814120000_overview_aggregate_rpcs).
 *
 * Those three used to be fetchAllPaged calls that pulled whole tables into Node
 * and reduced them in JS — on the post-login landing page, i.e. the hottest
 * read path in the app, and against the rule paginate.ts states in its own
 * docstring. unstable_cache softened it, but OverviewRealtime tag-busts this
 * cache on every scan_history/locations event, so the busier the warehouse the
 * more often the full scan re-ran. Keep aggregation in SQL here.
 *
 * Admin (service-role) client → BYPASSES RLS, so every query filters org_id
 * explicitly; the cache key includes org_id + facilityId.
 *
 * Tagged across every domain the dashboard reads:
 *   - products      → productCount + lowStock
 *   - sections      → sectionCount (and low-stock facility scoping, which
 *                     resolves sections → locations inside the RPC)
 *   - warehouses    → warehouseCount
 *   - inventory     → totalStock + lowStock  [also busted by location writes]
 *   - scans         → scansToday / trend / recentScans
 *
 * OverviewRealtime busts scans + inventory on scan_history/location events,
 * keeping the "live" header honest; the 60s revalidate is a short safety net
 * since this is the landing dashboard.
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

export interface OverviewLowStockItem {
  id: string;
  name: string;
  barcode: string;
  reorder_point: number;
  /** On-hand across active, non-quarantined locations in the active scope. */
  total: number;
  category_name: string | null;
}

/** Days in the activity sparkline. Bucket TREND_DAYS-1 is today. */
export const TREND_DAYS = 14;

/** How many understocked SKUs the reorder-alerts panel shows. */
const LOW_STOCK_LIMIT = 6;

export interface OverviewData {
  productCount: number;
  sectionCount: number;
  warehouseCount: number;
  scansTodayCount: number;
  /** Total units on hand across active locations in scope (SQL-side sum). */
  totalStock: number;
  /** Scan counts per day, oldest → newest, length TREND_DAYS. */
  trend: number[];
  recentScans: OverviewRecentScan[];
  /** Deepest-shortfall SKUs, already filtered/sorted/capped in SQL. */
  lowStock: OverviewLowStockItem[];
  /** Every low-stock SKU in scope, not just the ones in `lowStock`. */
  lowStockCount: number;
  /** Financial signals (scope-aware): inventory value + dead-stock capital. */
  financials: {
    inventoryValue: number;
    deadStockValue: number;
    deadStockSkus: number;
  };
  /**
   * Nightly KPI history for this scope (app.kpi_snapshots, oldest → newest,
   * up to 30 days). Empty arrays until the nightly capture has run — the
   * cards fall back to their flat placeholder sparks.
   */
  history: {
    dates: string[];
    inventoryValue: number[];
    unitsOnHand: number[];
    lowStock: number[];
    openOrders: number[];
  };
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
      // Oldest bucket in the sparkline: local midnight, TREND_DAYS-1 days back.
      // Passed to overview_scan_trend as the bucketing origin, so buckets line
      // up with the operator's calendar rather than UTC.
      const trendStart = new Date(today);
      trendStart.setDate(today.getDate() - (TREND_DAYS - 1));

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
        { data: stockTotal },
        { count: scansTodayCount },
        { data: trendRows },
        { data: recentScans },
        { data: lowStockRows },
        { data: finRows },
        { data: historyRows },
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
        // Total on-hand, summed in Postgres. Previously paginated every active
        // location row into Node to reduce() it — see the migration header.
        admin.rpc("overview_stock_total", {
          p_org: orgId,
          p_warehouse: facilityId,
        }),
        scoped(
          admin
            .from("scan_history")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .gte("scanned_at", today.toISOString())
        ),
        // Activity sparkline, bucketed by day in Postgres. Previously pulled
        // every scan in the window into Node to bucket there.
        admin.rpc("overview_scan_trend", {
          p_org: orgId,
          p_start: trendStart.toISOString(),
          p_days: TREND_DAYS,
          p_warehouse: facilityId,
        }),
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
        // Low stock: the filter/sort/slice all happen in SQL now. Soft-deleted
        // and QC-quarantined units stay excluded, else a SKU that is genuinely
        // below its reorder point looks healthy.
        admin.rpc("overview_low_stock", {
          p_org: orgId,
          p_warehouse: facilityId,
          p_limit: LOW_STOCK_LIMIT,
        }),
        // Financial signals (inventory value + capital tied in dead stock),
        // aggregated in Postgres so they can't truncate.
        admin.rpc("overview_financials", {
          p_org: orgId,
          p_warehouse: facilityId,
          p_dead_days: 90,
        }),
        // Nightly KPI history (30 days, this scope) for sparklines/deltas.
        (() => {
          let q = admin
            .from("kpi_snapshots")
            .select(
              "snapshot_date, inventory_value, units_on_hand, low_stock_count, open_orders"
            )
            .eq("org_id", orgId)
            .order("snapshot_date", { ascending: true })
            .limit(30);
          q = facilityId
            ? q.eq("warehouse_id", facilityId)
            : q.is("warehouse_id", null);
          return q;
        })(),
      ]);

      // Zero-fill the sparkline: the RPC returns only non-empty buckets.
      const trend = new Array<number>(TREND_DAYS).fill(0);
      for (const r of (trendRows ?? []) as Array<{
        day_offset: number;
        scan_count: number | string;
      }>) {
        if (r.day_offset >= 0 && r.day_offset < TREND_DAYS) {
          trend[r.day_offset] = Number(r.scan_count ?? 0);
        }
      }

      const lowRows = (lowStockRows ?? []) as Array<{
        id: string;
        name: string;
        barcode: string;
        reorder_point: number;
        category_name: string | null;
        on_hand: number | string | null;
        total_count: number | string | null;
      }>;

      return {
        productCount: productCount ?? 0,
        sectionCount: sectionCount ?? 0,
        warehouseCount: warehouseCount ?? 0,
        scansTodayCount: scansTodayCount ?? 0,
        // bigint comes back as a string over PostgREST — coerce, don't trust.
        totalStock: Number(stockTotal ?? 0),
        trend,
        recentScans: (recentScans ?? []) as OverviewRecentScan[],
        lowStock: lowRows.map((r) => ({
          id: r.id,
          name: r.name,
          barcode: r.barcode,
          reorder_point: r.reorder_point,
          total: Number(r.on_hand ?? 0),
          category_name: r.category_name,
        })),
        // Window-functioned onto every row, so any row carries the true total.
        lowStockCount: Number(lowRows[0]?.total_count ?? 0),
        financials: (() => {
          const r = (
            (finRows ?? []) as Array<{
              inventory_value: number | string | null;
              dead_stock_value: number | string | null;
              dead_stock_skus: number | string | null;
            }>
          )[0];
          return {
            inventoryValue: Number(r?.inventory_value ?? 0),
            deadStockValue: Number(r?.dead_stock_value ?? 0),
            deadStockSkus: Number(r?.dead_stock_skus ?? 0),
          };
        })(),
        history: (() => {
          const rows = (historyRows ?? []) as Array<{
            snapshot_date: string;
            inventory_value: number | string | null;
            units_on_hand: number | string | null;
            low_stock_count: number | null;
            open_orders: number | null;
          }>;
          return {
            dates: rows.map((r) => r.snapshot_date),
            inventoryValue: rows.map((r) => Number(r.inventory_value ?? 0)),
            unitsOnHand: rows.map((r) => Number(r.units_on_hand ?? 0)),
            lowStock: rows.map((r) => r.low_stock_count ?? 0),
            openOrders: rows.map((r) => r.open_orders ?? 0),
          };
        })(),
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