"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface Props {
  /**
   * Hard-refresh interval in seconds as a backstop to realtime.
   * Set to 0 to disable. Default 60.
   */
  refreshSec?: number;
  /**
   * Request a screen wake-lock so the display doesn't sleep.
   * Default true. Silently no-ops on browsers without the API.
   */
  wakeLock?: boolean;
  children: React.ReactNode;
}

/**
 * Mount once at the top of a kiosk-mode page.
 *
 * Responsibilities:
 *   - Polls the route on a timer (router.refresh) as a backstop to
 *     the realtime channel — covers websocket drops on flaky displays
 *   - Requests a Screen Wake Lock and reacquires it on visibility change
 *   - Adds a data-kiosk="true" attribute to <html> so CSS can target it
 *
 * Renders its children unchanged.
 */
export function KioskShell({
  refreshSec = 60,
  wakeLock = true,
  children,
}: Props) {
  const router = useRouter();
  const wakeRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-kiosk", "true");
    return () => {
      document.documentElement.removeAttribute("data-kiosk");
    };
  }, []);

  useEffect(() => {
    if (refreshSec <= 0) return;
    const id = setInterval(() => router.refresh(), refreshSec * 1000);
    return () => clearInterval(id);
  }, [refreshSec, router]);

  useEffect(() => {
    if (!wakeLock) return;
    if (typeof navigator === "undefined") return;
    if (!("wakeLock" in navigator)) return;

    let cancelled = false;

    const acquire = async () => {
      try {
        const sentinel = await (
          navigator as Navigator & {
            wakeLock: { request: (t: "screen") => Promise<WakeLockSentinel> };
          }
        ).wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        wakeRef.current = sentinel;
      } catch {
        // Permission denied or unsupported — silently continue.
      }
    };

    void acquire();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !wakeRef.current) {
        void acquire();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const ref = wakeRef.current;
      wakeRef.current = null;
      if (ref) void ref.release();
    };
  }, [wakeLock]);

  return <>{children}</>;
}

/**
 * Type stub for browsers without WakeLockSentinel in lib.dom.
 */
type WakeLockSentinel = {
  release: () => Promise<void>;
};
