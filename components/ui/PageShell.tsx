"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PageShellContext } from "./pageShellContext";
import styles from "./PageShell.module.css";

/**
 * App-level scroll shell. Mounted once in the (app) layout, around every
 * page's content. See PageShell.module.css + pageShellContext for the model.
 *
 * It self-measures to fill the viewport from its own top so the content
 * scrolls internally regardless of the surrounding flex layout.
 */
export function PageShell({ children }: { children: ReactNode }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number>();
  const [spacer, setSpacerState] = useState(0);

  // Fill from our own top down to the bottom of the viewport.
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setHeight(Math.max(240, Math.round(window.innerHeight - rect.top)));
    };
    measure();
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, []);

  const setSpacer = useCallback((px: number) => setSpacerState(px), []);

  const ctx = useMemo(
    () => ({ overlayEl, scrollEl, setSpacer }),
    [overlayEl, scrollEl, setSpacer]
  );

  return (
    <PageShellContext.Provider value={ctx}>
      <div
        ref={shellRef}
        className={styles.shell}
        style={height ? { height } : undefined}
      >
        <div ref={setScrollEl} className={styles.scroll}>
          <div
            className={`relative max-w-[1760px] w-full px-20 md:px-32 lg:px-40 pb-24 md:pb-40 ${styles.content}`}
            style={{ paddingTop: spacer }}
          >
            {children}
          </div>
        </div>
        <div className={`${styles.overlay}`} aria-hidden={false}>
          <div
            ref={setOverlayEl}
            className={`max-w-[1760px] w-full px-20 md:px-32 lg:px-40 ${styles.overlayInner}`}
          />
        </div>
      </div>
    </PageShellContext.Provider>
  );
}
