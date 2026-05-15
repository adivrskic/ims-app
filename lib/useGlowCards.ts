"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * Wires a container of `.glow-card` elements with:
 *   1. Mouse-tracked radial gold gradient (--mouse-x / --mouse-y CSS vars)
 *   2. Per-card 3D tilt on hover
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

    const handleContainerMove = (e: MouseEvent) => {
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
        card.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
      });
    };
    container.addEventListener("mousemove", handleContainerMove);

    const cleanups: Array<() => void> = [];
    cards.forEach((card) => {
      gsap.set(card, { transformPerspective: 800 });

      const onMove = (e: MouseEvent) => {
        const rect = card.getBoundingClientRect();
        const cx = (e.clientX - rect.left) / rect.width - 0.5;
        const cy = (e.clientY - rect.top) / rect.height - 0.5;
        gsap.to(card, {
          rotationY: cx * 4,
          rotationX: cy * -4,
          duration: 0.3,
          ease: "power2.out",
          overwrite: "auto",
        });
      };
      const onLeave = () => {
        gsap.to(card, {
          rotationX: 0,
          rotationY: 0,
          duration: 0.5,
          ease: "power3.out",
          overwrite: "auto",
        });
      };
      card.addEventListener("mousemove", onMove);
      card.addEventListener("mouseleave", onLeave);
      cleanups.push(() => {
        card.removeEventListener("mousemove", onMove);
        card.removeEventListener("mouseleave", onLeave);
      });
    });

    return () => {
      container.removeEventListener("mousemove", handleContainerMove);
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return ref;
}
