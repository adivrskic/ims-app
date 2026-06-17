import { getCurrentOrgContext } from "@/lib/data/user";

export const dynamic = "force-dynamic";

/**
 * CSV template for the product import flow. Columns mirror what
 * importProductsCsv parses: barcode + name are required; the rest are optional.
 */
export async function GET() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const header = [
    "barcode",
    "name",
    "internal_sku",
    "manufacturer",
    "category",
    "reorder_point",
    "dimensions",
    "weight",
    "notes",
  ];
  const example = [
    "0123456789012",
    "White Oak Plank 7in",
    "WO-PLK-7",
    "Acme Flooring",
    "Hardwood",
    "20",
    '48x7x0.75 in',
    "2.4 lb",
    "Matte finish",
  ];
  const csv = [header, example].map((r) => r.join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="product-import-template.csv"',
    },
  });
}
