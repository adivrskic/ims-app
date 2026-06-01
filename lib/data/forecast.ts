import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildForecast, type ForecastResult } from "@/lib/forecast";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";

/**
 * Demand-forecast reads. Builds daily demand series from scan_history
 * (pick + adjust, the same consumption signal velocity uses) and runs the
 * statistical forecast (trend + seasonality + service-level safety stock).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "app", any>;

export const FORECAST_WINDOW_DAYS = 90;
export const DEFAULT_SERVICE_LEVEL = 0.95;
const DEFAULT_LEAD_TIME = 7;

interface SeriesBundle {
  seriesByProduct: Map<string, number[]>;
  startDow: number;
  nextDow: number;
  days: number;
}

function windowStart(days: number): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

/** Daily consumed-units series per product over the window, oldest → newest. */
async function getDailyDemandSeries(
  supabase: Client,
  orgId: string,
  productIds: string[] | null,
  days: number,
  warehouseId: string | null
): Promise<SeriesBundle> {
  const start = windowStart(days);
  const startMs = start.getTime();

  let q = supabase
    .from("scan_history")
    .select("product_id, quantity, scanned_at")
    .eq("org_id", orgId)
    .in("action", ["pick", "adjust"])
    .gte("scanned_at", start.toISOString());
  if (productIds && productIds.length) q = q.in("product_id", productIds);
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  const { data } = await q;

  const seriesByProduct = new Map<string, number[]>();
  const ensure = (pid: string) => {
    let s = seriesByProduct.get(pid);
    if (!s) {
      s = new Array(days).fill(0);
      seriesByProduct.set(pid, s);
    }
    return s;
  };

  for (const r of (data ?? []) as Array<{
    product_id: string | null;
    quantity: number | null;
    scanned_at: string | null;
  }>) {
    if (!r.product_id || !r.scanned_at) continue;
    const d = new Date(r.scanned_at);
    d.setHours(0, 0, 0, 0);
    // Round, not floor: both ends are LOCAL midnights, so across a DST boundary
    // the gap between two midnights N days apart is N×24h ± 1h. Flooring the
    // ms-division dropped a unit into the previous day's bucket near the
    // transition; rounding to the nearest day is DST-safe.
    const idx = Math.round((d.getTime() - startMs) / 86_400_000);
    if (idx < 0 || idx >= days) continue;
    ensure(r.product_id)[idx] += Math.abs(r.quantity ?? 0);
  }

  return {
    seriesByProduct,
    startDow: start.getDay(),
    nextDow: (start.getDay() + days) % 7,
    days,
  };
}

export interface ProductForecast {
  forecast: ForecastResult;
  currentReorderPoint: number;
  currentSafetyStock: number;
  leadTimeDays: number;
  /** No demand signal in the window. */
  empty: boolean;
}

export async function getProductForecast(
  supabase: Client,
  orgId: string,
  productId: string,
  opts: {
    leadTimeDays: number;
    serviceLevel?: number;
    warehouseId?: string | null;
  }
): Promise<ProductForecast> {
  const days = FORECAST_WINDOW_DAYS;
  const bundle = await getDailyDemandSeries(
    supabase,
    orgId,
    [productId],
    days,
    opts.warehouseId ?? null
  );
  const series = bundle.seriesByProduct.get(productId) ?? new Array(days).fill(0);

  const { data: product } = await supabase
    .from("products")
    .select("reorder_point, safety_stock")
    .eq("id", productId)
    .maybeSingle();

  const forecast = buildForecast(series, {
    startDow: bundle.startDow,
    nextDow: bundle.nextDow,
    leadTimeDays: opts.leadTimeDays,
    serviceLevel: opts.serviceLevel ?? DEFAULT_SERVICE_LEVEL,
  });

  return {
    forecast,
    currentReorderPoint:
      (product as { reorder_point: number | null } | null)?.reorder_point ?? 0,
    currentSafetyStock:
      (product as { safety_stock: number | null } | null)?.safety_stock ?? 0,
    leadTimeDays: opts.leadTimeDays,
    empty: series.every((v) => v === 0),
  };
}

export interface ForecastWorklistRow {
  productId: string;
  productName: string;
  sku: string | null;
  avgDaily: number;
  trendPerDay: number;
  hasSeasonality: boolean;
  currentReorderPoint: number;
  suggestedReorderPoint: number;
  reorderPointDelta: number;
  currentSafetyStock: number;
  suggestedSafetyStock: number;
  leadTimeDays: number;
  /** Ranking weight: how much the ROP should move, scaled by demand. */
  impact: number;
}

/**
 * Products whose current reorder settings diverge from what demand suggests —
 * the demand-planning worklist. Ranked by impact (ROP gap × demand).
 *
 * Cross-request cached (mirrors getInventoryList): the per-product buildForecast
 * over a 90-day scan_history window is expensive and ran on every page render.
 * Uses the service-role client (filtering org_id explicitly), keyed by org +
 * facility + tuning params, tagged products/inventory so reorder-point edits and
 * new scans bust it, with a 30-min TTL so the rolling window stays fresh.
 */
export function getForecastWorklist(
  orgId: string,
  warehouseId: string | null,
  opts?: { serviceLevel?: number; minDelta?: number; limit?: number }
): Promise<ForecastWorklistRow[]> {
  const serviceLevel = opts?.serviceLevel ?? DEFAULT_SERVICE_LEVEL;
  const minDelta = opts?.minDelta ?? 1;
  const limit = opts?.limit ?? 50;

  return unstable_cache(
    () => computeForecastWorklist(orgId, warehouseId, serviceLevel, minDelta, limit),
    [
      "forecast-worklist",
      orgId,
      warehouseId ?? "all",
      String(serviceLevel),
      String(minDelta),
      String(limit),
    ],
    { tags: [tags.products(orgId), tags.inventory(orgId)], revalidate: 1800 }
  )();
}

async function computeForecastWorklist(
  orgId: string,
  warehouseId: string | null,
  serviceLevel: number,
  minDelta: number,
  limit: number
): Promise<ForecastWorklistRow[]> {
  const days = FORECAST_WINDOW_DAYS;
  // Service-role client (bypasses RLS) — every query below filters org_id.
  const admin = createAdminClient() as unknown as Client;

  const bundle = await getDailyDemandSeries(admin, orgId, null, days, warehouseId);
  const productIds = [...bundle.seriesByProduct.keys()];
  if (productIds.length === 0) return [];

  const { data: products } = await admin
    .from("products")
    .select("id, name, internal_sku, reorder_point, safety_stock, lead_time_days")
    .eq("org_id", orgId)
    .in("id", productIds);

  const rows: ForecastWorklistRow[] = [];
  for (const p of (products ?? []) as Array<{
    id: string;
    name: string | null;
    internal_sku: string | null;
    reorder_point: number | null;
    safety_stock: number | null;
    lead_time_days: number | null;
  }>) {
    const series = bundle.seriesByProduct.get(p.id);
    if (!series) continue;
    const leadTimeDays = p.lead_time_days ?? DEFAULT_LEAD_TIME;
    const f = buildForecast(series, {
      startDow: bundle.startDow,
      nextDow: bundle.nextDow,
      leadTimeDays,
      serviceLevel,
    });
    const currentReorderPoint = p.reorder_point ?? 0;
    const delta = f.reorderPoint - currentReorderPoint;
    if (Math.abs(delta) < minDelta) continue;
    rows.push({
      productId: p.id,
      productName: p.name ?? "Unknown product",
      sku: p.internal_sku,
      avgDaily: f.avgDaily,
      trendPerDay: f.trendPerDay,
      hasSeasonality: f.seasonality.significant,
      currentReorderPoint,
      suggestedReorderPoint: f.reorderPoint,
      reorderPointDelta: delta,
      currentSafetyStock: p.safety_stock ?? 0,
      suggestedSafetyStock: f.safetyStock,
      leadTimeDays,
      impact: Math.abs(delta) * (f.avgDaily + 0.1),
    });
  }

  rows.sort((a, b) => b.impact - a.impact);
  return rows.slice(0, limit);
}
