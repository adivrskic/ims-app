"use client";

import { useEffect, useRef } from "react";

interface ScannerOptions {
  /** Called when a scan is recognized. Receives the barcode string. */
  onScan: (barcode: string) => void;

  /**
   * If true (default), keystrokes arriving while a text input, textarea,
   * or contenteditable element is focused are passed through to that
   * element instead of being intercepted as a scan. Set false to capture
   * scans even when the user is mid-form (rare — usually you want this on).
   */
  respectInputFocus?: boolean;

  /**
   * Max ms between keystrokes that still counts as part of the same
   * scanner burst. Scanners typically emit at 5–20ms; human typing is
   * 100ms+. Default 50 gives healthy margin without admitting human bursts.
   */
  fastKeyThreshold?: number;

  /**
   * Auto-flush the buffer this many ms after the last keystroke, even
   * without an explicit Enter terminator. Some scanners are configured
   * to omit Enter — this guarantees we still recognize their bursts.
   */
  flushDelay?: number;

  /** Minimum barcode length to fire the callback. Default 4. */
  minLength?: number;

  /**
   * Optional regex — when set, only barcodes matching this pattern fire
   * the callback. Useful for narrowing to a specific format (e.g.
   * `/^\d{12,14}$/` for UPC/EAN, `/^[A-Z0-9-]{8,}$/` for internal SKUs).
   */
  pattern?: RegExp;

  /** Temporarily disable the listener (e.g. when a modal expects raw input). */
  disabled?: boolean;
}

/**
 * Listens for hardware barcode scanner input on the window.
 *
 * Hardware scanners present as HID keyboards — they type the barcode at
 * high speed and (usually) end with Enter. This hook detects the
 * "high speed" part via inter-keystroke timing and the "Enter" part
 * via the explicit terminator, with a timeout fallback.
 *
 * Place once near the root of your client tree, typically via
 * `<ScannerProvider>` rather than calling this hook directly in pages.
 */
export function useScanner({
  onScan,
  respectInputFocus = true,
  fastKeyThreshold = 50,
  flushDelay = 80,
  minLength = 4,
  pattern,
  disabled = false,
}: ScannerOptions) {
  const bufferRef = useRef("");
  const lastTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (disabled) return;

    const flush = () => {
      const value = bufferRef.current;
      bufferRef.current = "";
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (value.length < minLength) return;
      if (pattern && !pattern.test(value)) return;
      onScan(value);
    };

    const handleKey = (e: KeyboardEvent) => {
      // When typing in a form field, let the field take the input.
      // Reset our buffer in case we had partial chars from a fake-out.
      if (respectInputFocus) {
        const target = e.target as HTMLElement | null;
        if (
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.isContentEditable
        ) {
          bufferRef.current = "";
          return;
        }
      }

      const now = performance.now();
      const interval = now - lastTimeRef.current;
      lastTimeRef.current = now;

      // Enter = explicit end of scan. Flush immediately.
      if (e.key === "Enter") {
        if (bufferRef.current.length >= minLength) {
          e.preventDefault();
          flush();
        }
        return;
      }

      // Only single printable characters belong in a barcode buffer.
      // Ignore modifiers, function keys, arrow keys, etc.
      if (e.key.length !== 1) return;

      // If the gap was too slow, the previous chars were probably human
      // typing. Reset and start fresh with this character.
      if (interval > fastKeyThreshold && bufferRef.current.length > 0) {
        bufferRef.current = "";
      }

      bufferRef.current += e.key;

      // Schedule an auto-flush in case the scanner doesn't send Enter.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, flushDelay);
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    onScan,
    respectInputFocus,
    fastKeyThreshold,
    flushDelay,
    minLength,
    pattern,
    disabled,
  ]);
}
