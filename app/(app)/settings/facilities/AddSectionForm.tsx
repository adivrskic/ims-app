"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { CornerButton } from "@/components/ui/CornerButton";
import { createSection } from "./actions";

const COLOR_PRESETS = [
  "#D4A853", // gold
  "#3b82f6", // blue
  "#10b981", // emerald
  "#ef4444", // red
  "#a855f7", // purple
  "#f97316", // orange
  "#6b7280", // gray
];

interface Props {
  warehouseId: string;
}

export function AddSectionForm({ warehouseId }: Props) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [state, formAction, pending] = useActionState(createSection, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setOpen(false);
      setColor(COLOR_PRESETS[0]);
    }
  }, [state?.success]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors"
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "1.5px",
          textTransform: "uppercase",
        }}
      >
        <Plus size={10} strokeWidth={1.5} />
        Add section
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="hairline-subtle bg-[var(--surface-2)] p-12 flex flex-col gap-10 w-full"
    >
      <input type="hidden" name="warehouse_id" value={warehouseId} />
      <input type="hidden" name="color" value={color} />

      <div className="grid grid-cols-[80px_1fr] md:grid-cols-[80px_1fr_80px_80px] gap-8">
        <Input label="Code" name="code" type="text" required maxLength={4} />
        <Input label="Name" name="name" type="text" required />
        <Input
          label="Bays"
          name="total_bays"
          type="number"
          defaultValue="10"
          required
        />
        <Input
          label="Levels"
          name="total_levels"
          type="number"
          defaultValue="3"
          required
        />
      </div>

      <div className="flex items-center gap-12">
        <span className="label-text text-text-muted">Color</span>
        <div className="flex items-center gap-4">
          {COLOR_PRESETS.map((c) => {
            const selected = c === color;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-16 h-16 hairline-subtle transition-all ${
                  selected
                    ? "ring-1 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface-2)]"
                    : ""
                }`}
                style={{ background: c }}
                aria-label={`Color ${c}`}
                aria-pressed={selected}
              />
            );
          })}
        </div>
      </div>

      {state?.error && (
        <p
          role="alert"
          className="mono-sm text-[var(--danger)]"
          style={{ fontSize: 11 }}
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-8">
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
          Add →
        </CornerButton>
      </div>
    </form>
  );
}
