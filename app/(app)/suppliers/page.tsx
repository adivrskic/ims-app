import { createClient } from "@/lib/supabase/server";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Badge } from "@/components/ui/Badge";
import { CornerButton } from "@/components/ui/CornerButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Truck, Mail, Phone } from "lucide-react";
import { SupplierFormClient } from "./SupplierFormClient";
import { archiveSupplier, restoreSupplier } from "./actions";

export const metadata = { title: "Suppliers · Settings" };

interface SupplierRow {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  payment_terms: string | null;
  default_lead_time_days: number | null;
  is_active: boolean;
  created_at: string;
}

export default async function SuppliersPage() {
  const supabase = await createClient();

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select(
      "id, name, contact_email, contact_phone, payment_terms, default_lead_time_days, is_active, created_at"
    )
    .order("name", { ascending: true });

  const rows = (suppliers ?? []) as SupplierRow[];
  const active = rows.filter((s) => s.is_active);
  const archived = rows.filter((s) => !s.is_active);

  // Per-supplier PO + product counts in a separate small query so the main
  // list keeps a flat shape.
  const { data: poCounts } = await supabase
    .from("purchase_orders")
    .select("supplier_id");
  const poCountMap = new Map<string, number>();
  for (const r of (poCounts ?? []) as Array<{
    supplier_id: string | null;
  }>) {
    if (!r.supplier_id) continue;
    poCountMap.set(r.supplier_id, (poCountMap.get(r.supplier_id) ?? 0) + 1);
  }

  const { data: productCounts } = await supabase
    .from("products")
    .select("preferred_supplier_id");
  const productCountMap = new Map<string, number>();
  for (const r of (productCounts ?? []) as Array<{
    preferred_supplier_id: string | null;
  }>) {
    if (!r.preferred_supplier_id) continue;
    productCountMap.set(
      r.preferred_supplier_id,
      (productCountMap.get(r.preferred_supplier_id) ?? 0) + 1
    );
  }

  return (
    <div className="flex flex-col gap-40">
      <header className="flex items-start justify-between gap-16">
        <div>
          <h2
            className="text-text"
            style={{
              fontFamily: "var(--display)",
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            Suppliers
          </h2>
          <p className="mono-sm text-text-muted mt-4 max-w-[640px]">
            Vendors you place purchase orders with. Captured once here, then
            picked from a dropdown anywhere a supplier is needed.
          </p>
        </div>
        <SupplierFormClient />
      </header>

      <section aria-labelledby="active-suppliers">
        <SectionTitle
          eyebrow="Live"
          title="Active"
          action={
            <span className="label-text text-text-muted">
              {active.length} {active.length === 1 ? "supplier" : "suppliers"}
            </span>
          }
        />
        {active.length === 0 ? (
          <EmptyState
            title="No suppliers yet"
            description="Add your first supplier above. Once created, you can set it as the preferred supplier on any product and draft POs against it."
            icon={<Truck size={20} strokeWidth={1.5} />}
          />
        ) : (
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {active.map((s) => {
              const poCount = poCountMap.get(s.id) ?? 0;
              const productCount = productCountMap.get(s.id) ?? 0;
              return (
                <li
                  key={s.id}
                  className="px-20 py-16 flex items-center gap-14 row-interactive"
                >
                  <span
                    className="w-32 h-32 hairline-subtle bg-[var(--accent-dim)] flex items-center justify-center shrink-0 text-[var(--accent)]"
                    aria-hidden
                  >
                    <Truck size={13} strokeWidth={1.5} />
                  </span>

                  <div className="flex-1 min-w-0">
                    <p
                      className="text-text truncate"
                      style={{
                        fontFamily: "var(--display)",
                        fontSize: 14,
                        fontWeight: 500,
                      }}
                    >
                      {s.name}
                    </p>
                    <div className="flex items-center gap-14 mono-sm text-text-muted mt-2 flex-wrap">
                      {s.contact_email && (
                        <span className="inline-flex items-center gap-4">
                          <Mail size={10} strokeWidth={1.5} />
                          {s.contact_email}
                        </span>
                      )}
                      {s.contact_phone && (
                        <span className="inline-flex items-center gap-4">
                          <Phone size={10} strokeWidth={1.5} />
                          {s.contact_phone}
                        </span>
                      )}
                      {s.payment_terms && (
                        <Badge tone="neutral">{s.payment_terms}</Badge>
                      )}
                      {s.default_lead_time_days != null && (
                        <span className="mono-sm text-text-dim">
                          {s.default_lead_time_days}d lead
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="hidden md:flex flex-col items-end gap-2 w-[120px] shrink-0">
                    <span className="label-text text-text-muted">
                      {productCount}{" "}
                      {productCount === 1 ? "product" : "products"}
                    </span>
                    <span className="mono-sm text-text-dim">
                      {poCount} {poCount === 1 ? "PO" : "POs"}
                    </span>
                  </div>

                  <form action={archiveSupplier}>
                    <input type="hidden" name="id" value={s.id} />
                    <CornerButton
                      type="submit"
                      variant="ghost"
                      size="sm"
                      ariaLabel={`Archive ${s.name}`}
                    >
                      Archive
                    </CornerButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {archived.length > 0 && (
        <section aria-labelledby="archived-suppliers">
          <SectionTitle
            eyebrow="Archive"
            title="Archived"
            action={
              <span className="label-text text-text-muted">
                {archived.length}{" "}
                {archived.length === 1 ? "supplier" : "suppliers"}
              </span>
            }
          />
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {archived.map((s) => (
              <li
                key={s.id}
                className="px-20 py-14 flex items-center gap-14 opacity-55"
              >
                <Truck
                  size={14}
                  strokeWidth={1.5}
                  className="text-text-dim shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-text-muted truncate"
                    style={{
                      fontFamily: "var(--display)",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {s.name}
                  </p>
                  <p className="mono-sm text-text-dim">
                    {s.contact_email ?? "No contact email"}
                  </p>
                </div>
                <form action={restoreSupplier}>
                  <input type="hidden" name="id" value={s.id} />
                  <CornerButton type="submit" variant="ghost" size="sm">
                    Restore
                  </CornerButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
