import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { CornerButton } from "@/components/ui/CornerButton";
import {
  ArrowLeft,
  FileText,
  Calendar,
  User,
  Mail,
  Building2,
  Check,
} from "lucide-react";
import { markPoSent, markPoCancelled, receiveLineItem } from "../actions";

export const metadata = { title: "PO detail" };

type PoStatus =
  | "draft"
  | "sent"
  | "partially_received"
  | "fully_received"
  | "cancelled";

const STATUS_CONFIG: Record<
  PoStatus,
  { label: string; tone: "neutral" | "info" | "warning" | "success" }
> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  partially_received: { label: "Partially received", tone: "warning" },
  fully_received: { label: "Fully received", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export default async function PoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: po } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, supplier_name, supplier_contact, status, expected_date, notes, created_at, updated_at, warehouse:warehouses ( name ), creator:profiles!purchase_orders_created_by_fkey ( full_name, email )"
    )
    .eq("id", id)
    .maybeSingle();

  if (!po) notFound();

  const { data: lines } = await supabase
    .from("po_line_items")
    .select(
      "id, product_id, product_name, barcode, quantity_expected, quantity_received, received_at"
    )
    .eq("po_id", id);

  type LineRow = {
    id: string;
    product_id: string | null;
    product_name: string | null;
    barcode: string | null;
    quantity_expected: number;
    quantity_received: number | null;
    received_at: string | null;
  };
  const items = (lines ?? []) as LineRow[];

  const status = po.status as PoStatus;
  const cfg = STATUS_CONFIG[status];
  const warehouse = Array.isArray(po.warehouse)
    ? po.warehouse[0]
    : po.warehouse;
  const creator = Array.isArray(po.creator) ? po.creator[0] : po.creator;

  const totalExpected = items.reduce((s, i) => s + i.quantity_expected, 0);
  const totalReceived = items.reduce(
    (s, i) => s + (i.quantity_received ?? 0),
    0
  );
  const receiptPct =
    totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0;

  const canReceive = status === "sent" || status === "partially_received";
  const canSend = status === "draft";
  const canCancel = status === "draft" || status === "sent";

  return (
    <div className="flex flex-col gap-32">
      <div className="flex flex-col gap-12">
        <Link
          href="/purchase-orders"
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors w-fit"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text">All purchase orders</span>
        </Link>

        <div className="flex items-start justify-between gap-20 flex-wrap">
          <div className="flex flex-col gap-8">
            <p className="label-text text-text-muted">Purchase order</p>
            <h1
              className="text-text"
              style={{
                fontFamily: "var(--mono)",
                fontSize: 28,
                fontWeight: 500,
                letterSpacing: "-0.5px",
              }}
            >
              {po.po_number}
            </h1>
            <p
              className="text-text-secondary"
              style={{ fontFamily: "var(--display)", fontSize: 15 }}
            >
              {po.supplier_name}
            </p>
          </div>
          <div className="flex items-center gap-12 flex-wrap">
            <Badge tone={cfg.tone} variant="filled">
              {cfg.label}
            </Badge>
            <span className="mono-sm text-text-dim">
              {warehouse?.name ?? "—"}
            </span>

            {canSend && (
              <form action={markPoSent}>
                <input type="hidden" name="id" value={po.id} />
                <CornerButton type="submit" variant="primary" size="sm">
                  Mark as sent →
                </CornerButton>
              </form>
            )}
            {canCancel && (
              <form action={markPoCancelled}>
                <input type="hidden" name="id" value={po.id} />
                <CornerButton type="submit" variant="danger" size="sm">
                  Cancel PO
                </CornerButton>
              </form>
            )}
          </div>
        </div>
      </div>

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
            <div className="flex items-baseline gap-12">
              <span className="label-text text-text-muted">Receipt</span>
              <span className="mono-body tnum text-text">
                {totalReceived} <span className="text-text-dim">/</span>{" "}
                {totalExpected}{" "}
                <span className="text-[var(--accent)]">({receiptPct}%)</span>
              </span>
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
                    className="text-right px-16 py-10 label-text text-text-muted"
                    scope="col"
                  >
                    Expected
                  </th>
                  <th
                    className="text-right px-16 py-10 label-text text-text-muted"
                    scope="col"
                  >
                    Received
                  </th>
                  <th
                    className="text-right px-16 py-10 label-text text-text-muted"
                    scope="col"
                    style={{ width: 120 }}
                  >
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const received = row.quantity_received ?? 0;
                  const fullyReceived = received >= row.quantity_expected;
                  return (
                    <tr key={row.id} className="hairline-b last:border-b-0">
                      <td className="px-16 py-12">
                        {row.product_id ? (
                          <Link
                            href={`/inventory/${row.product_id}`}
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
                              {row.product_name ?? "—"}
                            </p>
                            <code
                              className="mono-sm text-text-muted"
                              style={{ fontSize: 11 }}
                            >
                              {row.barcode ?? "—"}
                            </code>
                          </Link>
                        ) : (
                          <span className="text-text-muted">
                            {row.product_name}
                          </span>
                        )}
                      </td>
                      <td className="px-16 py-12 text-right">
                        <span className="mono-body text-text tnum">
                          {row.quantity_expected}
                        </span>
                      </td>
                      <td className="px-16 py-12 text-right">
                        <span
                          className={`mono-body tnum ${
                            received === 0
                              ? "text-text-dim"
                              : fullyReceived
                              ? "text-[var(--success)]"
                              : "text-[var(--warning)]"
                          }`}
                        >
                          {received}
                        </span>
                      </td>
                      <td className="px-16 py-12 text-right">
                        {fullyReceived ? (
                          <span className="inline-flex items-center gap-4 text-[var(--success)]">
                            <Check size={11} strokeWidth={1.5} />
                            <span className="label-text">Received</span>
                          </span>
                        ) : canReceive ? (
                          <form action={receiveLineItem}>
                            <input
                              type="hidden"
                              name="line_id"
                              value={row.id}
                            />
                            <input type="hidden" name="po_id" value={po.id} />
                            <CornerButton
                              type="submit"
                              variant="ghost"
                              size="sm"
                              ariaLabel={`Mark ${row.product_name} as received`}
                            >
                              Receive
                            </CornerButton>
                          </form>
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

          {po.notes && (
            <div className="hairline bg-[var(--surface)] p-16 flex items-start gap-12">
              <FileText
                size={12}
                strokeWidth={1.5}
                className="text-text-muted shrink-0 mt-2"
              />
              <div className="flex-1">
                <p className="label-text text-text-muted mb-4">Notes</p>
                <p className="mono-sm text-text-secondary">{po.notes}</p>
              </div>
            </div>
          )}
        </section>

        {/* Sidebar */}
        <aside className="flex flex-col gap-16">
          <section
            className="hairline bg-[var(--surface)] flex flex-col"
            aria-labelledby="supplier"
          >
            <header className="px-16 py-10 hairline-b">
              <h3 id="supplier" className="label-text text-text-muted">
                Supplier
              </h3>
            </header>
            <dl className="px-16 py-14 flex flex-col gap-10">
              <SidebarRow
                icon={<Building2 size={11} strokeWidth={1.5} />}
                label="Name"
                value={po.supplier_name}
              />
              {po.supplier_contact && (
                <SidebarRow
                  icon={<Mail size={11} strokeWidth={1.5} />}
                  label="Contact"
                  value={po.supplier_contact}
                  mono
                />
              )}
            </dl>
          </section>

          <section
            className="hairline bg-[var(--surface)] flex flex-col"
            aria-labelledby="schedule"
          >
            <header className="px-16 py-10 hairline-b">
              <h3 id="schedule" className="label-text text-text-muted">
                Schedule
              </h3>
            </header>
            <dl className="px-16 py-14 flex flex-col gap-10">
              <SidebarRow
                icon={<Calendar size={11} strokeWidth={1.5} />}
                label="Expected"
                value={
                  po.expected_date
                    ? new Date(
                        po.expected_date + "T00:00:00"
                      ).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })
                    : "TBD"
                }
              />
              {creator && (
                <SidebarRow
                  icon={<User size={11} strokeWidth={1.5} />}
                  label="Created by"
                  value={creator.full_name || creator.email || "—"}
                />
              )}
            </dl>
          </section>

          <div className="hairline bg-[var(--surface-2)] px-16 py-12">
            <p className="label-text text-text-muted">Created</p>
            <p className="mono-sm text-text mt-2">
              {po.created_at ? new Date(po.created_at).toLocaleString() : "—"}
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
