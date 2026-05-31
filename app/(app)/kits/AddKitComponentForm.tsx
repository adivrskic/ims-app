"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
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

      <label className="field-shell block flex-1 min-w-[180px]" data-filled="true">
        <span className="field-label">Add component</span>
        <select
          name="component_product_id"
          required
          defaultValue=""
          className="field-input cursor-pointer"
          aria-label="Component product"
        >
          <option value="" disabled>
            — Select product —
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.barcode}
            </option>
          ))}
        </select>
      </label>

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
