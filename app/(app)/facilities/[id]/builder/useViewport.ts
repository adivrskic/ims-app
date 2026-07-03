"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export interface Viewport {
  /** Multiplicative zoom. 1 = 1 floor unit per pixel (before container fit). */
  zoom: number;
  /** Container-relative screen pixel offset, applied before scale. */
  panX: number;
  panY: number;
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 6;
const ZOOM_STEP = 1.2;

/** Trailing debounce before a gesture's viewport is committed to React. */
const COMMIT_DEBOUNCE_MS = 150;
/** Max-wait during a sustained gesture so rulers/strokes still track. */
const COMMIT_MAX_WAIT_MS = 200;

const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

export interface ViewportApi {
  /**
   * Committed viewport — React state. During a pan/zoom gesture this lags
   * the live value (it commits on a short debounce / at gesture end), so
   * use it for rendering, not inside event handlers.
   */
  viewport: Viewport;
  /**
   * Live viewport — always current. Read this inside event handlers
   * (wheel/pointer) so listeners don't need the committed state in their
   * dependency arrays and can be mounted once.
   */
  viewportRef: RefObject<Viewport>;
  /**
   * Attach to the scene <g>. The hook applies the pan/zoom transform to it
   * imperatively inside requestAnimationFrame during gestures, so the React
   * tree doesn't re-render per pointermove/wheel tick. Do NOT also set a
   * `transform` attribute on that <g> in JSX.
   */
  sceneRef: RefObject<SVGGElement | null>;
  /** Zoom to an absolute level while anchoring (screenX, screenY). */
  zoomAt: (nextZoom: number, screenX: number, screenY: number) => void;
  zoomInAt: (screenX: number, screenY: number) => void;
  zoomOutAt: (screenX: number, screenY: number) => void;
  resetZoom: () => void;
  fitToContainer: (
    containerWidth: number,
    containerHeight: number,
    contentWidth: number,
    contentHeight: number,
    padding?: number
  ) => void;
  panBy: (dx: number, dy: number) => void;
  /** Flush the live viewport into React state now (call at gesture end). */
  commitViewport: () => void;
  /** True while the spacebar is held outside form fields — switches the canvas into pan mode. */
  spaceHeld: boolean;
}

/**
 * Viewport state for the floor canvas.
 *
 * Pan is stored in container-relative screen pixels. Zoom is multiplicative.
 * To keep the cursor anchored when zooming (the only feel that ever feels
 * right), use `zoomAt(nextZoom, sx, sy)` where (sx, sy) are container-
 * relative coordinates.
 *
 * Perf model: the authoritative value lives in `viewportRef`. Gesture
 * mutations (panBy/zoomAt from pointermove/wheel/pinch) update the ref and
 * apply the transform to `sceneRef` imperatively in rAF; React state is
 * only committed on a debounce (~150ms) with a max-wait throttle, and can
 * be flushed eagerly via `commitViewport()` on pointerup. Programmatic
 * changes (fit-to-view, reset, toolbar zoom buttons) commit immediately.
 */
export function useViewport(
  initial: Viewport = { zoom: 1, panX: 0, panY: 0 }
): ViewportApi {
  const [viewport, setViewport] = useState<Viewport>(initial);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const viewportRef = useRef<Viewport>(initial);
  const sceneRef = useRef<SVGGElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyTransform = useCallback(() => {
    const g = sceneRef.current;
    if (!g) return;
    const v = viewportRef.current;
    g.setAttribute(
      "transform",
      `translate(${v.panX} ${v.panY}) scale(${v.zoom})`
    );
  }, []);

  // Re-apply the live transform after every render. This covers the initial
  // mount (before any gesture) and guarantees a React commit can never leave
  // a stale transform on the scene group.
  useLayoutEffect(() => {
    applyTransform();
  });

  const scheduleFrame = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      applyTransform();
    });
  }, [applyTransform]);

  const commitViewport = useCallback(() => {
    if (debounceRef.current != null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (maxWaitRef.current != null) {
      clearTimeout(maxWaitRef.current);
      maxWaitRef.current = null;
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    applyTransform();
    const v = viewportRef.current;
    setViewport((prev) =>
      prev.zoom === v.zoom && prev.panX === v.panX && prev.panY === v.panY
        ? prev
        : { ...v }
    );
  }, [applyTransform]);

  const scheduleCommit = useCallback(() => {
    if (debounceRef.current != null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(commitViewport, COMMIT_DEBOUNCE_MS);
    // Max-wait: a long continuous gesture (trackpad pan, drag-pan) keeps
    // resetting the debounce, so also commit periodically — rulers and
    // zoom-dependent strokes stay roughly in sync without per-frame renders.
    if (maxWaitRef.current == null) {
      maxWaitRef.current = setTimeout(() => {
        maxWaitRef.current = null;
        commitViewport();
      }, COMMIT_MAX_WAIT_MS);
    }
  }, [commitViewport]);

  /** Gesture-path mutation: ref + rAF paint + debounced React commit. */
  const applyGesture = useCallback(
    (next: Viewport) => {
      viewportRef.current = next;
      scheduleFrame();
      scheduleCommit();
    },
    [scheduleFrame, scheduleCommit]
  );

  /** Programmatic mutation: ref + immediate React commit. */
  const applyImmediate = useCallback(
    (next: Viewport) => {
      viewportRef.current = next;
      commitViewport();
    },
    [commitViewport]
  );

  // Cleanup any pending frame/timers on unmount.
  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
      if (maxWaitRef.current != null) clearTimeout(maxWaitRef.current);
    },
    []
  );

  // Track spacebar for pan-mode without stealing focus from form inputs.
  useEffect(() => {
    const isFormField = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target.isContentEditable
      );
    };

    const onDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if (isFormField(e.target)) return;
      e.preventDefault();
      setSpaceHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    const reset = () => setSpaceHeld(false);

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", reset);
    };
  }, []);

  const zoomAt = useCallback(
    (nextZoom: number, screenX: number, screenY: number) => {
      const v = viewportRef.current;
      const target = clampZoom(nextZoom);
      if (target === v.zoom) return;
      const ratio = target / v.zoom;
      applyGesture({
        zoom: target,
        panX: screenX - (screenX - v.panX) * ratio,
        panY: screenY - (screenY - v.panY) * ratio,
      });
    },
    [applyGesture]
  );

  // Toolbar-button zooms are discrete clicks, not gestures — commit at once.
  const zoomInAt = useCallback(
    (screenX: number, screenY: number) => {
      const v = viewportRef.current;
      const target = clampZoom(v.zoom * ZOOM_STEP);
      if (target === v.zoom) return;
      const ratio = target / v.zoom;
      applyImmediate({
        zoom: target,
        panX: screenX - (screenX - v.panX) * ratio,
        panY: screenY - (screenY - v.panY) * ratio,
      });
    },
    [applyImmediate]
  );

  const zoomOutAt = useCallback(
    (screenX: number, screenY: number) => {
      const v = viewportRef.current;
      const target = clampZoom(v.zoom / ZOOM_STEP);
      if (target === v.zoom) return;
      const ratio = target / v.zoom;
      applyImmediate({
        zoom: target,
        panX: screenX - (screenX - v.panX) * ratio,
        panY: screenY - (screenY - v.panY) * ratio,
      });
    },
    [applyImmediate]
  );

  const resetZoom = useCallback(() => {
    applyImmediate({ zoom: 1, panX: 0, panY: 0 });
  }, [applyImmediate]);

  const fitToContainer = useCallback(
    (
      containerWidth: number,
      containerHeight: number,
      contentWidth: number,
      contentHeight: number,
      padding = 40
    ) => {
      if (
        containerWidth <= 0 ||
        containerHeight <= 0 ||
        contentWidth <= 0 ||
        contentHeight <= 0
      )
        return;
      const zx = (containerWidth - padding * 2) / contentWidth;
      const zy = (containerHeight - padding * 2) / contentHeight;
      const z = clampZoom(Math.min(zx, zy));
      applyImmediate({
        zoom: z,
        panX: (containerWidth - contentWidth * z) / 2,
        panY: (containerHeight - contentHeight * z) / 2,
      });
    },
    [applyImmediate]
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const v = viewportRef.current;
      applyGesture({ ...v, panX: v.panX + dx, panY: v.panY + dy });
    },
    [applyGesture]
  );

  return {
    viewport,
    viewportRef,
    sceneRef,
    zoomAt,
    zoomInAt,
    zoomOutAt,
    resetZoom,
    fitToContainer,
    panBy,
    commitViewport,
    spaceHeld,
  };
}
