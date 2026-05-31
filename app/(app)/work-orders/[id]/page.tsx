import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import {
  getWorkOrderDetail,
  type WorkOrderStatus,
} from "@/lib/data/workOrders";
import type { BomNode } from "@/lib/data/bom";
import { setWorkOrderStatus, claimWorkOrder } from "../actions";
import { CompleteWorkOrderButton } from "./CompleteWorkOrderButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Badge } from "@/components/ui/Badge";
import { CornerButton } from "@/components/ui/CornerButton";
import { ArrowLeft, Boxes } from "lucide-react";

export const metadata = { title: "Work order" };

const WO_TONE: Record<WorkOrderStatus, "neutral" | "accent" | "success" | "warning"> = {
  draft: "neutral",
  released: "accent",
  in_progress: "accent",
  complete: "success",
  cancelled: "warning",
};
const WO_LABEL: Record<WorkOrderStatus, string> = {
  draft: "Draft",
  released: "Released",
  in_progress: "In progress",
  complete: "Complete",
  cancelled: "Cancelled",
};

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getCurrentOrgContext();
  if (!ctx) notFound();
  const supabase = await createClient();
  const wo = await getWorkOrderDetail(supabase, ctx.orgId, id);
  if (!wo) notFound();

  const isOpen =
    wo.status === "draft" ||
    wo.status === "released" ||
    wo.status === "in_progress";
  const canComplete =
    (wo.status === "released" || wo.status === "in_progress") && wo.buildable;
  const mineLabel =
    wo.assignedTo === ctx.user.id
      ? "Assigned to you"
      : wo.assignedTo
      ? "Assigned"
      : "Unassigned";

  return (
    <div className="flex flex-col gap-32">
      <div className="flex flex-col gap-12">
        <Link
          href="/work-orders"
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors w-fit"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text">All work orders</span>
        </Link>
        <PageHeader
          eyebrow="Work order"
          title={wo.code}
          description={`${wo.quantity} × ${wo.productName}${
            wo.warehouseName ? ` · ${wo.warehouseName}` : ""
          }`}
          meta={[{ label: "Builder", value: mineLabel }]}
          actions={
            <div className="flex items-center gap-10 flex-wrap">
              <Badge tone={WO_TONE[wo.status]} variant="filled">
                {WO_LABEL[wo.status]}
              </Badge>
              {isOpen && (
                <form action={claimWorkOrder}>
                  <input type="hidden" name="id" value={wo.id} />
                  {wo.assignedTo === ctx.user.id && (
                    <input type="hidden" name="release" value="1" />
                  )}
                  <CornerButton type="submit" variant="ghost" size="sm">
                    {wo.assignedTo === ctx.user.id ? "Release" : "Claim"}
                  </CornerButton>
                </form>
              )}
              {wo.status === "draft" && (
                <StatusForm id={wo.id} status="released" label="Release" variant="primary" />
              )}
              {(wo.status === "released" || wo.status === "in_progress") && (
                <CompleteWorkOrderButton workOrderId={wo.id} disabled={!canComplete} />
              )}
              {isOpen && (
                <StatusForm id={wo.id} status="cancelled" label="Cancel" variant="danger" />
              )}
            </div>
          }
        />
      </div>

      {wo.status !== "complete" && !wo.buildable && wo.lines.length > 0 && (
        <div
          className="hairline-subtle px-14 py-10 flex items-start gap-10"
          style={{ background: "var(--warning-dim)" }}
        >
          <Boxes size={13} strokeWidth={1.5} className="mt-1 shrink-0 text-[var(--warning)]" />
          <p className="mono-sm text-text-secondary" style={{ lineHeight: 1.55 }}>
            Short on components at {wo.warehouseName ?? "this facility"}. Build or
            receive the highlighted components (or build sub-assemblies via their
            own work order) before completing.
          </p>
        </div>
      )}

      {/* Component requirements */}
      <section aria-labelledby="components">
        <SectionTitle
          numeral="01"
          eyebrow="Consume"
          title="Components"
          action={
            <span className="label-text text-text-muted">
              Direct BOM × {wo.quantity}
            </span>
          }
        />
        <div className="hairline bg-[var(--surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  <Th>Component</Th>
                  <Th className="text-right">Required</Th>
                  <Th className="text-right">On hand</Th>
                  <Th className="text-right">
                    {wo.status === "complete" ? "Consumed" : "Short"}
                  </Th>
                </tr>
              </thead>
              <tbody>
                {wo.lines.map((l) => (
                  <tr key={l.id} className="hairline-b last:border-b-0">
                    <Td>
                      <Link
                        href={`/inventory/${l.componentProductId}`}
                        className="text-text hover:text-[var(--accent)] transition-colors"
                        style={{ fontFamily: "var(--display)", fontSize: 13 }}
                      >
                        {l.componentName}
                      </Link>
                      {l.sku && <span className="mono-sm text-text-dim ml-8">{l.sku}</span>}
                    </Td>
                    <Td className="text-right">
                      <span className="mono-body tnum text-text">{l.required}</span>
                    </Td>
                    <Td className="text-right">
                      <span
                        className={`mono-sm tnum ${
                          l.onHand >= l.required ? "text-text-secondary" : "text-[var(--warning)]"
                        }`}
                      >
                        {l.onHand}
                      </span>
                    </Td>
                    <Td className="text-right">
                      {wo.status === "complete" ? (
                        <span className="mono-sm tnum text-text-secondary">{l.consumed}</span>
                      ) : l.short > 0 ? (
                        <span className="mono-body tnum text-[var(--danger)]">{l.short}</span>
                      ) : (
                        <span className="mono-sm tnum text-[var(--success)]">ready</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Multi-level BOM tree */}
      {wo.bom && (wo.bom.children.length > 0) && (
        <section aria-labelledby="bom">
          <SectionTitle numeral="02" eyebrow="Structure" title="Bill of materials" />
          <div className="hairline bg-[var(--surface)] p-16 flex flex-col gap-2">
            {wo.bom.children.map((child, i) => (
              <BomRow key={`${child.productId}-${i}`} node={child} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BomRow({ node }: { node: BomNode }) {
  return (
    <>
      <div
        className="flex items-center gap-10 py-4"
        style={{ paddingLeft: (node.depth - 1) * 20 }}
      >
        <span className="text-text-dim mono-sm">{node.depth > 1 ? "└" : ""}</span>
        <span className="mono-body tnum text-text-muted" style={{ minWidth: 36 }}>
          {node.qtyPerParent}×
        </span>
        <Link
          href={`/inventory/${node.productId}`}
          className="text-text hover:text-[var(--accent)] transition-colors"
          style={{ fontFamily: "var(--display)", fontSize: 13 }}
        >
          {node.name}
        </Link>
        {node.isKit && (
          <span
            className="bg-[var(--accent-dim)] text-[var(--accent)] px-6 py-1"
            style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.5px", textTransform: "uppercase" }}
          >
            Sub-assembly
          </span>
        )}
        {node.cycle && (
          <span className="mono-sm text-[var(--danger)]" style={{ fontSize: 10 }}>
            ⚠ circular
          </span>
        )}
      </div>
      {node.children.map((c, i) => (
        <BomRow key={`${c.productId}-${i}`} node={c} />
      ))}
    </>
  );
}

function StatusForm({
  id,
  status,
  label,
  variant,
}: {
  id: string;
  status: WorkOrderStatus;
  label: string;
  variant: "primary" | "ghost" | "danger";
}) {
  return (
    <form action={setWorkOrderStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <CornerButton type="submit" variant={variant} size="sm">
        {label}
      </CornerButton>
    </form>
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
