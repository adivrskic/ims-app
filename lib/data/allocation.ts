import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Allocation / Available-to-Promise (ATP) / backorders.
 *
 * Stock is reserved to order lines via `order_items.quantity_allocated`. Nothing
 * about physical on-hand changes on allocation — it's a soft reservation that
 * holds stock back from being promised twice.
 *
 *   on_hand     = Σ locations.quantity (active) for a product in a facility
 *   committed   = Σ max(quantity_allocated, quantity_picked) over OPEN orders
 *                 (units held back from being promised: the reservation, or what
 *                 has already been picked if that's more — see the picking note)
 *   ATP         = on_hand - committed         (what's free to promise)
 *   backordered = quantity_requested - quantity_allocated   (per line, ≥ 0)
 *
 * Allocation is per-facility: an order's `warehouse_id` is the source.
 *
 * PICKING CONTRACT (verified against the mobile app, repo `hello-world2`,
 * app/orders/[id].tsx): confirming a pick writes `quantity_picked` + a 'pick'
 * scan_history row but does NOT decrement `locations.quantity` — and no order
 * transition (ship/complete) decrements it either. So on-hand is "nominal until
 * shipped": picked units are still counted in `on_hand`. We therefore hold back
 * `max(allocated, picked)` rather than the unpicked remainder `allocated - picked`
 * — otherwise picking an order would progressively raise its ATP and oversell the
 * picked-but-unshipped units. (Physically depleting on-hand at ship is a separate,
 * larger change — see docs/audit-followups.md.)
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
  /** Committed units across open orders = Σ max(allocated, picked) (holds on-hand back). */
  allocated: number;
  /** on_hand − committed. Can go negative if over-committed; callers clamp. */
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
  const limitIds = productIds && productIds.length ? new Set(productIds) : null;

  // ── On-hand from active locations. ───────────────────────────────────────
  let locQ = supabase
    .from("locations")
    .select("product_id, quantity")
    .eq("org_id", orgId)
    .eq("warehouse_id", warehouseId)
    .eq("is_active", true)
    .eq("quarantined", false); // QC-held stock is owned but not available
  if (limitIds) locQ = locQ.in("product_id", [...limitIds]);
  const { data: locs } = await locQ;

  for (const l of (locs ?? []) as Array<{
    product_id: string | null;
    quantity: number | null;
  }>) {
    if (!l.product_id) continue;
    const cur = out.get(l.product_id) ?? { ...EMPTY };
    cur.onHand += l.quantity ?? 0;
    out.set(l.product_id, cur);
  }

  // ── Open orders in this facility → their line items. ─────────────────────
  const { data: openOrders } = await supabase
    .from("orders")
    .select("id")
    .eq("org_id", orgId)
    .eq("warehouse_id", warehouseId)
    .in("status", OPEN_ORDER_STATUSES as unknown as string[]);
  const openIds = (openOrders ?? []).map((o) => (o as { id: string }).id);

  if (openIds.length > 0) {
    let itemQ = supabase
      .from("order_items")
      .select("product_id, quantity_requested, quantity_allocated, quantity_picked")
      .in("order_id", openIds);
    if (limitIds) itemQ = itemQ.in("product_id", [...limitIds]);
    const { data: items } = await itemQ;

    for (const it of (items ?? []) as Array<{
      product_id: string | null;
      quantity_requested: number | null;
      quantity_allocated: number | null;
      quantity_picked: number | null;
    }>) {
      if (!it.product_id) continue;
      const cur = out.get(it.product_id) ?? { ...EMPTY };
      const allocated = it.quantity_allocated ?? 0;
      const picked = it.quantity_picked ?? 0;
      const requested = it.quantity_requested ?? 0;
      cur.allocated += Math.max(allocated, picked);
      cur.backordered += Math.max(0, requested - allocated);
      out.set(it.product_id, cur);
    }
  }

  // ── Finalize ATP. ────────────────────────────────────────────────────────
  for (const v of out.values()) {
    v.atp = v.onHand - v.allocated;
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
  const { data: openOrders } = await supabase
    .from("orders")
    .select("id")
    .eq("org_id", orgId)
    .in("status", OPEN_ORDER_STATUSES as unknown as string[]);
  const ids = (openOrders ?? []).map((o) => (o as { id: string }).id);
  if (ids.length === 0) return { allocated: 0, backordered: 0 };

  const { data: items } = await supabase
    .from("order_items")
    .select("quantity_requested, quantity_allocated, quantity_picked")
    .eq("product_id", productId)
    .in("order_id", ids);

  let allocated = 0;
  let backordered = 0;
  for (const it of (items ?? []) as Array<{
    quantity_requested: number | null;
    quantity_allocated: number | null;
    quantity_picked: number | null;
  }>) {
    allocated += Math.max(it.quantity_allocated ?? 0, it.quantity_picked ?? 0);
    backordered += Math.max(0, (it.quantity_requested ?? 0) - (it.quantity_allocated ?? 0));
  }
  return { allocated, backordered };
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
 * minus everyone else's committed units (Σ max(allocated, picked); the caller
 * computes it by excluding this order). Allocation never drops below already-
 * picked units and never exceeds requested. Lines sharing a product draw the
 * pool in order.
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
  let ordersQ = supabase
    .from("orders")
    .select("id, order_number, status, created_at, warehouse_id")
    .eq("org_id", orgId)
    .in("status", OPEN_ORDER_STATUSES as unknown as string[]);
  if (warehouseId) ordersQ = ordersQ.eq("warehouse_id", warehouseId);
  const { data: orders } = await ordersQ;

  const orderById = new Map(
    ((orders ?? []) as Array<{
      id: string;
      order_number: string | null;
      status: string;
      created_at: string | null;
      warehouse_id: string | null;
    }>).map((o) => [o.id, o])
  );
  if (orderById.size === 0) return [];

  const { data: items } = await supabase
    .from("order_items")
    .select(
      "id, order_id, product_id, quantity_requested, quantity_allocated, product:products ( name, internal_sku )"
    )
    .in("order_id", [...orderById.keys()]);

  const rows: BackorderRow[] = [];
  for (const it of (items ?? []) as Array<{
    id: string;
    order_id: string;
    product_id: string | null;
    quantity_requested: number | null;
    quantity_allocated: number | null;
    product:
      | { name: string | null; internal_sku: string | null }
      | { name: string | null; internal_sku: string | null }[]
      | null;
  }>) {
    const requested = it.quantity_requested ?? 0;
    const allocated = it.quantity_allocated ?? 0;
    const backordered = Math.max(0, requested - allocated);
    if (backordered <= 0) continue;
    const order = orderById.get(it.order_id);
    if (!order) continue;
    const prod = Array.isArray(it.product) ? it.product[0] : it.product;
    rows.push({
      orderItemId: it.id,
      orderId: it.order_id,
      orderNumber: order.order_number,
      orderStatus: order.status,
      createdAt: order.created_at,
      warehouseId: order.warehouse_id,
      productId: it.product_id,
      productName: prod?.name ?? "Unknown product",
      sku: prod?.internal_sku ?? null,
      requested,
      allocated,
      backordered,
    });
  }

  // Oldest order first — backorders age into priority.
  rows.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return ta - tb;
  });
  return rows;
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

/** Allocate available stock to the oldest backordered orders for a product. */
export async function fillBackordersInternal(
  supabase: AllocClient,
  orgId: string,
  warehouseId: string,
  productId: string
): Promise<{ filledUnits: number; filledLines: number; orders: number }> {
  const avail = await getProductAvailability(
    supabase,
    orgId,
    warehouseId,
    productId
  );
  let pool = Math.max(0, avail.atp);
  if (pool <= 0) return { filledUnits: 0, filledLines: 0, orders: 0 };

  const bos = (await getBackorders(supabase, orgId, warehouseId)).filter(
    (b) => b.productId === productId
  );

  let filledUnits = 0;
  let filledLines = 0;
  const orderSet = new Set<string>();
  for (const b of bos) {
    if (pool <= 0) break;
    const take = Math.min(b.backordered, pool);
    if (take <= 0) continue;
    const { error } = await supabase
      .from("order_items")
      .update({ quantity_allocated: b.allocated + take })
      .eq("id", b.orderItemId);
    if (error) continue;
    pool -= take;
    filledUnits += take;
    filledLines++;
    orderSet.add(b.orderId);
  }
  return { filledUnits, filledLines, orders: orderSet.size };
}
