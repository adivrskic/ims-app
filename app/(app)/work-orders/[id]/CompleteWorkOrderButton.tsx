"use client";

import { useActionState } from "react";
import { Check, AlertTriangle } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { completeWorkOrder } from "../actions";

interface Props {
  workOrderId: string;
  disabled?: boolean;
}

/**
 * Completes a work order (consume components → produce the finished good).
 * Server-side re-validates availability, so a stale "buildable" still fails
 * safely with a surfaced error.
 */
export function CompleteWorkOrderButton({ workOrderId, disabled }: Props) {
  const [state, action, pending] = useActionState(completeWorkOrder, undefined);

  return (
    <div className="flex items-center gap-10 flex-wrap">
      <form action={action}>
        <input type="hidden" name="id" value={workOrderId} />
        <CornerButton
          type="submit"
          variant="primary"
          size="sm"
          loading={pending}
          disabled={pending || disabled}
          title={
            disabled
              ? "Not enough component stock at this facility"
              : "Consume components and produce the finished good"
          }
        >
          <Check size={11} strokeWidth={1.5} />
          Complete &amp; build
        </CornerButton>
      </form>
      {state?.error && (
        <span
          className="inline-flex items-center gap-4 text-[var(--danger)]"
          style={{ fontFamily: "var(--mono)", fontSize: 11 }}
          role="alert"
        >
          <AlertTriangle size={11} strokeWidth={1.5} />
          {state.error}
        </span>
      )}
    </div>
  );
}
