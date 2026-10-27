"use client";

import { useEffect, useRef } from "react";

/**
 * Wires a container of `.glow-card` elements with:
 *   1. Mouse-tracked radial gold gradient (--mouse-x / --mouse-y CSS vars)
 *   2. Per-card 3D tilt on hover (--tilt-x / --tilt-y, animated in CSS)
 *
 * Pure CSS-custom-property implementation — the tilt transform + easing live
 * in globals.css (.glow-card), so no animation library is bundled for a ±4°
 * hover effect.
 *
 * Events are DELEGATED to the container (pointerover / pointermove /
 * pointerout) and the card is resolved with `closest(".glow-card")`, so cards
 * that mount after the hook ran — a realtime refresh re-rendering the grid —
 * glow too. The old version bound to the cards present at mount only. Card
 * rects are cached when the pointer enters the container, not per move, and
 * the per-move work is throttled to one frame.
 *
 * Usage:
 *   const ref = useGlowCards();
 *   <div ref={ref} className="glow-cards">
 *     <article className="glow-card">
 *       <div className="glow-card-border" />
 *       <div className="glow-card-content">…</div>
 *     </article>
 *   </div>
 */
export function useGlowCards<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const cards = () =>
      Array.from(container.querySelectorAll<HTMLElement>(".glow-card"));
    const cardOf = (target: EventTarget | null) =>
      target instanceof Element
        ? (target.closest(".glow-card") as HTMLElement | null)
        : null;

    // Rect cache: refreshed when the pointer enters the container (layout can
    // shift between hovers) — not per move tick.
    let rects = new Map<HTMLElement, DOMRect>();
    const refreshRects = () => {
      rects = new Map(cards().map((c) => [c, c.getBoundingClientRect()]));
    };
    const rectFor = (card: HTMLElement) => {
      let rect = rects.get(card);
      if (!rect) {
        // A card added since the last refresh (realtime re-render).
        rect = card.getBoundingClientRect();
        rects.set(card, rect);
      }
      return rect;
    };

    let raf = 0;
    let lastX = 0;
    let lastY = 0;
    let hovered: HTMLElement | null = null;

    const paint = () => {
      raf = 0;
      for (const [card, rect] of rects) {
        if (!card.isConnected) continue;
        card.style.setProperty("--mouse-x", `${lastX - rect.left}px`);
        card.style.setProperty("--mouse-y", `${lastY - rect.top}px`);
      }
      if (hovered && !reduceMotion) {
        const rect = rectFor(hovered);
        const cx = (lastX - rect.left) / rect.width - 0.5;
        const cy = (lastY - rect.top) / rect.height - 0.5;
        hovered.style.setProperty("--tilt-y", `${(cx * 4).toFixed(2)}deg`);
        hovered.style.setProperty("--tilt-x", `${(cy * -4).toFixed(2)}deg`);
      }
    };

    const resetTilt = (card: HTMLElement) => {
      card.style.setProperty("--tilt-x", "0deg");
      card.style.setProperty("--tilt-y", "0deg");
    };

    const onEnter = () => refreshRects();
    const onMove = (e: PointerEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      const card = cardOf(e.target);
      if (card !== hovered) {
        if (hovered) resetTilt(hovered);
        hovered = card;
        if (card) rectFor(card);
      }
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onOut = (e: PointerEvent) => {
      // Leaving a card (or the container): drop the tilt unless the pointer
      // merely moved to a descendant of the same card.
      const from = cardOf(e.target);
      const to = cardOf(e.relatedTarget);
      if (from && from !== to) resetTilt(from);
      if (hovered && hovered !== to) hovered = null;
    };

    container.addEventListener("pointerenter", onEnter);
    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerout", onOut);

    return () => {
      container.removeEventListener("pointerenter", onEnter);
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerout", onOut);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return ref;
}
