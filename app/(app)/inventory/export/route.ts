import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SORT_COLUMNS: Record<string, string> = {
  name: "name",
  updated: "updated_at",
  reorder: "reorder_point",
  manufacturer: "manufacturer",
};

interface Location {
  quantity: number | null;
  section: { code: string | null } | { code: string | null }[] | null;
}

interface Product {
  name: string;
  barcode: string;
  internal_sku: string | null;
  manufacturer: string | null;
  reorder_point: number | null;
  updated_at: string | null;
  category: { name: string } | { name: string }[] | null;
  locations: Location[] | null;
}

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // RFC 4180: wrap in quotes if contains comma, quote, newline, or carriage return
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const q = params.get("q");
  const category = params.get("category");
  const rawSort = params.get("sort") ?? "updated";
  const rawOrder = params.get("order") ?? "desc";

  const sortCol = SORT_COLUMNS[rawSort] ?? "updated_at";
  const ascending = rawOrder === "asc";

  let query = supabase
    .from("products")
    .select(
      `
      name, barcode, internal_sku, manufacturer, reorder_point, updated_at,
      category:categories ( name ),
      locations:locations ( quantity, section:sections ( code ) )
    `
    )
    .order(sortCol, { ascending, nullsFirst: false })
    .limit(5000);

  if (q && q.trim().length > 0) {
    const term = `%${q.trim()}%`;
    query = query.or(
      `name.ilike.${term},barcode.ilike.${term},internal_sku.ilike.${term}`
    );
  }
  if (category) query = query.eq("category_id", category);

  const { data: products, error } = await query;
  if (error) {
    return new Response(`Export failed: ${error.message}`, { status: 500 });
  }

  const rows = (products ?? []) as Product[];

  const header = [
    "SKU",
    "Name",
    "Barcode",
    "Category",
    "Manufacturer",
    "Reorder Point",
    "On Hand",
    "Primary Section",
    "Last Updated",
  ];

  const lines = [header.map(csvCell).join(",")];

  for (const p of rows) {
    const category = Array.isArray(p.category) ? p.category[0] : p.category;
    const locs = p.locations ?? [];
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

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nimbus-inventory-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
