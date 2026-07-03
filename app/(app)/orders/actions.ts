"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { tags } from "@/lib/cache-tags";
import {
  allocateOrderInternal,
  releaseOrderAllocationInternal,
  fillBackordersInternal,
  OPEN_ORDER_STATUSES,
} from "@/lib/data/allocation";
import { RETURN_REASONS } from "./returnReasons";

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

  // Next order number — atomic per-org counter (no read-max race).
  const { data: orderNumber } = await ctx.supabase.rpc("next_document_number", {
    p_org_id: ctx.orgId,
    p_kind: "ORD",
    p_prefix: "ORD",
    p_pad: 0,
    p_start: 1049,
  });

  const { data: newOrder, error: orderErr } = await ctx.supabase
    .from("orders")
    .insert({
      org_id: ctx.orgId,
      warehouse_id: warehouseId,
      order_type: orderType,
      status: "created" as OrderStatus,
      order_number: orderNumber as string,
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
  if (!id) return;

  // Re-read the authoritative status server-side rather than trusting the
  // hidden field — a stale tab (or a double click) could otherwise advance
  // from the wrong base or skip a step.
  const { data: order } = await ctx.supabase
    .from("orders")
    .select("status")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!order) {
    redirect(`/orders/${id}?error=${encodeURIComponent("Order not found.")}`);
  }

  const current = order.status as OrderStatus;
  const next = NEXT_STATUS[current];
  if (!next) {
    redirect(
      `/orders/${id}?error=${encodeURIComponent(
        "This order can't be advanced from its current status."
      )}`
    );
  }

  // Pick-completion gate: an order can't be staged (or moved past it) until the
  // allocated stock has actually been picked. Without this, an order can leave
  // the pick flow with its reservation dropped — silently leaking promised
  // stock back into ATP while nothing was physically picked.
  if (current === "in_progress") {
    const { data: itemRows } = await ctx.supabase
      .from("order_items")
      .select("quantity_allocated, quantity_picked")
      .eq("order_id", id);
    const allocated = (itemRows ?? []).reduce(
      (s, r) => s + (r.quantity_allocated ?? 0),
      0
    );
    const picked = (itemRows ?? []).reduce(
      (s, r) => s + (r.quantity_picked ?? 0),
      0
    );
    if (allocated <= 0) {
      redirect(
        `/orders/${id}?error=${encodeURIComponent(
          "Nothing is allocated to pick yet — allocate stock before staging."
        )}`
      );
    }
    if (picked < allocated) {
      redirect(
        `/orders/${id}?error=${encodeURIComponent(
          `Picking isn't complete — ${picked} of ${allocated} allocated units picked.`
        )}`
      );
    }
  }

  const update: Record<string, unknown> = { status: next };
  // When assigning the pick list, mark the current user as the assignee
  if (next === "pick_list_assigned") {
    update.assigned_to = ctx.user.id;
  }

  const { error } = await ctx.supabase
    .from("orders")
    .update(update)
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  if (error) {
    redirect(
      `/orders/${id}?error=${encodeURIComponent(
        "Couldn't update the order — please try again."
      )}`
    );
  }

  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  revalidateTag(tags.orders(ctx.orgId));
}

export async function cancelOrder(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("orders.manage")) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Only OPEN orders can be cancelled — never flip a completed/shipped (or
  // already-cancelled) order, which would corrupt order history. The status
  // filter makes the update a no-op for those; detect it via the returned row.
  const { data: cancelled, error } = await ctx.supabase
    .from("orders")
    .update({ status: "cancelled" as OrderStatus })
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .in("status", OPEN_ORDER_STATUSES as unknown as string[])
    .select("id")
    .maybeSingle();
  if (error) {
    redirect(
      `/orders/${id}?error=${encodeURIComponent(
        "Couldn't cancel the order — please try again."
      )}`
    );
  }
  if (!cancelled) {
    redirect(
      `/orders/${id}?error=${encodeURIComponent(
        "This order can no longer be cancelled."
      )}`
    );
  }
  // Release the reservation so the unpicked stock returns to ATP for other
  // orders (already-picked units stay accounted for — see the internal).
  await releaseOrderAllocationInternal(ctx.supabase, ctx.orgId, id);
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

/**
 * Create a return from an order line at the desk.
 *
 * Historically returns were only logged at the receiving dock (mobile app);
 * this gives the desk the same entry point, anchored to the order. The row
 * lands in the returns queue as "Pending review" (reviewed_at null) with an
 * initial hold_for_inspection disposition — the standard desk review then
 * signs off restock / write-off / supplier RMA, and a signed-off restock is
 * credited back to on-hand via restockReturn (returns/actions.ts).
 *
 * Quantity is capped at units actually picked (what physically left the
 * building) minus what's already been returned against the same line.
 * Creating a return NEVER moves stock — that's the explicit restock step.
 */
export async function createReturnFromOrder(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("orders.manage")) {
    return { error: "You don't have permission to manage orders" };
  }

  const orderId = String(formData.get("order_id") ?? "").trim();
  const orderItemId = String(formData.get("order_item_id") ?? "").trim();
  const qtyRaw = String(formData.get("quantity") ?? "").trim();
  const reasonKey = String(formData.get("reason") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!orderId || !orderItemId) return { error: "Pick a line item" };
  const reason = RETURN_REASONS.find((r) => r.value === reasonKey);
  if (!reason) return { error: "Pick a reason" };
  const qty = parseInt(qtyRaw, 10);
  if (Number.isNaN(qty) || qty <= 0) {
    return { error: "Quantity must be a positive integer" };
  }

  // Order + line must be in this org; returns come off PICKED units.
  const { data: order } = await ctx.supabase
    .from("orders")
    .select("id, status, warehouse_id")
    .eq("id", orderId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!order) return { error: "Order not found" };
  if (order.status === "cancelled") {
    return { error: "Cancelled orders can't have returns" };
  }

  const { data: item } = await ctx.supabase
    .from("order_items")
    .select("id, product_id, quantity_picked")
    .eq("id", orderItemId)
    .eq("order_id", orderId)
    .maybeSingle();
  if (!item || !item.product_id) return { error: "Line item not found" };

  const picked = item.quantity_picked ?? 0;
  if (picked <= 0) {
    return { error: "Nothing has been picked on that line yet" };
  }

  // Cap at picked minus previously returned against this line.
  const { data: prior } = await ctx.supabase
    .from("returns")
    .select("quantity")
    .eq("org_id", ctx.orgId)
    .eq("order_item_id", orderItemId);
  const alreadyReturned = (prior ?? []).reduce(
    (s, r) => s + ((r as { quantity: number | null }).quantity ?? 0),
    0
  );
  const returnable = picked - alreadyReturned;
  if (qty > returnable) {
    return {
      error:
        returnable <= 0
          ? "That line has already been fully returned"
          : `Only ${returnable} of ${picked} picked unit${
              picked === 1 ? "" : "s"
            } can still be returned on that line`,
    };
  }

  const { error: insErr } = await ctx.supabase.from("returns").insert({
    org_id: ctx.orgId,
    warehouse_id: order.warehouse_id,
    product_id: item.product_id,
    order_id: orderId,
    order_item_id: orderItemId,
    quantity: qty,
    // Pending-review queue state: disposition is provisional until the desk
    // review signs it off; hold_for_inspection is the safe initial value.
    disposition: "hold_for_inspection",
    reason: notes ? `${reason.label} — ${notes}` : reason.label,
    received_by: ctx.user.id,
  });
  if (insErr) return { error: insErr.message };

  // Audit trail, matching the dock's 'return' scan rows.
  await ctx.supabase.from("scan_history").insert({
    org_id: ctx.orgId,
    product_id: item.product_id,
    warehouse_id: order.warehouse_id,
    scanned_by: ctx.user.id,
    action: "return",
    quantity: qty,
    notes: `Return logged at desk from order (${reason.label})`,
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/returns");
  revalidateTag(tags.returns(ctx.orgId));
  revalidateTag(tags.scans(ctx.orgId));

  return {
    success: `Return logged — ${qty} unit${
      qty === 1 ? "" : "s"
    } now pending review on the Returns page`,
  };
}
