import { getCurrentOrgContext } from "@/lib/data/user";
import { getValuation } from "@/lib/data/valuation";
import { csvCell } from "@/lib/print/csv";

export const dynamic = "force-dynamic";


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
    "fifo_value",
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
      p.fifoValue.toFixed(2),
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
