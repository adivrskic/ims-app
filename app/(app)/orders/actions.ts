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
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };

  const orderType = String(formData.get("order_type") ?? "installer_job");
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const customerPhone = String(formData.get("customer_phone") ?? "").trim();
  const customerAddress = String(formData.get("customer_address") ?? "").trim();
  const warehouseId = String(formData.get("warehouse_id") ?? "").trim();
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

  const lineRows = items.map((i) => ({
    order_id: newOrder.id,
    product_id: i.product_id,
    quantity_requested: i.quantity,
  }));

  const { error: itemsErr } = await ctx.supabase
    .from("order_items")
    .insert(lineRows);

  if (itemsErr) {
    // Roll back the order so we don't leave an orphan
    await ctx.supabase.from("orders").delete().eq("id", newOrder.id);
    return { error: `Failed to create line items: ${itemsErr.message}` };
  }

  revalidatePath("/orders");
  redirect(`/orders/${newOrder.id}`);
}

export async function advanceOrderStatus(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return;

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
}

export async function cancelOrder(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return;
  const id = String(formData.get("id") ?? "");
  await ctx.supabase
    .from("orders")
    .update({ status: "cancelled" as OrderStatus })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
}
