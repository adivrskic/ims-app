"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { tags } from "@/lib/cache-tags";
import {
  DEFAULT_REASONS,
  approveAdjustmentInternal,
  rejectAdjustmentInternal,
} from "@/lib/data/adjustments";

function slugCode(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function seedDefaultReasons(): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("adjustments.approve")) return;
  const rows = DEFAULT_REASONS.map((r, i) => ({
    org_id: ctx.orgId,
    code: r.code,
    label: r.label,
    requires_approval: r.requires_approval,
    sort_order: i,
  }));
  // Ignore conflicts so re-seeding is safe.
  await ctx.supabase
    .from("adjustment_reasons")
    .upsert(rows, { onConflict: "org_id,code", ignoreDuplicates: true });
  revalidatePath("/settings/adjustments");
}

export async function addReason(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("adjustments.approve")) {
    return { error: "Only admins can manage reasons" };
  }
  const label = String(formData.get("label") ?? "").trim();
  const requiresApproval = String(formData.get("requires_approval") ?? "") === "on";
  if (!label) return { error: "Label is required" };
  const code = slugCode(label);
  if (!code) return { error: "Label must contain letters or numbers" };

  const { error } = await ctx.supabase.from("adjustment_reasons").insert({
    org_id: ctx.orgId,
    code,
    label,
    requires_approval: requiresApproval,
  });
  if (error) {
    if (error.code === "23505") return { error: "That reason already exists" };
    return { error: error.message };
  }
  revalidatePath("/settings/adjustments");
  return { success: "Reason added" };
}

export async function toggleReason(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("adjustments.approve")) return;
  const id = String(formData.get("id") ?? "");
  const field = String(formData.get("field") ?? "");
  const value = String(formData.get("value") ?? "") === "true";
  if (!id || (field !== "is_active" && field !== "requires_approval")) return;
  await ctx.supabase
    .from("adjustment_reasons")
    .update({ [field]: value })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath("/settings/adjustments");
}

export async function setApprovalThreshold(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("adjustments.approve")) return;
  const raw = String(formData.get("threshold") ?? "").trim();
  let threshold: number | null = null;
  if (raw !== "") {
    const n = parseInt(raw, 10);
    threshold = Number.isFinite(n) && n > 0 ? n : null;
  }
  await ctx.supabase
    .from("orgs")
    .update({ adjustment_approval_threshold: threshold })
    .eq("id", ctx.orgId);
  revalidatePath("/settings/adjustments");
}

export async function approveAdjustment(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("adjustments.approve")) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const r = await approveAdjustmentInternal(
    ctx.supabase,
    { orgId: ctx.orgId, userId: ctx.user.id },
    id
  );
  revalidatePath("/settings/adjustments");
  revalidateTag(tags.inventory(ctx.orgId));
  if (r.productId) revalidatePath(`/inventory/${r.productId}`);
}

export async function rejectAdjustment(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("adjustments.approve")) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await rejectAdjustmentInternal(
    ctx.supabase,
    { orgId: ctx.orgId, userId: ctx.user.id },
    id
  );
  revalidatePath("/settings/adjustments");
}
