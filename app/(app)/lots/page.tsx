import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarClock, Trash2 } from "lucide-react";
import { expiryStatus, expiryLabel, type ExpiryStatus } from "@/lib/lots";
import { RegisterLotForm } from "./RegisterLotForm";
import { deleteLot, setProductLotTracking } from "./actions";

export const metadata = { title: "Lots" };

const STATUS_COLOR: Record<ExpiryStatus, string> = {
  expired: "var(--danger)",
  soon: "var(--warning)",
  ok: "var(--text-secondary)",
  none: "var(--text-dim)",
};

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function LotsPage() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) {
    return (
      <PageHeader eyebrow="Operate" title="Lots" description="No workspace." />
    );
  }
  const supabase = await createClient();
  const orgId = ctx.orgId;

  const [{ data: lotsData }, { data: productsData }, { data: suppliersData }] =
    await Promise.all([
      supabase
        .from("lots")
        .select(
          `id, lot_number, expires_at, received_at, notes, product_id,
           product:products ( name, barcode ),
           supplier:suppliers ( name )`
        )
        .eq("org_id", orgId)
        .order("expires_at", { ascending: true, nullsFirst: false }),
      supabase
        .from("products")
        .select("id, name, barcode, track_lots")
        .eq("org_id", orgId)
        .order("name", { ascending: true }),
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("org_id", orgId)
        .order("name", { ascending: true }),
    ]);

  type LotRowView = {
    id: string;
    lot_number: string;
    expires_at: string | null;
    received_at: string | null;
    notes: string | null;
    product_id: string;
    product: { name: string; barcode: string } | { name: string; barcode: string }[] | null;
    supplier: { name: string } | { name: string }[] | null;
  };
  type ProductRowView = {
    id: string;
    name: string;
    barcode: string;
    track_lots: boolean;
  };

  const lots = (lotsData ?? []) as LotRowView[];
  const products = (productsData ?? []) as ProductRowView[];
  const suppliers = (suppliersData ?? []) as Array<{ id: string; name: string }>;

  // Lot on-hand ledger: received-per-lot (po_line_items) − picked-per-lot
  // (order_items), scoped to this org's lots via lot_id. Derived — never
  // touches the location-level on-hand store.
  const lotIds = lots.map((l) => l.id);
  const onHandByLot = new Map<string, number>();
  if (lotIds.length > 0) {
    const [{ data: recvLines }, { data: pickLines }] = await Promise.all([
      supabase
        .from("po_line_items")
        .select("lot_id, quantity_received")
        .in("lot_id", lotIds),
      supabase
        .from("order_items")
        .select("lot_id, quantity_picked")
        .in("lot_id", lotIds),
    ]);
    for (const r of (recvLines ?? []) as Array<{
      lot_id: string | null;
      quantity_received: number | null;
    }>) {
      if (!r.lot_id) continue;
      onHandByLot.set(
        r.lot_id,
        (onHandByLot.get(r.lot_id) ?? 0) + (r.quantity_received ?? 0)
      );
    }
    for (const p of (pickLines ?? []) as Array<{
      lot_id: string | null;
      quantity_picked: number | null;
    }>) {
      if (!p.lot_id) continue;
      onHandByLot.set(
        p.lot_id,
        (onHandByLot.get(p.lot_id) ?? 0) - (p.quantity_picked ?? 0)
      );
    }
  }

  const now = new Date();
  const expiredCount = lots.filter(
    (l) => expiryStatus(l.expires_at, now) === "expired"
  ).length;
  const soonCount = lots.filter(
    (l) => expiryStatus(l.expires_at, now) === "soon"
  ).length;

  const trackedProducts = products.filter((p) => p.track_lots);

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Operate"
        title="Lots"
        description="Track lots / batches and expiry. Register lots for lot-tracked products and keep an eye on what's expiring."
        meta={[
          { label: "Lots", value: lots.length },
          {
            label: "Expiring ≤30d",
            value: soonCount,
            status: soonCount > 0 ? "alert" : undefined,
          },
          {
            label: "Expired",
            value: expiredCount,
            status: expiredCount > 0 ? "alert" : undefined,
          },
        ]}
      />

      {/* Register */}
      <section aria-labelledby="register">
        <SectionTitle numeral="01" eyebrow="Record" title="Register a lot" />
        <RegisterLotForm
          products={trackedProducts.map((p) => ({
            id: p.id,
            name: p.name,
            barcode: p.barcode,
          }))}
          suppliers={suppliers}
        />
      </section>

      {/* Lot list */}
      <section aria-labelledby="lots">
        <SectionTitle
          numeral="02"
          eyebrow="Registry"
          title={`Lots (${lots.length})`}
        />
        {lots.length === 0 ? (
          <EmptyState
            title="No lots registered"
            description="Register a lot above for any lot-tracked product. Expiring and expired lots will surface here."
            icon={<CalendarClock size={20} strokeWidth={1.5} />}
          />
        ) : (
          <div className="hairline bg-[var(--surface)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className="hairline-b bg-[var(--surface-2)]">
                    <Th>Product</Th>
                    <Th>Lot / batch</Th>
                    <Th>Supplier</Th>
                    <Th className="text-right">On hand</Th>
                    <Th>Expiry</Th>
                    <th aria-hidden style={{ width: 44 }} />
                  </tr>
                </thead>
                <tbody>
                  {lots.map((l) => {
                    const product = firstOf(l.product);
                    const supplier = firstOf(l.supplier);
                    const status = expiryStatus(l.expires_at, now);
                    return (
                      <tr key={l.id} className="hairline-b">
                        <Td>
                          <span
                            className="text-text"
                            style={{ fontFamily: "var(--display)", fontSize: 13 }}
                          >
                            {product?.name ?? "—"}
                          </span>
                        </Td>
                        <Td>
                          <span
                            className="text-text-secondary"
                            style={{ fontFamily: "var(--mono)", fontSize: 12 }}
                          >
                            {l.lot_number}
                          </span>
                        </Td>
                        <Td>
                          <span className="mono-sm text-text-muted">
                            {supplier?.name ?? "—"}
                          </span>
                        </Td>
                        <Td className="text-right">
                          <span className="mono-sm text-text-secondary tnum">
                            {Math.max(0, onHandByLot.get(l.id) ?? 0).toLocaleString()}
                          </span>
                        </Td>
                        <Td>
                          <span
                            className="inline-flex items-center gap-6"
                            style={{
                              fontFamily: "var(--mono)",
                              fontSize: 11,
                              color: STATUS_COLOR[status],
                            }}
                          >
                            {status !== "none" && status !== "ok" && (
                              <span
                                className="dot"
                                style={{ background: STATUS_COLOR[status] }}
                                aria-hidden
                              />
                            )}
                            {expiryLabel(l.expires_at, now)}
                          </span>
                        </Td>
                        <Td className="text-right">
                          <form action={deleteLot} style={{ display: "inline" }}>
                            <input type="hidden" name="id" value={l.id} />
                            <button
                              type="submit"
                              className="hairline-subtle p-6 text-text-muted hover:text-[var(--danger)] hover:border-[var(--danger)] transition-colors"
                              aria-label={`Delete lot ${l.lot_number}`}
                              title="Delete lot"
                            >
                              <Trash2 size={11} strokeWidth={1.5} />
                            </button>
                          </form>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Lot-tracked products (opt-in) */}
      <section aria-labelledby="tracked">
        <SectionTitle
          numeral="03"
          eyebrow="Setup"
          title="Lot-tracked products"
        />
        <p className="mono-sm text-text-muted mb-12" style={{ lineHeight: 1.6 }}>
          Turn lot tracking on for products that need it (dye lots, batches,
          expiry). Only these appear in the register form above.
        </p>
        {products.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="Add products in Inventory first, then enable lot tracking here."
            icon={<CalendarClock size={20} strokeWidth={1.5} />}
          />
        ) : (
          <div className="hairline bg-[var(--surface)] overflow-hidden">
            <ul className="divide-y divide-[var(--border-subtle)]">
              {products.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-12 px-16 py-10"
                >
                  <div className="flex-1 min-w-0">
                    <span
                      className="text-text"
                      style={{ fontFamily: "var(--display)", fontSize: 13 }}
                    >
                      {p.name}
                    </span>
                    <span className="mono-sm text-text-dim ml-8">{p.barcode}</span>
                  </div>
                  <form action={setProductLotTracking}>
                    <input type="hidden" name="product_id" value={p.id} />
                    <input
                      type="hidden"
                      name="enabled"
                      value={(!p.track_lots).toString()}
                    />
                    <button
                      type="submit"
                      aria-pressed={p.track_lots}
                      className={`hairline-subtle px-10 py-5 inline-flex items-center gap-6 transition-colors ${
                        p.track_lots
                          ? "text-[var(--accent)] border-[var(--accent-deep)] bg-[var(--accent-dim)]"
                          : "text-text-muted hover:text-text hover:border-[var(--border-hover)]"
                      }`}
                      style={{ fontFamily: "var(--mono)", fontSize: 10 }}
                      title={p.track_lots ? "Lot tracking on" : "Lot tracking off"}
                    >
                      <span
                        className={p.track_lots ? "dot dot-live" : "dot dot-offline"}
                        aria-hidden
                      />
                      {p.track_lots ? "Tracked" : "Off"}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
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
