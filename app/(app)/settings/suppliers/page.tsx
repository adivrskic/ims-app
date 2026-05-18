import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Badge } from "@/components/ui/Badge";
import { CornerButton } from "@/components/ui/CornerButton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Truck,
  Mail,
  Phone,
  Clock,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { computeSupplierStats, type ScorecardPo } from "@/lib/supplier-stats";
import { formatCurrency } from "@/lib/dashboard";
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

  // Pull suppliers, POs, and products in parallel. We then compute scorecards
  // in JS — keeps things simple and lets us evolve the math without a
  // schema migration each time.
  const [{ data: suppliers }, { data: pos }, { data: productCounts }] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select(
          "id, name, contact_email, contact_phone, payment_terms, default_lead_time_days, is_active, created_at"
        )
        .order("name", { ascending: true }),
      supabase
        .from("purchase_orders")
        .select(
          `id, supplier_id, status, expected_date, sent_at, received_at,
         lines:po_line_items ( quantity_expected, quantity_received, unit_cost, landed_unit_cost )`
        )
        .not("supplier_id", "is", null),
      supabase.from("products").select("preferred_supplier_id"),
    ]);

  const rows = (suppliers ?? []) as SupplierRow[];
  const active = rows.filter((s) => s.is_active);
  const archived = rows.filter((s) => !s.is_active);

  // Build per-supplier PO buckets
  type RawPo = {
    id: string;
    supplier_id: string | null;
    status: ScorecardPo["status"];
    expected_date: string | null;
    sent_at: string | null;
    received_at: string | null;
    lines: Array<{
      quantity_expected: number;
      quantity_received: number | null;
      unit_cost: string | null;
      landed_unit_cost: string | null;
    }> | null;
  };
  const posBySupplier = new Map<string, ScorecardPo[]>();
  for (const raw of (pos ?? []) as RawPo[]) {
    if (!raw.supplier_id) continue;
    const sp: ScorecardPo = {
      id: raw.id,
      status: raw.status,
      expected_date: raw.expected_date,
      sent_at: raw.sent_at,
      received_at: raw.received_at,
      lines: (raw.lines ?? []).map((l) => ({
        quantity_expected: l.quantity_expected,
        quantity_received: l.quantity_received,
        unit_cost: l.unit_cost,
        landed_unit_cost: l.landed_unit_cost,
      })),
    };
    const bucket = posBySupplier.get(raw.supplier_id);
    if (bucket) {
      bucket.push(sp);
    } else {
      posBySupplier.set(raw.supplier_id, [sp]);
    }
  }

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
            picked from a dropdown anywhere a supplier is needed. Click any
            supplier for the full scorecard.
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
              const supplierPos = posBySupplier.get(s.id) ?? [];
              const stats = computeSupplierStats(supplierPos);
              const productCount = productCountMap.get(s.id) ?? 0;

              return (
                <li key={s.id} className="row-interactive">
                  <Link
                    href={`/settings/suppliers/${s.id}`}
                    className="block px-20 py-16 flex items-center gap-14"
                  >
                    <span
                      className="w-32 h-32 hairline-subtle bg-[var(--accent-dim)] flex items-center justify-center shrink-0 text-[var(--accent)]"
                      aria-hidden
                    >
                      <Truck size={13} strokeWidth={1.5} />
                    </span>

                    <div className="flex-1 min-w-0">
                      <p
                        className="text-text truncate group-hover:text-[var(--accent)] transition-colors"
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

                    {/* Scorecard chips: only shown when we have signal */}
                    <div className="hidden md:flex items-center gap-12 shrink-0">
                      {stats.onTimePct != null && (
                        <Chip
                          label="On time"
                          value={`${stats.onTimePct}%`}
                          tone={
                            stats.onTimePct >= 90
                              ? "success"
                              : stats.onTimePct >= 70
                              ? "warning"
                              : "danger"
                          }
                        />
                      )}
                      {stats.fillRatePct != null && (
                        <Chip
                          label="Fill"
                          value={`${stats.fillRatePct}%`}
                          tone={
                            stats.fillRatePct >= 95
                              ? "success"
                              : stats.fillRatePct >= 80
                              ? "warning"
                              : "danger"
                          }
                        />
                      )}
                      {stats.totalSpend > 0 && (
                        <Chip
                          label="Spend"
                          value={formatCurrency(stats.totalSpend)}
                          tone="neutral"
                        />
                      )}
                      <div className="hidden lg:flex flex-col items-end gap-2 w-[120px] shrink-0">
                        <span className="label-text text-text-muted">
                          {productCount}{" "}
                          {productCount === 1 ? "product" : "products"}
                        </span>
                        <span className="mono-sm text-text-dim">
                          {stats.totalPos} {stats.totalPos === 1 ? "PO" : "POs"}
                        </span>
                      </div>
                    </div>

                    <ChevronRight
                      size={12}
                      strokeWidth={1.5}
                      className="text-text-dim shrink-0"
                    />
                  </Link>
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

// ─── Small chip component for scorecard summaries ──────────────────────────

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "text-[var(--success)]"
      : tone === "warning"
      ? "text-[var(--warning)]"
      : tone === "danger"
      ? "text-[var(--danger)]"
      : "text-text-secondary";
  return (
    <div className="flex flex-col items-end" style={{ minWidth: 56 }}>
      <span className={`mono-body tnum ${toneClass}`}>{value}</span>
      <span className="label-text text-text-dim" style={{ fontSize: 10 }}>
        {label}
      </span>
    </div>
  );
}
