"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getActionContext } from "@/lib/data/actionContext";
import { narratePoDraft } from "@/lib/ai/narrate";
import { draftReorderPOs } from "@/lib/data/reorderDraft";
import { tags } from "@/lib/cache-tags";

/**
 * Draft a reorder PO from products at or below their reorder point.
 *
 * P2: switches from the naive `max(rp*2 - on_hand, rp+safety)` heuristic to
 * proper ROP+EOQ math. For each low-stock product we:
 *
 *   1. Pull the last 60 days of pick/adjust scans to compute daily velocity
 *      (via the shared productVelocities helper in lib/data/velocity)
 *   2. Compute ROP    = velocity × lead_time + safety_stock
 *   3. Compute EOQ    = √(2 × annualDemand × orderCost / holdingCost)
 *   4. Recommend qty  = max(EOQ, gap-to-ROP-after-lead-time)
 *
 * Groups items by preferred supplier and creates one PO per supplier
 * (same as P1). Snapshots unit_cost onto each line for cost-aware
 * reporting downstream.
 *
 * AI: after grouping, calls narratePoDraft per supplier group to generate
 * one short reasoning sentence per line, stored alongside the line item.
 * Failure-tolerant — narration returning null just means lines persist
 * with reasoning=null.
 */
export async function draftReorderPO(): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  const { supabase, orgId, user } = ctx;

  // Core drafting (math + grouping + persistence) lives in the shared engine
  // so the scheduled auto-draft cron runs the exact same logic. Pass the real
  // user + the RLS client; narratePoDraft works here because there's a session.
  const result = await draftReorderPOs({
    supabase,
    orgId,
    userId: user.id,
    narrate: narratePoDraft,
  });

  if (result.status === "no_low_stock") {
    redirect("/purchase-orders?no_low_stock=1");
  }

  revalidatePath("/purchase-orders");
  revalidateTag(tags.purchaseOrders(orgId));
  if (result.supplierGroups === 1 && result.createdPoIds[0]) {
    redirect(`/purchase-orders/${result.createdPoIds[0]}`);
  }
  redirect("/purchase-orders");
}

/**
 * Toggle the workspace's auto-draft-PO setting (owner/admin only). Drives the
 * scheduled cron at /api/cron/auto-draft-pos, which only processes orgs with
 * this enabled.
 */
export async function setAutoDraftEnabled(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!["owner", "admin"].includes(ctx.role)) return;

  const enabled = String(formData.get("enabled") ?? "") === "true";
  await ctx.supabase
    .from("orgs")
    .update({ auto_draft_pos_enabled: enabled })
    .eq("id", ctx.orgId);

  revalidatePath("/purchase-orders");
}

// ─── Lifecycle transitions ──────────────────────────────────────────────────

/**
 * Move PO from draft → sent. Stamps sent_at so we can compute supplier lead
 * times. Idempotent — already-sent POs aren't re-stamped.
 */
export async function markPoSent(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  const id = String(formData.get("id") ?? "");

  await ctx.supabase
    .from("purchase_orders")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .eq("status", "draft"); // only stamp once

  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/purchase-orders");
  revalidateTag(tags.purchaseOrders(ctx.orgId));
}

export async function markPoCancelled(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  const id = String(formData.get("id") ?? "");
  await ctx.supabase
    .from("purchase_orders")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/purchase-orders");
  revalidateTag(tags.purchaseOrders(ctx.orgId));
}

interface PoLineInput {
  product_id: string;
  quantity: number;
}

/**
 * Create a PO from the manual form.
 *
 * P2: snapshots `products.unit_cost` onto each new line so historical cost
 * analysis stays accurate if the product's current cost later changes.
 */
export async function createPurchaseOrder(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string; id?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };

  const supplierId = String(formData.get("supplier_id") ?? "").trim();
  const warehouseId = String(formData.get("warehouse_id") ?? "").trim();
  const expectedDate = String(formData.get("expected_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const itemsJson = String(formData.get("items") ?? "[]");

  if (!supplierId) return { error: "Pick a supplier" };
  if (!warehouseId) return { error: "Pick a facility" };

  const { data: supplier } = await ctx.supabase
    .from("suppliers")
    .select("id, name, email")
    .eq("id", supplierId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (!supplier) {
    return { error: "Supplier not found in this workspace" };
  }

  let items: PoLineInput[] = [];
  try {
    const parsed = JSON.parse(itemsJson);
    if (!Array.isArray(parsed)) throw new Error("items must be an array");
    items = parsed
      .filter(
        (i: unknown): i is PoLineInput =>
          typeof i === "object" &&
          i !== null &&
          typeof (i as PoLineInput).product_id === "string" &&
          typeof (i as PoLineInput).quantity === "number"
      )
      .filter((i) => i.product_id.length > 0 && i.quantity > 0);
  } catch {
    return { error: "Invalid line items" };
  }

  if (items.length === 0) return { error: "Add at least one line item" };

  const productIds = items.map((i) => i.product_id);
  const { data: productsData } = await ctx.supabase
    .from("products")
    .select("id, name, barcode, unit_cost")
    .in("id", productIds);
  const productMap = new Map(
    (
      (productsData ?? []) as Array<{
        id: string;
        name: string;
        barcode: string;
        unit_cost: string | null;
      }>
    ).map((p) => [p.id, p])
  );

  const { data: lastPO } = await ctx.supabase
    .from("purchase_orders")
    .select("po_number")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastNum = lastPO?.po_number?.match(/PO-(\d+)/)?.[1];
  const nextNum = lastNum ? parseInt(lastNum, 10) + 1 : 2049;

  const { data: newPO, error: poErr } = await ctx.supabase
    .from("purchase_orders")
    .insert({
      org_id: ctx.orgId,
      warehouse_id: warehouseId,
      po_number: `PO-${nextNum}`,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      supplier_contact: supplier.email,
      status: "draft",
      expected_date: expectedDate || null,
      notes: notes || null,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (poErr || !newPO)
    return { error: poErr?.message ?? "Failed to create PO" };

  const lineRows = items.map((i) => {
    const p = productMap.get(i.product_id);
    return {
      po_id: newPO.id,
      product_id: i.product_id,
      product_name: p?.name ?? "Unknown product",
      barcode: p?.barcode ?? null,
      quantity_expected: i.quantity,
      unit_cost: p?.unit_cost ?? null, // P2: snapshot current cost
    };
  });

  const { error: linesErr } = await ctx.supabase
    .from("po_line_items")
    .insert(lineRows);

  if (linesErr) {
    await ctx.supabase.from("purchase_orders").delete().eq("id", newPO.id);
    return { error: `Failed to create line items: ${linesErr.message}` };
  }

  revalidatePath("/purchase-orders");
  revalidateTag(tags.purchaseOrders(ctx.orgId));
  redirect(`/purchase-orders/${newPO.id}`);
}

// ─── Receiving ──────────────────────────────────────────────────────────────

/**
 * Receive (or partially receive) a single PO line item.
 *
 * P2 changes from "always set received = expected":
 *   - Accepts `quantity_received` from the form (defaults to full receipt
 *     if the field is omitted, to preserve the "Receive all" affordance)
 *   - Accepts optional `landed_unit_cost` so the receiver can record the
 *     actual all-in cost (freight + duties) at putaway time
 *   - When the resulting parent PO transitions to fully_received, stamps
 *     `received_at` on the parent so supplier scorecards can compute
 *     actual lead time
 *
 * Validation: received_qty must be 0 < qty ≤ expected. We don't allow
 * over-receipt here — that's an exception case better handled by a separate
 * "report overage" flow.
 */
export async function receiveLineItem(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string } | void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };

  const lineId = String(formData.get("line_id") ?? "");
  const poId = String(formData.get("po_id") ?? "");
  const qtyRaw = String(formData.get("quantity_received") ?? "").trim();
  const landedRaw = String(formData.get("landed_unit_cost") ?? "").trim();
  const lotNumber = String(formData.get("lot_number") ?? "").trim();
  const lotExpiry = String(formData.get("lot_expiry") ?? "").trim();

  const { data: line } = await ctx.supabase
    .from("po_line_items")
    .select("quantity_expected, quantity_received, product_id")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { error: "Line not found" };

  // Default to full receipt when no quantity provided (preserves the
  // existing "Receive all" affordance for backwards compatibility).
  const expected = line.quantity_expected;
  const alreadyReceived = line.quantity_received ?? 0;
  const remaining = expected - alreadyReceived;
  let qty: number;
  if (!qtyRaw) {
    qty = remaining;
  } else {
    const parsed = parseInt(qtyRaw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return { error: "Quantity must be a positive number" };
    }
    qty = parsed;
  }
  if (qty > remaining) {
    return {
      error: `Can't receive ${qty} — only ${remaining} remaining on this line`,
    };
  }

  // Parse optional landed cost
  let landedCost: string | null = null;
  if (landedRaw) {
    const cleaned = landedRaw.replace(/[$,\s]/g, "");
    const n = parseFloat(cleaned);
    if (!Number.isFinite(n) || n < 0) {
      return { error: "Landed cost must be a non-negative number" };
    }
    landedCost = n.toFixed(2);
  }

  const newReceived = alreadyReceived + qty;
  const lineUpdate: Record<string, unknown> = {
    quantity_received: newReceived,
    received_at: new Date().toISOString(),
    received_by: ctx.user.id,
  };
  if (landedCost !== null) {
    lineUpdate.landed_unit_cost = landedCost;
  }
  // Inbound QC: receiving with "Hold for QC" quarantines the line for
  // inspection before it's cleared for putaway.
  if (String(formData.get("qc_hold") ?? "") === "1") {
    lineUpdate.qc_status = "hold";
  }

  // Lot capture: when a lot number is entered, find-or-create the lot for this
  // product and attach it to the line. Also flips the product to lot-tracked
  // and stamps the lot's expiry (so it surfaces in the Lots registry + alerts).
  const productId = (line as { product_id: string | null }).product_id;
  if (lotNumber && productId) {
    const { data: po } = await ctx.supabase
      .from("purchase_orders")
      .select("supplier_id")
      .eq("id", poId)
      .maybeSingle();
    const supplierId =
      (po as { supplier_id: string | null } | null)?.supplier_id ?? null;

    const { data: existingLot } = await ctx.supabase
      .from("lots")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("product_id", productId)
      .eq("lot_number", lotNumber)
      .maybeSingle();

    let lotId = (existingLot as { id: string } | null)?.id ?? null;
    if (!lotId) {
      const { data: newLot } = await ctx.supabase
        .from("lots")
        .insert({
          org_id: ctx.orgId,
          product_id: productId,
          lot_number: lotNumber,
          expires_at: lotExpiry || null,
          supplier_id: supplierId,
          received_at: new Date().toISOString(),
          created_by: ctx.user.id,
        })
        .select("id")
        .single();
      lotId = (newLot as { id: string } | null)?.id ?? null;
    } else if (lotExpiry) {
      // Backfill expiry onto an existing lot if it was registered without one.
      await ctx.supabase
        .from("lots")
        .update({ expires_at: lotExpiry })
        .eq("id", lotId)
        .eq("org_id", ctx.orgId);
    }

    lineUpdate.lot_number = lotNumber;
    if (lotId) lineUpdate.lot_id = lotId;

    // Receiving into a lot means this product is lot-tracked.
    await ctx.supabase
      .from("products")
      .update({ track_lots: true })
      .eq("id", productId)
      .eq("org_id", ctx.orgId);
  }

  await ctx.supabase.from("po_line_items").update(lineUpdate).eq("id", lineId);

  // Re-evaluate parent PO status
  const { data: allLines } = await ctx.supabase
    .from("po_line_items")
    .select("quantity_expected, quantity_received")
    .eq("po_id", poId);
  type Line = { quantity_expected: number; quantity_received: number | null };
  const ls = (allLines ?? []) as Line[];
  const allReceived = ls.every(
    (l) => (l.quantity_received ?? 0) >= l.quantity_expected
  );
  const anyReceived = ls.some((l) => (l.quantity_received ?? 0) > 0);
  const newStatus = allReceived
    ? "fully_received"
    : anyReceived
    ? "partially_received"
    : "sent";

  const poUpdate: Record<string, unknown> = { status: newStatus };
  if (newStatus === "fully_received") {
    // Stamp received_at only once — supplier scorecards depend on this
    // being the first-completion timestamp.
    const { data: existingPo } = await ctx.supabase
      .from("purchase_orders")
      .select("received_at")
      .eq("id", poId)
      .maybeSingle();
    if (!existingPo?.received_at) {
      poUpdate.received_at = new Date().toISOString();
    }
  }

  await ctx.supabase
    .from("purchase_orders")
    .update(poUpdate)
    .eq("id", poId)
    .eq("org_id", ctx.orgId);

  revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath("/purchase-orders");
  revalidateTag(tags.purchaseOrders(ctx.orgId));
  return { success: "Receipt recorded" };
}
