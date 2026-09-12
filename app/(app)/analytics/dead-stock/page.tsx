import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { ScopeFilter } from "@/components/dashboard/ScopeFilter";
import { parseScope } from "@/lib/scope";
import { formatCurrency } from "@/lib/dashboard";
import { Hourglass, ChevronRight } from "lucide-react";

export const metadata = { title: "Dead stock · Analytics" };

const THRESHOLDS = [60, 90, 180, 365] as const;
type Threshold = (typeof THRESHOLDS)[number];

const SORT_KEYS = ["value", "quantity", "days_inactive"] as const;
type SortKey = (typeof SORT_KEYS)[number];

const SORT_LABEL: Record<SortKey, string> = {
  value: "Tied-up value",
  quantity: "Quantity",
  days_inactive: "Days inactive",
};

/**
 * Rows rendered in the table. The analysis itself covers the whole catalog —
 * this only caps how much HTML we ship, and the rows kept are the top ones by
 * the active sort, so changing the sort really does change what you can see.
 */
const DISPLAY_LIMIT = 500;

interface SearchParams {
  warehouse?: string;
  range?: string;
  threshold?: string;
  sort?: string;
}

function parseThreshold(raw: string | undefined): Threshold {
  const n = parseInt(raw ?? "", 10);
  return (THRESHOLDS as readonly number[]).includes(n) ? (n as Threshold) : 90;
}

function parseSort(raw: string | undefined): SortKey {
  return (SORT_KEYS as readonly string[]).includes(raw ?? "")
    ? (raw as SortKey)
    : "value";
}

export default async function DeadStockPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const scope = parseScope(params);
  const threshold = parseThreshold(params.threshold);
  const sortKey = parseSort(params.sort);
  const ctx = await getCurrentOrgContext();
  if (!ctx) {
    return (
      <PageHeader
        backHref="/analytics"
        backLabel="Analytics"
        eyebrow="Analytics · Reports"
        title="Dead stock"
        description="No workspace."
      />
    );
  }
  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thresholdDate = new Date(today);
  thresholdDate.setDate(today.getDate() - threshold);

  // Last-pick display floor: the table shows "365+ days" for anything older,
  // so the RPC only needs a year of pick history to render the date column.
  const oneYearAgo = new Date(today);
  oneYearAgo.setDate(today.getDate() - 365);

  /*
   * The whole analysis now happens in Postgres
   * (20260912120000_analytics_page_aggregate_rpcs). This page used to fetch the
   * catalog with limit(501) — ordered by NAME — plus a nested locations embed,
   * analyse the first 500 products and tell the user to "narrow with a
   * warehouse filter or a shorter threshold". Neither helped: the cap was on
   * products FETCHED alphabetically, so a shorter threshold changed nothing and
   * products 501+ were simply invisible, KPIs included.
   *
   * app.dead_stock_rows filters and sorts the FULL catalog, returns the top
   * DISPLAY_LIMIT rows by the sort the user actually picked, and carries the
   * summary totals as window aggregates over every dormant row — so the KPIs
   * are exact even when the table below them is capped, and the cap is now
   * something the sort control genuinely moves.
   */
  const deadStockQ = supabase.rpc("dead_stock_rows", {
    p_org: ctx.orgId,
    p_threshold: thresholdDate.toISOString(),
    p_since: oneYearAgo.toISOString(),
    p_warehouse: scope.warehouseId,
    p_sort: sortKey,
    p_limit: DISPLAY_LIMIT,
  });

  const [{ data: warehouses }, { data: deadStock }] = await Promise.all([
    supabase
      .from("warehouses")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    deadStockQ,
  ]);

  type Row = {
    id: string;
    name: string;
    barcode: string;
    category_name: string | null;
    on_hand: number;
    unit_cost: number | null;
    tied_value: number | null;
    last_pick: Date | null;
    days_inactive: number; // 366 = "never within 365d"
  };

  // numeric/bigint arrive as strings over PostgREST — coerce, don't trust.
  const deadRows = (deadStock ?? []) as Array<{
    id: string;
    name: string;
    barcode: string;
    category_name: string | null;
    on_hand: number | string | null;
    unit_cost: number | string | null;
    tied_value: number | string | null;
    last_pick_at: string | null;
    total_skus: number | string | null;
    total_units: number | string | null;
    total_value: number | string | null;
    valued_skus: number | string | null;
  }>;

  const rows: Row[] = deadRows.map((r) => {
    const last_pick = r.last_pick_at ? new Date(r.last_pick_at) : null;
    return {
      id: r.id,
      name: r.name,
      barcode: r.barcode,
      category_name: r.category_name,
      on_hand: Number(r.on_hand ?? 0),
      unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
      tied_value: r.tied_value != null ? Number(r.tied_value) : null,
      last_pick,
      days_inactive: last_pick
        ? Math.floor((today.getTime() - last_pick.getTime()) / 86_400_000)
        : 366,
    };
  });

  // Aggregate KPIs — window-functioned onto every row, so any row carries the
  // true totals for the whole dormant set, not just the displayed page.
  const first = deadRows[0];
  const totalSkus = Number(first?.total_skus ?? 0);
  const totalUnits = Number(first?.total_units ?? 0);
  const totalValueKnown = Number(first?.total_value ?? 0);
  const valuedSkus = Number(first?.valued_skus ?? 0);
  // Honest truncation state: how many dormant products exist beyond the table.
  const hiddenRows = Math.max(0, totalSkus - rows.length);

  // Threshold + sort link helpers — preserve other params
  const baseParams = new URLSearchParams();
  if (scope.warehouseId) baseParams.set("warehouse", scope.warehouseId);

  const linkWithThreshold = (t: Threshold) => {
    const p = new URLSearchParams(baseParams);
    if (t !== 90) p.set("threshold", String(t));
    if (sortKey !== "value") p.set("sort", sortKey);
    const qs = p.toString();
    return qs ? `/analytics/dead-stock?${qs}` : "/analytics/dead-stock";
  };

  const linkWithSort = (s: SortKey) => {
    const p = new URLSearchParams(baseParams);
    if (threshold !== 90) p.set("threshold", String(threshold));
    if (s !== "value") p.set("sort", s);
    const qs = p.toString();
    return qs ? `/analytics/dead-stock?${qs}` : "/analytics/dead-stock";
  };

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        backHref="/analytics"
        backLabel="Analytics"
        eyebrow="Analytics · Reports"
        title="Dead stock"
        description={`Products with on-hand stock but no pick activity in the last ${threshold} days. Sort surfaces the biggest pools of capital tied up in unmoving inventory.`}
        meta={[
          { label: "Threshold", value: `${threshold} days` },
          {
            label: "Tied-up value",
            value: formatCurrency(totalValueKnown),
            status: totalValueKnown > 0 ? "live" : undefined,
          },
        ]}
      />

      <ScopeFilter
        warehouses={warehouses ?? []}
        currentWarehouseId={scope.warehouseId}
        currentRange={scope.range}
        rangeHidden
      />

      {/* Threshold + sort controls — server-side links so state is shareable */}
      <div className="flex items-center gap-20 flex-wrap">
        <div className="flex items-center gap-8">
          <span className="label-text text-text-muted">Inactive for</span>
          <div className="flex items-center gap-1">
            {THRESHOLDS.map((t) => {
              const active = t === threshold;
              return (
                <Link
                  key={t}
                  href={linkWithThreshold(t)}
                  className={`mono-sm tnum px-10 py-5 transition-colors hairline-subtle ${
                    active
                      ? "text-[var(--accent)] border-[var(--accent)]"
                      : "text-text-muted hover:text-text hover:border-[var(--border-hover)]"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {t}d
                </Link>
              );
            })}
          </div>
        </div>
        <span
          className="hidden md:block w-px h-12 bg-[var(--border-subtle)]"
          aria-hidden
        />
        <div className="flex items-center gap-8">
          <span className="label-text text-text-muted">Sort by</span>
          {SORT_KEYS.map((key) => {
            const opt = { key, label: SORT_LABEL[key] };
            const active = opt.key === sortKey;
            return (
              <Link
                key={opt.key}
                href={linkWithSort(opt.key)}
                className={`mono-sm px-10 py-5 transition-colors hairline-subtle ${
                  active
                    ? "text-[var(--accent)] border-[var(--accent)]"
                    : "text-text-muted hover:text-text hover:border-[var(--border-hover)]"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>
      </div>

      <section aria-labelledby="summary">
        <SectionTitle numeral="01" eyebrow="Summary" title="What's dormant" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
          <KpiCard
            label="Dormant SKUs"
            value={totalSkus.toLocaleString()}
            delta={{
              value:
                totalSkus === 0
                  ? "Nothing dormant"
                  : `${threshold}+ days inactive`,
              direction: totalSkus === 0 ? "flat" : "down",
              tone: totalSkus === 0 ? "good" : "neutral",
            }}
          />
          <KpiCard label="Tied-up units" value={totalUnits.toLocaleString()} />
          <KpiCard
            label="Tied-up value"
            value={formatCurrency(totalValueKnown)}
            delta={
              valuedSkus < totalSkus
                ? {
                    value: `${totalSkus - valuedSkus} SKU${
                      totalSkus - valuedSkus === 1 ? "" : "s"
                    } missing cost`,
                    direction: "flat",
                    tone: "neutral",
                  }
                : undefined
            }
          />
        </div>
      </section>

      <section aria-labelledby="rows">
        <SectionTitle
          numeral="02"
          eyebrow="Details"
          title={`${totalSkus.toLocaleString()} product${
            totalSkus === 1 ? "" : "s"
          }`}
          action={
            hiddenRows > 0 ? (
              <span className="label-text text-text-muted">
                Showing the top {rows.length.toLocaleString()}
              </span>
            ) : undefined
          }
        />
        {rows.length === 0 ? (
          <EmptyState
            title="No dead stock"
            description={`Every product with on-hand inventory has been picked within the last ${threshold} days. Healthy flow.`}
            icon={<Hourglass size={20} strokeWidth={1.5} />}
          />
        ) : (
          <div className="hairline bg-[var(--surface)] overflow-hidden">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  <Th>Product</Th>
                  <Th>Category</Th>
                  <Th align="right">On hand</Th>
                  <Th align="right">Unit cost</Th>
                  <Th align="right">Tied value</Th>
                  <Th align="right">Last pick</Th>
                  <Th align="right" srOnly>
                    Open
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hairline-b row-interactive last:border-b-0"
                  >
                    <Td>
                      <Link
                        href={`/inventory/${row.id}`}
                        className="block min-w-0"
                      >
                        <p
                          className="text-text hover:text-[var(--accent)] transition-colors truncate"
                          style={{
                            fontFamily: "var(--display)",
                            fontSize: 13,
                            fontWeight: 500,
                          }}
                        >
                          {row.name}
                        </p>
                        <code
                          className="mono-sm text-text-muted"
                          style={{ fontSize: 11 }}
                        >
                          {row.barcode}
                        </code>
                      </Link>
                    </Td>
                    <Td>
                      {row.category_name ? (
                        <Badge tone="neutral">{row.category_name}</Badge>
                      ) : (
                        <span className="mono-sm text-text-dim">—</span>
                      )}
                    </Td>
                    <Td align="right">
                      <span className="mono-body text-text tnum">
                        {row.on_hand.toLocaleString()}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="mono-sm text-text-secondary tnum">
                        {row.unit_cost != null
                          ? `$${row.unit_cost.toFixed(2)}`
                          : "—"}
                      </span>
                    </Td>
                    <Td align="right">
                      <span
                        className={`mono-body tnum ${
                          row.tied_value != null && row.tied_value > 0
                            ? "text-[var(--warning)]"
                            : "text-text-dim"
                        }`}
                      >
                        {row.tied_value != null
                          ? formatCurrency(row.tied_value)
                          : "—"}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="mono-sm text-text-secondary tnum">
                        {row.last_pick
                          ? row.last_pick.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "365+ days"}
                      </span>
                      <p
                        className="mono-sm text-text-dim"
                        style={{ fontSize: 10 }}
                      >
                        {row.days_inactive >= 366
                          ? "no recent activity"
                          : `${row.days_inactive}d ago`}
                      </p>
                    </Td>
                    <Td align="right">
                      <Link
                        href={`/inventory/${row.id}`}
                        className="block text-text-dim hover:text-[var(--accent)] transition-colors"
                        aria-label={`Open ${row.name}`}
                      >
                        <ChevronRight size={12} strokeWidth={1.5} />
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hiddenRows > 0 && (
              <div className="px-20 py-10 hairline-t bg-[var(--bg-elevated)]">
                <p className="label-text text-text-dim">
                  Summary above covers all {totalSkus.toLocaleString()} dormant
                  products. This table lists the top{" "}
                  {rows.length.toLocaleString()} by{" "}
                  {SORT_LABEL[sortKey].toLowerCase()} —{" "}
                  {hiddenRows.toLocaleString()} more below the cut. Re-sort or
                  pick a facility to bring them into view.
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── tiny th/td primitives (local to this page) ────────────────────────────

function Th({
  children,
  align = "left",
  srOnly,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  srOnly?: boolean;
}) {
  return (
    <th
      scope="col"
      className={`px-16 py-10 label-text text-text-muted ${
        align === "right" ? "text-right" : "text-left"
      } ${srOnly ? "sr-only" : ""}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`px-16 py-12 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </td>
  );
}
