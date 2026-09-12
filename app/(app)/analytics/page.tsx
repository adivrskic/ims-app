import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerLink } from "@/components/ui/CornerButton";
import type { ScanAction } from "@/types/db";
import { BarChart3, Scale, Snowflake, Boxes, LineChart } from "lucide-react";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { getCurrentOrgContext } from "@/lib/data/user";
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
  putaway: "Put away",
  transfer: "Transferred",
};

/* bucketByDay used to live here, folding raw scan rows into day buckets in JS.
   app.overview_scan_trend does it in Postgres now — same RPC the Overview
   dashboard uses, so both pages draw the identical curve. */

/** Days in the activity sparkline; bucket TREND_DAYS-1 is today. */
const TREND_DAYS = 14;

export default async function AnalyticsPage() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) {
    return (
      <PageHeader
        eyebrow="Workspace · Analytics"
        title="Operational"
        description="No workspace."
      />
    );
  }
  const scope = await getActiveScope();
  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);

  /*
   * Build each count with the optional scope filter. Products stays
   * workspace-wide (org catalog); scan_history has warehouse_id directly so
   * the .eq is straightforward. (The aggregates below take p_warehouse.)
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

  /*
   * Everything below is aggregated in Postgres
   * (20260912120000_analytics_page_aggregate_rpcs). These were plain .select()
   * calls that PostgREST caps at ~1000 rows, while the KPIs beside them use
   * exact counts — so past ~1000 rows the bars and percentages silently
   * disagreed with the headline numbers. The stock total and the section split
   * now come out of ONE aggregate, so they cannot drift apart again.
   */
  const facilityId = scope.mode === "single" ? scope.id : null;

  const stockBySectionQuery = supabase.rpc("analytics_stock_by_section", {
    p_org: ctx.orgId,
    p_warehouse: facilityId,
  });

  const actionMixQuery = supabase.rpc("analytics_action_mix", {
    p_org: ctx.orgId,
    p_warehouse: facilityId,
  });

  // Same RPC (and same local-midnight bucket origin) as the Overview
  // dashboard, so the two pages can't show different 14-day curves.
  const trendStart = new Date(today);
  trendStart.setDate(today.getDate() - (TREND_DAYS - 1));
  const trendQuery = supabase.rpc("overview_scan_trend", {
    p_org: ctx.orgId,
    p_start: trendStart.toISOString(),
    p_days: TREND_DAYS,
    p_warehouse: facilityId,
  });

  // Low-stock SKUs: products with a reorder point whose on-hand is at/below it.
  // Workspace-wide, matching how the product count is treated on this page.
  const lowStockQuery = supabase.rpc("analytics_low_stock_count", {
    p_org: ctx.orgId,
  });

  const [
    { count: totalProducts },
    { count: totalScans },
    { count: scansToday },
    { count: scansLast7 },
    { data: stockBySection },
    { data: actionMix },
    { data: trendRows },
    { data: lowStockTotal },
  ] = await Promise.all([
    totalProductsQuery,
    totalScansQuery,
    scansTodayQuery,
    scansLast7Query,
    stockBySectionQuery,
    actionMixQuery,
    trendQuery,
    lowStockQuery,
  ]);

  // bigint/numeric arrive as strings over PostgREST — coerce, don't trust.
  const lowStockCount = Number(lowStockTotal ?? 0);

  const sectionRows = (stockBySection ?? []) as Array<{
    section_code: string | null;
    section_name: string | null;
    section_color: string | null;
    quantity: number | string | null;
    total_quantity: number | string | null;
  }>;

  // Window-functioned onto every row, so any row carries the true grand total —
  // it covers the section_code = null bucket (stock in locations with no
  // section, counted in the total but not listed below, exactly as the old JS
  // did) and survives even if the section list itself were ever capped.
  const totalStock = Number(sectionRows[0]?.total_quantity ?? 0);

  const actions = (
    (actionMix ?? []) as Array<{
      action: string;
      scan_count: number | string | null;
    }>
  )
    .map(
      (r) => [r.action as ScanAction, Number(r.scan_count ?? 0)] as const
    )
    .sort((a, b) => b[1] - a[1]);
  const maxAction = actions.reduce((m, [, n]) => Math.max(m, n), 1);

  const sections = sectionRows
    .filter((r) => r.section_code)
    .map((r) => ({
      code: r.section_code as string,
      name: r.section_name ?? "",
      color: r.section_color ?? "#737373",
      quantity: Number(r.quantity ?? 0),
    }))
    .sort((a, b) => b.quantity - a.quantity);
  const maxSectionQty = sections.reduce((m, s) => Math.max(m, s.quantity), 1);

  // The RPC returns only non-empty buckets; zero-fill the rest.
  const trend = new Array<number>(TREND_DAYS).fill(0);
  for (const r of (trendRows ?? []) as Array<{
    day_offset: number;
    scan_count: number | string;
  }>) {
    if (r.day_offset >= 0 && r.day_offset < TREND_DAYS) {
      trend[r.day_offset] = Number(r.scan_count ?? 0);
    }
  }

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
          // A hard-coded "Last sync: Just now" with a live dot used to sit
          // here. Nothing synced and nothing was live — this page has no
          // realtime subscription (unlike Overview, whose "Live" status is
          // backed by OverviewRealtime). Report something true instead: the
          // scope these figures cover.
          {
            label: scope.mode === "single" ? "Facility" : "Scope",
            value: scope.mode === "single" ? scope.name : "All facilities",
          },
        ]}
        actions={
          <div className="flex items-center gap-10">
            <CornerLink href="/analytics/valuation" variant="ghost" size="sm">
              <Scale size={11} strokeWidth={1.5} />
              Valuation
            </CornerLink>
            <CornerLink href="/analytics/dead-stock" variant="ghost" size="sm">
              <Snowflake size={11} strokeWidth={1.5} />
              Dead stock
            </CornerLink>
            <CornerLink href="/analytics/slotting" variant="ghost" size="sm">
              <Boxes size={11} strokeWidth={1.5} />
              Slotting
            </CornerLink>
            <CornerLink href="/analytics/forecast" variant="ghost" size="sm">
              <LineChart size={11} strokeWidth={1.5} />
              Forecast
            </CornerLink>
          </div>
        }
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
              lowStockCount,
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
            // Flat fill — we don't track historical on-hand, so don't fabricate a
            // trend curve (matches the Products card above).
            spark={new Array(14).fill(totalStock)}
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
