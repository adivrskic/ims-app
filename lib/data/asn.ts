import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Advance Ship Notice (ASN) reads. An ASN is an expected inbound shipment with
 * lines, optionally linked to a PO. Lines may carry an LPN (handling-unit/pallet
 * code) so a whole pallet can be received in one action.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "app", any>;

export const ASN_STATUSES = [
  "expected",
  "in_transit",
  "received",
  "cancelled",
] as const;
export type AsnStatus = (typeof ASN_STATUSES)[number];

export interface AsnSummary {
  id: string;
  asnNumber: string;
  reference: string | null;
  status: AsnStatus;
  supplierName: string | null;
  poNumber: string | null;
  expectedDate: string | null;
  lineCount: number;
  expectedUnits: number;
  receivedUnits: number;
}

export interface AsnLine {
  id: string;
  productId: string | null;
  productName: string;
  sku: string | null;
  lpn: string | null;
  lotNumber: string | null;
  quantityExpected: number;
  quantityReceived: number;
  poLineId: string | null;
}

export interface AsnDetail {
  id: string;
  asnNumber: string;
  reference: string | null;
  status: AsnStatus;
  supplierId: string | null;
  supplierName: string | null;
  poId: string | null;
  poNumber: string | null;
  warehouseId: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  expectedDate: string | null;
  notes: string | null;
  createdAt: string | null;
  receivedAt: string | null;
  lines: AsnLine[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function oneOf(v: any): any {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

export async function getAsns(
  supabase: Client,
  orgId: string,
  warehouseId: string | null
): Promise<AsnSummary[]> {
  let q = supabase
    .from("asns")
    .select(
      "id, asn_number, reference, status, expected_date, supplier:suppliers ( name ), po:purchase_orders ( po_number ), lines:asn_lines ( quantity_expected, quantity_received )"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  const { data } = await q;

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const supplier = oneOf(r.supplier) as { name: string | null } | null;
    const po = oneOf(r.po) as { po_number: string | null } | null;
    const lines = (r.lines ?? []) as Array<{
      quantity_expected: number | null;
      quantity_received: number | null;
    }>;
    return {
      id: r.id as string,
      asnNumber: r.asn_number as string,
      reference: (r.reference as string | null) ?? null,
      status: r.status as AsnStatus,
      supplierName: supplier?.name ?? null,
      poNumber: po?.po_number ?? null,
      expectedDate: (r.expected_date as string | null) ?? null,
      lineCount: lines.length,
      expectedUnits: lines.reduce((s, l) => s + (l.quantity_expected ?? 0), 0),
      receivedUnits: lines.reduce((s, l) => s + (l.quantity_received ?? 0), 0),
    };
  });
}

export async function getAsnDetail(
  supabase: Client,
  orgId: string,
  id: string
): Promise<AsnDetail | null> {
  const { data: asn } = await supabase
    .from("asns")
    .select(
      "id, asn_number, reference, status, supplier_id, po_id, warehouse_id, carrier, tracking_number, expected_date, notes, created_at, received_at, org_id, supplier:suppliers ( name ), po:purchase_orders ( po_number )"
    )
    .eq("id", id)
    .maybeSingle();
  if (!asn || (asn as { org_id: string }).org_id !== orgId) return null;
  const a = asn as Record<string, unknown>;
  const supplier = oneOf(a.supplier) as { name: string | null } | null;
  const po = oneOf(a.po) as { po_number: string | null } | null;

  const { data: lineRows } = await supabase
    .from("asn_lines")
    .select(
      "id, product_id, product_name, lpn, lot_number, quantity_expected, quantity_received, po_line_id, product:products ( name, internal_sku )"
    )
    .eq("asn_id", id)
    .eq("org_id", orgId);

  const lines: AsnLine[] = ((lineRows ?? []) as Array<Record<string, unknown>>).map(
    (l) => {
      const prod = oneOf(l.product) as
        | { name: string | null; internal_sku: string | null }
        | null;
      return {
        id: l.id as string,
        productId: (l.product_id as string | null) ?? null,
        productName:
          prod?.name ?? (l.product_name as string | null) ?? "Unknown product",
        sku: prod?.internal_sku ?? null,
        lpn: (l.lpn as string | null) ?? null,
        lotNumber: (l.lot_number as string | null) ?? null,
        quantityExpected: (l.quantity_expected as number) ?? 0,
        quantityReceived: (l.quantity_received as number) ?? 0,
        poLineId: (l.po_line_id as string | null) ?? null,
      };
    }
  );

  return {
    id: a.id as string,
    asnNumber: a.asn_number as string,
    reference: (a.reference as string | null) ?? null,
    status: a.status as AsnStatus,
    supplierId: (a.supplier_id as string | null) ?? null,
    supplierName: supplier?.name ?? null,
    poId: (a.po_id as string | null) ?? null,
    poNumber: po?.po_number ?? null,
    warehouseId: (a.warehouse_id as string | null) ?? null,
    carrier: (a.carrier as string | null) ?? null,
    trackingNumber: (a.tracking_number as string | null) ?? null,
    expectedDate: (a.expected_date as string | null) ?? null,
    notes: (a.notes as string | null) ?? null,
    createdAt: (a.created_at as string | null) ?? null,
    receivedAt: (a.received_at as string | null) ?? null,
    lines,
  };
}
