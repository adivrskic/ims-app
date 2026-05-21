"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tags } from "@/lib/cache-tags";
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
  return {
    supabase,
    user,
    orgId: membership.org_id as string,
    role: membership.role,
  };
}

export async function createWarehouse(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!["owner", "admin"].includes(ctx.role)) {
    return { error: "Only admins can add facilities" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const zip = String(formData.get("zip") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!name) return { error: "Name is required" };

  const { error } = await ctx.supabase.from("warehouses").insert({
    org_id: ctx.orgId,
    name,
    address: address || null,
    city: city || null,
    state: state || null,
    zip: zip || null,
    phone: phone || null,
    owner_id: ctx.user.id,
    is_active: true,
  });

  if (error) return { error: error.message };

  revalidateTag(tags.warehouses(ctx.orgId));
  revalidatePath("/settings/facilities");
  return { success: `${name} added` };
}

export async function archiveWarehouse(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return;
  if (!["owner", "admin"].includes(ctx.role)) return;
  const id = String(formData.get("id") ?? "");
  await ctx.supabase
    .from("warehouses")
    .update({ is_active: false })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidateTag(tags.warehouses(ctx.orgId));
  revalidatePath("/settings/facilities");
}

export async function restoreWarehouse(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return;
  if (!["owner", "admin"].includes(ctx.role)) return;
  const id = String(formData.get("id") ?? "");
  await ctx.supabase
    .from("warehouses")
    .update({ is_active: true })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidateTag(tags.warehouses(ctx.orgId));
  revalidatePath("/settings/facilities");
}

export async function createSection(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!["owner", "admin"].includes(ctx.role)) {
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
  revalidatePath("/settings/facilities");
  return { success: `Section ${code} added` };
}

export async function deleteSection(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return;
  if (!["owner", "admin"].includes(ctx.role)) return;
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
  revalidatePath("/settings/facilities");
}
