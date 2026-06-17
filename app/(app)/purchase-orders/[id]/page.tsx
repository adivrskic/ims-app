import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Send, X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getSlottingSuggestions } from "@/lib/data/slotting";
import { getFillableBackorders } from "@/lib/data/allocation";
import { fillBackorders } from "@/app/(app)/orders/actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { CornerButton } from "@/components/ui/CornerButton";
import { ReceiveLineForm } from "./ReceiveLineForm";
import { markPoSent, markPoCancelled } from "../actions";
import { PurchaseOrderDetailRealtime } from "@/components/realtime/PageRealtime";
import { PrintLabelButton } from "@/components/print/PrintLabelButton";
import { receiveLabel, productLabel } from "@/lib/print/zplTemplates";

export const metadata = { title: "Purchase order" };

type PoStatus =
  | "draft"
  | "sent"
  | "partially_received"
  | "fully_received"
  | "cancelled";

const STATUS_LABEL: Record<PoStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_received: "Partially received",
  fully_received: "Received",
  cancelled: "Cancelled",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  /*
   * Fetch the PO with its destination warehouse embedded. Lines are a
   * separate query because we want them sorted independently and because
   * embedding many-to-many with ordering gets messy in PostgREST.
   */
  const { data: poData, error: poErr } = await supabase
    .from("purchase_orders")
    .select(
      `id, po_number, status, supplier_id, supplier_name, supplier_contact,
       warehouse_id, expected_date, sent_at, received_at, created_at, notes,
       warehouse:warehouses ( id, name )`
    )
    .eq("id", id)
    .maybeSingle();

  if (poErr || !poData) notFound();

  const warehouse = Array.isArray(poData.warehouse)
    ? poData.warehouse[0]
    : poData.warehouse;

  const { data: lineData } = await supabase
    .from("po_line_items")
    .select(
      `id, product_id, product_name, barcode, quantity_expected,
       quantity_received, unit_cost, landed_unit_cost, reasoning,
       received_at, lot_number, qc_status`
    )
    .eq("po_id", id)
    .order("created_at", { ascending: true });

  type LineRow = {
    id: string;
    product_id: string | null;
    product_name: string;
    barcode: string | null;
    quantity_expected: number;
    quantity_received: number | null;
    unit_cost: string | null;
    landed_unit_cost: string | null;
    reasoning: string | null;
    received_at: string | null;
    lot_number: string | null;
    qc_status: string | null;
  };

  const lines = (lineData ?? []) as LineRow[];

  const status = poData.status as PoStatus;
  const statusLabel = STATUS_LABEL[status] ?? status;

  // ─── Headline math ─────────────────────────────────────────────────────
  const totalExpected = lines.reduce((s, l) => s + l.quantity_expected, 0);
  const totalReceived = lines.reduce(
    (s, l) => s + (l.quantity_received ?? 0),
    0
  );
  const receivedPct =
    totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0;

  // Received value prefers landed_unit_cost (true all-in cost captured at
  // putaway) and falls back to unit_cost (snapshotted at draft time).
  const totalValue = lines.reduce((s, l) => {
    const cost =
      (l.landed_unit_cost ? parseFloat(l.landed_unit_cost) : null) ??
      (l.unit_cost ? parseFloat(l.unit_cost) : null);
    if (cost == null) return s;
    return s + cost * (l.quantity_received ?? 0);
  }, 0);

  // Expected value uses unit_cost only — landed cost isn't known until
  // receipt, so the "expected" view should reflect the original quote.
  const expectedValue = lines.reduce((s, l) => {
    const cost = l.unit_cost ? parseFloat(l.unit_cost) : null;
    if (cost == null) return s;
    return s + cost * l.quantity_expected;
  }, 0);

  // ─── Affordances ───────────────────────────────────────────────────────
  // Lifecycle: draft → sent → partially_received → fully_received
  //              \—————————————————————————————→ cancelled (from anywhere
  //                                              except already-completed)
  const canEdit = status !== "fully_received" && status !== "cancelled";
  const canSend = status === "draft";
  const canReceive = status === "sent" || status === "partially_received";

  // Slotting hints (#8 / §6b): for a receivable PO, suggest the best slot for
  // each still-open line so the receiver knows where to put stock away. Skipped
  // entirely unless we're in a receivable state with a destination facility.
  const slotHints = new Map<string, { label: string; reasons: string[] }>();
  if (canReceive && warehouse?.id) {
    const ctx = await getCurrentOrgContext();
    if (ctx) {
      const openLines = lines.filter(
        (l) => l.product_id && (l.quantity_received ?? 0) < l.quantity_expected
      );
      const results = await Promise.all(
        openLines.map((l) =>
          getSlottingSuggestions(
            supabase,
            ctx.orgId,
            warehouse.id,
            l.product_id as string,
            {
              limit: 1,
              quantity:
                l.quantity_expected - (l.quantity_received ?? 0) || 1,
            }
          ).then((r) => ({ lineId: l.id, top: r.suggestions[0] ?? null }))
        )
      );
      for (const { lineId, top } of results) {
        if (top) slotHints.set(lineId, { label: top.label, reasons: top.reasons });
      }
    }
  }

  // Backorder fill suggestions (allocation §): for products already received on
  // this PO, surface how much backordered order demand the new stock can fill.
  // Suggestion only — the user confirms via the per-product button.
  type FillSuggestion = {
    productId: string;
    productName: string;
    fillableUnits: number;
    backorderedUnits: number;
    orderCount: number;
  };
  const fillSuggestions: FillSuggestion[] = [];
  if ((canReceive || status === "fully_received") && warehouse?.id) {
    const ctx = await getCurrentOrgContext();
    if (ctx) {
      const receivedProducts = new Map<string, string>();
      for (const l of lines) {
        if (l.product_id && (l.quantity_received ?? 0) > 0) {
          receivedProducts.set(l.product_id, l.product_name);
        }
      }
      const fills = await Promise.all(
        [...receivedProducts.entries()].map(([pid, name]) =>
          getFillableBackorders(supabase, ctx.orgId, warehouse.id, pid).then(
            (f) => ({ ...f, name })
          )
        )
      );
      for (const f of fills) {
        if (f.fillableUnits > 0) {
          fillSuggestions.push({
            productId: f.productId,
            productName: f.name,
            fillableUnits: f.fillableUnits,
            backorderedUnits: f.backorderedUnits,
            orderCount: f.orderCount,
          });
        }
      }
    }
  }

  // PO title falls back to a truncated UUID if no po_number is set (e.g.
  // a draft that hadn't been numbered yet — shouldn't happen in practice
  // since draftReorderPO always assigns one).
  const title = poData.po_number ?? `PO ${poData.id.slice(0, 8)}`;

  const subtitleParts = [
    poData.supplier_name ?? "Supplier TBD",
    warehouse?.name ? `Arriving at ${warehouse.name}` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-32">
      <PurchaseOrderDetailRealtime poId={id} />

      <PageHeader
        live
        backHref="/purchase-orders"
        backLabel="All purchase orders"
        eyebrow="Purchase order"
        title={title}
        description={subtitleParts.join(" · ")}
        meta={[
          { label: "Status", value: statusLabel },
          { label: "Expected", value: formatDate(poData.expected_date) },
          { label: "Sent", value: formatDate(poData.sent_at) },
          { label: "Received", value: formatDate(poData.received_at) },
        ]}
        actions={
          canEdit ? (
            <div className="flex items-center gap-10">
              {canSend && (
                <form action={markPoSent}>
                  <input type="hidden" name="id" value={poData.id} />
                  <CornerButton type="submit" variant="primary" size="sm">
                    <Send size={11} strokeWidth={1.5} />
                    Mark as sent
                  </CornerButton>
                </form>
              )}
              <form action={markPoCancelled}>
                <input type="hidden" name="id" value={poData.id} />
                <CornerButton type="submit" variant="ghost" size="sm">
                  <XIcon size={11} strokeWidth={1.5} />
                  Cancel PO
                </CornerButton>
              </form>
            </div>
          ) : undefined
        }
      />

      {/* Headline metrics */}
      <section aria-labelledby="metrics">
        <h2 id="metrics" className="sr-only">
          Headline metrics
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
          <Stat label="Lines" value={lines.length.toLocaleString()} />
          <Stat label="Units expected" value={totalExpected.toLocaleString()} />
          <Stat
            label="Units received"
            value={totalReceived.toLocaleString()}
            sub={totalExpected > 0 ? `${receivedPct}% of expected` : undefined}
          />
          <Stat
            label="Value received"
            value={formatCurrency(totalValue)}
            sub={
              expectedValue > 0
                ? `Of ${formatCurrency(expectedValue)} expected`
                : undefined
            }
          />
        </div>
      </section>

      {/* Backorder fill suggestions — received stock can satisfy waiting orders. */}
      {fillSuggestions.length > 0 && (
        <section aria-labelledby="backorder-fill">
          <SectionTitle
            eyebrow="Allocation"
            title="Fill backorders"
            action={
              <span className="label-text text-text-muted">
                Received stock can satisfy waiting orders
              </span>
            }
          />
          <ul className="flex flex-col gap-10">
            {fillSuggestions.map((f) => (
              <li
                key={f.productId}
                className="hairline bg-[var(--surface)] px-16 py-12 flex items-center gap-14 flex-wrap"
              >
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/inventory/${f.productId}`}
                    className="text-text hover:text-[var(--accent)] transition-colors"
                    style={{ fontFamily: "var(--display)", fontSize: 13 }}
                  >
                    {f.productName}
                  </Link>
                  <p className="mono-sm text-text-muted mt-2">
                    Fill <span className="text-[var(--accent)]">{f.fillableUnits}</span>{" "}
                    of {f.backorderedUnits} backordered unit
                    {f.backorderedUnits === 1 ? "" : "s"} across {f.orderCount}{" "}
                    order{f.orderCount === 1 ? "" : "s"} (oldest first).
                  </p>
                </div>
                <form action={fillBackorders}>
                  <input
                    type="hidden"
                    name="warehouse_id"
                    value={warehouse?.id ?? ""}
                  />
                  <input type="hidden" name="product_id" value={f.productId} />
                  <input type="hidden" name="po_id" value={poData.id} />
                  <CornerButton type="submit" variant="primary" size="sm">
                    Fill backorders
                  </CornerButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Notes — only shown when populated (auto-drafted POs have a notes
          summary; manually-created ones may not). */}
      {poData.notes && (
        <section aria-labelledby="notes">
          <SectionTitle eyebrow="Context" title="Notes" />
          <article className="hairline bg-[var(--surface)] p-20 flex items-start gap-14">
            <span
              className="w-22 h-22 hairline-subtle bg-[var(--surface-2)] flex items-center justify-center shrink-0 text-text-muted"
              aria-hidden
            >
              <FileText size={11} strokeWidth={1.5} />
            </span>
            <p
              className="text-text flex-1"
              style={{
                fontFamily: "var(--mono)",
                fontSize: 12,
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
              }}
            >
              {poData.notes}
            </p>
          </article>
        </section>
      )}

      {/* Line items */}
      <section aria-labelledby="lines">
        <SectionTitle
          eyebrow="Items"
          title="Line items"
          action={
            lines.length > 0 ? (
              <span className="label-text text-text-muted">
                {lines.length} {lines.length === 1 ? "line" : "lines"}
              </span>
            ) : undefined
          }
        />
        {canReceive && (
          <p className="mono-sm text-text-muted mb-12">
            Recording a receipt logs the quantity and reconciles the PO — it
            doesn&apos;t add on-hand. Put the received stock away into a location
            on the facility floor to make it available. (QC holds land as
            quarantined stock until cleared.)
          </p>
        )}
        {lines.length === 0 ? (
          <p className="mono-sm text-text-dim">This PO has no line items.</p>
        ) : (
          <div className="hairline bg-[var(--surface)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className="hairline-b bg-[var(--surface-2)]">
                    <Th>#</Th>
                    <Th>Product</Th>
                    <Th align="right">Expected</Th>
                    <Th align="right">Received</Th>
                    <Th align="right">Unit cost</Th>
                    {canReceive && <Th align="right">Receive</Th>}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const received = line.quantity_received ?? 0;
                    const fullyReceived = received >= line.quantity_expected;
                    const partiallyReceived = received > 0 && !fullyReceived;
                    const slotHint = fullyReceived
                      ? undefined
                      : slotHints.get(line.id);

                    // Display cost prefers landed (actual paid) over unit
                    // (quoted). Falls back to "—" when neither known.
                    const displayCost =
                      (line.landed_unit_cost
                        ? parseFloat(line.landed_unit_cost)
                        : null) ??
                      (line.unit_cost ? parseFloat(line.unit_cost) : null);

                    // colSpan for the reasoning sub-row matches whatever
                    // columns the line row uses.
                    const colSpan = canReceive ? 6 : 5;

                    return (
                      <Fragment key={line.id}>
                        <tr className="hairline-b last:border-b-0">
                          <Td>
                            <span className="mono-sm text-text-dim tnum">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                          </Td>
                          <Td>
                            <div className="flex flex-col gap-2 min-w-0">
                              {line.product_id ? (
                                <Link
                                  href={`/inventory/${line.product_id}`}
                                  className="text-text hover:text-[var(--accent)] transition-colors truncate"
                                  style={{
                                    fontFamily: "var(--display)",
                                    fontSize: 13,
                                    fontWeight: 500,
                                  }}
                                >
                                  {line.product_name}
                                </Link>
                              ) : (
                                <span
                                  className="text-text truncate"
                                  style={{
                                    fontFamily: "var(--display)",
                                    fontSize: 13,
                                    fontWeight: 500,
                                  }}
                                >
                                  {line.product_name}
                                </span>
                              )}
                              <div className="flex items-center gap-10">
                                {line.barcode && (
                                  <code
                                    className="mono-sm text-text-dim"
                                    style={{ fontSize: 10 }}
                                  >
                                    {line.barcode}
                                  </code>
                                )}
                                {line.lot_number && (
                                  <span
                                    className="mono-sm text-text-muted"
                                    style={{ fontSize: 10 }}
                                  >
                                    Lot {line.lot_number}
                                  </span>
                                )}
                                {line.qc_status &&
                                  line.qc_status !== "none" && (
                                    <span
                                      className="px-6 py-1"
                                      style={{
                                        fontFamily: "var(--mono)",
                                        fontSize: 8,
                                        letterSpacing: "0.5px",
                                        textTransform: "uppercase",
                                        background:
                                          line.qc_status === "failed"
                                            ? "var(--danger-dim)"
                                            : line.qc_status === "passed"
                                            ? "var(--success-dim)"
                                            : "var(--warning-dim)",
                                        color:
                                          line.qc_status === "failed"
                                            ? "var(--danger)"
                                            : line.qc_status === "passed"
                                            ? "var(--success)"
                                            : "var(--warning)",
                                      }}
                                      title={`QC ${line.qc_status}`}
                                    >
                                      QC {line.qc_status}
                                    </span>
                                  )}
                              </div>
                              {slotHint && (
                                <span
                                  className="mono-sm text-[var(--accent)]"
                                  style={{ fontSize: 10 }}
                                  title={
                                    slotHint.reasons.length
                                      ? slotHint.reasons.join(" · ")
                                      : undefined
                                  }
                                >
                                  Suggested slot {slotHint.label}
                                  {slotHint.reasons.length > 0 && (
                                    <span className="text-text-dim">
                                      {" · "}
                                      {slotHint.reasons.slice(0, 2).join(" · ")}
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </Td>
                          <Td align="right">
                            <span className="mono-body tnum text-text">
                              {line.quantity_expected.toLocaleString()}
                            </span>
                          </Td>
                          <Td align="right">
                            <span
                              className={`mono-body tnum ${
                                fullyReceived
                                  ? "text-[var(--success)]"
                                  : partiallyReceived
                                  ? "text-[var(--warning)]"
                                  : "text-text-dim"
                              }`}
                            >
                              {received.toLocaleString()}
                            </span>
                          </Td>
                          <Td align="right">
                            <span className="mono-sm text-text-secondary tnum">
                              {displayCost != null
                                ? formatCurrency(displayCost)
                                : "—"}
                            </span>
                          </Td>
                          {canReceive && (
                            <Td align="right">
                              <div className="inline-flex items-center gap-8 justify-end flex-wrap">
                                {fullyReceived ? (
                                  <span className="label-text text-[var(--success)]">
                                    Complete
                                  </span>
                                ) : (
                                  <ReceiveLineForm
                                    lineId={line.id}
                                    poId={poData.id}
                                    productName={line.product_name}
                                    quantityExpected={line.quantity_expected}
                                    quantityReceived={received}
                                    unitCost={line.unit_cost}
                                  />
                                )}
                                {received > 0 && (
                                  <PrintLabelButton
                                    label="Print receipt"
                                    variant="ghost"
                                    size="sm"
                                    zpl={receiveLabel({
                                      poNumber:
                                        poData.po_number ??
                                        poData.id.slice(0, 8),
                                      productName: line.product_name,
                                      barcode: line.barcode ?? "",
                                      quantity: received,
                                      lotNumber: line.lot_number ?? null,
                                      receivedAt: line.received_at
                                        ? new Date(line.received_at)
                                        : new Date(),
                                    })}
                                    ariaLabel={`Print receipt label for ${line.product_name}`}
                                  />
                                )}
                              </div>
                            </Td>
                          )}
                        </tr>

                        {/* AI reasoning sub-row — only when populated, so
                            manually-created POs (no AI narration) don't
                            show empty placeholder gaps. */}
                        {line.reasoning && (
                          <tr className="hairline-b last:border-b-0 bg-[var(--surface-2)]/30">
                            <Td colSpan={colSpan}>
                              <div className="flex items-start gap-10 py-2">
                                <span
                                  className="label-text text-text-dim shrink-0"
                                  style={{ paddingTop: 2 }}
                                >
                                  Why
                                </span>
                                <p
                                  className="text-text-muted flex-1"
                                  style={{
                                    fontFamily: "var(--display)",
                                    fontSize: 12,
                                    fontStyle: "italic",
                                    lineHeight: 1.55,
                                  }}
                                >
                                  {line.reasoning}
                                </p>
                              </div>
                            </Td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Local presentational helpers ──────────────────────────────────────────

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <article className="hairline bg-[var(--surface)] p-16 flex flex-col gap-8">
      <p className="label-text">{label}</p>
      <p
        data-kpi-value
        className="text-text tnum truncate"
        style={{
          fontFamily: "var(--display)",
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: "-0.4px",
          lineHeight: 1.05,
        }}
      >
        {value}
      </p>
      {sub && <p className="mono-sm text-text-muted">{sub}</p>}
    </article>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={`label-text text-text-muted px-16 py-10 ${
        align === "right"
          ? "text-right"
          : align === "center"
          ? "text-center"
          : "text-left"
      }`}
      style={{ fontWeight: 500 }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  colSpan,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`px-16 py-12 align-middle ${
        align === "right"
          ? "text-right"
          : align === "center"
          ? "text-center"
          : "text-left"
      }`}
    >
      {children}
    </td>
  );
}
