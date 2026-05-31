import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getActiveScope } from "@/lib/facilityScope";
import { getWorkOrders, type WorkOrderStatus } from "@/lib/data/workOrders";
import { CreateWorkOrderForm } from "./CreateWorkOrderForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Hammer, ChevronRight } from "lucide-react";

export const metadata = { title: "Work orders" };

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

export default async function WorkOrdersPage() {
  const [ctx, scope] = await Promise.all([
    getCurrentOrgContext(),
    getActiveScope(),
  ]);
  if (!ctx) {
    return <PageHeader eyebrow="Build" title="Work orders" description="No workspace." />;
  }
  const supabase = await createClient();
  const warehouseId = scope.mode === "single" ? scope.id : null;

  const [workOrders, { data: kitRows }, { data: facilityRows }] = await Promise.all([
    getWorkOrders(supabase, ctx.orgId, warehouseId),
    supabase
      .from("products")
      .select("id, name")
      .eq("org_id", ctx.orgId)
      .eq("is_kit", true)
      .order("name", { ascending: true }),
    supabase
      .from("warehouses")
      .select("id, name")
      .eq("org_id", ctx.orgId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const kits = ((kitRows ?? []) as Array<{ id: string; name: string }>).map((k) => ({
    id: k.id,
    name: k.name,
  }));
  const facilities = ((facilityRows ?? []) as Array<{ id: string; name: string }>).map(
    (f) => ({ id: f.id, name: f.name })
  );

  const openCount = workOrders.filter(
    (w) => w.status !== "complete" && w.status !== "cancelled"
  ).length;

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Build"
        title="Work orders"
        description="Assemble kits and finished goods from their bill of materials. Completion consumes components and produces the finished good."
        meta={[{ label: "Open", value: String(openCount) }]}
      />

      <section aria-labelledby="create">
        <SectionTitle numeral="01" eyebrow="New" title="Create work order" />
        <div className="hairline bg-[var(--surface)] p-20">
          <CreateWorkOrderForm kits={kits} facilities={facilities} />
        </div>
      </section>

      <section aria-labelledby="list">
        <SectionTitle numeral="02" eyebrow="Queue" title="Work orders" />
        {workOrders.length === 0 ? (
          <EmptyState
            title="No work orders yet"
            description="Create one above to assemble a kit. You'll see component availability and can complete the build when stock is ready."
            icon={<Hammer size={20} strokeWidth={1.5} />}
          />
        ) : (
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {workOrders.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/work-orders/${w.id}`}
                  className="px-20 py-14 flex items-center gap-14 row-interactive"
                >
                  <span className="mono-body text-text" style={{ fontSize: 14 }}>
                    {w.code}
                  </span>
                  <Badge tone={WO_TONE[w.status]} variant="filled">
                    {WO_LABEL[w.status]}
                  </Badge>
                  <span className="text-text-secondary" style={{ fontSize: 13 }}>
                    {w.quantity} × {w.productName}
                  </span>
                  <span className="mono-sm text-text-dim ml-auto">
                    {w.warehouseName ?? "—"}
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
