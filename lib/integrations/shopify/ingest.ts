import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ShopifyOrder, ShopifyConfig } from "./types";

/**
 * Translate a Shopify order into a Nautilus order + order_items.
 *
 * Schema alignment notes:
 *   - The Nautilus orders table is shared with installer/pickup workflows
 *     so Shopify orders use order_type='customer_pickup' (closest semantic
 *     match — they're customer-bound orders that need picking/fulfillment).
 *   - quantity_requested is the canonical "how many ordered" field; the
 *     pick UI fills in quantity_picked as the warehouse team works.
 *   - unit_price + line_total are new columns added for e-commerce orders.
 *     Manual orders may leave them null.
 *
 * Idempotency: (source, external_id) unique index — same Shopify ID
 * upserts in place. Safe to retry.
 *
 * SKU matching:
 *   1. Match Nautilus product by barcode (Shopify SKU is often a UPC)
 *   2. Match by internal_sku
 *   3. Auto-create a stub product, flag the line `needs_mapping=true`
 *
 * Facility routing: every Shopify order routes to the integration's
 * configured default_facility_id (single-facility for v1).
 */

interface IngestResult {
  ok: boolean;
  orderId?: string;
  created: boolean;
  needsMappingCount: number;
  error?: string;
}

function mapStatus(o: ShopifyOrder): string {
  if (o.cancelled_at) return "cancelled";
  if (o.fulfillment_status === "fulfilled") return "complete";
  return "created";
}

export async function ingestShopifyOrder(
  orgId: string,
  config: ShopifyConfig,
  shopifyOrder: ShopifyOrder
): Promise<IngestResult> {
  const admin = createAdminClient();

  // ── 1. Upsert the order itself ────────────────────────────────────
  const externalId = String(shopifyOrder.id);
  const customerName = shopifyOrder.customer
    ? `${shopifyOrder.customer.first_name ?? ""} ${
        shopifyOrder.customer.last_name ?? ""
      }`.trim()
    : null;

  const orderRow = {
    org_id: orgId,
    warehouse_id: config.default_facility_id,
    source: "shopify",
    external_id: externalId,
    external_synced_at: new Date().toISOString(),
    external_raw: shopifyOrder as unknown as Record<string, unknown>,
    order_number: shopifyOrder.name, // e.g. "#1001"
    order_type: "customer_pickup", // closest match for Shopify orders
    customer_name: customerName || null,
    customer_email: shopifyOrder.email || shopifyOrder.customer?.email || null,
    customer_phone: shopifyOrder.phone || null,
    status: mapStatus(shopifyOrder),
    total: parseFloat(shopifyOrder.total_price),
    currency: shopifyOrder.currency,
    placed_at: shopifyOrder.created_at,
    cancelled_at: shopifyOrder.cancelled_at,
    notes: shopifyOrder.note ?? null,
  };

  const { data: upsertedOrder, error: orderErr } = await admin
    .from("orders")
    .upsert(orderRow, { onConflict: "source,external_id" })
    .select("id")
    .single();

  if (orderErr || !upsertedOrder) {
    return {
      ok: false,
      created: false,
      needsMappingCount: 0,
      error: `Order upsert failed: ${orderErr?.message}`,
    };
  }

  const orderId = upsertedOrder.id as string;

  // Detect first-ingest vs. update for the return value
  const { data: existingLines } = await admin
    .from("order_items")
    .select("id")
    .eq("order_id", orderId)
    .limit(1);
  const created = !existingLines || existingLines.length === 0;

  // ── 2. Wipe + rebuild line items ──────────────────────────────────
  // Shopify orders rarely mutate line items post-creation; when they
  // do, the whole order updates wholesale. Simpler to wipe-and-rebuild
  // than to reconcile.
  await admin.from("order_items").delete().eq("order_id", orderId);

  let needsMappingCount = 0;
  const lineRows: Array<Record<string, unknown>> = [];

  for (const line of shopifyOrder.line_items) {
    const matched = await matchOrCreateProduct(
      orgId,
      line.sku,
      line.title,
      line.vendor
    );

    if (matched.needsMapping) needsMappingCount++;

    const unitPrice = parseFloat(line.price);

    lineRows.push({
      order_id: orderId,
      product_id: matched.productId,
      external_id: String(line.id),
      external_sku: line.sku,
      quantity_requested: line.quantity,
      quantity_picked: 0,
      unit_price: unitPrice,
      line_total: unitPrice * line.quantity,
      needs_mapping: matched.needsMapping,
      notes: line.variant_title,
    });
  }

  if (lineRows.length > 0) {
    const { error: linesErr } = await admin
      .from("order_items")
      .insert(lineRows);
    if (linesErr) {
      return {
        ok: false,
        created,
        needsMappingCount,
        error: `Line items insert failed: ${linesErr.message}`,
      };
    }
  }

  return { ok: true, orderId, created, needsMappingCount };
}

/**
 * Match a Shopify line item to a Nautilus product, auto-creating a stub
 * if no match exists.
 *
 * Lookup precedence:
 *   1. Match by barcode (Shopify SKU is commonly a UPC/barcode)
 *   2. Match by internal_sku
 *   3. Auto-create stub product with needs_mapping=true
 */
async function matchOrCreateProduct(
  orgId: string,
  sku: string | null,
  title: string,
  vendor: string | null
): Promise<{ productId: string; needsMapping: boolean }> {
  const admin = createAdminClient();

  // 1. Barcode
  if (sku) {
    const { data: byBarcode } = await admin
      .from("products")
      .select("id")
      .eq("org_id", orgId)
      .eq("barcode", sku)
      .maybeSingle();
    if (byBarcode) return { productId: byBarcode.id, needsMapping: false };
  }

  // 2. Internal SKU
  if (sku) {
    const { data: bySku } = await admin
      .from("products")
      .select("id")
      .eq("org_id", orgId)
      .eq("internal_sku", sku)
      .maybeSingle();
    if (bySku) return { productId: bySku.id, needsMapping: false };
  }

  // 3. Auto-create stub
  const { data: stub, error } = await admin
    .from("products")
    .insert({
      org_id: orgId,
      name: title.slice(0, 200),
      barcode: sku || `shopify-stub-${Date.now()}`,
      internal_sku: sku,
      manufacturer: vendor,
      reorder_point: 0,
      notes: "Auto-created from Shopify — review and map to real catalog entry",
    })
    .select("id")
    .single();

  if (error || !stub) {
    throw new Error(`Failed to create stub product: ${error?.message}`);
  }

  return { productId: stub.id, needsMapping: true };
}

/** Mark an order cancelled in response to orders/cancelled webhook. */
export async function cancelShopifyOrder(
  orgId: string,
  shopifyOrderId: number | string
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      external_synced_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("source", "shopify")
    .eq("external_id", String(shopifyOrderId));

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
