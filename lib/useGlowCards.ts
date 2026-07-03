"use client";

import { useEffect, useRef } from "react";

/**
 * Wires a container of `.glow-card` elements with:
 *   1. Mouse-tracked radial gold gradient (--mouse-x / --mouse-y CSS vars)
 *   2. Per-card 3D tilt on hover (--tilt-x / --tilt-y, animated in CSS)
 *
 * Pure CSS-custom-property implementation — the tilt transform + easing live
 * in globals.css (.glow-card), so no animation library is bundled for a ±4°
 * hover effect. Card rects are cached per pointerenter instead of calling
 * getBoundingClientRect per card per mousemove.
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

    const cards = Array.from(
      container.querySelectorAll<HTMLElement>(".glow-card")
    );
    if (!cards.length) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // Rect cache: refreshed when the pointer enters the container (layout can
    // shift between hovers) — not per mousemove tick.
    let rects = new Map<HTMLElement, DOMRect>();
    const refreshRects = () => {
      rects = new Map(cards.map((c) => [c, c.getBoundingClientRect()]));
    };

    const handleContainerEnter = () => refreshRects();
    const handleContainerMove = (e: MouseEvent) => {
      for (const card of cards) {
        const rect = rects.get(card);
        if (!rect) continue;
        card.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
        card.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
      }
    };
    container.addEventListener("mouseenter", handleContainerEnter);
    container.addEventListener("mousemove", handleContainerMove);

    const cleanups: Array<() => void> = [];
    if (!reduceMotion) {
      cards.forEach((card) => {
        const onMove = (e: MouseEvent) => {
          const rect = rects.get(card);
          if (!rect) return;
          const cx = (e.clientX - rect.left) / rect.width - 0.5;
          const cy = (e.clientY - rect.top) / rect.height - 0.5;
          card.style.setProperty("--tilt-y", `${(cx * 4).toFixed(2)}deg`);
          card.style.setProperty("--tilt-x", `${(cy * -4).toFixed(2)}deg`);
        };
        const onLeave = () => {
          card.style.setProperty("--tilt-x", "0deg");
          card.style.setProperty("--tilt-y", "0deg");
        };
        card.addEventListener("mousemove", onMove);
        card.addEventListener("mouseleave", onLeave);
        cleanups.push(() => {
          card.removeEventListener("mousemove", onMove);
          card.removeEventListener("mouseleave", onLeave);
        });
      });
    }

    return () => {
      container.removeEventListener("mouseenter", handleContainerEnter);
      container.removeEventListener("mousemove", handleContainerMove);
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return ref;
}
