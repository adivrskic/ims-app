"use client";

import { useCallback, useEffect, useState } from "react";

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

const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

export interface ViewportApi {
  viewport: Viewport;
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
 */
export function useViewport(
  initial: Viewport = { zoom: 1, panX: 0, panY: 0 }
): ViewportApi {
  const [viewport, setViewport] = useState<Viewport>(initial);
  const [spaceHeld, setSpaceHeld] = useState(false);

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
      setViewport((v) => {
        const target = clampZoom(nextZoom);
        if (target === v.zoom) return v;
        const ratio = target / v.zoom;
        return {
          zoom: target,
          panX: screenX - (screenX - v.panX) * ratio,
          panY: screenY - (screenY - v.panY) * ratio,
        };
      });
    },
    []
  );

  const zoomInAt = useCallback((screenX: number, screenY: number) => {
    setViewport((v) => {
      const target = clampZoom(v.zoom * ZOOM_STEP);
      if (target === v.zoom) return v;
      const ratio = target / v.zoom;
      return {
        zoom: target,
        panX: screenX - (screenX - v.panX) * ratio,
        panY: screenY - (screenY - v.panY) * ratio,
      };
    });
  }, []);

  const zoomOutAt = useCallback((screenX: number, screenY: number) => {
    setViewport((v) => {
      const target = clampZoom(v.zoom / ZOOM_STEP);
      if (target === v.zoom) return v;
      const ratio = target / v.zoom;
      return {
        zoom: target,
        panX: screenX - (screenX - v.panX) * ratio,
        panY: screenY - (screenY - v.panY) * ratio,
      };
    });
  }, []);

  const resetZoom = useCallback(() => {
    setViewport({ zoom: 1, panX: 0, panY: 0 });
  }, []);

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
      setViewport({
        zoom: z,
        panX: (containerWidth - contentWidth * z) / 2,
        panY: (containerHeight - contentHeight * z) / 2,
      });
    },
    []
  );

  const panBy = useCallback((dx: number, dy: number) => {
    setViewport((v) => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }));
  }, []);

  return {
    viewport,
    zoomAt,
    zoomInAt,
    zoomOutAt,
    resetZoom,
    fitToContainer,
    panBy,
    spaceHeld,
  };
}
