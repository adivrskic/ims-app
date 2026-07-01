import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { productVelocities } from "@/lib/data/velocity";
import { fetchAllPaged } from "@/lib/data/paginate";

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
}

const AGING_BUCKETS: Array<{ label: string; maxDays: number }> = [
  { label: "0–30 days", maxDays: 30 },
  { label: "31–90 days", maxDays: 90 },
  { label: "91–180 days", maxDays: 180 },
  { label: "180+ days", maxDays: Infinity },
];

export async function getValuation(
  supabase: Client,
  orgId: string,
  warehouseId: string | null
): Promise<ValuationReport> {
  // Catalog + categories (org-wide), on-hand (scope-filtered), last movement.
  // Paginate all three: a plain select caps at PostgREST's ~1000 rows, which
  // would silently drop products/locations/scans and understate inventory value.
  type P = {
    id: string;
    name: string;
    internal_sku: string | null;
    unit_cost: string | null;
    category: { name: string | null } | { name: string | null }[] | null;
  };
  const [prodRows, locs, scans] = await Promise.all([
    fetchAllPaged<P>((from, to) =>
      supabase
        .from("products")
        .select("id, name, internal_sku, unit_cost, category:categories ( name )")
        .eq("org_id", orgId)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllPaged<{ product_id: string | null; quantity: number | null }>(
      (from, to) => {
        let q = supabase
          .from("locations")
          .select("product_id, quantity")
          .eq("org_id", orgId);
        if (warehouseId) q = q.eq("warehouse_id", warehouseId);
        return q.order("id", { ascending: true }).range(from, to);
      }
    ),
    fetchAllPaged<{ product_id: string | null; scanned_at: string | null }>(
      (from, to) => {
        let q = supabase
          .from("scan_history")
          .select("product_id, scanned_at")
          .eq("org_id", orgId);
        if (warehouseId) q = q.eq("warehouse_id", warehouseId);
        return q.order("id", { ascending: true }).range(from, to);
      }
    ),
  ]);

  // On-hand per product (scope).
  const onHandByProduct = new Map<string, number>();
  for (const l of (locs ?? []) as Array<{
    product_id: string | null;
    quantity: number | null;
  }>) {
    if (!l.product_id) continue;
    onHandByProduct.set(
      l.product_id,
      (onHandByProduct.get(l.product_id) ?? 0) + (l.quantity ?? 0)
    );
  }

  // Last movement per product (max scanned_at) → aging.
  const lastMovedByProduct = new Map<string, number>();
  for (const s of (scans ?? []) as Array<{
    product_id: string | null;
    scanned_at: string | null;
  }>) {
    if (!s.product_id || !s.scanned_at) continue;
    const t = new Date(s.scanned_at).getTime();
    const prev = lastMovedByProduct.get(s.product_id);
    if (prev == null || t > prev) lastMovedByProduct.set(s.product_id, t);
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

    interim.push({
      id: p.id,
      name: p.name,
      sku: p.internal_sku,
      categoryName,
      onHand,
      unitCost: hasCost ? unitCost : 0,
      value,
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
  };
}
