"use server";

import { revalidatePath } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";

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
