"use client";

/**
 * Nautilus loader — the brand mark, drawn in.
 *
 * A logarithmic spiral (the actual growth curve of a nautilus shell,
 * b ≈ ln φ / (π/2)) rendered as one continuous path, with chamber septa
 * spanning from each point on the spiral to the same angle one whorl out.
 * The geometry is computed once at module load so the mark is exact at any
 * size.
 *
 * Motion (see the NAUTILUS LOADER block in globals.css):
 *   1. the spiral draws itself from the centre outward
 *   2. the septa fill in, innermost first
 *   3. a gold bead then travels the spiral for as long as we are waiting
 * Every path carries pathLength="1", so the dash maths are normalised and
 * the keyframes never need to know the real path lengths.
 *
 * Under prefers-reduced-motion the global rule collapses every animation to
 * a single instant frame: the shell appears fully drawn and the bead's one
 * lap ends off-path, so the mark simply sits still.
 */

const GROWTH = 0.3063; // ln(φ) / (π/2) — a "golden" nautilus
const TURNS = 2.6;
const THETA_MAX = TURNS * 2 * Math.PI;
const R_MAX = 44;
const A = R_MAX / Math.exp(GROWTH * THETA_MAX);
const CX = 50;
const CY = 52;

function point(theta: number): [number, number] {
  const r = A * Math.exp(GROWTH * theta);
  return [CX + r * Math.cos(theta), CY + r * Math.sin(theta)];
}

const f = (n: number) => n.toFixed(2);

function buildSpiral(): string {
  const parts: string[] = [];
  for (let t = 0; t <= THETA_MAX; t += 0.07) {
    const [x, y] = point(t);
    parts.push(`${parts.length ? "L" : "M"}${f(x)} ${f(y)}`);
  }
  const [x, y] = point(THETA_MAX);
  parts.push(`L${f(x)} ${f(y)}`);
  return parts.join(" ");
}

/**
 * Septa: chamber walls from the spiral at θ to the spiral at θ + 2π, bowed
 * back toward the centre so each reads as the concave wall of a chamber.
 * Only the outer whorl and a quarter get walls; deeper in they'd be
 * sub-pixel.
 */
function buildSepta(): string[] {
  const septa: string[] = [];
  const end = THETA_MAX - 2 * Math.PI;
  const start = end - 1.25 * 2 * Math.PI;
  for (let t = end; t >= start; t -= 0.42) {
    const [x1, y1] = point(t);
    const [x2, y2] = point(t + 2 * Math.PI);
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 3) continue;
    // Control point: the midpoint pulled back along the spiral's direction
    // of travel, so the septum curves the way a real one does.
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const bx = -Math.sin(t);
    const by = Math.cos(t);
    const bow = len * 0.32;
    septa.push(
      `M${f(x1)} ${f(y1)} Q${f(mx - bx * bow)} ${f(my - by * bow)} ${f(x2)} ${f(y2)}`
    );
  }
  return septa.reverse(); // innermost first, so the stagger grows outward
}

const SPIRAL = buildSpiral();
const SEPTA = buildSepta();

interface Props {
  /** Rendered size in px. */
  size?: number;
  /** Optional caption beneath the mark (also the accessible name). */
  label?: string;
  /** Compact inline usage — no caption, no vertical stack. */
  inline?: boolean;
  className?: string;
}

export function NautilusLoader({
  size = 56,
  label,
  inline = false,
  className,
}: Props) {
  const name = label ?? "Loading";
  const svg = (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className="nl"
      role="img"
      aria-label={name}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Shell */}
      <path d={SPIRAL} pathLength={1} className="nl-spiral" />
      {SEPTA.map((d, i) => (
        <path
          key={i}
          d={d}
          pathLength={1}
          className="nl-septum"
          style={{ ["--i" as string]: i }}
        />
      ))}
      {/* Travelling bead — the same spiral, drawn as a short gold dash */}
      <path d={SPIRAL} pathLength={1} className="nl-bead" />
    </svg>
  );

  if (inline) {
    return <span className={`inline-flex ${className ?? ""}`}>{svg}</span>;
  }

  return (
    <div
      className={`flex flex-col items-center gap-14 ${className ?? ""}`}
      aria-busy="true"
    >
      {svg}
      {label && (
        <span
          className="text-text-muted"
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "1.6px",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
