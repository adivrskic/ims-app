"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { tags } from "@/lib/cache-tags";

/**
 * Review (disposition sign-off) for a return.
 *
 * Returns are LOGGED at the receiving dock (mobile app) with an initial
 * disposition; the desk review is the human sign-off that clears the
 * "Pending review" queue. The reviewer can confirm or correct the disposition
 * and add a note. This records the decision + a scan_history audit row — it
 * does NOT move stock (restock crediting happens at the dock/floor, consistent
 * with the rest of the suite's manual-putaway model).
 *
 * Gated on inventory.adjust (the receiving-desk permission members get by
 * default), org-scoped, and guards against double-review.
 */

const DISPOSITIONS = [
  "restock",
  "damaged",
  "hold_for_inspection",
  "supplier_return",
] as const;

export async function reviewReturn(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("inventory.adjust")) return;

  const id = String(formData.get("id") ?? "").trim();
  const disposition = String(formData.get("disposition") ?? "").trim();
  const notes = String(formData.get("review_notes") ?? "").trim();
  if (!id) return;
  if (!(DISPOSITIONS as readonly string[]).includes(disposition)) return;

  // Confirm the return is in this org and not already reviewed.
  const { data: ret } = await ctx.supabase
    .from("returns")
    .select("id, reviewed_at, product_id, warehouse_id, quantity")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!ret) return;
  if ((ret as { reviewed_at: string | null }).reviewed_at) return; // already reviewed

  const { error } = await ctx.supabase
    .from("returns")
    .update({
      disposition,
      review_notes: notes || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: ctx.user.id,
    })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  if (error) return;

  // Audit trail: log the disposition decision against the product.
  const r = ret as {
    product_id: string | null;
    warehouse_id: string | null;
    quantity: number | null;
  };
  if (r.product_id) {
    await ctx.supabase.from("scan_history").insert({
      org_id: ctx.orgId,
      product_id: r.product_id,
      warehouse_id: r.warehouse_id,
      scanned_by: ctx.user.id,
      action: "return",
      quantity: r.quantity ?? 0,
      notes: `Return reviewed → ${disposition}${notes ? `: ${notes}` : ""}`,
    });
  }

  revalidatePath("/returns");
  revalidateTag(tags.returns(ctx.orgId));
}
