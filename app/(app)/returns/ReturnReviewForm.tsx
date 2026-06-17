"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { CornerButton } from "@/components/ui/CornerButton";
import { reviewReturn } from "./actions";

const DISPOSITION_OPTIONS = [
  { value: "restock", label: "Restock" },
  { value: "damaged", label: "Damaged" },
  { value: "hold_for_inspection", label: "Hold for inspection" },
  { value: "supplier_return", label: "Supplier return" },
];

/**
 * Inline review control for a pending return. Collapsed it's a single
 * "Review" button; expanded it lets the reviewer confirm/correct the
 * disposition + add a note, then submits to the reviewReturn server action
 * (which revalidates the list).
 */
export function ReturnReviewForm({
  returnId,
  currentDisposition,
}: {
  returnId: string;
  currentDisposition: string;
}) {
  const [open, setOpen] = useState(false);
  const [disposition, setDisposition] = useState(currentDisposition);

  if (!open) {
    return (
      <CornerButton
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        ariaLabel="Review this return"
      >
        Review
      </CornerButton>
    );
  }

  return (
    <form
      action={reviewReturn}
      className="flex items-end gap-8 flex-wrap justify-end"
    >
      <input type="hidden" name="id" value={returnId} />
      <input type="hidden" name="disposition" value={disposition} />

      <div className="w-[180px]">
        <Select
          label="Disposition"
          value={disposition}
          onChange={setDisposition}
          options={DISPOSITION_OPTIONS}
          ariaLabel="Disposition"
          compact
        />
      </div>

      <label className="flex flex-col gap-2 w-[180px]">
        <span className="mono-sm text-text-dim">Note (optional)</span>
        <input
          name="review_notes"
          type="text"
          maxLength={500}
          autoComplete="off"
          className="hairline-subtle bg-[var(--surface-2)] mono-sm text-text px-8 py-6 focus:border-[var(--accent)] outline-none"
          aria-label="Review note"
        />
      </label>

      <button
        type="submit"
        className="hairline-subtle bg-[var(--accent-dim)] text-[var(--accent)] px-10 py-7 inline-flex items-center gap-6 hover:border-[var(--accent)] transition-colors"
        aria-label="Confirm review"
      >
        <Check size={11} strokeWidth={1.5} />
        <span className="label-text">Confirm</span>
      </button>
      <CornerButton
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(false)}
      >
        Cancel
      </CornerButton>
    </form>
  );
}
