import { notFound } from "next/navigation";
import { Check, Truck, X, Boxes } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getAsnDetail, type AsnLine } from "@/lib/data/asn";
import { receiveAsnLine, receiveLpn, setAsnStatus } from "../actions";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "ASN" };

export default async function AsnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getCurrentOrgContext();
  if (!ctx) return <PageHeader eyebrow="Inbound" title="ASN" description="No workspace." />;
  const supabase = await createClient();
  const asn = await getAsnDetail(supabase, ctx.orgId, id);
  if (!asn) notFound();

  const open = asn.status === "expected" || asn.status === "in_transit";

  // Group lines by LPN (handling unit). Null LPN → individual lines.
  const byLpn = new Map<string, AsnLine[]>();
  const loose: AsnLine[] = [];
  for (const l of asn.lines) {
    if (l.lpn) {
      const arr = byLpn.get(l.lpn) ?? [];
      arr.push(l);
      byLpn.set(l.lpn, arr);
    } else loose.push(l);
  }

  return (
    <div className="flex flex-col gap-24">
      <PageHeader
        backHref="/inbound"
        backLabel="Inbound"
        eyebrow={`Inbound · ${asn.status.replace("_", " ").toUpperCase()}`}
        title={asn.asnNumber}
        description={[
          asn.supplierName,
          asn.poNumber ? `against ${asn.poNumber}` : null,
          asn.reference ? `ref ${asn.reference}` : null,
          asn.expectedDate ? `expected ${asn.expectedDate}` : null,
          asn.carrier,
          asn.trackingNumber,
        ].filter(Boolean).join(" · ") || "Advance ship notice"}
        actions={
          open ? (
            <div className="flex items-center gap-8">
              {asn.status === "expected" && (
                <form action={setAsnStatus}>
                  <input type="hidden" name="id" value={asn.id} />
                  <input type="hidden" name="status" value="in_transit" />
                  <button type="submit" className="hairline-subtle px-12 py-6 inline-flex items-center gap-6 hover:border-[var(--accent)] hover:text-[var(--accent)] text-text-secondary transition-colors">
                    <Truck size={11} strokeWidth={1.5} />
                    <span className="label-text">Mark in transit</span>
                  </button>
                </form>
              )}
              <form action={setAsnStatus}>
                <input type="hidden" name="id" value={asn.id} />
                <input type="hidden" name="status" value="cancelled" />
                <button type="submit" className="hairline-subtle px-12 py-6 inline-flex items-center gap-6 border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-colors">
                  <X size={11} strokeWidth={1.5} />
                  <span className="label-text">Cancel</span>
                </button>
              </form>
            </div>
          ) : undefined
        }
      />

      {/* Pallets (LPN groups) */}
      {[...byLpn.entries()].map(([lpn, lines]) => {
        const expected = lines.reduce((s, l) => s + l.quantityExpected, 0);
        const received = lines.reduce((s, l) => s + l.quantityReceived, 0);
        const palletDone = received >= expected;
        return (
          <section key={lpn} className="hairline bg-[var(--surface)]">
            <div className="px-16 py-10 flex items-center gap-12 hairline-b">
              <Boxes size={13} strokeWidth={1.5} className="text-[var(--accent)]" />
              <span className="mono-body text-text">Pallet {lpn}</span>
              <span className="mono-sm text-text-dim">{received}/{expected} units · {lines.length} SKU{lines.length === 1 ? "" : "s"}</span>
              {open && !palletDone && (
                <form action={receiveLpn} className="ml-auto">
                  <input type="hidden" name="asn_id" value={asn.id} />
                  <input type="hidden" name="lpn" value={lpn} />
                  <button type="submit" className="hairline-subtle px-12 py-6 inline-flex items-center gap-6 border-[var(--success)] text-[var(--success)] hover:bg-[var(--success-dim)] transition-colors">
                    <Check size={11} strokeWidth={1.5} />
                    <span className="label-text">Receive pallet</span>
                  </button>
                </form>
              )}
            </div>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {lines.map((l) => <LineRow key={l.id} line={l} asnId={asn.id} open={open} />)}
            </ul>
          </section>
        );
      })}

      {/* Loose lines */}
      {loose.length > 0 && (
        <section className="hairline bg-[var(--surface)]">
          <ul className="divide-y divide-[var(--border-subtle)]">
            {loose.map((l) => <LineRow key={l.id} line={l} asnId={asn.id} open={open} />)}
          </ul>
        </section>
      )}

      {asn.lines.length === 0 && (
        <p className="mono-sm text-text-dim">This ASN has no lines.</p>
      )}
    </div>
  );
}

function LineRow({ line, asnId, open }: { line: AsnLine; asnId: string; open: boolean }) {
  const remaining = line.quantityExpected - line.quantityReceived;
  const done = remaining <= 0;
  return (
    <li className="px-16 py-12 flex items-center gap-12 flex-wrap">
      <div className="flex flex-col min-w-0">
        <span className="text-text truncate" style={{ fontFamily: "var(--display)", fontSize: 13 }}>
          {line.productName}
        </span>
        <span className="mono-sm text-text-dim">
          {line.sku ?? "—"}
          {line.lotNumber ? ` · lot ${line.lotNumber}` : ""}
        </span>
      </div>
      <span className="mono-sm text-text-muted ml-auto tnum">
        {line.quantityReceived}/{line.quantityExpected}
      </span>
      {open && !done && (
        <form action={receiveAsnLine} className="flex items-center gap-6">
          <input type="hidden" name="asn_id" value={asnId} />
          <input type="hidden" name="line_id" value={line.id} />
          <input
            name="quantity"
            type="number"
            min={1}
            max={remaining}
            defaultValue={remaining}
            className="hairline-subtle bg-[var(--surface-2)] px-6 py-4 text-text tnum w-[64px]"
            style={{ fontFamily: "var(--mono)", fontSize: 11 }}
            aria-label="Receive quantity"
          />
          <button type="submit" className="hairline-subtle px-10 py-5 inline-flex items-center gap-6 border-[var(--success)] text-[var(--success)] hover:bg-[var(--success-dim)] transition-colors">
            <Check size={10} strokeWidth={1.5} />
            <span className="label-text">Receive</span>
          </button>
        </form>
      )}
      {done && <span className="label-text text-[var(--success)]">RECEIVED</span>}
    </li>
  );
}
