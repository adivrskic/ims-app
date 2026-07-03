import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext, getActiveMembership } from "@/lib/data/user";
import { PaperDocument } from "@/components/print/PaperDocument";

export const metadata = { title: "Packing slip" };

/**
 * Printable packing slip for one order.
 *
 * Same data the order detail page fetches (RLS-scoped, plus an explicit
 * org_id filter for the active workspace) rendered as a paper document —
 * the browser's Print dialog produces the PDF. Deliberately NO prices:
 * packing slips ship with the goods.
 */
export default async function PackingSlipPage({
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

  // Same shape the order detail page loads, trimmed to packing-slip needs.
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, order_type, status, customer_name, customer_phone, customer_address, delivery_date, delivery_window, notes, created_at, warehouse:warehouses!orders_warehouse_id_fkey ( name )"
    )
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (!order) notFound();

  const { data: items } = await supabase
    .from("order_items")
    .select(
      "id, quantity_requested, quantity_picked, notes, product:products ( id, name, barcode, internal_sku )"
    )
    .eq("order_id", id);

  type ItemRow = {
    id: string;
    quantity_requested: number;
    quantity_picked: number | null;
    notes: string | null;
    product:
      | { id: string; name: string; barcode: string | null; internal_sku: string | null }
      | { id: string; name: string; barcode: string | null; internal_sku: string | null }[]
      | null;
  };
  const rows = (items ?? []) as ItemRow[];

  const warehouse = Array.isArray(order.warehouse)
    ? order.warehouse[0]
    : order.warehouse;

  const orderNumber = order.order_number ?? order.id.slice(0, 8).toUpperCase();
  const orderDate = order.created_at
    ? new Date(order.created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
  const deliveryDate = order.delivery_date
    ? new Date(order.delivery_date + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const totalRequested = rows.reduce((s, i) => s + (i.quantity_requested ?? 0), 0);
  const totalPicked = rows.reduce((s, i) => s + (i.quantity_picked ?? 0), 0);

  return (
    <PaperDocument
      backHref={`/orders/${order.id}`}
      backLabel="Back to order"
      toolbarTitle={`Packing slip · ${orderNumber}`}
    >
      <header className="paper-doc-header">
        <div>
          <h1 className="paper-org-name">{orgName}</h1>
          {warehouse?.name && (
            <p className="paper-org-sub">Shipped from {warehouse.name}</p>
          )}
        </div>
        <div className="paper-doc-type">
          <h2>Packing slip</h2>
          <p className="paper-doc-number">{orderNumber}</p>
        </div>
      </header>

      <div className="paper-meta">
        <div>
          <p className="paper-meta-label">Order date</p>
          <p className="paper-meta-value">{orderDate}</p>
        </div>
        {deliveryDate && (
          <div>
            <p className="paper-meta-label">Delivery date</p>
            <p className="paper-meta-value">
              {deliveryDate}
              {order.delivery_window ? ` · ${order.delivery_window}` : ""}
            </p>
          </div>
        )}
        <div>
          <p className="paper-meta-label">Items</p>
          <p className="paper-meta-value mono">
            {rows.length} line{rows.length === 1 ? "" : "s"} · {totalRequested} unit
            {totalRequested === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="paper-parties">
        <div className="paper-party">
          <p className="paper-meta-label">Ship to</p>
          <p className="paper-meta-value">
            {order.customer_name ?? "—"}
            {order.customer_address ? `\n${order.customer_address}` : ""}
            {order.customer_phone ? `\n${order.customer_phone}` : ""}
          </p>
        </div>
        <div className="paper-party">
          <p className="paper-meta-label">From</p>
          <p className="paper-meta-value">
            {orgName}
            {warehouse?.name ? `\n${warehouse.name}` : ""}
          </p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: "22%" }}>SKU / Barcode</th>
            <th>Product</th>
            <th className="num" style={{ width: "12%" }}>
              Qty ordered
            </th>
            <th className="num" style={{ width: "12%" }}>
              Qty picked
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const product = Array.isArray(row.product)
              ? row.product[0]
              : row.product;
            const sku = product?.internal_sku ?? product?.barcode ?? "—";
            return (
              <tr key={row.id}>
                <td>
                  <span className="paper-sku">{sku}</span>
                </td>
                <td>
                  {product?.name ?? "Unknown product"}
                  {row.notes && (
                    <span className="paper-dim"> — {row.notes}</span>
                  )}
                </td>
                <td className="num">{row.quantity_requested}</td>
                <td className="num">{row.quantity_picked ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} style={{ textAlign: "left" }}>
              Total
            </td>
            <td>{totalRequested}</td>
            <td>{totalPicked}</td>
          </tr>
        </tfoot>
      </table>

      {order.notes && (
        <div className="paper-notes">
          <p className="paper-meta-label">Notes</p>
          <p>{order.notes}</p>
        </div>
      )}

      <div className="paper-signatures">
        <div>
          <div className="paper-sign-line" />
          <p className="paper-sign-label">Received by (signature)</p>
        </div>
        <div>
          <div className="paper-sign-line" />
          <p className="paper-sign-label">Date</p>
        </div>
      </div>

      <footer className="paper-doc-footer">
        <span>
          {orgName} · Packing slip {orderNumber}
        </span>
        <span>This document does not include pricing.</span>
      </footer>
    </PaperDocument>
  );
}
