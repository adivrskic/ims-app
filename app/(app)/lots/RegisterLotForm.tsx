"use client";

import { useActionState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/Input";
import { CornerButton } from "@/components/ui/CornerButton";
import { createLot } from "./actions";

interface ProductOption {
  id: string;
  name: string;
  barcode: string;
}
interface SupplierOption {
  id: string;
  name: string;
}

interface Props {
  products: ProductOption[];
  suppliers: SupplierOption[];
}

export function RegisterLotForm({ products, suppliers }: Props) {
  const [state, formAction, pending] = useActionState(createLot, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  if (products.length === 0) {
    return (
      <div className="hairline bg-[var(--surface)] p-20">
        <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
          No lot-tracked products yet. Turn on lot tracking for a product below,
          then register its lots here.
        </p>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="hairline bg-[var(--surface)] p-20 flex flex-col gap-14"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <label className="field-shell block" data-filled="true">
          <span className="field-label">Product</span>
          <select
            name="product_id"
            required
            className="field-input cursor-pointer"
            aria-label="Product"
            defaultValue=""
          >
            <option value="" disabled>
              — Select —
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.barcode}
              </option>
            ))}
          </select>
        </label>

        <Input
          label="Lot / batch number"
          name="lot_number"
          required
          placeholder="LOT-2026-0042"
        />

        <Input label="Expiry date (optional)" name="expires_at" type="date" />

        <label className="field-shell block" data-filled="true">
          <span className="field-label">Supplier (optional)</span>
          <select
            name="supplier_id"
            defaultValue=""
            className="field-input cursor-pointer"
            aria-label="Supplier"
          >
            <option value="">— None —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field-shell block">
        <span className="field-label">Notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          className="field-input resize-none"
          placeholder="Dye lot, COA reference, storage notes…"
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
      {state?.success && (
        <p
          role="status"
          className="hairline-subtle border-[rgba(34,197,94,0.45)] bg-[var(--success-dim)] px-12 py-10 mono-sm text-[var(--success)]"
        >
          {state.success}
        </p>
      )}

      <div className="flex justify-end">
        <CornerButton type="submit" variant="primary" size="sm" loading={pending}>
          Register lot →
        </CornerButton>
      </div>
    </form>
  );
}
