"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
    role: membership.role,
  };
}

export async function createProduct(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string; id?: string }> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };

  const barcode = String(formData.get("barcode") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const internal_sku = String(formData.get("internal_sku") ?? "").trim();
  const manufacturer = String(formData.get("manufacturer") ?? "").trim();
  const dimensions = String(formData.get("dimensions") ?? "").trim();
  const weight = String(formData.get("weight") ?? "").trim();
  const reorderPointRaw = String(formData.get("reorder_point") ?? "").trim();
  const category_id = String(formData.get("category_id") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!barcode) return { error: "Barcode is required" };
  if (!name) return { error: "Name is required" };

  const reorderPoint = reorderPointRaw ? parseInt(reorderPointRaw, 10) : 0;
  if (Number.isNaN(reorderPoint) || reorderPoint < 0) {
    return { error: "Reorder point must be a non-negative integer" };
  }

  const { data: newProduct, error } = await ctx.supabase
    .from("products")
    .insert({
      org_id: ctx.orgId,
      barcode,
      name,
      internal_sku: internal_sku || null,
      manufacturer: manufacturer || null,
      dimensions: dimensions || null,
      weight: weight || null,
      reorder_point: reorderPoint,
      category_id: category_id || null,
      notes: notes || null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.message.toLowerCase().includes("duplicate")) {
      return { error: `Barcode ${barcode} is already registered` };
    }
    return { error: error.message };
  }

  revalidatePath("/inventory");
  return { success: "Product registered", id: newProduct.id };
}
