import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getDatasetMeta, type ReportConfig } from "@/lib/reports-meta";
import { runReport } from "@/lib/data/reports";

const EXPORT_LIMIT = 100_000;

function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Neutralize spreadsheet formula injection: Excel/Sheets evaluate a cell that
  // begins with = + - @ (or a leading tab/CR). Prefix such values with an
  // apostrophe so they render as literal text instead of executing.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrgContext();
  if (!ctx) return new Response("Not signed in", { status: 401 });

  const supabase = await createClient();
  const { data: report } = await supabase
    .from("saved_reports")
    .select("id, name, dataset, config")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!report) return new Response("Not found", { status: 404 });

  const r = report as {
    name: string;
    dataset: string;
    config: ReportConfig;
  };
  const facilityParam = new URL(req.url).searchParams.get("facility");
  const warehouseId =
    facilityParam && facilityParam !== "all" ? facilityParam : null;

  const result = await runReport(supabase, ctx.orgId, r.dataset, r.config, {
    warehouseId,
    limit: EXPORT_LIMIT,
  });
  if (!result) return new Response("Unknown dataset", { status: 400 });

  const lines: string[] = [];
  lines.push(result.columns.map((c) => csvCell(c.label)).join(","));
  for (const row of result.rows) {
    lines.push(result.columns.map((c) => csvCell(row[c.key])).join(","));
  }
  const csv = lines.join("\r\n");

  const today = new Date().toISOString().slice(0, 10);
  const slug =
    (getDatasetMeta(r.dataset)?.label ?? r.dataset)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "report";

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Nautilus-${slug}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
