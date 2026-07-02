"use server";

import { revalidatePath } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";

/**
 * Resolve a Shopify stub product: either remap its flagged order lines onto a
 * real catalog product, or confirm the stub as a genuine product. Both clear
 * `order_items.needs_mapping`. Gated on `integrations.manage`; all writes go
 * through the RLS-scoped client, and product ownership is re-checked by org.
 */

export async function mapToExistingProduct(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("integrations.manage")) return;

  const stubId = String(formData.get("stub_product_id") ?? "");
  const targetId = String(formData.get("target_product_id") ?? "");
  if (!stubId || !targetId || stubId === targetId) return;

  // Both products must belong to the caller's org (RLS-scoped read).
  const { data: prods } = await ctx.supabase
    .from("products")
    .select("id")
    .eq("org_id", ctx.orgId)
    .in("id", [stubId, targetId]);
  const ids = new Set(((prods ?? []) as Array<{ id: string }>).map((p) => p.id));
  if (!ids.has(stubId) || !ids.has(targetId)) return;

  // Reassign every flagged line off the stub onto the real product.
  await ctx.supabase
    .from("order_items")
    .update({ product_id: targetId, needs_mapping: false })
    .eq("product_id", stubId)
    .eq("needs_mapping", true);

  // If nothing references the stub anymore, delete it (best-effort cleanup).
  const { count } = await ctx.supabase
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", stubId);
  if ((count ?? 0) === 0) {
    await ctx.supabase
      .from("products")
      .delete()
      .eq("id", stubId)
      .eq("org_id", ctx.orgId);
  }

  revalidatePath("/integrations/shopify/mapping");
  revalidatePath("/integrations/shopify");
}

export async function keepStubAsProduct(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("integrations.manage")) return;

  const stubId = String(formData.get("stub_product_id") ?? "");
  if (!stubId) return;

  const { data: prod } = await ctx.supabase
    .from("products")
    .select("id")
    .eq("id", stubId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!prod) return;

  // Clear the review flag on its lines and mark the product confirmed.
  await ctx.supabase
    .from("order_items")
    .update({ needs_mapping: false })
    .eq("product_id", stubId)
    .eq("needs_mapping", true);
  await ctx.supabase
    .from("products")
    .update({ notes: "Confirmed from Shopify import" })
    .eq("id", stubId)
    .eq("org_id", ctx.orgId);

  revalidatePath("/integrations/shopify/mapping");
  revalidatePath("/integrations/shopify");
}
