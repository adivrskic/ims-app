"use client";

import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { receiveLineItem } from "../actions";

interface Props {
  lineId: string;
  poId: string;
  productName: string;
  quantityExpected: number;
  quantityReceived: number;
  unitCost: string | null;
}

/**
 * Per-line receive form for the PO detail page.
 *
 * Fields (all in the expanded state):
 *   - Quantity received  (defaults to remaining; required)
 *   - Landed unit cost   (optional, USD)
 *   - Lot number         (optional, free-text — captured per-line so the
 *                         system can record dye-lot for flooring)
 */
export function ReceiveLineForm({
  lineId,
  poId,
  productName,
  quantityExpected,
  quantityReceived,
  unitCost,
}: Props) {
  const [open, setOpen] = useState(false);
  const remaining = quantityExpected - quantityReceived;
  const [state, formAction, pending] = useActionState(
    receiveLineItem,
    undefined
  );

  if (!open) {
    return (
      <CornerButton
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        ariaLabel={`Receive ${productName}`}
      >
        Receive
      </CornerButton>
    );
  }

  return (
    <form
      action={formAction}
      className="flex items-center gap-6 justify-end flex-wrap"
    >
      <input type="hidden" name="line_id" value={lineId} />
      <input type="hidden" name="po_id" value={poId} />

      {/* Qty received */}
      <label className="flex flex-col items-end">
        <input
          name="quantity_received"
          type="number"
          min={1}
          max={remaining}
          defaultValue={remaining}
          className="hairline-subtle bg-[var(--surface-2)] mono-sm tnum text-text px-8 py-4 text-right w-[60px] focus:border-[var(--accent)] outline-none"
          aria-label="Quantity received"
          autoFocus
        />
        <span className="label-text text-text-dim mt-1" style={{ fontSize: 9 }}>
          of {remaining}
        </span>
      </label>

      {/* Landed cost */}
      <label className="flex flex-col items-end">
        <input
          name="landed_unit_cost"
          type="text"
          inputMode="decimal"
          placeholder={unitCost ?? "$"}
          className="hairline-subtle bg-[var(--surface-2)] mono-sm tnum text-text px-8 py-4 text-right w-[72px] focus:border-[var(--accent)] outline-none"
          aria-label="Actual landed unit cost (optional)"
        />
        <span className="label-text text-text-dim mt-1" style={{ fontSize: 9 }}>
          landed $
        </span>
      </label>

      {/* Lot number */}
      <label className="flex flex-col items-end">
        <input
          name="lot_number"
          type="text"
          autoComplete="off"
          placeholder="—"
          className="hairline-subtle bg-[var(--surface-2)] mono-sm text-text px-8 py-4 text-right w-[88px] focus:border-[var(--accent)] outline-none"
          aria-label="Lot or dye-lot number (optional)"
        />
        <span className="label-text text-text-dim mt-1" style={{ fontSize: 9 }}>
          lot #
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="hairline-subtle bg-[var(--accent-dim)] text-[var(--accent)] p-6 hover:border-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Confirm receipt"
      >
        <Check size={11} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="hairline-subtle p-6 hover:border-[var(--border-hover)] text-text-muted transition-colors"
        aria-label="Cancel"
      >
        <X size={11} strokeWidth={1.5} />
      </button>

      {state?.error && (
        <span
          role="alert"
          className="mono-sm text-[var(--danger)] absolute -bottom-16 right-0 whitespace-nowrap"
          style={{ fontSize: 10 }}
        >
          {state.error}
        </span>
      )}
    </form>
  );
}
