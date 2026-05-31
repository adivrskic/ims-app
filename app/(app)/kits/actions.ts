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

  const kitId = String(formData.get("kit_product_id") ?? "").trim();
  const warehouseId = String(formData.get("warehouse_id") ?? "").trim();
  const qty = parseInt(String(formData.get("quantity") ?? "0"), 10);

  if (!kitId) return { error: "Missing kit" };
  if (!warehouseId) return { error: "Pick a facility to build at" };
  if (!Number.isFinite(qty) || qty <= 0) {
    return { error: "Quantity must be a positive number" };
  }

  const { data: comps } = await ctx.supabase
    .from("kit_components")
    .select("component_product_id, quantity")
    .eq("org_id", ctx.orgId)
    .eq("kit_product_id", kitId);
  const components = (comps ?? []) as Array<{
    component_product_id: string;
    quantity: number;
  }>;
  if (components.length === 0) {
    return { error: "Define the kit's bill of materials first" };
  }

  // Locations for the kit + all components AT this facility.
  const productIds = [kitId, ...components.map((c) => c.component_product_id)];
  const { data: locData } = await ctx.supabase
    .from("locations")
    .select("id, product_id, quantity")
    .eq("org_id", ctx.orgId)
    .eq("warehouse_id", warehouseId)
    .in("product_id", productIds);
  type Loc = { id: string; product_id: string | null; quantity: number | null };
  const locs = (locData ?? []) as Loc[];

  const locsByProduct = new Map<string, Loc[]>();
  for (const l of locs) {
    if (!l.product_id) continue;
    const arr = locsByProduct.get(l.product_id) ?? [];
    arr.push(l);
    locsByProduct.set(l.product_id, arr);
  }
  const onHand = (pid: string) =>
    (locsByProduct.get(pid) ?? []).reduce((s, l) => s + (l.quantity ?? 0), 0);

  // Validate enough of every component at this facility before mutating.
  for (const c of components) {
    const need = c.quantity * qty;
    if (onHand(c.component_product_id) < need) {
      return {
        error: `Not enough stock at this facility to build ${qty} — short on a component.`,
      };
    }
  }

  const now = new Date().toISOString();

  // Consume components (greedy decrement across the product's locations).
  for (const c of components) {
    let remaining = c.quantity * qty;
    const rows = (locsByProduct.get(c.component_product_id) ?? []).sort(
      (a, b) => (b.quantity ?? 0) - (a.quantity ?? 0)
    );
    for (const row of rows) {
      if (remaining <= 0) break;
      const have = row.quantity ?? 0;
      const take = Math.min(have, remaining);
      if (take <= 0) continue;
      await ctx.supabase
        .from("locations")
        .update({ quantity: have - take })
        .eq("id", row.id);
      remaining -= take;
    }
    await ctx.supabase.from("scan_history").insert({
      org_id: ctx.orgId,
      product_id: c.component_product_id,
      warehouse_id: warehouseId,
      scanned_by: ctx.user.id,
      action: "adjust",
      quantity: -(c.quantity * qty),
      notes: `Kit build: consumed for ${qty}× kit`,
    });
    revalidatePath(`/inventory/${c.component_product_id}`);
  }

  // Produce the kit: increment an existing kit location, or stage a new one.
  const kitLocs = locsByProduct.get(kitId) ?? [];
  if (kitLocs[0]) {
    await ctx.supabase
      .from("locations")
      .update({ quantity: (kitLocs[0].quantity ?? 0) + qty })
      .eq("id", kitLocs[0].id);
  } else {
    await ctx.supabase.from("locations").insert({
      org_id: ctx.orgId,
      product_id: kitId,
      warehouse_id: warehouseId,
      section_id: null,
      bay: 0,
      level: 0,
      quantity: qty,
      placed_by: ctx.user.id,
    });
  }
  await ctx.supabase.from("scan_history").insert({
    org_id: ctx.orgId,
    product_id: kitId,
    warehouse_id: warehouseId,
    scanned_by: ctx.user.id,
    action: "adjust",
    quantity: qty,
    notes: `Kit build: assembled ${qty} unit${qty === 1 ? "" : "s"}`,
  });

  revalidatePath("/kits");
  revalidatePath(`/inventory/${kitId}`);
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
