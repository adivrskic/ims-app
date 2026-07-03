"use client";

import { useActionState, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { CornerButton } from "@/components/ui/CornerButton";
import { createReturnFromOrder } from "../actions";
import { RETURN_REASONS } from "../returnReasons";

export interface ReturnableItem {
  /** order_items.id */
  id: string;
  productName: string;
  barcode: string;
  /** Units picked = the desk-side cap on returnable quantity. */
  picked: number;
}

/**
 * Desk-side "Create return" for an order. Collapsed it's a single ghost
 * button; expanded it's an inline panel: line item (only lines with picked
 * units), quantity (≤ picked), reason dropdown, optional note. Submits to
 * createReturnFromOrder (orders/actions.ts), which inserts the return into
 * the "Pending review" queue — stock is only credited later by the explicit
 * Restock step on the Returns page.
 *
 * Same collapsed/expanded shape as returns/ReturnReviewForm.
 */
export function CreateReturnForm({
  orderId,
  items,
}: {
  orderId: string;
  items: ReturnableItem[];
}) {
  const [state, formAction] = useActionState(createReturnFromOrder, undefined);
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState("1");

  const selected = items.find((i) => i.id === itemId) ?? null;

  // Collapse + reset after a successful submit (the row shows up on the
  // Returns page; the success note stays visible here).
  useEffect(() => {
    if (state?.success) {
      setOpen(false);
      setItemId("");
      setReason("");
      setQty("1");
    }
  }, [state]);

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-6">
        <CornerButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          ariaLabel="Create a return for this order"
        >
          <RotateCcw size={11} strokeWidth={1.5} />
          Create return
        </CornerButton>
        {state?.success && (
          <p role="status" className="mono-sm text-[var(--success)]">
            {state.success}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="hairline bg-[var(--surface)] p-16 flex flex-col gap-12"
      aria-label="Create return"
    >
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="order_item_id" value={itemId} />
      <input type="hidden" name="reason" value={reason} />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_100px_200px_1fr] gap-12 items-start">
        <Select
          label="Line item"
          value={itemId}
          onChange={(v) => {
            setItemId(v);
            setQty("1");
          }}
          options={items.map((i) => ({
            value: i.id,
            label: i.productName,
            hint: `${i.barcode} · picked: ${i.picked}`,
          }))}
          required
          ariaLabel="Line item to return"
          compact
        />

        <label className="flex flex-col gap-2">
          <span className="mono-sm text-text-dim">Qty</span>
          <input
            name="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={selected?.picked ?? 1}
            step={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            disabled={!itemId}
            className="hairline-subtle bg-[var(--surface-2)] mono-sm text-text px-8 py-6 focus:border-[var(--accent)] outline-none tnum"
            aria-label="Quantity to return"
          />
        </label>

        <Select
          label="Reason"
          value={reason}
          onChange={setReason}
          options={RETURN_REASONS.map((r) => ({
            value: r.value,
            label: r.label,
          }))}
          required
          ariaLabel="Return reason"
          compact
        />

        <label className="flex flex-col gap-2">
          <span className="mono-sm text-text-dim">Note (optional)</span>
          <input
            name="notes"
            type="text"
            maxLength={500}
            autoComplete="off"
            className="hairline-subtle bg-[var(--surface-2)] mono-sm text-text px-8 py-6 focus:border-[var(--accent)] outline-none"
            aria-label="Return note"
          />
        </label>
      </div>

      <div className="flex items-center justify-end gap-8">
        {state?.error && (
          <p role="alert" className="mono-sm text-[var(--danger)] mr-auto">
            {state.error}
          </p>
        )}
        <CornerButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Cancel
        </CornerButton>
        <button
          type="submit"
          disabled={!itemId || !reason}
          className="hairline-subtle bg-[var(--accent-dim)] text-[var(--accent)] px-10 py-7 inline-flex items-center gap-6 hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          aria-label="Log return"
        >
          <RotateCcw size={11} strokeWidth={1.5} />
          <span className="label-text">Log return</span>
        </button>
      </div>
    </form>
  );
}
