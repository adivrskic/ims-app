import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Inbound QC (quarantine) reads.
 *
 * Received PO lines can be held for inspection (`po_line_items.qc_status`).
 * po_line_items has no org/warehouse columns, so we scope by joining through
 * purchase_orders (org_id + warehouse_id live there).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "app", any>;

export type QcStatus = "none" | "hold" | "passed" | "failed";

export interface QcLine {
  lineId: string;
  poId: string;
  poNumber: string | null;
  supplierName: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  productId: string | null;
  productName: string;
  barcode: string | null;
  quantityReceived: number;
  lotNumber: string | null;
  receivedAt: string | null;
  qcStatus: QcStatus;
  qcNotes: string | null;
  qcAt: string | null;
}

interface QueueResult {
  hold: QcLine[];
  recentFailed: QcLine[];
}

const LINE_SELECT =
  "id, po_id, product_id, product_name, barcode, quantity_received, lot_number, received_at, qc_status, qc_notes, qc_at, po:purchase_orders!inner ( id, po_number, supplier_name, warehouse_id, org_id, warehouse:warehouses ( name ) )";

function mapLine(r: Record<string, unknown>): QcLine {
  const po = (Array.isArray(r.po) ? r.po[0] : r.po) as
    | {
        id: string;
        po_number: string | null;
        supplier_name: string | null;
        warehouse_id: string | null;
        warehouse: { name: string | null } | { name: string | null }[] | null;
      }
    | null;
  const wh = po
    ? Array.isArray(po.warehouse)
      ? po.warehouse[0]
      : po.warehouse
    : null;
  return {
    lineId: r.id as string,
    poId: po?.id ?? (r.po_id as string),
    poNumber: po?.po_number ?? null,
    supplierName: po?.supplier_name ?? null,
    warehouseId: po?.warehouse_id ?? null,
    warehouseName: wh?.name ?? null,
    productId: (r.product_id as string | null) ?? null,
    productName: (r.product_name as string | null) ?? "Unknown product",
    barcode: (r.barcode as string | null) ?? null,
    quantityReceived: (r.quantity_received as number | null) ?? 0,
    lotNumber: (r.lot_number as string | null) ?? null,
    receivedAt: (r.received_at as string | null) ?? null,
    qcStatus: (r.qc_status as QcStatus) ?? "none",
    qcNotes: (r.qc_notes as string | null) ?? null,
    qcAt: (r.qc_at as string | null) ?? null,
  };
}

/** Lines on QC hold (+ a short tail of recent failures), scope-aware. */
export async function getQcQueue(
  supabase: Client,
  orgId: string,
  warehouseId: string | null
): Promise<QueueResult> {
  const base = () => {
    let q = supabase.from("po_line_items").select(LINE_SELECT).eq("po.org_id", orgId);
    if (warehouseId) q = q.eq("po.warehouse_id", warehouseId);
    return q;
  };

  const [{ data: hold }, { data: failed }] = await Promise.all([
    base().eq("qc_status", "hold").order("received_at", { ascending: true }),
    base()
      .eq("qc_status", "failed")
      .order("qc_at", { ascending: false })
      .limit(20),
  ]);

  return {
    hold: ((hold ?? []) as Array<Record<string, unknown>>).map(mapLine),
    recentFailed: ((failed ?? []) as Array<Record<string, unknown>>).map(mapLine),
  };
}

/** Count of lines currently on QC hold (for nav badges / KPIs). */
export async function getQcHoldCount(
  supabase: Client,
  orgId: string,
  warehouseId: string | null
): Promise<number> {
  let q = supabase
    .from("po_line_items")
    .select("id, po:purchase_orders!inner ( org_id, warehouse_id )", {
      count: "exact",
      head: true,
    })
    .eq("qc_status", "hold")
    .eq("po.org_id", orgId);
  if (warehouseId) q = q.eq("po.warehouse_id", warehouseId);
  const { count } = await q;
  return count ?? 0;
}
