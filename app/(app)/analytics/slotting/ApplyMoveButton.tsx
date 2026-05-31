"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ArrowRight, Loader2, AlertTriangle } from "lucide-react";
import { applySlottingMove, type ApplyMoveArgs } from "./actions";

interface Props {
  args: ApplyMoveArgs;
  toLabel: string;
}

/**
 * Desk "Apply move" for a slotting suggestion (§6c). Relocates the stock to the
 * suggested slot and writes a relocate audit entry, then refreshes the report
 * so the resolved row drops off the list.
 */
export function ApplyMoveButton({ args, toLabel }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <span
        className="inline-flex items-center gap-6 text-[var(--success)]"
        style={{ fontFamily: "var(--mono)", fontSize: 10 }}
      >
        <Check size={11} strokeWidth={1.5} />
        Moved
      </span>
    );
  }

  const apply = () => {
    setError(null);
    startTransition(async () => {
      const r = await applySlottingMove(args);
      if (r.error) {
        setError(r.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  };

  return (
    <span className="inline-flex items-center gap-8 justify-end">
      {error && (
        <span
          className="inline-flex items-center gap-4 text-[var(--danger)]"
          style={{ fontFamily: "var(--mono)", fontSize: 10 }}
          role="alert"
          title={error}
        >
          <AlertTriangle size={10} strokeWidth={1.5} />
          <span className="hidden xl:inline max-w-[160px] truncate">{error}</span>
        </span>
      )}
      <button
        type="button"
        onClick={apply}
        disabled={pending}
        className="hairline-subtle px-10 py-6 inline-flex items-center gap-6 border-[var(--accent-soft)] bg-[var(--accent-dim)] text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title={`Move stock to ${toLabel} and record a relocate`}
        aria-label={`Apply move to ${toLabel}`}
      >
        {pending ? (
          <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
        ) : (
          <ArrowRight size={11} strokeWidth={1.5} />
        )}
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.8px",
            textTransform: "uppercase",
          }}
        >
          {pending ? "Applying" : "Apply"}
        </span>
      </button>
    </span>
  );
}
