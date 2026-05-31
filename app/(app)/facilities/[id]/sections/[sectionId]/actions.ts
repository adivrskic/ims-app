"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tags } from "@/lib/cache-tags";
import { applyOrQueueAdjustment } from "@/lib/data/adjustments";

async function getOrgContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" as const };
  const { data: m } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!m) return { error: "No workspace" as const };
  return { supabase, user, orgId: m.org_id as string, role: m.role as string };
}

export interface PickedProduct {
  id: string;
  name: string;
  barcode: string;
  internal_sku: string | null;
  photo_url: string | null;
}

export interface LocationRow {
  id: string;
  bay: number;
  level: number;
  quantity: number | null;
  placed_at: string | null;
  product: PickedProduct | null;
}

interface SlotCoord {
  section_id: string;
  bay: number;
  level: number;
}

type AuditAction = "locate" | "adjust" | "pick" | "relocate";

const LOCATION_SELECT =
  "id, bay, level, quantity, placed_at, product:products(id, name, barcode, internal_sku, photo_url)";

function sanitizeForFilterString(q: string): string {
  return q.replace(/[,()]/g, " ").trim();
}

function rowFromQuery(d: any): LocationRow {
  return {
    id: d.id as string,
    bay: d.bay as number,
    level: d.level as number,
    quantity: d.quantity as number | null,
    placed_at: d.placed_at as string | null,
    product: d.product
      ? {
          id: d.product.id as string,
          name: d.product.name as string,
          barcode: d.product.barcode as string,
          internal_sku: (d.product.internal_sku as string | null) ?? null,
          photo_url: (d.product.photo_url as string | null) ?? null,
        }
      : null,
  };
}

/**
 * Best-effort audit write. Errors on the insert (RLS, network, schema)
 * are logged but never block the primary mutation — losing an audit row
 * is acceptable; losing the inventory change isn't.
 */
async function writeScanHistory(
  ctx: { supabase: any; user: { id: string }; orgId: string },
  params: {
    productId: string | null;
    warehouseId: string;
    action: AuditAction;
    fromLocation?: SlotCoord | null;
    toLocation?: SlotCoord | null;
    quantity?: number | null;
  }
) {
  const { error } = await ctx.supabase.from("scan_history").insert({
    org_id: ctx.orgId,
    product_id: params.productId,
    warehouse_id: params.warehouseId,
    scanned_by: ctx.user.id,
    action: params.action,
    from_location: params.fromLocation ?? null,
    to_location: params.toLocation ?? null,
    quantity: params.quantity ?? null,
  });
  if (error) {
    console.error("scan_history insert failed:", error.message);
  }
}

// ── Product search ───────────────────────────────────────────────────────

export async function searchProducts({ query }: { query: string }): Promise<{
  error?: string;
  products?: PickedProduct[];
}> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };

  const q = sanitizeForFilterString(query);
  if (q.length < 2) return { products: [] };

  const escaped = q.replace(/[%_]/g, "\\$&");
  const { data, error } = await ctx.supabase
    .from("products")
    .select("id, name, barcode, internal_sku, photo_url")
    .eq("org_id", ctx.orgId)
    .or(
      `name.ilike.%${escaped}%,barcode.ilike.%${escaped}%,internal_sku.ilike.%${escaped}%`
    )
    .order("name")
    .limit(10);

  if (error) return { error: error.message };
  return {
    products: (data ?? []).map((p: any) => ({
      id: p.id as string,
      name: p.name as string,
      barcode: p.barcode as string,
      internal_sku: (p.internal_sku as string | null) ?? null,
      photo_url: (p.photo_url as string | null) ?? null,
    })),
  };
}

// ── Place product into a slot ────────────────────────────────────────────

interface PlaceArgs {
  warehouseId: string;
  sectionId: string;
  bay: number;
  level: number;
  productId: string;
  quantity: number;
}

export async function placeLocation(args: PlaceArgs): Promise<{
  error?: string;
  location?: LocationRow;
}> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };
  if (args.quantity < 0) return { error: "Quantity must be 0 or greater" };
  if (args.bay < 1) return { error: "Bay must be 1 or greater" };
  if (args.level < 1) return { error: "Level must be 1 or greater" };

  const { data: existing, error: existingErr } = await ctx.supabase
    .from("locations")
    .select("id, quantity")
    .eq("org_id", ctx.orgId)
    .eq("section_id", args.sectionId)
    .eq("bay", args.bay)
    .eq("level", args.level)
    .eq("product_id", args.productId)
    .eq("is_active", true)
    .maybeSingle();
  if (existingErr) return { error: existingErr.message };

  const targetCoord: SlotCoord = {
    section_id: args.sectionId,
    bay: args.bay,
    level: args.level,
  };

  if (existing) {
    const { data, error } = await ctx.supabase
      .from("locations")
      .update({ quantity: (existing.quantity ?? 0) + args.quantity })
      .eq("id", existing.id)
      .eq("org_id", ctx.orgId)
      .select(LOCATION_SELECT)
      .single();
    if (error) return { error: error.message };

    await writeScanHistory(ctx, {
      productId: args.productId,
      warehouseId: args.warehouseId,
      action: "locate",
      toLocation: targetCoord,
      quantity: args.quantity,
    });

    revalidatePath(`/facilities/${args.warehouseId}`);
    revalidatePath(
      `/facilities/${args.warehouseId}/sections/${args.sectionId}`
    );
    revalidateTag(tags.inventory(ctx.orgId));
    return { location: rowFromQuery(data) };
  }

  const { data, error } = await ctx.supabase
    .from("locations")
    .insert({
      org_id: ctx.orgId,
      warehouse_id: args.warehouseId,
      section_id: args.sectionId,
      bay: args.bay,
      level: args.level,
      product_id: args.productId,
      quantity: args.quantity,
      is_active: true,
      placed_by: ctx.user.id,
    })
    .select(LOCATION_SELECT)
    .single();
  if (error) return { error: error.message };

  await writeScanHistory(ctx, {
    productId: args.productId,
    warehouseId: args.warehouseId,
    action: "locate",
    toLocation: targetCoord,
    quantity: args.quantity,
  });

  revalidatePath(`/facilities/${args.warehouseId}`);
  revalidatePath(`/facilities/${args.warehouseId}/sections/${args.sectionId}`);
  revalidateTag(tags.inventory(ctx.orgId));
  return { location: rowFromQuery(data) };
}

// ── Update quantity ──────────────────────────────────────────────────────

export async function updateLocationQuantity({
  warehouseId,
  sectionId,
  locationId,
  quantity,
  reasonCode,
}: {
  warehouseId: string;
  sectionId: string;
  locationId: string;
  quantity: number;
  reasonCode?: string | null;
}): Promise<{ error?: string; location?: LocationRow; queued?: boolean }> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };
  if (quantity < 0) return { error: "Quantity must be 0 or greater" };

  // Read current qty so the adjustment governance layer can compute the delta
  // and decide whether to commit or queue for approval.
  const { data: cur, error: curErr } = await ctx.supabase
    .from("locations")
    .select("id, quantity, product_id, warehouse_id")
    .eq("id", locationId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (curErr) return { error: curErr.message };
  if (!cur) return { error: "Location not found" };

  const result = await applyOrQueueAdjustment(
    ctx.supabase,
    { orgId: ctx.orgId, userId: ctx.user.id },
    {
      locationId,
      warehouseId: (cur as any).warehouse_id ?? warehouseId,
      productId: (cur as any).product_id ?? null,
      currentQty: (cur as any).quantity ?? 0,
      requestedQty: quantity,
      reasonCode: reasonCode ?? null,
    }
  );
  if (result.error) return { error: result.error };

  // Over threshold / reason-gated → queued for approval, on-hand unchanged.
  if (result.queued) {
    revalidatePath(`/facilities/${warehouseId}/sections/${sectionId}`);
    return { queued: true };
  }

  // Committed (or no-op). Return the authoritative row for the UI to reconcile.
  const { data, error } = await ctx.supabase
    .from("locations")
    .select(`${LOCATION_SELECT}, section_id, product_id, warehouse_id`)
    .eq("id", locationId)
    .eq("org_id", ctx.orgId)
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/facilities/${warehouseId}`);
  revalidatePath(`/facilities/${warehouseId}/sections/${sectionId}`);
  revalidateTag(tags.inventory(ctx.orgId));
  return { location: rowFromQuery(data) };
}

// ── Remove (soft delete) ─────────────────────────────────────────────────

export async function removeLocation({
  warehouseId,
  sectionId,
  locationId,
}: {
  warehouseId: string;
  sectionId: string;
  locationId: string;
}): Promise<{ error?: string }> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };

  // Update + select returns the row so we can write a meaningful audit
  // entry without a separate query.
  const { data, error } = await ctx.supabase
    .from("locations")
    .update({ is_active: false })
    .eq("id", locationId)
    .eq("org_id", ctx.orgId)
    .select("section_id, bay, level, quantity, product_id, warehouse_id")
    .single();
  if (error) return { error: error.message };

  if (data) {
    await writeScanHistory(ctx, {
      productId: (data as any).product_id,
      warehouseId: (data as any).warehouse_id,
      action: "adjust",
      fromLocation: {
        section_id: (data as any).section_id,
        bay: (data as any).bay,
        level: (data as any).level,
      },
      quantity: (data as any).quantity,
    });
  }

  revalidatePath(`/facilities/${warehouseId}`);
  revalidatePath(`/facilities/${warehouseId}/sections/${sectionId}`);
  revalidateTag(tags.inventory(ctx.orgId));
  return {};
}

// ── Relocate (move to a different slot in the same section) ──────────────

export async function relocateLocation({
  warehouseId,
  sectionId,
  locationId,
  toBay,
  toLevel,
}: {
  warehouseId: string;
  sectionId: string;
  locationId: string;
  toBay: number;
  toLevel: number;
}): Promise<{
  error?: string;
  source?: LocationRow | null; // null when source was deactivated due to merge
  mergedInto?: LocationRow;
}> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };
  if (toBay < 1) return { error: "Bay must be 1 or greater" };
  if (toLevel < 1) return { error: "Level must be 1 or greater" };

  // ── 1. Load source row ────────────────────────────────────────────────
  const { data: source, error: srcErr } = await ctx.supabase
    .from("locations")
    .select("id, section_id, warehouse_id, product_id, bay, level, quantity")
    .eq("id", locationId)
    .eq("org_id", ctx.orgId)
    .eq("is_active", true)
    .maybeSingle();
  if (srcErr) return { error: srcErr.message };
  if (!source) return { error: "Location not found" };

  // ── 2. Validate destination against section bounds ───────────────────
  const { data: section, error: secErr } = await ctx.supabase
    .from("sections")
    .select("total_bays, total_levels")
    .eq("id", source.section_id)
    .maybeSingle();
  if (secErr) return { error: secErr.message };
  if (!section) return { error: "Section not found" };
  if (toBay > (section.total_bays ?? 0)) {
    return { error: `Bay exceeds section maximum of ${section.total_bays}` };
  }
  if (toLevel > (section.total_levels ?? 0)) {
    return {
      error: `Level exceeds section maximum of ${section.total_levels}`,
    };
  }

  if (source.bay === toBay && source.level === toLevel) {
    return { error: "Location is already at this slot" };
  }

  const fromCoord: SlotCoord = {
    section_id: source.section_id,
    bay: source.bay,
    level: source.level,
  };
  const toCoord: SlotCoord = {
    section_id: source.section_id,
    bay: toBay,
    level: toLevel,
  };

  // ── 3. Same-product row already at destination? Merge into it. ───────
  const { data: existingTarget, error: tgtLookupErr } = await ctx.supabase
    .from("locations")
    .select("id, quantity")
    .eq("org_id", ctx.orgId)
    .eq("section_id", source.section_id)
    .eq("bay", toBay)
    .eq("level", toLevel)
    .eq("product_id", source.product_id)
    .eq("is_active", true)
    .neq("id", source.id)
    .maybeSingle();
  if (tgtLookupErr) return { error: tgtLookupErr.message };

  if (existingTarget) {
    const newQty = (existingTarget.quantity ?? 0) + (source.quantity ?? 0);

    const { data: target, error: mergeErr } = await ctx.supabase
      .from("locations")
      .update({ quantity: newQty })
      .eq("id", existingTarget.id)
      .eq("org_id", ctx.orgId)
      .select(LOCATION_SELECT)
      .single();
    if (mergeErr) return { error: mergeErr.message };

    const { error: deactivateErr } = await ctx.supabase
      .from("locations")
      .update({ is_active: false })
      .eq("id", source.id)
      .eq("org_id", ctx.orgId);
    if (deactivateErr) return { error: deactivateErr.message };

    await writeScanHistory(ctx, {
      productId: source.product_id,
      warehouseId: source.warehouse_id,
      action: "relocate",
      fromLocation: fromCoord,
      toLocation: toCoord,
      quantity: source.quantity,
    });

    revalidatePath(`/facilities/${warehouseId}`);
    revalidatePath(`/facilities/${warehouseId}/sections/${sectionId}`);
    revalidateTag(tags.inventory(ctx.orgId));
    return { source: null, mergedInto: rowFromQuery(target) };
  }

  // ── 4. Plain move: change bay/level on the source row directly. ──────
  const { data: moved, error: moveErr } = await ctx.supabase
    .from("locations")
    .update({ bay: toBay, level: toLevel })
    .eq("id", source.id)
    .eq("org_id", ctx.orgId)
    .select(LOCATION_SELECT)
    .single();
  if (moveErr) return { error: moveErr.message };

  await writeScanHistory(ctx, {
    productId: source.product_id,
    warehouseId: source.warehouse_id,
    action: "relocate",
    fromLocation: fromCoord,
    toLocation: toCoord,
    quantity: source.quantity,
  });

  revalidatePath(`/facilities/${warehouseId}`);
  revalidatePath(`/facilities/${warehouseId}/sections/${sectionId}`);
  revalidateTag(tags.inventory(ctx.orgId));
  return { source: rowFromQuery(moved) };
}