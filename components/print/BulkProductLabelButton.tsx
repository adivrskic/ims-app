"use client";

import { useState } from "react";
import { Printer, Check, Loader2, AlertTriangle, X } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Select } from "@/components/ui/Select";
import { usePrinter } from "./PrinterProvider";
import { productLabel, gs1ProductLabel } from "@/lib/print/zplTemplates";

interface ProductForLabel {
  id: string;
  name: string;
  barcode: string;
  sku?: string | null;
  category?: string | null;
}

interface Props {
  products: ProductForLabel[];
  buttonLabel?: string;
  variant?: "primary" | "ghost";
  size?: "sm" | "md";
}

interface PrintProgress {
  total: number;
  done: number;
  current: string | null;
}

/**
 * Bulk-print product shelf labels for a set of products in one job.
 *
 * Format toggle:
 *   - Standard: plain Code-128 of the barcode (works for any barcode).
 *   - GS1-128:  (01)GTIN GS1-128 — only for numeric GTIN-able barcodes;
 *     non-GTIN products silently fall back to Standard for that label.
 *
 * Prints sequentially with a progress readout (same UX as bulk bay labels).
 */
export function BulkProductLabelButton({
  products,
  buttonLabel = "Print labels",
  variant = "ghost",
  size = "sm",
}: Props) {
  const { supported, device, print, connect } = usePrinter();
  const [format, setFormat] = useState<"standard" | "gs1">("standard");
  const [progress, setProgress] = useState<PrintProgress | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const total = products.length;

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
      <CornerButton type="button" variant={variant} size={size} onClick={connect}>
        <Printer size={11} strokeWidth={1.5} />
        Connect printer
      </CornerButton>
    );
  }

  const handleClick = async () => {
    if (total === 0) return;
    setErr(null);
    setProgress({ total, done: 0, current: null });

    let done = 0;
    for (const p of products) {
      setProgress({ total, done, current: p.name });
      const zpl =
        (format === "gs1"
          ? gs1ProductLabel({
              productName: p.name,
              barcode: p.barcode,
              sku: p.sku,
              category: p.category,
            })
          : null) ??
        productLabel({
          productName: p.name,
          barcode: p.barcode,
          sku: p.sku,
          category: p.category,
        });
      try {
        await print(zpl);
        done += 1;
      } catch (e) {
        setErr(
          e instanceof Error ? `Failed at ${p.name}: ${e.message}` : `Failed at ${p.name}`
        );
        setProgress(null);
        return;
      }
    }
    setProgress({ total, done, current: null });
    setTimeout(() => setProgress(null), 2400);
  };

  if (progress) {
    const pct = Math.round((progress.done / progress.total) * 100);
    const complete = progress.done === progress.total;
    return (
      <span className="hairline-subtle inline-flex items-center gap-10 px-12 py-6" style={{ minWidth: 220 }}>
        {complete ? (
          <Check size={11} strokeWidth={1.5} className="text-[var(--success)]" />
        ) : (
          <Loader2 size={11} strokeWidth={1.5} className="text-[var(--accent)] animate-spin" />
        )}
        <span className="label-text text-text-secondary tnum">
          {progress.done} / {progress.total}
          {progress.current && !complete && ` · ${progress.current.slice(0, 18)}`}
          {complete && " · Done"}
        </span>
        <span className="ml-auto text-text-dim tnum" style={{ fontFamily: "var(--mono)", fontSize: 10 }}>
          {pct}%
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-8">
      <Select
        label="Format"
        value={format}
        onChange={(v) => setFormat(v as "standard" | "gs1")}
        ariaLabel="Label format"
        compact
        className="min-w-[132px]"
        options={[
          { value: "standard", label: "Standard (Code-128)" },
          { value: "gs1", label: "GS1-128" },
        ]}
      />
      <CornerButton type="button" variant={variant} size={size} onClick={handleClick} disabled={total === 0}>
        <Printer size={11} strokeWidth={1.5} />
        {buttonLabel}
        <span className="ml-6 text-text-dim tnum">{total}</span>
      </CornerButton>
      {err && (
        <span className="inline-flex items-center gap-6 mono-sm text-[var(--danger)]" role="alert" title={err}>
          <AlertTriangle size={10} strokeWidth={1.5} />
          <span className="truncate max-w-[240px]">{err}</span>
          <button type="button" onClick={() => setErr(null)} className="text-text-dim hover:text-text" aria-label="Dismiss error">
            <X size={10} strokeWidth={1.5} />
          </button>
        </span>
      )}
    </span>
  );
}
