import { Fragment } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext, getActiveMembership } from "@/lib/data/user";
import { getWaveDetail } from "@/lib/data/picking";
import { PaperDocument } from "@/components/print/PaperDocument";

export const metadata = { title: "Pick list" };

/**
 * Printable pick list for a wave — same zoned walk order the wave detail
 * page renders (via the shared getWaveDetail fetcher), with a checkbox
 * column for manual tick-off on the floor.
 */
export default async function WavePickListPage({
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

  const wave = await getWaveDetail(supabase, ctx.orgId, id);
  if (!wave) notFound();

  // Resolve the assigned picker's display name (same profiles join the
  // order detail page uses via its FK embed).
  let pickerName: string | null = null;
  if (wave.assignedTo) {
    const { data: picker } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", wave.assignedTo)
      .maybeSingle();
    pickerName = picker?.full_name || picker?.email || null;
  }

  const createdDate = wave.createdAt
    ? new Date(wave.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <PaperDocument
      backHref={`/picking/${wave.id}`}
      backLabel="Back to wave"
      toolbarTitle={`Pick list · ${wave.code}`}
    >
      <header className="paper-doc-header">
        <div>
          <h1 className="paper-org-name">{orgName}</h1>
          <p className="paper-org-sub">Zones ordered nearest dock first</p>
        </div>
        <div className="paper-doc-type">
          <h2>Pick list</h2>
          <p className="paper-doc-number">{wave.code}</p>
        </div>
      </header>

      <div className="paper-meta">
        <div>
          <p className="paper-meta-label">Date</p>
          <p className="paper-meta-value">{createdDate}</p>
        </div>
        <div>
          <p className="paper-meta-label">Picker</p>
          <p className="paper-meta-value">{pickerName ?? "Unassigned"}</p>
        </div>
        <div>
          <p className="paper-meta-label">Status</p>
          <p className="paper-meta-value">{wave.status}</p>
        </div>
        <div>
          <p className="paper-meta-label">Scope</p>
          <p className="paper-meta-value mono">
            {wave.orders.length} order{wave.orders.length === 1 ? "" : "s"} ·{" "}
            {wave.totalTasks} task{wave.totalTasks === 1 ? "" : "s"} ·{" "}
            {wave.totalUnits} unit{wave.totalUnits === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Orders batched in this wave */}
      <div className="paper-notes" style={{ margin: "0 0 20px" }}>
        <p className="paper-meta-label">Orders in wave</p>
        <p>
          {wave.orders
            .map(
              (o) =>
                `${o.orderNumber ?? o.id.slice(0, 8)}${
                  o.customerName ? ` (${o.customerName})` : ""
                }`
            )
            .join(" · ") || "—"}
        </p>
      </div>

      {wave.zones.length === 0 ? (
        <p className="paper-dim">
          Nothing to pick — lines in this wave are already picked, or their
          stock isn&apos;t placed in a location yet.
        </p>
      ) : (
        wave.zones.map((z) => (
          <Fragment key={z.zone}>
            <div className="paper-zone-header">
              <p className="paper-zone-name">Zone {z.zone}</p>
              <span className="paper-zone-sub">
                {z.tasks.length} task{z.tasks.length === 1 ? "" : "s"} ·{" "}
                {z.units} unit{z.units === 1 ? "" : "s"}
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 34 }} aria-label="Picked checkbox" />
                  <th style={{ width: "16%" }}>Location</th>
                  <th style={{ width: "20%" }}>SKU / Barcode</th>
                  <th>Product</th>
                  <th style={{ width: "14%" }}>Order</th>
                  <th className="num" style={{ width: "10%" }}>
                    Qty
                  </th>
                </tr>
              </thead>
              <tbody>
                {z.tasks.map((t) => (
                  <tr key={t.orderItemId}>
                    <td>
                      <span className="paper-checkbox" aria-hidden />
                    </td>
                    <td>
                      <span className="paper-sku">{t.slotLabel}</span>
                    </td>
                    <td>
                      <span className="paper-sku">{t.sku ?? "—"}</span>
                    </td>
                    <td>{t.productName}</td>
                    <td>
                      <span className="paper-sku">
                        {t.orderNumber ?? t.orderId.slice(0, 8)}
                      </span>
                    </td>
                    <td className="num">{t.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Fragment>
        ))
      )}

      {wave.unlocatedTasks > 0 && (
        <div className="paper-notes">
          <p className="paper-meta-label">Attention</p>
          <p>
            {wave.unlocatedTasks} task{wave.unlocatedTasks === 1 ? "" : "s"}{" "}
            have no placed stock — locate them before picking.
          </p>
        </div>
      )}

      {wave.notes && (
        <div className="paper-notes">
          <p className="paper-meta-label">Notes</p>
          <p>{wave.notes}</p>
        </div>
      )}

      <div className="paper-signatures">
        <div>
          <div className="paper-sign-line" />
          <p className="paper-sign-label">Picked by (signature)</p>
        </div>
        <div>
          <div className="paper-sign-line" />
          <p className="paper-sign-label">Date / time</p>
        </div>
      </div>

      <footer className="paper-doc-footer">
        <span>
          {orgName} · Pick list {wave.code}
        </span>
        <span>Tick each line as it is picked.</span>
      </footer>
    </PaperDocument>
  );
}
