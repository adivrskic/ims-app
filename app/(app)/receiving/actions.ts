"use server";

import { revalidatePath } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";

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

  revalidatePath("/receiving");
  if (poId) revalidatePath(`/purchase-orders/${poId}`);
}
