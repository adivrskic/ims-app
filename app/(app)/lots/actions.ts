"use server";

import { revalidatePath } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";

/**
 * Register a lot/batch for a lot-tracked product. RLS (lots_write =
 * is_org_member) scopes the write; we also set org_id explicitly.
 */
export async function createLot(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("inventory.adjust")) {
    return { error: "You don't have permission to manage lots" };
  }

  const productId = String(formData.get("product_id") ?? "").trim();
  const lotNumber = String(formData.get("lot_number") ?? "").trim();
  const expiresAt = String(formData.get("expires_at") ?? "").trim();
  const supplierId = String(formData.get("supplier_id") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!productId) return { error: "Pick a product" };
  if (!lotNumber) return { error: "Lot / batch number is required" };

  // Confirm the product belongs to this org (RLS already scopes, belt + braces).
  const { data: product } = await ctx.supabase
    .from("products")
    .select("id, name, track_lots")
    .eq("id", productId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!product) return { error: "Product not found in this workspace" };

  const { error } = await ctx.supabase.from("lots").insert({
    org_id: ctx.orgId,
    product_id: productId,
    lot_number: lotNumber,
    expires_at: expiresAt || null,
    supplier_id: supplierId || null,
    notes: notes || null,
    received_at: new Date().toISOString(),
    created_by: ctx.user.id,
  });
  if (error) return { error: error.message };

  // Registering a lot implies the product is lot-tracked — keep the flag honest.
  if (!product.track_lots) {
    await ctx.supabase
      .from("products")
      .update({ track_lots: true })
      .eq("id", productId)
      .eq("org_id", ctx.orgId);
  }

  revalidatePath("/lots");
  revalidatePath(`/inventory/${productId}`);
  return { success: `Lot ${lotNumber} registered` };
}

/** Delete a lot (registry correction). org-scoped. */
export async function deleteLot(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("inventory.adjust")) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await ctx.supabase.from("lots").delete().eq("id", id).eq("org_id", ctx.orgId);
  revalidatePath("/lots");
}

/** Toggle a product's lot-tracking opt-in. */
export async function setProductLotTracking(
  formData: FormData
): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("inventory.adjust")) return;
  const productId = String(formData.get("product_id") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!productId) return;
  await ctx.supabase
    .from("products")
    .update({ track_lots: enabled })
    .eq("id", productId)
    .eq("org_id", ctx.orgId);
  revalidatePath("/lots");
  revalidatePath(`/inventory/${productId}`);
}
