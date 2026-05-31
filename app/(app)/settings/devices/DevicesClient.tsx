"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Printer,
  ScanLine,
  AlertTriangle,
  RefreshCw,
  Plug,
} from "lucide-react";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { CornerButton } from "@/components/ui/CornerButton";
import {
  useLastScan,
  useScannerEnabled,
} from "@/components/scanner/ScannerProvider";
import { usePrinter } from "@/components/print/PrinterProvider";
import { productLabel } from "@/lib/print/zplTemplates";

export function DevicesClient() {
  return (
    <>
      <ScannerSection />
      <PrinterSection />
    </>
  );
}

// ─── Scanner ───────────────────────────────────────────────────────────

function ScannerSection() {
  const lastScan = useLastScan();
  const [enabled, setEnabled] = useScannerEnabled();

  // Local mirror of the *most recent* scan for the test field below — once
  // a scan comes in we hold it visible so the user can verify the value.
  const [testValue, setTestValue] = useState<string>("");
  useEffect(() => {
    if (lastScan) setTestValue(lastScan.barcode);
  }, [lastScan]);

  return (
    <section aria-labelledby="scanner">
      <SectionTitle
        eyebrow="Input"
        title="Barcode scanner"
        action={
          <span className="label-text text-text-muted">HID keyboard-wedge</span>
        }
      />
      <article className="hairline bg-[var(--surface)] p-20 flex flex-col gap-16">
        <div className="flex items-start gap-14">
          <span
            className={`w-32 h-32 hairline-subtle flex items-center justify-center shrink-0 ${
              enabled
                ? "bg-[var(--success-dim)] text-[var(--success)]"
                : "bg-[var(--surface-2)] text-text-dim"
            }`}
            aria-hidden
          >
            <ScanLine size={14} strokeWidth={1.5} />
          </span>
          <div className="flex-1 min-w-0">
            <p
              className="text-text"
              style={{
                fontFamily: "var(--display)",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {enabled ? "Scanner active" : "Scanner paused"}
            </p>
            <p
              className="mono-sm text-text-muted mt-4"
              style={{ lineHeight: 1.55 }}
            >
              {enabled
                ? "Any USB or Bluetooth scanner that types its scans (the default for Zebra DS2208, Honeywell Voyager, Datalogic Gryphon) will fire scan events globally."
                : "Capture is paused. Toggle on to receive barcode scans."}
            </p>
          </div>
          <CornerButton
            type="button"
            variant={enabled ? "ghost" : "primary"}
            size="sm"
            onClick={() => setEnabled(!enabled)}
          >
            {enabled ? "Pause" : "Resume"}
          </CornerButton>
        </div>

        <div className="hairline-t pt-14 flex flex-col gap-10">
          <p className="label-text">Test field</p>
          <p className="mono-sm text-text-muted" style={{ lineHeight: 1.55 }}>
            Pull the trigger on your scanner. The captured barcode should appear
            here within a second.
          </p>
          <div className="hairline-subtle bg-[var(--surface-2)] px-14 py-12 flex items-center gap-12">
            <ScanLine
              size={11}
              strokeWidth={1.5}
              className={testValue ? "text-[var(--accent)]" : "text-text-dim"}
              aria-hidden
            />
            <code
              className="mono-body text-text tnum flex-1 truncate"
              style={{ fontSize: 13 }}
            >
              {testValue || "—  (waiting for scan)"}
            </code>
            {testValue && (
              <button
                type="button"
                onClick={() => setTestValue("")}
                className="label-text text-text-dim hover:text-text transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <details className="hairline-t pt-14">
          <summary
            className="label-text text-text-muted hover:text-text cursor-pointer select-none"
            style={{ listStyle: "none" }}
          >
            Troubleshooting →
          </summary>
          <ul
            className="mono-sm text-text-muted mt-10 pl-16 flex flex-col gap-6"
            style={{ lineHeight: 1.6, listStyle: "disc" }}
          >
            <li>
              Scanner does nothing: most scanners need a factory-reset barcode
              (in the manual) to set HID Keyboard mode. Zebra and Honeywell call
              it the &ldquo;USB Keyboard&rdquo; or &ldquo;USB HID&rdquo; setup
              barcode.
            </li>
            <li>
              Scans type into a focused field instead: that&apos;s expected. The
              global listener intentionally yields to focused inputs. Click
              outside the field, then scan.
            </li>
            <li>
              Scans show as half-strings or garbled: increase the inter-key
              tolerance in <code>lib/useScanner.ts</code> (
              <code>fastKeyThreshold</code>) — your scanner is slower than the
              default 50ms.
            </li>
            <li>
              Wireless scanner disconnected: pair it again as a Bluetooth
              keyboard via the OS, not the browser.
            </li>
          </ul>
        </details>
      </article>
    </section>
  );
}

// ─── Printer ───────────────────────────────────────────────────────────

function PrinterSection() {
  const {
    supported,
    device,
    printing,
    label,
    error,
    connect,
    disconnect,
    print,
  } = usePrinter();

  const [testStatus, setTestStatus] = useState<
    "idle" | "printing" | "ok" | "err"
  >("idle");
  const [testErr, setTestErr] = useState<string | null>(null);

  const handleTestPrint = async () => {
    setTestStatus("printing");
    setTestErr(null);
    try {
      await print(
        productLabel({
          productName: "TEST PRINT",
          barcode: "0000000000",
          sku: "TEST-001",
          category: "Setup",
          location: "—",
        })
      );
      setTestStatus("ok");
      setTimeout(() => setTestStatus("idle"), 2400);
    } catch (err) {
      setTestStatus("err");
      setTestErr(err instanceof Error ? err.message : "Print failed");
    }
  };

  const statusColor = device
    ? "bg-[var(--success-dim)] text-[var(--success)]"
    : "bg-[var(--surface-2)] text-text-dim";

  return (
    <section aria-labelledby="printer">
      <SectionTitle
        eyebrow="Output"
        title="Label printer"
        action={
          <span className="label-text text-text-muted">Zebra ZPL · WebUSB</span>
        }
      />
      <article className="hairline bg-[var(--surface)] p-20 flex flex-col gap-16">
        <div className="flex items-start gap-14">
          <span
            className={`w-32 h-32 hairline-subtle flex items-center justify-center shrink-0 ${statusColor}`}
            aria-hidden
          >
            <Printer size={14} strokeWidth={1.5} />
          </span>
          <div className="flex-1 min-w-0">
            <p
              className="text-text truncate"
              style={{
                fontFamily: "var(--display)",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {!supported
                ? "WebUSB unavailable"
                : device
                ? label
                : "No printer paired"}
            </p>
            <p
              className="mono-sm text-text-muted mt-4"
              style={{ lineHeight: 1.55 }}
            >
              {!supported
                ? "This browser doesn't support WebUSB. Use Chrome, Edge, or Opera on a desktop machine."
                : device
                ? "Ready to print. Connection persists across page navigation; subsequent prints don't prompt."
                : "Pair a Zebra ZPL printer over USB. The browser will show its native picker — select your printer to grant this site permission."}
            </p>
          </div>
          {supported && (
            <div className="flex items-center gap-8 shrink-0">
              {device ? (
                <>
                  <CornerButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={connect}
                    ariaLabel="Re-pair printer"
                  >
                    <RefreshCw size={11} strokeWidth={1.5} />
                    Re-pair
                  </CornerButton>
                  <CornerButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={disconnect}
                  >
                    Forget
                  </CornerButton>
                </>
              ) : (
                <CornerButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={connect}
                >
                  <Plug size={11} strokeWidth={1.5} />
                  Pair printer
                </CornerButton>
              )}
            </div>
          )}
        </div>

        {device && (
          <div className="hairline-t pt-14 flex items-center gap-12 flex-wrap">
            <CornerButton
              type="button"
              variant="primary"
              size="sm"
              onClick={handleTestPrint}
              loading={testStatus === "printing" || printing}
              disabled={testStatus === "printing" || printing}
            >
              {testStatus === "ok" ? (
                <>
                  <Check size={11} strokeWidth={1.5} />
                  Test sent
                </>
              ) : (
                <>
                  <Printer size={11} strokeWidth={1.5} />
                  Print test label
                </>
              )}
            </CornerButton>
            <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
              Prints a 4×2 label reading <code>TEST PRINT</code> with a Code 128
              barcode of <code>0000000000</code>.
            </p>
          </div>
        )}

        {(testErr ?? error) && (
          <div
            className="hairline-subtle flex items-start gap-10 px-14 py-10"
            style={{
              background: "var(--danger-dim)",
              color: "var(--danger)",
            }}
            role="alert"
          >
            <AlertTriangle
              size={11}
              strokeWidth={1.5}
              className="shrink-0 mt-1"
            />
            <p
              className="mono-sm flex-1"
              style={{ lineHeight: 1.55, fontSize: 11 }}
            >
              {testErr ?? error}
            </p>
          </div>
        )}

        <details className="hairline-t pt-14">
          <summary
            className="label-text text-text-muted hover:text-text cursor-pointer select-none"
            style={{ listStyle: "none" }}
          >
            Troubleshooting →
          </summary>
          <ul
            className="mono-sm text-text-muted mt-10 pl-16 flex flex-col gap-6"
            style={{ lineHeight: 1.6, listStyle: "disc" }}
          >
            <li>
              <strong>Picker shows no printers:</strong> the printer isn&apos;t
              powered on, isn&apos;t connected, or the cable is data-only. Try a
              known-good USB cable and the USB port directly on the workstation
              (not a hub).
            </li>
            <li>
              <strong>
                &ldquo;Couldn&apos;t claim printer interface&rdquo;:
              </strong>{" "}
              another application is holding the USB connection. Close Zebra
              Setup Utilities, BarTender, or any other label-design app that
              auto-connects on launch, then re-pair.
            </li>
            <li>
              <strong>Label prints blank or partial:</strong> the printer
              isn&apos;t configured for ZPL. From the printer&apos;s menu or via
              Zebra Setup Utilities, set <em>Language</em> to <code>ZPL</code>{" "}
              (not <code>EPL</code> or <code>Line</code>).
            </li>
            <li>
              <strong>Wrong label size:</strong> our templates assume 203 DPI
              desktop printers (ZD420, ZD620, GK420). 300 DPI industrial
              printers need the templates rebuilt at 1.5× scale.
            </li>
            <li>
              <strong>Lost the pairing on a different browser:</strong> WebUSB
              permissions are per-origin, per-browser, and per-profile. Re-pair
              in the new browser.
            </li>
          </ul>
        </details>
      </article>
    </section>
  );
}
