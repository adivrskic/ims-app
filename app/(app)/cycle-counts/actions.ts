"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { tags } from "@/lib/cache-tags";
import { adjustmentNeedsApproval } from "@/lib/data/adjustments";
import { dispatchEvent } from "@/lib/integrations/dispatch";

/**
 * Record a cycle count.
 *
 * The count row insert AND its stock correction happen in ONE transaction via
 * the `app.record_cycle_count` RPC (under a row lock on the location), so a
 * partial failure can't leave the count and on-hand diverged. The RPC reads the
 * live expected qty under the lock — the intended "count against the current
 * baseline" behavior, so two operators can't cancel each other out.
 *
 * Governance is unchanged and shared with the manual section-grid edit: a
 * variance is committed immediately (via the RPC's drift-free write + a
 * scan_history 'adjust' audit row), OR queued as a stock_adjustment_request when
 * its magnitude exceeds the org threshold or the reason requires approval. The
 * commit-vs-queue decision is computed here (adjustmentNeedsApproval) and passed
 * into the RPC, keeping approval policy in one place.
 *
 * Cache: writes cycle_counts (→ cycleCounts tag) and, on a committed variance,
 * locations + scan_history (→ inventory tag) — busting inventory keeps the
 * cached Inventory list correct after a count adjustment.
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

  // Read the current qty to size the adjustment for the approval-gating decision
  // (the RPC re-reads authoritatively under lock for the actual write).
  const { data: location, error: locErr } = await ctx.supabase
    .from("locations")
    .select("product_id, quantity")
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

  const variance = countedQty - (location.quantity ?? 0);
  const needsApproval =
    variance !== 0 &&
    (await adjustmentNeedsApproval(ctx.supabase, ctx.orgId, reasonCode, variance));

  // One atomic call: insert the count + (commit | queue) the adjustment.
  const { data: rpcData, error: rpcErr } = await ctx.supabase.rpc(
    "record_cycle_count",
    {
      p_org_id: ctx.orgId,
      p_location_id: locationId,
      p_product_id: productId,
      p_counted_qty: countedQty,
      p_notes: notes || null,
      p_reason_code: reasonCode,
      p_counted_by: ctx.user.id,
      p_needs_approval: needsApproval,
    }
  );
  if (rpcErr) return { error: rpcErr.message };

  const res = (rpcData ?? {}) as {
    countId?: string;
    outcome?: "no_variance" | "queued" | "committed";
    variance?: number;
    expected?: number;
    error?: string;
  };
  if (res.error) {
    return {
      error:
        res.error === "product_mismatch"
          ? "Selected location holds a different product. Refresh and try again."
          : "Location not found",
    };
  }

  const v = res.variance ?? 0;
  const sign = v > 0 ? "+" : "";

  // Best-effort integration notification on a real variance.
  if (res.outcome !== "no_variance") {
    try {
      await dispatchEvent({
        type: "cycle_count_variance",
        org_id: ctx.orgId,
        title: `Cycle count variance: ${sign}${v}`,
        body: `Counted ${countedQty} vs expected ${res.expected ?? "?"} (Δ ${sign}${v}).`,
        link: `/inventory/${productId}`,
        data: {
          productId,
          locationId,
          expectedQty: res.expected,
          countedQty,
          variance: v,
          reasonCode,
        },
      });
    } catch {
      // dispatch swallows its own delivery errors; ignore the rest.
    }
  }

  revalidatePath("/cycle-counts");
  revalidateTag(tags.cycleCounts(ctx.orgId));

  if (res.outcome === "committed") {
    revalidatePath(`/inventory/${productId}`);
    revalidateTag(tags.inventory(ctx.orgId));
    return { success: `Count recorded — adjusted by ${sign}${v}`, id: res.countId };
  }
  if (res.outcome === "queued") {
    return {
      success: `Count recorded — adjustment of ${sign}${v} queued for approval`,
      id: res.countId,
    };
  }
  return { success: "Count recorded — no variance", id: res.countId };
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
