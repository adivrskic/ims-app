"use client";

import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * True when the viewport is mobile-sized. Updates live on resize so the
 * builder swaps layouts cleanly when a window crosses the threshold.
 *
 * SSR-safe: returns false until mounted, then corrects.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}
