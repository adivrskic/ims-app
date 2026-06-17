import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thresholdDate = new Date(today);
  thresholdDate.setDate(today.getDate() - threshold);

  // Pull everything we need in parallel:
  //   1. warehouses (for the filter UI)
  //   2. products with their locations + cost + category
  //   3. pick scans within the threshold window — gives us the set of
  //      products that ARE active. Anything not in this set is dormant.
  const productsQ = supabase
    .from("products")
    .select(
      `id, name, barcode, unit_cost, updated_at,
       category:categories ( name ),
       locations:locations ( quantity, warehouse_id )`
    )
    .order("name", { ascending: true })
    // Hard cap so a huge catalog doesn't OOM us; fetch one extra to detect
    // truncation accurately (the cap is on products FETCHED, not dead-stock rows).
    .limit(501);

  // Recent picks (within threshold) — products that appear here are NOT
  // dead stock.
  const recentPicksQ = supabase
    .from("scan_history")
    .select("product_id")
    .eq("action", "pick")
    .gte("scanned_at", thresholdDate.toISOString());

  // Last-pick lookup — for products that ARE dead stock, we want to know
  // how long it's been. Pull pick scans within a longer window (1 year)
  // and find the most recent per product.
  const oneYearAgo = new Date(today);
  oneYearAgo.setDate(today.getDate() - 365);
  const olderPicksQ = supabase
    .from("scan_history")
    .select("product_id, scanned_at")
    .eq("action", "pick")
    .gte("scanned_at", oneYearAgo.toISOString())
    .order("scanned_at", { ascending: false });

  const [
    { data: warehouses },
    { data: products },
    { data: recentPicks },
    { data: olderPicks },
  ] = await Promise.all([
    supabase
      .from("warehouses")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    productsQ,
    recentPicksQ,
    olderPicksQ,
  ]);

  // Products that had at least one pick in the threshold window → active
  const activeProductIds = new Set<string>();
  for (const s of (recentPicks ?? []) as Array<{ product_id: string | null }>) {
    if (s.product_id) activeProductIds.add(s.product_id);
  }

  // Last-pick map (within last 365 days). Already sorted desc so first
  // occurrence wins.
  const lastPickByProduct = new Map<string, string>();
  for (const s of (olderPicks ?? []) as Array<{
    product_id: string | null;
    scanned_at: string;
  }>) {
    if (s.product_id && !lastPickByProduct.has(s.product_id)) {
      lastPickByProduct.set(s.product_id, s.scanned_at);
    }
  }

  // Build the dead-stock rows: products with stock, NOT in the active set
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

  // The cap applies to products fetched from the catalog — track whether we hit
  // it so the truncation notice reflects the real cause (not the filtered subset).
  const productsTruncated = (products ?? []).length > 500;

  const rows: Row[] = (
    ((products ?? []).slice(0, 500)) as Array<{
      id: string;
      name: string;
      barcode: string;
      unit_cost: string | null;
      updated_at: string | null;
      category: { name: string } | { name: string }[] | null;
      locations: Array<{
        quantity: number | null;
        warehouse_id: string | null;
      }> | null;
    }>
  )
    .map((p) => {
      // Apply warehouse filter to locations if scoped
      const locs = scope.warehouseId
        ? (p.locations ?? []).filter(
            (l) => l.warehouse_id === scope.warehouseId
          )
        : p.locations ?? [];
      const on_hand = locs.reduce((s, l) => s + (l.quantity ?? 0), 0);
      const unit_cost = p.unit_cost ? parseFloat(p.unit_cost) : null;
      const tied_value =
        unit_cost != null && Number.isFinite(unit_cost)
          ? unit_cost * on_hand
          : null;
      const lastPickIso = lastPickByProduct.get(p.id);
      const last_pick = lastPickIso ? new Date(lastPickIso) : null;
      const days_inactive = last_pick
        ? Math.floor((today.getTime() - last_pick.getTime()) / 86_400_000)
        : 366;
      const cat = Array.isArray(p.category) ? p.category[0] : p.category;
      return {
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        category_name: cat?.name ?? null,
        on_hand,
        unit_cost,
        tied_value,
        last_pick,
        days_inactive,
      };
    })
    .filter((r) => r.on_hand > 0 && !activeProductIds.has(r.id));

  // Sort
  if (sortKey === "value") {
    rows.sort((a, b) => (b.tied_value ?? -1) - (a.tied_value ?? -1));
  } else if (sortKey === "quantity") {
    rows.sort((a, b) => b.on_hand - a.on_hand);
  } else {
    rows.sort((a, b) => b.days_inactive - a.days_inactive);
  }

  // Aggregate KPIs
  const totalSkus = rows.length;
  const totalUnits = rows.reduce((s, r) => s + r.on_hand, 0);
  const totalValueKnown = rows.reduce((s, r) => s + (r.tied_value ?? 0), 0);
  const valuedSkus = rows.filter((r) => r.tied_value != null).length;

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
          {(
            [
              { key: "value", label: "Tied-up value" },
              { key: "quantity", label: "Quantity" },
              { key: "days_inactive", label: "Days inactive" },
            ] as Array<{ key: SortKey; label: string }>
          ).map((opt) => {
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
          title={`${rows.length} product${rows.length === 1 ? "" : "s"}`}
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
            {productsTruncated && (
              <div className="px-20 py-10 hairline-t bg-[var(--bg-elevated)]">
                <p className="label-text text-text-dim">
                  Scanned the first 500 products — narrow with a warehouse filter
                  or a shorter threshold to cover the rest of the catalog.
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
