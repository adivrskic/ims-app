"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { tags } from "@/lib/cache-tags";
import {
  allocateOrderInternal,
  releaseOrderAllocationInternal,
  fillBackordersInternal,
} from "@/lib/data/allocation";

type OrderStatus =
  | "created"
  | "pick_list_assigned"
  | "in_progress"
  | "staged"
  | "ready"
  | "out_for_delivery"
  | "complete"
  | "cancelled";

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  created: "pick_list_assigned",
  pick_list_assigned: "in_progress",
  in_progress: "staged",
  staged: "ready",
  ready: "out_for_delivery",
  out_for_delivery: "complete",
};

interface LineItemInput {
  product_id: string;
  quantity: number;
}

export async function createOrder(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string; id?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("orders.manage")) {
    return { error: "You don't have permission to manage orders" };
  }

  const orderType = String(formData.get("order_type") ?? "installer_job");
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const customerPhone = String(formData.get("customer_phone") ?? "").trim();
  const customerAddress = String(formData.get("customer_address") ?? "").trim();
  const warehouseId = String(formData.get("warehouse_id") ?? "").trim();
  const destinationWarehouseId = String(
    formData.get("destination_warehouse_id") ?? ""
  ).trim();
  const deliveryDate = String(formData.get("delivery_date") ?? "").trim();
  const deliveryWindow = String(formData.get("delivery_window") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const itemsJson = String(formData.get("items") ?? "[]");

  if (!warehouseId) return { error: "Pick a facility" };

  let items: LineItemInput[] = [];
  try {
    const parsed = JSON.parse(itemsJson);
    if (!Array.isArray(parsed)) throw new Error("items must be an array");
    items = parsed
      .filter(
        (i: unknown): i is LineItemInput =>
          typeof i === "object" &&
          i !== null &&
          typeof (i as LineItemInput).product_id === "string" &&
          typeof (i as LineItemInput).quantity === "number"
      )
      .filter((i) => i.product_id.length > 0 && i.quantity > 0);
  } catch {
    return { error: "Invalid line items" };
  }

  if (items.length === 0) return { error: "Add at least one line item" };

  // Validate order_type
  const VALID_TYPES = [
    "installer_job",
    "customer_pickup",
    "internal_transfer",
    "restock",
  ];
  if (!VALID_TYPES.includes(orderType)) return { error: "Invalid order type" };

  // For customer-facing orders, require a name
  if (
    (orderType === "installer_job" || orderType === "customer_pickup") &&
    !customerName
  ) {
    return {
      error: "Customer name is required for installer jobs and pickups",
    };
  }

  // Transfers move stock between facilities — require a distinct destination.
  if (orderType === "internal_transfer") {
    if (!destinationWarehouseId) {
      return { error: "Pick a destination facility for the transfer" };
    }
    if (destinationWarehouseId === warehouseId) {
      return { error: "Source and destination facilities must be different" };
    }
  }

  // Generate next order number
  const { data: lastOrder } = await ctx.supabase
    .from("orders")
    .select("order_number")
    .like("order_number", "ORD-%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastNum = lastOrder?.order_number?.match(/ORD-(\d+)/)?.[1];
  const nextNum = lastNum ? parseInt(lastNum, 10) + 1 : 1049;

  const { data: newOrder, error: orderErr } = await ctx.supabase
    .from("orders")
    .insert({
      org_id: ctx.orgId,
      warehouse_id: warehouseId,
      order_type: orderType,
      status: "created" as OrderStatus,
      order_number: `ORD-${nextNum}`,
      destination_warehouse_id:
        orderType === "internal_transfer" ? destinationWarehouseId : null,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      customer_address: customerAddress || null,
      delivery_date: deliveryDate || null,
      delivery_window: deliveryWindow || null,
      notes: notes || null,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (orderErr || !newOrder) {
    return { error: orderErr?.message ?? "Failed to create order" };
  }

  // Explode any kit lines into their components so the pick list is
  // component-level (ordering 2× a kit requests 2× each component). Non-kit
  // lines pass through unchanged; quantities for the same product are merged.
  const orderedIds = items.map((i) => i.product_id);
  const { data: kitProductsData } = await ctx.supabase
    .from("products")
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("is_kit", true)
    .in("id", orderedIds);
  const kitIds = new Set(
    ((kitProductsData ?? []) as Array<{ id: string }>).map((k) => k.id)
  );

  const bomByKit = new Map<
    string,
    Array<{ component_product_id: string; quantity: number }>
  >();
  if (kitIds.size > 0) {
    const { data: boms } = await ctx.supabase
      .from("kit_components")
      .select("kit_product_id, component_product_id, quantity")
      .eq("org_id", ctx.orgId)
      .in("kit_product_id", [...kitIds]);
    for (const b of (boms ?? []) as Array<{
      kit_product_id: string;
      component_product_id: string;
      quantity: number;
    }>) {
      const arr = bomByKit.get(b.kit_product_id) ?? [];
      arr.push({
        component_product_id: b.component_product_id,
        quantity: b.quantity,
      });
      bomByKit.set(b.kit_product_id, arr);
    }
  }

  const expanded = new Map<string, number>();
  for (const i of items) {
    const bom = bomByKit.get(i.product_id);
    if (kitIds.has(i.product_id) && bom && bom.length > 0) {
      for (const c of bom) {
        expanded.set(
          c.component_product_id,
          (expanded.get(c.component_product_id) ?? 0) + c.quantity * i.quantity
        );
      }
    } else {
      expanded.set(
        i.product_id,
        (expanded.get(i.product_id) ?? 0) + i.quantity
      );
    }
  }

  const lineRows = [...expanded.entries()].map(([product_id, quantity]) => ({
    order_id: newOrder.id,
    product_id,
    quantity_requested: quantity,
  }));

  const { error: itemsErr } = await ctx.supabase
    .from("order_items")
    .insert(lineRows);

  if (itemsErr) {
    // Roll back the order so we don't leave an orphan
    await ctx.supabase.from("orders").delete().eq("id", newOrder.id);
    return { error: `Failed to create line items: ${itemsErr.message}` };
  }

  // Auto-allocate available stock to the new order (best-effort — a failure
  // here must not block order creation; the desk can re-allocate manually).
  try {
    await allocateOrderInternal(ctx.supabase, ctx.orgId, newOrder.id);
  } catch (e) {
    console.error("auto-allocate on create failed:", e);
  }

  revalidatePath("/orders");
  revalidateTag(tags.orders(ctx.orgId));
  revalidateTag(tags.inventory(ctx.orgId));
  redirect(`/orders/${newOrder.id}`);
}

export async function advanceOrderStatus(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("orders.manage")) return;

  const id = String(formData.get("id") ?? "");
  const currentStatus = String(
    formData.get("current_status") ?? ""
  ) as OrderStatus;
  const next = NEXT_STATUS[currentStatus];
  if (!next) return;

  const update: Record<string, unknown> = { status: next };
  // When assigning the pick list, mark the current user as the assignee
  if (next === "pick_list_assigned") {
    update.assigned_to = ctx.user.id;
  }

  await ctx.supabase
    .from("orders")
    .update(update)
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  revalidateTag(tags.orders(ctx.orgId));
}

export async function cancelOrder(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("orders.manage")) return;
  const id = String(formData.get("id") ?? "");
  await ctx.supabase
    .from("orders")
    .update({ status: "cancelled" as OrderStatus })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  // Release the reservation so the stock returns to ATP for other orders.
  await releaseOrderAllocationInternal(ctx.supabase, id);
  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  revalidateTag(tags.orders(ctx.orgId));
  revalidateTag(tags.inventory(ctx.orgId));
}

/** Manual re-allocate from the order detail page. */
export async function allocateOrder(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("orders.allocate")) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await allocateOrderInternal(ctx.supabase, ctx.orgId, id);
  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  revalidateTag(tags.orders(ctx.orgId));
  revalidateTag(tags.inventory(ctx.orgId));
}

/** Fill the oldest backorders for a product from newly-available stock. */
export async function fillBackorders(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("orders.allocate")) return;
  const warehouseId = String(formData.get("warehouse_id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const poId = String(formData.get("po_id") ?? "");
  if (!warehouseId || !productId) return;
  await fillBackordersInternal(ctx.supabase, ctx.orgId, warehouseId, productId);
  if (poId) revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath("/orders");
  revalidateTag(tags.orders(ctx.orgId));
  revalidateTag(tags.inventory(ctx.orgId));
}
