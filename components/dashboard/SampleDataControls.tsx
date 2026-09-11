"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Trash2 } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { clearSampleData, loadSampleData } from "@/lib/sampleData/actions";

/**
 * "Explore with sample data" — seeds the demo set, then refreshes so the
 * overview, inventory and sidebar counts all reflect it.
 */
export function LoadSampleDataButton({
  variant = "ghost",
}: {
  variant?: "ghost" | "primary";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-6">
      <CornerButton
        type="button"
        variant={variant}
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await loadSampleData();
            if (!r.ok) setError(r.error);
            else router.refresh();
          })
        }
      >
        <Sparkles size={11} strokeWidth={1.5} />
        Explore with sample data
      </CornerButton>
      {error && (
        <p role="alert" className="mono-sm text-[var(--danger)] text-right">
          {error}
        </p>
      )}
    </div>
  );
}

/** One-click teardown, with a confirm so a stray click can't wipe the demo. */
export function ClearSampleDataButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-6">
      <CornerButton
        type="button"
        variant="ghost"
        size="sm"
        loading={pending}
        onClick={() => {
          if (
            !window.confirm(
              "Remove the sample products, stock, suppliers, customers, sections, orders and scans? Everything you added yourself stays."
            )
          ) {
            return;
          }
          start(async () => {
            setError(null);
            const r = await clearSampleData();
            if (!r.ok) setError(r.error);
            else router.refresh();
          });
        }}
      >
        <Trash2 size={11} strokeWidth={1.5} />
        Clear sample data
      </CornerButton>
      {error && (
        <p role="alert" className="mono-sm text-[var(--danger)] text-right">
          {error}
        </p>
      )}
    </div>
  );
}

/** The getting-started card's footer: the offer, in one line. */
export function SampleDataOffer() {
  return (
    <div className="flex items-center justify-between gap-14 flex-wrap">
      <p
        className="mono-sm text-text-muted flex-1 min-w-[240px]"
        style={{ lineHeight: 1.6 }}
      >
        Want to click around first? Load a realistic sample set for your
        industry — products with stock, suppliers, a PO in transit, open
        orders, two weeks of activity. One click clears it.
      </p>
      <LoadSampleDataButton />
    </div>
  );
}
