import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { getValuation, type AbcClass } from "@/lib/data/valuation";
import { formatCurrency } from "@/lib/dashboard";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerLink } from "@/components/ui/CornerButton";
import { ArrowLeft, Download, Scale } from "lucide-react";

export const metadata = { title: "Inventory valuation" };

const ABC_COLOR: Record<AbcClass, string> = {
  A: "var(--accent)",
  B: "var(--info)",
  C: "var(--text-muted)",
};
const ABC_DESC: Record<AbcClass, string> = {
  A: "Top 80% of value",
  B: "Next 15%",
  C: "Last 5%",
};

export default async function ValuationPage() {
  const [ctx, scope] = await Promise.all([
    getCurrentOrgContext(),
    getActiveScope(),
  ]);
  if (!ctx) {
    return <PageHeader eyebrow="Analytics" title="Valuation" description="No workspace." />;
  }
  const supabase = await createClient();
  const warehouseId = scope.mode === "single" ? scope.id : null;
  const r = await getValuation(supabase, ctx.orgId, warehouseId);

  const empty = r.valuedSkus === 0 && r.totalUnits === 0;
  const maxCat = r.byCategory.reduce((m, c) => Math.max(m, c.value), 1);
  const maxAge = r.aging.reduce((m, a) => Math.max(m, a.value), 1);
  const topProducts = r.products.slice(0, 25);

  return (
    <div className="flex flex-col gap-48">
      <div className="flex flex-col gap-12">
        <Link
          href="/analytics"
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors w-fit"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text">Analytics</span>
        </Link>
        <PageHeader
          eyebrow="Analytics · Finance"
          title="Inventory valuation"
          description={scopeDescription(scope, {
            all: "Where capital is tied up — value, turnover, ABC class, and aging across all facilities.",
            single: (name) =>
              `Value, turnover, ABC class, and aging at ${name}.`,
          })}
          actions={
            <CornerLink
              href={`/analytics/valuation/export${
                warehouseId ? `?facility=${warehouseId}` : ""
              }`}
              variant="ghost"
              size="sm"
            >
              <Download size={11} strokeWidth={1.5} />
              Export CSV
            </CornerLink>
          }
          meta={[
            { label: "Valued SKUs", value: r.valuedSkus.toLocaleString() },
            {
              label: "Total value",
              value: formatCurrency(r.totalValue),
              status: "live" as const,
            },
          ]}
        />
      </div>

      {empty ? (
        <EmptyState
          title="Nothing to value yet"
          description="Once products with a unit cost have on-hand stock, valuation, turnover, ABC, and aging will populate here."
          icon={<Scale size={20} strokeWidth={1.5} />}
        />
      ) : (
        <>
          <section aria-labelledby="kpis">
            <SectionTitle numeral="01" eyebrow="Headline" title="Value" />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-16">
              <KpiCard label="Inventory value" value={formatCurrency(r.totalValue)} />
              <KpiCard label="Units on hand" value={r.totalUnits.toLocaleString()} />
              <KpiCard
                label="Avg unit cost"
                value={formatCurrency(r.avgUnitCost)}
              />
              <KpiCard
                label="Turnover / yr"
                value={r.turnover != null ? `${r.turnover.toFixed(1)}×` : "—"}
                delta={
                  r.daysOnHand != null
                    ? {
                        value: `${r.daysOnHand}d on hand`,
                        direction: "flat",
                        tone: "neutral",
                      }
                    : undefined
                }
              />
            </div>
            {r.uncostedSkus > 0 && (
              <p className="mono-sm text-text-dim mt-12" style={{ lineHeight: 1.6 }}>
                {r.uncostedSkus} SKU{r.uncostedSkus === 1 ? "" : "s"} with stock
                ha{r.uncostedSkus === 1 ? "s" : "ve"} no unit cost and are
                excluded from value. Add costs in Inventory for a complete
                picture. Valuation uses current unit cost × on-hand.
              </p>
            )}
          </section>

          {/* ABC */}
          <section aria-labelledby="abc">
            <SectionTitle
              numeral="02"
              eyebrow="Pareto"
              title="ABC by value"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
              {(["A", "B", "C"] as AbcClass[]).map((cls) => (
                <div key={cls} className="hairline bg-[var(--surface)] p-16">
                  <div className="flex items-center gap-8 mb-8">
                    <span
                      className="w-10 h-10 shrink-0"
                      style={{ background: ABC_COLOR[cls] }}
                      aria-hidden
                    />
                    <span
                      className="text-text"
                      style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 600 }}
                    >
                      Class {cls}
                    </span>
                    <span className="label-text text-text-dim ml-auto">
                      {ABC_DESC[cls]}
                    </span>
                  </div>
                  <p className="mono-body text-text tnum" style={{ fontSize: 18 }}>
                    {formatCurrency(r.abc[cls].value)}
                  </p>
                  <p className="mono-sm text-text-muted mt-2">
                    {r.abc[cls].count} SKU{r.abc[cls].count === 1 ? "" : "s"} ·{" "}
                    {r.totalValue > 0
                      ? Math.round((r.abc[cls].value / r.totalValue) * 100)
                      : 0}
                    % of value
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Value by category */}
          {r.byCategory.length > 0 && (
            <section aria-labelledby="by-cat">
              <SectionTitle
                numeral="03"
                eyebrow="Distribution"
                title="Value by category"
              />
              <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
                {r.byCategory.map((c) => (
                  <li key={c.name} className="px-20 py-12 flex items-center gap-14">
                    <span
                      className="text-text flex-1 truncate"
                      style={{ fontFamily: "var(--display)", fontSize: 13 }}
                    >
                      {c.name}
                    </span>
                    <div className="w-[200px] relative h-8 bg-[var(--surface-2)] overflow-hidden shrink-0">
                      <div
                        className="absolute inset-y-0 left-0 bg-[var(--accent)]"
                        style={{ width: `${(c.value / maxCat) * 100}%` }}
                        aria-hidden
                      />
                    </div>
                    <span
                      className="mono-body tnum text-text w-[96px] text-right"
                      style={{ fontSize: 13 }}
                    >
                      {formatCurrency(c.value)}
                    </span>
                    <span className="mono-sm tnum text-text-dim w-[36px] text-right">
                      {c.pct}%
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Aging by value */}
          <section aria-labelledby="aging">
            <SectionTitle
              numeral="04"
              eyebrow="Aging"
              title="Value by time since last movement"
            />
            <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
              {r.aging.map((a, i) => {
                const stale = i >= 2; // 91+ days
                return (
                  <li key={a.label} className="px-20 py-12 flex items-center gap-14">
                    <span
                      className="text-text w-[110px] shrink-0"
                      style={{ fontFamily: "var(--mono)", fontSize: 12 }}
                    >
                      {a.label}
                    </span>
                    <div className="flex-1 relative h-8 bg-[var(--surface-2)] overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0"
                        style={{
                          width: `${(a.value / maxAge) * 100}%`,
                          background: stale ? "var(--warning)" : "var(--accent)",
                        }}
                        aria-hidden
                      />
                    </div>
                    <span className="mono-sm tnum text-text-dim w-[80px] text-right">
                      {a.units.toLocaleString()} u
                    </span>
                    <span
                      className="mono-body tnum text-text w-[96px] text-right"
                      style={{ fontSize: 13 }}
                    >
                      {formatCurrency(a.value)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Top products */}
          <section aria-labelledby="top">
            <SectionTitle
              numeral="05"
              eyebrow="Detail"
              title="Top products by value"
              action={
                <span className="label-text text-text-muted">
                  Top {topProducts.length} of {r.products.length}
                </span>
              }
            />
            <div className="hairline bg-[var(--surface)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr className="hairline-b bg-[var(--surface-2)]">
                      <Th>Product</Th>
                      <Th>Class</Th>
                      <Th className="text-right">On hand</Th>
                      <Th className="text-right">Unit cost</Th>
                      <Th className="text-right">Value</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p) => (
                      <tr key={p.id} className="hairline-b">
                        <Td>
                          <Link
                            href={`/inventory/${p.id}`}
                            className="text-text hover:text-[var(--accent)] transition-colors"
                            style={{ fontFamily: "var(--display)", fontSize: 13 }}
                          >
                            {p.name}
                          </Link>
                          {p.categoryName && (
                            <span className="mono-sm text-text-dim ml-8">
                              {p.categoryName}
                            </span>
                          )}
                        </Td>
                        <Td>
                          <span
                            className="inline-flex items-center gap-6"
                            style={{ fontFamily: "var(--mono)", fontSize: 11 }}
                          >
                            <span
                              className="w-8 h-8"
                              style={{ background: ABC_COLOR[p.abc] }}
                              aria-hidden
                            />
                            {p.abc}
                          </span>
                        </Td>
                        <Td className="text-right">
                          <span className="mono-sm tnum text-text-secondary">
                            {p.onHand.toLocaleString()}
                          </span>
                        </Td>
                        <Td className="text-right">
                          <span className="mono-sm tnum text-text-secondary">
                            {p.unitCost > 0 ? formatCurrency(p.unitCost) : "—"}
                          </span>
                        </Td>
                        <Td className="text-right">
                          <span className="mono-body tnum text-text" style={{ fontSize: 13 }}>
                            {formatCurrency(p.value)}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`label-text text-left px-14 py-12 font-normal ${className}`}>
      {children}
    </th>
  );
}
function Td({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-14 py-12 ${className}`}>{children}</td>;
}
