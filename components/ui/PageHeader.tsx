"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

interface MetaItem {
  label: string;
  value: ReactNode;
  status?: "live" | "online" | "offline" | "alert";
}

interface Props {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: MetaItem[];
  accent?: string;
  numeral?: string;
  /** When true, renders a small pulsing accent dot next to the title
   *  to signal that the page auto-refreshes via realtime. */
  live?: boolean;
}

/**
 * Sticky page header that compacts once it pins to the viewport top.
 *
 * Detection: passive scroll listener + rAF throttle reads the header's
 * getBoundingClientRect().top each frame. When the sticky element is in
 * normal flow above the viewport top, sticky pins it and rect.top reads 0;
 * when scrolled away from the top, rect.top > 0. Simple, robust, and
 * doesn't depend on sentinel/IntersectionObserver behavior inside a sticky
 * positioning context (which has timing quirks across browsers).
 *
 * Shrink behavior (stuck state):
 *   - eyebrow + description collapse out (max-height + opacity)
 *   - title shrinks 24 → 18 and truncates
 *   - meta + actions STAY visible (per the design — these are useful at
 *     any scroll depth)
 *   - padding-top expands so the title has breathing room from the top edge
 *   - bottom border darkens (--border-subtle → --border) for stronger
 *     separation from the content that scrolls underneath
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  live = false,
}: Props) {
  const [stuck, setStuck] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    let raf = 0;
    const check = () => {
      raf = 0;
      // rect.top is 0 (or negative due to subpixel rounding) when the
      // sticky element has pinned to viewport top. Anything > 0 means we
      // haven't scrolled past it yet.
      const rect = el.getBoundingClientRect();
      setStuck(rect.top <= 0);
    };

    const onScroll = () => {
      // Coalesce scroll events to once per animation frame.
      if (raf) return;
      raf = requestAnimationFrame(check);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    check(); // initial state

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const hasRight = (meta && meta.length > 0) || actions;

  return (
    <header ref={headerRef} className={styles.header} data-stuck={stuck}>
      <div className={styles.row}>
        <div className={styles.titleArea}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h1 className={styles.title}>
            {title}
            {live && (
              <span
                className="dot dot-live ml-10 inline-block align-middle"
                aria-label="Live — auto-refreshing"
                title="Live — auto-refreshing"
                style={{ marginLeft: 10 }}
              />
            )}
          </h1>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {hasRight && (
          <div className={styles.rightCluster}>
            {meta && meta.length > 0 && (
              <dl className={styles.meta}>
                {meta.map((m, i) => (
                  <div key={i} className={styles.metaItem}>
                    {m.status && (
                      <span className={`dot dot-${m.status}`} aria-hidden />
                    )}
                    <dt className={styles.metaLabel}>{m.label}</dt>
                    <dd className={styles.metaValue}>{m.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {actions && <div className={styles.actions}>{actions}</div>}
          </div>
        )}
      </div>
    </header>
  );
}
