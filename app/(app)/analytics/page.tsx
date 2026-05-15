import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ScanAction } from "@/types/db";
import { BarChart3 } from "lucide-react";

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
  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);

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
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("scan_history").select("id", { count: "exact", head: true }),
    supabase
      .from("scan_history")
      .select("id", { count: "exact", head: true })
      .gte("scanned_at", today.toISOString()),
    supabase
      .from("scan_history")
      .select("id", { count: "exact", head: true })
      .gte("scanned_at", sevenDaysAgo.toISOString()),
    supabase.from("locations").select("quantity"),
    supabase.from("scan_history").select("action"),
    supabase
      .from("locations")
      .select("quantity, section:sections ( code, name, color )"),
    supabase
      .from("scan_history")
      .select("scanned_at")
      .gte("scanned_at", fourteenDaysAgo.toISOString()),
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
  const actions = Array.from(actionCounts.entries()).sort((a, b) => b[1] - a[1]);
  const maxAction = actions.reduce((m, [, n]) => Math.max(m, n), 1);

  const sectionMap = new Map<
    string,
    { code: string; name: string; color: string; quantity: number }
  >();
  (locationsForSections ?? []).forEach((row: { quantity: number | null; section: unknown }) => {
    const sec = Array.isArray(row.section)
      ? (row.section[0] as { code: string | null; name: string | null; color: string | null } | undefined)
      : (row.section as { code: string | null; name: string | null; color: string | null } | null);
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
  });
  const sections = Array.from(sectionMap.values()).sort((a, b) => b.quantity - a.quantity);
  const maxSectionQty = sections.reduce((m, s) => Math.max(m, s.quantity), 1);

  const trend = bucketByDay((scans14d ?? []) as { scanned_at: string | null }[]);
  const empty = (totalScans ?? 0) === 0 && (totalProducts ?? 0) === 0;

  return (
    <div className="flex flex-col gap-48">
      <PageHeader
        eyebrow="Workspace · Analytics"
        title="Operational"
        accent="analytics"
        description="Inventory health, scan velocity, and section utilization across all facilities."
        meta={[
          { label: "Window", value: "Last 14 days" },
          { label: "Last sync", value: "Just now", status: "live" },
        ]}
      />

      <section aria-labelledby="kpi-heading">
        <SectionTitle numeral="01" eyebrow="Signals" title="Headline" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-16">
          <KpiCard
            label="Products"
            value={(totalProducts ?? 0).toLocaleString()}
            spark={new Array(14).fill(totalProducts ?? 0)}
          />
          <KpiCard
            label="Units on hand"
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
            delta={{
              value:
                scansLast7 && scansToday
                  ? `${Math.round(((scansToday ?? 0) / Math.max(1, scansLast7)) * 100)}% today`
                  : "—",
              direction: (scansToday ?? 0) > 0 ? "up" : "flat",
              tone: (scansToday ?? 0) > 0 ? "good" : "neutral",
            }}
          />
        </div>
      </section>

      {empty ? (
        <EmptyState
          title="No data to analyze yet"
          description="Once products are registered and operators start scanning, this page will populate with velocity charts, depletion forecasts, and anomaly alerts."
          icon={<BarChart3 size={24} strokeWidth={1.5} />}
          numeral="00"
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-32">
          <section aria-labelledby="action-heading">
            <SectionTitle numeral="02" eyebrow="Breakdown" title="Scan actions" />
            {actions.length === 0 ? (
              <p className="mono-sm text-text-dim">No scans yet.</p>
            ) : (
              <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
                {actions.map(([action, count]) => (
                  <li key={action} className="px-20 py-14 flex items-center gap-16">
                    <span className="label-text text-text w-[110px] shrink-0">
                      {SCAN_LABEL[action]}
                    </span>
                    <div className="flex-1 h-6 bg-[var(--surface-2)] relative">
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-[var(--accent-deep)] to-[var(--accent)]"
                        style={{ width: `${(count / maxAction) * 100}%` }}
                        aria-hidden
                      />
                    </div>
                    <span className="mono-body text-text tnum w-[60px] text-right">
                      {count.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="section-heading">
            <SectionTitle numeral="03" eyebrow="Distribution" title="Stock by section" />
            {sections.length === 0 ? (
              <p className="mono-sm text-text-dim">No location data yet.</p>
            ) : (
              <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
                {sections.map((s) => (
                  <li key={s.code} className="px-20 py-14 flex items-center gap-16">
                    <span
                      className="w-12 h-12 shrink-0"
                      style={{ background: s.color }}
                      aria-hidden
                    />
                    <div className="w-[130px] shrink-0 min-w-0">
                      <p className="mono-body text-text">{s.code}</p>
                      <p className="mono-sm text-text-muted truncate">{s.name}</p>
                    </div>
                    <div className="flex-1 h-6 bg-[var(--surface-2)] relative">
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-[var(--accent-deep)] to-[var(--accent)]"
                        style={{ width: `${(s.quantity / maxSectionQty) * 100}%` }}
                        aria-hidden
                      />
                    </div>
                    <span className="mono-body text-text tnum w-[80px] text-right">
                      {s.quantity.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
