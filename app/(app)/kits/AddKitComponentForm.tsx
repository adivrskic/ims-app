"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Select } from "@/components/ui/Select";
import { addKitComponent } from "./actions";

interface ProductOption {
  id: string;
  name: string;
  barcode: string;
}

interface Props {
  kitProductId: string;
  /** Selectable components (all products except this kit). */
  products: ProductOption[];
}

export function AddKitComponentForm({ kitProductId, products }: Props) {
  const [state, formAction, pending] = useActionState(addKitComponent, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex items-end gap-8 flex-wrap px-16 py-12 bg-[var(--surface-2)]"
    >
      <input type="hidden" name="kit_product_id" value={kitProductId} />

      <Select
        label="Add component"
        name="component_product_id"
        required
        placeholder="— Select product —"
        ariaLabel="Component product"
        className="flex-1 min-w-[180px]"
        options={products.map((p) => ({
          value: p.id,
          label: p.name,
          hint: p.barcode,
        }))}
      />

      <label className="field-shell block w-[96px]" data-filled="true">
        <span className="field-label">Qty / kit</span>
        <input
          name="quantity"
          type="number"
          min={1}
          defaultValue={1}
          className="field-input tnum"
          aria-label="Quantity per kit"
        />
      </label>

      <CornerButton type="submit" variant="ghost" size="sm" loading={pending}>
        <Plus size={11} strokeWidth={1.5} />
        Add
      </CornerButton>

      {state?.error && (
        <p
          role="alert"
          className="w-full mono-sm text-[var(--danger)]"
          style={{ fontSize: 11 }}
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
