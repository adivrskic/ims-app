import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBomTree, type BomNode } from "@/lib/data/bom";

/**
 * Work order reads: list + detail with component availability.
 *
 * A work order assembles `quantity` units of a kit/finished good. Lines snapshot
 * the kit's direct BOM at creation. Availability is checked live against on-hand
 * at the work order's facility (no reservation).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "app", any>;

export const WORK_ORDER_STATUSES = [
  "draft",
  "released",
  "in_progress",
  "complete",
  "cancelled",
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const WO_OPEN_STATUSES: WorkOrderStatus[] = [
  "draft",
  "released",
  "in_progress",
];

export interface WorkOrderSummary {
  id: string;
  code: string;
  status: WorkOrderStatus;
  productId: string;
  productName: string;
  quantity: number;
  warehouseId: string | null;
  warehouseName: string | null;
  createdAt: string | null;
}

export async function getWorkOrders(
  supabase: Client,
  orgId: string,
  warehouseId: string | null
): Promise<WorkOrderSummary[]> {
  let q = supabase
    .from("work_orders")
    .select(
      "id, code, status, quantity, product_id, warehouse_id, created_at, product:products!work_orders_product_id_fkey ( name ), warehouse:warehouses ( name )"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  const { data } = await q;

  return ((data ?? []) as Array<Record<string, unknown>>).map((w) => {
    const product = oneOf(w.product) as { name: string | null } | null;
    const warehouse = oneOf(w.warehouse) as { name: string | null } | null;
    return {
      id: w.id as string,
      code: w.code as string,
      status: w.status as WorkOrderStatus,
      productId: w.product_id as string,
      productName: product?.name ?? "Unknown product",
      quantity: w.quantity as number,
      warehouseId: (w.warehouse_id as string | null) ?? null,
      warehouseName: warehouse?.name ?? null,
      createdAt: (w.created_at as string | null) ?? null,
    };
  });
}

export interface WorkOrderLine {
  id: string;
  componentProductId: string;
  componentName: string;
  sku: string | null;
  required: number;
  consumed: number;
  onHand: number;
  short: number;
}

export interface WorkOrderDetail {
  id: string;
  code: string;
  status: WorkOrderStatus;
  productId: string;
  productName: string;
  quantity: number;
  warehouseId: string | null;
  warehouseName: string | null;
  assignedTo: string | null;
  notes: string | null;
  createdAt: string | null;
  completedAt: string | null;
  lines: WorkOrderLine[];
  /** True when every line has enough on-hand to complete. */
  buildable: boolean;
  bom: BomNode | null;
}

export async function getWorkOrderDetail(
  supabase: Client,
  orgId: string,
  id: string
): Promise<WorkOrderDetail | null> {
  const { data: wo } = await supabase
    .from("work_orders")
    .select(
      "id, code, status, quantity, product_id, warehouse_id, assigned_to, notes, created_at, completed_at, org_id, product:products!work_orders_product_id_fkey ( name ), warehouse:warehouses ( name )"
    )
    .eq("id", id)
    .maybeSingle();
  if (!wo || (wo as { org_id: string }).org_id !== orgId) return null;
  const w = wo as Record<string, unknown>;
  const product = oneOf(w.product) as { name: string | null } | null;
  const warehouse = oneOf(w.warehouse) as { name: string | null } | null;
  const warehouseId = (w.warehouse_id as string | null) ?? null;

  const { data: lineRows } = await supabase
    .from("work_order_lines")
    .select(
      "id, component_product_id, quantity_required, quantity_consumed, product:products!work_order_lines_component_product_id_fkey ( name, internal_sku )"
    )
    .eq("work_order_id", id)
    .eq("org_id", orgId);

  const rows = (lineRows ?? []) as Array<Record<string, unknown>>;
  const componentIds = rows.map((r) => r.component_product_id as string);

  // On-hand per component at this facility.
  const onHandByProduct = new Map<string, number>();
  if (warehouseId && componentIds.length > 0) {
    const { data: locs } = await supabase
      .from("locations")
      .select("product_id, quantity")
      .eq("org_id", orgId)
      .eq("warehouse_id", warehouseId)
      .eq("is_active", true)
      .in("product_id", componentIds);
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
  }

  const lines: WorkOrderLine[] = rows.map((r) => {
    const comp = oneOf(r.product) as
      | { name: string | null; internal_sku: string | null }
      | null;
    const required = r.quantity_required as number;
    const onHand = onHandByProduct.get(r.component_product_id as string) ?? 0;
    return {
      id: r.id as string,
      componentProductId: r.component_product_id as string,
      componentName: comp?.name ?? "Unknown product",
      sku: comp?.internal_sku ?? null,
      required,
      consumed: (r.quantity_consumed as number) ?? 0,
      onHand,
      short: Math.max(0, required - onHand),
    };
  });

  const bom = await getBomTree(supabase, orgId, w.product_id as string);

  return {
    id: w.id as string,
    code: w.code as string,
    status: w.status as WorkOrderStatus,
    productId: w.product_id as string,
    productName: product?.name ?? "Unknown product",
    quantity: w.quantity as number,
    warehouseId,
    warehouseName: warehouse?.name ?? null,
    assignedTo: (w.assigned_to as string | null) ?? null,
    notes: (w.notes as string | null) ?? null,
    createdAt: (w.created_at as string | null) ?? null,
    completedAt: (w.completed_at as string | null) ?? null,
    lines,
    buildable: lines.length > 0 && lines.every((l) => l.short === 0),
    bom,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function oneOf(v: any): any {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}
