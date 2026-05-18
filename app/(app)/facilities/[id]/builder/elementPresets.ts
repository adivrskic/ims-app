import {
  Route,
  StickyNote,
  DoorClosed,
  Octagon,
  PackagePlus,
  type LucideIcon,
} from "lucide-react";
import type { ElementKind } from "./types";

export interface ElementPreset {
  label: string;
  defaultWidth: number; // floor units
  defaultHeight: number;
  defaultColor: string;
  icon: LucideIcon;
  description: string;
}

/**
 * Defaults for each element kind. Tuned for a 1200×800 ft canvas — feel
 * free to retune. Colors are chosen from the section palette where it
 * makes sense, with custom values for muted neutrals.
 *
 * `label` is the placeholder text that appears in the rect; the user
 * overrides it via the inspector.
 */
export const ELEMENT_PRESETS: Record<ElementKind, ElementPreset> = {
  walkway: {
    label: "Walkway",
    defaultWidth: 240,
    defaultHeight: 40,
    defaultColor: "#6b7280",
    icon: Route,
    description: "Aisle or path between sections",
  },
  note: {
    label: "Note",
    defaultWidth: 140,
    defaultHeight: 90,
    defaultColor: "#D4A853",
    icon: StickyNote,
    description: "Free-text annotation pinned to the floor",
  },
  door: {
    label: "Door",
    defaultWidth: 48,
    defaultHeight: 12,
    defaultColor: "#D4A853",
    icon: DoorClosed,
    description: "Entry, exit, or dock door",
  },
  obstacle: {
    label: "Column",
    defaultWidth: 50,
    defaultHeight: 50,
    defaultColor: "#404040",
    icon: Octagon,
    description: "Pillar, equipment, or non-pickable obstacle",
  },
  staging: {
    label: "Staging",
    defaultWidth: 200,
    defaultHeight: 160,
    defaultColor: "#3b82f6",
    icon: PackagePlus,
    description: "Pallet drop, packing, or inbound staging zone",
  },
};

export const ELEMENT_KINDS_ORDERED: ElementKind[] = [
  "walkway",
  "note",
  "door",
  "staging",
  "obstacle",
];
