"use client";

import { useState } from "react";
import { Printer, Check, Loader2, AlertTriangle, X } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { usePrinter } from "./PrinterProvider";
import { locationLabel } from "@/lib/print/zplTemplates";

interface Section {
  code: string;
  name: string | null;
  total_bays: number;
  total_levels: number;
}

interface Props {
  /** Sections to expand into individual bay×level labels. */
  sections: Section[];
  /** Button label. Default: "Print bay labels". */
  buttonLabel?: string;
  /** Visual style. */
  variant?: "primary" | "ghost";
  size?: "sm" | "md";
}

interface PrintProgress {
  total: number;
  done: number;
  current: string | null;
}

/**
 * Bulk-print bay labels for one or many sections.
 *
 * Expands each section's total_bays × total_levels into individual labels
 * with code "{section.code}-{bay}-{level}" (e.g. A-12-3). Prints sequentially
 * with a progress UI so a stuck print job is obvious.
 *
 * Each label is 4×2 inches; expect ~0.5-1 second per label depending on
 * printer model. A 10-bay × 3-level section = 30 labels ≈ 30 seconds.
 *
 * Cancellation: not implemented — once a job starts, it finishes. To stop
 * a runaway batch, hit the printer's pause button (every Zebra has one).
 */
export function BulkPrintBayLabels({
  sections,
  buttonLabel = "Print bay labels",
  variant = "ghost",
  size = "sm",
}: Props) {
  const { supported, device, print, connect } = usePrinter();
  const [progress, setProgress] = useState<PrintProgress | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const totalLabels = sections.reduce(
    (sum, s) => sum + s.total_bays * s.total_levels,
    0
  );

  if (!supported) {
    return (
      <span
        className="hairline-subtle inline-flex items-center gap-8 px-12 py-6 text-text-dim cursor-not-allowed"
        title="WebUSB is not available. Use Chrome, Edge, or Opera."
      >
        <Printer size={11} strokeWidth={1.5} />
        <span className="label-text">Printing needs Chrome</span>
      </span>
    );
  }

  if (!device) {
    return (
      <CornerButton
        type="button"
        variant={variant}
        size={size}
        onClick={connect}
      >
        <Printer size={11} strokeWidth={1.5} />
        Connect printer
      </CornerButton>
    );
  }

  const handleClick = async () => {
    if (totalLabels === 0) return;
    setErr(null);
    setProgress({ total: totalLabels, done: 0, current: null });

    let done = 0;
    for (const section of sections) {
      for (let bay = 1; bay <= section.total_bays; bay++) {
        for (let level = 1; level <= section.total_levels; level++) {
          const code = `${section.code}-${bay}-${level}`;
          setProgress({ total: totalLabels, done, current: code });
          try {
            await print(
              locationLabel({
                code,
                sectionName: section.name,
                capacity: `Bay ${bay} · Level ${level}`,
              })
            );
            done += 1;
          } catch (e) {
            setErr(
              e instanceof Error
                ? `Failed at ${code}: ${e.message}`
                : `Failed at ${code}`
            );
            setProgress(null);
            return;
          }
        }
      }
    }

    setProgress({ total: totalLabels, done, current: null });
    setTimeout(() => setProgress(null), 2400);
  };

  if (progress) {
    const pct = Math.round((progress.done / progress.total) * 100);
    const complete = progress.done === progress.total;
    return (
      <span
        className="hairline-subtle inline-flex items-center gap-10 px-12 py-6"
        style={{ minWidth: 220 }}
      >
        {complete ? (
          <Check
            size={11}
            strokeWidth={1.5}
            className="text-[var(--success)]"
          />
        ) : (
          <Loader2
            size={11}
            strokeWidth={1.5}
            className="text-[var(--accent)] animate-spin"
          />
        )}
        <span className="label-text text-text-secondary tnum">
          {progress.done} / {progress.total}
          {progress.current && !complete && ` · ${progress.current}`}
          {complete && " · Done"}
        </span>
        <span
          className="ml-auto text-text-dim tnum"
          style={{ fontFamily: "var(--mono)", fontSize: 10 }}
        >
          {pct}%
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-10">
      <CornerButton
        type="button"
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={totalLabels === 0}
      >
        <Printer size={11} strokeWidth={1.5} />
        {buttonLabel}
        <span className="ml-6 text-text-dim tnum">{totalLabels}</span>
      </CornerButton>
      {err && (
        <span
          className="inline-flex items-center gap-6 mono-sm text-[var(--danger)]"
          role="alert"
          title={err}
        >
          <AlertTriangle size={10} strokeWidth={1.5} />
          <span className="truncate max-w-[260px]">{err}</span>
          <button
            type="button"
            onClick={() => setErr(null)}
            className="text-text-dim hover:text-text"
            aria-label="Dismiss error"
          >
            <X size={10} strokeWidth={1.5} />
          </button>
        </span>
      )}
    </span>
  );
}
