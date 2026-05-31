"use client";

import { useActionState, useEffect, useRef } from "react";
import { Hammer } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { buildKit } from "./actions";

interface WarehouseOption {
  id: string;
  name: string;
}

interface Props {
  kitProductId: string;
  warehouses: WarehouseOption[];
}

export function BuildKitForm({ kitProductId, warehouses }: Props) {
  const [state, formAction, pending] = useActionState(buildKit, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  if (warehouses.length === 0) return null;

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex items-center gap-6 flex-wrap justify-end"
    >
      <input type="hidden" name="kit_product_id" value={kitProductId} />

      <input
        name="quantity"
        type="number"
        min={1}
        defaultValue={1}
        className="hairline-subtle bg-[var(--surface-2)] mono-sm tnum text-text px-8 py-4 text-right w-[56px] focus:border-[var(--accent)] outline-none"
        aria-label="Quantity to build"
      />
      <select
        name="warehouse_id"
        defaultValue={warehouses[0]?.id ?? ""}
        className="hairline-subtle bg-[var(--surface-2)] mono-sm text-text px-8 py-4 focus:border-[var(--accent)] outline-none cursor-pointer max-w-[140px]"
        aria-label="Build at facility"
      >
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      <CornerButton type="submit" variant="ghost" size="sm" loading={pending}>
        <Hammer size={11} strokeWidth={1.5} />
        Build
      </CornerButton>

      {state?.error && (
        <span
          role="alert"
          className="w-full text-right mono-sm text-[var(--danger)]"
          style={{ fontSize: 11 }}
        >
          {state.error}
        </span>
      )}
      {state?.success && (
        <span
          role="status"
          className="w-full text-right mono-sm text-[var(--success)]"
          style={{ fontSize: 11 }}
        >
          {state.success}
        </span>
      )}
    </form>
  );
}
