import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OPEN_ORDER_STATUSES } from "@/lib/data/allocation";

/**
 * Wave / zone picking (planning + sequencing layer).
 *
 * A wave batches multiple orders into one optimized picking trip. The desk
 * builds and sequences the wave; the mobile app still performs the physical
 * scan-pick. We DON'T write order_items.location_id — the pick path is computed
 * for sequencing only (mobile/FEFO owns the physical pick-from slot).
 *
 * Pick path reuses the slotting spatial model: each pick task is placed in a
 * zone (sections.pick_zone, falling back to the section code) and sorted by the
 * section's centroid distance to the nearest dock door / staging element.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "app", any>;

export const WAVE_STATUSES = [
  "planned",
  "released",
  "complete",
  "cancelled",
] as const;
export type WaveStatus = (typeof WAVE_STATUSES)[number];

// ── Section zones + travel distance ────────────────────────────────────────

interface SectionZone {
  sectionId: string;
  code: string;
  zone: string;
  /** Centroid distance to the nearest door/staging origin (0 if none). */
  distance: number;
}

function centroid(r: {
  floor_x: number | string;
  floor_y: number | string;
  floor_width: number | string;
  floor_height: number | string;
}) {
  return {
    x: Number(r.floor_x) + Number(r.floor_width) / 2,
    y: Number(r.floor_y) + Number(r.floor_height) / 2,
  };
}

/** sectionId → { code, zone, distance-to-dock } for one facility. */
export async function getSectionZones(
  supabase: Client,
  orgId: string,
  warehouseId: string
): Promise<Map<string, SectionZone>> {
  const [{ data: sections }, { data: elements }] = await Promise.all([
    supabase
      .from("sections")
      .select(
        "id, code, pick_zone, floor_x, floor_y, floor_width, floor_height"
      )
      .eq("org_id", orgId)
      .eq("warehouse_id", warehouseId),
    supabase
      .from("layout_elements")
      .select("floor_x, floor_y, floor_width, floor_height")
      .eq("org_id", orgId)
      .eq("warehouse_id", warehouseId)
      .in("kind", ["door", "staging"]),
  ]);

  const origins = ((elements ?? []) as Array<Record<string, number | string>>).map(
    (e) =>
      centroid({
        floor_x: e.floor_x,
        floor_y: e.floor_y,
        floor_width: e.floor_width,
        floor_height: e.floor_height,
      })
  );

  const out = new Map<string, SectionZone>();
  for (const s of (sections ?? []) as Array<{
    id: string;
    code: string | null;
    pick_zone: string | null;
    floor_x: number | string;
    floor_y: number | string;
    floor_width: number | string;
    floor_height: number | string;
  }>) {
    const c = centroid(s);
    const distance = origins.length
      ? Math.min(...origins.map((o) => Math.hypot(c.x - o.x, c.y - o.y)))
      : 0;
    const code = s.code ?? "";
    out.set(s.id, {
      sectionId: s.id,
      code,
      zone: s.pick_zone?.trim() || code || "Unzoned",
      distance,
    });
  }
  return out;
}

// ── Eligible orders (for building a wave) ──────────────────────────────────

export interface EligibleOrder {
  id: string;
  orderNumber: string | null;
  orderType: string;
  status: string;
  customerName: string | null;
  deliveryDate: string | null;
  lineCount: number;
  unitsToPick: number;
}

/**
 * Open orders in a facility that aren't in a wave yet and have something to
 * pick (allocated beyond what's already picked).
 */
export async function getEligibleOrders(
  supabase: Client,
  orgId: string,
  warehouseId: string
): Promise<EligibleOrder[]> {
  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, order_number, order_type, status, customer_name, delivery_date"
    )
    .eq("org_id", orgId)
    .eq("warehouse_id", warehouseId)
    .is("pick_wave_id", null)
    .in("status", OPEN_ORDER_STATUSES as unknown as string[])
    .order("created_at", { ascending: true });

  const orderList = (orders ?? []) as Array<{
    id: string;
    order_number: string | null;
    order_type: string;
    status: string;
    customer_name: string | null;
    delivery_date: string | null;
  }>;
  if (orderList.length === 0) return [];

  const { data: items } = await supabase
    .from("order_items")
    .select("order_id, quantity_allocated, quantity_picked")
    .in(
      "order_id",
      orderList.map((o) => o.id)
    );

  const agg = new Map<string, { lines: number; units: number }>();
  for (const it of (items ?? []) as Array<{
    order_id: string;
    quantity_allocated: number | null;
    quantity_picked: number | null;
  }>) {
    const toPick = Math.max(
      0,
      (it.quantity_allocated ?? 0) - (it.quantity_picked ?? 0)
    );
    if (toPick <= 0) continue;
    const cur = agg.get(it.order_id) ?? { lines: 0, units: 0 };
    cur.lines += 1;
    cur.units += toPick;
    agg.set(it.order_id, cur);
  }

  return orderList
    .map((o) => {
      const a = agg.get(o.id);
      return {
        id: o.id,
        orderNumber: o.order_number,
        orderType: o.order_type,
        status: o.status,
        customerName: o.customer_name,
        deliveryDate: o.delivery_date,
        lineCount: a?.lines ?? 0,
        unitsToPick: a?.units ?? 0,
      };
    })
    .filter((o) => o.unitsToPick > 0);
}

// ── Wave list ──────────────────────────────────────────────────────────────

export interface WaveSummary {
  id: string;
  code: string;
  status: WaveStatus;
  warehouseId: string | null;
  createdAt: string | null;
  orderCount: number;
}

export async function getWaves(
  supabase: Client,
  orgId: string,
  warehouseId: string | null
): Promise<WaveSummary[]> {
  let q = supabase
    .from("pick_waves")
    .select("id, code, status, warehouse_id, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  const { data: waves } = await q;

  const waveList = (waves ?? []) as Array<{
    id: string;
    code: string;
    status: WaveStatus;
    warehouse_id: string | null;
    created_at: string | null;
  }>;
  if (waveList.length === 0) return [];

  const { data: orders } = await supabase
    .from("orders")
    .select("pick_wave_id")
    .in(
      "pick_wave_id",
      waveList.map((w) => w.id)
    );
  const counts = new Map<string, number>();
  for (const o of (orders ?? []) as Array<{ pick_wave_id: string | null }>) {
    if (!o.pick_wave_id) continue;
    counts.set(o.pick_wave_id, (counts.get(o.pick_wave_id) ?? 0) + 1);
  }

  return waveList.map((w) => ({
    id: w.id,
    code: w.code,
    status: w.status,
    warehouseId: w.warehouse_id,
    createdAt: w.created_at,
    orderCount: counts.get(w.id) ?? 0,
  }));
}

// ── Wave detail + zoned pick list ──────────────────────────────────────────

export interface PickTask {
  orderItemId: string;
  orderId: string;
  orderNumber: string | null;
  productId: string;
  productName: string;
  sku: string | null;
  quantity: number;
  slotLabel: string;
  sectionCode: string;
  bay: number | null;
  level: number | null;
  distance: number;
}

export interface PickZoneGroup {
  zone: string;
  distance: number;
  tasks: PickTask[];
  units: number;
}

export interface WaveDetail {
  id: string;
  code: string;
  status: WaveStatus;
  warehouseId: string | null;
  assignedTo: string | null;
  notes: string | null;
  createdAt: string | null;
  orders: Array<{
    id: string;
    orderNumber: string | null;
    customerName: string | null;
    status: string;
  }>;
  zones: PickZoneGroup[];
  totalUnits: number;
  totalTasks: number;
  unlocatedTasks: number;
}

export async function getWaveDetail(
  supabase: Client,
  orgId: string,
  waveId: string
): Promise<WaveDetail | null> {
  const { data: wave } = await supabase
    .from("pick_waves")
    .select("id, code, status, warehouse_id, assigned_to, notes, created_at, org_id")
    .eq("id", waveId)
    .maybeSingle();
  if (!wave || (wave as { org_id: string }).org_id !== orgId) return null;
  const w = wave as {
    id: string;
    code: string;
    status: WaveStatus;
    warehouse_id: string | null;
    assigned_to: string | null;
    notes: string | null;
    created_at: string | null;
  };

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, status")
    .eq("pick_wave_id", waveId)
    .eq("org_id", orgId);
  const orderList = (orders ?? []) as Array<{
    id: string;
    order_number: string | null;
    customer_name: string | null;
    status: string;
  }>;

  const base: WaveDetail = {
    id: w.id,
    code: w.code,
    status: w.status,
    warehouseId: w.warehouse_id,
    assignedTo: w.assigned_to,
    notes: w.notes,
    createdAt: w.created_at,
    orders: orderList.map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      customerName: o.customer_name,
      status: o.status,
    })),
    zones: [],
    totalUnits: 0,
    totalTasks: 0,
    unlocatedTasks: 0,
  };
  if (orderList.length === 0 || !w.warehouse_id) return base;

  // Line items needing a pick.
  const orderNumberById = new Map(
    orderList.map((o) => [o.id, o.order_number])
  );
  const { data: items } = await supabase
    .from("order_items")
    .select(
      "id, order_id, product_id, quantity_allocated, quantity_picked, product:products ( name, internal_sku )"
    )
    .in(
      "order_id",
      orderList.map((o) => o.id)
    );

  type Item = {
    id: string;
    order_id: string;
    product_id: string | null;
    quantity_allocated: number | null;
    quantity_picked: number | null;
    product:
      | { name: string | null; internal_sku: string | null }
      | { name: string | null; internal_sku: string | null }[]
      | null;
  };
  const lines = ((items ?? []) as Item[]).filter(
    (it) =>
      it.product_id &&
      Math.max(0, (it.quantity_allocated ?? 0) - (it.quantity_picked ?? 0)) > 0
  );
  if (lines.length === 0) return base;

  const [zones, locByProduct] = await Promise.all([
    getSectionZones(supabase, orgId, w.warehouse_id),
    loadPickSlots(
      supabase,
      orgId,
      w.warehouse_id,
      [...new Set(lines.map((l) => l.product_id as string))]
    ),
  ]);

  // Build a task per line, placed at the product's chosen pick slot.
  const tasks: PickTask[] = [];
  for (const it of lines) {
    const product = Array.isArray(it.product) ? it.product[0] : it.product;
    const qty = Math.max(
      0,
      (it.quantity_allocated ?? 0) - (it.quantity_picked ?? 0)
    );
    const slot = pickBestSlot(locByProduct.get(it.product_id as string), zones);
    tasks.push({
      orderItemId: it.id,
      orderId: it.order_id,
      orderNumber: orderNumberById.get(it.order_id) ?? null,
      productId: it.product_id as string,
      productName: product?.name ?? "Unknown product",
      sku: product?.internal_sku ?? null,
      quantity: qty,
      slotLabel: slot?.label ?? "Unlocated",
      sectionCode: slot?.sectionCode ?? "",
      bay: slot?.bay ?? null,
      level: slot?.level ?? null,
      distance: slot?.distance ?? Number.POSITIVE_INFINITY,
    });
  }

  // Group into zones, sorted by zone proximity then walk order within.
  const zoneOf = (t: PickTask): { zone: string; distance: number } => {
    if (!t.sectionCode) return { zone: "Unlocated", distance: Infinity };
    const z = [...zones.values()].find((s) => s.code === t.sectionCode);
    return { zone: z?.zone ?? t.sectionCode, distance: t.distance };
  };

  const byZone = new Map<string, PickZoneGroup>();
  for (const t of tasks) {
    const { zone } = zoneOf(t);
    const g =
      byZone.get(zone) ?? { zone, distance: Infinity, tasks: [], units: 0 };
    g.tasks.push(t);
    g.units += t.quantity;
    g.distance = Math.min(g.distance, t.distance);
    byZone.set(zone, g);
  }

  const zoneGroups = [...byZone.values()];
  for (const g of zoneGroups) {
    g.tasks.sort(
      (a, b) =>
        a.distance - b.distance ||
        a.sectionCode.localeCompare(b.sectionCode) ||
        (a.bay ?? 0) - (b.bay ?? 0) ||
        (a.level ?? 0) - (b.level ?? 0)
    );
  }
  zoneGroups.sort((a, b) => a.distance - b.distance);

  return {
    ...base,
    zones: zoneGroups,
    totalUnits: tasks.reduce((s, t) => s + t.quantity, 0),
    totalTasks: tasks.length,
    unlocatedTasks: tasks.filter((t) => !t.sectionCode).length,
  };
}

// ── Slot selection helpers ─────────────────────────────────────────────────

interface SlotRow {
  sectionId: string;
  bay: number | null;
  level: number | null;
  quantity: number;
}

async function loadPickSlots(
  supabase: Client,
  orgId: string,
  warehouseId: string,
  productIds: string[]
): Promise<Map<string, SlotRow[]>> {
  const out = new Map<string, SlotRow[]>();
  if (productIds.length === 0) return out;
  const { data } = await supabase
    .from("locations")
    .select("product_id, section_id, bay, level, quantity")
    .eq("org_id", orgId)
    .eq("warehouse_id", warehouseId)
    .eq("is_active", true)
    .eq("quarantined", false) // never pick from QC quarantine
    .in("product_id", productIds);

  for (const l of (data ?? []) as Array<{
    product_id: string | null;
    section_id: string | null;
    bay: number | null;
    level: number | null;
    quantity: number | null;
  }>) {
    if (!l.product_id || !l.section_id) continue;
    if ((l.quantity ?? 0) <= 0) continue;
    const arr = out.get(l.product_id) ?? [];
    arr.push({
      sectionId: l.section_id,
      bay: l.bay,
      level: l.level,
      quantity: l.quantity ?? 0,
    });
    out.set(l.product_id, arr);
  }
  return out;
}

interface ChosenSlot {
  label: string;
  sectionCode: string;
  bay: number | null;
  level: number | null;
  distance: number;
}

/** Choose the pick slot: nearest section to the dock, tie-break most stock. */
function pickBestSlot(
  slots: SlotRow[] | undefined,
  zones: Map<string, SectionZone>
): ChosenSlot | null {
  if (!slots || slots.length === 0) return null;
  let best: { slot: SlotRow; zone: SectionZone } | null = null;
  for (const slot of slots) {
    const zone = zones.get(slot.sectionId);
    if (!zone) continue;
    if (
      !best ||
      zone.distance < best.zone.distance ||
      (zone.distance === best.zone.distance && slot.quantity > best.slot.quantity)
    ) {
      best = { slot, zone };
    }
  }
  if (!best) return null;
  return {
    label: `${best.zone.code}-${String(best.slot.bay ?? 0).padStart(2, "0")}-${
      best.slot.level ?? 0
    }`,
    sectionCode: best.zone.code,
    bay: best.slot.bay,
    level: best.slot.level,
    distance: best.zone.distance,
  };
}
