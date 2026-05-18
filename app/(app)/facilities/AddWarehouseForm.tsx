"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { CornerButton } from "@/components/ui/CornerButton";
import { createWarehouse } from "./actions";

export function AddWarehouseForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createWarehouse,
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state?.success]);

  if (!open) {
    return (
      <CornerButton
        type="button"
        variant="primary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Plus size={11} strokeWidth={1.5} />
        Add facility
      </CornerButton>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="hairline bg-[var(--surface)] p-20 flex flex-col gap-14"
    >
      <header className="flex items-start justify-between">
        <div>
          <h3
            className="text-text"
            style={{
              fontFamily: "var(--display)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            New facility
          </h3>
          <p className="mono-sm text-text-muted mt-2">
            Facility-scoped inventory, sections, and team access.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="hairline-subtle p-6 hover:border-[var(--border-hover)] text-text-secondary"
          aria-label="Cancel"
        >
          <X size={11} strokeWidth={1.5} />
        </button>
      </header>

      <Input
        label="Name"
        name="name"
        type="text"
        required
        placeholder="e.g. Dallas-Fulfillment"
      />
      <Input label="Address" name="address" type="text" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
        <Input label="City" name="city" type="text" />
        <Input label="State" name="state" type="text" />
        <Input label="Zip" name="zip" type="text" />
        <Input label="Phone" name="phone" type="tel" />
      </div>

      {state?.error && (
        <p
          role="alert"
          className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-12 py-10 mono-sm text-[var(--danger)]"
        >
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-10">
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
          Create →
        </CornerButton>
      </div>
    </form>
  );
}
