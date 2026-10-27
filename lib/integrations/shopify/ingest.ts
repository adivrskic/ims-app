import "server-only";
import { randomUUID } from "crypto";
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
 * Idempotency: the existing order is looked up by (org_id, source,
 * external_id) and updated in place; a miss inserts. The lookup is explicit
 * rather than an upsert because the live unique index is on
 * (source, external_id) WITHOUT org_id — an upsert on that index could match
 * another workspace's order carrying the same Shopify id. The
 * 20261026120000_rls_hardening migration recreates the index with org_id.
 *
 * Re-ingest (orders/updated, redeliveries) is NON-DESTRUCTIVE:
 *   - header fields are refreshed, but `status` never moves backwards — the
 *     warehouse owns pick/pack progress; Shopify only gets to say "cancelled";
 *   - existing lines (matched by Shopify line id) get their quantity_requested
 *     / pricing refreshed; quantity_picked and quantity_allocated are left
 *     alone, so a redelivery mid-pick can't zero out picked stock;
 *   - new lines are inserted with quantity_picked 0.
 *   Lines Shopify removed from the order are left in place (a removed line
 *   that was already picked needs a human decision, not a silent delete).
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

/** Shopify money strings → number; anything unparsable counts as 0. */
function money(raw: string | null | undefined): number {
  const n = parseFloat(raw ?? "");
  return Number.isFinite(n) ? n : 0;
}

/**
 * Status to store on re-ingest. Cancellation from Shopify always wins; any
 * other payload keeps whatever the warehouse has moved the order to.
 */
function resolveStatus(existing: string, incoming: string): string {
  if (incoming === "cancelled") return "cancelled";
  return existing;
}

export async function ingestShopifyOrder(
  orgId: string,
  config: ShopifyConfig,
  shopifyOrder: ShopifyOrder
): Promise<IngestResult> {
  const admin = createAdminClient();

  // ── 1. Insert or update the order header ───────────────────────────
  const externalId = String(shopifyOrder.id);
  const customerName = shopifyOrder.customer
    ? `${shopifyOrder.customer.first_name ?? ""} ${
        shopifyOrder.customer.last_name ?? ""
      }`.trim()
    : null;
  const incomingStatus = mapStatus(shopifyOrder);

  const headerFields = {
    warehouse_id: config.default_facility_id,
    external_synced_at: new Date().toISOString(),
    external_raw: shopifyOrder as unknown as Record<string, unknown>,
    order_number: shopifyOrder.name, // e.g. "#1001"
    order_type: "customer_pickup", // closest match for Shopify orders
    customer_name: customerName || null,
    customer_email: shopifyOrder.email || shopifyOrder.customer?.email || null,
    customer_phone: shopifyOrder.phone || null,
    total: money(shopifyOrder.total_price),
    currency: shopifyOrder.currency,
    placed_at: shopifyOrder.created_at,
    cancelled_at: shopifyOrder.cancelled_at,
    notes: shopifyOrder.note ?? null,
  };

  const { data: existing, error: lookupErr } = await admin
    .from("orders")
    .select("id, status")
    .eq("org_id", orgId)
    .eq("source", "shopify")
    .eq("external_id", externalId)
    .maybeSingle();
  if (lookupErr) {
    return {
      ok: false,
      created: false,
      needsMappingCount: 0,
      error: `Order lookup failed: ${lookupErr.message}`,
    };
  }

  let orderId: string;
  let created: boolean;

  if (existing) {
    orderId = existing.id as string;
    created = false;
    const { error: updateErr } = await admin
      .from("orders")
      .update({
        ...headerFields,
        status: resolveStatus(existing.status as string, incomingStatus),
      })
      .eq("id", orderId)
      .eq("org_id", orgId);
    if (updateErr) {
      return {
        ok: false,
        created,
        needsMappingCount: 0,
        error: `Order update failed: ${updateErr.message}`,
      };
    }
  } else {
    const { data: inserted, error: insertErr } = await admin
      .from("orders")
      .insert({
        org_id: orgId,
        source: "shopify",
        external_id: externalId,
        status: incomingStatus,
        ...headerFields,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      return {
        ok: false,
        created: false,
        needsMappingCount: 0,
        error: `Order insert failed: ${insertErr?.message}`,
      };
    }
    orderId = inserted.id as string;
    created = true;
  }

  // ── 2. Reconcile line items (never wipe) ───────────────────────────
  const { data: existingLineRows, error: linesReadErr } = await admin
    .from("order_items")
    .select("id, external_id")
    .eq("order_id", orderId);
  if (linesReadErr) {
    return {
      ok: false,
      created,
      needsMappingCount: 0,
      error: `Line items read failed: ${linesReadErr.message}`,
    };
  }
  const existingByExternalId = new Map<string, string>();
  for (const row of (existingLineRows ?? []) as Array<{
    id: string;
    external_id: string | null;
  }>) {
    if (row.external_id) existingByExternalId.set(row.external_id, row.id);
  }

  let needsMappingCount = 0;
  const newLineRows: Array<Record<string, unknown>> = [];

  for (const line of shopifyOrder.line_items) {
    const lineExternalId = String(line.id);
    const unitPrice = money(line.price);
    const quantity =
      Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 0;

    const existingLineId = existingByExternalId.get(lineExternalId);
    if (existingLineId) {
      // Refresh what Shopify owns. product_id stays as-is (the desk may have
      // re-mapped a stub), and the picked/allocated counters are untouched.
      const { error: lineUpdErr } = await admin
        .from("order_items")
        .update({
          quantity_requested: quantity,
          external_sku: line.sku,
          unit_price: unitPrice,
          line_total: unitPrice * quantity,
          notes: line.variant_title,
        })
        .eq("id", existingLineId)
        .eq("order_id", orderId);
      if (lineUpdErr) {
        return {
          ok: false,
          created,
          needsMappingCount,
          error: `Line item update failed: ${lineUpdErr.message}`,
        };
      }
      continue;
    }

    const matched = await matchOrCreateProduct(
      orgId,
      line.sku,
      line.title,
      line.vendor
    );
    if (matched.needsMapping) needsMappingCount++;

    newLineRows.push({
      order_id: orderId,
      product_id: matched.productId,
      external_id: lineExternalId,
      external_sku: line.sku,
      quantity_requested: quantity,
      quantity_picked: 0,
      unit_price: unitPrice,
      line_total: unitPrice * quantity,
      needs_mapping: matched.needsMapping,
      notes: line.variant_title,
    });
  }

  if (newLineRows.length > 0) {
    const { error: linesErr } = await admin
      .from("order_items")
      .insert(newLineRows);
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

  // 3. Auto-create stub. The placeholder barcode is a UUID, not a timestamp:
  //    two SKU-less lines ingested in the same millisecond used to collide on
  //    the barcode unique constraint and fail the whole order.
  const { data: stub, error } = await admin
    .from("products")
    .insert({
      org_id: orgId,
      name: title.slice(0, 200),
      barcode: sku || `shopify-stub-${randomUUID()}`,
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
