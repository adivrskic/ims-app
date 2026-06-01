"use client";

import { createContext, useContext } from "react";

/**
 * Bridge between the app-level scroll shell (PageShell, mounted once in the
 * (app) layout) and whichever PageHeader a page renders.
 *
 * The shell owns the masked internal scroll region and an overlay layer that
 * sits ABOVE the mask. A page's PageHeader portals its visible header into
 * `overlayEl` (so the fade never touches it), drives its manual-sticky
 * translate off `scrollEl`'s scrollTop, and calls `setSpacer` to reserve the
 * resting header band at the top of the scrolled content.
 *
 * When a PageHeader renders with no provider in scope (e.g. outside the app
 * shell), it falls back to its legacy window-sticky bar.
 */
export interface PageShellCtx {
  overlayEl: HTMLElement | null;
  scrollEl: HTMLElement | null;
  /** Reserve `px` of top padding in the scrolled content for the header band. */
  setSpacer: (px: number) => void;
}

export const PageShellContext = createContext<PageShellCtx | null>(null);

export function usePageShell(): PageShellCtx | null {
  return useContext(PageShellContext);
}
