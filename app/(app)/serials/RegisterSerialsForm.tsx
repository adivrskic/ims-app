"use client";

import { useActionState, useEffect, useRef } from "react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Select } from "@/components/ui/Select";
import { registerSerials } from "./actions";

interface ProductOption {
  id: string;
  name: string;
  barcode: string;
}
interface WarehouseOption {
  id: string;
  name: string;
}

interface Props {
  products: ProductOption[];
  warehouses: WarehouseOption[];
}

export function RegisterSerialsForm({ products, warehouses }: Props) {
  const [state, formAction, pending] = useActionState(registerSerials, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  if (products.length === 0) {
    return (
      <div className="hairline bg-[var(--surface)] p-20">
        <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
          No serialized products yet. Turn on serial tracking for a product
          below, then register its units here.
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
        <Select
          label="Product"
          name="product_id"
          required
          defaultValue=""
          ariaLabel="Product"
          placeholder="— Select —"
          options={products.map((p) => ({
            value: p.id,
            label: p.name,
            hint: p.barcode,
          }))}
        />

        <Select
          label="Facility (optional)"
          name="warehouse_id"
          defaultValue=""
          ariaLabel="Facility"
          placeholder="— None —"
          options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
        />
      </div>

      <label className="field-shell block">
        <span className="field-label">Serial numbers</span>
        <textarea
          name="serials"
          rows={4}
          required
          className="field-input resize-none"
          style={{ fontFamily: "var(--mono)", fontSize: 12 }}
          placeholder={"Paste serials — one per line, or comma/space separated\nSN-0001\nSN-0002"}
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
          Register serials →
        </CornerButton>
      </div>
    </form>
  );
}
