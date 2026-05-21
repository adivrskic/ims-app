"use client";

import { useState } from "react";
import { Check, Printer, Loader2, AlertTriangle } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { usePrinter } from "./PrinterProvider";

interface Props {
  /** Pre-built ZPL string (from lib/print/zplTemplates). */
  zpl: string;
  /** Button copy. Default "Print label". */
  label?: string;
  /** Visual style — matches CornerButton variants. */
  variant?: "primary" | "ghost";
  /** Size — matches CornerButton sizes. */
  size?: "sm" | "md";
  /** Optional accessible label. */
  ariaLabel?: string;
}

/**
 * Three-state button that prints a ZPL document on the user's Zebra
 * printer.
 *
 *  - No printer paired: "Connect printer" → triggers browser USB picker.
 *  - Paired but unsupported browser: disabled with explainer text.
 *  - Paired and ready: clicking prints; shows a brief success state.
 *
 * The printer connection itself is held by PrinterProvider so multiple
 * print buttons across the app share one device.
 */
export function PrintLabelButton({
  zpl,
  label = "Print label",
  variant = "ghost",
  size = "sm",
  ariaLabel,
}: Props) {
  const { supported, device, printing, connect, print, error } = usePrinter();
  const [justPrinted, setJustPrinted] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  if (!supported) {
    return (
      <span
        className="hairline-subtle inline-flex items-center gap-8 px-12 py-6 text-text-dim cursor-not-allowed"
        title="WebUSB is not available in this browser. Use Chrome, Edge, or Opera."
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
        ariaLabel={ariaLabel ?? "Connect a Zebra printer"}
      >
        <Printer size={11} strokeWidth={1.5} />
        Connect printer
      </CornerButton>
    );
  }

  const handlePrint = async () => {
    setLocalErr(null);
    try {
      await print(zpl);
      setJustPrinted(true);
      setTimeout(() => setJustPrinted(false), 1800);
    } catch (err) {
      setLocalErr(err instanceof Error ? err.message : "Print failed");
    }
  };

  const displayErr = localErr ?? error;

  return (
    <span className="inline-flex items-center gap-10">
      <CornerButton
        type="button"
        variant={variant}
        size={size}
        onClick={handlePrint}
        disabled={printing}
        loading={printing}
        ariaLabel={ariaLabel ?? label}
      >
        {justPrinted ? (
          <>
            <Check size={11} strokeWidth={1.5} />
            Printed
          </>
        ) : printing ? (
          <>
            <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
            Printing…
          </>
        ) : (
          <>
            <Printer size={11} strokeWidth={1.5} />
            {label}
          </>
        )}
      </CornerButton>
      {displayErr && (
        <span
          className="inline-flex items-center gap-6 mono-sm text-[var(--danger)]"
          title={displayErr}
          role="alert"
        >
          <AlertTriangle size={10} strokeWidth={1.5} />
          <span className="truncate max-w-[200px]">{displayErr}</span>
        </span>
      )}
    </span>
  );
}
