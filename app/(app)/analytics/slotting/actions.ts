"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { tags } from "@/lib/cache-tags";
import { getActionContext } from "@/lib/data/actionContext";

/**
 * §6c — apply a slotting suggestion from the health report.
 *
 * This is a *desk* relocate: it moves the `locations` row to the suggested slot
 * (which may be in a different section than the existing relocateLocation, which
 * is same-section only) and records a `relocate` scan_history entry. Consistent
 * with the suite's other desk mutations (placeLocation / relocateLocation /
 * updateLocationQuantity), which already adjust stock from the dashboard. The
 * physical floor is expected to follow the recorded move.
 */

interface SlotCoord {
  section_id: string;
  bay: number;
  level: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeRelocateAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { supabase: any; user: { id: string }; orgId: string },
  params: {
    productId: string;
    warehouseId: string;
    from: SlotCoord;
    to: SlotCoord;
    quantity: number | null;
  }
) {
  const { error } = await ctx.supabase.from("scan_history").insert({
    org_id: ctx.orgId,
    product_id: params.productId,
    warehouse_id: params.warehouseId,
    scanned_by: ctx.user.id,
    action: "relocate",
    from_location: params.from,
    to_location: params.to,
    quantity: params.quantity,
  });
  if (error) console.error("scan_history insert failed:", error.message);
}

export interface ApplyMoveArgs {
  productId: string;
  warehouseId: string;
  fromSectionId: string;
  fromBay: number;
  fromLevel: number;
  toSectionId: string;
  toBay: number;
  toLevel: number;
}

export async function applySlottingMove(
  args: ApplyMoveArgs
): Promise<{ error?: string; success?: boolean }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("inventory.adjust")) {
    return { error: "You don't have permission to adjust inventory" };
  }

  if (
    args.fromSectionId === args.toSectionId &&
    args.fromBay === args.toBay &&
    args.fromLevel === args.toLevel
  ) {
    return { error: "Already in the suggested slot" };
  }

  // ── 1. Load the source location row (active, this product, this slot). ──
  const { data: source, error: srcErr } = await ctx.supabase
    .from("locations")
    .select("id, section_id, warehouse_id, product_id, bay, level, quantity")
    .eq("org_id", ctx.orgId)
    .eq("warehouse_id", args.warehouseId)
    .eq("section_id", args.fromSectionId)
    .eq("bay", args.fromBay)
    .eq("level", args.fromLevel)
    .eq("product_id", args.productId)
    .eq("is_active", true)
    .maybeSingle();
  if (srcErr) return { error: srcErr.message };
  if (!source) {
    return { error: "Stock has moved — refresh the report and try again" };
  }

  // ── 2. Validate the target section (same facility) + slot bounds. ──────
  const { data: targetSection, error: secErr } = await ctx.supabase
    .from("sections")
    .select("total_bays, total_levels, warehouse_id")
    .eq("id", args.toSectionId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (secErr) return { error: secErr.message };
  if (!targetSection) return { error: "Target section not found" };
  if (targetSection.warehouse_id !== args.warehouseId) {
    return { error: "Target section is in a different facility" };
  }
  if (args.toBay < 1 || args.toBay > (targetSection.total_bays ?? 0)) {
    return { error: `Bay exceeds section maximum of ${targetSection.total_bays}` };
  }
  if (args.toLevel < 1 || args.toLevel > (targetSection.total_levels ?? 0)) {
    return {
      error: `Level exceeds section maximum of ${targetSection.total_levels}`,
    };
  }

  const from: SlotCoord = {
    section_id: args.fromSectionId,
    bay: args.fromBay,
    level: args.fromLevel,
  };
  const to: SlotCoord = {
    section_id: args.toSectionId,
    bay: args.toBay,
    level: args.toLevel,
  };

  // ── 3. Same product already at the target? Merge qty + deactivate source. ─
  const { data: existingTarget, error: tgtErr } = await ctx.supabase
    .from("locations")
    .select("id, quantity")
    .eq("org_id", ctx.orgId)
    .eq("section_id", args.toSectionId)
    .eq("bay", args.toBay)
    .eq("level", args.toLevel)
    .eq("product_id", args.productId)
    .eq("is_active", true)
    .neq("id", source.id)
    .maybeSingle();
  if (tgtErr) return { error: tgtErr.message };

  if (existingTarget) {
    const newQty = (existingTarget.quantity ?? 0) + (source.quantity ?? 0);
    const { error: mergeErr } = await ctx.supabase
      .from("locations")
      .update({ quantity: newQty })
      .eq("id", existingTarget.id)
      .eq("org_id", ctx.orgId);
    if (mergeErr) return { error: mergeErr.message };
    const { error: deErr } = await ctx.supabase
      .from("locations")
      .update({ is_active: false })
      .eq("id", source.id)
      .eq("org_id", ctx.orgId);
    if (deErr) return { error: deErr.message };
  } else {
    // ── 4. Plain move — repoint section/bay/level on the source row. ─────
    const { error: moveErr } = await ctx.supabase
      .from("locations")
      .update({
        section_id: args.toSectionId,
        bay: args.toBay,
        level: args.toLevel,
      })
      .eq("id", source.id)
      .eq("org_id", ctx.orgId);
    if (moveErr) return { error: moveErr.message };
  }

  await writeRelocateAudit(ctx, {
    productId: args.productId,
    warehouseId: args.warehouseId,
    from,
    to,
    quantity: source.quantity ?? null,
  });

  revalidatePath("/analytics/slotting");
  revalidatePath(`/facilities/${args.warehouseId}`);
  revalidatePath(`/facilities/${args.warehouseId}/sections/${args.fromSectionId}`);
  revalidatePath(`/facilities/${args.warehouseId}/sections/${args.toSectionId}`);
  revalidateTag(tags.inventory(ctx.orgId));
  return { success: true };
}
