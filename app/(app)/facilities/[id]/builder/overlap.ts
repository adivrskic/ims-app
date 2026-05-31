// Rotation-aware overlap detection for the facility builder.
//
// Sections carry the warehouse's slot grid, so two sections occupying the same
// floor space corrupts slotting distance/occupancy math. We block saving while
// any two sections overlap. Detection uses the Separating Axis Theorem (SAT)
// over oriented bounding boxes, because sections can be rotated about their
// center (see SectionRect's `rotate(${rotation} cx cy)` transform).
//
// Elements (doors, walkways, notes, obstacles, staging) are intentionally NOT
// considered here — a door on a rack face or a note over a zone is legitimate.

export interface OrientedRect {
  floor_x: number;
  floor_y: number;
  floor_width: number;
  floor_height: number;
  rotation: number; // degrees, clockwise, about the rect center
}

interface Vec {
  x: number;
  y: number;
}

// The 4 world-space corners of an oriented rect.
function corners(r: OrientedRect): Vec[] {
  const cx = r.floor_x + r.floor_width / 2;
  const cy = r.floor_y + r.floor_height / 2;
  const hw = r.floor_width / 2;
  const hh = r.floor_height / 2;
  const rad = (r.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Local corner offsets rotated into world space.
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([lx, ly]) => ({
    x: cx + lx * cos - ly * sin,
    y: cy + lx * sin + ly * cos,
  }));
}

// The 2 unique edge-normal axes of an oriented rect (the other two are
// parallel, so testing two per rect is sufficient for SAT on rectangles).
function axes(r: OrientedRect): Vec[] {
  const rad = (r.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    { x: cos, y: sin },
    { x: -sin, y: cos },
  ];
}

function project(pts: Vec[], axis: Vec): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    const d = p.x * axis.x + p.y * axis.y;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

/** True when two oriented rectangles overlap (touching edges do not count). */
export function rectsOverlap(a: OrientedRect, b: OrientedRect): boolean {
  // Cheap axis-aligned bounding-box reject first — most pairs are far apart.
  if (a.rotation === 0 && b.rotation === 0) {
    return (
      a.floor_x < b.floor_x + b.floor_width &&
      a.floor_x + a.floor_width > b.floor_x &&
      a.floor_y < b.floor_y + b.floor_height &&
      a.floor_y + a.floor_height > b.floor_y
    );
  }

  const ca = corners(a);
  const cb = corners(b);
  const allAxes = [...axes(a), ...axes(b)];
  for (const axis of allAxes) {
    const pa = project(ca, axis);
    const pb = project(cb, axis);
    // A gap on any axis means no overlap. Use a tiny epsilon so shapes that
    // merely share an edge aren't flagged.
    if (pa.max <= pb.min + 1e-6 || pb.max <= pa.min + 1e-6) {
      return false;
    }
  }
  return true;
}

export interface OverlapItem extends OrientedRect {
  id: string;
}

/**
 * Returns the set of section ids that overlap at least one other section.
 * O(n²) — fine for the handful of sections a facility has.
 */
export function overlappingSectionIds(sections: OverlapItem[]): Set<string> {
  const hits = new Set<string>();
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      if (rectsOverlap(sections[i], sections[j])) {
        hits.add(sections[i].id);
        hits.add(sections[j].id);
      }
    }
  }
  return hits;
}
