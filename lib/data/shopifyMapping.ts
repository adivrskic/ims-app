import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllPaged } from "@/lib/data/paginate";

/**
 * Shopify stub-product reconciliation.
 *
 * When an ingested Shopify order line has a SKU that doesn't match the catalog,
 * `matchOrCreateProduct` auto-creates a placeholder ("stub") product and flags
 * the order line `needs_mapping = true`. This module surfaces those flagged
 * lines, grouped by stub product, so an operator can either map them to a real
 * catalog product or confirm the stub as a new product.
 */

export interface UnmappedStub {
  stubProductId: string;
  stubName: string;
  stubBarcode: string | null;
  externalSku: string | null;
  lineCount: number;
  orderCount: number;
  totalQty: number;
  sampleOrders: string[];
}

export interface MappingCandidate {
  id: string;
  name: string;
  internal_sku: string | null;
  barcode: string | null;
}

export interface ShopifyMappingData {
  stubs: UnmappedStub[];
  candidates: MappingCandidate[];
}

type LineRow = {
  product_id: string | null;
  external_sku: string | null;
  quantity_requested: number | null;
  order: { order_number: string | null } | { order_number: string | null }[] | null;
  product:
    | { id: string; name: string | null; barcode: string | null }
    | { id: string; name: string | null; barcode: string | null }[]
    | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export async function getShopifyMappingData(
  orgId: string
): Promise<ShopifyMappingData> {
  const admin = createAdminClient();

  // Unmapped order lines for THIS org (order_items has no org_id — scope through
  // the parent order with an inner join). Paginated so a big backlog isn't cut off.
  const lines = await fetchAllPaged<LineRow>((from, to) =>
    admin
      .from("order_items")
      .select(
        "product_id, external_sku, quantity_requested, order:orders!inner ( order_number, org_id ), product:products ( id, name, barcode )"
      )
      .eq("needs_mapping", true)
      .eq("order.org_id", orgId)
      .order("id", { ascending: true })
      .range(from, to)
  );

  // Group by stub product.
  const byStub = new Map<
    string,
    {
      name: string;
      barcode: string | null;
      sku: string | null;
      qty: number;
      lines: number;
      orders: Set<string>;
    }
  >();
  for (const l of lines) {
    if (!l.product_id) continue;
    const prod = one(l.product);
    const ord = one(l.order);
    const cur =
      byStub.get(l.product_id) ??
      {
        name: prod?.name ?? "Unknown product",
        barcode: prod?.barcode ?? null,
        sku: l.external_sku ?? null,
        qty: 0,
        lines: 0,
        orders: new Set<string>(),
      };
    cur.qty += l.quantity_requested ?? 0;
    cur.lines += 1;
    if (ord?.order_number) cur.orders.add(ord.order_number);
    if (!cur.sku && l.external_sku) cur.sku = l.external_sku;
    byStub.set(l.product_id, cur);
  }

  const stubs: UnmappedStub[] = [...byStub.entries()]
    .map(([stubProductId, v]) => ({
      stubProductId,
      stubName: v.name,
      stubBarcode: v.barcode,
      externalSku: v.sku,
      lineCount: v.lines,
      orderCount: v.orders.size,
      totalQty: v.qty,
      sampleOrders: [...v.orders].slice(0, 5),
    }))
    .sort((a, b) => b.lineCount - a.lineCount);

  // Candidate real products to map onto — exclude placeholder stubs so the
  // picker only offers genuine catalog entries.
  const candidates =
    stubs.length === 0
      ? []
      : await fetchAllPaged<MappingCandidate>((from, to) =>
          admin
            .from("products")
            .select("id, name, internal_sku, barcode")
            .eq("org_id", orgId)
            .not("barcode", "like", "shopify-stub-%")
            .order("name", { ascending: true })
            .range(from, to)
        );

  return { stubs, candidates };
}

export async function getUnmappedCount(orgId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("order_items")
    .select("product_id, order:orders!inner ( org_id )", {
      count: "exact",
      head: true,
    })
    .eq("needs_mapping", true)
    .eq("order.org_id", orgId);
  return count ?? 0;
}
