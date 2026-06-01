import Link from "next/link";
import { PackageCheck, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { getAsns, type AsnStatus } from "@/lib/data/asn";
import { createAsnFromPo } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Inbound · ASN" };

const STATUS_LABEL: Record<AsnStatus, string> = {
  expected: "EXPECTED",
  in_transit: "IN TRANSIT",
  received: "RECEIVED",
  cancelled: "CANCELLED",
};

export default async function InboundPage() {
  const [ctx, scope] = await Promise.all([
    getCurrentOrgContext(),
    getActiveScope(),
  ]);
  if (!ctx) {
    return <PageHeader eyebrow="Flow" title="Inbound" description="No workspace." />;
  }
  const supabase = await createClient();
  const warehouseId = scope.mode === "single" ? scope.id : null;
  const asns = await getAsns(supabase, ctx.orgId, warehouseId);

  // POs with stock still outstanding — candidates to raise an ASN against.
  let poQ = supabase
    .from("purchase_orders")
    .select("id, po_number, supplier_name, status")
    .eq("org_id", ctx.orgId)
    .in("status", ["sent", "partially_received"])
    .order("created_at", { ascending: false })
    .limit(25);
  if (warehouseId) poQ = poQ.eq("warehouse_id", warehouseId);
  const { data: pos } = await poQ;
  const openPos = (pos ?? []) as Array<{
    id: string;
    po_number: string | null;
    supplier_name: string | null;
    status: string;
  }>;

  const open = asns.filter((a) => a.status === "expected" || a.status === "in_transit");
  const expectedUnits = open.reduce((s, a) => s + (a.expectedUnits - a.receivedUnits), 0);

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Flow · Receiving"
        title="Inbound shipments"
        description={scopeDescription(scope, {
          all: "Advance ship notices — what suppliers are sending and when. Receive a line or a whole pallet (LPN); receipts reconcile against the linked PO.",
          single: (name) => `Advance ship notices inbound to ${name}.`,
        })}
        meta={[{ label: "Open", value: String(open.length), status: open.length ? ("live" as const) : undefined }]}
      />

      <section>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
          <KpiCard label="Open ASNs" value={String(open.length)} />
          <KpiCard label="Units inbound" value={expectedUnits.toLocaleString()} />
          <KpiCard label="Received (all time)" value={String(asns.filter((a) => a.status === "received").length)} />
        </div>
      </section>

      {openPos.length > 0 && (
        <section>
          <SectionTitle numeral="01" eyebrow="Create" title="Raise an ASN from a PO" />
          <div className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {openPos.map((po) => (
              <form
                key={po.id}
                action={createAsnFromPo}
                className="px-16 py-10 flex items-center gap-12 flex-wrap"
              >
                <input type="hidden" name="po_id" value={po.id} />
                <span className="mono-body text-text">{po.po_number ?? "PO"}</span>
                <span className="mono-sm text-text-dim">{po.supplier_name ?? "—"}</span>
                <span className="label-text text-text-muted">{po.status.replace("_", " ")}</span>
                <button
                  type="submit"
                  className="ml-auto hairline-subtle px-12 py-6 inline-flex items-center gap-6 hover:border-[var(--accent)] hover:text-[var(--accent)] text-text-secondary transition-colors"
                >
                  <Plus size={11} strokeWidth={1.5} />
                  <span className="label-text">ASN from PO</span>
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle
          numeral="02"
          eyebrow="Track"
          title="Advance ship notices"
          action={
            <Link href="/inbound/new" className="hairline-subtle px-12 py-6 inline-flex items-center gap-6 hover:border-[var(--accent)] hover:text-[var(--accent)] text-text-secondary transition-colors">
              <Plus size={11} strokeWidth={1.5} />
              <span className="label-text">New ASN</span>
            </Link>
          }
        />
        {asns.length === 0 ? (
          <EmptyState
            title="No inbound shipments"
            description="Raise an ASN from an open PO above, or create one manually when a supplier tells you what's shipping."
            icon={<PackageCheck size={20} strokeWidth={1.5} />}
          />
        ) : (
          <div className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {asns.map((a) => (
              <Link
                key={a.id}
                href={`/inbound/${a.id}`}
                className="px-16 py-12 flex items-center gap-12 flex-wrap hover:bg-[var(--surface-2)] transition-colors"
              >
                <span className="mono-body text-text">{a.asnNumber}</span>
                <span className="label-text text-text-muted">{STATUS_LABEL[a.status]}</span>
                <span className="mono-sm text-text-dim">{a.supplierName ?? "—"}</span>
                {a.poNumber && <span className="mono-sm text-text-dim">· {a.poNumber}</span>}
                <span className="mono-sm text-text-muted ml-auto">
                  {a.receivedUnits}/{a.expectedUnits} units · {a.lineCount} line{a.lineCount === 1 ? "" : "s"}
                </span>
                {a.expectedDate && (
                  <span className="mono-sm text-text-dim">{a.expectedDate}</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
