"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { ElementKind } from "@/app/(app)/facilities/[id]/builder/types";
import type { ViewportApi } from "@/app/(app)/facilities/[id]/builder/useViewport";
import {
  TopRuler,
  LeftRuler,
  RulerCorner,
  RULER_OFFSET,
} from "@/app/(app)/facilities/[id]/builder/Rulers";

export interface ViewerSection {
  id: string;
  code: string;
  name: string;
  floor_x: number;
  floor_y: number;
  floor_width: number;
  floor_height: number;
  rotation: number;
  total_bays: number;
  total_levels: number;
  color: string;
  occupied: number;
  capacity: number;
}

export interface ViewerElement {
  id: string;
  kind: ElementKind;
  floor_x: number;
  floor_y: number;
  floor_width: number;
  floor_height: number;
  rotation: number;
  color: string;
  label: string;
}

interface Props {
  canvasWidth: number;
  canvasHeight: number;
  floorUnit: string;
  sections: ViewerSection[];
  elements: ViewerElement[];
  containerRef: RefObject<HTMLDivElement | null>;
  viewportApi: ViewportApi;
  onSectionClick: (sectionId: string) => void;
}

const BACKGROUND_KINDS: ElementKind[] = ["staging", "walkway", "obstacle"];
const FOREGROUND_KINDS: ElementKind[] = ["door", "note"];
const CLICK_MOVE_THRESHOLD_PX = 4;

export function ViewerCanvas({
  canvasWidth,
  canvasHeight,
  floorUnit,
  sections,
  elements,
  containerRef,
  viewportApi,
  onSectionClick,
}: Props) {
  const {
    viewport,
    viewportRef,
    sceneRef,
    zoomAt,
    panBy,
    commitViewport,
    spaceHeld,
  } = viewportApi;
  const [panning, setPanning] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Mouse-down snapshot per section — used to suppress click if the user
  // panned across a section instead of clicking it.
  const pressRef = useRef<{ id: string; x: number; y: number } | null>(null);

  // Track container size for rulers
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setContainerSize({ width: rect.width, height: rect.height });
    return () => ro.disconnect();
  }, [containerRef]);

  // Wheel zoom/pan — same UX as the builder. Zoom is read from the live
  // viewport ref so this listener mounts once instead of detaching and
  // re-attaching on every zoom tick.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.01);
        zoomAt(viewportRef.current.zoom * factor, sx, sy);
        return;
      }
      e.preventDefault();
      if (e.shiftKey) panBy(-e.deltaY, -e.deltaX);
      else panBy(-e.deltaX, -e.deltaY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef, viewportRef, zoomAt, panBy]);

  // Touch: 1-finger pan, 2-finger pinch zoom. Matches the builder.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const active = new Map<number, { x: number; y: number }>();
    let pinch: { lastMid: { x: number; y: number }; lastDist: number } | null =
      null;
    let singlePan: { x: number; y: number; pointerId: number } | null = null;

    const onPD = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (active.size === 1) {
        singlePan = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      } else if (active.size === 2) {
        singlePan = null;
        const pts = [...active.values()];
        pinch = {
          lastMid: {
            x: (pts[0].x + pts[1].x) / 2,
            y: (pts[0].y + pts[1].y) / 2,
          },
          lastDist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
        };
      }
    };
    const onPM = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (!active.has(e.pointerId)) return;
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && active.size >= 2) {
        const pts = [...active.values()];
        const mid = {
          x: (pts[0].x + pts[1].x) / 2,
          y: (pts[0].y + pts[1].y) / 2,
        };
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const rect = el.getBoundingClientRect();
        panBy(mid.x - pinch.lastMid.x, mid.y - pinch.lastMid.y);
        zoomAt(
          viewportRef.current.zoom * (dist / pinch.lastDist),
          mid.x - rect.left,
          mid.y - rect.top
        );
        pinch = { lastMid: mid, lastDist: dist };
      } else if (singlePan && e.pointerId === singlePan.pointerId) {
        panBy(e.clientX - singlePan.x, e.clientY - singlePan.y);
        singlePan = {
          x: e.clientX,
          y: e.clientY,
          pointerId: singlePan.pointerId,
        };
      }
    };
    const onPU = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      active.delete(e.pointerId);
      if (singlePan?.pointerId === e.pointerId) singlePan = null;
      if (active.size < 2) pinch = null;
      // Gesture fully ended — flush the live viewport into React state.
      if (active.size === 0) commitViewport();
    };
    el.addEventListener("pointerdown", onPD);
    window.addEventListener("pointermove", onPM, { passive: true });
    window.addEventListener("pointerup", onPU);
    window.addEventListener("pointercancel", onPU);
    return () => {
      el.removeEventListener("pointerdown", onPD);
      window.removeEventListener("pointermove", onPM);
      window.removeEventListener("pointerup", onPU);
      window.removeEventListener("pointercancel", onPU);
    };
  }, [containerRef, viewportRef, panBy, zoomAt, commitViewport]);

  // Mouse pan: middle-mouse or spacebar+left
  const onContainerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    const isMiddle = e.button === 1;
    const isSpacePan = spaceHeld && e.button === 0;
    if (!isMiddle && !isSpacePan) return;
    e.preventDefault();
    setPanning(true);
    let lastX = e.clientX,
      lastY = e.clientY;
    const onMove = (ev: PointerEvent) => {
      panBy(ev.clientX - lastX, ev.clientY - lastY);
      lastX = ev.clientX;
      lastY = ev.clientY;
    };
    const onUp = () => {
      setPanning(false);
      commitViewport();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const inv = 1 / Math.max(viewport.zoom, 0.01);
  const bgElements = elements.filter((e) => BACKGROUND_KINDS.includes(e.kind));
  const fgElements = elements.filter((e) => FOREGROUND_KINDS.includes(e.kind));

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden hairline bg-[var(--surface)] min-h-[600px]"
      onPointerDown={onContainerPointerDown}
      style={{
        cursor: panning ? "grabbing" : spaceHeld ? "grab" : "default",
        touchAction: "none",
      }}
    >
      <TopRuler
        panX={viewport.panX}
        panY={viewport.panY}
        zoom={viewport.zoom}
        size={containerSize}
      />
      <LeftRuler
        panX={viewport.panX}
        panY={viewport.panY}
        zoom={viewport.zoom}
        size={containerSize}
      />
      <RulerCorner floorUnit={floorUnit} />

      <div
        className="absolute hairline-subtle bg-[var(--surface-2)] px-8 py-4 pointer-events-none"
        style={{
          top: RULER_OFFSET + 8,
          left: RULER_OFFSET + 8,
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: "1px",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          zIndex: 4,
        }}
      >
        {Math.round(canvasWidth)} × {Math.round(canvasHeight)} {floorUnit}
      </div>

      <svg
        width="100%"
        height="100%"
        style={{ display: "block", userSelect: "none" }}
      >
        <defs>
          <pattern
            id="vw-grid-minor"
            width={10}
            height={10}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M 10 0 L 0 0 0 10`}
              fill="none"
              stroke="var(--border-faint)"
              strokeWidth={0.5 * inv}
            />
          </pattern>
          <pattern
            id="vw-grid-major"
            width={50}
            height={50}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M 50 0 L 0 0 0 50`}
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth={0.8 * inv}
            />
          </pattern>
          <pattern
            id="vw-walkway-stripes"
            width={12}
            height={12}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={12}
              stroke="var(--text-dim)"
              strokeWidth={1.2 * inv}
              strokeOpacity={0.5}
            />
          </pattern>
          <pattern
            id="vw-obstacle-hatch"
            width={10}
            height={10}
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 0 10 L 10 0"
              stroke="var(--text-dim)"
              strokeWidth={1 * inv}
              strokeOpacity={0.6}
            />
            <path
              d="M 0 0 L 10 10"
              stroke="var(--text-dim)"
              strokeWidth={1 * inv}
              strokeOpacity={0.6}
            />
          </pattern>
        </defs>

        {/* Scene group — its pan/zoom transform is applied imperatively by
            useViewport (ref + rAF) so gestures don't re-render the scene. */}
        <g ref={sceneRef}>
          <rect
            x={0}
            y={0}
            width={canvasWidth}
            height={canvasHeight}
            fill="var(--bg)"
            pointerEvents="none"
          />
          <rect
            x={0}
            y={0}
            width={canvasWidth}
            height={canvasHeight}
            fill="url(#vw-grid-minor)"
            pointerEvents="none"
          />
          <rect
            x={0}
            y={0}
            width={canvasWidth}
            height={canvasHeight}
            fill="url(#vw-grid-major)"
            pointerEvents="none"
          />
          <rect
            x={0}
            y={0}
            width={canvasWidth}
            height={canvasHeight}
            fill="none"
            stroke="var(--border)"
            strokeWidth={inv}
            strokeDasharray={`${6 * inv} ${4 * inv}`}
            pointerEvents="none"
          />

          {bgElements.map((el) => (
            <ElementRender key={el.id} element={el} inv={inv} />
          ))}

          {sections.map((s) => {
            const cx = s.floor_x + s.floor_width / 2;
            const cy = s.floor_y + s.floor_height / 2;
            const isHover = hoverId === s.id;
            const isFocus = focusId === s.id;
            const occRatio = s.capacity > 0 ? s.occupied / s.capacity : 0;
            return (
              <g
                key={s.id}
                transform={`rotate(${s.rotation} ${cx} ${cy})`}
                style={{ cursor: "pointer", outline: "none" }}
                tabIndex={0}
                role="button"
                aria-label={`View section ${s.name} (${s.code})`}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  onSectionClick(s.id);
                }}
                onFocus={() => setFocusId(s.id)}
                onBlur={() =>
                  setFocusId((id) => (id === s.id ? null : id))
                }
                onPointerDown={(e) => {
                  if (panning || spaceHeld) return;
                  if (e.button !== 0) return;
                  pressRef.current = { id: s.id, x: e.clientX, y: e.clientY };
                }}
                onPointerUp={(e) => {
                  const p = pressRef.current;
                  pressRef.current = null;
                  if (!p || p.id !== s.id) return;
                  const moved =
                    Math.abs(e.clientX - p.x) > CLICK_MOVE_THRESHOLD_PX ||
                    Math.abs(e.clientY - p.y) > CLICK_MOVE_THRESHOLD_PX;
                  if (moved) return;
                  onSectionClick(s.id);
                }}
                onPointerEnter={() => setHoverId(s.id)}
                onPointerLeave={() =>
                  setHoverId((id) => (id === s.id ? null : id))
                }
              >
                <rect
                  x={s.floor_x}
                  y={s.floor_y}
                  width={s.floor_width}
                  height={s.floor_height}
                  fill={s.color}
                  fillOpacity={isHover || isFocus ? 0.36 : 0.16}
                  stroke={isHover || isFocus ? "var(--accent)" : s.color}
                  strokeWidth={(isHover || isFocus ? 1.6 : 1) * inv}
                />
                {/* Visible keyboard-focus ring — drawn in floor space so it
                    tracks the shape through pan/zoom/rotation. */}
                {isFocus && (
                  <rect
                    x={s.floor_x - 3 * inv}
                    y={s.floor_y - 3 * inv}
                    width={s.floor_width + 6 * inv}
                    height={s.floor_height + 6 * inv}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={2 * inv}
                    strokeDasharray={`${4 * inv} ${3 * inv}`}
                    pointerEvents="none"
                  />
                )}
                {/* Occupancy fill bar at bottom — a thin meter that hints
                    at how full this section is without dominating. */}
                {s.capacity > 0 && (
                  <rect
                    x={s.floor_x}
                    y={s.floor_y + s.floor_height - 4 * inv}
                    width={s.floor_width * occRatio}
                    height={4 * inv}
                    fill={s.color}
                    fillOpacity={0.9}
                    pointerEvents="none"
                  />
                )}
                <text
                  x={cx}
                  y={cy - 4}
                  textAnchor="middle"
                  fontFamily="var(--mono)"
                  fontSize={Math.min(20, s.floor_width / 5)}
                  fontWeight={600}
                  fill="var(--text)"
                  pointerEvents="none"
                >
                  {s.code}
                </text>
                <text
                  x={cx}
                  y={cy + 14}
                  textAnchor="middle"
                  fontFamily="var(--mono)"
                  fontSize={Math.min(11, s.floor_width / 12)}
                  fill="var(--text-muted)"
                  pointerEvents="none"
                >
                  {s.name}
                </text>
                {/* Occupancy text — shown when the section is big enough on screen */}
                {s.floor_width * viewport.zoom > 110 && (
                  <text
                    x={cx}
                    y={cy + 30}
                    textAnchor="middle"
                    fontFamily="var(--mono)"
                    fontSize={9}
                    fill="var(--text-dim)"
                    pointerEvents="none"
                    style={{
                      letterSpacing: "0.8px",
                      textTransform: "uppercase",
                    }}
                  >
                    {s.occupied} / {s.capacity}
                  </text>
                )}
              </g>
            );
          })}

          {fgElements.map((el) => (
            <ElementRender key={el.id} element={el} inv={inv} />
          ))}
        </g>
      </svg>
    </div>
  );
}

/** Read-only element renderer — same visual treatment as the builder
 *  per kind, just no interaction or handles. */
function ElementRender({
  element,
  inv,
}: {
  element: ViewerElement;
  inv: number;
}) {
  const {
    kind,
    floor_x: x,
    floor_y: y,
    floor_width: w,
    floor_height: h,
    color,
    label,
    rotation,
  } = element;
  const cx = x + w / 2;
  const cy = y + h / 2;

  return (
    <g transform={`rotate(${rotation} ${cx} ${cy})`} pointerEvents="none">
      {kind === "walkway" && (
        <>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill={color}
            fillOpacity={0.08}
          />
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill="url(#vw-walkway-stripes)"
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
          />
        </>
      )}
      {kind === "note" && (
        <>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill={color}
            fillOpacity={0.22}
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
          />
        </>
      )}
      {kind === "door" && (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill={color}
          fillOpacity={0.85}
          stroke={color}
          strokeWidth={1 * inv}
        />
      )}
      {kind === "obstacle" && (
        <>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill={color}
            fillOpacity={0.45}
          />
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill="url(#vw-obstacle-hatch)"
          />
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill="none"
            stroke={color}
            strokeWidth={1.2 * inv}
          />
        </>
      )}
      {kind === "staging" && (
        <>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill={color}
            fillOpacity={0.08}
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
          />
        </>
      )}
      {kind === "note" && label && (
        <foreignObject
          x={x + 8 * inv}
          y={y + 8 * inv}
          width={Math.max(0, w - 16 * inv)}
          height={Math.max(0, h - 16 * inv)}
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
      )}
      {kind !== "note" && label && (
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontFamily="var(--mono)"
          fontSize={Math.min(13, Math.max(9, w / 14))}
          fontWeight={500}
          letterSpacing="1.2px"
          fill="var(--text-muted)"
          style={{ textTransform: "uppercase" }}
        >
          {label}
        </text>
      )}
    </g>
  );
}
