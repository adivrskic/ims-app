"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tags } from "@/lib/cache-tags";

async function getOrgContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" as const };

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return { error: "No workspace" as const };
  return {
    supabase,
    user,
    orgId: membership.org_id as string,
    role: membership.role as "owner" | "admin" | "member",
  };
}

function parseOptionalNonNegInt(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed, 10);
  if (Number.isNaN(n) || n < 0) return undefined;
  return n;
}

export async function createSupplier(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string; id?: string }> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!["owner", "admin"].includes(ctx.role)) {
    return { error: "Only admins can create suppliers" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim();
  const contactPhone = String(formData.get("contact_phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const paymentTerms = String(formData.get("payment_terms") ?? "").trim();
  const leadTimeRaw = String(formData.get("default_lead_time_days") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) return { error: "Name is required" };

  const leadTime = parseOptionalNonNegInt(leadTimeRaw);
  if (leadTime === undefined) {
    return { error: "Default lead time must be a non-negative integer" };
  }

  const { data, error } = await ctx.supabase
    .from("suppliers")
    .insert({
      org_id: ctx.orgId,
      name,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      address: address || null,
      payment_terms: paymentTerms || null,
      default_lead_time_days: leadTime,
      notes: notes || null,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.message.toLowerCase().includes("duplicate")) {
      return { error: `A supplier named "${name}" already exists` };
    }
    return { error: error.message };
  }

  revalidateTag(tags.suppliers(ctx.orgId));
  revalidatePath("/settings/suppliers");
  revalidatePath("/purchase-orders/new");
  revalidatePath("/inventory");
  return { success: "Supplier created", id: data.id };
}

export async function archiveSupplier(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return;
  if (!["owner", "admin"].includes(ctx.role)) return;
  const id = String(formData.get("id") ?? "");
  await ctx.supabase
    .from("suppliers")
    .update({ is_active: false })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidateTag(tags.suppliers(ctx.orgId));
  revalidatePath("/settings/suppliers");
  revalidatePath("/purchase-orders/new");
}

export async function restoreSupplier(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return;
  if (!["owner", "admin"].includes(ctx.role)) return;
  const id = String(formData.get("id") ?? "");
  await ctx.supabase
    .from("suppliers")
    .update({ is_active: true })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidateTag(tags.suppliers(ctx.orgId));
  revalidatePath("/settings/suppliers");
  revalidatePath("/purchase-orders/new");
}
