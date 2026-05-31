import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getActiveScope } from "@/lib/facilityScope";
import { getEligibleOrders, getWaves, type WaveStatus } from "@/lib/data/picking";
import { buildWave, autoBuildWave } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { CornerButton } from "@/components/ui/CornerButton";
import { Layers, Waypoints, ChevronRight, Zap } from "lucide-react";

export const metadata = { title: "Picking" };

const WAVE_TONE: Record<WaveStatus, "neutral" | "accent" | "success" | "warning"> = {
  planned: "neutral",
  released: "accent",
  complete: "success",
  cancelled: "warning",
};

export default async function PickingPage() {
  const [ctx, scope] = await Promise.all([
    getCurrentOrgContext(),
    getActiveScope(),
  ]);
  if (!ctx) {
    return <PageHeader eyebrow="Flow" title="Picking" description="No workspace." />;
  }
  const supabase = await createClient();
  const warehouseId = scope.mode === "single" ? scope.id : null;

  const [waves, eligible] = await Promise.all([
    getWaves(supabase, ctx.orgId, warehouseId),
    warehouseId
      ? getEligibleOrders(supabase, ctx.orgId, warehouseId)
      : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Flow"
        title="Picking"
        description={
          scope.mode === "single"
            ? `Batch orders into optimized picking waves at ${scope.name}.`
            : "Batch orders into optimized picking waves. Select a single facility to build a wave."
        }
        meta={[
          { label: "Open waves", value: String(waves.filter((w) => w.status !== "complete" && w.status !== "cancelled").length) },
        ]}
      />

      {scope.mode !== "single" ? (
        <div
          className="hairline-subtle px-16 py-12 flex items-start gap-10"
          style={{ background: "var(--accent-dim)" }}
        >
          <Waypoints size={14} strokeWidth={1.5} className="mt-1 shrink-0 text-[var(--accent)]" />
          <p className="mono-sm text-text-secondary" style={{ lineHeight: 1.55 }}>
            Waves are built per facility (pick paths are spatial). Switch to a
            single facility from the scope selector to build a wave. Existing
            waves across all facilities are listed below.
          </p>
        </div>
      ) : (
        <section aria-labelledby="build">
          <SectionTitle
            numeral="01"
            eyebrow="Build"
            title="Ready to pick"
            action={
              eligible.length > 0 ? (
                <form action={autoBuildWave}>
                  <input type="hidden" name="warehouse_id" value={scope.id} />
                  <CornerButton type="submit" variant="ghost" size="sm">
                    <Zap size={11} strokeWidth={1.5} />
                    Auto-build from all
                  </CornerButton>
                </form>
              ) : undefined
            }
          />
          {eligible.length === 0 ? (
            <EmptyState
              title="No orders ready to pick"
              description="Allocated, open orders not already in a wave appear here. Allocate stock to orders first, then batch them into a wave."
              icon={<Layers size={20} strokeWidth={1.5} />}
            />
          ) : (
            <form action={buildWave} className="flex flex-col gap-12">
              <input type="hidden" name="warehouse_id" value={scope.id} />
              <div className="hairline bg-[var(--surface)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr className="hairline-b bg-[var(--surface-2)]">
                        <Th className="w-[44px]" />
                        <Th>Order</Th>
                        <Th>Customer</Th>
                        <Th>Delivery</Th>
                        <Th className="text-right">Lines</Th>
                        <Th className="text-right">Units</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {eligible.map((o) => (
                        <tr key={o.id} className="hairline-b">
                          <Td>
                            <input
                              type="checkbox"
                              name="order_id"
                              value={o.id}
                              defaultChecked
                              aria-label={`Include ${o.orderNumber ?? o.id}`}
                            />
                          </Td>
                          <Td>
                            <Link
                              href={`/orders/${o.id}`}
                              className="text-text hover:text-[var(--accent)] transition-colors mono-sm"
                            >
                              {o.orderNumber ?? o.id.slice(0, 8)}
                            </Link>
                          </Td>
                          <Td>
                            <span className="text-text-secondary" style={{ fontSize: 13 }}>
                              {o.customerName ?? "—"}
                            </span>
                          </Td>
                          <Td>
                            <span className="mono-sm text-text-dim">
                              {o.deliveryDate
                                ? new Date(o.deliveryDate).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "—"}
                            </span>
                          </Td>
                          <Td className="text-right">
                            <span className="mono-sm tnum text-text-secondary">{o.lineCount}</span>
                          </Td>
                          <Td className="text-right">
                            <span className="mono-body tnum text-text">{o.unitsToPick}</span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <CornerButton type="submit" variant="primary" size="sm">
                  <Waypoints size={11} strokeWidth={1.5} />
                  Build wave from selected
                </CornerButton>
              </div>
            </form>
          )}
        </section>
      )}

      <section aria-labelledby="waves">
        <SectionTitle numeral={scope.mode === "single" ? "02" : "01"} eyebrow="Waves" title="Pick waves" />
        {waves.length === 0 ? (
          <EmptyState
            title="No waves yet"
            description="Build a wave from ready orders to generate an optimized, zone-grouped pick list."
            icon={<Waypoints size={20} strokeWidth={1.5} />}
          />
        ) : (
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {waves.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/picking/${w.id}`}
                  className="px-20 py-14 flex items-center gap-14 row-interactive"
                >
                  <span className="mono-body text-text" style={{ fontSize: 14 }}>
                    {w.code}
                  </span>
                  <Badge tone={WAVE_TONE[w.status]} variant="filled">
                    {w.status}
                  </Badge>
                  <span className="mono-sm text-text-muted">
                    {w.orderCount} order{w.orderCount === 1 ? "" : "s"}
                  </span>
                  <span className="mono-sm text-text-dim ml-auto">
                    {w.createdAt
                      ? new Date(w.createdAt).toLocaleDateString(undefined, {
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
