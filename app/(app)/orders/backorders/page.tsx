import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { getBackorders } from "@/lib/data/allocation";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArrowLeft, PackageX } from "lucide-react";

export const metadata = { title: "Backorders" };

const STATUS_LABEL: Record<string, string> = {
  created: "Created",
  pick_list_assigned: "Pick assigned",
  in_progress: "Picking",
  staged: "Staged",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
};

function ageDays(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : null;
}

export default async function BackordersPage() {
  const [ctx, scope] = await Promise.all([
    getCurrentOrgContext(),
    getActiveScope(),
  ]);
  if (!ctx) {
    return (
      <PageHeader eyebrow="Orders" title="Backorders" description="No workspace." />
    );
  }
  const supabase = await createClient();
  const warehouseId = scope.mode === "single" ? scope.id : null;
  const rows = await getBackorders(supabase, ctx.orgId, warehouseId);

  const totalUnits = rows.reduce((s, r) => s + r.backordered, 0);
  const orderCount = new Set(rows.map((r) => r.orderId)).size;
  const skuCount = new Set(rows.map((r) => r.productId)).size;

  return (
    <div className="flex flex-col gap-32">
      <div className="flex flex-col gap-12">
        <Link
          href="/orders"
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors w-fit"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text">All orders</span>
        </Link>
        <PageHeader
          eyebrow="Orders"
          title="Backorders"
          description={scopeDescription(scope, {
            all: "Open order demand that couldn't be allocated from on-hand stock — oldest first. Fill these as stock arrives on POs.",
            single: (name) =>
              `Unallocated open demand at ${name}, oldest first. Fill these as stock arrives on POs.`,
          })}
          meta={[
            {
              label: "Backordered units",
              value: totalUnits.toLocaleString(),
              status: "live" as const,
            },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No backorders"
          description="Every open order line is fully allocated from available stock. Backordered demand will appear here when orders exceed on-hand."
          icon={<PackageX size={20} strokeWidth={1.5} />}
        />
      ) : (
        <>
          <section aria-labelledby="kpis">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
              <KpiCard label="Backordered units" value={totalUnits.toLocaleString()} />
              <KpiCard label="Orders affected" value={orderCount.toLocaleString()} />
              <KpiCard label="SKUs short" value={skuCount.toLocaleString()} />
            </div>
          </section>

          <section aria-labelledby="list">
            <SectionTitle
              numeral="01"
              eyebrow="Queue"
              title="Backordered lines"
              action={
                <span className="label-text text-text-muted">
                  {rows.length} {rows.length === 1 ? "line" : "lines"}
                </span>
              }
            />
            <div className="hairline bg-[var(--surface)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr className="hairline-b bg-[var(--surface-2)]">
                      <Th>Order</Th>
                      <Th>Product</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Requested</Th>
                      <Th className="text-right">Allocated</Th>
                      <Th className="text-right">Backordered</Th>
                      <Th className="text-right">Age</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const age = ageDays(r.createdAt);
                      return (
                        <tr key={r.orderItemId} className="hairline-b">
                          <Td>
                            <Link
                              href={`/orders/${r.orderId}`}
                              className="text-text hover:text-[var(--accent)] transition-colors mono-sm"
                            >
                              {r.orderNumber ?? r.orderId.slice(0, 8)}
                            </Link>
                          </Td>
                          <Td>
                            <Link
                              href={`/inventory/${r.productId}`}
                              className="text-text hover:text-[var(--accent)] transition-colors"
                              style={{ fontFamily: "var(--display)", fontSize: 13 }}
                            >
                              {r.productName}
                            </Link>
                            {r.sku && (
                              <span className="mono-sm text-text-dim ml-8">
                                {r.sku}
                              </span>
                            )}
                          </Td>
                          <Td>
                            <span className="mono-sm text-text-secondary">
                              {STATUS_LABEL[r.orderStatus] ?? r.orderStatus}
                            </span>
                          </Td>
                          <Td className="text-right">
                            <span className="mono-sm tnum text-text-secondary">
                              {r.requested}
                            </span>
                          </Td>
                          <Td className="text-right">
                            <span className="mono-sm tnum text-text-secondary">
                              {r.allocated}
                            </span>
                          </Td>
                          <Td className="text-right">
                            <span className="mono-body tnum text-[var(--warning)]">
                              {r.backordered}
                            </span>
                          </Td>
                          <Td className="text-right">
                            <span className="mono-sm tnum text-text-dim">
                              {age != null ? `${age}d` : "—"}
                            </span>
                          </Td>
                        </tr>
                      );
                    })}
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
