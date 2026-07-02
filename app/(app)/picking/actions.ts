"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { getEligibleOrders, WAVE_STATUSES } from "@/lib/data/picking";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

async function nextWaveCode(
  supabase: AnyClient,
  orgId: string
): Promise<string> {
  // Atomic per-org counter (no read-max race).
  const { data } = await supabase.rpc("next_document_number", {
    p_org_id: orgId,
    p_kind: "WAVE",
    p_prefix: "WAVE",
    p_pad: 4,
    p_start: 1,
  });
  return data as string;
}

/** Create a wave from a set of orders and attach them. Returns the wave id. */
async function createWave(
  supabase: AnyClient,
  orgId: string,
  userId: string,
  warehouseId: string,
  orderIds: string[]
): Promise<string | null> {
  if (orderIds.length === 0) return null;
  // The warehouse id is client-supplied — confirm it belongs to this org before
  // stamping a wave with it (covers both buildWave and autoBuildWave).
  const { data: wh } = await supabase
    .from("warehouses")
    .select("id")
    .eq("id", warehouseId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!wh) return null;
  const code = await nextWaveCode(supabase, orgId);
  const { data: wave, error } = await supabase
    .from("pick_waves")
    .insert({
      org_id: orgId,
      warehouse_id: warehouseId,
      code,
      status: "planned",
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !wave) return null;

  // Only attach orders still eligible (same facility, not already in a wave).
  await supabase
    .from("orders")
    .update({ pick_wave_id: wave.id })
    .in("id", orderIds)
    .eq("org_id", orgId)
    .eq("warehouse_id", warehouseId)
    .is("pick_wave_id", null);

  return wave.id as string;
}

export async function buildWave(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("picking.manage")) return;
  const warehouseId = String(formData.get("warehouse_id") ?? "");
  const orderIds = formData
    .getAll("order_id")
    .map(String)
    .filter(Boolean);
  if (!warehouseId || orderIds.length === 0) return;

  const waveId = await createWave(
    ctx.supabase,
    ctx.orgId,
    ctx.user.id,
    warehouseId,
    orderIds
  );
  revalidatePath("/picking");
  revalidatePath("/orders");
  if (waveId) redirect(`/picking/${waveId}`);
}

export async function autoBuildWave(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("picking.manage")) return;
  const warehouseId = String(formData.get("warehouse_id") ?? "");
  if (!warehouseId) return;

  const eligible = await getEligibleOrders(ctx.supabase, ctx.orgId, warehouseId);
  if (eligible.length === 0) {
    revalidatePath("/picking");
    return;
  }
  const waveId = await createWave(
    ctx.supabase,
    ctx.orgId,
    ctx.user.id,
    warehouseId,
    eligible.map((o) => o.id)
  );
  revalidatePath("/picking");
  revalidatePath("/orders");
  if (waveId) redirect(`/picking/${waveId}`);
}

export async function setWaveStatus(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("picking.manage")) return;
  const waveId = String(formData.get("wave_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!waveId || !(WAVE_STATUSES as readonly string[]).includes(status)) return;

  // Completion gate: don't let a wave be marked complete while it still has
  // allocated units that haven't been picked — that would present the batch as
  // done when stock was never pulled.
  if (status === "complete") {
    const { data: waveOrders } = await ctx.supabase
      .from("orders")
      .select("id")
      .eq("pick_wave_id", waveId)
      .eq("org_id", ctx.orgId);
    const orderIds = (waveOrders ?? []).map((o: { id: string }) => o.id);
    if (orderIds.length > 0) {
      const { data: itemRows } = await ctx.supabase
        .from("order_items")
        .select("quantity_allocated, quantity_picked")
        .in("order_id", orderIds);
      const allocated = (itemRows ?? []).reduce(
        (s: number, r: { quantity_allocated: number | null }) =>
          s + (r.quantity_allocated ?? 0),
        0
      );
      const picked = (itemRows ?? []).reduce(
        (s: number, r: { quantity_picked: number | null }) =>
          s + (r.quantity_picked ?? 0),
        0
      );
      if (picked < allocated) {
        redirect(
          `/picking/${waveId}?error=${encodeURIComponent(
            `Can't complete — ${picked} of ${allocated} allocated units picked.`
          )}`
        );
      }
    }
  }

  const { error } = await ctx.supabase
    .from("pick_waves")
    .update({ status })
    .eq("id", waveId)
    .eq("org_id", ctx.orgId);
  if (error) {
    redirect(
      `/picking/${waveId}?error=${encodeURIComponent(
        "Couldn't update the wave — please try again."
      )}`
    );
  }

  // Cancelling a wave releases its orders back to the eligible pool.
  if (status === "cancelled") {
    await ctx.supabase
      .from("orders")
      .update({ pick_wave_id: null })
      .eq("pick_wave_id", waveId)
      .eq("org_id", ctx.orgId);
  }

  revalidatePath(`/picking/${waveId}`);
  revalidatePath("/picking");
  revalidatePath("/orders");
}

/** Claim the wave (assign to the current user) or release it. */
export async function claimWave(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("picking.manage")) return;
  const waveId = String(formData.get("wave_id") ?? "");
  const release = String(formData.get("release") ?? "") === "1";
  if (!waveId) return;
  await ctx.supabase
    .from("pick_waves")
    .update({ assigned_to: release ? null : ctx.user.id })
    .eq("id", waveId)
    .eq("org_id", ctx.orgId);
  revalidatePath(`/picking/${waveId}`);
}

export async function removeOrderFromWave(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("picking.manage")) return;
  const waveId = String(formData.get("wave_id") ?? "");
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return;
  await ctx.supabase
    .from("orders")
    .update({ pick_wave_id: null })
    .eq("id", orderId)
    .eq("org_id", ctx.orgId);
  revalidatePath(`/picking/${waveId}`);
  revalidatePath("/picking");
  revalidatePath("/orders");
}
