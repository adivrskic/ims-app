import Link from "next/link";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { getForecastWorklist } from "@/lib/data/forecast";
import { applyForecastSettings } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerButton } from "@/components/ui/CornerButton";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, LineChart } from "lucide-react";

export const metadata = { title: "Demand forecast" };

export default async function ForecastPage() {
  const [ctx, scope] = await Promise.all([
    getCurrentOrgContext(),
    getActiveScope(),
  ]);
  if (!ctx) {
    return <PageHeader eyebrow="Analytics" title="Forecast" description="No workspace." />;
  }
  const warehouseId = scope.mode === "single" ? scope.id : null;
  const rows = await getForecastWorklist(ctx.orgId, warehouseId);

  const raises = rows.filter((r) => r.reorderPointDelta > 0).length;
  const lowers = rows.filter((r) => r.reorderPointDelta < 0).length;
  const seasonal = rows.filter((r) => r.hasSeasonality).length;

  return (
    <div className="flex flex-col gap-32">
      <div className="flex flex-col gap-12">
        <Link
          href="/analytics"
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors w-fit"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text">Analytics</span>
        </Link>
        <PageHeader
          eyebrow="Analytics · Planning"
          title="Demand forecast"
          description={scopeDescription(scope, {
            all: "Statistical demand forecast (trend + seasonality + service-level safety stock) vs current reorder settings. Tune the reorder points that have drifted.",
            single: (name) =>
              `Demand forecast vs current reorder settings at ${name}. Tune the reorder points that have drifted.`,
          })}
          meta={[{ label: "To tune", value: String(rows.length), status: rows.length ? ("live" as const) : undefined }]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Reorder points look well-tuned"
          description="Forecast over the last 90 days agrees with your current reorder points (within tolerance). As demand shifts, divergences will surface here with one-click fixes."
          icon={<LineChart size={20} strokeWidth={1.5} />}
        />
      ) : (
        <>
          <section aria-labelledby="kpis">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
              <KpiCard label="Suggest raising" value={raises.toLocaleString()} />
              <KpiCard label="Suggest lowering" value={lowers.toLocaleString()} />
              <KpiCard label="Seasonal SKUs" value={seasonal.toLocaleString()} />
            </div>
          </section>

          <section aria-labelledby="list">
            <SectionTitle
              numeral="01"
              eyebrow="Planning"
              title="Reorder points to tune"
              action={<span className="label-text text-text-muted">90-day window · 95% service level</span>}
            />
            <div className="hairline bg-[var(--surface)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr className="hairline-b bg-[var(--surface-2)]">
                      <Th>Product</Th>
                      <Th className="text-right">Demand/day</Th>
                      <Th className="text-center">Trend</Th>
                      <Th className="text-right">Current ROP</Th>
                      <Th className="text-right">Suggested</Th>
                      <Th className="text-right">Safety</Th>
                      <Th className="text-right">Apply</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.productId} className="hairline-b">
                        <Td>
                          <Link
                            href={`/inventory/${r.productId}`}
                            className="text-text hover:text-[var(--accent)] transition-colors"
                            style={{ fontFamily: "var(--display)", fontSize: 13 }}
                          >
                            {r.productName}
                          </Link>
                          {r.sku && <span className="mono-sm text-text-dim ml-8">{r.sku}</span>}
                          {r.hasSeasonality && (
                            <span className="mono-sm text-[var(--accent)] ml-8" style={{ fontSize: 9 }}>
                              seasonal
                            </span>
                          )}
                        </Td>
                        <Td className="text-right">
                          <span className="mono-sm tnum text-text-secondary">{r.avgDaily.toFixed(2)}</span>
                        </Td>
                        <Td className="text-center">
                          <TrendIcon slope={r.trendPerDay} />
                        </Td>
                        <Td className="text-right">
                          <span className="mono-sm tnum text-text-dim">{r.currentReorderPoint}</span>
                        </Td>
                        <Td className="text-right">
                          <span
                            className={`mono-body tnum ${
                              r.reorderPointDelta > 0 ? "text-[var(--warning)]" : "text-[var(--info)]"
                            }`}
                          >
                            {r.suggestedReorderPoint}
                            <span className="text-text-dim mono-sm">
                              {" "}({r.reorderPointDelta > 0 ? "+" : ""}{r.reorderPointDelta})
                            </span>
                          </span>
                        </Td>
                        <Td className="text-right">
                          <span className="mono-sm tnum text-text-secondary">
                            {r.currentSafetyStock} → {r.suggestedSafetyStock}
                          </span>
                        </Td>
                        <Td className="text-right">
                          <form action={applyForecastSettings}>
                            <input type="hidden" name="product_id" value={r.productId} />
                            <input type="hidden" name="reorder_point" value={r.suggestedReorderPoint} />
                            <input type="hidden" name="safety_stock" value={r.suggestedSafetyStock} />
                            <CornerButton type="submit" variant="ghost" size="sm">Apply</CornerButton>
                          </form>
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

function TrendIcon({ slope }: { slope: number }) {
  if (slope > 0.02)
    return <TrendingUp size={13} strokeWidth={1.5} className="inline text-[var(--warning)]" />;
  if (slope < -0.02)
    return <TrendingDown size={13} strokeWidth={1.5} className="inline text-[var(--info)]" />;
  return <Minus size={13} strokeWidth={1.5} className="inline text-text-dim" />;
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`label-text text-left px-14 py-12 font-normal ${className}`}>{children}</th>
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
