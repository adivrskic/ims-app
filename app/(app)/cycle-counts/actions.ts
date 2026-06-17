"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { tags } from "@/lib/cache-tags";
import { applyOrQueueAdjustment } from "@/lib/data/adjustments";
import { dispatchEvent } from "@/lib/integrations/dispatch";

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
  if (!ctx.can("inventory.adjust")) {
    return { error: "You don't have permission to adjust inventory" };
  }

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

  // 2. If there's a variance, route it through the shared adjustment governance
  //    (the same path the manual section-grid edit uses): it commits via the
  //    drift-guarded RPC and writes the scan_history audit, OR queues the
  //    adjustment for an admin when the delta exceeds the org threshold or the
  //    chosen reason requires approval. This keeps cycle-count corrections under
  //    the same approval rules as every other stock adjustment — previously this
  //    path committed every variance immediately, bypassing approval entirely.
  if (variance !== 0) {
    // Notify integrations subscribed to cycle-count variances (best-effort).
    try {
      await dispatchEvent({
        type: "cycle_count_variance",
        org_id: ctx.orgId,
        title: `Cycle count variance: ${variance > 0 ? "+" : ""}${variance}`,
        body: `Counted ${countedQty} vs expected ${expectedQty} (Δ ${
          variance > 0 ? "+" : ""
        }${variance}).`,
        link: `/inventory/${productId}`,
        data: {
          productId,
          locationId,
          expectedQty,
          countedQty,
          variance,
          reasonCode,
        },
      });
    } catch {
      // dispatch swallows its own delivery errors; ignore the rest.
    }

    const result = await applyOrQueueAdjustment(
      ctx.supabase,
      { orgId: ctx.orgId, userId: ctx.user.id },
      {
        locationId,
        warehouseId: location.warehouse_id,
        productId,
        currentQty: expectedQty,
        requestedQty: countedQty,
        reasonCode,
        notes:
          notes && notes.length > 0
            ? `Cycle count adjustment: ${notes}`
            : "Cycle count adjustment",
      }
    );

    if (result.error) {
      // Count is recorded but the adjustment didn't apply (drift or insert
      // error). Leave status='recorded' so an admin can investigate.
      revalidatePath("/cycle-counts");
      revalidateTag(tags.cycleCounts(ctx.orgId));
      return {
        error: `Count recorded but adjustment failed: ${result.error}`,
        id: count.id,
      };
    }

    if (result.queued) {
      // Over threshold / reason requires approval — the variance is pending an
      // admin's decision and the location hasn't changed yet.
      revalidatePath("/cycle-counts");
      revalidateTag(tags.cycleCounts(ctx.orgId));
      return {
        success: `Count recorded — adjustment of ${
          variance > 0 ? "+" : ""
        }${variance} queued for approval`,
        id: count.id,
      };
    }

    // Committed: mark the count adjusted and bust the inventory cache.
    const { error: statusErr } = await ctx.supabase
      .from("cycle_counts")
      .update({ status: "adjusted" })
      .eq("id", count.id)
      .eq("org_id", ctx.orgId);
    if (statusErr) {
      console.error(
        `[recordCycleCount] status update failed for count ${count.id}:`,
        statusErr
      );
    }

    revalidatePath("/cycle-counts");
    revalidatePath(`/inventory/${productId}`);
    revalidateTag(tags.cycleCounts(ctx.orgId));
    revalidateTag(tags.inventory(ctx.orgId));
    return {
      success: `Count recorded — adjusted by ${
        variance > 0 ? "+" : ""
      }${variance}`,
      id: count.id,
    };
  }

  // No variance — record the count as evidence accuracy was verified.
  revalidatePath("/cycle-counts");
  revalidateTag(tags.cycleCounts(ctx.orgId));
  return { success: "Count recorded — no variance", id: count.id };
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
  if (!ctx.can("cycle_counts.void")) return;
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
