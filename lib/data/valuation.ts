import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { productVelocities } from "@/lib/data/velocity";
import { fetchAllPaged } from "@/lib/data/paginate";
import { fifoValue, type CostLayer } from "@/lib/fifoLayers";
import { tags } from "@/lib/cache-tags";

/**
 * Inventory valuation + turnover + ABC + aging.
 *
 * Read-only analytics computed from current on-hand (locations.quantity),
 * product unit_cost, and scan_history (last-movement for aging + velocity for
 * turnover). Scope-aware: pass a warehouseId to value a single facility, or
 * null for the whole org.
 *
 * Valuation method: on-hand × current unit_cost (weighted-avg-style "current
 * cost"). True FIFO/LIFO cost layering is out of scope — noted for later.
 * ABC is by on-hand value (where capital is tied up): A = top 80% of value,
 * B = next 15%, C = last 5% (classic Pareto).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "app", any>;

export type AbcClass = "A" | "B" | "C";

export interface ProductValuation {
  id: string;
  name: string;
  sku: string | null;
  categoryName: string | null;
  onHand: number;
  unitCost: number;
  value: number;
  /** FIFO-layered value (receipt costs, oldest consumed first). */
  fifoValue: number;
  abc: AbcClass;
  lastMovedDays: number | null;
}

export interface AgingBucket {
  label: string;
  value: number;
  units: number;
}

export interface ValuationReport {
  totalValue: number;
  totalUnits: number;
  valuedSkus: number;
  avgUnitCost: number;
  uncostedSkus: number; // on-hand but no unit_cost → excluded from value
  byCategory: Array<{ name: string; value: number; pct: number }>;
  abc: Record<AbcClass, { count: number; value: number }>;
  turnover: number | null;
  daysOnHand: number | null;
  aging: AgingBucket[];
  products: ProductValuation[];
  /** FIFO cost-layer totals (receipt-priced; see lib/fifoLayers). */
  fifo: {
    totalValue: number;
    /** On-hand units with no receipt history — valued at current unit cost. */
    unlayeredUnits: number;
  };
}

const AGING_BUCKETS: Array<{ label: string; maxDays: number }> = [
  { label: "0–30 days", maxDays: 30 },
  { label: "31–90 days", maxDays: 90 },
  { label: "91–180 days", maxDays: 180 },
  { label: "180+ days", maxDays: Infinity },
];

export function getValuation(
  orgId: string,
  warehouseId: string | null
): Promise<ValuationReport> {
  return unstable_cache(
    () => computeValuation(orgId, warehouseId),
    ["valuation", orgId, warehouseId ?? "all"],
    { tags: [tags.inventory(orgId), tags.scans(orgId)], revalidate: 300 }
  )();
}

async function computeValuation(
  orgId: string,
  warehouseId: string | null
): Promise<ValuationReport> {
  const supabase = createAdminClient() as unknown as Client;

  // Catalog + categories (org-wide, paginated — a plain select caps at
  // PostgREST's ~1000 rows), plus one aggregate RPC for on-hand and last
  // movement per product (previously this fetched EVERY location and scan
  // row to sum/max in JS).
  type P = {
    id: string;
    name: string;
    internal_sku: string | null;
    unit_cost: string | null;
    category: { name: string | null } | { name: string | null }[] | null;
  };
  const [prodRows, { data: movement }, receiptRows] = await Promise.all([
    fetchAllPaged<P>((from, to) =>
      supabase
        .from("products")
        .select("id, name, internal_sku, unit_cost, category:categories ( name )")
        .eq("org_id", orgId)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    supabase.rpc("product_movement_stats", {
      p_org: orgId,
      p_warehouse: warehouseId,
    }),
    // FIFO cost layers: every received PO line is a layer (landed cost when
    // known). Scoped to the facility's POs when a facility scope is active.
    fetchAllPaged<{
      product_id: string | null;
      quantity_received: number | null;
      unit_cost: string | number | null;
      landed_unit_cost: string | number | null;
      received_at: string | null;
      po: { org_id: string } | { org_id: string }[] | null;
    }>((from, to) => {
      let q = supabase
        .from("po_line_items")
        .select(
          "product_id, quantity_received, unit_cost, landed_unit_cost, received_at, po:purchase_orders!inner ( org_id )"
        )
        .eq("po.org_id", orgId)
        .gt("quantity_received", 0)
        .not("received_at", "is", null);
      if (warehouseId) q = q.eq("po.warehouse_id", warehouseId);
      return q.order("id", { ascending: true }).range(from, to);
    }),
  ]);

  const layersByProduct = new Map<string, CostLayer[]>();
  for (const r of receiptRows) {
    if (!r.product_id || !r.received_at) continue;
    const cost = Number(r.landed_unit_cost ?? r.unit_cost ?? 0);
    const layer: CostLayer = {
      qty: r.quantity_received ?? 0,
      unitCost: Number.isFinite(cost) && cost > 0 ? cost : 0,
      receivedAt: r.received_at,
    };
    const arr = layersByProduct.get(r.product_id);
    if (arr) arr.push(layer);
    else layersByProduct.set(r.product_id, [layer]);
  }

  const onHandByProduct = new Map<string, number>();
  const lastMovedByProduct = new Map<string, number>();
  for (const m of (movement ?? []) as Array<{
    product_id: string;
    on_hand: number;
    last_scanned_at: string | null;
  }>) {
    onHandByProduct.set(m.product_id, Number(m.on_hand));
    if (m.last_scanned_at) {
      lastMovedByProduct.set(m.product_id, new Date(m.last_scanned_at).getTime());
    }
  }

  // Velocity (org-wide, 60d) for turnover.
  const productIds = prodRows.map((p) => p.id);
  const velocities = await productVelocities(supabase, { productIds });

  const now = Date.now();
  let totalValue = 0;
  let totalUnits = 0;
  let valuedSkus = 0;
  let valuedUnits = 0; // on-hand units belonging to costed SKUs only
  let uncostedSkus = 0;
  let annualUsageValue = 0; // Σ velocity × 365 × cost → COGS proxy
  let totalFifoValue = 0;
  let fifoUnlayeredUnits = 0;

  const byCategory = new Map<string, number>();
  const aging: number[] = [0, 0, 0, 0];
  const agingUnits: number[] = [0, 0, 0, 0];

  type Interim = ProductValuation & { _sortValue: number };
  const interim: Interim[] = [];

  for (const p of prodRows) {
    const onHand = onHandByProduct.get(p.id) ?? 0;
    if (onHand <= 0) continue; // valuation = what's on the shelf
    totalUnits += onHand;

    const cat = Array.isArray(p.category) ? p.category[0] : p.category;
    const categoryName = cat?.name ?? null;
    const unitCost =
      p.unit_cost != null && p.unit_cost !== "" ? parseFloat(p.unit_cost) : NaN;

    const hasCost = Number.isFinite(unitCost) && unitCost > 0;
    const value = hasCost ? onHand * unitCost : 0;
    if (hasCost) {
      valuedSkus++;
      valuedUnits += onHand;
      totalValue += value;
      byCategory.set(
        categoryName ?? "Uncategorized",
        (byCategory.get(categoryName ?? "Uncategorized") ?? 0) + value
      );
      annualUsageValue += (velocities.get(p.id) ?? 0) * 365 * unitCost;
    } else {
      uncostedSkus++;
    }

    // Aging by last movement (fallback: treat never-moved as oldest bucket).
    const lastMs = lastMovedByProduct.get(p.id);
    const lastMovedDays =
      lastMs != null ? Math.floor((now - lastMs) / 86_400_000) : null;
    const ageDays = lastMovedDays ?? 9999;
    const bi = AGING_BUCKETS.findIndex((b) => ageDays <= b.maxDays);
    const idx = bi === -1 ? AGING_BUCKETS.length - 1 : bi;
    aging[idx] += value;
    agingUnits[idx] += onHand;

    // FIFO layer value for the same on-hand units (receipt-priced; on-hand
    // beyond receipt history falls back to the current unit cost).
    const fifo = fifoValue(
      layersByProduct.get(p.id) ?? [],
      onHand,
      hasCost ? unitCost : 0
    );
    totalFifoValue += fifo.value;
    fifoUnlayeredUnits += fifo.unlayeredUnits;

    interim.push({
      id: p.id,
      name: p.name,
      sku: p.internal_sku,
      categoryName,
      onHand,
      unitCost: hasCost ? unitCost : 0,
      value,
      fifoValue: fifo.value,
      abc: "C",
      lastMovedDays,
      _sortValue: value,
    });
  }

  // ABC by on-hand value: rank desc, cumulative 80% = A, 95% = B, rest = C.
  interim.sort((a, b) => b._sortValue - a._sortValue);
  let cumulative = 0;
  const abc: Record<AbcClass, { count: number; value: number }> = {
    A: { count: 0, value: 0 },
    B: { count: 0, value: 0 },
    C: { count: 0, value: 0 },
  };
  for (const row of interim) {
    const beforePct = totalValue > 0 ? cumulative / totalValue : 1;
    const cls: AbcClass =
      row.value <= 0 ? "C" : beforePct < 0.8 ? "A" : beforePct < 0.95 ? "B" : "C";
    row.abc = cls;
    cumulative += row.value;
    abc[cls].count++;
    abc[cls].value += row.value;
  }

  const turnover =
    totalValue > 0 && annualUsageValue > 0 ? annualUsageValue / totalValue : null;
  const daysOnHand = turnover && turnover > 0 ? Math.round(365 / turnover) : null;

  const byCategoryArr = Array.from(byCategory.entries())
    .map(([name, value]) => ({
      name,
      value,
      pct: totalValue > 0 ? Math.round((value / totalValue) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return {
    totalValue,
    totalUnits,
    valuedSkus,
    // Divide by valued units only — totalUnits includes uncosted SKUs, which
    // would understate the average (denominator too large).
    avgUnitCost: valuedUnits > 0 ? totalValue / valuedUnits : 0,
    uncostedSkus,
    byCategory: byCategoryArr,
    abc,
    turnover,
    daysOnHand,
    aging: AGING_BUCKETS.map((b, i) => ({
      label: b.label,
      value: aging[i],
      units: agingUnits[i],
    })),
    products: interim.map(({ _sortValue, ...rest }) => {
      void _sortValue;
      return rest;
    }),
    fifo: {
      totalValue: totalFifoValue,
      unlayeredUnits: fifoUnlayeredUnits,
    },
  };
}
