"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { getActiveScope } from "@/lib/facilityScope";
import { tags } from "@/lib/cache-tags";
import { PRODUCT_SPEC } from "@/lib/import/specs";
import {
  emptyOutcome,
  prepareImport,
  type ImportOutcome,
} from "@/lib/import/prepare";
import type { BuiltRow } from "@/lib/import/spec";
import {
  chunk,
  patchFrom,
  readExistingMode,
  readImportInput,
  readImportMode,
} from "@/lib/import/server";

export type { ImportOutcome };

interface SectionInfo {
  id: string;
  total_bays: number;
  total_levels: number;
}

interface Placement {
  section_id: string | null;
  bay: number;
  level: number;
}

/**
 * Resolve a "SECTION-BAY-LEVEL" cell against the facility's sections.
 * "A" alone means bay 1 / level 1; "A-3" means level 1. Blank = holding area.
 */
function resolvePlacement(
  raw: string | null,
  sections: Map<string, SectionInfo>
): { placement: Placement } | { error: string } {
  if (!raw) return { placement: { section_id: null, bay: 1, level: 1 } };
  const parts = raw
    .trim()
    .split(/[\s\-/.:]+/)
    .filter(Boolean);
  const code = (parts[0] ?? "").toLowerCase();
  const section = sections.get(code);
  if (!section) {
    return {
      error: `Location “${raw}”: no section “${parts[0] ?? raw}” in this facility (lay one out under Facilities, or leave the cell blank for the holding area)`,
    };
  }
  const bay = parts[1] === undefined ? 1 : Number(parts[1]);
  const level = parts[2] === undefined ? 1 : Number(parts[2]);
  if (!Number.isInteger(bay) || bay < 1 || bay > section.total_bays) {
    return {
      error: `Location “${raw}”: section ${parts[0]} has bays 1–${section.total_bays}`,
    };
  }
  if (!Number.isInteger(level) || level < 1 || level > section.total_levels) {
    return {
      error: `Location “${raw}”: section ${parts[0]} has levels 1–${section.total_levels}`,
    };
  }
  return { placement: { section_id: section.id, bay, level } };
}

const PRODUCT_COLUMNS = [
  "name",
  "internal_sku",
  "manufacturer",
  "reorder_point",
  "safety_stock",
  "lead_time_days",
  "unit_cost",
  "unit_price",
  "dimensions",
  "weight",
  "notes",
];

/**
 * Product import — file or pasted rows, dry-run "check" then "import".
 *
 * - Rows are validated by the shared engine (lib/import); each bad row is
 *   reported by its spreadsheet row number and the good rows still import.
 * - Existing products (same barcode) are skipped, or updated when the
 *   "existing=update" switch is on. Blank cells never overwrite.
 * - `quantity` on a NEW product creates its on-hand row: in the given
 *   SECTION-BAY-LEVEL when that resolves in the active facility, else in
 *   the facility's holding area. Existing products never get stock this
 *   way — re-importing a file must not double-count.
 * - Categories and suppliers are matched by name (case-insensitive) and
 *   created when missing (suppliers only if the caller may manage them).
 */
export async function importProducts(
  formData: FormData
): Promise<ImportOutcome> {
  const mode = readImportMode(formData);
  const existingMode = readExistingMode(formData);

  const ctx = await getActionContext();
  if ("error" in ctx) return emptyOutcome(mode, ctx.error);
  if (!ctx.can("inventory.manage")) {
    return emptyOutcome(mode, "Only admins can import products.");
  }

  const input = await readImportInput(formData);
  if ("fatal" in input) return emptyOutcome(mode, input.fatal);

  const { preview, rows } = prepareImport(input.text, PRODUCT_SPEC);
  const out: ImportOutcome = {
    ...preview,
    mode,
    imported: 0,
    updated: 0,
    skipped: 0,
    notes: [],
  };
  if (preview.fatal) return out;

  // ── Existing products by barcode, and SKU ownership ──────────────────
  const existingByBarcode = new Map<string, string>();
  for (const part of chunk(
    rows.map((r) => r.key),
    500
  )) {
    const { data } = await ctx.supabase
      .from("products")
      .select("id, barcode")
      .eq("org_id", ctx.orgId)
      .in("barcode", part);
    for (const p of data ?? []) existingByBarcode.set(p.barcode, p.id);
  }

  const skuOwner = new Map<string, string>(); // sku → barcode
  const skus = rows
    .map((r) => r.record.internal_sku)
    .filter((s): s is string => typeof s === "string");
  for (const part of chunk(skus, 500)) {
    const { data } = await ctx.supabase
      .from("products")
      .select("barcode, internal_sku")
      .eq("org_id", ctx.orgId)
      .in("internal_sku", part);
    for (const p of data ?? []) {
      if (p.internal_sku) skuOwner.set(p.internal_sku, p.barcode);
    }
  }

  // ── Facility + sections, only if any row carries stock ───────────────
  const wantsStock = rows.some(
    (r) => ((r.record.quantity as number | null) ?? 0) > 0
  );
  let warehouse: { id: string; name: string } | null = null;
  const sections = new Map<string, SectionInfo>();
  if (wantsStock) {
    const scope = await getActiveScope();
    if (scope.mode === "single") {
      warehouse = { id: scope.id, name: scope.name };
    } else {
      const { data } = await ctx.supabase
        .from("warehouses")
        .select("id, name")
        .eq("org_id", ctx.orgId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      warehouse = data ?? null;
    }
    if (warehouse) {
      const { data } = await ctx.supabase
        .from("sections")
        .select("id, code, total_bays, total_levels")
        .eq("org_id", ctx.orgId)
        .eq("warehouse_id", warehouse.id);
      for (const s of data ?? []) {
        // sections.code is char(n) — trim the padding before matching.
        sections.set(String(s.code).trim().toLowerCase(), {
          id: s.id,
          total_bays: s.total_bays,
          total_levels: s.total_levels,
        });
      }
    }
  }

  // ── Partition: create / update / skip / error ────────────────────────
  const toCreate: Array<BuiltRow & { placement: Placement | null }> = [];
  const toUpdate: BuiltRow[] = [];
  const seenSku = new Set<string>();

  for (const r of rows) {
    const sku = r.record.internal_sku as string | null;
    if (sku) {
      if (seenSku.has(sku)) {
        out.errors.push({
          row: r.row,
          key: r.key,
          message: `Duplicate SKU “${sku}” within this file`,
        });
        continue;
      }
      seenSku.add(sku);
      const owner = skuOwner.get(sku);
      if (owner && owner !== r.key) {
        out.errors.push({
          row: r.row,
          key: r.key,
          message: `SKU “${sku}” already belongs to barcode ${owner}`,
        });
        continue;
      }
    }

    if (existingByBarcode.has(r.key)) {
      if (existingMode === "update") {
        toUpdate.push(r);
      } else {
        out.skipped += 1;
        out.errors.push({
          row: r.row,
          key: r.key,
          message:
            "Already in catalog — skipped (turn on “Update existing” to overwrite)",
        });
      }
      continue;
    }

    const qty = (r.record.quantity as number | null) ?? 0;
    let placement: Placement | null = null;
    if (qty > 0) {
      if (!warehouse) {
        out.errors.push({
          row: r.row,
          key: r.key,
          message:
            "Has a quantity but the workspace has no facility to put it in — add one under Facilities, or clear the quantity column",
        });
        continue;
      }
      const resolved = resolvePlacement(
        (r.record.location as string | null) ?? null,
        sections
      );
      if ("error" in resolved) {
        out.errors.push({ row: r.row, key: r.key, message: resolved.error });
        continue;
      }
      placement = resolved.placement;
    }
    toCreate.push({ ...r, placement });
  }

  out.errors.sort((a, b) => a.row - b.row);
  out.valid = toCreate.length + toUpdate.length;

  const summary: string[] = [];
  if (toCreate.length > 0) summary.push(`${toCreate.length} new`);
  if (toUpdate.length > 0) summary.push(`${toUpdate.length} to update`);
  if (out.skipped > 0) summary.push(`${out.skipped} already in catalog`);
  if (warehouse && wantsStock) {
    summary.push(`stock goes to ${warehouse.name}`);
  }
  if (summary.length > 0) out.notes.push(summary.join(" · "));

  if (mode === "check") return out;

  // ── Categories: match or create ──────────────────────────────────────
  const wanted = [...toCreate, ...toUpdate];
  const categoryNames = new Set<string>();
  const supplierNames = new Set<string>();
  for (const r of wanted) {
    const c = r.record.category as string | null;
    if (c) categoryNames.add(c);
    const s = r.record.supplier as string | null;
    if (s) supplierNames.add(s);
  }

  const catMap = new Map<string, string>();
  if (categoryNames.size > 0) {
    const { data: existingCats } = await ctx.supabase
      .from("categories")
      .select("id, name")
      .eq("org_id", ctx.orgId);
    for (const c of existingCats ?? []) catMap.set(c.name.toLowerCase(), c.id);
    const missing = [...categoryNames].filter(
      (n) => !catMap.has(n.toLowerCase())
    );
    if (missing.length > 0) {
      const { data: created, error } = await ctx.supabase
        .from("categories")
        .insert(missing.map((name) => ({ org_id: ctx.orgId, name })))
        .select("id, name");
      if (error) {
        out.notes.push(`Couldn't create categories: ${error.message}`);
      } else {
        for (const c of created ?? []) catMap.set(c.name.toLowerCase(), c.id);
        out.notes.push(
          `Created ${created?.length ?? 0} ${
            (created?.length ?? 0) === 1 ? "category" : "categories"
          }: ${missing.join(", ")}`
        );
      }
    }
  }

  // ── Suppliers: match, create if allowed ──────────────────────────────
  const supplierMap = new Map<string, string>();
  if (supplierNames.size > 0) {
    const { data: existingSup } = await ctx.supabase
      .from("suppliers")
      .select("id, name")
      .eq("org_id", ctx.orgId);
    for (const s of existingSup ?? []) {
      supplierMap.set(s.name.toLowerCase(), s.id);
    }
    const missing = [...supplierNames].filter(
      (n) => !supplierMap.has(n.toLowerCase())
    );
    if (missing.length > 0) {
      if (ctx.can("suppliers.manage")) {
        const { data: created, error } = await ctx.supabase
          .from("suppliers")
          .insert(
            missing.map((name) => ({
              org_id: ctx.orgId,
              name,
              created_by: ctx.user.id,
            }))
          )
          .select("id, name");
        if (error) {
          out.notes.push(`Couldn't create suppliers: ${error.message}`);
        } else {
          for (const s of created ?? []) {
            supplierMap.set(s.name.toLowerCase(), s.id);
          }
          out.notes.push(
            `Created ${created?.length ?? 0} supplier${
              (created?.length ?? 0) === 1 ? "" : "s"
            }: ${missing.join(", ")}`
          );
        }
      } else {
        out.notes.push(
          `Left the preferred supplier blank for ${missing.length} unknown name${
            missing.length === 1 ? "" : "s"
          } (you can't create suppliers): ${missing.join(", ")}`
        );
      }
    }
  }

  const categoryIdFor = (r: BuiltRow) => {
    const c = r.record.category as string | null;
    return c ? catMap.get(c.toLowerCase()) ?? null : null;
  };
  const supplierIdFor = (r: BuiltRow) => {
    const s = r.record.supplier as string | null;
    return s ? supplierMap.get(s.toLowerCase()) ?? null : null;
  };

  // ── Inserts (batched, a failed batch reports and continues) ──────────
  const createdIds = new Map<string, string>(); // barcode → id
  for (const part of chunk(toCreate, 200)) {
    const { data, error } = await ctx.supabase
      .from("products")
      .insert(
        part.map((r) => ({
          org_id: ctx.orgId,
          barcode: r.key,
          name: r.record.name,
          internal_sku: r.record.internal_sku ?? null,
          manufacturer: r.record.manufacturer ?? null,
          category_id: categoryIdFor(r),
          reorder_point: (r.record.reorder_point as number | null) ?? 0,
          safety_stock: (r.record.safety_stock as number | null) ?? 0,
          lead_time_days: r.record.lead_time_days ?? null,
          unit_cost: r.record.unit_cost ?? null,
          unit_price: r.record.unit_price ?? null,
          preferred_supplier_id: supplierIdFor(r),
          dimensions: r.record.dimensions ?? null,
          weight: r.record.weight ?? null,
          notes: r.record.notes ?? null,
        }))
      )
      .select("id, barcode");
    if (error) {
      out.errors.push({
        row: part[0].row,
        key: "",
        message: `Rows ${part[0].row}–${
          part[part.length - 1].row
        } failed together: ${error.message}`,
      });
      continue;
    }
    for (const p of data ?? []) createdIds.set(p.barcode, p.id);
    out.imported += data?.length ?? 0;
  }

  // ── Updates (only provided cells; blank never overwrites) ────────────
  for (const part of chunk(toUpdate, 20)) {
    await Promise.all(
      part.map(async (r) => {
        const id = existingByBarcode.get(r.key)!;
        const patch = patchFrom(r.record, PRODUCT_COLUMNS);
        const cat = categoryIdFor(r);
        if (cat) patch.category_id = cat;
        const sup = supplierIdFor(r);
        if (sup) patch.preferred_supplier_id = sup;
        const { error } = await ctx.supabase
          .from("products")
          .update(patch)
          .eq("id", id)
          .eq("org_id", ctx.orgId);
        if (error) {
          out.errors.push({
            row: r.row,
            key: r.key,
            message: `Update failed: ${error.message}`,
          });
        } else {
          out.updated += 1;
        }
      })
    );
  }

  // ── Initial stock for the products we just created ───────────────────
  if (warehouse) {
    const placed = toCreate.filter(
      (r) => r.placement && createdIds.has(r.key)
    );
    let placedCount = 0;
    for (const part of chunk(placed, 200)) {
      const now = new Date().toISOString();
      const { error } = await ctx.supabase.from("locations").insert(
        part.map((r) => ({
          org_id: ctx.orgId,
          warehouse_id: warehouse!.id,
          section_id: r.placement!.section_id,
          bay: r.placement!.bay,
          level: r.placement!.level,
          product_id: createdIds.get(r.key)!,
          quantity: r.record.quantity as number,
          is_active: true,
          placed_by: ctx.user.id,
          placed_at: now,
        }))
      );
      if (error) {
        out.errors.push({
          row: part[0].row,
          key: "",
          message: `Products imported, but their on-hand rows failed: ${error.message}`,
        });
        continue;
      }
      placedCount += part.length;
      // Audit trail — the same "register" event a floor scan would write.
      await ctx.supabase.from("scan_history").insert(
        part.map((r) => ({
          org_id: ctx.orgId,
          product_id: createdIds.get(r.key)!,
          warehouse_id: warehouse!.id,
          scanned_by: ctx.user.id,
          action: "register",
          to_location: r.placement!.section_id
            ? {
                section_id: r.placement!.section_id,
                bay: r.placement!.bay,
                level: r.placement!.level,
              }
            : null,
          quantity: r.record.quantity as number,
          notes: "Imported with an initial count",
        }))
      );
    }
    if (placedCount > 0) {
      out.notes.push(
        `Recorded on-hand stock for ${placedCount} product${
          placedCount === 1 ? "" : "s"
        } at ${warehouse.name}`
      );
    }
  }

  out.errors.sort((a, b) => a.row - b.row);

  if (out.imported > 0 || out.updated > 0) {
    revalidatePath("/inventory");
    revalidateTag(tags.products(ctx.orgId));
    revalidateTag(tags.inventory(ctx.orgId));
    revalidateTag(tags.categories(ctx.orgId));
    revalidateTag(tags.suppliers(ctx.orgId));
    revalidateTag(tags.scans(ctx.orgId));
  }

  return out;
}
