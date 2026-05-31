"use client";

import { Trash2 } from "lucide-react";
import { SectionInspector } from "./SectionInspector";
import { ElementInspector } from "./ElementInspector";
import type {
  SectionDraft,
  LayoutElementDraft,
  SelectionRef,
  CategoryOption,
} from "./types";

interface Props {
  selection: SelectionRef[];
  sections: SectionDraft[];
  elements: LayoutElementDraft[];
  floorUnit: string;
  categories: CategoryOption[];
  onUpdateSection: (id: string, patch: Partial<SectionDraft>) => void;
  onUpdateElement: (id: string, patch: Partial<LayoutElementDraft>) => void;
  onDeleteSelected: () => void;
}

export function Inspector({
  selection,
  sections,
  elements,
  floorUnit,
  categories,
  onUpdateSection,
  onUpdateElement,
  onDeleteSelected,
}: Props) {
  if (selection.length === 0) {
    return (
      <aside
        className="hairline bg-[var(--surface)] p-16 flex flex-col gap-12 shrink-0"
        style={{ width: 280 }}
        aria-label="Inspector"
      >
        <p className="label-text text-text-muted">Inspector</p>
        <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
          Select an item to edit its properties. Drag on empty canvas to
          marquee-select multiple. Shift+click to add or remove from the
          selection.
        </p>
      </aside>
    );
  }

  if (selection.length > 1) {
    const sectionCount = selection.filter((r) => r.kind === "section").length;
    const elementCount = selection.length - sectionCount;
    return (
      <aside
        className="hairline bg-[var(--surface)] p-16 flex flex-col gap-12 shrink-0"
        style={{ width: 280 }}
        aria-label="Inspector"
      >
        <div className="flex items-center justify-between">
          <p className="label-text text-text-muted">Multi-select</p>
          <button
            type="button"
            onClick={onDeleteSelected}
            className="hairline-subtle p-7 hover:border-[var(--danger)] text-text-secondary hover:text-[var(--danger)] transition-colors"
            aria-label="Delete selected"
            title="Delete (Del)"
          >
            <Trash2 size={11} strokeWidth={1.5} />
          </button>
        </div>
        <div className="mono-sm text-text" style={{ lineHeight: 1.6 }}>
          <span
            style={{
              fontFamily: "var(--display)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {selection.length} items
          </span>
        </div>
        <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
          {sectionCount > 0 &&
            `${sectionCount} section${sectionCount === 1 ? "" : "s"}`}
          {sectionCount > 0 && elementCount > 0 && " · "}
          {elementCount > 0 &&
            `${elementCount} element${elementCount === 1 ? "" : "s"}`}
        </p>
        <p
          className="mono-sm text-text-dim hairline-t pt-12"
          style={{ lineHeight: 1.6 }}
        >
          Drag any selected item to move the group. Arrow keys nudge. ⌘D
          duplicates. Del removes all.
        </p>
      </aside>
    );
  }

  const ref = selection[0];

  if (ref.kind === "section") {
    const section = sections.find((s) => s.id === ref.id) ?? null;
    return (
      <SectionInspector
        section={section}
        floorUnit={floorUnit}
        categories={categories}
        onUpdate={(patch) => section && onUpdateSection(section.id, patch)}
        onDelete={onDeleteSelected}
      />
    );
  }

  const element = elements.find((e) => e.id === ref.id);
  if (!element) {
    return (
      <aside
        className="hairline bg-[var(--surface)] p-16 flex flex-col gap-12 shrink-0"
        style={{ width: 280 }}
        aria-label="Inspector"
      >
        <p className="label-text text-text-muted">Inspector</p>
      </aside>
    );
  }

  return (
    <ElementInspector
      element={element}
      floorUnit={floorUnit}
      onUpdate={(patch) => onUpdateElement(element.id, patch)}
      onDelete={onDeleteSelected}
    />
  );
}
