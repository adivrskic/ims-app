import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { Badge } from "@/components/ui/Badge";
import { CornerButton, CornerLink } from "@/components/ui/CornerButton";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { computeSupplierStats, type ScorecardPo } from "@/lib/supplier-stats";
import { formatCurrency } from "@/lib/dashboard";
import {
  ArrowLeft,
  Truck,
  Mail,
  Phone,
  MapPin,
  FileText,
  ChevronRight,
  Plus,
} from "lucide-react";
import { archiveSupplier, restoreSupplier } from "../actions";

export const metadata = { title: "Supplier · Settings" };

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
  partially_received: { label: "Partial", tone: "warning" },
  fully_received: { label: "Received", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: supplier }, { data: pos }, { data: products }] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select(
          "id, name, contact_email, contact_phone, address, payment_terms, default_lead_time_days, notes, is_active, created_at"
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("purchase_orders")
        .select(
          `id, po_number, status, expected_date, sent_at, received_at, created_at,
         lines:po_line_items ( quantity_expected, quantity_received, unit_cost, landed_unit_cost )`
        )
        .eq("supplier_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("products")
        .select("id, name, barcode, unit_cost")
        .eq("preferred_supplier_id", id)
        .order("name", { ascending: true }),
    ]);

  if (!supplier) notFound();

  // Compute the scorecard
  type RawPo = {
    id: string;
    po_number: string | null;
    status: PoStatus;
    expected_date: string | null;
    sent_at: string | null;
    received_at: string | null;
    created_at: string | null;
    lines: Array<{
      quantity_expected: number;
      quantity_received: number | null;
      unit_cost: string | null;
      landed_unit_cost: string | null;
    }> | null;
  };
  const rawPos = (pos ?? []) as RawPo[];
  const scorecardInput: ScorecardPo[] = rawPos.map((p) => ({
    id: p.id,
    status: p.status,
    expected_date: p.expected_date,
    sent_at: p.sent_at,
    received_at: p.received_at,
    lines: (p.lines ?? []).map((l) => ({
      quantity_expected: l.quantity_expected,
      quantity_received: l.quantity_received,
      unit_cost: l.unit_cost,
      landed_unit_cost: l.landed_unit_cost,
    })),
  }));
  const stats = computeSupplierStats(scorecardInput);

  const productRows = (products ?? []) as Array<{
    id: string;
    name: string;
    barcode: string;
    unit_cost: string | null;
  }>;

  return (
    <div className="flex flex-col gap-40">
      <Link
        href="/settings/suppliers"
        className="mono-sm text-text-muted hover:text-text inline-flex items-center gap-6 self-start"
      >
        <ArrowLeft size={12} strokeWidth={1.5} /> All suppliers
      </Link>

      <PageHeader
        eyebrow={`Supplier · ${supplier.is_active ? "Active" : "Archived"}`}
        title={supplier.name}
        description={supplier.address ?? "No address on file"}
        actions={
          supplier.is_active ? (
            <form action={archiveSupplier}>
              <input type="hidden" name="id" value={supplier.id} />
              <CornerButton type="submit" variant="ghost" size="sm">
                Archive
              </CornerButton>
            </form>
          ) : (
            <form action={restoreSupplier}>
              <input type="hidden" name="id" value={supplier.id} />
              <CornerButton type="submit" variant="primary" size="sm">
                Restore
              </CornerButton>
            </form>
          )
        }
        meta={[
          {
            label: "Payment terms",
            value: supplier.payment_terms ?? "—",
          },
          {
            label: "Default lead time",
            value:
              supplier.default_lead_time_days != null
                ? `${supplier.default_lead_time_days}d`
                : "—",
          },
        ]}
      />

      {/* Scorecard */}
      <section aria-labelledby="scorecard">
        <SectionTitle numeral="01" eyebrow="Performance" title="Scorecard" />
        {stats.totalPos === 0 ? (
          <EmptyState
            title="No POs yet"
            description="Once you place a purchase order against this supplier and receive shipments, performance metrics will appear here — on-time delivery, fill rate, lead time, and total spend."
            icon={<Truck size={20} strokeWidth={1.5} />}
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-12">
            <KpiCard
              label="On-time delivery"
              value={stats.onTimePct != null ? `${stats.onTimePct}%` : "—"}
              delta={
                stats.onTimePct == null
                  ? undefined
                  : {
                      value:
                        stats.onTimePct >= 90
                          ? "Excellent"
                          : stats.onTimePct >= 70
                          ? "On target"
                          : "Below target",
                      direction:
                        stats.onTimePct >= 90
                          ? "up"
                          : stats.onTimePct >= 70
                          ? "flat"
                          : "down",
                      tone:
                        stats.onTimePct >= 90
                          ? "good"
                          : stats.onTimePct >= 70
                          ? "neutral"
                          : "bad",
                    }
              }
            />
            <KpiCard
              label="Fill rate"
              value={stats.fillRatePct != null ? `${stats.fillRatePct}%` : "—"}
              delta={
                stats.fillRatePct == null
                  ? undefined
                  : {
                      value:
                        stats.fillRatePct >= 95
                          ? "Healthy"
                          : stats.fillRatePct >= 80
                          ? "Watch"
                          : "Underdelivering",
                      direction:
                        stats.fillRatePct >= 95
                          ? "up"
                          : stats.fillRatePct >= 80
                          ? "flat"
                          : "down",
                      tone:
                        stats.fillRatePct >= 95
                          ? "good"
                          : stats.fillRatePct >= 80
                          ? "neutral"
                          : "bad",
                    }
              }
            />
            <KpiCard
              label="Avg lead time"
              value={
                stats.avgLeadTimeDays != null
                  ? `${stats.avgLeadTimeDays}d`
                  : "—"
              }
              delta={
                stats.avgLeadTimeDays == null ||
                supplier.default_lead_time_days == null
                  ? undefined
                  : (() => {
                      const diff =
                        stats.avgLeadTimeDays - supplier.default_lead_time_days;
                      return {
                        value:
                          diff > 0
                            ? `${diff.toFixed(1)}d over quote`
                            : diff < 0
                            ? `${Math.abs(diff).toFixed(1)}d under quote`
                            : "Matches quote",
                        direction: diff <= 0 ? "down" : "up",
                        tone:
                          diff <= 0 ? "good" : diff <= 2 ? "neutral" : "bad",
                      };
                    })()
              }
            />
            <KpiCard
              label="Total spend"
              value={formatCurrency(stats.totalSpend)}
            />
            <KpiCard
              label="Orders"
              value={stats.totalPos.toLocaleString()}
              delta={{
                value: `${stats.openPos} open`,
                direction: "flat",
                tone: stats.openPos > 0 ? "neutral" : "neutral",
              }}
            />
          </div>
        )}
      </section>

      {/* Contact details */}
      <section aria-labelledby="contact">
        <SectionTitle numeral="02" eyebrow="Profile" title="Contact" />
        <article className="hairline bg-[var(--surface)] p-24">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-32 gap-y-16">
            <Detail
              icon={<Mail size={11} strokeWidth={1.5} />}
              label="Email"
              value={supplier.contact_email}
              mono
            />
            <Detail
              icon={<Phone size={11} strokeWidth={1.5} />}
              label="Phone"
              value={supplier.contact_phone}
              mono
            />
            <Detail
              icon={<MapPin size={11} strokeWidth={1.5} />}
              label="Address"
              value={supplier.address}
            />
            <Detail label="Payment terms" value={supplier.payment_terms} />
          </dl>
          {supplier.notes && (
            <>
              <p className="label-text--lg mt-32 mb-12">Notes</p>
              <p className="body-text--display whitespace-pre-wrap">
                {supplier.notes}
              </p>
            </>
          )}
        </article>
      </section>

      {/* PO history */}
      <section aria-labelledby="po-history">
        <SectionTitle
          numeral="03"
          eyebrow="Activity"
          title="Purchase orders"
          action={
            <CornerLink href="/purchase-orders/new" variant="ghost" size="sm">
              <Plus size={11} strokeWidth={1.5} /> New PO
            </CornerLink>
          }
        />
        {rawPos.length === 0 ? (
          <p className="mono-sm text-text-dim">
            No POs placed with this supplier yet.
          </p>
        ) : (
          <div className="hairline bg-[var(--surface)] overflow-hidden">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  <Th>PO</Th>
                  <Th>Status</Th>
                  <Th>Sent</Th>
                  <Th>Expected</Th>
                  <Th>Received</Th>
                  <Th align="right">Value</Th>
                  <Th align="right" srOnly>
                    Open
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rawPos.map((po) => {
                  const cfg = STATUS_CONFIG[po.status];
                  // Per-PO value: sum landed-or-unit × received
                  let value = 0;
                  for (const l of po.lines ?? []) {
                    const cost =
                      (l.landed_unit_cost
                        ? parseFloat(l.landed_unit_cost)
                        : null) ??
                      (l.unit_cost ? parseFloat(l.unit_cost) : null);
                    if (cost == null) continue;
                    value += cost * (l.quantity_received ?? 0);
                  }
                  return (
                    <tr key={po.id} className="hairline-b row-interactive">
                      <Td>
                        <Link
                          href={`/purchase-orders/${po.id}`}
                          className="text-text hover:text-[var(--accent)] mono-body"
                        >
                          {po.po_number ?? po.id.slice(0, 8)}
                        </Link>
                      </Td>
                      <Td>
                        <Badge tone={cfg.tone} variant="filled">
                          {cfg.label}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="mono-sm text-text-secondary">
                          {po.sent_at
                            ? new Date(po.sent_at).toLocaleDateString(
                                undefined,
                                { month: "short", day: "numeric" }
                              )
                            : "—"}
                        </span>
                      </Td>
                      <Td>
                        <span className="mono-sm text-text-secondary">
                          {po.expected_date
                            ? new Date(
                                po.expected_date + "T00:00:00"
                              ).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })
                            : "—"}
                        </span>
                      </Td>
                      <Td>
                        <span className="mono-sm text-text-secondary">
                          {po.received_at
                            ? new Date(po.received_at).toLocaleDateString(
                                undefined,
                                { month: "short", day: "numeric" }
                              )
                            : "—"}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="mono-body text-text tnum">
                          {value > 0 ? formatCurrency(value) : "—"}
                        </span>
                      </Td>
                      <Td align="right">
                        <Link
                          href={`/purchase-orders/${po.id}`}
                          aria-label={`Open ${po.po_number ?? "PO"}`}
                          className="text-text-dim hover:text-[var(--accent)]"
                        >
                          <ChevronRight size={12} strokeWidth={1.5} />
                        </Link>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Products supplied */}
      <section aria-labelledby="products-supplied">
        <SectionTitle
          numeral="04"
          eyebrow="Catalog"
          title="Products supplied"
        />
        {productRows.length === 0 ? (
          <p className="mono-sm text-text-dim">
            No products currently list this supplier as preferred. Set the
            preferred supplier on a product in Inventory to populate this.
          </p>
        ) : (
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {productRows.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/inventory/${p.id}`}
                  className="block px-20 py-12 flex items-center gap-14 row-interactive"
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-text truncate"
                      style={{
                        fontFamily: "var(--display)",
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      {p.name}
                    </p>
                    <code
                      className="mono-sm text-text-muted"
                      style={{ fontSize: 11 }}
                    >
                      {p.barcode}
                    </code>
                  </div>
                  <span className="mono-sm text-text-secondary tnum w-[80px] text-right">
                    {p.unit_cost
                      ? `$${parseFloat(p.unit_cost).toFixed(2)}`
                      : "—"}
                  </span>
                  <ChevronRight
                    size={12}
                    strokeWidth={1.5}
                    className="text-text-dim shrink-0"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function Detail({
  icon,
  label,
  value,
  mono,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="label-text mb-6 flex items-center gap-6">
        {icon && <span className="text-text-dim">{icon}</span>}
        <span>{label}</span>
      </dt>
      <dd
        className={`${
          mono ? "mono-body" : "body-text--display"
        } text-text break-words`}
      >
        {value || <span className="text-text-dim">—</span>}
      </dd>
    </div>
  );
}

function Th({
  children,
  align = "left",
  srOnly,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  srOnly?: boolean;
}) {
  return (
    <th
      scope="col"
      className={`px-16 py-10 label-text text-text-muted ${
        align === "right" ? "text-right" : "text-left"
      } ${srOnly ? "sr-only" : ""}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`px-16 py-12 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </td>
  );
}
