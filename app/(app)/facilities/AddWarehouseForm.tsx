"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { AddressFields } from "@/components/ui/AddressFields";
import { CornerButton } from "@/components/ui/CornerButton";
import { FormSection } from "@/components/ui/FormSection";
import { FormActions } from "@/components/ui/FormActions";
import { FormNotice } from "@/components/ui/FormNotice";
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
    <form ref={formRef} action={formAction}>
      <FormSection
        title="New facility"
        description="Facility-scoped inventory, sections, and team access."
        action={
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="hairline-subtle p-6 hover:border-[var(--border-hover)] text-text-secondary"
            aria-label="Cancel"
          >
            <X size={11} strokeWidth={1.5} />
          </button>
        }
      >
        <Input
          label="Name"
          name="name"
          type="text"
          required
          placeholder="e.g. Dallas-Fulfillment"
        />
        <Input label="Address" name="address" type="text" />

        {/* City + State (dropdown) + ZIP (with autofill). Bare field names. */}
        <AddressFields namePrefix="" />

        <Input
          label="Phone"
          name="phone"
          type="tel"
          placeholder="(404) 555-0142"
        />

        {state?.error && <FormNotice>{state.error}</FormNotice>}

        <FormActions>
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
        </FormActions>
      </FormSection>
    </form>
  );
}
