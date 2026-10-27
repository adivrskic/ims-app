import { getCurrentOrgContext } from "@/lib/data/user";
import {
  isTrialExpired,
  trialEndedExportResponse,
} from "@/lib/data/entitlement";
import { getValuation } from "@/lib/data/valuation";
import { csvCell } from "@/lib/print/csv";
import { isUuid } from "@/lib/net/validate";

export const dynamic = "force-dynamic";


export async function GET(req: Request) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (await isTrialExpired(ctx.orgId)) return trialEndedExportResponse();

  const facility = new URL(req.url).searchParams.get("facility");
  if (facility && facility !== "all" && !isUuid(facility)) {
    return new Response("facility must be a UUID", { status: 400 });
  }

  // getValuation already pages every read (lib/data/paginate) and throws on a
  // failed query — answer 500 rather than a header-only CSV.
  let r: Awaited<ReturnType<typeof getValuation>>;
  try {
    r = await getValuation(
      ctx.orgId,
      facility && facility !== "all" ? facility : null
    );
  } catch (e) {
    console.error(
      "valuation export failed:",
      e instanceof Error ? e.message : e
    );
    return new Response("Export failed", { status: 500 });
  }

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
      // Financial figures scoped to a session — never let a shared cache
      // hand one workspace's valuation to another.
      "Cache-Control": "no-store",
    },
  });
}
