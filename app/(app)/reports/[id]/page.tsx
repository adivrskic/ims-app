import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getActiveScope } from "@/lib/facilityScope";
import { getDatasetMeta, type ReportConfig } from "@/lib/reports-meta";
import { runReport } from "@/lib/data/reports";
import { deleteReport } from "../actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { CornerButton, CornerLink } from "@/components/ui/CornerButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArrowLeft, Download, Trash2, Table2 } from "lucide-react";

export const metadata = { title: "Report" };

const PREVIEW_LIMIT = 500;

export default async function ReportRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getCurrentOrgContext();
  if (!ctx) notFound();
  const supabase = await createClient();
  const scope = await getActiveScope();
  const warehouseId = scope.mode === "single" ? scope.id : null;

  const { data: report } = await supabase
    .from("saved_reports")
    .select("id, name, dataset, config")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!report) notFound();

  const r = report as {
    id: string;
    name: string;
    dataset: string;
    config: ReportConfig;
  };
  const meta = getDatasetMeta(r.dataset);
  const result = await runReport(supabase, ctx.orgId, r.dataset, r.config, {
    warehouseId,
    limit: PREVIEW_LIMIT,
  });

  const exportHref = `/reports/${r.id}/export${
    warehouseId ? `?facility=${warehouseId}` : ""
  }`;

  return (
    <div className="flex flex-col gap-24">
      <div className="flex flex-col gap-12">
        <Link
          href="/reports"
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors w-fit"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text">All reports</span>
        </Link>
        <PageHeader
          eyebrow={`Report · ${meta?.label ?? r.dataset}`}
          title={r.name}
          description={
            result
              ? `${result.rows.length}${
                  result.rows.length >= PREVIEW_LIMIT ? "+" : ""
                } rows · ${result.columns.length} columns${
                  warehouseId && scope.mode === "single" ? ` · ${scope.name}` : ""
                }`
              : "Unknown dataset."
          }
          actions={
            <div className="flex items-center gap-10">
              <CornerLink href={exportHref} variant="ghost" size="sm">
                <Download size={11} strokeWidth={1.5} />
                Export CSV
              </CornerLink>
              <form action={deleteReport}>
                <input type="hidden" name="id" value={r.id} />
                <CornerButton type="submit" variant="danger" size="sm">
                  <Trash2 size={11} strokeWidth={1.5} />
                  Delete
                </CornerButton>
              </form>
            </div>
          }
        />
      </div>

      {!result || result.rows.length === 0 ? (
        <EmptyState
          title="No rows"
          description="This report's filters returned nothing in the current scope. Adjust the filters or facility scope."
          icon={<Table2 size={20} strokeWidth={1.5} />}
        />
      ) : (
        <div className="hairline bg-[var(--surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  {result.columns.map((c) => (
                    <th
                      key={c.key}
                      className={`label-text px-14 py-12 font-normal ${
                        c.numeric ? "text-right" : "text-left"
                      }`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className="hairline-b last:border-b-0">
                    {result.columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-14 py-10 ${
                          c.numeric ? "text-right mono-sm tnum" : "mono-sm"
                        } text-text-secondary`}
                      >
                        {formatCell(row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.rows.length >= PREVIEW_LIMIT && (
            <p className="px-14 py-10 mono-sm text-text-dim hairline-t">
              Showing the first {PREVIEW_LIMIT} rows. Export CSV for the full set.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
}
