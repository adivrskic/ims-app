"use server";

import { revalidatePath } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { bomCreatesCycle } from "@/lib/data/bom";
import { assembleKit } from "@/lib/data/assemble";

/** Mark a product as a kit (or not). Opt-in, like lot tracking. */
export async function setKitFlag(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  const productId = String(formData.get("product_id") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!productId) return;
  await ctx.supabase
    .from("products")
    .update({ is_kit: enabled })
    .eq("id", productId)
    .eq("org_id", ctx.orgId);
  revalidatePath("/kits");
  revalidatePath(`/inventory/${productId}`);
}

/** Add a component line to a kit's BOM. */
export async function addKitComponent(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };

  const kitProductId = String(formData.get("kit_product_id") ?? "").trim();
  const componentProductId = String(
    formData.get("component_product_id") ?? ""
  ).trim();
  const qty = parseInt(String(formData.get("quantity") ?? "1"), 10);

  if (!kitProductId || !componentProductId) {
    return { error: "Pick a component" };
  }
  if (kitProductId === componentProductId) {
    return { error: "A kit can't contain itself" };
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return { error: "Quantity must be a positive number" };
  }

  // Multi-level BOM: reject edges that would create a cycle (A→B→…→A), not
  // just direct self-reference.
  if (await bomCreatesCycle(ctx.supabase, ctx.orgId, kitProductId, componentProductId)) {
    return {
      error: "That would create a circular BOM (the component already contains this kit)",
    };
  }

  const { error } = await ctx.supabase.from("kit_components").insert({
    org_id: ctx.orgId,
    kit_product_id: kitProductId,
    component_product_id: componentProductId,
    quantity: qty,
  });
  if (error) {
    // Unique (kit, component) violation → already in the BOM.
    if (error.code === "23505") {
      return { error: "That component is already in this kit" };
    }
    return { error: error.message };
  }

  revalidatePath("/kits");
  return { success: "Component added" };
}

/**
 * Build (assemble) N kits at a facility: consume N×each component from on-hand
 * and produce N kit units. Adjusts on-hand at the location level — mirroring the
 * cycle-count adjustment pattern — and records scan_history for every leg so the
 * assembly is auditable. Component decrement is greedy across the product's
 * locations at the facility; the kit is produced into its existing location
 * there (or a staging slot is created if it has none).
 */
export async function buildKit(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("work_orders.manage")) {
    return { error: "You don't have permission to build kits" };
  }

  const kitId = String(formData.get("kit_product_id") ?? "").trim();
  const warehouseId = String(formData.get("warehouse_id") ?? "").trim();
  const qty = parseInt(String(formData.get("quantity") ?? "0"), 10);

  if (!kitId) return { error: "Missing kit" };
  if (!warehouseId) return { error: "Pick a facility to build at" };
  if (!Number.isFinite(qty) || qty <= 0) {
    return { error: "Quantity must be a positive number" };
  }

  const result = await assembleKit(
    ctx.supabase,
    { orgId: ctx.orgId, userId: ctx.user.id },
    { kitId, warehouseId, qty, reason: "Kit build" }
  );
  if (result.error) return { error: result.error };

  revalidatePath("/kits");
  revalidatePath(`/inventory/${kitId}`);
  for (const componentId of result.consumed?.keys() ?? []) {
    revalidatePath(`/inventory/${componentId}`);
  }
  return { success: `Built ${qty} × kit` };
}

/** Remove a component line from a kit's BOM. */
export async function removeKitComponent(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await ctx.supabase
    .from("kit_components")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath("/kits");
}
