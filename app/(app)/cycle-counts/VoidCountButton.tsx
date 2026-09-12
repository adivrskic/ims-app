"use client";

import { useTransition } from "react";
import { Ban } from "lucide-react";
import { voidCycleCount } from "./actions";

/**
 * Void a recorded count — the only caller of `voidCycleCount`, which was
 * permission-gated and fully implemented but unreachable from the app, so the
 * `voided` status could never actually occur.
 *
 * Voiding excludes a count from the accuracy stats. It deliberately does NOT
 * reverse the stock adjustment the count already applied: the units really were
 * recounted, and silently moving stock back would make the shelf disagree with
 * the system. Correct the quantity with a fresh count instead.
 */
export function VoidCountButton({
  id,
  productName,
}: {
  id: string;
  productName: string;
}) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Void the count for ${productName}`}
      title="Void this count — it stops affecting accuracy stats. Stock is not changed back."
      className="text-text-dim hover:text-[var(--danger)] transition-colors disabled:opacity-40"
      onClick={() => {
        if (
          !window.confirm(
            `Void this count for ${productName}?\n\nIt will stop counting toward your accuracy stats. Any stock adjustment it already made stays — record a new count to correct the quantity.`
          )
        ) {
          return;
        }
        start(async () => {
          const fd = new FormData();
          fd.set("id", id);
          await voidCycleCount(fd);
        });
      }}
    >
      <Ban size={11} strokeWidth={1.5} />
    </button>
  );
}
