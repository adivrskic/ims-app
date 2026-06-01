import "server-only";

/**
 * Aisle/path travel distance over a warehouse floor plan (slotting §6/Open
 * decision #4 — replaces the centroid-Euclidean approximation).
 *
 * Rasterizes the floor into a coarse grid, blocks cells covered by racks
 * (sections) and obstacle elements, frees cells covered by walkways, and runs a
 * multi-source BFS from the door/staging origins. A section's travel distance is
 * the shortest reachable path to an origin from a cell on its pick face (the ring
 * just outside the rack), so distance routes AROUND obstacles instead of through
 * them. Unreachable sections return null and the caller falls back to Euclidean.
 *
 * Pure + deterministic; grid is bounded so this stays cheap on a page render.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FloorPathInput {
  sections: { id: string; rect: Rect }[];
  /** Racks + obstacles — impassable unless a walkway is laid over them. */
  blockers: Rect[];
  walkways: Rect[];
  /** Door / staging rects — BFS sources (and passable). */
  origins: Rect[];
}

const TARGET_COLS = 120; // grid resolution cap (keeps cols*rows bounded)
const MAX_CELLS = 40_000;

export function sectionPathDistances(
  input: FloorPathInput
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  if (input.origins.length === 0) {
    for (const s of input.sections) out.set(s.id, null);
    return out;
  }

  // Floor bounds from every rect (clamped to a non-negative origin).
  const all = [
    ...input.sections.map((s) => s.rect),
    ...input.blockers,
    ...input.walkways,
    ...input.origins,
  ];
  let maxX = 1;
  let maxY = 1;
  for (const r of all) {
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }

  let cell = Math.max(4, Math.ceil(maxX / TARGET_COLS));
  let cols = Math.ceil(maxX / cell) + 1;
  let rows = Math.ceil(maxY / cell) + 1;
  // Guard against a pathological aspect ratio blowing up the grid.
  while (cols * rows > MAX_CELLS) {
    cell *= 2;
    cols = Math.ceil(maxX / cell) + 1;
    rows = Math.ceil(maxY / cell) + 1;
  }

  const idx = (r: number, c: number) => r * cols + c;
  const blocked = new Uint8Array(cols * rows);
  const walk = new Uint8Array(cols * rows);
  const origin = new Uint8Array(cols * rows);

  const stamp = (rect: Rect, grid: Uint8Array) => {
    const c0 = Math.max(0, Math.floor(rect.x / cell));
    const c1 = Math.min(cols - 1, Math.floor((rect.x + rect.w) / cell));
    const r0 = Math.max(0, Math.floor(rect.y / cell));
    const r1 = Math.min(rows - 1, Math.floor((rect.y + rect.h) / cell));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) grid[idx(r, c)] = 1;
  };

  for (const b of input.blockers) stamp(b, blocked);
  for (const w of input.walkways) stamp(w, walk);
  for (const o of input.origins) stamp(o, origin);

  // A cell is passable unless it's blocked AND not freed by a walkway/origin.
  const passable = (r: number, c: number) => {
    const i = idx(r, c);
    return origin[i] === 1 || walk[i] === 1 || blocked[i] === 0;
  };

  // Multi-source BFS from origin cells (4-connectivity).
  const distCells = new Int32Array(cols * rows).fill(-1);
  let head = 0;
  const queue: number[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (origin[idx(r, c)] === 1 && passable(r, c)) {
        distCells[idx(r, c)] = 0;
        queue.push(idx(r, c));
      }

  while (head < queue.length) {
    const cur = queue[head++];
    const r = Math.floor(cur / cols);
    const c = cur - r * cols;
    const d = distCells[cur];
    const nbrs = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ];
    for (const [nr, nc] of nbrs) {
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const ni = idx(nr, nc);
      if (distCells[ni] !== -1 || !passable(nr, nc)) continue;
      distCells[ni] = d + 1;
      queue.push(ni);
    }
  }

  // Each section's distance = nearest reachable cell on the ring just outside it.
  for (const s of input.sections) {
    const c0 = Math.max(0, Math.floor(s.rect.x / cell) - 1);
    const c1 = Math.min(cols - 1, Math.floor((s.rect.x + s.rect.w) / cell) + 1);
    const r0 = Math.max(0, Math.floor(s.rect.y / cell) - 1);
    const r1 = Math.min(rows - 1, Math.floor((s.rect.y + s.rect.h) / cell) + 1);
    let best = -1;
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const d = distCells[idx(r, c)];
        if (d >= 0 && (best === -1 || d < best)) best = d;
      }
    out.set(s.id, best === -1 ? null : best * cell);
  }

  return out;
}
