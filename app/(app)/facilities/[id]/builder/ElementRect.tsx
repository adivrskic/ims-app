"use client";

import type { LayoutElementDraft, SelectionRef } from "./types";
import type { Guide, Rect, DragMode } from "./snap";
import { useDraggableItem, type RectPatch } from "./useDraggableItem";
import { useRotateHandle } from "./useRotateHandle";

interface Props {
  element: LayoutElementDraft;
  selected: boolean;
  showHandles: boolean;
  onPointerDownItem: (
    ref: SelectionRef,
    e: React.PointerEvent,
    mode: DragMode
  ) => boolean;
  onMoveDelta: (dx: number, dy: number) => void;
  onResize: (id: string, patch: RectPatch) => void;
  onRotateStart: () => void;
  onRotateUpdate: (id: string, patch: RectPatch) => void;
  onDragEnd: () => void;
  clientToFloor: (clientX: number, clientY: number) => { x: number; y: number };
  zoom: number;
  siblings: Rect[];
  gridSize: number;
  gridEnabled: boolean;
  onGuidesChange: (guides: Guide[]) => void;
  panLock: boolean;
  isMobile?: boolean;
}

const MIN_SIZE_BY_KIND: Record<string, number> = { door: 8 };

export function ElementRect({
  element,
  selected,
  showHandles,
  onPointerDownItem,
  onMoveDelta,
  onResize,
  onRotateStart,
  onRotateUpdate,
  onDragEnd,
  clientToFloor,
  zoom,
  siblings,
  gridSize,
  gridEnabled,
  onGuidesChange,
  panLock,
  isMobile = false,
}: Props) {
  const minSize = MIN_SIZE_BY_KIND[element.kind] ?? 24;
  const ref: SelectionRef = { kind: element.kind, id: element.id };

  const { startDrag, isMoving } = useDraggableItem({
    item: element,
    siblings,
    zoom,
    clientToFloor,
    gridSize,
    gridEnabled,
    onPointerDownItem: (e, mode) => onPointerDownItem(ref, e, mode),
    onMoveDelta,
    onResize: (patch) => onResize(element.id, patch),
    onDragEnd,
    onGuidesChange,
    panLock,
    minSize,
  });

  const { startRotate, isRotating } = useRotateHandle({
    item: element,
    clientToFloor,
    onRotateStart,
    onUpdate: (patch) => onRotateUpdate(element.id, patch),
    onRotateEnd: onDragEnd,
    panLock,
  });

  const {
    floor_x: x,
    floor_y: y,
    floor_width: w,
    floor_height: h,
    rotation,
  } = element;

  const inv = 1 / Math.max(zoom, 0.01);
  const handleScale = isMobile ? 2 : 1;
  const handleSize = 10 * handleScale * inv;
  const rotateOffset = (isMobile ? 32 : 24) * inv;
  const rotateRadius = (isMobile ? 9 : 5) * inv;

  const handles: Array<{
    mode: DragMode;
    cx: number;
    cy: number;
    cursor: string;
  }> = showHandles
    ? [
        { mode: "nw", cx: x, cy: y, cursor: "nw-resize" },
        { mode: "ne", cx: x + w, cy: y, cursor: "ne-resize" },
        { mode: "sw", cx: x, cy: y + h, cursor: "sw-resize" },
        { mode: "se", cx: x + w, cy: y + h, cursor: "se-resize" },
        { mode: "n", cx: x + w / 2, cy: y, cursor: "n-resize" },
        { mode: "s", cx: x + w / 2, cy: y + h, cursor: "s-resize" },
        { mode: "w", cx: x, cy: y + h / 2, cursor: "w-resize" },
        { mode: "e", cx: x + w, cy: y + h / 2, cursor: "e-resize" },
      ]
    : [];

  const grabCursor = panLock ? "inherit" : isMoving ? "grabbing" : "grab";

  return (
    <g transform={`rotate(${rotation} ${x + w / 2} ${y + h / 2})`}>
      {renderFill({ element, inv, selected })}

      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="transparent"
        stroke={selected ? "var(--accent)" : "transparent"}
        strokeWidth={selected ? 1.5 * inv : 0}
        style={{ cursor: grabCursor }}
        onPointerDown={startDrag("move")}
      />

      {renderLabel({ element, inv })}

      {handles.map(({ mode, cx, cy, cursor }) => (
        <rect
          key={mode}
          x={cx - handleSize / 2}
          y={cy - handleSize / 2}
          width={handleSize}
          height={handleSize}
          fill="var(--accent)"
          stroke="var(--bg)"
          strokeWidth={inv}
          style={{ cursor }}
          onPointerDown={startDrag(mode)}
        />
      ))}

      {showHandles && (
        <>
          <line
            x1={x + w / 2}
            y1={y}
            x2={x + w / 2}
            y2={y - rotateOffset}
            stroke="var(--accent)"
            strokeWidth={1 * inv}
            pointerEvents="none"
          />
          <circle
            cx={x + w / 2}
            cy={y - rotateOffset}
            r={rotateRadius}
            fill="var(--bg)"
            stroke="var(--accent)"
            strokeWidth={1.5 * inv}
            style={{ cursor: isRotating ? "grabbing" : "grab" }}
            onPointerDown={startRotate}
          />
        </>
      )}
    </g>
  );
}

// ─── Per-kind fill / label renderers (unchanged) ─────────────────────────

function renderFill({
  element,
  inv,
  selected,
}: {
  element: LayoutElementDraft;
  inv: number;
  selected: boolean;
}) {
  const {
    kind,
    floor_x: x,
    floor_y: y,
    floor_width: w,
    floor_height: h,
    color,
  } = element;
  const opacity = selected ? 1 : 0.85;

  switch (kind) {
    case "walkway":
      return (
        <>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill={color}
            fillOpacity={0.08 * opacity}
            pointerEvents="none"
          />
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill={`url(#element-walkway-stripes)`}
            opacity={opacity}
            pointerEvents="none"
          />
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill="none"
            stroke={color}
            strokeWidth={1 * inv}
            strokeDasharray={`${6 * inv} ${4 * inv}`}
            pointerEvents="none"
          />
        </>
      );
    case "note":
      return (
        <>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill={color}
            fillOpacity={0.22 * opacity}
            pointerEvents="none"
          />
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill="none"
            stroke={color}
            strokeWidth={1 * inv}
            strokeOpacity={0.8}
            pointerEvents="none"
          />
          <path
            d={`M ${x + w - 12 * inv} ${y} L ${x + w} ${y + 12 * inv} L ${
              x + w
            } ${y} Z`}
            fill={color}
            fillOpacity={0.4 * opacity}
            pointerEvents="none"
          />
        </>
      );
    case "door":
      return (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill={color}
          fillOpacity={0.85 * opacity}
          stroke={color}
          strokeWidth={1 * inv}
          pointerEvents="none"
        />
      );
    case "obstacle":
      return (
        <>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill={color}
            fillOpacity={0.45 * opacity}
            pointerEvents="none"
          />
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill="url(#element-obstacle-hatch)"
            opacity={opacity}
            pointerEvents="none"
          />
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill="none"
            stroke={color}
            strokeWidth={1.2 * inv}
            pointerEvents="none"
          />
        </>
      );
    case "staging":
      return (
        <>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill={color}
            fillOpacity={0.08 * opacity}
            pointerEvents="none"
          />
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill="none"
            stroke={color}
            strokeWidth={1.5 * inv}
            strokeDasharray={`${10 * inv} ${6 * inv}`}
            pointerEvents="none"
          />
        </>
      );
  }
}

function renderLabel({
  element,
  inv,
}: {
  element: LayoutElementDraft;
  inv: number;
}) {
  const {
    kind,
    floor_x: x,
    floor_y: y,
    floor_width: w,
    floor_height: h,
    label,
  } = element;
  if (!label) return null;

  if (kind === "note") {
    return (
      <foreignObject
        x={x + 8 * inv}
        y={y + 8 * inv}
        width={Math.max(0, w - 16 * inv)}
        height={Math.max(0, h - 16 * inv)}
        pointerEvents="none"
      >
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            lineHeight: 1.45,
            color: "var(--text)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflow: "hidden",
            height: "100%",
          }}
        >
          {label}
        </div>
      </foreignObject>
    );
  }

  if (kind === "door") {
    return (
      <text
        x={x + w / 2}
        y={y + h + 10}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize={Math.min(10, w / 6)}
        fill="var(--text-muted)"
        pointerEvents="none"
      >
        {label}
      </text>
    );
  }

  return (
    <text
      x={x + w / 2}
      y={y + h / 2 + 4}
      textAnchor="middle"
      fontFamily="var(--mono)"
      fontSize={Math.min(13, Math.max(9, w / 14))}
      fontWeight={500}
      letterSpacing="1.2px"
      fill="var(--text-muted)"
      style={{ textTransform: "uppercase" }}
      pointerEvents="none"
    >
      {label}
    </text>
  );
}
