"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ScanLine, Printer } from "lucide-react";
import {
  useLastScan,
  useScannerEnabled,
} from "@/components/scanner/ScannerProvider";
import { usePrinter } from "@/components/print/PrinterProvider";

interface Props {
  /** Inherits collapse state from SideRail. */
  collapsed: boolean;
}

/**
 * Sidebar device bar — Scan + Print, side by side as bigger tiles.
 *
 * Expanded: 50/50 grid; each tile shows icon, label, status dot, and a
 * compact status word ("Ready", "Off", last-scan barcode, printer name, etc).
 *
 * Collapsed: two stacked icon-only buttons that keep the toggles within reach.
 *
 * Click behavior:
 *   - Scan tile: toggle the global scanner on/off (matches the original
 *     ScanIndicator pattern). The /scan page still exists for full UX.
 *   - Print tile: navigates to /settings/devices when paired; opens the
 *     USB picker when not yet paired.
 */
export function SidebarDeviceBar({ collapsed }: Props) {
  const [scanEnabled, setScanEnabled] = useScannerEnabled();
  const lastScan = useLastScan();
  const {
    supported: printSupported,
    device,
    label,
    printing,
    connect,
  } = usePrinter();

  // Flash the scan tile briefly when a new scan lands.
  const [scanFlash, setScanFlash] = useState(false);
  useEffect(() => {
    if (!lastScan) return;
    setScanFlash(true);
    const id = setTimeout(() => setScanFlash(false), 1400);
    return () => clearTimeout(id);
  }, [lastScan]);

  if (collapsed) {
    return (
      <div className="flex flex-col gap-6">
        <button
          type="button"
          onClick={() => setScanEnabled(!scanEnabled)}
          className={`hairline-subtle h-32 flex items-center justify-center w-full transition-colors ${
            scanEnabled ? "hover:border-[var(--border-hover)]" : "opacity-55"
          }`}
          aria-label={
            scanEnabled
              ? "Scanner ready — click to pause"
              : "Scanner paused — click to resume"
          }
          title={scanEnabled ? "Scanner ready" : "Scanner off"}
        >
          <ScanLine
            size={12}
            strokeWidth={1.5}
            className={
              scanFlash
                ? "text-[var(--accent)]"
                : scanEnabled
                ? "text-text-secondary"
                : "text-text-dim"
            }
          />
        </button>
        {printSupported && device ? (
          <Link
            href="/settings/devices"
            className="hairline-subtle h-32 flex items-center justify-center w-full hover:border-[var(--border-hover)] transition-colors"
            aria-label={`Printer ${label} — open device settings`}
            title={label ?? "Printer"}
          >
            <Printer
              size={12}
              strokeWidth={1.5}
              className={
                printing ? "text-[var(--accent)]" : "text-text-secondary"
              }
            />
          </Link>
        ) : (
          <button
            type="button"
            onClick={printSupported ? connect : undefined}
            disabled={!printSupported}
            className={`hairline-subtle h-32 flex items-center justify-center w-full transition-colors ${
              printSupported
                ? "hover:border-[var(--border-hover)]"
                : "opacity-55 cursor-not-allowed"
            }`}
            aria-label={
              !printSupported ? "Printing unavailable" : "Pair printer"
            }
            title={
              !printSupported ? "Printing needs Chrome/Edge" : "Pair printer"
            }
          >
            <Printer size={12} strokeWidth={1.5} className="text-text-dim" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      <ScanTile
        enabled={scanEnabled}
        flash={scanFlash}
        lastBarcode={lastScan?.barcode ?? null}
        onToggle={() => setScanEnabled(!scanEnabled)}
      />
      <PrintTile
        supported={printSupported}
        connected={!!device}
        label={label}
        printing={printing}
        onConnect={connect}
      />
    </div>
  );
}

// ─── Tile sub-components ───────────────────────────────────────────────

interface ScanTileProps {
  enabled: boolean;
  flash: boolean;
  lastBarcode: string | null;
  onToggle: () => void;
}

function ScanTile({ enabled, flash, lastBarcode, onToggle }: ScanTileProps) {
  const iconClass = flash
    ? "text-[var(--accent)]"
    : enabled
    ? "text-text"
    : "text-text-dim";
  const dotClass = flash ? "dot-live" : enabled ? "dot-online" : "dot-offline";
  const statusText =
    flash && lastBarcode
      ? truncate(lastBarcode, 10)
      : enabled
      ? "Ready"
      : "Off";

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`hairline-subtle flex flex-col items-center justify-center gap-6 px-6 py-12 transition-colors ${
        enabled ? "hover:border-[var(--border-hover)]" : "opacity-65"
      }`}
      aria-label={
        enabled
          ? "Scanner ready — click to pause"
          : "Scanner paused — click to resume"
      }
    >
      <ScanLine size={16} strokeWidth={1.5} className={iconClass} />
      <span
        className="label-text"
        style={{ fontSize: 9, color: flash ? "var(--accent)" : undefined }}
      >
        {flash ? "SCANNED" : "SCAN"}
      </span>
      <span className="flex items-center gap-4">
        <span className={`dot ${dotClass}`} aria-hidden />
        <span
          className="text-text-dim truncate"
          style={{
            fontFamily: "var(--mono)",
            fontSize: 9,
            maxWidth: 80,
          }}
        >
          {statusText}
        </span>
      </span>
    </button>
  );
}

interface PrintTileProps {
  supported: boolean;
  connected: boolean;
  label: string | null;
  printing: boolean;
  onConnect: () => void;
}

function PrintTile({
  supported,
  connected,
  label,
  printing,
  onConnect,
}: PrintTileProps) {
  if (!supported) {
    return (
      <span
        className="hairline-subtle flex flex-col items-center justify-center gap-6 px-6 py-12 opacity-55 cursor-not-allowed"
        title="Printing needs Chrome / Edge"
      >
        <Printer size={16} strokeWidth={1.5} className="text-text-dim" />
        <span className="label-text text-text-dim" style={{ fontSize: 9 }}>
          PRINT
        </span>
        <span className="flex items-center gap-4">
          <span className="dot dot-offline" aria-hidden />
          <span
            className="text-text-dim"
            style={{ fontFamily: "var(--mono)", fontSize: 9 }}
          >
            N/A
          </span>
        </span>
      </span>
    );
  }

  if (!connected) {
    return (
      <button
        type="button"
        onClick={onConnect}
        className="hairline-subtle flex flex-col items-center justify-center gap-6 px-6 py-12 hover:border-[var(--border-hover)] transition-colors"
        aria-label="Pair printer"
      >
        <Printer size={16} strokeWidth={1.5} className="text-text-dim" />
        <span className="label-text text-text-dim" style={{ fontSize: 9 }}>
          PRINT
        </span>
        <span className="flex items-center gap-4">
          <span className="dot dot-offline" aria-hidden />
          <span
            className="text-text-dim"
            style={{ fontFamily: "var(--mono)", fontSize: 9 }}
          >
            Pair
          </span>
        </span>
      </button>
    );
  }

  return (
    <Link
      href="/settings/devices"
      className="hairline-subtle flex flex-col items-center justify-center gap-6 px-6 py-12 hover:border-[var(--border-hover)] transition-colors"
      aria-label={`Printer ${label} — open device settings`}
      title={label ?? "Printer"}
    >
      <Printer
        size={16}
        strokeWidth={1.5}
        className={printing ? "text-[var(--accent)]" : "text-text"}
      />
      <span
        className="label-text"
        style={{
          fontSize: 9,
          color: printing ? "var(--accent)" : undefined,
        }}
      >
        {printing ? "PRINTING" : "PRINT"}
      </span>
      <span className="flex items-center gap-4">
        <span
          className={`dot ${printing ? "dot-live" : "dot-online"}`}
          aria-hidden
        />
        <span
          className="text-text-dim truncate"
          style={{
            fontFamily: "var(--mono)",
            fontSize: 9,
            maxWidth: 80,
          }}
        >
          {label ?? "Ready"}
        </span>
      </span>
    </Link>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
