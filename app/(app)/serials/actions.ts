"use server";

import { revalidatePath } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import type { SerialStatus } from "@/types/db";

const VALID_STATUS: SerialStatus[] = [
  "in_stock",
  "shipped",
  "returned",
  "scrapped",
];
const MAX_BULK = 1000;

/**
 * Register one or many serial numbers for a serialized product (bulk paste,
 * separated by newlines/commas/spaces). Skips serials that already exist for
 * the product. Flips the product to serialized.
 */
export async function registerSerials(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };

  const productId = String(formData.get("product_id") ?? "").trim();
  const warehouseId = String(formData.get("warehouse_id") ?? "").trim();
  const raw = String(formData.get("serials") ?? "");

  if (!productId) return { error: "Pick a product" };

  const serials = Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  ).slice(0, MAX_BULK);
  if (serials.length === 0) return { error: "Enter at least one serial number" };

  const { data: product } = await ctx.supabase
    .from("products")
    .select("id, track_serials")
    .eq("id", productId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!product) return { error: "Product not found in this workspace" };

  // Skip serials already registered for this product.
  const { data: existing } = await ctx.supabase
    .from("serial_units")
    .select("serial_number")
    .eq("org_id", ctx.orgId)
    .eq("product_id", productId)
    .in("serial_number", serials);
  const taken = new Set(
    ((existing ?? []) as Array<{ serial_number: string }>).map(
      (r) => r.serial_number
    )
  );
  const fresh = serials.filter((s) => !taken.has(s));
  if (fresh.length === 0) {
    return { error: "All of those serials are already registered" };
  }

  const rows = fresh.map((serial_number) => ({
    org_id: ctx.orgId,
    product_id: productId,
    serial_number,
    status: "in_stock" as SerialStatus,
    warehouse_id: warehouseId || null,
    received_at: new Date().toISOString(),
    created_by: ctx.user.id,
  }));
  const { error } = await ctx.supabase.from("serial_units").insert(rows);
  if (error) return { error: error.message };

  if (!(product as { track_serials: boolean }).track_serials) {
    await ctx.supabase
      .from("products")
      .update({ track_serials: true })
      .eq("id", productId)
      .eq("org_id", ctx.orgId);
  }

  revalidatePath("/serials");
  revalidatePath(`/inventory/${productId}`);
  const skipped = serials.length - fresh.length;
  return {
    success: `Registered ${fresh.length} serial${fresh.length === 1 ? "" : "s"}${
      skipped > 0 ? ` · ${skipped} already existed` : ""
    }`,
  };
}

/** Change a serial unit's lifecycle status. */
export async function setSerialStatus(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as SerialStatus;
  if (!id || !VALID_STATUS.includes(status)) return;

  const update: Record<string, unknown> = { status };
  if (status === "shipped") update.shipped_at = new Date().toISOString();
  await ctx.supabase
    .from("serial_units")
    .update(update)
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath("/serials");
}

/** Delete a serial unit (registry correction). */
export async function deleteSerial(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await ctx.supabase
    .from("serial_units")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath("/serials");
}

/** Toggle a product's serialized opt-in. */
export async function setProductSerialTracking(
  formData: FormData
): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  const productId = String(formData.get("product_id") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!productId) return;
  await ctx.supabase
    .from("products")
    .update({ track_serials: enabled })
    .eq("id", productId)
    .eq("org_id", ctx.orgId);
  revalidatePath("/serials");
  revalidatePath(`/inventory/${productId}`);
}
