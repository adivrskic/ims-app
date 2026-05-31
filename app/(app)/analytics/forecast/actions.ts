"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { tags } from "@/lib/cache-tags";

/**
 * Apply forecast-suggested reorder settings to a product. Feeds the existing
 * reorder-point / auto-draft-PO machinery with statistically-derived values.
 */
export async function applyForecastSettings(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;

  const productId = String(formData.get("product_id") ?? "").trim();
  if (!productId) return;

  const update: Record<string, number> = {};
  const ropRaw = String(formData.get("reorder_point") ?? "").trim();
  const ssRaw = String(formData.get("safety_stock") ?? "").trim();
  if (ropRaw !== "") {
    const n = parseInt(ropRaw, 10);
    if (Number.isFinite(n) && n >= 0) update.reorder_point = n;
  }
  if (ssRaw !== "") {
    const n = parseInt(ssRaw, 10);
    if (Number.isFinite(n) && n >= 0) update.safety_stock = n;
  }
  if (Object.keys(update).length === 0) return;

  await ctx.supabase
    .from("products")
    .update(update)
    .eq("id", productId)
    .eq("org_id", ctx.orgId);

  revalidatePath("/analytics/forecast");
  revalidatePath(`/inventory/${productId}`);
  revalidateTag(tags.products(ctx.orgId));
  revalidateTag(tags.inventory(ctx.orgId));
}
