"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { tags } from "@/lib/cache-tags";

/**
 * Helper: parse an optional non-negative integer form field. Returns null
 * for empty values, undefined for invalid ones (so the caller can return
 * an error).
 */
function parseOptionalNonNegInt(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed, 10);
  if (Number.isNaN(n) || n < 0) return undefined;
  return n;
}

/**
 * Helper: parse an optional non-negative numeric (price). Returns null for
 * empty, undefined for invalid, otherwise a string formatted to 2dp (so
 * we send a deterministic value to numeric(12,2) and don't depend on the
 * client's locale formatting).
 */
function parseOptionalNonNegMoney(raw: string): string | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Strip currency symbols and thousands separators the user might paste in.
  const cleaned = trimmed.replace(/[$,\s]/g, "");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n.toFixed(2);
}

export async function createProduct(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string; id?: string }> {
  const ctx = await getActionContext();
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

  // ── P1 new fields ────────────────────────────────────────────────────────
  const unitCostRaw = String(formData.get("unit_cost") ?? "");
  const leadTimeRaw = String(formData.get("lead_time_days") ?? "");
  const safetyStockRaw = String(formData.get("safety_stock") ?? "");
  const preferredSupplierId = String(
    formData.get("preferred_supplier_id") ?? ""
  ).trim();

  if (!barcode) return { error: "Barcode is required" };
  if (!name) return { error: "Name is required" };

  const reorderPoint = reorderPointRaw ? parseInt(reorderPointRaw, 10) : 0;
  if (Number.isNaN(reorderPoint) || reorderPoint < 0) {
    return { error: "Reorder point must be a non-negative integer" };
  }

  const unitCost = parseOptionalNonNegMoney(unitCostRaw);
  if (unitCost === undefined) {
    return { error: "Unit cost must be a non-negative number" };
  }

  const leadTime = parseOptionalNonNegInt(leadTimeRaw);
  if (leadTime === undefined) {
    return { error: "Lead time must be a non-negative integer (days)" };
  }

  const safetyStock = parseOptionalNonNegInt(safetyStockRaw);
  if (safetyStock === undefined) {
    return { error: "Safety stock must be a non-negative integer" };
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
      // P1 financial / replenishment fields
      unit_cost: unitCost, // null or "12.34"
      lead_time_days: leadTime, // null or non-negative int
      safety_stock: safetyStock ?? 0,
      preferred_supplier_id: preferredSupplierId || null,
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
  revalidateTag(tags.products(ctx.orgId));
  return { success: "Product registered", id: newProduct.id };
}
