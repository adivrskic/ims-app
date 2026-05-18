/*
 * Download a starter CSV with the expected columns and one example row.
 * Linked from /inventory/import as "Download template".
 */
export async function GET() {
  const lines = [
    "barcode,name,internal_sku,manufacturer,category,reorder_point,dimensions,weight,notes",
    'EX-0001-DEMO,Example Product (delete this row),SKU-EX-0001,Demo Brand,Hardwood,10,"12x24x0.5in",2.4lb,Sample row — replace with real data',
  ];
  const csv = lines.join("\r\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="nimbus-products-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
