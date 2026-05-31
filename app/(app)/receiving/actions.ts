"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { tags } from "@/lib/cache-tags";

/**
 * Record a QC decision on a held PO line: pass (cleared for putaway) or fail
 * (rejected — flag for vendor return). po_line_items is PO-scoped, so RLS via
 * the parent PO governs the write; we still re-check the line is on hold.
 */
export async function reviewQcLine(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("qc.review")) return;

  const lineId = String(formData.get("line_id") ?? "");
  const poId = String(formData.get("po_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!lineId || (decision !== "pass" && decision !== "fail")) return;

  // Only act on a line that's actually on hold (guards double-review).
  const { data: line } = await ctx.supabase
    .from("po_line_items")
    .select("id, qc_status")
    .eq("id", lineId)
    .maybeSingle();
  if (!line || (line as { qc_status: string }).qc_status !== "hold") return;

  await ctx.supabase
    .from("po_line_items")
    .update({
      qc_status: decision === "pass" ? "passed" : "failed",
      qc_notes: notes || null,
      qc_at: new Date().toISOString(),
      qc_by: ctx.user.id,
    })
    .eq("id", lineId);

  // Resolve the quarantined on-hand this line landed (see receiveLineItem):
  //   pass → release it into available stock (clear the quarantine flag)
  //   fail → remove it from on-hand (soft-delete; flagged for vendor return)
  if (decision === "pass") {
    await ctx.supabase
      .from("locations")
      .update({ quarantined: false })
      .eq("po_line_id", lineId)
      .eq("org_id", ctx.orgId)
      .eq("quarantined", true);
  } else {
    await ctx.supabase
      .from("locations")
      .update({ is_active: false })
      .eq("po_line_id", lineId)
      .eq("org_id", ctx.orgId)
      .eq("quarantined", true);
  }

  revalidatePath("/receiving");
  if (poId) revalidatePath(`/purchase-orders/${poId}`);
  revalidateTag(tags.inventory(ctx.orgId));
}
