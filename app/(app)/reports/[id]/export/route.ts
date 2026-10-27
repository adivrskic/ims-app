import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import {
  isTrialExpired,
  trialEndedExportResponse,
} from "@/lib/data/entitlement";
import { getDatasetMeta, type ReportConfig } from "@/lib/reports-meta";
import { runReport } from "@/lib/data/reports";
import { csvCell } from "@/lib/print/csv";
import { isUuid } from "@/lib/net/validate";

// The dataset runners in lib/data/reports.ts page their reads in 1000-row
// steps up to this many rows (PostgREST caps a single response at ~1000).
const EXPORT_LIMIT = 100_000;


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrgContext();
  if (!ctx) return new Response("Not signed in", { status: 401 });
  if (await isTrialExpired(ctx.orgId)) return trialEndedExportResponse();

  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const facilityParam = new URL(req.url).searchParams.get("facility");
  if (facilityParam && facilityParam !== "all" && !isUuid(facilityParam)) {
    return new Response("facility must be a UUID", { status: 400 });
  }
  const warehouseId =
    facilityParam && facilityParam !== "all" ? facilityParam : null;

  const supabase = await createClient();
  const { data: report, error: reportErr } = await supabase
    .from("saved_reports")
    .select("id, name, dataset, config")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (reportErr) {
    console.error("report export lookup failed:", reportErr.message);
    return new Response("Export failed", { status: 500 });
  }
  if (!report) return new Response("Not found", { status: 404 });

  const r = report as {
    name: string;
    dataset: string;
    config: ReportConfig;
  };

  let result: Awaited<ReturnType<typeof runReport>>;
  try {
    result = await runReport(supabase, ctx.orgId, r.dataset, r.config, {
      warehouseId,
      limit: EXPORT_LIMIT,
    });
  } catch (e) {
    // A query error is a 500, not a well-formed CSV with only a header row.
    console.error(
      "report export query failed:",
      e instanceof Error ? e.message : e
    );
    return new Response("Export failed", { status: 500 });
  }
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
