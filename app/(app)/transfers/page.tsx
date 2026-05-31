import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerLink } from "@/components/ui/CornerButton";
import { ArrowLeftRight, ArrowRight, Plus, ChevronRight } from "lucide-react";

export const metadata = { title: "Transfers" };

type OrderStatus =
  | "created"
  | "pick_list_assigned"
  | "in_progress"
  | "staged"
  | "ready"
  | "out_for_delivery"
  | "complete"
  | "cancelled";

// Transfer-friendly status mapping over the shared order lifecycle.
const TRANSFER_STATUS: Record<
  OrderStatus,
  { label: string; tone: "neutral" | "info" | "warning" | "success"; live?: boolean }
> = {
  created: { label: "Preparing", tone: "neutral" },
  pick_list_assigned: { label: "Preparing", tone: "info" },
  in_progress: { label: "Picking", tone: "info" },
  staged: { label: "Staged", tone: "info" },
  ready: { label: "Ready to ship", tone: "warning" },
  out_for_delivery: { label: "In transit", tone: "warning", live: true },
  complete: { label: "Received", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}
function relTime(iso: string | null): string {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d < 1) return "Today";
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default async function TransfersPage() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) {
    return <PageHeader eyebrow="Flow" title="Transfers" description="No workspace." />;
  }
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select(
      `id, order_number, status, created_at,
       source:warehouses!orders_warehouse_id_fkey ( name ),
       dest:warehouses!orders_destination_warehouse_id_fkey ( name ),
       items:order_items ( count )`
    )
    .eq("org_id", ctx.orgId)
    .eq("order_type", "internal_transfer")
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    order_number: string;
    status: OrderStatus;
    created_at: string | null;
    source: { name: string } | { name: string }[] | null;
    dest: { name: string } | { name: string }[] | null;
    items: Array<{ count: number }> | { count: number } | null;
  };
  const transfers = (data ?? []) as Row[];
  const inTransit = transfers.filter(
    (t) => t.status === "out_for_delivery"
  ).length;
  const open = transfers.filter(
    (t) => t.status !== "complete" && t.status !== "cancelled"
  ).length;

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Flow"
        title="Transfers"
        description="Move stock between facilities. Each transfer is created at a source, ships in-transit, and is received at its destination."
        meta={[
          { label: "Open", value: open },
          {
            label: "In transit",
            value: inTransit,
            status: inTransit > 0 ? "alert" : undefined,
          },
        ]}
        actions={
          <CornerLink
            href="/orders/new?type=internal_transfer"
            variant="primary"
            size="sm"
          >
            <Plus size={11} strokeWidth={1.5} />
            New transfer
          </CornerLink>
        }
      />

      {transfers.length === 0 ? (
        <EmptyState
          title="No transfers yet"
          description="Create a transfer to move stock from one facility to another. It'll show its source, destination, and in-transit status here."
          icon={<ArrowLeftRight size={20} strokeWidth={1.5} />}
        />
      ) : (
        <div className="hairline bg-[var(--surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  <Th>Transfer</Th>
                  <Th>Route</Th>
                  <Th className="text-right">Items</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                  <th aria-hidden style={{ width: 28 }} />
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => {
                  const items = firstOf(t.items);
                  const cfg = TRANSFER_STATUS[t.status];
                  const src = firstOf(t.source)?.name ?? "—";
                  const dst = firstOf(t.dest)?.name ?? "—";
                  return (
                    <tr key={t.id} className="hairline-b row-interactive group">
                      <Td>
                        <Link
                          href={`/orders/${t.id}`}
                          className="text-text group-hover:text-[var(--accent)] transition-colors"
                          style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 500 }}
                        >
                          {t.order_number}
                        </Link>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-8">
                          <span
                            className="text-text-secondary"
                            style={{ fontFamily: "var(--display)", fontSize: 13 }}
                          >
                            {src}
                          </span>
                          <ArrowRight
                            size={11}
                            strokeWidth={1.5}
                            className="text-text-dim shrink-0"
                            aria-label="to"
                          />
                          <span
                            className="text-text"
                            style={{ fontFamily: "var(--display)", fontSize: 13 }}
                          >
                            {dst}
                          </span>
                        </span>
                      </Td>
                      <Td className="text-right">
                        <span className="tnum text-text-secondary" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                          {items?.count ?? 0}
                        </span>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-6">
                          {cfg.live && <span className="dot dot-live" aria-hidden />}
                          <Badge tone={cfg.tone} variant="filled">
                            {cfg.label}
                          </Badge>
                        </span>
                      </Td>
                      <Td>
                        <span className="mono-sm text-text-dim">
                          {relTime(t.created_at)}
                        </span>
                      </Td>
                      <Td>
                        <ChevronRight
                          size={12}
                          strokeWidth={1.5}
                          className="text-text-dim group-hover:text-text-muted transition-colors"
                        />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
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
