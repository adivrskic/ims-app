import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDatasetMeta, type ReportConfig } from "@/lib/reports-meta";

/**
 * Report dataset RUNNERS (server-only). Each builds a safe, parameterized query
 * for a predefined dataset and returns rows keyed by the dataset's column keys.
 * The builder UI only ever picks from these predefined columns/filters — there
 * is no arbitrary SQL.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "app", any>;

export interface RunOpts {
  warehouseId: string | null;
  filters: Record<string, string>;
  limit?: number;
}

type Row = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function oneOf(v: any): any {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

async function runInventory(
  supabase: Client,
  orgId: string,
  opts: RunOpts
): Promise<Row[]> {
  const [{ data: products }, { data: locs }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, internal_sku, manufacturer, unit_cost, reorder_point, category:categories ( name )"
      )
      .eq("org_id", orgId)
      .order("name", { ascending: true }),
    (() => {
      let q = supabase
        .from("locations")
        .select("product_id, quantity")
        .eq("org_id", orgId)
        .eq("is_active", true);
      if (opts.warehouseId) q = q.eq("warehouse_id", opts.warehouseId);
      return q;
    })(),
  ]);

  const onHand = new Map<string, number>();
  for (const l of (locs ?? []) as Array<{ product_id: string | null; quantity: number | null }>) {
    if (!l.product_id) continue;
    onHand.set(l.product_id, (onHand.get(l.product_id) ?? 0) + (l.quantity ?? 0));
  }

  const lowOnly = opts.filters.low_only === "1" || opts.filters.low_only === "true";
  const catFilter = (opts.filters.category ?? "").trim().toLowerCase();

  const rows: Row[] = [];
  for (const p of (products ?? []) as Array<Record<string, unknown>>) {
    const cat = oneOf(p.category) as { name: string | null } | null;
    const categoryName = cat?.name ?? "";
    if (catFilter && !categoryName.toLowerCase().includes(catFilter)) continue;
    const oh = onHand.get(p.id as string) ?? 0;
    const rp = (p.reorder_point as number | null) ?? 0;
    if (lowOnly && !(rp > 0 && oh <= rp)) continue;
    const unitCost = p.unit_cost != null ? parseFloat(String(p.unit_cost)) : 0;
    rows.push({
      sku: p.internal_sku ?? "",
      name: p.name ?? "",
      category: categoryName,
      manufacturer: p.manufacturer ?? "",
      on_hand: oh,
      reorder_point: rp,
      unit_cost: unitCost || 0,
      value: +(oh * (unitCost || 0)).toFixed(2),
    });
  }
  return rows;
}

async function runMovements(
  supabase: Client,
  orgId: string,
  opts: RunOpts
): Promise<Row[]> {
  let q = supabase
    .from("scan_history")
    .select(
      "scanned_at, action, quantity, reason_code, notes, product:products ( name )"
    )
    .eq("org_id", orgId)
    .order("scanned_at", { ascending: false })
    .limit(opts.limit ?? 1000);
  if (opts.warehouseId) q = q.eq("warehouse_id", opts.warehouseId);
  if (opts.filters.action) q = q.eq("action", opts.filters.action);
  if (opts.filters.since) q = q.gte("scanned_at", `${opts.filters.since}T00:00:00Z`);
  if (opts.filters.until) q = q.lte("scanned_at", `${opts.filters.until}T23:59:59Z`);
  const { data } = await q;

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const product = oneOf(r.product) as { name: string | null } | null;
    return {
      scanned_at: r.scanned_at
        ? new Date(r.scanned_at as string).toLocaleString()
        : "",
      action: r.action ?? "",
      product_name: product?.name ?? "",
      quantity: r.quantity ?? 0,
      reason_code: r.reason_code ?? "",
      notes: r.notes ?? "",
    };
  });
}

async function runOrders(
  supabase: Client,
  orgId: string,
  opts: RunOpts
): Promise<Row[]> {
  let q = supabase
    .from("orders")
    .select(
      "id, order_number, order_type, status, customer_name, delivery_date"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 1000);
  if (opts.warehouseId) q = q.eq("warehouse_id", opts.warehouseId);
  if (opts.filters.status) q = q.eq("status", opts.filters.status);
  if (opts.filters.order_type) q = q.eq("order_type", opts.filters.order_type);
  const { data: orders } = await q;

  const orderList = (orders ?? []) as Array<Record<string, unknown>>;
  if (orderList.length === 0) return [];

  const { data: items } = await supabase
    .from("order_items")
    .select("order_id, quantity_requested, quantity_allocated, quantity_picked")
    .in(
      "order_id",
      orderList.map((o) => o.id as string)
    );

  const agg = new Map<string, { req: number; alloc: number; picked: number }>();
  for (const it of (items ?? []) as Array<{
    order_id: string;
    quantity_requested: number | null;
    quantity_allocated: number | null;
    quantity_picked: number | null;
  }>) {
    const cur = agg.get(it.order_id) ?? { req: 0, alloc: 0, picked: 0 };
    cur.req += it.quantity_requested ?? 0;
    cur.alloc += it.quantity_allocated ?? 0;
    cur.picked += it.quantity_picked ?? 0;
    agg.set(it.order_id, cur);
  }

  return orderList.map((o) => {
    const a = agg.get(o.id as string) ?? { req: 0, alloc: 0, picked: 0 };
    return {
      order_number: o.order_number ?? "",
      order_type: o.order_type ?? "",
      status: o.status ?? "",
      customer_name: o.customer_name ?? "",
      delivery_date: o.delivery_date ?? "",
      requested: a.req,
      allocated: a.alloc,
      picked: a.picked,
    };
  });
}

const RUNNERS: Record<
  string,
  (supabase: Client, orgId: string, opts: RunOpts) => Promise<Row[]>
> = {
  inventory: runInventory,
  movements: runMovements,
  orders: runOrders,
};

export interface ReportResult {
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Row[];
}

/** Run a dataset with a saved config, projecting to the selected columns. */
export async function runReport(
  supabase: Client,
  orgId: string,
  datasetId: string,
  config: ReportConfig,
  opts: { warehouseId: string | null; limit?: number }
): Promise<ReportResult | null> {
  const meta = getDatasetMeta(datasetId);
  const runner = RUNNERS[datasetId];
  if (!meta || !runner) return null;

  const selected =
    config.columns && config.columns.length > 0
      ? config.columns
      : meta.columns.map((c) => c.key);
  const columns = meta.columns.filter((c) => selected.includes(c.key));

  const rows = await runner(supabase, orgId, {
    warehouseId: opts.warehouseId,
    filters: config.filters ?? {},
    limit: opts.limit,
  });

  return { columns, rows };
}
