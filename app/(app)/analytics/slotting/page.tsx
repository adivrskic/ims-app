import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { getSlottingHealth, type SlottingHealth } from "@/lib/data/slotting";
import { ApplyMoveButton } from "./ApplyMoveButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArrowLeft, ArrowRight, Boxes, AlertTriangle } from "lucide-react";

export const metadata = { title: "Slotting health" };

export default async function SlottingPage() {
  const [ctx, scope] = await Promise.all([
    getCurrentOrgContext(),
    getActiveScope(),
  ]);
  if (!ctx) {
    return (
      <PageHeader eyebrow="Analytics" title="Slotting" description="No workspace." />
    );
  }
  const supabase = await createClient();

  // Slotting is spatial, so it runs per facility. In "all" scope we report on
  // every active facility; in "single" scope, just the selected one.
  let facilities: { id: string; name: string }[];
  if (scope.mode === "single") {
    facilities = [{ id: scope.id, name: scope.name }];
  } else {
    const { data } = await supabase
      .from("warehouses")
      .select("id, name")
      .eq("org_id", ctx.orgId)
      .eq("is_active", true)
      .order("name", { ascending: true });
    facilities = ((data ?? []) as Array<{ id: string; name: string }>).map(
      (w) => ({ id: w.id, name: w.name })
    );
  }

  const reports = await Promise.all(
    facilities.map((f) =>
      getSlottingHealth(supabase, ctx.orgId, f.id, f.name)
    )
  );

  const laidOut = reports.filter((r) => r.hasLayout);
  const sum = (pick: (r: SlottingHealth) => number) =>
    reports.reduce((n, r) => n + pick(r), 0);

  const empty = laidOut.length === 0;

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
          eyebrow="Analytics · Operations"
          title="Slotting health"
          description={scopeDescription(scope, {
            all: "Mis-slotted SKUs across all facilities — fast movers stuck in the back, slow movers blocking prime space, and category drift.",
            single: (name) =>
              `Mis-slotted SKUs at ${name} — fast movers stuck in the back, slow movers blocking prime space, and category drift.`,
          })}
          meta={[
            {
              label: "Mis-slotted",
              value: sum((r) => r.misSlottedCount).toLocaleString(),
              status: "live" as const,
            },
          ]}
        />
      </div>

      {empty ? (
        <EmptyState
          title="No layout to slot against"
          description="Slotting scores stock against a facility's floor plan. Build a layout in the facility builder — place sections, a dock door, and staging — then come back for re-slotting suggestions."
          icon={<Boxes size={20} strokeWidth={1.5} />}
        />
      ) : (
        <>
          <section aria-labelledby="kpis">
            <SectionTitle numeral="01" eyebrow="Headline" title="Slotting signals" />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-16">
              <KpiCard
                label="Mis-slotted SKUs"
                value={sum((r) => r.misSlottedCount).toLocaleString()}
              />
              <KpiCard
                label="Fast movers in back"
                value={sum((r) => r.fastMoversFar).toLocaleString()}
              />
              <KpiCard
                label="Golden zone blocked"
                value={sum((r) => r.goldenZoneBlocked).toLocaleString()}
              />
              <KpiCard
                label="Category mismatches"
                value={sum((r) => r.categoryMismatches).toLocaleString()}
              />
            </div>
          </section>

          {reports.map((r, i) => (
            <FacilityReport
              key={r.facilityId}
              report={r}
              numeral={String(i + 2).padStart(2, "0")}
              showName={facilities.length > 1}
            />
          ))}
        </>
      )}
    </div>
  );
}

function FacilityReport({
  report,
  numeral,
  showName,
}: {
  report: SlottingHealth;
  numeral: string;
  showName: boolean;
}) {
  if (!report.hasLayout) return null;

  return (
    <section aria-label={`Slotting · ${report.facilityName}`}>
      <SectionTitle
        numeral={numeral}
        eyebrow={showName ? report.facilityName : "Re-slot"}
        title="Suggested moves"
        action={
          <span className="label-text text-text-muted">
            {report.occupiedSlots} / {report.totalSlots} slots used
          </span>
        }
      />

      {!report.hasOrigin && (
        <div
          className="hairline-subtle px-14 py-10 mb-16 flex items-start gap-10"
          style={{ background: "var(--accent-dim)" }}
        >
          <AlertTriangle
            size={12}
            strokeWidth={1.5}
            className="mt-1 shrink-0 text-[var(--accent)]"
          />
          <p className="mono-sm text-text-secondary" style={{ lineHeight: 1.55 }}>
            No dock door or staging zone in this facility, so proximity
            (golden-zone) scoring is skipped. Add one in the builder for
            travel-aware suggestions — moves below use category, consolidation,
            and level only.
          </p>
        </div>
      )}

      {report.misSlots.length === 0 ? (
        <p className="mono-sm text-text-muted">
          Well slotted — no high-impact moves found in this facility.
        </p>
      ) : (
        <div className="hairline bg-[var(--surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  <Th>Product</Th>
                  <Th>Current</Th>
                  <Th>Suggested</Th>
                  <Th>Why</Th>
                  <Th className="text-right">Velocity</Th>
                  <Th className="text-right">Apply</Th>
                </tr>
              </thead>
              <tbody>
                {report.misSlots.map((m) => (
                  <tr key={`${m.productId}:${m.current.label}`} className="hairline-b">
                    <Td>
                      <Link
                        href={`/inventory/${m.productId}`}
                        className="text-text hover:text-[var(--accent)] transition-colors"
                        style={{ fontFamily: "var(--display)", fontSize: 13 }}
                      >
                        {m.productName}
                      </Link>
                      {m.sku && (
                        <span className="mono-sm text-text-dim ml-8">{m.sku}</span>
                      )}
                    </Td>
                    <Td>
                      <span className="mono-sm tnum text-text-secondary">
                        {m.current.label}
                      </span>
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-6">
                        <ArrowRight
                          size={11}
                          strokeWidth={1.5}
                          className="text-[var(--accent)]"
                        />
                        <span
                          className="mono-body tnum text-text"
                          style={{ fontSize: 13 }}
                        >
                          {m.suggested.label}
                        </span>
                      </span>
                      {m.suggested.reasons.length > 0 && (
                        <span className="mono-sm text-text-dim ml-8 hidden lg:inline">
                          {m.suggested.reasons.slice(0, 2).join(" · ")}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="mono-sm text-text-secondary">
                        {m.reason}
                      </span>
                    </Td>
                    <Td className="text-right">
                      <span className="mono-sm tnum text-text-secondary">
                        {m.velocity > 0 ? `${m.velocity.toFixed(2)}/d` : "—"}
                      </span>
                    </Td>
                    <Td className="text-right">
                      <ApplyMoveButton
                        toLabel={m.suggested.label}
                        args={{
                          productId: m.productId,
                          warehouseId: report.facilityId,
                          fromSectionId: m.current.sectionId,
                          fromBay: m.current.bay,
                          fromLevel: m.current.level,
                          toSectionId: m.suggested.slot.sectionId,
                          toBay: m.suggested.slot.bay,
                          toLevel: m.suggested.slot.level,
                        }}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
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
