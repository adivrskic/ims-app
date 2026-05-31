"use client";

import type { SectionDraft, SelectionRef } from "./types";
import type { Guide, Rect, DragMode } from "./snap";
import { useDraggableItem, type RectPatch } from "./useDraggableItem";
import { useRotateHandle } from "./useRotateHandle";

interface Props {
  section: SectionDraft;
  selected: boolean;
  showHandles: boolean;
  overlapping?: boolean;
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

// Show interior dividers only when each cell is at least this many screen px.
const MIN_CELL_PX = 8;

export function SectionRect({
  section,
  selected,
  showHandles,
  overlapping = false,
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
  const ref: SelectionRef = { kind: "section", id: section.id };

  const { startDrag, isMoving } = useDraggableItem({
    item: section,
    siblings,
    zoom,
    clientToFloor,
    gridSize,
    gridEnabled,
    onPointerDownItem: (e, mode) => onPointerDownItem(ref, e, mode),
    onMoveDelta,
    onResize: (patch) => onResize(section.id, patch),
    onDragEnd,
    onGuidesChange,
    panLock,
  });

  const { startRotate, isRotating } = useRotateHandle({
    item: section,
    clientToFloor,
    onRotateStart,
    onUpdate: (patch) => onRotateUpdate(section.id, patch),
    onRotateEnd: onDragEnd,
    panLock,
  });

  const {
    floor_x: x,
    floor_y: y,
    floor_width: w,
    floor_height: h,
    rotation,
    color,
    code,
    name,
    total_bays,
    total_levels,
  } = section;

  const inv = 1 / Math.max(zoom, 0.01);
  const handleScale = isMobile ? 2 : 1;
  const handleSize = 10 * handleScale * inv;
  const rotateOffset = (isMobile ? 32 : 24) * inv;
  const rotateRadius = (isMobile ? 9 : 5) * inv;

  // Interior bay/level subdivisions become visible when each cell is big
  // enough on screen to actually mean something.
  const bayWidth = total_bays > 0 ? w / total_bays : 0;
  const levelHeight = total_levels > 0 ? h / total_levels : 0;
  const showBays = total_bays > 1 && bayWidth * zoom >= MIN_CELL_PX;
  const showLevels = total_levels > 1 && levelHeight * zoom >= MIN_CELL_PX;
  const showBayLabels = total_bays > 1 && bayWidth * zoom >= 28;

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
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={color}
        fillOpacity={selected ? 0.28 : 0.16}
        stroke={
          overlapping
            ? "var(--danger)"
            : selected
            ? "var(--accent)"
            : color
        }
        strokeWidth={(overlapping || selected ? 1.5 : 1) * inv}
        style={{ cursor: grabCursor }}
        onPointerDown={startDrag("move")}
      />

      {/* Overlap warning — a dashed danger ring drawn over the fill so the
          conflict reads even when the section is also selected. */}
      {overlapping && (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill="var(--danger)"
          fillOpacity={0.1}
          stroke="var(--danger)"
          strokeWidth={1 * inv}
          strokeDasharray={`${4 * inv} ${3 * inv}`}
          pointerEvents="none"
        />
      )}

      {/* Interior bay/level grid — appears at higher zoom to expose the
          section's bays × levels structure. Drawn before the labels so the
          code/name still read above everything. */}
      {(showBays || showLevels) && (
        <g pointerEvents="none">
          {showBays &&
            Array.from({ length: total_bays - 1 }, (_, i) => {
              const lx = x + (i + 1) * bayWidth;
              return (
                <line
                  key={`b-${i}`}
                  x1={lx}
                  y1={y}
                  x2={lx}
                  y2={y + h}
                  stroke="var(--text-dim)"
                  strokeWidth={0.5 * inv}
                  strokeOpacity={0.4}
                />
              );
            })}
          {showLevels &&
            Array.from({ length: total_levels - 1 }, (_, i) => {
              const ly = y + (i + 1) * levelHeight;
              return (
                <line
                  key={`l-${i}`}
                  x1={x}
                  y1={ly}
                  x2={x + w}
                  y2={ly}
                  stroke="var(--text-dim)"
                  strokeWidth={0.5 * inv}
                  strokeOpacity={0.4}
                />
              );
            })}
          {showBayLabels &&
            Array.from({ length: total_bays }, (_, i) => (
              <text
                key={`bn-${i}`}
                x={x + (i + 0.5) * bayWidth}
                y={y + 10 * inv}
                textAnchor="middle"
                fontFamily="var(--mono)"
                fontSize={8 * inv}
                fill="var(--text-dim)"
                opacity={0.7}
              >
                {String(i + 1).padStart(2, "0")}
              </text>
            ))}
        </g>
      )}

      <text
        x={x + w / 2}
        y={y + h / 2 - 4}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize={Math.min(20, w / 5)}
        fontWeight={600}
        fill="var(--text)"
        pointerEvents="none"
      >
        {code}
      </text>
      <text
        x={x + w / 2}
        y={y + h / 2 + 14}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize={Math.min(11, w / 12)}
        fill="var(--text-muted)"
        pointerEvents="none"
      >
        {name}
      </text>

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
