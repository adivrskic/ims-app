"use client";

import { useSyncExternalStore } from "react";
import { isSupported } from "./zebra";

const subscribe = () => () => {};

/**
 * `isSupported()` differs between the server (false) and Chrome (true), so
 * reading it during render produced a hydration mismatch on every page that
 * showed a printer control. This returns `false` for the server render AND
 * the first client render, then the real value.
 */
export function useWebUsbSupported(): boolean {
  return useSyncExternalStore(subscribe, isSupported, () => false);
}
