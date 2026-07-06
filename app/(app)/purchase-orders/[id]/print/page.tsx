import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext, getActiveMembership } from "@/lib/data/user";
import { PaperDocument } from "@/components/print/PaperDocument";

export const metadata = { title: "Purchase order document" };

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

/**
 * Printable purchase-order document — the same PO + line queries the PO
 * detail page runs (RLS-scoped, plus an explicit org_id filter), laid out
 * as a supplier-facing paper document with quoted unit costs and totals.
 */
export default async function PurchaseOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getCurrentOrgContext();
  if (!ctx) notFound();
  const membership = await getActiveMembership();
  const orgName = membership?.org?.name ?? "Nautilus";
  const supabase = await createClient();

  const { data: poData } = await supabase
    .from("purchase_orders")
    .select(
      `id, po_number, status, supplier_name, supplier_contact,
       expected_date, sent_at, created_at, notes,
       warehouse:warehouses ( id, name )`
    )
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (!poData) notFound();

  const warehouse = Array.isArray(poData.warehouse)
    ? poData.warehouse[0]
    : poData.warehouse;

  const { data: lineData } = await supabase
    .from("po_line_items")
    .select(
      "id, product_name, barcode, quantity_expected, unit_cost"
    )
    .eq("po_id", id)
    // po_line_items has no created_at (see the detail page) — order by id.
    .order("id", { ascending: true });

  type LineRow = {
    id: string;
    product_name: string;
    barcode: string | null;
    quantity_expected: number;
    unit_cost: string | null;
  };
  const lines = (lineData ?? []) as LineRow[];

  const status = poData.status as PoStatus;
  const poNumber = poData.po_number ?? `PO ${poData.id.slice(0, 8)}`;

  // The supplier-facing document shows quoted (unit_cost) values — landed
  // cost isn't known until receipt, mirroring the detail page's
  // "expected value" math.
  const totals = lines.map((l) => {
    const cost = l.unit_cost ? parseFloat(l.unit_cost) : null;
    return cost == null ? null : cost * l.quantity_expected;
  });
  const grandTotal = totals.reduce<number>((s, t) => s + (t ?? 0), 0);
  const totalUnits = lines.reduce((s, l) => s + l.quantity_expected, 0);

  return (
    <PaperDocument
      backHref={`/purchase-orders/${poData.id}`}
      backLabel="Back to purchase order"
      toolbarTitle={`Purchase order · ${poNumber}`}
    >
      <header className="paper-doc-header">
        <div>
          <h1 className="paper-org-name">{orgName}</h1>
          {warehouse?.name && (
            <p className="paper-org-sub">Deliver to {warehouse.name}</p>
          )}
        </div>
        <div className="paper-doc-type">
          <h2>Purchase order</h2>
          <p className="paper-doc-number">{poNumber}</p>
        </div>
      </header>

      <div className="paper-meta">
        <div>
          <p className="paper-meta-label">Created</p>
          <p className="paper-meta-value">{formatDate(poData.created_at)}</p>
        </div>
        <div>
          <p className="paper-meta-label">Sent</p>
          <p className="paper-meta-value">{formatDate(poData.sent_at)}</p>
        </div>
        <div>
          <p className="paper-meta-label">Expected delivery</p>
          <p className="paper-meta-value">{formatDate(poData.expected_date)}</p>
        </div>
        <div>
          <p className="paper-meta-label">Status</p>
          <p className="paper-meta-value">{STATUS_LABEL[status] ?? status}</p>
        </div>
      </div>

      <div className="paper-parties">
        <div className="paper-party">
          <p className="paper-meta-label">Supplier</p>
          <p className="paper-meta-value">
            {poData.supplier_name ?? "Supplier TBD"}
            {poData.supplier_contact ? `\n${poData.supplier_contact}` : ""}
          </p>
        </div>
        <div className="paper-party">
          <p className="paper-meta-label">Buyer / ship to</p>
          <p className="paper-meta-value">
            {orgName}
            {warehouse?.name ? `\n${warehouse.name}` : ""}
          </p>
        </div>
      </div>

      {lines.length === 0 ? (
        <p className="paper-dim">This purchase order has no line items.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th style={{ width: "20%" }}>SKU / Barcode</th>
              <th>Product</th>
              <th className="num" style={{ width: "10%" }}>
                Qty
              </th>
              <th className="num" style={{ width: "14%" }}>
                Unit cost
              </th>
              <th className="num" style={{ width: "14%" }}>
                Line total
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const cost = line.unit_cost ? parseFloat(line.unit_cost) : null;
              const lineTotal = totals[idx];
              return (
                <tr key={line.id}>
                  <td>
                    <span className="paper-sku paper-dim">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                  </td>
                  <td>
                    <span className="paper-sku">{line.barcode ?? "—"}</span>
                  </td>
                  <td>{line.product_name}</td>
                  <td className="num">
                    {line.quantity_expected.toLocaleString()}
                  </td>
                  <td className="num">
                    {cost != null ? formatCurrency(cost) : "—"}
                  </td>
                  <td className="num">
                    {lineTotal != null ? formatCurrency(lineTotal) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ textAlign: "left" }}>
                Total
              </td>
              <td>{totalUnits.toLocaleString()}</td>
              <td />
              <td>{formatCurrency(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      {poData.notes && (
        <div className="paper-notes">
          <p className="paper-meta-label">Notes / terms</p>
          <p>{poData.notes}</p>
        </div>
      )}

      <div className="paper-signatures">
        <div>
          <div className="paper-sign-line" />
          <p className="paper-sign-label">Authorized by (signature)</p>
        </div>
        <div>
          <div className="paper-sign-line" />
          <p className="paper-sign-label">Date</p>
        </div>
      </div>

      <footer className="paper-doc-footer">
        <span>
          {orgName} · Purchase order {poNumber}
        </span>
        <span>Costs shown are quoted unit costs at time of order.</span>
      </footer>
    </PaperDocument>
  );
}
