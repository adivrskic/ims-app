"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";
import { usePageShell } from "./pageShellContext";

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
  const shell = usePageShell();
  // Inside the app shell (the common case), portal the header into the shared
  // overlay so every page behaves like Overview. Outside it, fall back to the
  // legacy window-sticky bar.
  if (shell) return <PageHeaderPortal shell={shell} {...props} />;
  return <PageHeaderBar {...props} />;
}

/* ── Centralized shell mode: header portaled into the app-level overlay ─────
      (PageShell). Content scrolls inside the shared masked scroller; the
      header is moved by a JS-driven translate and never touched by the fade. */

// Extra gap below the resting header before it pins. Small, so the resting
// title sits near the top. No effect on the pinned position.
const REST_GAP = 8;
// Where the pinned (compact) header rests, measured from the top of the
// content area. 0 pins it flush to the top; the compact header is then a
// fixed band (see .overlayHeader[data-stuck] in the CSS) whose centered
// content lines up with the sidebar "Nautilus" logo.
const STUCK_OFFSET = 0;

function PageHeaderPortal({
  shell,
  children,
  contentClassName,
  ...header
}: Props & { shell: NonNullable<ReturnType<typeof usePageShell>> }) {
  const [stuck, setStuck] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const maxHRef = useRef(0);
  const { scrollEl, overlayEl, setSpacer } = shell;

  // Reserve the resting header band (max height seen + offsets) at the top of
  // the scrolled content, so page content starts just below the header.
  useEffect(() => {
    const head = headerRef.current;
    if (!head) return;
    const ro = new ResizeObserver(() => {
      const h = head.offsetHeight;
      if (h > maxHRef.current) {
        maxHRef.current = h;
        setSpacer(h + STUCK_OFFSET + REST_GAP);
      }
    });
    ro.observe(head);
    return () => {
      ro.disconnect();
      setSpacer(0);
      maxHRef.current = 0;
    };
  }, [setSpacer, overlayEl]);

  // Manual sticky: translate the header down to its resting offset, slide it up
  // as the content scrolls, clamp at STUCK_OFFSET, and toggle the compact state.
  useEffect(() => {
    if (!scrollEl || !overlayEl) return;
    const head = headerRef.current;
    if (!head) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const y = scrollEl.scrollTop;
      head.style.transform = `translateY(${
        STUCK_OFFSET + Math.max(0, REST_GAP - y)
      }px)`;
      setStuck((prev) => (prev ? y > REST_GAP - 8 : y >= REST_GAP));
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(apply);
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    apply();
    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scrollEl, overlayEl]);

  const headerEl = (
    <header
      ref={headerRef}
      className={`${styles.header} ${styles.overlayHeader}`}
      data-stuck={stuck}
    >
      <HeaderInner {...header} />
    </header>
  );

  return (
    <>
      {children !== undefined && (
        <div className={contentClassName ?? styles.scrollInner}>{children}</div>
      )}
      {overlayEl ? createPortal(headerEl, overlayEl) : null}
    </>
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
