"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { SectionRect } from "./SectionRect";
import { ElementRect } from "./ElementRect";
import { TopRuler, LeftRuler, RulerCorner, RULER_OFFSET } from "./Rulers";
import type {
  SectionDraft,
  LayoutElementDraft,
  SelectionRef,
  ElementKind,
} from "./types";
import { refsEqual } from "./types";
import type { Guide, Rect, DragMode } from "./snap";
import type { ViewportApi } from "./useViewport";
import type { RectPatch } from "./useDraggableItem";

interface Props {
  canvasWidth: number;
  canvasHeight: number;
  floorUnit: string;
  sections: SectionDraft[];
  elements: LayoutElementDraft[];
  selection: SelectionRef[];
  isMobile: boolean;
  onPointerDownItem: (
    ref: SelectionRef,
    e: React.PointerEvent,
    mode: DragMode
  ) => boolean;
  onSetSelection: (refs: SelectionRef[]) => void;
  onMoveDelta: (dx: number, dy: number) => void;
  onResizeSection: (id: string, patch: RectPatch) => void;
  onResizeElement: (id: string, patch: RectPatch) => void;
  onRotateStart: () => void;
  onRotateSection: (id: string, patch: RectPatch) => void;
  onRotateElement: (id: string, patch: RectPatch) => void;
  onDragEnd: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
  viewportApi: ViewportApi;
  gridSize: number;
  gridEnabled: boolean;
}

const BACKGROUND_KINDS: ElementKind[] = ["staging", "walkway", "obstacle"];
const FOREGROUND_KINDS: ElementKind[] = ["door", "note"];
const MARQUEE_MIN_MOVE_FLOOR = 3;

interface MarqueeState {
  startX: number;
  startY: number;
  currX: number;
  currY: number;
  additive: boolean;
}

const refKey = (r: SelectionRef) => `${r.kind}:${r.id}`;

const isRefSelected = (sel: SelectionRef[], ref: SelectionRef) =>
  sel.some((s) => refsEqual(s, ref));

export function FloorCanvas({
  canvasWidth,
  canvasHeight,
  floorUnit,
  sections,
  elements,
  selection,
  isMobile,
  onPointerDownItem,
  onSetSelection,
  onMoveDelta,
  onResizeSection,
  onResizeElement,
  onRotateStart,
  onRotateSection,
  onRotateElement,
  onDragEnd,
  containerRef,
  viewportApi,
  gridSize,
  gridEnabled,
}: Props) {
  const { viewport, zoomAt, panBy, spaceHeld } = viewportApi;
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeGuides, setActiveGuides] = useState<Guide[]>([]);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const dataRef = useRef({ sections, elements, selection });
  useEffect(() => {
    dataRef.current = { sections, elements, selection };
  }, [sections, elements, selection]);

  // Synchronous refs so the touch-gesture closure always reads the latest
  // viewport values without re-binding listeners on every frame.
  const zoomRef = useRef(viewport.zoom);
  const zoomAtRef = useRef(zoomAt);
  const panByRef = useRef(panBy);
  zoomRef.current = viewport.zoom;
  zoomAtRef.current = zoomAt;
  panByRef.current = panBy;

  // --- Track container size for the rulers ---
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

  // --- Wheel: ⌘/Ctrl = zoom, else pan ---
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
        zoomAt(viewport.zoom * factor, sx, sy);
        return;
      }
      e.preventDefault();
      if (e.shiftKey) {
        panBy(-e.deltaY, -e.deltaX);
      } else {
        panBy(-e.deltaX, -e.deltaY);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef, viewport.zoom, zoomAt, panBy]);

  // --- Touch gesture handling: 1-finger pan on empty canvas, 2-finger
  //     pinch zoom + midpoint pan. Mouse events are handled separately by
  //     handleContainerPointerDown / handleSvgPointerDown / item handlers
  //     and short-circuit on pointerType==='touch' to avoid double-handling.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const active = new Map<number, { x: number; y: number }>();
    let pinch: { lastMid: { x: number; y: number }; lastDist: number } | null =
      null;
    let singlePan: { x: number; y: number; pointerId: number } | null = null;

    const isCanvasTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      return target === el || target.tagName.toLowerCase() === "svg";
    };

    const onPD = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (active.size === 1) {
        if (isCanvasTarget(e.target)) {
          singlePan = {
            x: e.clientX,
            y: e.clientY,
            pointerId: e.pointerId,
          };
        }
      } else if (active.size === 2) {
        // 2nd finger lands → upgrade to pinch (cancels any single-finger pan).
        singlePan = null;
        const pts = [...active.values()];
        const mid = {
          x: (pts[0].x + pts[1].x) / 2,
          y: (pts[0].y + pts[1].y) / 2,
        };
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        pinch = { lastMid: mid, lastDist: dist };
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
        const midLocal = { x: mid.x - rect.left, y: mid.y - rect.top };

        // Incremental: pan by midpoint delta, then zoom by distance ratio
        // at the local midpoint. The order matters — pan first so the
        // zoom pivot lands where the user's pinch center actually is.
        panByRef.current(mid.x - pinch.lastMid.x, mid.y - pinch.lastMid.y);
        const factor = dist / pinch.lastDist;
        zoomAtRef.current(zoomRef.current * factor, midLocal.x, midLocal.y);

        pinch = { lastMid: mid, lastDist: dist };
      } else if (singlePan && e.pointerId === singlePan.pointerId) {
        panByRef.current(e.clientX - singlePan.x, e.clientY - singlePan.y);
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
  }, [containerRef]);

  // --- Mouse pan: middle-mouse OR spacebar+left ---
  const handleContainerPointerDown = (
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    if (e.pointerType === "touch") return; // touch is handled by the effect above
    const isMiddle = e.button === 1;
    const isSpacePan = spaceHeld && e.button === 0;
    if (!isMiddle && !isSpacePan) return;
    e.preventDefault();
    setPanning(true);
    let lastX = e.clientX;
    let lastY = e.clientY;
    const onMove = (ev: PointerEvent) => {
      panBy(ev.clientX - lastX, ev.clientY - lastY);
      lastX = ev.clientX;
      lastY = ev.clientY;
    };
    const onUp = () => {
      setPanning(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const clientToFloor = (clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - viewport.panX) / viewport.zoom,
      y: (sy - viewport.panY) / viewport.zoom,
    };
  };

  const handleContainerPointerMove = (
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    const p = clientToFloor(e.clientX, e.clientY);
    setCursor({ x: Math.round(p.x), y: Math.round(p.y) });
  };
  const handleContainerPointerLeave = () => setCursor(null);

  // --- Marquee (MOUSE ONLY — touch single-finger drag is pan) ---
  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (spaceHeld || panning) return;
    if (e.target !== e.currentTarget) return;
    if (e.button !== 0) return;
    if (e.pointerType === "touch") return; // touch path handles deselect via backdrop / canvas pan

    const { x, y } = clientToFloor(e.clientX, e.clientY);
    const additive = e.shiftKey;
    const initial: MarqueeState = {
      startX: x,
      startY: y,
      currX: x,
      currY: y,
      additive,
    };
    setMarquee(initial);
    let live = initial;

    const onMove = (ev: PointerEvent) => {
      const p = clientToFloor(ev.clientX, ev.clientY);
      live = { ...live, currX: p.x, currY: p.y };
      setMarquee(live);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const moved =
        Math.abs(live.currX - live.startX) > MARQUEE_MIN_MOVE_FLOOR ||
        Math.abs(live.currY - live.startY) > MARQUEE_MIN_MOVE_FLOOR;
      setMarquee(null);

      if (!moved) {
        if (!live.additive) onSetSelection([]);
        return;
      }

      const mLeft = Math.min(live.startX, live.currX);
      const mTop = Math.min(live.startY, live.currY);
      const mRight = Math.max(live.startX, live.currX);
      const mBottom = Math.max(live.startY, live.currY);

      const { sections: ls, elements: le, selection: lsel } = dataRef.current;
      const hits: SelectionRef[] = [];
      for (const s of ls) {
        if (
          s.floor_x + s.floor_width > mLeft &&
          s.floor_x < mRight &&
          s.floor_y + s.floor_height > mTop &&
          s.floor_y < mBottom
        ) {
          hits.push({ kind: "section", id: s.id });
        }
      }
      for (const el of le) {
        if (
          el.floor_x + el.floor_width > mLeft &&
          el.floor_x < mRight &&
          el.floor_y + el.floor_height > mTop &&
          el.floor_y < mBottom
        ) {
          hits.push({ kind: el.kind, id: el.id });
        }
      }

      if (live.additive) {
        const existing = new Set(lsel.map(refKey));
        const merged = [...lsel];
        for (const h of hits) {
          if (!existing.has(refKey(h))) merged.push(h);
        }
        onSetSelection(merged);
      } else {
        onSetSelection(hits);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // On mobile, a tap on empty SVG should clear selection (since single-finger
  // drag is pan, not marquee, and we still want a way to deselect).
  const handleSvgClickMobile = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isMobile) return;
    if (e.target !== e.currentTarget) return;
    onSetSelection([]);
  };

  const inv = 1 / Math.max(viewport.zoom, 0.01);
  const cursorStyle = panning ? "grabbing" : spaceHeld ? "grab" : "default";

  const allRects: Array<Rect & { key: string }> = [
    ...sections.map((s) => ({
      x: s.floor_x,
      y: s.floor_y,
      width: s.floor_width,
      height: s.floor_height,
      key: `section:${s.id}`,
    })),
    ...elements.map((e) => ({
      x: e.floor_x,
      y: e.floor_y,
      width: e.floor_width,
      height: e.floor_height,
      key: `${e.kind}:${e.id}`,
    })),
  ];
  const selectedKeys = new Set(selection.map(refKey));
  const siblingsFor = (ownKey: string): Rect[] => {
    if (selectedKeys.has(ownKey) && selectedKeys.size > 1) {
      return allRects.filter((r) => !selectedKeys.has(r.key));
    }
    return allRects.filter((r) => r.key !== ownKey);
  };

  const bgElements = elements.filter((e) => BACKGROUND_KINDS.includes(e.kind));
  const fgElements = elements.filter((e) => FOREGROUND_KINDS.includes(e.kind));
  const showHandlesFor = (ref: SelectionRef) =>
    selection.length === 1 && refsEqual(selection[0], ref);

  let multiBbox: { x: number; y: number; w: number; h: number } | null = null;
  if (selection.length > 1) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const ref of selection) {
      const item =
        ref.kind === "section"
          ? sections.find((s) => s.id === ref.id)
          : elements.find((e) => e.id === ref.id);
      if (!item) continue;
      minX = Math.min(minX, item.floor_x);
      minY = Math.min(minY, item.floor_y);
      maxX = Math.max(maxX, item.floor_x + item.floor_width);
      maxY = Math.max(maxY, item.floor_y + item.floor_height);
    }
    if (isFinite(minX)) {
      multiBbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
  }

  const empty = sections.length === 0 && elements.length === 0;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden hairline bg-[var(--surface)] min-h-[600px]"
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handleContainerPointerMove}
      onPointerLeave={handleContainerPointerLeave}
      style={{ cursor: cursorStyle, touchAction: "none" }}
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

      {/* Cursor readout — hide on touch (no hover) */}
      {cursor && !isMobile && (
        <div
          className="absolute hairline-subtle bg-[var(--surface-2)] px-8 py-4 pointer-events-none tnum"
          style={{
            bottom: 8,
            left: RULER_OFFSET + 8,
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.5px",
            color: "var(--text)",
            zIndex: 4,
          }}
        >
          <span style={{ color: "var(--text-dim)" }}>X</span> {cursor.x}{" "}
          <span style={{ color: "var(--text-dim)", marginLeft: 6 }}>Y</span>{" "}
          {cursor.y}
        </div>
      )}

      {!panning && !spaceHeld && empty && (
        <div
          className="absolute left-1/2 -translate-x-1/2 hairline-subtle bg-[var(--surface-2)] px-12 py-6 pointer-events-none"
          style={{
            top: RULER_OFFSET + 12,
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "1px",
            color: "var(--text-muted)",
            zIndex: 4,
          }}
        >
          ADD A SECTION OR ELEMENT TO BEGIN
        </div>
      )}

      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ display: "block", userSelect: "none" }}
        onPointerDown={handleSvgPointerDown}
        onClick={handleSvgClickMobile}
      >
        <defs>
          <pattern
            id="grid-minor"
            width={gridSize}
            height={gridSize}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
              fill="none"
              stroke="var(--border-faint)"
              strokeWidth={0.5 * inv}
            />
          </pattern>
          <pattern
            id="grid-major"
            width={gridSize * 5}
            height={gridSize * 5}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${gridSize * 5} 0 L 0 0 0 ${gridSize * 5}`}
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth={0.8 * inv}
            />
          </pattern>
          <pattern
            id="element-walkway-stripes"
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
            id="element-obstacle-hatch"
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

        <g
          transform={`translate(${viewport.panX} ${viewport.panY}) scale(${viewport.zoom})`}
        >
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
            fill="url(#grid-minor)"
            pointerEvents="none"
          />
          <rect
            x={0}
            y={0}
            width={canvasWidth}
            height={canvasHeight}
            fill="url(#grid-major)"
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

          {bgElements.map((el) => {
            const ref: SelectionRef = { kind: el.kind, id: el.id };
            return (
              <ElementRect
                key={el.id}
                element={el}
                selected={isRefSelected(selection, ref)}
                showHandles={showHandlesFor(ref)}
                isMobile={isMobile}
                onPointerDownItem={onPointerDownItem}
                onMoveDelta={onMoveDelta}
                onResize={onResizeElement}
                onRotateStart={onRotateStart}
                onRotateUpdate={onRotateElement}
                onDragEnd={onDragEnd}
                clientToFloor={clientToFloor}
                zoom={viewport.zoom}
                siblings={siblingsFor(`${el.kind}:${el.id}`)}
                gridSize={gridSize}
                gridEnabled={gridEnabled}
                onGuidesChange={setActiveGuides}
                panLock={panning || spaceHeld}
              />
            );
          })}

          {sections.map((s) => {
            const ref: SelectionRef = { kind: "section", id: s.id };
            return (
              <SectionRect
                key={s.id}
                section={s}
                selected={isRefSelected(selection, ref)}
                showHandles={showHandlesFor(ref)}
                isMobile={isMobile}
                onPointerDownItem={onPointerDownItem}
                onMoveDelta={onMoveDelta}
                onResize={onResizeSection}
                onRotateStart={onRotateStart}
                onRotateUpdate={onRotateSection}
                onDragEnd={onDragEnd}
                clientToFloor={clientToFloor}
                zoom={viewport.zoom}
                siblings={siblingsFor(`section:${s.id}`)}
                gridSize={gridSize}
                gridEnabled={gridEnabled}
                onGuidesChange={setActiveGuides}
                panLock={panning || spaceHeld}
              />
            );
          })}

          {fgElements.map((el) => {
            const ref: SelectionRef = { kind: el.kind, id: el.id };
            return (
              <ElementRect
                key={el.id}
                element={el}
                selected={isRefSelected(selection, ref)}
                showHandles={showHandlesFor(ref)}
                isMobile={isMobile}
                onPointerDownItem={onPointerDownItem}
                onMoveDelta={onMoveDelta}
                onResize={onResizeElement}
                onRotateStart={onRotateStart}
                onRotateUpdate={onRotateElement}
                onDragEnd={onDragEnd}
                clientToFloor={clientToFloor}
                zoom={viewport.zoom}
                siblings={siblingsFor(`${el.kind}:${el.id}`)}
                gridSize={gridSize}
                gridEnabled={gridEnabled}
                onGuidesChange={setActiveGuides}
                panLock={panning || spaceHeld}
              />
            );
          })}

          {multiBbox && (
            <rect
              x={multiBbox.x - 4 * inv}
              y={multiBbox.y - 4 * inv}
              width={multiBbox.w + 8 * inv}
              height={multiBbox.h + 8 * inv}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1 * inv}
              strokeDasharray={`${6 * inv} ${4 * inv}`}
              strokeOpacity={0.7}
              pointerEvents="none"
            />
          )}

          {activeGuides.map((g, i) =>
            g.orientation === "v" ? (
              <line
                key={`gv-${i}`}
                x1={g.position}
                y1={g.start - 8 * inv}
                x2={g.position}
                y2={g.end + 8 * inv}
                stroke="var(--accent)"
                strokeWidth={1 * inv}
                strokeDasharray={`${4 * inv} ${3 * inv}`}
                pointerEvents="none"
              />
            ) : (
              <line
                key={`gh-${i}`}
                x1={g.start - 8 * inv}
                y1={g.position}
                x2={g.end + 8 * inv}
                y2={g.position}
                stroke="var(--accent)"
                strokeWidth={1 * inv}
                strokeDasharray={`${4 * inv} ${3 * inv}`}
                pointerEvents="none"
              />
            )
          )}

          {marquee && (
            <rect
              x={Math.min(marquee.startX, marquee.currX)}
              y={Math.min(marquee.startY, marquee.currY)}
              width={Math.abs(marquee.currX - marquee.startX)}
              height={Math.abs(marquee.currY - marquee.startY)}
              fill="var(--accent)"
              fillOpacity={0.08}
              stroke="var(--accent)"
              strokeWidth={1 * inv}
              strokeDasharray={`${4 * inv} ${3 * inv}`}
              pointerEvents="none"
            />
          )}
        </g>
      </svg>
    </div>
  );
}
