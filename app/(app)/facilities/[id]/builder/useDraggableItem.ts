"use client";

import { useEffect, useState } from "react";
import { computeSnap, type DragMode, type Guide, type Rect } from "./snap";

interface RectShape {
  id: string;
  floor_x: number;
  floor_y: number;
  floor_width: number;
  floor_height: number;
}

export interface RectPatch {
  floor_x?: number;
  floor_y?: number;
  floor_width?: number;
  floor_height?: number;
  rotation?: number;
}

interface DragState {
  mode: DragMode;
  initial: RectShape;
  startFloorX: number;
  startFloorY: number;
}

interface UseDraggableItemArgs {
  item: RectShape;
  /**
   * Rects to snap against. Caller is responsible for excluding self and
   * any co-moving items (group drag) from this list.
   */
  siblings: Rect[];
  zoom: number;
  clientToFloor: (clientX: number, clientY: number) => { x: number; y: number };
  gridSize: number;
  gridEnabled: boolean;
  /**
   * Called once on pointer-down with the event and intended drag mode.
   * Return true to proceed with the drag, false to abort (e.g. when a
   * shift+click should only toggle selection without dragging). The
   * implementer is responsible for dispatching begin_drag if returning
   * true.
   */
  onPointerDownItem: (e: React.PointerEvent, mode: DragMode) => boolean;
  /** Called per frame in `move` mode. The delta is from drag start. */
  onMoveDelta: (dx: number, dy: number) => void;
  /** Called per frame for any resize mode. Patch is in absolute floor coords. */
  onResize: (patch: RectPatch) => void;
  /** Called once on pointer-up. */
  onDragEnd: () => void;
  onGuidesChange: (guides: Guide[]) => void;
  panLock: boolean;
  minSize?: number;
}

const SCREEN_SNAP_TOLERANCE_PX = 6;
const DEFAULT_MIN_SIZE = 40;

export function useDraggableItem({
  item,
  siblings,
  zoom,
  clientToFloor,
  gridSize,
  gridEnabled,
  onPointerDownItem,
  onMoveDelta,
  onResize,
  onDragEnd,
  onGuidesChange,
  panLock,
  minSize = DEFAULT_MIN_SIZE,
}: UseDraggableItemArgs) {
  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const { x, y } = clientToFloor(e.clientX, e.clientY);
      const dx = x - drag.startFloorX;
      const dy = y - drag.startFloorY;
      const init = drag.initial;
      const snapActive = gridEnabled && !e.altKey;

      const proposed: Rect = {
        x: init.floor_x,
        y: init.floor_y,
        width: init.floor_width,
        height: init.floor_height,
      };

      switch (drag.mode) {
        case "move":
          proposed.x = init.floor_x + dx;
          proposed.y = init.floor_y + dy;
          break;
        case "e":
          proposed.width = Math.max(minSize, init.floor_width + dx);
          break;
        case "w": {
          const newW = Math.max(minSize, init.floor_width - dx);
          proposed.x = init.floor_x + (init.floor_width - newW);
          proposed.width = newW;
          break;
        }
        case "s":
          proposed.height = Math.max(minSize, init.floor_height + dy);
          break;
        case "n": {
          const newH = Math.max(minSize, init.floor_height - dy);
          proposed.y = init.floor_y + (init.floor_height - newH);
          proposed.height = newH;
          break;
        }
        case "se":
          proposed.width = Math.max(minSize, init.floor_width + dx);
          proposed.height = Math.max(minSize, init.floor_height + dy);
          break;
        case "sw": {
          const newW = Math.max(minSize, init.floor_width - dx);
          proposed.x = init.floor_x + (init.floor_width - newW);
          proposed.width = newW;
          proposed.height = Math.max(minSize, init.floor_height + dy);
          break;
        }
        case "ne": {
          const newH = Math.max(minSize, init.floor_height - dy);
          proposed.y = init.floor_y + (init.floor_height - newH);
          proposed.height = newH;
          proposed.width = Math.max(minSize, init.floor_width + dx);
          break;
        }
        case "nw": {
          const newW = Math.max(minSize, init.floor_width - dx);
          const newH = Math.max(minSize, init.floor_height - dy);
          proposed.x = init.floor_x + (init.floor_width - newW);
          proposed.width = newW;
          proposed.y = init.floor_y + (init.floor_height - newH);
          proposed.height = newH;
          break;
        }
      }

      const tolerance = SCREEN_SNAP_TOLERANCE_PX / Math.max(zoom, 0.01);
      const snap = computeSnap(proposed, siblings, drag.mode, {
        tolerance,
        gridSize,
        gridEnabled: snapActive,
      });

      switch (drag.mode) {
        case "move":
          proposed.x += snap.dx;
          proposed.y += snap.dy;
          break;
        case "e":
          proposed.width = Math.max(minSize, proposed.width + snap.dx);
          break;
        case "w": {
          const adjW = Math.max(minSize, proposed.width - snap.dx);
          proposed.x = proposed.x + (proposed.width - adjW);
          proposed.width = adjW;
          break;
        }
        case "s":
          proposed.height = Math.max(minSize, proposed.height + snap.dy);
          break;
        case "n": {
          const adjH = Math.max(minSize, proposed.height - snap.dy);
          proposed.y = proposed.y + (proposed.height - adjH);
          proposed.height = adjH;
          break;
        }
        case "se":
          proposed.width = Math.max(minSize, proposed.width + snap.dx);
          proposed.height = Math.max(minSize, proposed.height + snap.dy);
          break;
        case "sw": {
          const adjW = Math.max(minSize, proposed.width - snap.dx);
          proposed.x = proposed.x + (proposed.width - adjW);
          proposed.width = adjW;
          proposed.height = Math.max(minSize, proposed.height + snap.dy);
          break;
        }
        case "ne": {
          const adjH = Math.max(minSize, proposed.height - snap.dy);
          proposed.y = proposed.y + (proposed.height - adjH);
          proposed.height = adjH;
          proposed.width = Math.max(minSize, proposed.width + snap.dx);
          break;
        }
        case "nw": {
          const adjW = Math.max(minSize, proposed.width - snap.dx);
          const adjH = Math.max(minSize, proposed.height - snap.dy);
          proposed.x = proposed.x + (proposed.width - adjW);
          proposed.width = adjW;
          proposed.y = proposed.y + (proposed.height - adjH);
          proposed.height = adjH;
          break;
        }
      }

      proposed.x = Math.max(0, proposed.x);
      proposed.y = Math.max(0, proposed.y);

      onGuidesChange(snap.guides);

      if (drag.mode === "move") {
        const finalDx = proposed.x - init.floor_x;
        const finalDy = proposed.y - init.floor_y;
        onMoveDelta(finalDx, finalDy);
      } else {
        onResize({
          floor_x: proposed.x,
          floor_y: proposed.y,
          floor_width: proposed.width,
          floor_height: proposed.height,
        });
      }
    };

    const onUp = () => {
      setDrag(null);
      onGuidesChange([]);
      onDragEnd();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [
    drag,
    clientToFloor,
    zoom,
    siblings,
    gridSize,
    gridEnabled,
    onMoveDelta,
    onResize,
    onDragEnd,
    onGuidesChange,
    minSize,
  ]);

  const startDrag = (mode: DragMode) => (e: React.PointerEvent) => {
    if (panLock) return;
    if (e.button !== 0) return;
    e.stopPropagation();

    const shouldDrag = onPointerDownItem(e, mode);
    if (!shouldDrag) return;

    const { x, y } = clientToFloor(e.clientX, e.clientY);
    setDrag({
      mode,
      startFloorX: x,
      startFloorY: y,
      initial: { ...item },
    });
  };

  return {
    startDrag,
    isMoving: drag?.mode === "move",
  };
}
