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
   * Page content. When provided, PageHeader renders in "shell" mode:
   *
   *   - Content scrolls inside an internal region whose scrollbar is hidden
   *     (no x/y scrollbars around the content) and whose top edge carries a
   *     fade mask, so content turns transparent — revealing the real page
   *     background — before it would reach the header.
   *   - The header is a TRANSPARENT overlay rendered outside that masked
   *     region, so it never picks up a background and the fade never touches
   *     it. It scrolls up with the page and pins at the top (manual sticky).
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

/* ── Shell mode: transparent overlay header over a masked, scrollbar-hidden
      content region. ─────────────────────────────────────────────────────── */

// How far below the top the header rests before it scrolls up and pins. Tune
// this to taste — it's the "scroll up N px, then stick" distance.
const REST_GAP = 24;

function PageHeaderShell({ children, contentClassName, ...header }: Props) {
  const [stuck, setStuck] = useState(false);
  const [height, setHeight] = useState<number>();
  const outerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const maxHRef = useRef(0);

  // Fill from our own top down to the bottom of the viewport, so content
  // scrolls INSIDE .scroll. The internal scroll is what lets the top fade
  // mask stay anchored to the top edge and lets us hide the scrollbar.
  useEffect(() => {
    const el = outerRef.current;
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

  // Reserve the header's (expanded) height + rest gap as a spacer at the top of
  // the scroll content, so content starts just below the resting header. Track
  // the max height seen so compaction never shrinks the spacer (which would
  // make content jump).
  useEffect(() => {
    const head = headerRef.current;
    const outer = outerRef.current;
    if (!head || !outer) return;
    const ro = new ResizeObserver(() => {
      const h = head.offsetHeight;
      if (h > maxHRef.current) {
        maxHRef.current = h;
        outer.style.setProperty("--ph-spacer", `${h + REST_GAP}px`);
      }
    });
    ro.observe(head);
    return () => ro.disconnect();
  }, []);

  // Manual sticky: the header overlay lives OUTSIDE the masked scroller (so the
  // fade never touches it — hence it needs no background of its own). Translate
  // it up as the content scrolls, clamp it at the top, and toggle the compact
  // state once it pins.
  useEffect(() => {
    const scroll = scrollRef.current;
    const head = headerRef.current;
    if (!scroll || !head) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const y = scroll.scrollTop;
      head.style.transform = `translateY(${Math.max(0, REST_GAP - y)}px)`;
      setStuck((prev) => (prev ? y > REST_GAP - 8 : y >= REST_GAP));
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(apply);
    };
    scroll.addEventListener("scroll", onScroll, { passive: true });
    apply();
    return () => {
      scroll.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={outerRef}
      className={styles.shell}
      style={height ? { height } : undefined}
    >
      <div ref={scrollRef} className={styles.scroll}>
        <div className={styles.headerSpacer} aria-hidden />
        <div className={contentClassName ?? styles.scrollInner}>{children}</div>
      </div>
      <header
        ref={headerRef}
        className={`${styles.header} ${styles.shellHeader}`}
        data-stuck={stuck}
      >
        <HeaderInner {...header} />
      </header>
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
