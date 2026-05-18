// Smart-guide + grid snapping for the floor canvas.
//
// Per axis, in order:
//   1. SMART GUIDE — if a moving edge or center sits within `tolerance` floor
//      units of any sibling's edge or center, snap to it. Multiple guides
//      that resolve to the same delta are all reported so we can render
//      every alignment that just happened.
//   2. GRID — if grid snapping is enabled, round the leading moving edge to
//      the nearest grid line.
//   3. Otherwise no adjustment.
//
// `tolerance` is in floor units. Callers should derive it from a screen-
// pixel budget divided by current zoom (so the snap radius stays a constant
// visual size regardless of zoom).

export type DragMode =
  | "move"
  | "n"
  | "e"
  | "s"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Guide {
  orientation: "v" | "h";
  /** Floor-unit position on the perpendicular axis. */
  position: number;
  /** Range on the parallel axis spanned by the guide line. */
  start: number;
  end: number;
}

export interface SnapResult {
  /** Adjustment to apply on the X axis (positive = right). */
  dx: number;
  /** Adjustment to apply on the Y axis (positive = down). */
  dy: number;
  guides: Guide[];
}

interface AxisSnap {
  delta: number;
  /** Floor-unit positions where guide lines should be drawn. */
  targets: number[];
  /** Sibling that contributed each target — used to span the guide line. */
  siblings: Rect[];
}

function snapAxis(
  movingEdges: number[],
  siblings: Rect[],
  pickSiblingEdges: (s: Rect) => number[],
  tolerance: number
): AxisSnap | null {
  let best: AxisSnap | null = null;

  for (const me of movingEdges) {
    for (const s of siblings) {
      for (const te of pickSiblingEdges(s)) {
        const diff = te - me;
        if (Math.abs(diff) > tolerance) continue;
        if (best === null || Math.abs(diff) < Math.abs(best.delta) - 0.01) {
          best = { delta: diff, targets: [te], siblings: [s] };
        } else if (Math.abs(diff - best.delta) < 0.01) {
          best.targets.push(te);
          best.siblings.push(s);
        }
      }
    }
  }

  return best;
}

export function computeSnap(
  moving: Rect,
  siblings: Rect[],
  mode: DragMode,
  opts: { tolerance: number; gridSize: number; gridEnabled: boolean }
): SnapResult {
  const { tolerance, gridSize, gridEnabled } = opts;

  // Which edges of the moving rect are actually moving — only those are
  // candidates for snapping. For a translate it's everything; for a resize
  // only the handle's edges.
  const movingXEdges: number[] = [];
  const movingYEdges: number[] = [];

  if (mode === "move") {
    movingXEdges.push(
      moving.x,
      moving.x + moving.width / 2,
      moving.x + moving.width
    );
    movingYEdges.push(
      moving.y,
      moving.y + moving.height / 2,
      moving.y + moving.height
    );
  } else {
    if (mode.includes("w")) movingXEdges.push(moving.x);
    if (mode.includes("e")) movingXEdges.push(moving.x + moving.width);
    if (mode.includes("n")) movingYEdges.push(moving.y);
    if (mode.includes("s")) movingYEdges.push(moving.y + moving.height);
  }

  const xSnap =
    movingXEdges.length > 0
      ? snapAxis(
          movingXEdges,
          siblings,
          (s) => [s.x, s.x + s.width / 2, s.x + s.width],
          tolerance
        )
      : null;

  const ySnap =
    movingYEdges.length > 0
      ? snapAxis(
          movingYEdges,
          siblings,
          (s) => [s.y, s.y + s.height / 2, s.y + s.height],
          tolerance
        )
      : null;

  let dx = 0;
  let dy = 0;
  const guides: Guide[] = [];

  // --- X axis ---
  if (xSnap) {
    dx = xSnap.delta;
    const after: Rect = { ...moving, x: moving.x + dx };
    for (let i = 0; i < xSnap.targets.length; i++) {
      const t = xSnap.targets[i];
      const sib = xSnap.siblings[i];
      const minY = Math.min(after.y, sib.y);
      const maxY = Math.max(after.y + after.height, sib.y + sib.height);
      guides.push({ orientation: "v", position: t, start: minY, end: maxY });
    }
  } else if (gridEnabled && movingXEdges.length > 0) {
    // Anchor on the first moving edge. For "move" that's the left edge
    // (translates the whole rect). For a resize handle it's the moving edge.
    const anchor = movingXEdges[0];
    dx = Math.round(anchor / gridSize) * gridSize - anchor;
  }

  // --- Y axis ---
  if (ySnap) {
    dy = ySnap.delta;
    const after: Rect = { ...moving, y: moving.y + dy };
    for (let i = 0; i < ySnap.targets.length; i++) {
      const t = ySnap.targets[i];
      const sib = ySnap.siblings[i];
      const minX = Math.min(after.x, sib.x);
      const maxX = Math.max(after.x + after.width, sib.x + sib.width);
      guides.push({ orientation: "h", position: t, start: minX, end: maxX });
    }
  } else if (gridEnabled && movingYEdges.length > 0) {
    const anchor = movingYEdges[0];
    dy = Math.round(anchor / gridSize) * gridSize - anchor;
  }

  return { dx, dy, guides };
}
