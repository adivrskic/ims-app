import { Sparkles } from "lucide-react";
import { sampleCounts, type SampleDataMarker } from "@/lib/sampleData/types";
import { ClearSampleDataButton } from "./SampleDataControls";

interface Props {
  marker: SampleDataMarker;
  /** Owners/admins with inventory.manage can clear; everyone sees the notice. */
  canClear: boolean;
}

/** Shown at the top of the overview while demo data is loaded. */
export function SampleDataBanner({ marker, canClear }: Props) {
  const n = sampleCounts(marker);
  return (
    <div
      role="status"
      className="hairline-subtle border-[var(--accent-soft)] bg-[var(--accent-dim)] px-16 py-12 flex items-center justify-between gap-14 flex-wrap"
    >
      <div className="flex items-start gap-10 flex-1 min-w-[260px]">
        <Sparkles
          size={12}
          strokeWidth={1.5}
          className="mt-2 shrink-0 text-[var(--accent)]"
          aria-hidden
        />
        <p className="mono-sm text-text" style={{ lineHeight: 1.6 }}>
          You&apos;re exploring with <strong>sample data</strong> —{" "}
          {n.products} products with stock, {n.suppliers} suppliers,{" "}
          {n.customers} customers, {n.purchaseOrders === 1 ? "a" : n.purchaseOrders}{" "}
          purchase order{n.purchaseOrders === 1 ? "" : "s"} in transit,{" "}
          {n.orders} open orders and recent scans are placeholders. Everything
          you add yourself stays when you clear it.
        </p>
      </div>
      {canClear && <ClearSampleDataButton />}
    </div>
  );
}
