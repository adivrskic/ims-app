"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { tags } from "@/lib/cache-tags";

/**
 * Review (disposition sign-off) + restock for a return.
 *
 * Returns are logged either at the receiving dock (mobile app) or from an
 * order's detail page at the desk (createReturnFromOrder in orders/actions),
 * with an initial disposition; the desk review is the human sign-off that
 * clears the "Pending review" queue. The reviewer can confirm or correct the
 * disposition and add a note. Reviewing records the decision + a scan_history
 * audit row — it does NOT move stock.
 *
 * Stock movement is the separate, explicit restockReturn step below: once a
 * return is signed off as "restock", the reviewer picks a destination
 * location and the app.restock_return RPC atomically credits on-hand,
 * writes the audit row, and stamps the return restocked (all under row
 * locks, same shape as app.record_cycle_count).
 *
 * Both are gated on inventory.adjust (the receiving-desk permission members
 * get by default), org-scoped, and guarded against double-review /
 * double-restock.
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

/** app.restock_return error codes → operator-readable messages. */
const RESTOCK_ERRORS: Record<string, string> = {
  return_not_found: "Return not found",
  already_restocked: "This return was already restocked",
  not_restockable:
    "Only reviewed returns with a Restock disposition can be restocked",
  no_product: "This return isn't tied to a product",
  invalid_qty: "Quantity must be between 1 and the returned quantity",
  location_not_found: "Destination location not found",
  location_unavailable: "Destination location is inactive or quarantined",
  warehouse_mismatch:
    "Destination must be in the facility the return was received at",
  location_holds_other_product:
    "Destination location holds a different product",
};

/**
 * Credit an accepted return back to on-hand.
 *
 * All validation + the write happen atomically in the app.restock_return RPC
 * (return row + destination location locked; increments locations.quantity,
 * writes a scan_history 'return' audit row, stamps the return restocked).
 * This action just gates, parses, and translates the jsonb result.
 */
export async function restockReturn(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("inventory.adjust")) {
    return { error: "You don't have permission to adjust inventory" };
  }

  const returnId = String(formData.get("id") ?? "").trim();
  const locationId = String(formData.get("location_id") ?? "").trim();
  const qtyRaw = String(formData.get("quantity") ?? "").trim();
  if (!returnId) return { error: "Missing return id" };
  if (!locationId) return { error: "Pick a destination location" };

  const qty = parseInt(qtyRaw, 10);
  if (Number.isNaN(qty) || qty <= 0) {
    return { error: "Quantity must be a positive integer" };
  }

  const { data: rpcData, error: rpcErr } = await ctx.supabase.rpc(
    "restock_return",
    {
      p_org_id: ctx.orgId,
      p_return_id: returnId,
      p_location_id: locationId,
      p_qty: qty,
      p_by: ctx.user.id,
    }
  );
  if (rpcErr) return { error: rpcErr.message };

  const res = (rpcData ?? {}) as {
    ok?: boolean;
    error?: string;
    productId?: string;
    quantity?: number;
    newLocationQty?: number;
  };
  if (res.error || !res.ok) {
    return {
      error: RESTOCK_ERRORS[res.error ?? ""] ?? "Restock failed",
    };
  }

  revalidatePath("/returns");
  revalidateTag(tags.returns(ctx.orgId));
  // The location quantity changed → cached inventory views are stale.
  revalidateTag(tags.inventory(ctx.orgId));
  if (res.productId) revalidatePath(`/inventory/${res.productId}`);

  return {
    success: `Restocked ${res.quantity ?? qty} unit${
      (res.quantity ?? qty) === 1 ? "" : "s"
    } — location now holds ${res.newLocationQty ?? "?"}`,
  };
}
