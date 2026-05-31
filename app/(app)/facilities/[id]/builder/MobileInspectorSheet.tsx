"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Inspector } from "./Inspector";
import type {
  SectionDraft,
  LayoutElementDraft,
  SelectionRef,
  ElementKind,
  CategoryOption,
} from "./types";

interface Props {
  open: boolean;
  selection: SelectionRef[];
  sections: SectionDraft[];
  elements: LayoutElementDraft[];
  floorUnit: string;
  categories: CategoryOption[];
  onUpdateSection: (id: string, patch: Partial<SectionDraft>) => void;
  onUpdateElement: (id: string, patch: Partial<LayoutElementDraft>) => void;
  onDeleteSelected: () => void;
  onClose: () => void;
}

/**
 * Bottom-sheet wrapper around the Inspector for mobile viewports.
 *
 * Slides up from below when something is selected. A backdrop covers the
 * lower canvas region; tapping it (or the X) clears the selection, which
 * in turn closes the sheet. Re-uses the desktop Inspector internals
 * verbatim — the [&_aside] descendant overrides force the inner asides
 * to render full-width, borderless, transparent so they fit the sheet
 * chrome.
 */
export function MobileInspectorSheet({
  open,
  selection,
  sections,
  elements,
  floorUnit,
  categories,
  onUpdateSection,
  onUpdateElement,
  onDeleteSelected,
  onClose,
}: Props) {
  // Close on Escape (paired with on-screen X). Keep the document-level
  // scroll lock loose: the canvas already sets touch-action: none.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const title = sheetTitle(selection);

  return (
    <>
      {/* Backdrop — tap to deselect */}
      <div
        className={`absolute inset-0 z-20 bg-black/35 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 hairline-t bg-[var(--surface)] flex flex-col transition-transform duration-200 ease-out
          [&_aside]:!w-full [&_aside]:!border-none [&_aside]:!bg-transparent [&_aside]:!overflow-visible`}
        style={{
          transform: open ? "translateY(0)" : "translateY(100%)",
          maxHeight: "65vh",
          minHeight: 220,
        }}
        role="dialog"
        aria-label="Item inspector"
        aria-modal="false"
      >
        {/* Drag affordance (visual only for now) */}
        <div className="flex items-center justify-center pt-8 pb-2" aria-hidden>
          <div
            className="bg-[var(--border)]"
            style={{ width: 36, height: 3, borderRadius: 2 }}
          />
        </div>

        {/* Header */}
        <header className="hairline-b px-16 pt-6 pb-10 flex items-center justify-between gap-10 shrink-0">
          <h2
            className="text-text truncate"
            style={{
              fontFamily: "var(--display)",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.2px",
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="hairline-subtle p-9 hover:border-[var(--accent)] text-text-secondary hover:text-text transition-colors"
            aria-label="Close inspector"
          >
            <X size={12} strokeWidth={1.5} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Inspector
            selection={selection}
            sections={sections}
            elements={elements}
            floorUnit={floorUnit}
            categories={categories}
            onUpdateSection={onUpdateSection}
            onUpdateElement={onUpdateElement}
            onDeleteSelected={onDeleteSelected}
          />
        </div>
      </div>
    </>
  );
}

function sheetTitle(selection: SelectionRef[]): string {
  if (selection.length === 0) return "Inspector";
  if (selection.length === 1) {
    const ref = selection[0];
    return ref.kind === "section" ? "Section" : kindToLabel(ref.kind);
  }
  return `${selection.length} items selected`;
}

function kindToLabel(kind: ElementKind): string {
  switch (kind) {
    case "walkway":
      return "Walkway";
    case "note":
      return "Note";
    case "door":
      return "Door";
    case "obstacle":
      return "Obstacle";
    case "staging":
      return "Staging zone";
  }
}
