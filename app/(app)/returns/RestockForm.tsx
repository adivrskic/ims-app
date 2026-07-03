"use client";

import { useActionState, useState } from "react";
import { PackagePlus } from "lucide-react";
import { Select, type SelectOption } from "@/components/ui/Select";
import { CornerButton } from "@/components/ui/CornerButton";
import { restockReturn } from "./actions";

/**
 * Inline restock control for a reviewed return with a Restock disposition.
 * Collapsed it's a single "Restock" button; expanded it lets the reviewer
 * pick the destination location (locations already holding the product, or
 * empty locations when there are none) + confirm the quantity, then submits
 * to the restockReturn server action → app.restock_return RPC (atomic
 * on-hand credit + audit + restocked stamp).
 *
 * Mirrors ReturnReviewForm's collapsed-button / expanded-inline-form shape.
 */
export function RestockForm({
  returnId,
  quantity,
  locations,
}: {
  returnId: string;
  quantity: number;
  /** Destination options (label = section · bay · level, hint = on hand). */
  locations: SelectOption[];
}) {
  const [state, formAction] = useActionState(restockReturn, undefined);
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [qty, setQty] = useState(String(quantity));

  // A successful restock revalidates the list and this row re-renders as
  // "Restocked" — no local success state to manage.
  if (!open) {
    return (
      <div className="flex flex-col items-end gap-6">
        <CornerButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          ariaLabel="Restock this return"
        >
          <PackagePlus size={11} strokeWidth={1.5} />
          Restock
        </CornerButton>
        {state?.error && (
          <p role="alert" className="mono-sm text-[var(--danger)]">
            {state.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex items-end gap-8 flex-wrap justify-end"
    >
      <input type="hidden" name="id" value={returnId} />
      <input type="hidden" name="location_id" value={locationId} />

      <div className="w-[220px]">
        <Select
          label="Destination"
          value={locationId}
          onChange={setLocationId}
          options={locations}
          ariaLabel="Destination location"
          compact
        />
      </div>

      <label className="flex flex-col gap-2 w-[72px]">
        <span className="mono-sm text-text-dim">Qty</span>
        <input
          name="quantity"
          type="number"
          inputMode="numeric"
          min={1}
          max={quantity}
          step={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="hairline-subtle bg-[var(--surface-2)] mono-sm text-text px-8 py-6 focus:border-[var(--accent)] outline-none tnum"
          aria-label="Quantity to restock"
        />
      </label>

      <button
        type="submit"
        disabled={!locationId}
        className="hairline-subtle bg-[var(--accent-dim)] text-[var(--accent)] px-10 py-7 inline-flex items-center gap-6 hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        aria-label="Confirm restock"
      >
        <PackagePlus size={11} strokeWidth={1.5} />
        <span className="label-text">Restock</span>
      </button>
      <CornerButton
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(false)}
      >
        Cancel
      </CornerButton>

      {state?.error && (
        <p
          role="alert"
          className="w-full text-right mono-sm text-[var(--danger)]"
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
