// ── Sections ──────────────────────────────────────────────────────────────
export interface SectionDraft {
  id: string;
  isNew: boolean;
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
  sort_order: number;
  // Max units a single (bay, level) slot in this section can hold.
  // null = unlimited / unknown (slotting treats capacity as a soft factor).
  slot_capacity: number | null;
}

// ── Layout elements ───────────────────────────────────────────────────────
export const ELEMENT_KINDS = [
  "walkway",
  "note",
  "door",
  "obstacle",
  "staging",
] as const;

export type ElementKind = (typeof ELEMENT_KINDS)[number];

export interface LayoutElementDraft {
  id: string;
  isNew: boolean;
  kind: ElementKind;
  floor_x: number;
  floor_y: number;
  floor_width: number;
  floor_height: number;
  rotation: number;
  color: string;
  label: string;
  data: Record<string, unknown>;
  sort_order: number;
}

// ── Selection ─────────────────────────────────────────────────────────────
export type SelectionRef =
  | { kind: "section"; id: string }
  | { kind: ElementKind; id: string };

export function refsEqual(a: SelectionRef, b: SelectionRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}

// ── Blueprint scan ────────────────────────────────────────────────────────
export interface DetectedSection {
  code: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  approximate_bays: number;
  approximate_levels: number;
}
