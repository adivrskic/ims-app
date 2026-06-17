"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { tags } from "@/lib/cache-tags";

export async function createWarehouse(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("facilities.manage")) {
    return { error: "Only admins can add facilities" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const zip = String(formData.get("zip") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!name) return { error: "Name is required" };

  const { data: created, error } = await ctx.supabase
    .from("warehouses")
    .insert({
      org_id: ctx.orgId,
      name,
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      phone: phone || null,
      owner_id: ctx.user.id,
      is_active: true,
    })
    .select("id, floor_canvas_width, floor_canvas_height")
    .single();

  if (error) return { error: error.message };

  // Seed a default receiving door so the facility always has a travel-distance
  // anchor for slotting (#8). Placed bottom-center of the default canvas; the
  // user can move or relabel it in the builder. A door insert failure must not
  // block facility creation, so we ignore its error.
  if (created) {
    const canvasW = Number(created.floor_canvas_width) || 1200;
    const canvasH = Number(created.floor_canvas_height) || 800;
    const doorW = 48;
    const doorH = 12;
    await ctx.supabase.from("layout_elements").insert({
      org_id: ctx.orgId,
      warehouse_id: created.id,
      kind: "door",
      floor_x: Math.max(0, canvasW / 2 - doorW / 2),
      floor_y: Math.max(0, canvasH - doorH - 4),
      floor_width: doorW,
      floor_height: doorH,
      rotation: 0,
      color: "#D4A853",
      label: "Receiving",
      data: {},
      sort_order: 0,
    });
  }

  revalidateTag(tags.warehouses(ctx.orgId));
  revalidatePath("/facilities");
  return { success: `${name} added` };
}

export async function archiveWarehouse(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("facilities.manage")) return;
  const id = String(formData.get("id") ?? "");
  await ctx.supabase
    .from("warehouses")
    .update({ is_active: false })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidateTag(tags.warehouses(ctx.orgId));
  revalidatePath("/facilities");
}

export async function restoreWarehouse(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("facilities.manage")) return;
  const id = String(formData.get("id") ?? "");
  await ctx.supabase
    .from("warehouses")
    .update({ is_active: true })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidateTag(tags.warehouses(ctx.orgId));
  revalidatePath("/facilities");
}

export async function createSection(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("facilities.manage")) {
    return { error: "Only admins can add sections" };
  }

  const warehouseId = String(formData.get("warehouse_id") ?? "");
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const baysRaw = String(formData.get("total_bays") ?? "").trim();
  const levelsRaw = String(formData.get("total_levels") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();

  if (!warehouseId) return { error: "Missing facility" };
  if (!code) return { error: "Section code is required" };
  if (code.length > 4)
    return { error: "Section code must be 4 characters or fewer" };
  if (!name) return { error: "Section name is required" };

  const bays = parseInt(baysRaw, 10);
  const levels = parseInt(levelsRaw, 10);
  if (Number.isNaN(bays) || bays < 1)
    return { error: "Bays must be at least 1" };
  if (Number.isNaN(levels) || levels < 1)
    return { error: "Levels must be at least 1" };

  // Find existing sort_order max for this warehouse
  const { data: existing } = await ctx.supabase
    .from("sections")
    .select("sort_order")
    .eq("warehouse_id", warehouseId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (existing?.sort_order ?? -1) + 1;

  const { error } = await ctx.supabase.from("sections").insert({
    org_id: ctx.orgId,
    warehouse_id: warehouseId,
    code,
    name,
    total_bays: bays,
    total_levels: levels,
    color: color || "#D4A853",
    sort_order: nextSort,
  });

  if (error) {
    if (error.message.toLowerCase().includes("duplicate")) {
      return { error: `Section ${code} already exists in this facility` };
    }
    return { error: error.message };
  }
  revalidateTag(tags.warehouses(ctx.orgId));
  revalidatePath("/facilities");
  revalidatePath(`/facilities/${warehouseId}`);
  return { success: `Section ${code} added` };
}

export async function deleteSection(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("facilities.manage")) return;
  const id = String(formData.get("id") ?? "");
  // Only delete if no locations reference it
  const { count } = await ctx.supabase
    .from("locations")
    .select("id", { count: "exact", head: true })
    .eq("section_id", id);
  if ((count ?? 0) > 0) return;
  await ctx.supabase
    .from("sections")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidateTag(tags.warehouses(ctx.orgId));
  revalidatePath("/facilities");
}
