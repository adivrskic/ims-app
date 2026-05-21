"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getPairedPrinter,
  isSupported,
  PrintError,
  printerLabel,
  printZpl,
  requestPrinter,
  type ZebraDevice,
} from "@/lib/print/zebra";

interface PrinterState {
  /** True iff WebUSB is available in this browser. */
  supported: boolean;
  /** Current paired printer, or null. */
  device: ZebraDevice | null;
  /** Human-readable name of the paired printer. */
  label: string | null;
  /** True between print start and finish. */
  printing: boolean;
  /** Most recent error message, cleared on next successful action. */
  error: string | null;
  /** Show the picker and pair a new printer. */
  connect: () => Promise<void>;
  /** Forget the current pairing (in-session only — browser still remembers it). */
  disconnect: () => void;
  /** Send raw ZPL. Throws on failure. */
  print: (zpl: string) => Promise<void>;
}

const PrinterContext = createContext<PrinterState | null>(null);

/**
 * Mount once near the root of the (app) layout. Tracks the user's
 * currently-paired Zebra printer for the session.
 *
 * On mount, looks for previously-paired devices and re-uses the first
 * one it finds (no picker shown). The first time on a new machine, the
 * user clicks Connect → browser picker → grant.
 */
export function PrinterProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<ZebraDevice | null>(null);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = isSupported();

  // Auto-reconnect to a previously-paired device on mount.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void (async () => {
      try {
        const found = await getPairedPrinter();
        if (!cancelled && found) setDevice(found);
      } catch {
        // Ignore — first-time users won't have a paired device.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      const picked = await requestPrinter();
      setDevice(picked);
    } catch (err) {
      if (err instanceof PrintError && err.code === "cancelled") {
        // User dismissed the picker — not a real error, don't surface.
        return;
      }
      const msg = err instanceof Error ? err.message : "Connection failed";
      setError(msg);
    }
  }, []);

  const disconnect = useCallback(() => {
    setDevice(null);
    setError(null);
  }, []);

  const print = useCallback(
    async (zpl: string) => {
      if (!device) {
        throw new PrintError("no-device", "No printer connected.");
      }
      setError(null);
      setPrinting(true);
      try {
        await printZpl(device, zpl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Print failed";
        setError(msg);
        throw err;
      } finally {
        setPrinting(false);
      }
    },
    [device]
  );

  const label = device ? printerLabel(device) : null;

  const value = useMemo<PrinterState>(
    () => ({
      supported,
      device,
      label,
      printing,
      error,
      connect,
      disconnect,
      print,
    }),
    [supported, device, label, printing, error, connect, disconnect, print]
  );

  return (
    <PrinterContext.Provider value={value}>{children}</PrinterContext.Provider>
  );
}

export function usePrinter(): PrinterState {
  const ctx = useContext(PrinterContext);
  if (!ctx) {
    throw new Error("usePrinter must be used inside <PrinterProvider>");
  }
  return ctx;
}
