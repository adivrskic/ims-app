import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { CornerButton, CornerLink } from "@/components/ui/CornerButton";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  Check,
  X,
  Phone,
  MapPin,
  Calendar,
  User,
  FileText,
  Waypoints,
} from "lucide-react";
import { advanceOrderStatus, cancelOrder, allocateOrder } from "../actions";
import { OrderDetailRealtime } from "@/components/realtime/PageRealtime";

export const metadata = { title: "Order detail" };

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

/** Label for the button that advances to the next status. null = terminal state. */
const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  created: "Assign pick list",
  pick_list_assigned: "Start picking",
  in_progress: "Mark staged",
  staged: "Mark ready",
  ready: "Send out",
  out_for_delivery: "Complete order",
};

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
  installer_job: "Installer job",
  customer_pickup: "Customer pickup",
  internal_transfer: "Internal transfer",
  restock: "Section restock",
};

const TIMELINE: OrderStatus[] = [
  "created",
  "pick_list_assigned",
  "in_progress",
  "staged",
  "ready",
  "out_for_delivery",
  "complete",
];

const TIMELINE_LABEL: Record<OrderStatus, string> = {
  created: "Created",
  pick_list_assigned: "Assigned",
  in_progress: "Picking",
  staged: "Staged",
  ready: "Ready",
  out_for_delivery: "In transit",
  complete: "Complete",
  cancelled: "Cancelled",
};

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: actionError } = await searchParams;
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, order_type, status, customer_name, customer_phone, customer_address, delivery_date, delivery_window, notes, created_at, updated_at, assigned_to, pick_wave_id, warehouse:warehouses!orders_warehouse_id_fkey ( name ), destination:warehouses!orders_destination_warehouse_id_fkey ( name ), assignee:profiles!orders_assigned_to_fkey ( full_name, email ), pick_wave:pick_waves!orders_pick_wave_id_fkey ( id, code, status )"
    )
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const { data: items } = await supabase
    .from("order_items")
    .select(
      "id, quantity_requested, quantity_allocated, quantity_picked, notes, product:products ( id, name, barcode ), location:locations ( bay, level, section:sections ( code ) )"
    )
    .eq("order_id", id);

  type ItemRow = {
    id: string;
    quantity_requested: number;
    quantity_allocated: number | null;
    quantity_picked: number | null;
    notes: string | null;
    product:
      | { id: string; name: string; barcode: string }
      | { id: string; name: string; barcode: string }[]
      | null;
    location: unknown;
  };
  const rows = (items ?? []) as ItemRow[];

  const totalRequested = rows.reduce(
    (s, i) => s + (i.quantity_requested ?? 0),
    0
  );
  const totalPicked = rows.reduce((s, i) => s + (i.quantity_picked ?? 0), 0);
  const fulfillment =
    totalRequested > 0 ? Math.round((totalPicked / totalRequested) * 100) : 0;

  const totalAllocated = rows.reduce(
    (s, i) => s + (i.quantity_allocated ?? 0),
    0
  );
  const totalBackordered = rows.reduce(
    (s, i) => s + Math.max(0, i.quantity_requested - (i.quantity_allocated ?? 0)),
    0
  );

  const status = order.status as OrderStatus;
  const cfg = STATUS_CONFIG[status];
  const isCancelled = status === "cancelled";
  const orderType = order.order_type as OrderType;
  const warehouse = Array.isArray(order.warehouse)
    ? order.warehouse[0]
    : order.warehouse;
  const destination = Array.isArray(order.destination)
    ? order.destination[0]
    : order.destination;
  const isTransfer = orderType === "internal_transfer";
  const assignee = Array.isArray(order.assignee)
    ? order.assignee[0]
    : order.assignee;
  const pickWave = Array.isArray(order.pick_wave)
    ? order.pick_wave[0]
    : order.pick_wave;

  const nextStatusLabel = NEXT_LABEL[status];
  const canCancel = status !== "complete" && status !== "cancelled";

  return (
    <div className="flex flex-col gap-32">
      <OrderDetailRealtime orderId={id} />
      {actionError && (
        <div className="hairline border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-16 py-12 flex items-start gap-12">
          <X
            size={14}
            strokeWidth={1.5}
            className="text-[var(--danger)] shrink-0 mt-2"
          />
          <p className="mono-sm text-[var(--danger)]">{actionError}</p>
        </div>
      )}
      <PageHeader
        backHref="/orders"
        backLabel="All orders"
        eyebrow={TYPE_LABEL[orderType]}
        title={order.order_number ?? order.id.slice(0, 8)}
        description={order.customer_name ?? undefined}
        actions={
          <>
            <Badge tone={cfg.tone} variant="filled">
              {cfg.label}
            </Badge>
            <span className="mono-sm text-text-dim">
              {isTransfer
                ? `${warehouse?.name ?? "—"} → ${destination?.name ?? "—"}`
                : warehouse?.name ?? "—"}
            </span>
            {pickWave && (
              <Link
                href={`/picking/${pickWave.id}`}
                className="mono-sm text-[var(--accent)] hover:underline inline-flex items-center gap-4"
                title={`In pick wave ${pickWave.code} (${pickWave.status})`}
              >
                <Waypoints size={11} strokeWidth={1.5} />
                {pickWave.code}
              </Link>
            )}

            {nextStatusLabel && (
              <form action={advanceOrderStatus}>
                <input type="hidden" name="id" value={order.id} />
                <input type="hidden" name="current_status" value={status} />
                <CornerButton type="submit" variant="primary" size="sm">
                  {nextStatusLabel} →
                </CornerButton>
              </form>
            )}
            {canCancel && (
              <form action={cancelOrder}>
                <input type="hidden" name="id" value={order.id} />
                <CornerButton type="submit" variant="danger" size="sm">
                  Cancel order
                </CornerButton>
              </form>
            )}
          </>
        }
      />

      {/* Status timeline */}
      {isCancelled ? (
        <div className="hairline border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] p-20 flex items-start gap-14">
          <X
            size={16}
            strokeWidth={1.5}
            className="text-[var(--danger)] shrink-0 mt-2"
          />
          <div>
            <p
              className="text-[var(--danger)]"
              style={{
                fontFamily: "var(--display)",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Order cancelled
            </p>
            {order.notes && (
              <p className="mono-sm text-text-secondary mt-6">{order.notes}</p>
            )}
          </div>
        </div>
      ) : (
        <Timeline current={status} />
      )}

      {isTransfer && !isCancelled && (
        <div className="hairline border-[var(--border-subtle)] bg-[var(--surface-2)] px-16 py-12 flex items-start gap-12">
          <Waypoints
            size={14}
            strokeWidth={1.5}
            className="text-text-muted shrink-0 mt-2"
          />
          <p className="mono-sm text-text-secondary">
            Picking removes stock from {warehouse?.name ?? "the source"}. To
            credit on-hand at {destination?.name ?? "the destination"}, place the
            received units into a location there via the facility floor — transfers
            don&apos;t move stock automatically.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-24">
        {/* Line items */}
        <section className="flex flex-col gap-16" aria-labelledby="line-items">
          <header className="flex items-baseline justify-between">
            <h2
              id="line-items"
              className="text-text"
              style={{
                fontFamily: "var(--display)",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              Line items
            </h2>
            <div className="flex items-baseline gap-16 flex-wrap">
              <div className="flex items-baseline gap-8">
                <span className="label-text text-text-muted">Allocated</span>
                <span className="mono-body tnum text-text">
                  {totalAllocated} <span className="text-text-dim">/</span>{" "}
                  {totalRequested}
                  {totalBackordered > 0 && (
                    <span className="text-[var(--warning)]">
                      {" "}
                      · {totalBackordered} backordered
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-baseline gap-8">
                <span className="label-text text-text-muted">Fulfillment</span>
                <span className="mono-body tnum text-text">
                  {totalPicked} <span className="text-text-dim">/</span>{" "}
                  {totalRequested}{" "}
                  <span className="text-[var(--accent)]">({fulfillment}%)</span>
                </span>
              </div>
              {canCancel && totalBackordered > 0 && (
                <form action={allocateOrder}>
                  <input type="hidden" name="id" value={order.id} />
                  <CornerButton type="submit" variant="ghost" size="sm">
                    Re-allocate
                  </CornerButton>
                </form>
              )}
            </div>
          </header>

          <div className="hairline bg-[var(--surface)] overflow-hidden">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  <th
                    className="text-left px-16 py-10 label-text text-text-muted"
                    scope="col"
                  >
                    Product
                  </th>
                  <th
                    className="text-left px-16 py-10 label-text text-text-muted"
                    scope="col"
                  >
                    Location
                  </th>
                  <th
                    className="text-right px-16 py-10 label-text text-text-muted"
                    scope="col"
                  >
                    Requested
                  </th>
                  <th
                    className="text-right px-16 py-10 label-text text-text-muted"
                    scope="col"
                  >
                    Allocated
                  </th>
                  <th
                    className="text-right px-16 py-10 label-text text-text-muted"
                    scope="col"
                  >
                    Backorder
                  </th>
                  <th
                    className="text-right px-16 py-10 label-text text-text-muted"
                    scope="col"
                  >
                    Picked
                  </th>
                  <th
                    className="text-right px-16 py-10 label-text text-text-muted"
                    scope="col"
                    style={{ width: 80 }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const product = Array.isArray(row.product)
                    ? row.product[0]
                    : row.product;
                  const loc = Array.isArray(row.location)
                    ? row.location[0]
                    : row.location;
                  const locTyped = loc as {
                    bay: number;
                    level: number;
                    section: { code: string } | { code: string }[] | null;
                  } | null;
                  const section = locTyped
                    ? Array.isArray(locTyped.section)
                      ? locTyped.section[0]
                      : locTyped.section
                    : null;
                  const locLabel =
                    locTyped && section
                      ? `${section.code}-${String(locTyped.bay).padStart(
                          2,
                          "0"
                        )}·L${locTyped.level}`
                      : "Unassigned";
                  const picked = row.quantity_picked ?? 0;
                  const requested = row.quantity_requested;
                  const allocated = row.quantity_allocated ?? 0;
                  const backordered = Math.max(0, requested - allocated);
                  const fullyPicked = picked >= requested;
                  return (
                    <tr key={row.id} className="hairline-b last:border-b-0">
                      <td className="px-16 py-12">
                        {product ? (
                          <Link
                            href={`/inventory/${product.id}`}
                            className="block"
                          >
                            <p
                              className="text-text hover:text-[var(--accent)] transition-colors truncate"
                              style={{
                                fontFamily: "var(--display)",
                                fontSize: 13,
                                fontWeight: 500,
                              }}
                            >
                              {product.name}
                            </p>
                            <code
                              className="mono-sm text-text-muted"
                              style={{ fontSize: 11 }}
                            >
                              {product.barcode}
                            </code>
                          </Link>
                        ) : (
                          <span className="text-text-muted">Unknown</span>
                        )}
                      </td>
                      <td className="px-16 py-12">
                        <code
                          className="mono-sm text-text-secondary"
                          style={{ fontSize: 11 }}
                        >
                          {locLabel}
                        </code>
                      </td>
                      <td className="px-16 py-12 text-right">
                        <span className="mono-body text-text tnum">
                          {requested}
                        </span>
                      </td>
                      <td className="px-16 py-12 text-right">
                        <span
                          className={`mono-body tnum ${
                            allocated >= requested
                              ? "text-[var(--success)]"
                              : allocated === 0
                              ? "text-text-dim"
                              : "text-text"
                          }`}
                        >
                          {allocated}
                        </span>
                      </td>
                      <td className="px-16 py-12 text-right">
                        <span
                          className={`mono-body tnum ${
                            backordered > 0
                              ? "text-[var(--warning)]"
                              : "text-text-dim"
                          }`}
                        >
                          {backordered > 0 ? backordered : "—"}
                        </span>
                      </td>
                      <td className="px-16 py-12 text-right">
                        <span
                          className={`mono-body tnum ${
                            picked === 0
                              ? "text-text-dim"
                              : fullyPicked
                              ? "text-[var(--success)]"
                              : "text-[var(--warning)]"
                          }`}
                        >
                          {picked}
                        </span>
                      </td>
                      <td className="px-16 py-12 text-right">
                        {fullyPicked ? (
                          <Check
                            size={12}
                            strokeWidth={1.5}
                            className="inline text-[var(--success)]"
                          />
                        ) : picked > 0 ? (
                          <span className="label-text text-[var(--warning)]">
                            Partial
                          </span>
                        ) : (
                          <span className="label-text text-text-dim">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {order.notes && !isCancelled && (
            <div className="hairline bg-[var(--surface)] p-16 flex items-start gap-12">
              <FileText
                size={12}
                strokeWidth={1.5}
                className="text-text-muted shrink-0 mt-2"
              />
              <div className="flex-1">
                <p className="label-text text-text-muted mb-4">Notes</p>
                <p className="mono-sm text-text-secondary">{order.notes}</p>
              </div>
            </div>
          )}
        </section>

        {/* Sidebar */}
        <aside className="flex flex-col gap-16">
          <section
            className="hairline bg-[var(--surface)] flex flex-col"
            aria-labelledby="customer"
          >
            <header className="px-16 py-10 hairline-b">
              <h3 id="customer" className="label-text text-text-muted">
                Customer
              </h3>
            </header>
            <dl className="px-16 py-14 flex flex-col gap-10">
              <SidebarRow
                icon={<User size={11} strokeWidth={1.5} />}
                label="Name"
                value={order.customer_name ?? "—"}
              />
              {order.customer_phone && (
                <SidebarRow
                  icon={<Phone size={11} strokeWidth={1.5} />}
                  label="Phone"
                  value={order.customer_phone}
                  mono
                />
              )}
              {order.customer_address && (
                <SidebarRow
                  icon={<MapPin size={11} strokeWidth={1.5} />}
                  label="Address"
                  value={order.customer_address}
                />
              )}
            </dl>
          </section>

          <section
            className="hairline bg-[var(--surface)] flex flex-col"
            aria-labelledby="delivery"
          >
            <header className="px-16 py-10 hairline-b">
              <h3 id="delivery" className="label-text text-text-muted">
                Delivery
              </h3>
            </header>
            <dl className="px-16 py-14 flex flex-col gap-10">
              <SidebarRow
                icon={<Calendar size={11} strokeWidth={1.5} />}
                label="Date"
                value={
                  order.delivery_date
                    ? new Date(
                        order.delivery_date + "T00:00:00"
                      ).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })
                    : "Not scheduled"
                }
              />
              {order.delivery_window && (
                <SidebarRow label="Window" value={order.delivery_window} mono />
              )}
              {assignee && (
                <SidebarRow
                  label="Assigned to"
                  value={assignee.full_name || assignee.email || "—"}
                />
              )}
            </dl>
          </section>

          <div className="hairline bg-[var(--surface-2)] px-16 py-12">
            <p className="label-text text-text-muted">Created</p>
            <p className="mono-sm text-text mt-2">
              {order.created_at
                ? new Date(order.created_at).toLocaleString()
                : "—"}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SidebarRow({
  icon,
  label,
  value,
  mono,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-10">
      {icon && <span className="text-text-dim mt-3">{icon}</span>}
      <div className="flex-1 min-w-0">
        <dt className="label-text text-text-muted mb-1">{label}</dt>
        <dd
          className={`${mono ? "mono-sm" : ""} text-text break-words`}
          style={
            mono ? undefined : { fontFamily: "var(--display)", fontSize: 13 }
          }
        >
          {value}
        </dd>
      </div>
    </div>
  );
}

function Timeline({ current }: { current: OrderStatus }) {
  const currentIdx = TIMELINE.indexOf(current);

  return (
    <ol
      className="hairline bg-[var(--surface)] px-20 py-16 flex items-center justify-between gap-4 overflow-x-auto"
      aria-label="Order progress"
    >
      {TIMELINE.map((step, i) => {
        const isComplete = i < currentIdx;
        const isCurrent = i === currentIdx;
        const isPending = i > currentIdx;
        return (
          <li key={step} className="flex items-center gap-4 shrink-0">
            <div className="flex flex-col items-center gap-6">
              <span
                className={`flex items-center justify-center transition-colors ${
                  isCurrent
                    ? "bg-[var(--accent)] text-[var(--black)]"
                    : isComplete
                    ? "bg-[var(--success-dim)] text-[var(--success)] hairline-subtle border-[rgba(34,197,94,0.45)]"
                    : "hairline-subtle text-text-dim"
                }`}
                style={{
                  width: 20,
                  height: 20,
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  fontWeight: 600,
                }}
                aria-hidden
              >
                {isComplete ? <Check size={11} strokeWidth={2} /> : i + 1}
              </span>
              <span
                className={`label-text whitespace-nowrap ${
                  isCurrent
                    ? "text-[var(--accent)]"
                    : isPending
                    ? "text-text-dim"
                    : "text-text-secondary"
                }`}
              >
                {TIMELINE_LABEL[step]}
              </span>
            </div>
            {i < TIMELINE.length - 1 && (
              <div
                className="h-px shrink-0"
                style={{
                  width: 24,
                  background:
                    i < currentIdx ? "var(--success)" : "var(--border-subtle)",
                  marginBottom: 16,
                }}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
