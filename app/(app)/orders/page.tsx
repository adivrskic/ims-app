import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerLink } from "@/components/ui/CornerButton";
import { LocalTime } from "@/components/ui/LocalTime";
import { Th, Td } from "@/components/ui/Table";
import { RelativeDate } from "@/app/(app)/_components/RelativeDate";
import { ChevronRight, ClipboardList, Plus, PackageX } from "lucide-react";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { OrdersRealtime } from "@/components/realtime/PageRealtime";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getOrdersList } from "@/lib/data/orders";
import { ListPagination } from "@/components/ui/ListPagination";
import {
  parsePage,
  parsePageSize,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
} from "@/lib/listParams";

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

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; pageSize?: string }>;
}) {
  const {
    status: rawStatus,
    page: rawPage,
    pageSize: rawPageSize,
  } = await searchParams;
  const activeFilter = FILTERS.find((f) => f.key === rawStatus) ?? FILTERS[0];
  const page = parsePage(rawPage);
  const pageSize = parsePageSize(rawPageSize);

  const [scope, ctx] = await Promise.all([
    getActiveScope(),
    getCurrentOrgContext(),
  ]);
  const facilityId = scope.mode === "single" ? scope.id : null;

  const data = ctx
    ? await getOrdersList(ctx.orgId, facilityId, activeFilter.statuses, {
        page,
        pageSize,
      })
    : null;

  const orders = (data?.orders ?? []) as OrderRow[];
  const total = data?.total ?? 0;
  const filteredTotal = data?.filteredTotal ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const servedPage = data?.page ?? 1;
  const servedSize = data?.pageSize ?? pageSize;
  // Rebuild the Map the chip rendering already expects. The fetcher returns
  // a plain object because unstable_cache serializes its result to JSON.
  const countMap = new Map<string, number>(Object.entries(data?.counts ?? {}));

  // Chip links reset page (no ?page=) but keep a non-default page size.
  const chipHref = (key: string) => {
    const sp = new URLSearchParams();
    if (key !== "all") sp.set("status", key);
    if (servedSize !== DEFAULT_PAGE_SIZE)
      sp.set("pageSize", String(servedSize));
    const qs = sp.toString();
    return qs ? `/orders?${qs}` : "/orders";
  };

  // Everything except page/pageSize, for the pagination links.
  const paginationBaseParams: Record<string, string> = {
    ...(activeFilter.key !== "all" ? { status: activeFilter.key } : {}),
    pageSize: String(servedSize),
  };

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
          <div className="flex items-center gap-10">
            <CornerLink href="/orders/backorders" variant="ghost" size="sm">
              <PackageX size={11} strokeWidth={1.5} />
              Backorders
            </CornerLink>
            <CornerLink href="/orders/new" variant="primary" size="sm">
              <Plus size={11} strokeWidth={1.5} />
              New order
            </CornerLink>
          </div>
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
              href={chipHref(f.key)}
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
          description="Create an order here, or let them flow in from the mobile pick app. They'll appear ranked by delivery date."
          icon={<ClipboardList size={20} strokeWidth={1.5} />}
        />
      ) : (
        <div className="hairline bg-[var(--surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table
              className="w-full"
              style={{ borderCollapse: "collapse" }}
              aria-label="Orders"
            >
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  <Th>Order</Th>
                  <Th>Type</Th>
                  <Th>Customer</Th>
                  <Th align="right">Items</Th>
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
                      <Td align="right">
                        <span
                          className="tnum text-text-secondary"
                          style={{ fontFamily: "var(--mono)", fontSize: 12 }}
                        >
                          {itemCount}
                        </span>
                      </Td>
                      <Td>
                        <RelativeDate
                          date={o.delivery_date}
                          suffix={o.delivery_window}
                          className="mono-sm text-text-secondary"
                        />
                      </Td>
                      <Td>
                        <Badge tone={cfg.tone} variant="filled">
                          {cfg.label}
                        </Badge>
                      </Td>
                      <Td>
                        <LocalTime
                          iso={o.created_at}
                          format="relative"
                          className="mono-sm text-text-dim"
                        />
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
          <ListPagination
            basePath="/orders"
            label="Orders pagination"
            page={servedPage}
            totalPages={totalPages}
            pageSize={servedSize}
            totalCount={filteredTotal}
            shown={orders.length}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            baseParams={paginationBaseParams}
          />
        </div>
      )}
    </div>
  );
}

