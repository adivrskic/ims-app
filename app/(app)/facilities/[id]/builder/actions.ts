"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { tags } from "@/lib/cache-tags";
import { getActionContext } from "@/lib/data/actionContext";
import type { SectionDraft, LayoutElementDraft, ElementKind } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidUuid = (s: string | undefined | null) => !!s && UUID_RE.test(s);

const VALID_ELEMENT_KINDS: readonly ElementKind[] = [
  "walkway",
  "note",
  "door",
  "obstacle",
  "staging",
] as const;

// ── Layout save (unchanged) ─────────────────────────────────────────────

interface SaveLayoutArgs {
  warehouseId: string;
  sections: SectionDraft[];
  deletedSectionIds: string[];
  elements: LayoutElementDraft[];
  deletedElementIds: string[];
}

export async function saveLayout({
  warehouseId,
  sections,
  deletedSectionIds,
  elements,
  deletedElementIds,
}: SaveLayoutArgs): Promise<{ error?: string; success?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("facilities.manage")) {
    return { error: "Only admins can edit facility layouts" };
  }

  if (deletedSectionIds.length > 0) {
    const { error } = await ctx.supabase
      .from("sections")
      .delete()
      .in("id", deletedSectionIds)
      .eq("org_id", ctx.orgId);
    if (error) return { error: `Delete section failed: ${error.message}` };
  }

  for (const s of sections.filter((x) => !x.isNew)) {
    const { error } = await ctx.supabase
      .from("sections")
      .update({
        code: s.code,
        name: s.name,
        floor_x: s.floor_x,
        floor_y: s.floor_y,
        floor_width: s.floor_width,
        floor_height: s.floor_height,
        rotation: s.rotation,
        total_bays: s.total_bays,
        total_levels: s.total_levels,
        color: s.color,
        sort_order: s.sort_order,
        slot_capacity: s.slot_capacity,
        default_category: s.default_category,
        pick_zone: s.pick_zone,
      })
      .eq("id", s.id)
      .eq("org_id", ctx.orgId);
    if (error)
      return { error: `Update section ${s.code} failed: ${error.message}` };
  }

  const newSections = sections.filter((s) => s.isNew);
  if (newSections.length > 0) {
    const rows = newSections.map((s) => ({
      org_id: ctx.orgId,
      warehouse_id: warehouseId,
      code: s.code,
      name: s.name,
      floor_x: s.floor_x,
      floor_y: s.floor_y,
      floor_width: s.floor_width,
      floor_height: s.floor_height,
      rotation: s.rotation,
      total_bays: s.total_bays,
      total_levels: s.total_levels,
      color: s.color,
      sort_order: s.sort_order,
      slot_capacity: s.slot_capacity,
      default_category: s.default_category,
      pick_zone: s.pick_zone,
    }));
    const { error } = await ctx.supabase.from("sections").insert(rows);
    if (error) return { error: `Insert sections failed: ${error.message}` };
  }

  if (deletedElementIds.length > 0) {
    const { error } = await ctx.supabase
      .from("layout_elements")
      .delete()
      .in("id", deletedElementIds)
      .eq("org_id", ctx.orgId);
    if (error) return { error: `Delete element failed: ${error.message}` };
  }

  for (const e of elements.filter((x) => !x.isNew)) {
    const { error } = await ctx.supabase
      .from("layout_elements")
      .update({
        kind: e.kind,
        floor_x: e.floor_x,
        floor_y: e.floor_y,
        floor_width: e.floor_width,
        floor_height: e.floor_height,
        rotation: e.rotation,
        color: e.color,
        label: e.label,
        data: e.data,
        sort_order: e.sort_order,
      })
      .eq("id", e.id)
      .eq("org_id", ctx.orgId);
    if (error) return { error: `Update element failed: ${error.message}` };
  }

  const newElements = elements.filter((e) => e.isNew);
  if (newElements.length > 0) {
    const rows = newElements.map((e) => ({
      org_id: ctx.orgId,
      warehouse_id: warehouseId,
      kind: e.kind,
      floor_x: e.floor_x,
      floor_y: e.floor_y,
      floor_width: e.floor_width,
      floor_height: e.floor_height,
      rotation: e.rotation,
      color: e.color,
      label: e.label,
      data: e.data,
      sort_order: e.sort_order,
    }));
    const { error } = await ctx.supabase.from("layout_elements").insert(rows);
    if (error) return { error: `Insert elements failed: ${error.message}` };
  }

  // Bust the live routes (pages moved from /settings/facilities → /facilities)
  // AND the warehouses tag, so a separate tab/session viewing the facility or
  // its builder reflects the saved layout instead of a stale cached copy.
  revalidatePath("/facilities");
  revalidatePath(`/facilities/${warehouseId}`);
  revalidatePath(`/facilities/${warehouseId}/builder`);
  revalidateTag(tags.warehouses(ctx.orgId));
  return { success: "Layout saved" };
}

// ── Floor unit ──────────────────────────────────────────────────────────

// Canonical layout unit. Floor coordinates are stored as unitless numbers
// (1 coord = 1 unit, top-left origin); `floor_unit` is the interpretive
// label only — switching it relabels, it does NOT rescale geometry.
const VALID_FLOOR_UNITS = ["ft", "m"] as const;
export type FloorUnit = (typeof VALID_FLOOR_UNITS)[number];

export async function setFloorUnit(
  warehouseId: string,
  unit: FloorUnit
): Promise<{ error?: string; unit?: FloorUnit }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("facilities.manage")) {
    return { error: "Only admins can change the floor unit" };
  }
  if (!VALID_FLOOR_UNITS.includes(unit)) {
    return { error: "Unsupported unit" };
  }
  const { error } = await ctx.supabase
    .from("warehouses")
    .update({ floor_unit: unit })
    .eq("id", warehouseId)
    .eq("org_id", ctx.orgId);
  if (error) return { error: error.message };
  revalidatePath(`/facilities/${warehouseId}`);
  revalidatePath(`/facilities/${warehouseId}/builder`);
  revalidateTag(tags.warehouses(ctx.orgId));
  return { unit };
}

// ── Snapshots ───────────────────────────────────────────────────────────

export interface LayoutSnapshotRow {
  id: string;
  warehouse_id: string;
  label: string | null;
  created_at: string;
  saved_by: string | null;
  is_mine: boolean;
}

interface SnapshotPayload {
  version: 1;
  sections: SectionDraft[];
  elements: LayoutElementDraft[];
}

export async function listSnapshots(warehouseId: string): Promise<{
  error?: string;
  snapshots?: LayoutSnapshotRow[];
}> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };

  const { data, error } = await ctx.supabase
    .from("layout_snapshots")
    .select("id, warehouse_id, label, created_at, saved_by")
    .eq("warehouse_id", warehouseId)
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };
  return {
    snapshots: (data ?? []).map((r) => ({
      id: r.id,
      warehouse_id: r.warehouse_id,
      label: r.label,
      created_at: r.created_at,
      saved_by: r.saved_by,
      is_mine: r.saved_by === ctx.user.id,
    })),
  };
}

interface CreateSnapshotArgs {
  warehouseId: string;
  label: string | null;
  sections: SectionDraft[];
  elements: LayoutElementDraft[];
}

export async function createSnapshot({
  warehouseId,
  label,
  sections,
  elements,
}: CreateSnapshotArgs): Promise<{
  error?: string;
  snapshot?: LayoutSnapshotRow;
}> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("facilities.manage")) {
    return { error: "Only admins can manage snapshots" };
  }

  const payload: SnapshotPayload = {
    version: 1,
    sections,
    elements,
  };

  const trimmedLabel = label?.trim();
  const finalLabel =
    trimmedLabel && trimmedLabel.length > 0
      ? trimmedLabel.slice(0, 80)
      : `Snapshot ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

  const { data, error } = await ctx.supabase
    .from("layout_snapshots")
    .insert({
      org_id: ctx.orgId,
      warehouse_id: warehouseId,
      layout_json: payload,
      saved_by: ctx.user.id,
      label: finalLabel,
    })
    .select("id, warehouse_id, label, created_at, saved_by")
    .single();

  if (error) return { error: error.message };
  return {
    snapshot: {
      id: data.id,
      warehouse_id: data.warehouse_id,
      label: data.label,
      created_at: data.created_at,
      saved_by: data.saved_by,
      is_mine: true,
    },
  };
}

export async function deleteSnapshot(snapshotId: string): Promise<{
  error?: string;
}> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("facilities.manage")) {
    return { error: "Only admins can manage snapshots" };
  }
  const { error } = await ctx.supabase
    .from("layout_snapshots")
    .delete()
    .eq("id", snapshotId)
    .eq("org_id", ctx.orgId);
  if (error) return { error: error.message };
  return {};
}

export interface RestoreSnapshotResult {
  sections: SectionDraft[];
  elements: LayoutElementDraft[];
  unlinkedLocations: number;
}

export async function restoreSnapshot(
  snapshotId: string,
  opts?: { confirmUnlink?: boolean }
): Promise<{
  error?: string;
  result?: RestoreSnapshotResult;
  // Set when the restore would orphan locations and the caller hasn't yet
  // confirmed. No writes happen in this case — re-call with confirmUnlink.
  needsConfirm?: boolean;
  unlinkedLocations?: number;
}> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("facilities.manage")) {
    return { error: "Only admins can restore snapshots" };
  }

  // ── 1. Load the snapshot row ─────────────────────────────────────────
  const { data: snap, error: snapErr } = await ctx.supabase
    .from("layout_snapshots")
    .select("id, warehouse_id, org_id, layout_json")
    .eq("id", snapshotId)
    .maybeSingle();

  if (snapErr) return { error: snapErr.message };
  if (!snap) return { error: "Snapshot not found" };
  if (snap.org_id !== ctx.orgId) return { error: "Forbidden" };
  if (!snap.warehouse_id) {
    return { error: "Snapshot is not attached to a warehouse" };
  }

  const payload = snap.layout_json as SnapshotPayload | null;
  if (!payload || payload.version !== 1) {
    return { error: "Snapshot format is not recognized" };
  }

  const warehouseId = snap.warehouse_id;

  // ── 2. Load current rows so we can compute the diff ──────────────────
  const [currentSecRes, currentElRes] = await Promise.all([
    ctx.supabase
      .from("sections")
      .select("id")
      .eq("warehouse_id", warehouseId)
      .eq("org_id", ctx.orgId),
    ctx.supabase
      .from("layout_elements")
      .select("id")
      .eq("warehouse_id", warehouseId)
      .eq("org_id", ctx.orgId),
  ]);
  if (currentSecRes.error) return { error: currentSecRes.error.message };
  if (currentElRes.error) return { error: currentElRes.error.message };

  const currentSectionIds = new Set(
    (currentSecRes.data ?? []).map((r) => r.id as string)
  );
  const currentElementIds = new Set(
    (currentElRes.data ?? []).map((r) => r.id as string)
  );

  // ── 3. Build the rows to upsert. Preserve UUID ids; mint new uuids
  //       for placeholder ids (`new-xxx`) from unsaved snapshot items.
  const sectionRows = (payload.sections ?? []).map((s) => {
    const id = isValidUuid(s.id) ? s.id : crypto.randomUUID();
    return {
      id,
      org_id: ctx.orgId,
      warehouse_id: warehouseId,
      code: s.code ?? "",
      name: s.name ?? "",
      floor_x: s.floor_x ?? 0,
      floor_y: s.floor_y ?? 0,
      floor_width: s.floor_width ?? 100,
      floor_height: s.floor_height ?? 100,
      rotation: s.rotation ?? 0,
      total_bays: s.total_bays ?? 1,
      total_levels: s.total_levels ?? 1,
      color: s.color ?? "#D4A853",
      sort_order: s.sort_order ?? 0,
      slot_capacity: s.slot_capacity ?? null,
      default_category: s.default_category ?? null,
      pick_zone: s.pick_zone ?? null,
    };
  });

  const elementRows = (payload.elements ?? [])
    .filter((e) => VALID_ELEMENT_KINDS.includes(e.kind))
    .map((e) => {
      const id = isValidUuid(e.id) ? e.id : crypto.randomUUID();
      return {
        id,
        org_id: ctx.orgId,
        warehouse_id: warehouseId,
        kind: e.kind,
        floor_x: e.floor_x ?? 0,
        floor_y: e.floor_y ?? 0,
        floor_width: e.floor_width ?? 100,
        floor_height: e.floor_height ?? 100,
        rotation: e.rotation ?? 0,
        color: e.color ?? "#6b7280",
        label: e.label ?? "",
        data: e.data ?? {},
        sort_order: e.sort_order ?? 0,
      };
    });

  const finalSectionIds = new Set(sectionRows.map((r) => r.id));
  const finalElementIds = new Set(elementRows.map((r) => r.id));

  const sectionsToDelete = [...currentSectionIds].filter(
    (id) => !finalSectionIds.has(id)
  );
  const elementsToDelete = [...currentElementIds].filter(
    (id) => !finalElementIds.has(id)
  );

  // ── 4. Count locations that will be unlinked (informational) ─────────
  let unlinkedLocations = 0;
  if (sectionsToDelete.length > 0) {
    const { count, error: countErr } = await ctx.supabase
      .from("locations")
      .select("id", { count: "exact", head: true })
      .in("section_id", sectionsToDelete);
    if (countErr) return { error: countErr.message };
    unlinkedLocations = count ?? 0;
  }

  // ── 4b. Guard: if this restore would orphan locations, bail for an
  //        explicit confirmation before mutating anything. ──────────────
  if (unlinkedLocations > 0 && !opts?.confirmUnlink) {
    return { needsConfirm: true, unlinkedLocations };
  }

  // ── 5. Apply: upsert snapshot rows, then delete extras. ──────────────
  // Order: upsert first so a failure leaves the DB in a still-consistent
  // (and richer) state rather than a partially-deleted one.
  if (sectionRows.length > 0) {
    const { error } = await ctx.supabase
      .from("sections")
      .upsert(sectionRows, { onConflict: "id" });
    if (error) return { error: `Restore sections failed: ${error.message}` };
  }
  if (elementRows.length > 0) {
    const { error } = await ctx.supabase
      .from("layout_elements")
      .upsert(elementRows, { onConflict: "id" });
    if (error) return { error: `Restore elements failed: ${error.message}` };
  }
  if (sectionsToDelete.length > 0) {
    const { error } = await ctx.supabase
      .from("sections")
      .delete()
      .in("id", sectionsToDelete)
      .eq("org_id", ctx.orgId);
    // Locations cascade to section_id = null via DB constraint.
    if (error) return { error: `Cleanup sections failed: ${error.message}` };
  }
  if (elementsToDelete.length > 0) {
    const { error } = await ctx.supabase
      .from("layout_elements")
      .delete()
      .in("id", elementsToDelete)
      .eq("org_id", ctx.orgId);
    if (error) return { error: `Cleanup elements failed: ${error.message}` };
  }

  revalidatePath("/facilities");
  revalidatePath(`/facilities/${warehouseId}`);
  revalidatePath(`/facilities/${warehouseId}/builder`);
  revalidateTag(tags.warehouses(ctx.orgId));

  // ── 6. Hand the restored state back so the editor can refresh ────────
  return {
    result: {
      sections: sectionRows.map((r) => ({
        id: r.id,
        isNew: false,
        code: r.code,
        name: r.name,
        floor_x: Number(r.floor_x),
        floor_y: Number(r.floor_y),
        floor_width: Number(r.floor_width),
        floor_height: Number(r.floor_height),
        rotation: Number(r.rotation),
        total_bays: r.total_bays,
        total_levels: r.total_levels,
        color: r.color,
        sort_order: r.sort_order,
        slot_capacity: r.slot_capacity ?? null,
        default_category: r.default_category ?? null,
        pick_zone: r.pick_zone ?? null,
      })),
      elements: elementRows.map((r) => ({
        id: r.id,
        isNew: false,
        kind: r.kind,
        floor_x: Number(r.floor_x),
        floor_y: Number(r.floor_y),
        floor_width: Number(r.floor_width),
        floor_height: Number(r.floor_height),
        rotation: Number(r.rotation),
        color: r.color,
        label: r.label,
        data: r.data as Record<string, unknown>,
        sort_order: r.sort_order,
      })),
      unlinkedLocations,
    },
  };
}
