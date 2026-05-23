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
  /**
   * Page content. When provided, PageHeader renders in "shell" mode: the
   * (transparent) header sits as the static top of a flex column and the
   * content scrolls in its own region beneath it. The content region clips
   * and fades at the top, so page content never renders under the header —
   * and because the header lives OUTSIDE the scroll region, collapsing it
   * can't feed back into the scroll position (no minimize oscillation).
   *
   * When omitted, PageHeader is the legacy sticky bar that pins to the
   * window-scroll top.
   */
  children?: ReactNode;
  /** Optional class for the inner content column (defaults to a flex column
   *  with gap-32). Pass this to override spacing per page. */
  contentClassName?: string;
}

/** The visible header row — shared by both modes. */
function HeaderInner({
  eyebrow,
  title,
  description,
  actions,
  meta,
  live,
}: Pick<
  Props,
  "eyebrow" | "title" | "description" | "actions" | "meta" | "live"
>) {
  const hasRight = (meta && meta.length > 0) || actions;
  return (
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
  );
}

export function PageHeader(props: Props) {
  return props.children !== undefined ? (
    <PageHeaderShell {...props} />
  ) : (
    <PageHeaderBar {...props} />
  );
}

/* ── Shell mode: transparent header + clipped/faded content region ─────── */

function PageHeaderShell({ children, contentClassName, ...header }: Props) {
  const [stuck, setStuck] = useState(false);
  const [height, setHeight] = useState<number>();
  const shellRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Size the shell to fill from its own top down to the bottom of the
  // viewport (minus the parent's bottom padding), so the content scrolls
  // INSIDE .scroll and the header stays pinned + compacts — without relying
  // on the parent layout to provide a bounded height.
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const parent = el.parentElement;
      const pb = parent
        ? parseFloat(getComputedStyle(parent).paddingBottom || "0") || 0
        : 0;
      setHeight(Math.max(240, Math.round(window.innerHeight - rect.top - pb)));
    };
    measure();
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Compact the header once the content region has scrolled. Hysteresis
  // only — no room-guard needed: the header lives outside .scroll, so
  // collapsing it never changes the scrolled content's height (which is
  // exactly why the old window-scroll oscillation can't happen here).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      const y = el.scrollTop;
      setStuck((prev) => (prev ? y > 8 : y > 16));
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(check);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    check();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={shellRef}
      className={styles.shell}
      style={height ? { height } : undefined}
    >
      <header className={styles.header} data-stuck={stuck}>
        <HeaderInner {...header} />
      </header>
      <div ref={scrollRef} className={styles.scroll}>
        <div className={contentClassName ?? styles.scrollInner}>{children}</div>
      </div>
    </div>
  );
}

/* ── Legacy mode: sticky bar pinned to the window-scroll top ───────────── */

function PageHeaderBar(header: Props) {
  const [stuck, setStuck] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    // Must exceed the header's collapse delta with margin to spare, so
    // compacting can't clamp the window scroll back above the trigger
    // (the cause of the rapid expand/collapse flip-flop on short pages).
    const MIN_OVERFLOW = 220;

    let raf = 0;
    const check = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      setStuck((prev) => {
        if (prev) return rect.top <= 8; // hysteresis dead zone
        const trigger = rect.top + window.scrollY;
        const maxScroll =
          document.documentElement.scrollHeight - window.innerHeight;
        return rect.top <= 0 && maxScroll - trigger > MIN_OVERFLOW;
      });
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(check);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    check();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header
      ref={headerRef}
      className={`${styles.header} ${styles.bar}`}
      data-stuck={stuck}
    >
      <HeaderInner {...header} />
    </header>
  );
}
