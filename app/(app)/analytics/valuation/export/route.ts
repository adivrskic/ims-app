import { getCurrentOrgContext } from "@/lib/data/user";
import { getValuation } from "@/lib/data/valuation";

export const dynamic = "force-dynamic";

function csvCell(v: string | number | null): string {
  if (v == null) return "";
  let s = String(v);
  // Neutralize spreadsheet formula injection: Excel/Sheets evaluate a cell that
  // begins with = + - @ (or a leading tab/CR). Prefix such values with an
  // apostrophe so they render as literal text instead of executing.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const facility = new URL(req.url).searchParams.get("facility");
  const r = await getValuation(ctx.orgId, facility || null);

  const header = [
    "sku",
    "product",
    "category",
    "abc_class",
    "on_hand",
    "unit_cost",
    "value",
    "days_since_last_movement",
  ];
  const rows = r.products.map((p) =>
    [
      p.sku ?? "",
      p.name,
      p.categoryName ?? "",
      p.abc,
      p.onHand,
      p.unitCost.toFixed(2),
      p.value.toFixed(2),
      p.lastMovedDays ?? "",
    ]
      .map(csvCell)
      .join(",")
  );
  const csv = [header.join(","), ...rows].join("\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inventory-valuation-${stamp}.csv"`,
    },
  });
}
