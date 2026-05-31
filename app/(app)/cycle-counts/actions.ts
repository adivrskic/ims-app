"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { tags } from "@/lib/cache-tags";

/**
 * Record a cycle count.
 *
 * Flow:
 *   1. Read the target location to get current expected quantity
 *   2. Insert cycle_counts row (variance is generated server-side)
 *   3. If variance != 0:
 *        a. Update locations.quantity → counted_qty
 *        b. Write a scan_history row (action='adjust') for the audit trail
 *        c. Update cycle_counts.status='adjusted'
 *
 * If counted_qty equals current quantity, we still record the count (so we
 * have evidence accuracy was verified) but don't write an adjustment.
 *
 * Important: we read the location's CURRENT qty (not whatever the user might
 * have eyeballed on a stale UI). This prevents two operators recording
 * counts on different baselines from cancelling each other out.
 *
 * Cache: this writes cycle_counts (→ cycleCounts tag) and, when there's a
 * variance, locations + scan_history (→ inventory tag). Busting the inventory
 * tag is what keeps the cached Inventory list correct after a count
 * adjustment — this is part of sealing Inventory's write path.
 */
export async function recordCycleCount(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string; id?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };

  const locationId = String(formData.get("location_id") ?? "").trim();
  const productId = String(formData.get("product_id") ?? "").trim();
  const countedRaw = String(formData.get("counted_qty") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const reasonCode = String(formData.get("reason_code") ?? "").trim() || null;

  if (!locationId) return { error: "Pick a location" };
  if (!productId) return { error: "Pick a product" };
  if (!countedRaw) return { error: "Enter the counted quantity" };

  const countedQty = parseInt(countedRaw, 10);
  if (Number.isNaN(countedQty) || countedQty < 0) {
    return { error: "Counted quantity must be a non-negative integer" };
  }

  // Fetch the current location state. Confirms the location exists,
  // matches the product, and gives us the expected qty in a single
  // race-free read.
  const { data: location, error: locErr } = await ctx.supabase
    .from("locations")
    .select("id, product_id, warehouse_id, quantity")
    .eq("id", locationId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (locErr || !location) {
    return { error: "Location not found" };
  }
  if (location.product_id !== productId) {
    return {
      error:
        "Selected location holds a different product. Refresh and try again.",
    };
  }

  const expectedQty = location.quantity ?? 0;
  const variance = countedQty - expectedQty;

  // 1. Insert the count
  const { data: count, error: countErr } = await ctx.supabase
    .from("cycle_counts")
    .insert({
      org_id: ctx.orgId,
      product_id: productId,
      location_id: locationId,
      warehouse_id: location.warehouse_id,
      expected_qty: expectedQty,
      counted_qty: countedQty,
      notes: notes || null,
      reason_code: reasonCode,
      counted_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (countErr || !count) {
    return { error: countErr?.message ?? "Failed to record count" };
  }

  // 2. If there's a variance, apply the adjustment
  if (variance !== 0) {
    const { error: locUpdateErr } = await ctx.supabase
      .from("locations")
      .update({ quantity: countedQty })
      .eq("id", locationId);

    if (locUpdateErr) {
      // We've recorded the count but couldn't apply the adjustment.
      // Leave status='recorded' so an admin can investigate. The count
      // row exists, so bust the cycleCounts tag; the location did NOT
      // change, so leave the inventory tag alone.
      revalidatePath("/cycle-counts");
      revalidateTag(tags.cycleCounts(ctx.orgId));
      return {
        error: `Count recorded but adjustment failed: ${locUpdateErr.message}`,
        id: count.id,
      };
    }

    // Audit trail. quantity is the signed delta so downstream consumers
    // (mobile app, analytics) can reconstruct what changed. The adjustment
    // already applied, so a failed audit insert shouldn't roll anything back —
    // but log it so a gap in the trail is visible rather than silent.
    const { error: auditErr } = await ctx.supabase
      .from("scan_history")
      .insert({
        org_id: ctx.orgId,
        product_id: productId,
        warehouse_id: location.warehouse_id,
        scanned_by: ctx.user.id,
        action: "adjust",
        quantity: variance,
        notes:
          notes && notes.length > 0
            ? `Cycle count adjustment: ${notes}`
            : "Cycle count adjustment",
      });
    if (auditErr) {
      console.error(
        `[recordCycleCount] audit insert failed for count ${count.id}:`,
        auditErr
      );
    }

    const { error: statusErr } = await ctx.supabase
      .from("cycle_counts")
      .update({ status: "adjusted" })
      .eq("id", count.id);
    if (statusErr) {
      console.error(
        `[recordCycleCount] status update failed for count ${count.id}:`,
        statusErr
      );
    }
  }

  revalidatePath("/cycle-counts");
  revalidatePath(`/inventory/${productId}`);
  // Always bust cycleCounts (a count row was created). Bust inventory only
  // when a variance actually changed a location's on-hand quantity.
  revalidateTag(tags.cycleCounts(ctx.orgId));
  if (variance !== 0) {
    revalidateTag(tags.inventory(ctx.orgId));
  }
  return {
    success:
      variance === 0
        ? "Count recorded — no variance"
        : `Count recorded — adjusted by ${variance > 0 ? "+" : ""}${variance}`,
    id: count.id,
  };
}

/**
 * Void a previously recorded count. Admin-only. Doesn't undo the
 * adjustment — that would require an offsetting count, which the user
 * can record manually. This just marks the row as voided so it's
 * excluded from accuracy reports.
 */
export async function voidCycleCount(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!["owner", "admin"].includes(ctx.role)) return;
  const id = String(formData.get("id") ?? "");
  await ctx.supabase
    .from("cycle_counts")
    .update({ status: "voided" })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath("/cycle-counts");
  // Voiding changes accuracy stats but not any location's on-hand, so only
  // the cycleCounts tag needs busting.
  revalidateTag(tags.cycleCounts(ctx.orgId));
}
