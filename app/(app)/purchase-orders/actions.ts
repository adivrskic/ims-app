"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

/**
 * Draft a reorder PO from products at or below their reorder point.
 * Calculates target quantity as max(reorder_point * 2 - current, reorder_point)
 * so a partial reorder doesn't immediately re-trigger the alert.
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
      "id, name, barcode, reorder_point, locations:locations ( quantity )"
    )
    .gt("reorder_point", 0);

  type ProductRow = {
    id: string;
    name: string;
    barcode: string;
    reorder_point: number;
    locations: Array<{ quantity: number | null }> | null;
  };

  const lowStock = ((products as ProductRow[]) ?? [])
    .map((p) => {
      const total = (p.locations ?? []).reduce(
        (s, l) => s + (l.quantity ?? 0),
        0
      );
      return { ...p, total };
    })
    .filter((p) => p.total <= p.reorder_point);

  if (lowStock.length === 0) {
    // Redirect to the POs list with a hint param
    redirect("/purchase-orders?no_low_stock=1");
  }

  // Generate next PO number
  const { data: lastPO } = await supabase
    .from("purchase_orders")
    .select("po_number")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastNum = lastPO?.po_number?.match(/PO-(\d+)/)?.[1];
  const nextNum = lastNum ? parseInt(lastNum, 10) + 1 : 2049;

  const { data: newPO, error: poErr } = await supabase
    .from("purchase_orders")
    .insert({
      org_id: orgId,
      warehouse_id: warehouse?.id,
      po_number: `PO-${nextNum}`,
      supplier_name: "Supplier TBD",
      status: "draft",
      notes: `Auto-drafted from low-stock signals · ${lowStock.length} SKU${
        lowStock.length === 1 ? "" : "s"
      }`,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (poErr || !newPO) return;

  const lineItems = lowStock.map((p) => ({
    po_id: newPO.id,
    product_id: p.id,
    product_name: p.name,
    barcode: p.barcode,
    quantity_expected: Math.max(p.reorder_point * 2 - p.total, p.reorder_point),
  }));

  await supabase.from("po_line_items").insert(lineItems);

  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders/${newPO.id}`);
}

export async function markPoSent(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return;
  const id = String(formData.get("id") ?? "");
  await ctx.supabase
    .from("purchase_orders")
    .update({ status: "sent" })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
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

  const supplier = String(formData.get("supplier_name") ?? "").trim();
  const contact = String(formData.get("supplier_contact") ?? "").trim();
  const warehouseId = String(formData.get("warehouse_id") ?? "").trim();
  const expectedDate = String(formData.get("expected_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const itemsJson = String(formData.get("items") ?? "[]");

  if (!supplier) return { error: "Supplier name is required" };
  if (!warehouseId) return { error: "Pick a facility" };

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

  // Snapshot product name + barcode at PO-create time (PO lines store these
  // denormalized so suppliers can ship against the order even if our product
  // record is later renamed).
  const productIds = items.map((i) => i.product_id);
  const { data: productsData } = await ctx.supabase
    .from("products")
    .select("id, name, barcode")
    .in("id", productIds);
  const productMap = new Map(
    (
      (productsData ?? []) as Array<{
        id: string;
        name: string;
        barcode: string;
      }>
    ).map((p) => [p.id, p])
  );

  // Auto-number
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
      supplier_name: supplier,
      supplier_contact: contact || null,
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

/**
 * Receive a line item — mark it as fully received and update the parent PO
 * status to partially_received or fully_received depending on remaining items.
 */
export async function receiveLineItem(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return;
  const lineId = String(formData.get("line_id") ?? "");
  const poId = String(formData.get("po_id") ?? "");

  // Fetch the line item to get expected qty
  const { data: line } = await ctx.supabase
    .from("po_line_items")
    .select("quantity_expected")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return;

  await ctx.supabase
    .from("po_line_items")
    .update({
      quantity_received: line.quantity_expected,
      received_at: new Date().toISOString(),
      received_by: ctx.user.id,
    })
    .eq("id", lineId);

  // Re-evaluate parent PO status
  const { data: lines } = await ctx.supabase
    .from("po_line_items")
    .select("quantity_expected, quantity_received")
    .eq("po_id", poId);
  type Line = { quantity_expected: number; quantity_received: number | null };
  const ls = (lines ?? []) as Line[];
  const allReceived = ls.every(
    (l) => (l.quantity_received ?? 0) >= l.quantity_expected
  );
  const anyReceived = ls.some((l) => (l.quantity_received ?? 0) > 0);
  const newStatus = allReceived
    ? "fully_received"
    : anyReceived
    ? "partially_received"
    : "sent";

  await ctx.supabase
    .from("purchase_orders")
    .update({ status: newStatus })
    .eq("id", poId)
    .eq("org_id", ctx.orgId);

  revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath("/purchase-orders");
}
