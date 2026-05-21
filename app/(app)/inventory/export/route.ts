import { createClient } from "@/lib/supabase/server";
import { type NextRequest } from "next/server";

/*
 * Inventory CSV export.
 *
 * Honors facility scope passed in via `?facility=<id>`. The inventory
 * page sets this query param when scope is "single" so the downloaded
 * CSV mirrors what the user sees on screen — on-hand counts narrowed
 * to a single facility's locations.
 *
 * Without a `?facility=`, exports the workspace-wide view (every
 * location across every facility).
 */

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const category = url.searchParams.get("category");
  const sort = url.searchParams.get("sort") ?? "updated";
  const order = url.searchParams.get("order") ?? "desc";
  const facilityId = url.searchParams.get("facility");

  /*
   * If a facility scope is passed, resolve its section IDs once.
   * Falls back to workspace-wide if `facility=all` or absent.
   */
  let validSectionIds: Set<string> | null = null;
  if (facilityId && facilityId !== "all") {
    const { data: sec } = await supabase
      .from("sections")
      .select("id")
      .eq("warehouse_id", facilityId);
    validSectionIds = new Set((sec ?? []).map((s) => s.id));
  }

  const SORT_COLUMNS: Record<string, string> = {
    name: "name",
    updated: "updated_at",
    reorder: "reorder_point",
    manufacturer: "manufacturer",
  };

  let query = supabase
    .from("products")
    .select(
      `
      id, name, barcode, internal_sku, manufacturer, reorder_point, updated_at,
      category:categories ( id, name ),
      locations:locations ( quantity, bay, level, section_id, section:sections ( code, name ) )
    `
    )
    .order(SORT_COLUMNS[sort] ?? "updated_at", {
      ascending: order === "asc",
      nullsFirst: false,
    });

  if (q && q.trim().length > 0) {
    const term = `%${q.trim()}%`;
    query = query.or(
      `name.ilike.${term},barcode.ilike.${term},internal_sku.ilike.${term}`
    );
  }
  if (category) query = query.eq("category_id", category);

  const { data: products } = await query;

  type ProductRow = {
    id: string;
    name: string;
    barcode: string;
    internal_sku: string | null;
    manufacturer: string | null;
    reorder_point: number | null;
    updated_at: string | null;
    category: { name: string } | { name: string }[] | null;
    locations: Array<{
      quantity: number | null;
      bay: number | null;
      level: number | null;
      section_id: string | null;
      section:
        | { code: string | null; name: string | null }
        | { code: string | null; name: string | null }[]
        | null;
    }> | null;
  };

  const lines: string[] = [];
  lines.push(
    [
      "SKU",
      "Name",
      "Barcode",
      "Category",
      "Manufacturer",
      "Reorder point",
      "On hand",
      "Section",
      "Updated",
    ].join(",")
  );

  for (const p of (products as ProductRow[] | null) ?? []) {
    const category = Array.isArray(p.category) ? p.category[0] : p.category;
    const allLocs = p.locations ?? [];

    // Apply scope filter — products stay (catalog view) but locations
    // narrow to only the active facility's sections.
    const locs = validSectionIds
      ? allLocs.filter(
          (l) => l.section_id && validSectionIds!.has(l.section_id)
        )
      : allLocs;

    const onHand = locs.reduce((sum, l) => sum + (l.quantity ?? 0), 0);
    const firstLoc = locs[0];
    const section = firstLoc
      ? Array.isArray(firstLoc.section)
        ? firstLoc.section[0]
        : firstLoc.section
      : null;

    lines.push(
      [
        csvCell(p.internal_sku ?? ""),
        csvCell(p.name),
        csvCell(p.barcode),
        csvCell(category?.name ?? ""),
        csvCell(p.manufacturer ?? ""),
        csvCell(p.reorder_point ?? 0),
        csvCell(onHand),
        csvCell(section?.code?.trim() ?? ""),
        csvCell(p.updated_at ?? ""),
      ].join(",")
    );
  }

  const csv = lines.join("\r\n");
  const today = new Date().toISOString().slice(0, 10);

  // Embed facility scope in the filename so a user with multiple
  // exports on disk can tell them apart at a glance.
  let suffix = "";
  if (facilityId && facilityId !== "all") {
    const { data: wh } = await supabase
      .from("warehouses")
      .select("name")
      .eq("id", facilityId)
      .maybeSingle();
    if (wh?.name) {
      const slug = wh.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      suffix = `-${slug}`;
    }
  }

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Nautilus-inventory${suffix}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
