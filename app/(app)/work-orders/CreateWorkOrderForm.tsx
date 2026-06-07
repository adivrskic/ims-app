"use client";

import { useActionState } from "react";
import { Hammer, AlertTriangle } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { createWorkOrder } from "./actions";

interface Props {
  kits: { id: string; name: string }[];
  facilities: { id: string; name: string }[];
}

export function CreateWorkOrderForm({ kits, facilities }: Props) {
  const [state, action, pending] = useActionState(createWorkOrder, undefined);

  if (kits.length === 0) {
    return (
      <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
        No kits with a bill of materials yet. Mark a product as a kit and add
        components on the Kits page first.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <Select
          label="Kit to build"
          name="product_id"
          required
          ariaLabel="Kit to build"
          options={kits.map((k) => ({ value: k.id, label: k.name }))}
        />
        <Select
          label="Facility"
          name="warehouse_id"
          required
          ariaLabel="Facility"
          options={facilities.map((f) => ({ value: f.id, label: f.name }))}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <Input
          label="Quantity to build"
          name="quantity"
          type="number"
          min={1}
          defaultValue={1}
          required
        />
        <Input label="Notes (optional)" name="notes" type="text" />
      </div>

      {state?.error && (
        <div
          className="hairline-subtle px-12 py-8 flex items-start gap-8"
          style={{ background: "var(--danger-dim)", color: "var(--danger)" }}
        >
          <AlertTriangle size={11} strokeWidth={1.5} className="mt-1 shrink-0" />
          <span className="mono-sm">{state.error}</span>
        </div>
      )}

      <div>
        <CornerButton type="submit" variant="primary" size="sm" loading={pending} disabled={pending}>
          <Hammer size={11} strokeWidth={1.5} />
          Create work order
        </CornerButton>
      </div>
    </form>
  );
}
