"use client";

/**
 * Top and left ruler overlays for the floor canvas. Render in screen space
 * (not the transformed group) and tick at floor-coordinate intervals that
 * adapt to zoom.
 *
 * The ruler at any tick draws at screen_x = floor_x * zoom + panX, which
 * is the same projection the main SVG's transformed group uses, so ticks
 * always align with the underlying floor grid.
 */

interface CommonProps {
  panX: number;
  panY: number;
  zoom: number;
  size: { width: number; height: number };
}

const RULER_THICKNESS = 22;
const TARGET_LABEL_SPACING_PX = 90;
const INTERVALS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

/** Pick a major-tick interval (in floor units) so labels land ~90px apart. */
function pickInterval(zoom: number) {
  const targetFloor = TARGET_LABEL_SPACING_PX / Math.max(zoom, 0.01);
  let major = INTERVALS[INTERVALS.length - 1];
  for (const i of INTERVALS) {
    if (i >= targetFloor) {
      major = i;
      break;
    }
  }
  return { major, minor: major / 5 };
}

const TICK_FILL = "var(--surface)";
const MAJOR_TICK_STROKE = "var(--text-secondary)";
const MINOR_TICK_STROKE = "var(--text-dim)";
const LABEL_FILL = "var(--text-muted)";

export const RULER_OFFSET = RULER_THICKNESS;

export function TopRuler({ panX, zoom, size }: CommonProps) {
  const width = size.width;
  if (width <= 0) return null;

  const { major, minor } = pickInterval(zoom);
  const minFloor = -panX / zoom;
  const maxFloor = (width - panX) / zoom;

  const firstMinor = Math.ceil(minFloor / minor) * minor;
  const ticks: Array<{ x: number; f: number; isMajor: boolean }> = [];
  for (let f = firstMinor; f <= maxFloor; f += minor) {
    const x = f * zoom + panX;
    const isMajor = Math.abs(((f / major) % 1) * major) < minor * 0.01;
    ticks.push({ x, f: Math.round(f), isMajor });
  }

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: RULER_THICKNESS,
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 5,
      }}
      width={width}
      height={RULER_THICKNESS}
    >
      <rect
        x={0}
        y={0}
        width={width}
        height={RULER_THICKNESS}
        fill={TICK_FILL}
      />
      <line
        x1={0}
        y1={RULER_THICKNESS - 0.5}
        x2={width}
        y2={RULER_THICKNESS - 0.5}
        stroke="var(--border-subtle)"
        strokeWidth={1}
      />
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={t.x}
            y1={t.isMajor ? RULER_THICKNESS - 8 : RULER_THICKNESS - 4}
            x2={t.x}
            y2={RULER_THICKNESS}
            stroke={t.isMajor ? MAJOR_TICK_STROKE : MINOR_TICK_STROKE}
            strokeWidth={1}
          />
          {t.isMajor && (
            <text
              x={t.x + 3}
              y={10}
              fontFamily="var(--mono)"
              fontSize={9}
              fill={LABEL_FILL}
              dominantBaseline="middle"
            >
              {t.f}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function LeftRuler({ panY, zoom, size }: CommonProps) {
  const height = size.height;
  if (height <= 0) return null;

  const { major, minor } = pickInterval(zoom);
  const minFloor = -panY / zoom;
  const maxFloor = (height - panY) / zoom;

  const firstMinor = Math.ceil(minFloor / minor) * minor;
  const ticks: Array<{ y: number; f: number; isMajor: boolean }> = [];
  for (let f = firstMinor; f <= maxFloor; f += minor) {
    const y = f * zoom + panY;
    const isMajor = Math.abs(((f / major) % 1) * major) < minor * 0.01;
    ticks.push({ y, f: Math.round(f), isMajor });
  }

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: RULER_THICKNESS,
        height: "100%",
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 5,
      }}
      width={RULER_THICKNESS}
      height={height}
    >
      <rect
        x={0}
        y={0}
        width={RULER_THICKNESS}
        height={height}
        fill={TICK_FILL}
      />
      <line
        x1={RULER_THICKNESS - 0.5}
        y1={0}
        x2={RULER_THICKNESS - 0.5}
        y2={height}
        stroke="var(--border-subtle)"
        strokeWidth={1}
      />
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={t.isMajor ? RULER_THICKNESS - 8 : RULER_THICKNESS - 4}
            y1={t.y}
            x2={RULER_THICKNESS}
            y2={t.y}
            stroke={t.isMajor ? MAJOR_TICK_STROKE : MINOR_TICK_STROKE}
            strokeWidth={1}
          />
          {t.isMajor && (
            <text
              x={3}
              y={t.y + 3}
              fontFamily="var(--mono)"
              fontSize={9}
              fill={LABEL_FILL}
            >
              {t.f}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function RulerCorner({ floorUnit }: { floorUnit: string }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: RULER_THICKNESS,
        height: RULER_THICKNESS,
        background: "var(--surface)",
        borderRight: "1px solid var(--border-subtle)",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--mono)",
        fontSize: 8,
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        color: "var(--text-dim)",
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 6,
      }}
      aria-hidden
    >
      {floorUnit}
    </div>
  );
}
