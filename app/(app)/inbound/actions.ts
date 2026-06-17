"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { tags } from "@/lib/cache-tags";
import { dispatchEvent } from "@/lib/integrations/dispatch";

/**
 * ASN (Advance Ship Notice) actions. Creating/cancelling an ASN is purchasing
 * planning (purchasing.manage); recording receipt against it is a receiving
 * action (purchasing.receive). Receiving an ASN line reconciles against a linked
 * PO line (bumps quantity_received + recomputes PO status) but, like the rest of
 * the suite, does NOT create on-hand — physical putaway does that.
 */

interface AsnLineInput {
  product_id: string | null;
  product_name?: string | null;
  quantity: number;
  lpn?: string | null;
  lot_number?: string | null;
}

async function recomputePoStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  poId: string
): Promise<void> {
  const { data: allLines } = await supabase
    .from("po_line_items")
    .select("quantity_expected, quantity_received")
    .eq("po_id", poId);
  const ls = (allLines ?? []) as Array<{
    quantity_expected: number;
    quantity_received: number | null;
  }>;
  if (ls.length === 0) return;
  const allReceived = ls.every(
    (l) => (l.quantity_received ?? 0) >= l.quantity_expected
  );
  const anyReceived = ls.some((l) => (l.quantity_received ?? 0) > 0);
  const status = allReceived
    ? "fully_received"
    : anyReceived
    ? "partially_received"
    : "sent";
  const update: Record<string, unknown> = { status };
  if (status === "fully_received") {
    const { data: po } = await supabase
      .from("purchase_orders")
      .select("received_at")
      .eq("id", poId)
      .maybeSingle();
    if (!po?.received_at) update.received_at = new Date().toISOString();
  }
  await supabase
    .from("purchase_orders")
    .update(update)
    .eq("id", poId)
    .eq("org_id", orgId);
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createAsn(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("purchasing.manage")) {
    return { error: "You don't have permission to manage inbound shipments" };
  }

  const supplierId = String(formData.get("supplier_id") ?? "").trim();
  const warehouseId = String(formData.get("warehouse_id") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const carrier = String(formData.get("carrier") ?? "").trim();
  const tracking = String(formData.get("tracking_number") ?? "").trim();
  const expectedDate = String(formData.get("expected_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const itemsJson = String(formData.get("items") ?? "[]");

  let items: AsnLineInput[] = [];
  try {
    const parsed = JSON.parse(itemsJson);
    if (!Array.isArray(parsed)) throw new Error("items");
    items = parsed
      .filter(
        (i: unknown): i is AsnLineInput =>
          typeof i === "object" && i !== null &&
          typeof (i as AsnLineInput).quantity === "number"
      )
      .filter((i) => i.quantity > 0);
  } catch {
    return { error: "Invalid line items" };
  }
  if (items.length === 0) return { error: "Add at least one line item" };

  // Validate the optional supplier/facility belong to this org — don't trust
  // the form to attach an ASN to an arbitrary (possibly cross-org) id.
  if (supplierId) {
    const { data: s } = await ctx.supabase
      .from("suppliers")
      .select("id")
      .eq("id", supplierId)
      .eq("org_id", ctx.orgId)
      .maybeSingle();
    if (!s) return { error: "Supplier not found in this workspace" };
  }
  if (warehouseId) {
    const { data: w } = await ctx.supabase
      .from("warehouses")
      .select("id")
      .eq("id", warehouseId)
      .eq("org_id", ctx.orgId)
      .maybeSingle();
    if (!w) return { error: "Facility not found in this workspace" };
  }

  // Validate any product references on the lines belong to this org, then drop
  // unknown ids back to null (free-text name still carries the line).
  const lineProductIds = Array.from(
    new Set(items.map((i) => i.product_id).filter((v): v is string => !!v))
  );
  let validProductIds = new Set<string>();
  if (lineProductIds.length > 0) {
    const { data: prods } = await ctx.supabase
      .from("products")
      .select("id")
      .eq("org_id", ctx.orgId)
      .in("id", lineProductIds);
    validProductIds = new Set(
      ((prods ?? []) as Array<{ id: string }>).map((p) => p.id)
    );
  }

  const { data: asnNumber } = await ctx.supabase.rpc("next_document_number", {
    p_org_id: ctx.orgId,
    p_kind: "ASN",
    p_prefix: "ASN",
    p_pad: 4,
    p_start: 1,
  });

  const { data: asn, error } = await ctx.supabase
    .from("asns")
    .insert({
      org_id: ctx.orgId,
      asn_number: asnNumber as string,
      reference: reference || null,
      supplier_id: supplierId || null,
      warehouse_id: warehouseId || null,
      carrier: carrier || null,
      tracking_number: tracking || null,
      expected_date: expectedDate || null,
      notes: notes || null,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !asn) return { error: error?.message ?? "Failed to create ASN" };

  const lineRows = items.map((i) => ({
    org_id: ctx.orgId,
    asn_id: asn.id,
    product_id:
      i.product_id && validProductIds.has(i.product_id) ? i.product_id : null,
    product_name: i.product_name || null,
    quantity_expected: i.quantity,
    lpn: i.lpn?.trim() || null,
    lot_number: i.lot_number?.trim() || null,
  }));
  const { error: linesErr } = await ctx.supabase
    .from("asn_lines")
    .insert(lineRows);
  if (linesErr) {
    await ctx.supabase.from("asns").delete().eq("id", asn.id);
    return { error: `Failed to create lines: ${linesErr.message}` };
  }

  revalidatePath("/inbound");
  redirect(`/inbound/${asn.id}`);
}

/** Pre-fill an ASN from a PO's outstanding lines (linked for reconciliation). */
export async function createAsnFromPo(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("purchasing.manage")) return;
  const poId = String(formData.get("po_id") ?? "").trim();
  if (!poId) return;

  const { data: po } = await ctx.supabase
    .from("purchase_orders")
    .select("id, supplier_id, warehouse_id, expected_date")
    .eq("id", poId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!po) return;

  const { data: poLines } = await ctx.supabase
    .from("po_line_items")
    .select("id, product_id, product_name, quantity_expected, quantity_received")
    .eq("po_id", poId);
  const outstanding = ((poLines ?? []) as Array<{
    id: string;
    product_id: string | null;
    product_name: string | null;
    quantity_expected: number;
    quantity_received: number | null;
  }>)
    .map((l) => ({ ...l, remaining: l.quantity_expected - (l.quantity_received ?? 0) }))
    .filter((l) => l.remaining > 0);
  if (outstanding.length === 0) return;

  const { data: asnNumber } = await ctx.supabase.rpc("next_document_number", {
    p_org_id: ctx.orgId,
    p_kind: "ASN",
    p_prefix: "ASN",
    p_pad: 4,
    p_start: 1,
  });

  const { data: asn } = await ctx.supabase
    .from("asns")
    .insert({
      org_id: ctx.orgId,
      asn_number: asnNumber as string,
      supplier_id: (po as { supplier_id: string | null }).supplier_id,
      po_id: poId,
      warehouse_id: (po as { warehouse_id: string | null }).warehouse_id,
      expected_date: (po as { expected_date: string | null }).expected_date,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (!asn) return;

  await ctx.supabase.from("asn_lines").insert(
    outstanding.map((l) => ({
      org_id: ctx.orgId,
      asn_id: asn.id,
      po_line_id: l.id,
      product_id: l.product_id,
      product_name: l.product_name,
      quantity_expected: l.remaining,
    }))
  );

  revalidatePath("/inbound");
  redirect(`/inbound/${asn.id}`);
}

export async function setAsnStatus(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("purchasing.manage")) return;
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["expected", "in_transit", "cancelled"].includes(status)) return;
  await ctx.supabase
    .from("asns")
    .update({ status })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath(`/inbound/${id}`);
  revalidatePath("/inbound");
}

// ── Receive ──────────────────────────────────────────────────────────────────

/** Receive one ASN line (full remaining, or an explicit quantity). */
export async function receiveAsnLine(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("purchasing.receive")) return;
  const lineId = String(formData.get("line_id") ?? "");
  const asnId = String(formData.get("asn_id") ?? "");
  const qtyRaw = String(formData.get("quantity") ?? "").trim();
  if (!lineId || !asnId) return;
  await receiveLines(ctx, asnId, [lineId], qtyRaw ? parseInt(qtyRaw, 10) : null);
  revalidatePath(`/inbound/${asnId}`);
}

/** Receive a whole pallet: every line on this ASN carrying the LPN. */
export async function receiveLpn(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("purchasing.receive")) return;
  const asnId = String(formData.get("asn_id") ?? "");
  const lpn = String(formData.get("lpn") ?? "").trim();
  if (!asnId || !lpn) return;
  const { data: lines } = await ctx.supabase
    .from("asn_lines")
    .select("id")
    .eq("asn_id", asnId)
    .eq("org_id", ctx.orgId)
    .eq("lpn", lpn);
  const ids = ((lines ?? []) as Array<{ id: string }>).map((l) => l.id);
  if (ids.length === 0) return;
  await receiveLines(ctx, asnId, ids, null);
  revalidatePath(`/inbound/${asnId}`);
}

type ActionCtx = Extract<
  Awaited<ReturnType<typeof getActionContext>>,
  { supabase: unknown }
>;

async function receiveLines(
  ctx: ActionCtx,
  asnId: string,
  lineIds: string[],
  explicitQty: number | null
): Promise<void> {
  const { data: lineRows } = await ctx.supabase
    .from("asn_lines")
    .select("id, product_id, po_line_id, quantity_expected, quantity_received")
    .in("id", lineIds)
    .eq("org_id", ctx.orgId);
  const lines = (lineRows ?? []) as Array<{
    id: string;
    product_id: string | null;
    po_line_id: string | null;
    quantity_expected: number;
    quantity_received: number | null;
  }>;

  const poIds = new Set<string>();
  let totalReceived = 0;
  const { data: asn } = await ctx.supabase
    .from("asns")
    .select("warehouse_id, po_id, asn_number")
    .eq("id", asnId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  const warehouseId =
    (asn as { warehouse_id: string | null } | null)?.warehouse_id ?? null;

  for (const l of lines) {
    const remaining = l.quantity_expected - (l.quantity_received ?? 0);
    if (remaining <= 0) continue;
    const qty =
      explicitQty != null
        ? Math.max(0, Math.min(explicitQty, remaining))
        : remaining;
    if (qty <= 0) continue;
    const newReceived = (l.quantity_received ?? 0) + qty;
    totalReceived += qty;

    await ctx.supabase
      .from("asn_lines")
      .update({ quantity_received: newReceived })
      .eq("id", l.id)
      .eq("org_id", ctx.orgId);

    // Reconcile against the linked PO line (record receipt; putaway creates stock).
    if (l.po_line_id) {
      const { data: pol } = await ctx.supabase
        .from("po_line_items")
        .select("po_id, quantity_received")
        .eq("id", l.po_line_id)
        .maybeSingle();
      const p = pol as { po_id: string; quantity_received: number | null } | null;
      if (p) {
        await ctx.supabase
          .from("po_line_items")
          .update({
            quantity_received: (p.quantity_received ?? 0) + qty,
            received_at: new Date().toISOString(),
            received_by: ctx.user.id,
          })
          .eq("id", l.po_line_id);
        poIds.add(p.po_id);
      }
    }

    await ctx.supabase.from("scan_history").insert({
      org_id: ctx.orgId,
      product_id: l.product_id,
      warehouse_id: warehouseId,
      scanned_by: ctx.user.id,
      action: "receive",
      quantity: qty,
      notes: "ASN receipt",
    });
  }

  for (const poId of poIds) await recomputePoStatus(ctx.supabase, ctx.orgId, poId);

  // Mark the ASN received once every line is fully received.
  const { data: remaining } = await ctx.supabase
    .from("asn_lines")
    .select("quantity_expected, quantity_received")
    .eq("asn_id", asnId)
    .eq("org_id", ctx.orgId);
  const allDone = ((remaining ?? []) as Array<{
    quantity_expected: number;
    quantity_received: number | null;
  }>).every((l) => (l.quantity_received ?? 0) >= l.quantity_expected);
  await ctx.supabase
    .from("asns")
    .update(
      allDone
        ? { status: "received", received_at: new Date().toISOString() }
        : { status: "in_transit" }
    )
    .eq("id", asnId)
    .eq("org_id", ctx.orgId);

  // Notify integrations subscribed to "po_received" when an ASN receipt
  // reconciled against one or more POs (best-effort, opt-in).
  if (poIds.size > 0 && totalReceived > 0) {
    const asnNumber =
      (asn as { asn_number: string | null } | null)?.asn_number ?? "ASN";
    try {
      await dispatchEvent({
        type: "po_received",
        org_id: ctx.orgId,
        title: `${asnNumber} received`,
        body: `Received ${totalReceived} unit(s) via ${asnNumber}, reconciled against ${
          poIds.size
        } purchase order${poIds.size === 1 ? "" : "s"}.`,
        link: `/inbound/${asnId}`,
        data: {
          asnId,
          asnNumber,
          quantityReceived: totalReceived,
          poIds: [...poIds],
        },
      });
    } catch {
      // dispatch swallows its own delivery errors; ignore.
    }
  }

  revalidateTag(tags.purchaseOrders(ctx.orgId));
  revalidatePath("/inbound");
  revalidatePath("/purchase-orders");
}
