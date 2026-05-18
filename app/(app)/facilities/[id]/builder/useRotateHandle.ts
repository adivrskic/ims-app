"use client";

import { useEffect, useRef, useState } from "react";

interface RectShape {
  floor_x: number;
  floor_y: number;
  floor_width: number;
  floor_height: number;
  rotation: number;
}

interface UseRotateHandleArgs {
  item: RectShape;
  clientToFloor: (clientX: number, clientY: number) => { x: number; y: number };
  /** Called when the user begins dragging the rotate handle. */
  onRotateStart?: () => void;
  onUpdate: (patch: { rotation: number }) => void;
  /** Called on pointer up. */
  onRotateEnd?: () => void;
  panLock: boolean;
}

interface RotateSnapshot {
  startAngle: number;
  initialRotation: number;
}

const SHIFT_SNAP_DEG = 15;
const SOFT_CARDINAL_TOLERANCE = 3;
const CARDINALS = [0, 45, 90, 135, 180, 225, 270, 315];

export function useRotateHandle({
  item,
  clientToFloor,
  onRotateStart,
  onUpdate,
  onRotateEnd,
  panLock,
}: UseRotateHandleArgs) {
  const [rotating, setRotating] = useState(false);
  const snapshotRef = useRef<RotateSnapshot | null>(null);

  useEffect(() => {
    if (!rotating) return;

    const onMove = (e: PointerEvent) => {
      const snap = snapshotRef.current;
      if (!snap) return;
      const cx = item.floor_x + item.floor_width / 2;
      const cy = item.floor_y + item.floor_height / 2;
      const cur = clientToFloor(e.clientX, e.clientY);
      const curAngle = Math.atan2(cur.y - cy, cur.x - cx);
      const deltaDeg = (curAngle - snap.startAngle) * (180 / Math.PI);
      let next = snap.initialRotation + deltaDeg;
      next = ((next % 360) + 360) % 360;

      if (e.shiftKey) {
        next = Math.round(next / SHIFT_SNAP_DEG) * SHIFT_SNAP_DEG;
      } else {
        for (const c of CARDINALS) {
          if (Math.abs(next - c) < SOFT_CARDINAL_TOLERANCE) {
            next = c;
            break;
          }
        }
      }
      onUpdate({ rotation: next });
    };

    const onUp = () => {
      setRotating(false);
      snapshotRef.current = null;
      onRotateEnd?.();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [
    rotating,
    item.floor_x,
    item.floor_y,
    item.floor_width,
    item.floor_height,
    clientToFloor,
    onUpdate,
    onRotateEnd,
  ]);

  const startRotate = (e: React.PointerEvent) => {
    if (panLock) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    const cx = item.floor_x + item.floor_width / 2;
    const cy = item.floor_y + item.floor_height / 2;
    const start = clientToFloor(e.clientX, e.clientY);
    snapshotRef.current = {
      startAngle: Math.atan2(start.y - cy, start.x - cx),
      initialRotation: item.rotation,
    };
    onRotateStart?.();
    setRotating(true);
  };

  return { startRotate, isRotating: rotating };
}
