"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ImportError {
  row: number;
  barcode: string;
  message: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: ImportError[];
}

const MAX_ROWS = 1000;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Minimal CSV parser that handles quoted cells, escaped quotes, and
 * commas inside quotes. Doesn't support multi-line cells — for our
 * use case (product imports) that's fine; if needed later we'd swap
 * to papaparse server-side.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  // Final row (no trailing newline)
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

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
    role: membership.role as string,
  };
}

export async function importProductsCsv(
  formData: FormData
): Promise<ImportResult> {
  const ctx = await getOrgContext();
  if ("error" in ctx) {
    return {
      imported: 0,
      skipped: 0,
      errors: [{ row: 0, barcode: "", message: ctx.error }],
    };
  }
  if (!["owner", "admin"].includes(ctx.role)) {
    return {
      imported: 0,
      skipped: 0,
      errors: [
        { row: 0, barcode: "", message: "Only admins can import products" },
      ],
    };
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return {
      imported: 0,
      skipped: 0,
      errors: [{ row: 0, barcode: "", message: "No file uploaded" }],
    };
  }
  if (file.size > MAX_BYTES) {
    return {
      imported: 0,
      skipped: 0,
      errors: [
        {
          row: 0,
          barcode: "",
          message: `File exceeds 5MB limit (${(file.size / 1024 / 1024).toFixed(
            1
          )}MB)`,
        },
      ],
    };
  }

  const text = await file.text();
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim().length > 0));

  if (rows.length === 0) {
    return {
      imported: 0,
      skipped: 0,
      errors: [{ row: 0, barcode: "", message: "Empty CSV" }],
    };
  }

  // First row = headers. Normalize: lowercase, trim, snake_case.
  const headers = rows[0].map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_")
  );
  const dataRows = rows.slice(1);

  if (dataRows.length > MAX_ROWS) {
    return {
      imported: 0,
      skipped: 0,
      errors: [
        {
          row: 0,
          barcode: "",
          message: `Row count exceeds ${MAX_ROWS} limit (got ${dataRows.length}). Split the file and re-upload.`,
        },
      ],
    };
  }

  // Header → column index map
  const idx = (name: string) => headers.indexOf(name);
  const iBarcode = idx("barcode");
  const iName = idx("name");
  const iSku = idx("internal_sku");
  const iManufacturer = idx("manufacturer");
  const iCategory = idx("category");
  const iReorder = idx("reorder_point");
  const iDimensions = idx("dimensions");
  const iWeight = idx("weight");
  const iNotes = idx("notes");

  if (iBarcode < 0) {
    return {
      imported: 0,
      skipped: 0,
      errors: [
        { row: 0, barcode: "", message: "Missing required column: barcode" },
      ],
    };
  }
  if (iName < 0) {
    return {
      imported: 0,
      skipped: 0,
      errors: [
        { row: 0, barcode: "", message: "Missing required column: name" },
      ],
    };
  }

  // Resolve category names → IDs, creating any that don't exist.
  // First pass: collect distinct non-empty category names from the file.
  const categoryNames = new Set<string>();
  if (iCategory >= 0) {
    for (const r of dataRows) {
      const n = (r[iCategory] ?? "").trim();
      if (n) categoryNames.add(n);
    }
  }

  const { data: existingCats } = await ctx.supabase
    .from("categories")
    .select("id, name");
  const catMap = new Map<string, string>(
    (existingCats ?? []).map((c) => [c.name.toLowerCase(), c.id])
  );

  // Create any missing categories in one batch.
  const missingCats = Array.from(categoryNames).filter(
    (n) => !catMap.has(n.toLowerCase())
  );
  if (missingCats.length > 0) {
    const { data: newCats } = await ctx.supabase
      .from("categories")
      .insert(
        missingCats.map((name) => ({
          org_id: ctx.orgId,
          name,
        }))
      )
      .select("id, name");
    for (const c of newCats ?? []) {
      catMap.set(c.name.toLowerCase(), c.id);
    }
  }

  // Pre-check duplicates in the workspace
  const fileBarcodes = dataRows
    .map((r) => (r[iBarcode] ?? "").trim())
    .filter(Boolean);
  const { data: existingProducts } = await ctx.supabase
    .from("products")
    .select("barcode")
    .in("barcode", fileBarcodes);
  const existingBarcodes = new Set(
    (existingProducts ?? []).map((p) => p.barcode)
  );

  // Validate + collect inserts
  const errors: ImportError[] = [];
  const seenInFile = new Set<string>();
  const inserts: Array<Record<string, unknown>> = [];
  let skipped = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const rowNum = i + 2; // 1-based, +1 for header
    const barcode = (r[iBarcode] ?? "").trim();
    const name = (r[iName] ?? "").trim();

    if (!barcode) {
      errors.push({ row: rowNum, barcode: "", message: "Missing barcode" });
      continue;
    }
    if (!name) {
      errors.push({ row: rowNum, barcode, message: "Missing name" });
      continue;
    }
    if (seenInFile.has(barcode)) {
      errors.push({
        row: rowNum,
        barcode,
        message: "Duplicate barcode within this file",
      });
      continue;
    }
    if (existingBarcodes.has(barcode)) {
      skipped++;
      errors.push({
        row: rowNum,
        barcode,
        message: "Already in catalog — skipped",
      });
      continue;
    }
    seenInFile.add(barcode);

    let reorderPoint = 0;
    if (iReorder >= 0) {
      const raw = (r[iReorder] ?? "").trim();
      if (raw) {
        const n = parseInt(raw, 10);
        if (Number.isNaN(n) || n < 0) {
          errors.push({
            row: rowNum,
            barcode,
            message: `reorder_point must be a non-negative integer (got "${raw}")`,
          });
          continue;
        }
        reorderPoint = n;
      }
    }

    let categoryId: string | null = null;
    if (iCategory >= 0) {
      const catName = (r[iCategory] ?? "").trim();
      if (catName) {
        categoryId = catMap.get(catName.toLowerCase()) ?? null;
        if (!categoryId) {
          // Shouldn't happen since we pre-created — but defensive
          errors.push({
            row: rowNum,
            barcode,
            message: `Category "${catName}" could not be created`,
          });
          continue;
        }
      }
    }

    inserts.push({
      org_id: ctx.orgId,
      barcode,
      name,
      internal_sku: iSku >= 0 ? (r[iSku] ?? "").trim() || null : null,
      manufacturer:
        iManufacturer >= 0 ? (r[iManufacturer] ?? "").trim() || null : null,
      category_id: categoryId,
      reorder_point: reorderPoint,
      dimensions:
        iDimensions >= 0 ? (r[iDimensions] ?? "").trim() || null : null,
      weight: iWeight >= 0 ? (r[iWeight] ?? "").trim() || null : null,
      notes: iNotes >= 0 ? (r[iNotes] ?? "").trim() || null : null,
    });
  }

  // Bulk insert. If this fails midway (e.g. constraint violation that
  // slipped past our checks), Postgres rolls back the batch — we'd get
  // 0 imported. For robustness in pathological cases we could chunk
  // into 100-row batches, but for the v1 import workflow this is fine.
  let imported = 0;
  if (inserts.length > 0) {
    const { data: inserted, error } = await ctx.supabase
      .from("products")
      .insert(inserts)
      .select("id");
    if (error) {
      errors.push({
        row: 0,
        barcode: "",
        message: `Insert failed: ${error.message}`,
      });
    } else {
      imported = inserted?.length ?? 0;
    }
  }

  if (imported > 0) {
    revalidatePath("/inventory");
  }

  return { imported, skipped, errors };
}
