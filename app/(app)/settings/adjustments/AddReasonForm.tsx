"use client";

import { useActionState } from "react";
import { Plus, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { CornerButton } from "@/components/ui/CornerButton";
import { Checkbox } from "@/components/ui/Checkbox";
import { addReason } from "./actions";

export function AddReasonForm() {
  const [state, action, pending] = useActionState(addReason, undefined);
  return (
    <form action={action} className="flex items-end gap-10 flex-wrap">
      <div style={{ minWidth: 220 }}>
        <Input label="New reason" name="label" type="text" maxLength={60} required />
      </div>
      <Checkbox
        name="requires_approval"
        label="Requires approval"
        title="Adjustments with this reason always require approval"
        className="pb-12"
      />
      <CornerButton type="submit" variant="ghost" size="sm" loading={pending} disabled={pending}>
        <Plus size={11} strokeWidth={1.5} />
        Add
      </CornerButton>
      {state?.error && (
        <span className="inline-flex items-center gap-4 text-[var(--danger)]" style={{ fontFamily: "var(--mono)", fontSize: 11 }} role="alert">
          <AlertTriangle size={11} strokeWidth={1.5} />
          {state.error}
        </span>
      )}
    </form>
  );
}
