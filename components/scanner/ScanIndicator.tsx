"use client";

import { useEffect, useState } from "react";
import { ScanLine } from "lucide-react";
import {
  useLastScan,
  useScannerEnabled,
} from "@/components/scanner/ScannerProvider";

/**
 * Small visual indicator that the scanner listener is alive. Sits in
 * the sidebar footer or wherever there's spare chrome real estate.
 *
 * States:
 * - Disabled: dim, click to re-enable
 * - Idle: subtle "Ready" pill
 * - Just-scanned: briefly highlights accent with the last barcode
 *
 * Doesn't take action on the scan itself — that's the job of whichever
 * page / workflow registered to listen. This is purely a status surface.
 */
export function ScanIndicator() {
  const [enabled, setEnabled] = useScannerEnabled();
  const lastScan = useLastScan();
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!lastScan) return;
    setFlash(true);
    const id = setTimeout(() => setFlash(false), 1400);
    return () => clearTimeout(id);
  }, [lastScan]);

  return (
    <button
      type="button"
      onClick={() => setEnabled(!enabled)}
      className={`hairline-subtle flex items-center justify-between gap-8 px-10 py-6 w-full transition-colors ${
        enabled ? "hover:border-[var(--border-hover)]" : "opacity-55"
      }`}
      aria-label={
        enabled
          ? "Scanner ready — click to disable"
          : "Scanner disabled — click to enable"
      }
      title={enabled ? "Scanner ready" : "Scanner disabled"}
    >
      <span className="inline-flex items-center gap-8 min-w-0">
        <ScanLine
          size={11}
          strokeWidth={1.5}
          className={
            flash
              ? "text-[var(--accent)]"
              : enabled
              ? "text-text-secondary"
              : "text-text-dim"
          }
          aria-hidden
        />
        <span
          className={`label-text truncate ${
            flash
              ? "text-[var(--accent)]"
              : enabled
              ? "text-text-muted"
              : "text-text-dim"
          }`}
        >
          {flash && lastScan
            ? lastScan.barcode
            : enabled
            ? "Scanner ready"
            : "Scanner off"}
        </span>
      </span>
      <span
        className={`shrink-0 dot ${
          flash ? "dot-live" : enabled ? "dot-online" : "dot-offline"
        }`}
        aria-hidden
      />
    </button>
  );
}
