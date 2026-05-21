import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ScanAction } from "@/types/db";
import { BarChart3 } from "lucide-react";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { Suspense } from "react";
import { ForecastNarration } from "@/components/analytics/ForecastNarration";

export const metadata = { title: "Analytics" };

const SCAN_LABEL: Record<ScanAction, string> = {
  register: "Registered",
  locate: "Located",
  relocate: "Relocated",
  pick: "Picked",
  receive: "Received",
  return: "Returned",
  cycle_count: "Counted",
  adjust: "Adjusted",
};

function bucketByDay(scans: { scanned_at: string | null }[]): number[] {
  const buckets = new Array<number>(14).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  scans.forEach((s) => {
    if (!s.scanned_at) return;
    const d = new Date(s.scanned_at);
    d.setHours(0, 0, 0, 0);
    const idx = 13 - Math.floor((todayMs - d.getTime()) / 86400000);
    if (idx >= 0 && idx < 14) buckets[idx]++;
  });
  return buckets;
}

export default async function AnalyticsPage() {
  const scope = await getActiveScope();
  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);

  /*
   * Build each query with the optional scope filter. Products stays
   * workspace-wide (org catalog); scan_history and locations both have
   * warehouse_id directly so the .eq is straightforward.
   */
  const totalProductsQuery = supabase
    .from("products")
    .select("id", { count: "exact", head: true });

  let totalScansQuery = supabase
    .from("scan_history")
    .select("id", { count: "exact", head: true });
  if (scope.mode === "single") {
    totalScansQuery = totalScansQuery.eq("warehouse_id", scope.id);
  }

  let scansTodayQuery = supabase
    .from("scan_history")
    .select("id", { count: "exact", head: true })
    .gte("scanned_at", today.toISOString());
  if (scope.mode === "single") {
    scansTodayQuery = scansTodayQuery.eq("warehouse_id", scope.id);
  }

  let scansLast7Query = supabase
    .from("scan_history")
    .select("id", { count: "exact", head: true })
    .gte("scanned_at", sevenDaysAgo.toISOString());
  if (scope.mode === "single") {
    scansLast7Query = scansLast7Query.eq("warehouse_id", scope.id);
  }

  let locationsForStockQuery = supabase.from("locations").select("quantity");
  if (scope.mode === "single") {
    locationsForStockQuery = locationsForStockQuery.eq(
      "warehouse_id",
      scope.id
    );
  }

  let scansForActionsQuery = supabase.from("scan_history").select("action");
  if (scope.mode === "single") {
    scansForActionsQuery = scansForActionsQuery.eq("warehouse_id", scope.id);
  }

  let locationsForSectionsQuery = supabase
    .from("locations")
    .select("quantity, section:sections ( code, name, color )");
  if (scope.mode === "single") {
    locationsForSectionsQuery = locationsForSectionsQuery.eq(
      "warehouse_id",
      scope.id
    );
  }

  let scans14dQuery = supabase
    .from("scan_history")
    .select("scanned_at")
    .gte("scanned_at", fourteenDaysAgo.toISOString());
  if (scope.mode === "single") {
    scans14dQuery = scans14dQuery.eq("warehouse_id", scope.id);
  }

  const [
    { count: totalProducts },
    { count: totalScans },
    { count: scansToday },
    { count: scansLast7 },
    { data: locationsForStock },
    { data: scansForActions },
    { data: locationsForSections },
    { data: scans14d },
  ] = await Promise.all([
    totalProductsQuery,
    totalScansQuery,
    scansTodayQuery,
    scansLast7Query,
    locationsForStockQuery,
    scansForActionsQuery,
    locationsForSectionsQuery,
    scans14dQuery,
  ]);

  const totalStock = (locationsForStock ?? []).reduce(
    (sum: number, l: { quantity: number | null }) => sum + (l.quantity ?? 0),
    0
  );

  const actionCounts = new Map<ScanAction, number>();
  (scansForActions ?? []).forEach((s: { action: string }) => {
    const action = s.action as ScanAction;
    actionCounts.set(action, (actionCounts.get(action) ?? 0) + 1);
  });
  const actions = Array.from(actionCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  );
  const maxAction = actions.reduce((m, [, n]) => Math.max(m, n), 1);

  const sectionMap = new Map<
    string,
    { code: string; name: string; color: string; quantity: number }
  >();
  (locationsForSections ?? []).forEach(
    (row: { quantity: number | null; section: unknown }) => {
      const sec = Array.isArray(row.section)
        ? (row.section[0] as
            | { code: string | null; name: string | null; color: string | null }
            | undefined)
        : (row.section as {
            code: string | null;
            name: string | null;
            color: string | null;
          } | null);
      if (!sec?.code) return;
      const key = sec.code.trim();
      const existing = sectionMap.get(key) ?? {
        code: key,
        name: sec.name ?? "",
        color: sec.color ?? "#737373",
        quantity: 0,
      };
      existing.quantity += row.quantity ?? 0;
      sectionMap.set(key, existing);
    }
  );
  const sections = Array.from(sectionMap.values()).sort(
    (a, b) => b.quantity - a.quantity
  );
  const maxSectionQty = sections.reduce((m, s) => Math.max(m, s.quantity), 1);

  const trend = bucketByDay(
    (scans14d ?? []) as { scanned_at: string | null }[]
  );
  const empty = (totalScans ?? 0) === 0 && (totalProducts ?? 0) === 0;

  return (
    <div className="flex flex-col gap-48">
      <PageHeader
        eyebrow="Workspace · Analytics"
        title="Operational"
        description={scopeDescription(scope, {
          all: "Inventory health, scan velocity, and section utilization across all facilities.",
          single: (name) =>
            `Inventory health, scan velocity, and section utilization at ${name}.`,
        })}
        meta={[
          { label: "Window", value: "Last 14 days" },
          { label: "Last sync", value: "Just now", status: "live" },
        ]}
      />

      {!empty && (
        <Suspense fallback={null}>
          <ForecastNarration
            scope={
              scope.mode === "single" ? `facility:${scope.name}` : "workspace"
            }
            window={{
              start: fourteenDaysAgo.toISOString().slice(0, 10),
              end: today.toISOString().slice(0, 10),
            }}
            metrics={{
              totalScans: totalScans ?? 0,
              scansToday: scansToday ?? 0,
              scansLast7: scansLast7 ?? 0,
              totalStock,
              lowStockCount: 0,
              actionMix: actions.map(([action, count]) => ({
                action: String(action),
                count,
                pct: Math.round((count / (totalScans ?? 1)) * 100),
              })),
              trend14d: trend,
              topSections: sections.slice(0, 3).map((s) => ({
                code: s.code,
                pct: Math.round((s.quantity / Math.max(1, totalStock)) * 100),
              })),
            }}
          />
        </Suspense>
      )}

      <section aria-labelledby="kpi-heading">
        <SectionTitle numeral="01" eyebrow="Signals" title="Headline" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-16">
          <KpiCard
            label="Products"
            value={(totalProducts ?? 0).toLocaleString()}
            spark={new Array(14).fill(totalProducts ?? 0)}
          />
          <KpiCard
            label={scope.mode === "single" ? "Units here" : "Units on hand"}
            value={totalStock.toLocaleString()}
            spark={trend.map((v) => v * 1.2 + Math.min(50, totalStock) * 0.5)}
          />
          <KpiCard
            label="Scans · today"
            value={(scansToday ?? 0).toLocaleString()}
            spark={trend}
            delta={{
              value: `${trend.reduce((a, b) => a + b, 0)} in last 14d`,
              direction: "flat",
              tone: "neutral",
            }}
          />
          <KpiCard
            label="Scans · 7d"
            value={(scansLast7 ?? 0).toLocaleString()}
            spark={trend.slice(-7)}
          />
        </div>
      </section>

      {empty ? (
        <EmptyState
          title={
            scope.mode === "single"
              ? `No activity at ${scope.name} yet`
              : "No analytics data yet"
          }
          description="Once your team registers products and starts scanning, charts and breakdowns will populate here."
          icon={<BarChart3 size={20} strokeWidth={1.5} />}
        />
      ) : (
        <>
          <section aria-labelledby="action-mix">
            <SectionTitle
              numeral="02"
              eyebrow="Action mix"
              title="Scan distribution"
            />
            {actions.length === 0 ? (
              <p className="mono-sm text-text-muted">
                No scans recorded in this scope.
              </p>
            ) : (
              <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
                {actions.map(([action, count]) => {
                  const pct = Math.round((count / (totalScans ?? 1)) * 100);
                  const barWidth = (count / maxAction) * 100;
                  return (
                    <li
                      key={action}
                      className="px-20 py-12 flex items-center gap-14"
                    >
                      <span
                        className="text-text w-[110px] shrink-0"
                        style={{
                          fontFamily: "var(--display)",
                          fontSize: 13,
                        }}
                      >
                        {SCAN_LABEL[action]}
                      </span>
                      <div className="flex-1 relative h-8 bg-[var(--surface-2)] overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 bg-[var(--accent)]"
                          style={{ width: `${barWidth}%` }}
                          aria-hidden
                        />
                      </div>
                      <span
                        className="mono-body tnum text-text w-[64px] text-right"
                        style={{ fontSize: 13 }}
                      >
                        {count.toLocaleString()}
                      </span>
                      <span className="mono-sm tnum text-text-dim w-[36px] text-right">
                        {pct}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="section-util">
            <SectionTitle
              numeral="03"
              eyebrow="Distribution"
              title={
                scope.mode === "single"
                  ? `Where units live at ${scope.name}`
                  : "Where units live"
              }
            />
            {sections.length === 0 ? (
              <p className="mono-sm text-text-muted">
                No section data in this scope.
              </p>
            ) : (
              <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
                {sections.map((s) => {
                  const barWidth = (s.quantity / maxSectionQty) * 100;
                  const pct = Math.round(
                    (s.quantity / (totalStock || 1)) * 100
                  );
                  return (
                    <li
                      key={s.code}
                      className="px-20 py-12 flex items-center gap-14"
                    >
                      <span
                        className="w-10 h-10 shrink-0"
                        style={{ background: s.color }}
                        aria-hidden
                      />
                      <span
                        className="text-text w-[80px] shrink-0"
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        {s.code}
                      </span>
                      <span className="text-text-secondary flex-1 truncate mono-sm">
                        {s.name}
                      </span>
                      <div className="w-[160px] relative h-8 bg-[var(--surface-2)] overflow-hidden shrink-0">
                        <div
                          className="absolute inset-y-0 left-0"
                          style={{
                            width: `${barWidth}%`,
                            background: s.color,
                          }}
                          aria-hidden
                        />
                      </div>
                      <span
                        className="mono-body tnum text-text w-[80px] text-right"
                        style={{ fontSize: 13 }}
                      >
                        {s.quantity.toLocaleString()}
                      </span>
                      <span className="mono-sm tnum text-text-dim w-[36px] text-right">
                        {pct}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
