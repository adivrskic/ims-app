"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { CornerButton } from "@/components/ui/CornerButton";
import { createSupplier } from "./actions";

export function SupplierFormClient() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createSupplier,
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Close + reset on successful create
  useEffect(() => {
    if (state?.success) {
      setOpen(false);
      formRef.current?.reset();
    }
  }, [state]);

  if (!open) {
    return (
      <CornerButton
        type="button"
        variant="primary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Plus size={11} strokeWidth={1.5} /> Add supplier
      </CornerButton>
    );
  }

  return (
    <section
      aria-labelledby="add-supplier"
      className="hairline bg-[var(--surface)] flex flex-col"
    >
      <header className="px-20 py-14 hairline-b flex items-center justify-between">
        <div>
          <p className="label-text text-text-muted">New supplier</p>
          <h2
            id="add-supplier"
            className="text-text mt-2"
            style={{
              fontFamily: "var(--display)",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            Add supplier
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="hairline-subtle p-6 hover:border-[var(--border-hover)] text-text-secondary"
          aria-label="Cancel"
        >
          <X size={12} strokeWidth={1.5} />
        </button>
      </header>

      <form
        ref={formRef}
        action={formAction}
        className="p-20 flex flex-col gap-14"
      >
        <Input
          label="Name"
          name="name"
          type="text"
          required
          placeholder="e.g. Mohawk Flooring Wholesale"
          autoComplete="off"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <Input
            label="Contact email"
            name="contact_email"
            type="email"
            autoComplete="off"
            placeholder="orders@supplier.com"
          />
          <Input
            label="Contact phone"
            name="contact_phone"
            type="tel"
            autoComplete="off"
            placeholder="(555) 000-0000"
          />
        </div>

        <Input
          label="Address"
          name="address"
          type="text"
          autoComplete="off"
          placeholder="Street, city, state, zip"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <Input
            label="Payment terms"
            name="payment_terms"
            type="text"
            autoComplete="off"
            placeholder="e.g. Net 30"
          />
          <Input
            label="Default lead time (days)"
            name="default_lead_time_days"
            type="number"
            min={0}
            placeholder="e.g. 14"
          />
        </div>

        <label className="field-shell block">
          <span className="field-label">Notes</span>
          <textarea
            name="notes"
            rows={3}
            className="field-input resize-none"
            placeholder="Sales rep name, MOQ rules, dye-lot preferences…"
          />
        </label>

        {state?.error && (
          <p
            role="alert"
            className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-12 py-10 mono-sm text-[var(--danger)]"
          >
            {state.error}
          </p>
        )}

        <div className="flex items-center justify-end gap-10 hairline-t pt-14 -mx-20 px-20">
          <CornerButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </CornerButton>
          <CornerButton
            type="submit"
            variant="primary"
            size="sm"
            loading={pending}
          >
            Create supplier →
          </CornerButton>
        </div>
      </form>
    </section>
  );
}
