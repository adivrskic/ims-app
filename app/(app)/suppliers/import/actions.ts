"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { tags } from "@/lib/cache-tags";
import { SUPPLIER_SPEC } from "@/lib/import/specs";
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

const SUPPLIER_COLUMNS = [
  "contact_name",
  "email",
  "phone",
  "website",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "zip",
  "country",
  "tax_id",
  "account_number",
  "payment_terms",
  "default_lead_time_days",
  "notes",
];

/** Supplier import — same engine and two-phase flow as products; keyed by name. */
export async function importSuppliers(
  formData: FormData
): Promise<ImportOutcome> {
  const mode = readImportMode(formData);
  const existingMode = readExistingMode(formData);

  const ctx = await getActionContext();
  if ("error" in ctx) return emptyOutcome(mode, ctx.error);
  if (!ctx.can("suppliers.manage")) {
    return emptyOutcome(mode, "You don't have permission to manage suppliers.");
  }

  const input = await readImportInput(formData);
  if ("fatal" in input) return emptyOutcome(mode, input.fatal);

  const { preview, rows } = prepareImport(input.text, SUPPLIER_SPEC);
  const out: ImportOutcome = {
    ...preview,
    mode,
    imported: 0,
    updated: 0,
    skipped: 0,
    notes: [],
  };
  if (preview.fatal) return out;

  const { data: existingRows } = await ctx.supabase
    .from("suppliers")
    .select("id, name")
    .eq("org_id", ctx.orgId);
  const existing = new Map<string, string>();
  for (const s of existingRows ?? []) existing.set(s.name.toLowerCase(), s.id);

  const toCreate: BuiltRow[] = [];
  const toUpdate: BuiltRow[] = [];
  for (const r of rows) {
    if (existing.has(r.key.toLowerCase())) {
      if (existingMode === "update") toUpdate.push(r);
      else {
        out.skipped += 1;
        out.errors.push({
          row: r.row,
          key: r.key,
          message:
            "Already in your directory — skipped (turn on “Update existing” to overwrite)",
        });
      }
      continue;
    }
    toCreate.push(r);
  }
  out.errors.sort((a, b) => a.row - b.row);
  out.valid = toCreate.length + toUpdate.length;

  const summary: string[] = [];
  if (toCreate.length > 0) summary.push(`${toCreate.length} new`);
  if (toUpdate.length > 0) summary.push(`${toUpdate.length} to update`);
  if (out.skipped > 0) summary.push(`${out.skipped} already in your directory`);
  if (summary.length > 0) out.notes.push(summary.join(" · "));

  if (mode === "check") return out;

  for (const part of chunk(toCreate, 200)) {
    const { data, error } = await ctx.supabase
      .from("suppliers")
      .insert(
        part.map((r) => ({
          org_id: ctx.orgId,
          name: r.key,
          contact_name: r.record.contact_name ?? null,
          email: r.record.email ?? null,
          phone: r.record.phone ?? null,
          website: r.record.website ?? null,
          address_line1: r.record.address_line1 ?? null,
          address_line2: r.record.address_line2 ?? null,
          city: r.record.city ?? null,
          state: r.record.state ?? null,
          zip: r.record.zip ?? null,
          country: r.record.country ?? "US",
          tax_id: r.record.tax_id ?? null,
          account_number: r.record.account_number ?? null,
          payment_terms: r.record.payment_terms ?? "net_30",
          default_lead_time_days: r.record.default_lead_time_days ?? null,
          notes: r.record.notes ?? null,
          is_active: true,
          created_by: ctx.user.id,
        }))
      )
      .select("id");
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
    out.imported += data?.length ?? 0;
  }

  for (const part of chunk(toUpdate, 20)) {
    await Promise.all(
      part.map(async (r) => {
        const id = existing.get(r.key.toLowerCase())!;
        const patch = patchFrom(r.record, SUPPLIER_COLUMNS);
        if (Object.keys(patch).length === 0) return;
        const { error } = await ctx.supabase
          .from("suppliers")
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
  out.errors.sort((a, b) => a.row - b.row);

  if (out.imported > 0 || out.updated > 0) {
    revalidatePath("/suppliers");
    revalidateTag(tags.suppliers(ctx.orgId));
  }
  return out;
}
