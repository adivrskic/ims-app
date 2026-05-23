"use client";

import Link from "next/link";
import { Printer, ScanLine } from "lucide-react";
import { usePrinter } from "@/components/print/PrinterProvider";

interface Props {
  /** Inherits collapse state from SideRail. */
  collapsed: boolean;
}

/**
 * Sidebar device bar — Scan + Print, side by side as bigger tiles.
 *
 * Expanded: 50/50 grid; each tile shows icon + label (+ Print status).
 * Collapsed: two stacked icon-only buttons.
 *
 * Click behavior:
 *   - Scan tile: navigates to /scan (the scan workstation).
 *   - Print tile: navigates to /settings/devices when paired; opens the
 *     USB picker when not yet paired.
 *
 * Note: the Scan tile no longer surfaces scanner "ready" status. A
 * keyboard-wedge HID scanner is indistinguishable from a keyboard to the
 * browser, so connection can't be detected — the tile is just a shortcut
 * into the scan page. Global scan capture still runs via ScannerProvider;
 * its on/off toggle lives on /scan and /settings/devices.
 */
export function SidebarDeviceBar({ collapsed }: Props) {
  const {
    supported: printSupported,
    device,
    label,
    printing,
    connect,
  } = usePrinter();

  if (collapsed) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href="/scan"
          className="hairline-subtle h-32 flex items-center justify-center w-full hover:border-[var(--border-hover)] transition-colors"
          aria-label="Open scan workstation"
          title="Scan"
        >
          <ScanLine
            size={12}
            strokeWidth={1.5}
            className="text-text-secondary"
          />
        </Link>
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
      <ScanTile />
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

function ScanTile() {
  return (
    <Link
      href="/scan"
      className="hairline-subtle flex flex-col items-center justify-center gap-6 px-6 py-12 hover:border-[var(--border-hover)] transition-colors"
      aria-label="Open scan workstation"
    >
      <ScanLine size={16} strokeWidth={1.5} className="text-text" />
      <span className="label-text" style={{ fontSize: 9 }}>
        SCAN
      </span>
    </Link>
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