import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { CornerButton } from "@/components/ui/CornerButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScanBarcode, Trash2 } from "lucide-react";
import type { SerialStatus } from "@/types/db";
import { RegisterSerialsForm } from "./RegisterSerialsForm";
import { setSerialStatus, deleteSerial, setProductSerialTracking } from "./actions";

export const metadata = { title: "Serials" };

const STATUS_TONE: Record<SerialStatus, "success" | "info" | "warning" | "neutral"> = {
  in_stock: "success",
  shipped: "info",
  returned: "warning",
  scrapped: "neutral",
};
const STATUS_LABEL: Record<SerialStatus, string> = {
  in_stock: "In stock",
  shipped: "Shipped",
  returned: "Returned",
  scrapped: "Scrapped",
};

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

export default async function SerialsPage() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) {
    return <PageHeader eyebrow="Operate" title="Serials" description="No workspace." />;
  }
  const supabase = await createClient();
  const orgId = ctx.orgId;

  const [{ data: serialsData }, { data: productsData }, { data: whData }] =
    await Promise.all([
      supabase
        .from("serial_units")
        .select(
          `id, serial_number, status, received_at,
           product:products ( name, barcode ),
           warehouse:warehouses ( name )`
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        // One past the cap so we can tell the user the registry is truncated.
        .limit(501),
      supabase
        .from("products")
        .select("id, name, barcode, track_serials")
        .eq("org_id", orgId)
        .order("name", { ascending: true }),
      supabase
        .from("warehouses")
        .select("id, name")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
    ]);

  type SerialRow = {
    id: string;
    serial_number: string;
    status: SerialStatus;
    received_at: string | null;
    product: { name: string; barcode: string } | { name: string; barcode: string }[] | null;
    warehouse: { name: string } | { name: string }[] | null;
  };
  type ProductRow = { id: string; name: string; barcode: string; track_serials: boolean };

  const allSerials = (serialsData ?? []) as SerialRow[];
  const serialsTruncated = allSerials.length > 500;
  const serials = allSerials.slice(0, 500);
  const products = (productsData ?? []) as ProductRow[];
  const warehouses = (whData ?? []) as Array<{ id: string; name: string }>;

  const inStock = serials.filter((s) => s.status === "in_stock").length;
  const shipped = serials.filter((s) => s.status === "shipped").length;
  const serialized = products.filter((p) => p.track_serials);

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Operate"
        title="Serials"
        description="Unit-level tracking for serialized products. Register serials, track their status, and trace each unit."
        meta={[
          { label: "Serials", value: serials.length },
          { label: "In stock", value: inStock, status: inStock > 0 ? "live" : undefined },
          { label: "Shipped", value: shipped },
        ]}
      />

      {/* Register */}
      <section aria-labelledby="register">
        <SectionTitle numeral="01" eyebrow="Record" title="Register serials" />
        <RegisterSerialsForm
          products={serialized.map((p) => ({ id: p.id, name: p.name, barcode: p.barcode }))}
          warehouses={warehouses}
        />
      </section>

      {/* Registry */}
      <section aria-labelledby="list">
        <SectionTitle
          numeral="02"
          eyebrow="Registry"
          title={`Serials (${serials.length})`}
          action={
            serialsTruncated ? (
              <span className="label-text text-text-muted">
                Showing the 500 most recent
              </span>
            ) : undefined
          }
        />
        {serials.length === 0 ? (
          <EmptyState
            title="No serials registered"
            description="Register units above for any serialized product. Each unit's status and history will show here."
            icon={<ScanBarcode size={20} strokeWidth={1.5} />}
          />
        ) : (
          <div className="hairline bg-[var(--surface)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className="hairline-b bg-[var(--surface-2)]">
                    <Th>Product</Th>
                    <Th>Serial</Th>
                    <Th>Facility</Th>
                    <Th>Status</Th>
                    <th aria-hidden style={{ width: 44 }} />
                  </tr>
                </thead>
                <tbody>
                  {serials.map((s) => {
                    const product = firstOf(s.product);
                    const wh = firstOf(s.warehouse);
                    return (
                      <tr key={s.id} className="hairline-b">
                        <Td>
                          <span className="text-text" style={{ fontFamily: "var(--display)", fontSize: 13 }}>
                            {product?.name ?? "—"}
                          </span>
                        </Td>
                        <Td>
                          <code className="text-text-secondary" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                            {s.serial_number}
                          </code>
                        </Td>
                        <Td>
                          <span className="mono-sm text-text-muted">{wh?.name ?? "—"}</span>
                        </Td>
                        <Td>
                          <form action={setSerialStatus} className="flex items-center gap-8">
                            <input type="hidden" name="id" value={s.id} />
                            <Select
                              name="status"
                              defaultValue={s.status}
                              options={(Object.keys(STATUS_LABEL) as SerialStatus[]).map((k) => ({
                                value: k,
                                label: STATUS_LABEL[k],
                              }))}
                              compact
                            />
                            <CornerButton type="submit" variant="ghost" size="sm">
                              Save
                            </CornerButton>
                            <Badge tone={STATUS_TONE[s.status]} variant="filled">
                              {STATUS_LABEL[s.status]}
                            </Badge>
                          </form>
                        </Td>
                        <Td className="text-right">
                          <form action={deleteSerial} style={{ display: "inline" }}>
                            <input type="hidden" name="id" value={s.id} />
                            <button
                              type="submit"
                              className="hairline-subtle p-6 text-text-muted hover:text-[var(--danger)] hover:border-[var(--danger)] transition-colors"
                              aria-label={`Delete serial ${s.serial_number}`}
                              title="Delete serial"
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

      {/* Opt-in */}
      <section aria-labelledby="setup">
        <SectionTitle numeral="03" eyebrow="Setup" title="Serialized products" />
        <p className="mono-sm text-text-muted mb-12" style={{ lineHeight: 1.6 }}>
          Turn on serial tracking for products that need unit-level traceability
          (high-value goods, warranty, RMA). Only these appear in the register form.
        </p>
        {products.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="Add products in Inventory first, then enable serial tracking here."
            icon={<ScanBarcode size={20} strokeWidth={1.5} />}
          />
        ) : (
          <div className="hairline bg-[var(--surface)] overflow-hidden">
            <ul className="divide-y divide-[var(--border-subtle)]">
              {products.map((p) => (
                <li key={p.id} className="flex items-center gap-12 px-16 py-10">
                  <div className="flex-1 min-w-0">
                    <span className="text-text" style={{ fontFamily: "var(--display)", fontSize: 13 }}>
                      {p.name}
                    </span>
                    <span className="mono-sm text-text-dim ml-8">{p.barcode}</span>
                  </div>
                  <form action={setProductSerialTracking}>
                    <input type="hidden" name="product_id" value={p.id} />
                    <input type="hidden" name="enabled" value={(!p.track_serials).toString()} />
                    <button
                      type="submit"
                      aria-pressed={p.track_serials}
                      className={`hairline-subtle px-10 py-5 inline-flex items-center gap-6 transition-colors ${
                        p.track_serials
                          ? "text-[var(--accent)] border-[var(--accent-deep)] bg-[var(--accent-dim)]"
                          : "text-text-muted hover:text-text hover:border-[var(--border-hover)]"
                      }`}
                      style={{ fontFamily: "var(--mono)", fontSize: 10 }}
                      title={p.track_serials ? "Serialized" : "Not serialized"}
                    >
                      <span className={p.track_serials ? "dot dot-live" : "dot dot-offline"} aria-hidden />
                      {p.track_serials ? "Serialized" : "Off"}
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

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`label-text text-left px-14 py-10 font-normal ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-14 py-10 ${className}`}>{children}</td>;
}
