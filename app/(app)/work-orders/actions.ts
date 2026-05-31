"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { parseAssembleResult } from "@/lib/data/assemble";
import { WORK_ORDER_STATUSES } from "@/lib/data/workOrders";

async function nextWoCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string
): Promise<string> {
  const { data: last } = await supabase
    .from("work_orders")
    .select("code")
    .eq("org_id", orgId)
    .like("code", "WO-%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const n = last?.code?.match(/WO-(\d+)/)?.[1];
  const next = n ? parseInt(n, 10) + 1 : 1;
  return `WO-${String(next).padStart(4, "0")}`;
}

export async function createWorkOrder(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("work_orders.manage")) {
    return { error: "You don't have permission to manage work orders" };
  }

  const productId = String(formData.get("product_id") ?? "").trim();
  const warehouseId = String(formData.get("warehouse_id") ?? "").trim();
  const quantity = parseInt(String(formData.get("quantity") ?? "0"), 10);
  const notes = String(formData.get("notes") ?? "").trim();

  if (!productId) return { error: "Pick a kit to build" };
  if (!warehouseId) return { error: "Pick a facility" };
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: "Quantity must be a positive number" };
  }

  // Must be a kit with a BOM.
  const { data: product } = await ctx.supabase
    .from("products")
    .select("id, is_kit")
    .eq("id", productId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!product || !(product as { is_kit: boolean | null }).is_kit) {
    return { error: "That product isn't a kit" };
  }
  const { data: comps } = await ctx.supabase
    .from("kit_components")
    .select("component_product_id, quantity")
    .eq("org_id", ctx.orgId)
    .eq("kit_product_id", productId);
  const components = (comps ?? []) as Array<{
    component_product_id: string;
    quantity: number;
  }>;
  if (components.length === 0) {
    return { error: "Define the kit's bill of materials first" };
  }

  const code = await nextWoCode(ctx.supabase, ctx.orgId);
  const { data: wo, error } = await ctx.supabase
    .from("work_orders")
    .insert({
      org_id: ctx.orgId,
      warehouse_id: warehouseId,
      product_id: productId,
      quantity,
      code,
      status: "draft",
      notes: notes || null,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !wo) return { error: error?.message ?? "Failed to create" };

  // Snapshot the direct BOM as work order lines (required = per-unit × qty).
  const lineRows = components.map((c) => ({
    org_id: ctx.orgId,
    work_order_id: wo.id,
    component_product_id: c.component_product_id,
    quantity_required: c.quantity * quantity,
  }));
  const { error: linesErr } = await ctx.supabase
    .from("work_order_lines")
    .insert(lineRows);
  if (linesErr) {
    await ctx.supabase.from("work_orders").delete().eq("id", wo.id);
    return { error: `Failed to create lines: ${linesErr.message}` };
  }

  revalidatePath("/work-orders");
  redirect(`/work-orders/${wo.id}`);
}

export async function setWorkOrderStatus(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("work_orders.manage")) return;
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  // Completion has its own action (it mutates stock).
  if (
    !id ||
    status === "complete" ||
    !(WORK_ORDER_STATUSES as readonly string[]).includes(status)
  ) {
    return;
  }
  await ctx.supabase
    .from("work_orders")
    .update({ status })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath(`/work-orders/${id}`);
  revalidatePath("/work-orders");
}

export async function completeWorkOrder(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("work_orders.manage")) {
    return { error: "You don't have permission to manage work orders" };
  }
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing work order" };

  // Claim + assemble + record consumed atomically. The RPC wins the status race
  // (only one completer transitions an open WO) and rolls back the claim if the
  // build is short on stock.
  const { data, error } = await ctx.supabase.rpc("complete_work_order", {
    p_org_id: ctx.orgId,
    p_work_order_id: id,
  });
  if (error) return { error: error.message };

  const { consumed } = parseAssembleResult(data);
  const d = (data ?? {}) as { quantity?: number; product_id?: string };
  const quantity = d.quantity ?? 0;

  revalidatePath(`/work-orders/${id}`);
  revalidatePath("/work-orders");
  if (d.product_id) revalidatePath(`/inventory/${d.product_id}`);
  for (const componentId of consumed?.keys() ?? []) {
    revalidatePath(`/inventory/${componentId}`);
  }
  return { success: `Built ${quantity} unit${quantity === 1 ? "" : "s"}` };
}

export async function claimWorkOrder(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("work_orders.manage")) return;
  const id = String(formData.get("id") ?? "");
  const release = String(formData.get("release") ?? "") === "1";
  if (!id) return;
  await ctx.supabase
    .from("work_orders")
    .update({ assigned_to: release ? null : ctx.user.id })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath(`/work-orders/${id}`);
}
