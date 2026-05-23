import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerButton, CornerLink } from "@/components/ui/CornerButton";
import { ChevronRight, ClipboardList, Plus } from "lucide-react";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { OrdersRealtime } from "@/components/realtime/PageRealtime";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getOrdersList } from "@/lib/data/orders";

export const metadata = { title: "Orders" };

type OrderStatus =
  | "created"
  | "pick_list_assigned"
  | "in_progress"
  | "staged"
  | "ready"
  | "out_for_delivery"
  | "complete"
  | "cancelled";

type OrderType =
  | "installer_job"
  | "customer_pickup"
  | "internal_transfer"
  | "restock";

interface OrderRow {
  id: string;
  order_number: string | null;
  order_type: OrderType;
  status: OrderStatus;
  customer_name: string | null;
  delivery_date: string | null;
  delivery_window: string | null;
  created_at: string | null;
  items: Array<{ count: number }> | { count: number } | null;
}

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; tone: "neutral" | "info" | "warning" | "accent" | "success" }
> = {
  created: { label: "Created", tone: "neutral" },
  pick_list_assigned: { label: "Assigned", tone: "info" },
  in_progress: { label: "Picking", tone: "warning" },
  staged: { label: "Staged", tone: "warning" },
  ready: { label: "Ready", tone: "accent" },
  out_for_delivery: { label: "In transit", tone: "info" },
  complete: { label: "Complete", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const TYPE_LABEL: Record<OrderType, string> = {
  installer_job: "Install",
  customer_pickup: "Pickup",
  internal_transfer: "Transfer",
  restock: "Restock",
};

const FILTERS: Array<{
  key: string;
  label: string;
  statuses: OrderStatus[] | null;
}> = [
  { key: "all", label: "All", statuses: null },
  { key: "created", label: "Created", statuses: ["created"] },
  {
    key: "in_progress",
    label: "Picking",
    statuses: ["pick_list_assigned", "in_progress"],
  },
  { key: "staged", label: "Staged", statuses: ["staged"] },
  { key: "ready", label: "Ready", statuses: ["ready"] },
  { key: "transit", label: "In transit", statuses: ["out_for_delivery"] },
  { key: "complete", label: "Complete", statuses: ["complete"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function deliveryLabel(date: string | null, window: string | null): string {
  if (!date) return "—";
  const d = new Date(date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  let base: string;
  if (diff === 0) base = "Today";
  else if (diff === 1) base = "Tomorrow";
  else if (diff === -1) base = "Yesterday";
  else if (diff > 0 && diff < 7) base = `In ${diff}d`;
  else
    base = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return window ? `${base} · ${window}` : base;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: rawStatus } = await searchParams;
  const activeFilter = FILTERS.find((f) => f.key === rawStatus) ?? FILTERS[0];

  const scope = await getActiveScope();
  const ctx = await getCurrentOrgContext();
  const facilityId = scope.mode === "single" ? scope.id : null;

  const data = ctx
    ? await getOrdersList(ctx.orgId, facilityId, activeFilter.statuses)
    : null;

  const orders = (data?.orders ?? []) as OrderRow[];
  const total = data?.total ?? 0;
  // Rebuild the Map the chip rendering already expects. The fetcher returns
  // a plain object because unstable_cache serializes its result to JSON.
  const countMap = new Map<string, number>(Object.entries(data?.counts ?? {}));

  return (
    <div className="flex flex-col gap-32">
      <OrdersRealtime warehouseId={scope.mode === "single" ? scope.id : null} />
      <PageHeader
        eyebrow="Flow"
        title="Orders"
        description={scopeDescription(scope, {
          all: "Pick lists, deliveries, and customer pickups across all facilities.",
          single: (name) =>
            `Pick lists, deliveries, and customer pickups at ${name}.`,
        })}
        meta={[
          { label: "Total", value: total },
          {
            label: "Active",
            value:
              (countMap.get("created") ?? 0) +
              (countMap.get("pick_list_assigned") ?? 0) +
              (countMap.get("in_progress") ?? 0) +
              (countMap.get("staged") ?? 0) +
              (countMap.get("ready") ?? 0) +
              (countMap.get("out_for_delivery") ?? 0),
            status: "live" as const,
          },
        ]}
        actions={
          <CornerLink href="/orders/new" variant="primary" size="sm">
            <Plus size={11} strokeWidth={1.5} />
            New order
          </CornerLink>
        }
      />

      <nav
        className="flex items-center gap-2 hairline-b overflow-x-auto"
        aria-label="Filter by status"
      >
        {FILTERS.map((f) => {
          const isActive = f.key === activeFilter.key;
          const chipCount = f.statuses
            ? f.statuses.reduce((sum, s) => sum + (countMap.get(s) ?? 0), 0)
            : total;
          return (
            <Link
              key={f.key}
              href={f.key === "all" ? "/orders" : `/orders?status=${f.key}`}
              className={`relative px-12 py-10 transition-colors whitespace-nowrap flex items-center gap-8 ${
                isActive
                  ? "text-[var(--accent)]"
                  : "text-text-muted hover:text-text"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="label-text">{f.label}</span>
              <span
                className={`tnum ${
                  isActive ? "text-[var(--accent)]" : "text-text-dim"
                }`}
                style={{ fontFamily: "var(--mono)", fontSize: 10 }}
              >
                {chipCount}
              </span>
              {isActive && (
                <span
                  className="absolute left-0 right-0 bottom-0 h-px bg-[var(--accent)]"
                  aria-hidden
                  style={{ bottom: -1 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {orders.length === 0 ? (
        <EmptyState
          title={
            activeFilter.key === "all"
              ? scope.mode === "single"
                ? `No orders at ${scope.name}`
                : "No orders yet"
              : `No ${activeFilter.label.toLowerCase()} orders`
          }
          description="Orders flow in from the mobile pick app, Shopify, and direct CSV imports. They'll appear here ranked by delivery date."
          icon={<ClipboardList size={20} strokeWidth={1.5} />}
        />
      ) : (
        <div className="hairline bg-[var(--surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  <Th>Order</Th>
                  <Th>Type</Th>
                  <Th>Customer</Th>
                  <Th className="text-right">Items</Th>
                  <Th>Delivery</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                  <th aria-hidden style={{ width: 28 }} />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const items = Array.isArray(o.items) ? o.items[0] : o.items;
                  const itemCount = items?.count ?? 0;
                  const cfg = STATUS_CONFIG[o.status];
                  return (
                    <tr key={o.id} className="hairline-b row-interactive group">
                      <Td>
                        <Link
                          href={`/orders/${o.id}`}
                          className="text-text group-hover:text-[var(--accent)] transition-colors"
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                        >
                          {o.order_number ?? o.id.slice(0, 8)}
                        </Link>
                      </Td>
                      <Td>
                        <span className="label-text text-text-muted">
                          {TYPE_LABEL[o.order_type]}
                        </span>
                      </Td>
                      <Td>
                        <Link
                          href={`/orders/${o.id}`}
                          className="text-text group-hover:text-text transition-colors block"
                          style={{ fontFamily: "var(--display)", fontSize: 13 }}
                        >
                          {o.customer_name ?? "—"}
                        </Link>
                      </Td>
                      <Td className="text-right">
                        <span
                          className="tnum text-text-secondary"
                          style={{ fontFamily: "var(--mono)", fontSize: 12 }}
                        >
                          {itemCount}
                        </span>
                      </Td>
                      <Td>
                        <span className="mono-sm text-text-secondary">
                          {deliveryLabel(o.delivery_date, o.delivery_window)}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={cfg.tone} variant="filled">
                          {cfg.label}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="mono-sm text-text-dim">
                          {relTime(o.created_at)}
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
  return (
    <td className={`px-14 py-14 align-middle ${className}`}>{children}</td>
  );
}
