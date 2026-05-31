import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getDatasetMeta } from "@/lib/reports-meta";
import { ReportBuilder } from "./ReportBuilder";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table2, ChevronRight } from "lucide-react";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) {
    return <PageHeader eyebrow="Operate" title="Reports" description="No workspace." />;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_reports")
    .select("id, name, dataset, created_at")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });
  const reports = (data ?? []) as Array<{
    id: string;
    name: string;
    dataset: string;
    created_at: string | null;
  }>;

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Operate"
        title="Reports"
        description="Build reusable reports over inventory, stock movements, and orders. Pick columns, filter, view, and export to CSV."
        meta={[{ label: "Saved", value: String(reports.length) }]}
      />

      <section aria-labelledby="saved">
        <SectionTitle numeral="01" eyebrow="Library" title="Saved reports" />
        {reports.length === 0 ? (
          <EmptyState
            title="No reports yet"
            description="Build one below — choose a dataset, pick columns and filters, and save it for reuse and CSV export."
            icon={<Table2 size={20} strokeWidth={1.5} />}
          />
        ) : (
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/reports/${r.id}`}
                  className="px-20 py-14 flex items-center gap-14 row-interactive"
                >
                  <Table2 size={13} strokeWidth={1.5} className="text-[var(--accent)] shrink-0" />
                  <span className="text-text" style={{ fontFamily: "var(--display)", fontSize: 14 }}>
                    {r.name}
                  </span>
                  <span className="mono-sm text-text-dim">
                    {getDatasetMeta(r.dataset)?.label ?? r.dataset}
                  </span>
                  <span className="mono-sm text-text-dim ml-auto">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : ""}
                  </span>
                  <ChevronRight size={14} strokeWidth={1.5} className="text-text-dim" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="new">
        <SectionTitle numeral="02" eyebrow="Build" title="New report" />
        <ReportBuilder />
      </section>
    </div>
  );
}
