"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  dailyVelocity,
  economicOrderQty,
  recommendedOrderQuantity,
  reorderPoint as ropFormula,
} from "@/lib/replenishment";

async function getOrgContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" as const };

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return { error: "No workspace" as const };
  return { supabase, user, orgId: membership.org_id as string };
}

const VELOCITY_LOOKBACK_DAYS = 60;

/**
 * Draft a reorder PO from products at or below their reorder point.
 *
 * Uses velocity-based ROP+EOQ math (P2) and groups by preferred supplier.
 * Unchanged in P4 — kept here so this file stays the single source of
 * truth for the purchase-orders module.
 */
export async function draftReorderPO(): Promise<void> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return;
  const { supabase, orgId, user } = ctx;

  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id")
    .limit(1)
    .maybeSingle();

  const { data: products } = await supabase
    .from("products")
    .select(
      `id, name, barcode, reorder_point, safety_stock, lead_time_days,
       unit_cost, preferred_supplier_id,
       locations:locations ( quantity ),
       preferred_supplier:suppliers!products_preferred_supplier_id_fkey (
         id, name, default_lead_time_days
       )`
    )
    .gt("reorder_point", 0);

  type ProductRow = {
    id: string;
    name: string;
    barcode: string;
    reorder_point: number;
    safety_stock: number | null;
    lead_time_days: number | null;
    unit_cost: string | null;
    preferred_supplier_id: string | null;
    locations: Array<{ quantity: number | null }> | null;
    preferred_supplier:
      | { id: string; name: string; default_lead_time_days: number | null }
      | { id: string; name: string; default_lead_time_days: number | null }[]
      | null;
  };

  const lowStock = ((products as ProductRow[]) ?? [])
    .map((p) => {
      const total = (p.locations ?? []).reduce(
        (s, l) => s + (l.quantity ?? 0),
        0
      );
      const supplier = Array.isArray(p.preferred_supplier)
        ? p.preferred_supplier[0]
        : p.preferred_supplier;
      return { ...p, total, supplier };
    })
    .filter((p) => p.total <= p.reorder_point);

  if (lowStock.length === 0) {
    redirect("/purchase-orders?no_low_stock=1");
  }

  // Velocity lookup
  const lookbackStart = new Date();
  lookbackStart.setDate(lookbackStart.getDate() - VELOCITY_LOOKBACK_DAYS);
  lookbackStart.setHours(0, 0, 0, 0);

  const productIds = lowStock.map((p) => p.id);
  const { data: velocityScans } = await supabase
    .from("scan_history")
    .select("product_id, quantity, action")
    .in("product_id", productIds)
    .in("action", ["pick", "adjust"])
    .gte("scanned_at", lookbackStart.toISOString());

  const consumedByProduct = new Map<string, number>();
  for (const s of (velocityScans ?? []) as Array<{
    product_id: string | null;
    quantity: number | null;
    action: string;
  }>) {
    if (!s.product_id) continue;
    const q = Math.abs(s.quantity ?? 0);
    consumedByProduct.set(
      s.product_id,
      (consumedByProduct.get(s.product_id) ?? 0) + q
    );
  }

  // Group by supplier + compute recommendations
  type RecommendedLine = {
    product_id: string;
    product_name: string;
    barcode: string;
    quantity_expected: number;
    unit_cost: string | null;
    velocity: number;
    rop: number;
  };
  type Group = {
    supplierId: string | null;
    supplierName: string;
    lines: RecommendedLine[];
  };
  const groups = new Map<string, Group>();

  for (const item of lowStock) {
    const velocity = dailyVelocity({
      totalUnitsConsumed: consumedByProduct.get(item.id) ?? 0,
      days: VELOCITY_LOOKBACK_DAYS,
    });

    const leadTimeDays =
      item.lead_time_days ?? item.supplier?.default_lead_time_days ?? 7;
    const safetyStock = item.safety_stock ?? 0;
    const rop = ropFormula({ velocity, leadTimeDays, safetyStock });

    const unitCostNum =
      item.unit_cost != null ? parseFloat(item.unit_cost) : null;
    const eoq = economicOrderQty({
      annualDemand: velocity * 365,
      unitCost: unitCostNum,
    });

    const orderQty = recommendedOrderQuantity({
      onHand: item.total,
      rop,
      velocity,
      leadTimeDays,
      eoq,
    });

    const key = item.supplier?.id ?? "__tbd__";
    const existing = groups.get(key);
    const line: RecommendedLine = {
      product_id: item.id,
      product_name: item.name,
      barcode: item.barcode,
      quantity_expected: orderQty,
      unit_cost: item.unit_cost,
      velocity,
      rop,
    };
    if (existing) {
      existing.lines.push(line);
    } else {
      groups.set(key, {
        supplierId: item.supplier?.id ?? null,
        supplierName: item.supplier?.name ?? "Supplier TBD",
        lines: [line],
      });
    }
  }

  const { data: lastPO } = await supabase
    .from("purchase_orders")
    .select("po_number")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextNum =
    (lastPO?.po_number?.match(/PO-(\d+)/)?.[1]
      ? parseInt(lastPO.po_number.match(/PO-(\d+)/)![1]!, 10)
      : 2048) + 1;

  let lastCreatedId: string | null = null;

  for (const group of groups.values()) {
    const ropSummary = group.lines
      .slice(0, 3)
      .map(
        (l) =>
          `${l.product_name}: ${l.quantity_expected}u (ROP ${
            l.rop
          }, v=${l.velocity.toFixed(2)}/d)`
      )
      .join("; ");
    const truncationHint =
      group.lines.length > 3 ? ` (+${group.lines.length - 3} more)` : "";

    const { data: newPO, error: poErr } = await supabase
      .from("purchase_orders")
      .insert({
        org_id: orgId,
        warehouse_id: warehouse?.id,
        po_number: `PO-${nextNum}`,
        supplier_id: group.supplierId,
        supplier_name: group.supplierName,
        status: "draft",
        notes: `Auto-drafted · ${group.lines.length} SKU${
          group.lines.length === 1 ? "" : "s"
        } · ${ropSummary}${truncationHint}`,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (poErr || !newPO) continue;
    lastCreatedId = newPO.id;
    nextNum++;

    const lineRows = group.lines.map((l) => ({
      po_id: newPO.id,
      product_id: l.product_id,
      product_name: l.product_name,
      barcode: l.barcode,
      quantity_expected: l.quantity_expected,
      unit_cost: l.unit_cost,
    }));

    await supabase.from("po_line_items").insert(lineRows);
  }

  revalidatePath("/purchase-orders");
  if (groups.size === 1 && lastCreatedId) {
    redirect(`/purchase-orders/${lastCreatedId}`);
  }
  redirect("/purchase-orders");
}

export async function markPoSent(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
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
    .eq("status", "draft");

  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/purchase-orders");
}

export async function markPoCancelled(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return;
  const id = String(formData.get("id") ?? "");
  await ctx.supabase
    .from("purchase_orders")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/purchase-orders");
}

interface PoLineInput {
  product_id: string;
  quantity: number;
}

export async function createPurchaseOrder(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string; id?: string }> {
  const ctx = await getOrgContext();
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
    .select("id, name, contact_email")
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
      supplier_contact: supplier.contact_email,
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
      unit_cost: p?.unit_cost ?? null,
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
  redirect(`/purchase-orders/${newPO.id}`);
}

// ─── Receiving (P4: now also captures lot number) ───────────────────────────

/**
 * Receive (or partially receive) a single PO line item.
 *
 * P4 additions:
 *   - Accepts optional `lot_number` from the form
 *   - If provided, upserts into `app.lots` (one row per product_id+lot_number)
 *     and sets `lot_id` + `lot_number` on the PO line. The supplier_id and
 *     received_at on the lots row are populated from the parent PO.
 */
export async function receiveLineItem(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string } | void> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };

  const lineId = String(formData.get("line_id") ?? "");
  const poId = String(formData.get("po_id") ?? "");
  const qtyRaw = String(formData.get("quantity_received") ?? "").trim();
  const landedRaw = String(formData.get("landed_unit_cost") ?? "").trim();
  const lotNumberRaw = String(formData.get("lot_number") ?? "").trim();

  // Fetch the line + parent PO (need product_id + supplier_id for lot upsert)
  const { data: line } = await ctx.supabase
    .from("po_line_items")
    .select("quantity_expected, quantity_received, product_id, po_id")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { error: "Line not found" };

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

  // ── P4: handle lot number ──────────────────────────────────────────────
  let lotId: string | null = null;
  let lotNumber: string | null = null;
  if (lotNumberRaw && line.product_id) {
    lotNumber = lotNumberRaw;
    // Fetch the parent PO for supplier_id + sent_at
    const { data: parentPo } = await ctx.supabase
      .from("purchase_orders")
      .select("supplier_id, sent_at, created_at")
      .eq("id", poId)
      .maybeSingle();

    // Upsert the lot. If it already exists (same product_id + lot_number),
    // we keep the existing record — the unique index handles dedup.
    const { data: upsertedLot } = await ctx.supabase
      .from("lots")
      .upsert(
        {
          org_id: ctx.orgId,
          product_id: line.product_id,
          lot_number: lotNumber,
          supplier_id: parentPo?.supplier_id ?? null,
          received_at:
            parentPo?.sent_at ??
            parentPo?.created_at ??
            new Date().toISOString(),
          created_by: ctx.user.id,
        },
        { onConflict: "product_id,lot_number", ignoreDuplicates: false }
      )
      .select("id")
      .maybeSingle();

    lotId = upsertedLot?.id ?? null;

    // Fallback: if upsert didn't return an id (e.g. RLS edge case), look it up
    if (!lotId) {
      const { data: existingLot } = await ctx.supabase
        .from("lots")
        .select("id")
        .eq("product_id", line.product_id)
        .eq("lot_number", lotNumber)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
      lotId = existingLot?.id ?? null;
    }
  }

  const newReceived = alreadyReceived + qty;
  const lineUpdate: Record<string, unknown> = {
    quantity_received: newReceived,
    received_at: new Date().toISOString(),
    received_by: ctx.user.id,
  };
  if (landedCost !== null) lineUpdate.landed_unit_cost = landedCost;
  if (lotNumber !== null) lineUpdate.lot_number = lotNumber;
  if (lotId !== null) lineUpdate.lot_id = lotId;

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
  if (line.product_id) {
    revalidatePath(`/inventory/${line.product_id}`);
  }
  return { success: "Receipt recorded" };
}
