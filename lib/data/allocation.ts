import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Allocation / Available-to-Promise (ATP) / backorders.
 *
 * Stock is reserved to order lines via `order_items.quantity_allocated`. Nothing
 * about physical on-hand changes on allocation — it's a soft reservation that
 * holds stock back from being promised twice.
 *
 *   on_hand     = Σ locations.quantity (active, non-quarantined) for a product
 *   reserved    = Σ max(0, quantity_allocated - quantity_picked) over OPEN orders
 *                 (only the still-UNPICKED reservation holds on-hand back; picked
 *                 units have already physically left the shelf — see the contract)
 *   ATP         = on_hand - reserved          (what's free to promise)
 *   backordered = quantity_requested - quantity_allocated   (per line, ≥ 0)
 *
 * Allocation is per-facility: an order's `warehouse_id` is the source.
 *
 * PICKING CONTRACT: confirming a pick now decrements `locations.quantity` for the
 * picked-from slot in the same atomic step that sets `quantity_picked` (the
 * `app.pick_order_item` RPC, called by the mobile app, repo `hello-world2`,
 * app/orders/[id].tsx). So on-hand tracks the physical shelf and ATP holds back
 * only the unpicked remainder. (Earlier this layer held back max(allocated,
 * picked) because picking did NOT decrement on-hand; that compensation was
 * removed when pick-decrement landed — they are one change.)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AllocClient = SupabaseClient<any, "app", any>;

/** Order statuses that still hold a reservation against stock. */
export const OPEN_ORDER_STATUSES = [
  "created",
  "pick_list_assigned",
  "in_progress",
  "staged",
  "ready",
  "out_for_delivery",
] as const;

export interface StockAvailability {
  onHand: number;
  /** Unpicked reserved units across open orders = Σ max(0, allocated − picked). */
  allocated: number;
  /** on_hand − reserved. Can go negative if over-reserved; callers clamp. */
  atp: number;
  /** Open backordered demand for this product in this facility. */
  backordered: number;
}

const EMPTY: StockAvailability = {
  onHand: 0,
  allocated: 0,
  atp: 0,
  backordered: 0,
};

/**
 * Availability per product for one facility. Pass `productIds` to scope the
 * computation (recommended); omit to cover every product with stock or open
 * demand in the facility.
 */
export async function getStockAvailability(
  supabase: AllocClient,
  orgId: string,
  warehouseId: string,
  productIds?: string[]
): Promise<Map<string, StockAvailability>> {
  const out = new Map<string, StockAvailability>();
  const limitIds = productIds && productIds.length ? productIds : null;

  // Aggregate in Postgres (SUM over locations + open order_items) rather than
  // pulling every row into JS. A plain select truncates at PostgREST's ~1000-row
  // cap — which understates `reserved` and OVERSTATES ATP → oversell. Summing in
  // SQL is both correct (no cap) and one round-trip instead of thousands of rows.
  const { data, error } = await supabase.rpc("stock_availability", {
    p_org_id: orgId,
    p_warehouse_id: warehouseId,
    p_product_ids: limitIds,
  });
  if (error || !data) return out;

  for (const r of data as Array<{
    product_id: string | null;
    on_hand: number | string | null;
    reserved: number | string | null;
    backordered: number | string | null;
  }>) {
    if (!r.product_id) continue;
    const onHand = Number(r.on_hand ?? 0);
    const allocated = Number(r.reserved ?? 0);
    out.set(r.product_id, {
      onHand,
      allocated,
      atp: onHand - allocated,
      backordered: Number(r.backordered ?? 0),
    });
  }
  return out;
}

/**
 * Workspace-wide allocation for one product (across every facility / open
 * order). Used by the product detail page, which aggregates on-hand across all
 * facilities. `available = onHand - allocated` (caller supplies on-hand).
 */
export async function getProductAllocationOrgWide(
  supabase: AllocClient,
  orgId: string,
  productId: string
): Promise<{ allocated: number; backordered: number }> {
  // Org-wide (all facilities) via the same SQL aggregate — null warehouse.
  const { data } = await supabase.rpc("stock_availability", {
    p_org_id: orgId,
    p_warehouse_id: null,
    p_product_ids: [productId],
  });
  const row = ((data ?? []) as Array<{
    reserved: number | string | null;
    backordered: number | string | null;
  }>)[0];
  return {
    allocated: Number(row?.reserved ?? 0),
    backordered: Number(row?.backordered ?? 0),
  };
}

/** Single-product convenience. Returns zeros when there's no data. */
export async function getProductAvailability(
  supabase: AllocClient,
  orgId: string,
  warehouseId: string,
  productId: string
): Promise<StockAvailability> {
  const m = await getStockAvailability(supabase, orgId, warehouseId, [productId]);
  return m.get(productId) ?? { ...EMPTY };
}

// ── Allocation planning (pure) ─────────────────────────────────────────────

export interface AllocLine {
  id: string;
  productId: string;
  requested: number;
  allocated: number;
  picked: number;
}

export interface PlannedLine {
  id: string;
  /** New quantity_allocated to write (≥ picked, ≤ requested). */
  allocated: number;
  changed: boolean;
}

/**
 * Greedy allocation for a set of lines against a per-product free pool.
 *
 * `freePool` is the stock available to THIS order per product — i.e. on-hand
 * minus everyone else's unpicked reservations (Σ max(0, allocated − picked); the
 * caller computes it by excluding this order). Allocation never drops below
 * already-picked units and never exceeds requested. Lines sharing a product draw
 * the pool in order.
 */
export function planAllocation(
  lines: AllocLine[],
  freePool: Map<string, number>
): PlannedLine[] {
  const pool = new Map(freePool);
  const planned: PlannedLine[] = [];

  for (const line of lines) {
    const want = Math.max(0, line.requested - line.picked); // unpicked demand
    const avail = Math.max(0, pool.get(line.productId) ?? 0);
    const take = Math.min(want, avail);
    const newAllocated = line.picked + take;
    pool.set(line.productId, avail - take);
    planned.push({
      id: line.id,
      allocated: newAllocated,
      changed: newAllocated !== line.allocated,
    });
  }
  return planned;
}

// ── Backorders report ──────────────────────────────────────────────────────

export interface BackorderRow {
  orderItemId: string;
  orderId: string;
  orderNumber: string | null;
  orderStatus: string;
  createdAt: string | null;
  warehouseId: string | null;
  productId: string | null;
  productName: string;
  sku: string | null;
  requested: number;
  allocated: number;
  backordered: number;
}

/**
 * Open backordered lines (allocated < requested), oldest order first. Scope to
 * a facility with `warehouseId`, or pass null for the whole workspace.
 */
export async function getBackorders(
  supabase: AllocClient,
  orgId: string,
  warehouseId: string | null
): Promise<BackorderRow[]> {
  // One RPC: PostgREST can't compare two columns, so the allocated < requested
  // filter lives in app.backorder_lines. Returns only actual backorder lines
  // (oldest order first) instead of the whole open-order book.
  const { data, error } = await supabase.rpc("backorder_lines", {
    p_org: orgId,
    p_statuses: OPEN_ORDER_STATUSES as unknown as string[],
    p_warehouse: warehouseId,
  });
  if (error) throw new Error(`backorder_lines: ${error.message}`);

  return ((data ?? []) as Array<{
    order_item_id: string;
    order_id: string;
    order_number: string | null;
    order_status: string;
    created_at: string | null;
    warehouse_id: string | null;
    product_id: string | null;
    product_name: string | null;
    sku: string | null;
    requested: number;
    allocated: number;
    backordered: number;
  }>).map((r) => ({
    orderItemId: r.order_item_id,
    orderId: r.order_id,
    orderNumber: r.order_number,
    orderStatus: r.order_status,
    createdAt: r.created_at,
    warehouseId: r.warehouse_id,
    productId: r.product_id,
    productName: r.product_name ?? "Unknown product",
    sku: r.sku,
    requested: r.requested,
    allocated: r.allocated,
    backordered: r.backordered,
  }));
}

// ── Mutations (called by server actions; take the client as a param) ───────

export interface AllocateSummary {
  skipped: boolean;
  reason?: string;
  /** Lines whose allocation changed. */
  changedLines: number;
  requestedUnits: number;
  allocatedUnits: number;
  backorderedUnits: number;
  fullyAllocated: boolean;
}

/**
 * (Re)allocate one order against current availability. Idempotent: re-running
 * with unchanged stock is a no-op. Excludes the order's own current reservation
 * from the pool so re-allocation doesn't fight itself.
 *
 * Runs entirely inside the `app.allocate_order` RPC under a per-facility
 * advisory lock, so two orders for the same SKU can't each subtract the same
 * ATP and oversell. The greedy planner (see {@link planAllocation}) is mirrored
 * in SQL there.
 */
export async function allocateOrderInternal(
  supabase: AllocClient,
  orgId: string,
  orderId: string
): Promise<AllocateSummary> {
  const none: AllocateSummary = {
    skipped: true,
    changedLines: 0,
    requestedUnits: 0,
    allocatedUnits: 0,
    backorderedUnits: 0,
    fullyAllocated: false,
  };

  const { data, error } = await supabase.rpc("allocate_order", {
    p_org_id: orgId,
    p_order_id: orderId,
  });
  if (error) return { ...none, reason: error.message };

  const r = (data ?? {}) as Partial<AllocateSummary> & { skipped?: boolean };
  if (r.skipped) return { ...none, reason: r.reason };
  return {
    skipped: false,
    changedLines: r.changedLines ?? 0,
    requestedUnits: r.requestedUnits ?? 0,
    allocatedUnits: r.allocatedUnits ?? 0,
    backorderedUnits: r.backorderedUnits ?? 0,
    fullyAllocated: r.fullyAllocated ?? false,
  };
}

/**
 * Release an order's reservation (e.g. on cancel). Clamps each line's
 * `quantity_allocated` down to `quantity_picked` rather than zeroing it — so the
 * still-unpicked portion returns to ATP for other orders, while already-picked
 * units stay accounted for (zeroing would break the allocated ≥ picked invariant
 * the ATP math depends on, re-promising picked-but-unshipped stock). Runs in the
 * `release_order_allocation` RPC as a single column-to-column UPDATE.
 */
export async function releaseOrderAllocationInternal(
  supabase: AllocClient,
  orgId: string,
  orderId: string
): Promise<void> {
  await supabase.rpc("release_order_allocation", {
    p_org_id: orgId,
    p_order_id: orderId,
  });
}

export interface FillableBackorders {
  productId: string;
  atp: number;
  backorderedUnits: number;
  /** min(atp, backordered) — how many units the arriving stock can satisfy. */
  fillableUnits: number;
  orderCount: number;
}

/** Read-side: how much backordered demand newly-received stock could fill. */
export async function getFillableBackorders(
  supabase: AllocClient,
  orgId: string,
  warehouseId: string,
  productId: string
): Promise<FillableBackorders> {
  const avail = await getProductAvailability(
    supabase,
    orgId,
    warehouseId,
    productId
  );
  const bos = (await getBackorders(supabase, orgId, warehouseId)).filter(
    (b) => b.productId === productId
  );
  const backorderedUnits = bos.reduce((s, b) => s + b.backordered, 0);
  const orderCount = new Set(bos.map((b) => b.orderId)).size;
  const fillableUnits = Math.max(0, Math.min(avail.atp, backorderedUnits));
  return { productId, atp: avail.atp, backorderedUnits, fillableUnits, orderCount };
}

/**
 * Allocate available stock to the oldest backordered orders for a product.
 *
 * Runs inside the `app.fill_backorders` RPC under the SAME per-facility advisory
 * lock as `allocate_order`, computing ATP inside the lock and issuing
 * column-relative UPDATEs. This closes the read-then-write race (two concurrent
 * fills each draining the same pool → oversell) and the stale-snapshot clobber
 * the previous JS loop had.
 */
export async function fillBackordersInternal(
  supabase: AllocClient,
  orgId: string,
  warehouseId: string,
  productId: string
): Promise<{ filledUnits: number; filledLines: number; orders: number }> {
  const { data, error } = await supabase.rpc("fill_backorders", {
    p_org_id: orgId,
    p_warehouse_id: warehouseId,
    p_product_id: productId,
  });
  if (error || !data) return { filledUnits: 0, filledLines: 0, orders: 0 };
  const r = data as {
    filledUnits?: number;
    filledLines?: number;
    orders?: number;
  };
  return {
    filledUnits: r.filledUnits ?? 0,
    filledLines: r.filledLines ?? 0,
    orders: r.orders ?? 0,
  };
}
