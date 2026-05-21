"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useScanner } from "@/lib/useScanner";

export interface ScanEvent {
  barcode: string;
  at: number;
}

interface ScannerState {
  /** Most recent scan, or null if none yet this session. */
  lastScan: ScanEvent | null;
  /** Globally enabled? false suppresses all scan capture. */
  enabled: boolean;
  setEnabled: (next: boolean) => void;
}

const ScannerContext = createContext<ScannerState | null>(null);

const EVENT_NAME = "Nautilus-scan";

/**
 * Wraps the app with a single global barcode-scanner listener.
 *
 * Place near the root of the (app) layout so every authenticated page
 * shares one capture surface (multiple listeners would each fire on the
 * same keystroke burst — bad). Components that want to react to scans
 * call `useLastScan()` and watch for changes.
 *
 * Also emits a `window` CustomEvent named "Nautilus-scan" with the
 * barcode in `event.detail`, for code paths that can't easily subscribe
 * via React (e.g. server-action-driven forms or third-party scripts).
 */
export function ScannerProvider({ children }: { children: ReactNode }) {
  const [lastScan, setLastScan] = useState<ScanEvent | null>(null);
  const [enabled, setEnabled] = useState(true);

  const handleScan = useCallback((barcode: string) => {
    const at = Date.now();
    setLastScan({ barcode, at });
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(EVENT_NAME, { detail: { barcode, at } })
      );
    }
  }, []);

  useScanner({
    onScan: handleScan,
    disabled: !enabled,
  });

  const value = useMemo(
    () => ({ lastScan, enabled, setEnabled }),
    [lastScan, enabled]
  );

  return (
    <ScannerContext.Provider value={value}>{children}</ScannerContext.Provider>
  );
}

/**
 * Read the last scan event (or null) from any client component nested
 * under <ScannerProvider>. Watch its identity in a useEffect to react.
 */
export function useLastScan(): ScanEvent | null {
  const ctx = useContext(ScannerContext);
  if (!ctx) {
    throw new Error("useLastScan must be used inside <ScannerProvider>");
  }
  return ctx.lastScan;
}

/**
 * Toggle the global scanner on/off. Useful for modals that need to
 * capture barcode input directly into their own input field (so the
 * input gets the chars instead of the global hook).
 */
export function useScannerEnabled(): [boolean, (next: boolean) => void] {
  const ctx = useContext(ScannerContext);
  if (!ctx) {
    throw new Error("useScannerEnabled must be used inside <ScannerProvider>");
  }
  return [ctx.enabled, ctx.setEnabled];
}
