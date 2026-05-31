import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";

/**
 * Cross-request cached fetcher for the kiosk wallboard (/kiosk).
 *
 * Assembles every metric the board's screens need in one cached call. Admin
 * (service-role) client → BYPASSES RLS, so each query filters org_id (and
 * warehouse_id when a facility is active) explicitly. Tagged across the
 * operational domains the board surfaces so any relevant write — plus the
 * realtime channel and KioskShell's timer — refreshes it.
 *
 * Facility scope: app.locations / app.scan_history / app.orders /
 * app.purchase_orders all carry warehouse_id, so "single facility" is a direct
 * eq filter. Low-stock reuses the app.inventory_list RPC (which scopes on-hand
 * via section → warehouse).
 */

const OPEN_ORDER_STATUSES = [
  "created",
  "pick_list_assigned",
  "in_progress",
  "staged",
  "ready",
  "out_for_delivery",
] as const;

const PICK_QUEUE_STATUSES = [
  "pick_list_assigned",
  "in_progress",
  "staged",
  "ready",
] as const;

const PO_IN_TRANSIT_STATUSES = ["sent", "partially_received"] as const;

export interface KioskScan {
  action: string;
  scanned_at: string | null;
  product_name: string | null;
}

export interface KioskMover {
  product_id: string;
  name: string;
  scans: number;
}

export interface KioskLowStock {
  id: string;
  name: string;
  on_hand: number;
  reorder_point: number | null;
}

export interface KioskOrder {
  order_number: string | null;
  status: string;
  customer_name: string | null;
  item_count: number;
}

export interface KioskPo {
  po_number: string | null;
  supplier_name: string | null;
  status: string;
  expected_date: string | null;
}

export interface KioskData {
  scansToday: number;
  scans14d: number[]; // oldest → today, length 14
  scansDelta: number | null; // % vs. previous day
  unitsOnHand: number;
  productCount: number;
  lowStockCount: number;
  lowStock: KioskLowStock[];
  topMovers: KioskMover[];
  recentScans: KioskScan[];
  openOrdersCount: number;
  pickQueue: KioskOrder[];
  posInTransit: KioskPo[];
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function getKioskData(
  orgId: string,
  facilityId: string | null
): Promise<KioskData> {
  return unstable_cache(
    async (): Promise<KioskData> => {
      const admin = createAdminClient();
      // Conditionally apply a warehouse_id filter, preserving the concrete
      // query-builder type. We type the parameter as a minimal structural
      // shape that exposes `.eq` and cast its result back to the input type:
      // PostgrestFilterBuilder.eq returns a fresh generic instance (not `this`),
      // which otherwise breaks inference and trips "excessively deep" errors.
      const scopeWarehouse = <T>(q: T): T => {
        if (!facilityId) return q;
        return (q as { eq: (col: string, val: string) => T }).eq(
          "warehouse_id",
          facilityId
        );
      };

      const now = new Date();
      const startToday = new Date(now);
      startToday.setHours(0, 0, 0, 0);
      const start14 = new Date(startToday);
      start14.setDate(start14.getDate() - 13);

      const [
        scansRes,
        locRes,
        productCountRes,
        lowRes,
        openCountRes,
        pickRes,
        poRes,
      ] = await Promise.all([
        scopeWarehouse(
          admin
            .from("scan_history")
            .select("action, scanned_at, product_id, product:products ( name )")
            .eq("org_id", orgId)
            .gte("scanned_at", start14.toISOString())
            .order("scanned_at", { ascending: false })
        ),
        scopeWarehouse(
          admin
            .from("locations")
            .select("quantity")
            .eq("org_id", orgId)
            .eq("is_active", true)
        ),
        admin
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId),
        admin.rpc("inventory_list", {
          p_org: orgId,
          p_facility: facilityId,
          p_q: null,
          p_category: null,
          p_low_only: true,
          p_sort: "onhand",
          p_order: "asc",
          p_limit: 8,
          p_offset: 0,
        }),
        scopeWarehouse(
          admin
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .in("status", OPEN_ORDER_STATUSES as unknown as string[])
        ),
        scopeWarehouse(
          admin
            .from("orders")
            .select(
              "order_number, status, customer_name, items:order_items ( count )"
            )
            .eq("org_id", orgId)
            .in("status", PICK_QUEUE_STATUSES as unknown as string[])
            .order("created_at", { ascending: true })
            .limit(8)
        ),
        scopeWarehouse(
          admin
            .from("purchase_orders")
            .select("po_number, supplier_name, status, expected_date")
            .eq("org_id", orgId)
            .in("status", PO_IN_TRANSIT_STATUSES as unknown as string[])
            .order("expected_date", { ascending: true, nullsFirst: false })
            .limit(8)
        ),
      ]);

      type ScanRow = {
        action: string;
        scanned_at: string | null;
        product_id: string | null;
        product: { name: string | null } | { name: string | null }[] | null;
      };
      const scanRows = (scansRes.data as ScanRow[] | null) ?? [];
      const productName = (r: ScanRow) =>
        (Array.isArray(r.product) ? r.product[0]?.name : r.product?.name) ??
        null;

      // Daily buckets (oldest → today)
      const buckets = new Map<string, number>();
      for (let i = 0; i < 14; i++) {
        const d = new Date(start14);
        d.setDate(d.getDate() + i);
        buckets.set(dayKey(d), 0);
      }
      let scansToday = 0;
      const moverCounts = new Map<string, { name: string; scans: number }>();
      for (const r of scanRows) {
        if (!r.scanned_at) continue;
        const k = r.scanned_at.slice(0, 10);
        if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
        if (new Date(r.scanned_at) >= startToday) scansToday++;
        if (r.product_id) {
          const cur = moverCounts.get(r.product_id) ?? {
            name: productName(r) ?? "—",
            scans: 0,
          };
          cur.scans++;
          moverCounts.set(r.product_id, cur);
        }
      }
      const scans14d = Array.from(buckets.values());
      const prevDay = scans14d[scans14d.length - 2] ?? 0;
      const scansDelta =
        prevDay > 0
          ? Math.round(((scansToday - prevDay) / prevDay) * 100)
          : null;

      const topMovers: KioskMover[] = Array.from(moverCounts.entries())
        .map(([product_id, v]) => ({
          product_id,
          name: v.name,
          scans: v.scans,
        }))
        .sort((a, b) => b.scans - a.scans)
        .slice(0, 5);

      const recentScans: KioskScan[] = scanRows.slice(0, 6).map((r) => ({
        action: r.action,
        scanned_at: r.scanned_at,
        product_name: productName(r),
      }));

      const unitsOnHand = (
        (locRes.data as { quantity: number | null }[] | null) ?? []
      ).reduce((sum, l) => sum + (l.quantity ?? 0), 0);

      type LowRow = {
        id: string;
        name: string;
        on_hand: number;
        reorder_point: number | null;
        total_count: number;
      };
      const lowRows = (lowRes.data as LowRow[] | null) ?? [];
      const lowStock: KioskLowStock[] = lowRows.map((r) => ({
        id: r.id,
        name: r.name,
        on_hand: Number(r.on_hand ?? 0),
        reorder_point: r.reorder_point,
      }));
      const lowStockCount = Number(lowRows[0]?.total_count ?? 0);

      type OrderRow = {
        order_number: string | null;
        status: string;
        customer_name: string | null;
        items: { count: number }[] | { count: number } | null;
      };
      const pickQueue: KioskOrder[] = (
        (pickRes.data as OrderRow[] | null) ?? []
      ).map((o) => {
        const items = Array.isArray(o.items) ? o.items[0] : o.items;
        return {
          order_number: o.order_number,
          status: o.status,
          customer_name: o.customer_name,
          item_count: items?.count ?? 0,
        };
      });

      const posInTransit: KioskPo[] = (
        (poRes.data as KioskPo[] | null) ?? []
      ).map((p) => ({
        po_number: p.po_number,
        supplier_name: p.supplier_name,
        status: p.status,
        expected_date: p.expected_date,
      }));

      return {
        scansToday,
        scans14d,
        scansDelta,
        unitsOnHand,
        productCount: productCountRes.count ?? 0,
        lowStockCount,
        lowStock,
        topMovers,
        recentScans,
        openOrdersCount: openCountRes.count ?? 0,
        pickQueue,
        posInTransit,
      };
    },
    ["kiosk", orgId, facilityId ?? "all"],
    {
      tags: [
        tags.inventory(orgId),
        tags.products(orgId),
        tags.orders(orgId),
        tags.purchaseOrders(orgId),
        tags.scans(orgId),
      ],
      revalidate: 60,
    }
  )();
}
