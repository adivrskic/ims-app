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

  // Aggregated SQL-side: the raw pick/adjust rows for a 90-day window used to
  // page through Node (100k scans = 100+ serial round trips); the RPC groups
  // by (product, day offset) and returns at most days × products rows.
  // Bucketing there is floor((scanned_at - start) / 24h) — monotonic across
  // DST, same guarantee the old local-midnight rounding provided.
  const { data, error } = await supabase.rpc("daily_demand_series", {
    p_org: orgId,
    p_start: start.toISOString(),
    p_days: days,
    p_warehouse: warehouseId,
    p_products: productIds && productIds.length ? productIds : null,
  });
  if (error) throw new Error(`daily_demand_series: ${error.message}`);

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
    product_id: string;
    day_offset: number;
    qty: number;
  }>) {
    if (r.day_offset < 0 || r.day_offset >= days) continue;
    ensure(r.product_id)[r.day_offset] += Number(r.qty);
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
export interface ForecastWorklist {
  /** Top rows by impact (capped at `limit`). */
  rows: ForecastWorklistRow[];
  /** Counts across ALL drifted SKUs (not just the displayed top-N). */
  totals: { raises: number; lowers: number; seasonal: number; total: number };
}

export function getForecastWorklist(
  orgId: string,
  warehouseId: string | null,
  opts?: { serviceLevel?: number; minDelta?: number; limit?: number }
): Promise<ForecastWorklist> {
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
): Promise<ForecastWorklist> {
  const days = FORECAST_WINDOW_DAYS;
  // Service-role client (bypasses RLS) — every query below filters org_id.
  const admin = createAdminClient() as unknown as Client;

  const emptyTotals = { raises: 0, lowers: 0, seasonal: 0, total: 0 };
  const bundle = await getDailyDemandSeries(admin, orgId, null, days, warehouseId);
  const productIds = [...bundle.seriesByProduct.keys()];
  if (productIds.length === 0) return { rows: [], totals: emptyTotals };

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

  // Totals span EVERY drifted SKU so the headline counts don't silently cap at
  // the display limit; only the returned rows are truncated to the top-N.
  const totals = {
    raises: rows.filter((r) => r.reorderPointDelta > 0).length,
    lowers: rows.filter((r) => r.reorderPointDelta < 0).length,
    seasonal: rows.filter((r) => r.hasSeasonality).length,
    total: rows.length,
  };

  return { rows: rows.slice(0, limit), totals };
}
