"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

interface Options {
  open: boolean;
  onClose?: () => void;
  /** Focus this element first instead of the first tabbable one. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Lock body scroll while open (default true). */
  lockScroll?: boolean;
}

/**
 * Focus management for a `role="dialog"` surface: moves focus in on open,
 * keeps Tab inside, closes on Escape, restores focus to the opener on close
 * and locks the page scroll. Attach the returned ref to the dialog element.
 *
 *   const ref = useDialog({ open, onClose });
 *   <div ref={ref} role="dialog" aria-modal="true" aria-labelledby=…>
 */
export function useDialog({
  open,
  onClose,
  initialFocus,
  lockScroll = true,
}: Options) {
  const ref = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    openerRef.current = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement
      );

    const target = initialFocus?.current ?? focusables()[0] ?? el;
    if (target === el && !el.hasAttribute("tabindex")) {
      el.setAttribute("tabindex", "-1");
    }
    // Let the open animation/portal settle before moving focus.
    const raf = requestAnimationFrame(() =>
      target.focus({ preventScroll: true })
    );

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !el.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("keydown", onKey);
      if (lockScroll) document.body.style.overflow = prevOverflow;
      const opener = openerRef.current;
      if (opener && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open, initialFocus, lockScroll]);

  return ref;
}
