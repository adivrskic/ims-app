import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { getQcQueue, type QcLine } from "@/lib/data/qc";
import { reviewQcLine } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { ShieldCheck, Check, X } from "lucide-react";

export const metadata = { title: "Receiving · QC" };

export default async function ReceivingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  /* reviewQcLine redirects back here with ?error=… on failure. Without
     reading it, both QC failure messages were silently swallowed. */
  const [ctx, scope, sp] = await Promise.all([
    getCurrentOrgContext(),
    getActiveScope(),
    searchParams,
  ]);
  const actionError = sp?.error ? decodeURIComponent(sp.error) : null;
  if (!ctx) {
    return <PageHeader eyebrow="Flow" title="Receiving" description="No workspace." />;
  }
  const supabase = await createClient();
  const warehouseId = scope.mode === "single" ? scope.id : null;
  const { hold, recentFailed } = await getQcQueue(supabase, ctx.orgId, warehouseId);

  const heldUnits = hold.reduce((s, l) => s + l.quantityReceived, 0);

  return (
    <div className="flex flex-col gap-32">
      {actionError && (
        <div className="hairline border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-16 py-12 flex items-start gap-12">
          <X
            size={14}
            strokeWidth={1.5}
            className="text-[var(--danger)] shrink-0 mt-2"
          />
          <p className="mono-sm text-[var(--danger)]">{actionError}</p>
        </div>
      )}
      <PageHeader
        eyebrow="Flow · Receiving"
        title="Quality control"
        description={scopeDescription(scope, {
          all: "Received goods held for inspection. Pass to clear for putaway, or fail to flag for a vendor return.",
          single: (name) =>
            `Received goods held for inspection at ${name}. Pass to clear for putaway, or fail to flag for vendor return.`,
        })}
        meta={[{ label: "On hold", value: String(hold.length), status: hold.length ? ("live" as const) : undefined }]}
      />

      <section aria-labelledby="kpis">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
          <KpiCard label="Lines on hold" value={hold.length.toLocaleString()} />
          <KpiCard label="Units quarantined" value={heldUnits.toLocaleString()} />
          <KpiCard label="Recent failures" value={recentFailed.length.toLocaleString()} />
        </div>
      </section>

      <section aria-labelledby="queue">
        <SectionTitle numeral="01" eyebrow="Inspect" title="On hold" />
        {hold.length === 0 ? (
          <EmptyState
            title="Nothing in QC"
            description="When goods are received with 'Hold for QC', they land here for inspection. Pass clears them for putaway; fail flags a vendor return."
            icon={<ShieldCheck size={20} strokeWidth={1.5} />}
          />
        ) : (
          <ul className="flex flex-col gap-12">
            {hold.map((l) => (
              <QcCard key={l.lineId} line={l} />
            ))}
          </ul>
        )}
      </section>

      {recentFailed.length > 0 && (
        <section aria-labelledby="failed">
          <SectionTitle
            numeral="02"
            eyebrow="Rejected"
            title="Recent failures"
            action={<span className="label-text text-text-muted">Flag for vendor return</span>}
          />
          <div className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {recentFailed.map((l) => (
              <div key={l.lineId} className="px-20 py-12 flex items-center gap-14 flex-wrap">
                <Link
                  href={`/inventory/${l.productId}`}
                  className="text-text hover:text-[var(--accent)] transition-colors"
                  style={{ fontFamily: "var(--display)", fontSize: 13 }}
                >
                  {l.productName}
                </Link>
                <span className="mono-sm text-text-dim">
                  {l.quantityReceived} units · {l.supplierName ?? "—"}
                </span>
                {l.qcNotes && (
                  <span className="mono-sm text-text-muted truncate flex-1">“{l.qcNotes}”</span>
                )}
                <Link
                  href={`/purchase-orders/${l.poId}`}
                  className="mono-sm text-text-dim ml-auto hover:text-[var(--accent)]"
                >
                  {l.poNumber ?? "PO"}
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function QcCard({ line }: { line: QcLine }) {
  return (
    <li className="hairline bg-[var(--surface)] p-16 flex flex-col gap-12">
      <div className="flex items-center gap-12 flex-wrap">
        <Link
          href={`/inventory/${line.productId}`}
          className="text-text hover:text-[var(--accent)] transition-colors"
          style={{ fontFamily: "var(--display)", fontSize: 14, fontWeight: 600 }}
        >
          {line.productName}
        </Link>
        <span className="mono-body tnum text-text">{line.quantityReceived} units</span>
        {line.lotNumber && (
          <span className="mono-sm text-text-muted">Lot {line.lotNumber}</span>
        )}
        <Link
          href={`/purchase-orders/${line.poId}`}
          className="mono-sm text-text-dim ml-auto hover:text-[var(--accent)]"
        >
          {line.poNumber ?? "PO"} · {line.supplierName ?? "—"}
        </Link>
      </div>
      <form action={reviewQcLine} className="flex items-center gap-8 flex-wrap">
        <input type="hidden" name="line_id" value={line.lineId} />
        <input type="hidden" name="po_id" value={line.poId} />
        <input
          name="notes"
          type="text"
          placeholder="Inspection notes (optional)…"
          className="hairline-subtle bg-[var(--surface-2)] mono-sm text-text px-10 py-6 flex-1 min-w-[180px] focus:border-[var(--accent)] outline-none"
          aria-label="QC notes"
        />
        <button
          type="submit"
          name="decision"
          value="pass"
          className="hairline-subtle px-12 py-7 inline-flex items-center gap-6 border-[var(--success)] text-[var(--success)] hover:bg-[var(--success-dim)] transition-colors"
        >
          <Check size={11} strokeWidth={1.5} />
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.8px", textTransform: "uppercase" }}>
            Pass
          </span>
        </button>
        <button
          type="submit"
          name="decision"
          value="fail"
          className="hairline-subtle px-12 py-7 inline-flex items-center gap-6 border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-colors"
        >
          <X size={11} strokeWidth={1.5} />
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.8px", textTransform: "uppercase" }}>
            Fail
          </span>
        </button>
      </form>
    </li>
  );
}
