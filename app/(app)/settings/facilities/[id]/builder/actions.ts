"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SectionDraft } from "./types";

async function getOrgContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" as const };
  const { data: m } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!m) return { error: "No workspace" as const };
  return { supabase, user, orgId: m.org_id as string, role: m.role as string };
}

export async function saveLayout({
  warehouseId,
  sections,
  deletedIds,
}: {
  warehouseId: string;
  sections: SectionDraft[];
  deletedIds: string[];
}): Promise<{ error?: string; success?: string }> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!["owner", "admin"].includes(ctx.role)) {
    return { error: "Only admins can edit facility layouts" };
  }

  // Deletes
  if (deletedIds.length > 0) {
    const { error } = await ctx.supabase
      .from("sections")
      .delete()
      .in("id", deletedIds)
      .eq("org_id", ctx.orgId);
    if (error) return { error: `Delete failed: ${error.message}` };
  }

  // Updates (existing rows)
  const toUpdate = sections.filter((s) => !s.isNew);
  for (const s of toUpdate) {
    const { error } = await ctx.supabase
      .from("sections")
      .update({
        code: s.code,
        name: s.name,
        floor_x: s.floor_x,
        floor_y: s.floor_y,
        floor_width: s.floor_width,
        floor_height: s.floor_height,
        rotation: s.rotation,
        total_bays: s.total_bays,
        total_levels: s.total_levels,
        color: s.color,
        sort_order: s.sort_order,
      })
      .eq("id", s.id)
      .eq("org_id", ctx.orgId);
    if (error) return { error: `Update ${s.code} failed: ${error.message}` };
  }

  // Inserts (new rows)
  const toInsert = sections.filter((s) => s.isNew);
  if (toInsert.length > 0) {
    const rows = toInsert.map((s) => ({
      org_id: ctx.orgId,
      warehouse_id: warehouseId,
      code: s.code,
      name: s.name,
      floor_x: s.floor_x,
      floor_y: s.floor_y,
      floor_width: s.floor_width,
      floor_height: s.floor_height,
      rotation: s.rotation,
      total_bays: s.total_bays,
      total_levels: s.total_levels,
      color: s.color,
      sort_order: s.sort_order,
    }));
    const { error } = await ctx.supabase.from("sections").insert(rows);
    if (error) return { error: `Insert failed: ${error.message}` };
  }

  revalidatePath("/settings/facilities");
  revalidatePath(`/settings/facilities/${warehouseId}/builder`);
  return { success: "Layout saved" };
}
