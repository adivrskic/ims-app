"use client";

import { useEffect, useRef, useState } from "react";
import {
  Plus,
  ScanLine,
  Undo2,
  Redo2,
  Copy,
  Save,
  Check,
  AlertTriangle,
  Magnet,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  ChevronDown,
  History,
  Ruler,
} from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { ELEMENT_KINDS_ORDERED, ELEMENT_PRESETS } from "./elementPresets";
import type { ElementKind } from "./types";

interface Props {
  sectionCount: number;
  elementCount: number;
  selectionCount: number;
  dirty: boolean;
  saving: boolean;
  saveBlocked?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canDuplicate: boolean;
  feedback: { kind: "ok" | "err"; msg: string } | null;
  onAddSection: () => void;
  onAddElement: (kind: ElementKind) => void;
  onScan: () => void;
  onOpenSnapshots: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDuplicate: () => void;
  onSave: () => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  floorUnit: string;
  onToggleUnit: () => void;
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFit: () => void;
}

export function BuilderToolbar({
  sectionCount,
  elementCount,
  selectionCount,
  dirty,
  saving,
  saveBlocked = false,
  canUndo,
  canRedo,
  canDuplicate,
  feedback,
  onAddSection,
  onAddElement,
  onScan,
  onOpenSnapshots,
  onUndo,
  onRedo,
  onDuplicate,
  onSave,
  snapEnabled,
  onToggleSnap,
  floorUnit,
  onToggleUnit,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFit,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!addRef.current?.contains(e.target as Node)) setAddOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAddOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [addOpen]);

  const totalCount = sectionCount + elementCount;
  const countLabel =
    selectionCount > 0
      ? `${selectionCount} of ${totalCount} selected`
      : `${totalCount} ${totalCount === 1 ? "item" : "items"}`;

  return (
    <header className="hairline bg-[var(--surface)] px-14 py-10 flex items-center gap-10 flex-wrap">
      <div className="relative flex items-center" ref={addRef}>
        <CornerButton
          type="button"
          variant="primary"
          size="sm"
          onClick={onAddSection}
        >
          <Plus size={11} strokeWidth={1.5} />
          Add section
        </CornerButton>
        <button
          type="button"
          onClick={() => setAddOpen((v) => !v)}
          aria-label="More elements to add"
          aria-expanded={addOpen}
          className={`hairline-subtle border-l-0 p-7 hover:border-[var(--accent)] transition-colors ${
            addOpen
              ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-dim)]"
              : "text-text-secondary hover:text-text"
          }`}
          title="More element types"
        >
          <ChevronDown size={11} strokeWidth={1.5} />
        </button>

        {addOpen && (
          <div
            role="menu"
            className="absolute top-full left-0 mt-4 z-20 hairline bg-[var(--surface)] shadow-lg flex flex-col"
            style={{ minWidth: 240 }}
          >
            <AddMenuItem
              icon={Layers}
              label="Section"
              description="Rack zone with bays and levels"
              onSelect={() => {
                setAddOpen(false);
                onAddSection();
              }}
            />
            <div className="hairline-t mx-10" />
            {ELEMENT_KINDS_ORDERED.map((kind) => {
              const preset = ELEMENT_PRESETS[kind];
              return (
                <AddMenuItem
                  key={kind}
                  icon={preset.icon}
                  label={kindToLabel(kind)}
                  description={preset.description}
                  onSelect={() => {
                    setAddOpen(false);
                    onAddElement(kind);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <CornerButton type="button" variant="ghost" size="sm" onClick={onScan}>
        <ScanLine size={11} strokeWidth={1.5} />
        Scan blueprint
      </CornerButton>

      <CornerButton
        type="button"
        variant="ghost"
        size="sm"
        onClick={onOpenSnapshots}
      >
        <History size={11} strokeWidth={1.5} />
        Snapshots
      </CornerButton>

      <span className="h-14 w-px bg-[var(--border-subtle)]" aria-hidden />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="hairline-subtle p-7 hover:border-[var(--border-hover)] text-text-secondary hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Undo"
          title="Undo (⌘Z)"
        >
          <Undo2 size={11} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="hairline-subtle p-7 hover:border-[var(--border-hover)] text-text-secondary hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Redo"
          title="Redo (⌘⇧Z)"
        >
          <Redo2 size={11} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          disabled={!canDuplicate}
          className="hairline-subtle p-7 hover:border-[var(--border-hover)] text-text-secondary hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Duplicate selected"
          title="Duplicate (⌘D)"
        >
          <Copy size={11} strokeWidth={1.5} />
        </button>
      </div>

      <span className="mono-sm text-text-muted ml-4">{countLabel}</span>

      <span className="h-14 w-px bg-[var(--border-subtle)]" aria-hidden />

      <button
        type="button"
        onClick={onToggleSnap}
        className={`hairline-subtle px-10 py-7 inline-flex items-center gap-6 transition-colors ${
          snapEnabled
            ? "border-[var(--accent-soft)] bg-[var(--accent-dim)] text-[var(--accent)]"
            : "hover:border-[var(--border-hover)] text-text-secondary hover:text-text"
        }`}
        aria-label="Toggle snap to grid"
        aria-pressed={snapEnabled}
        title="Snap to grid and align with siblings · hold ⌥ to bypass while dragging"
      >
        <Magnet size={11} strokeWidth={1.5} />
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "1.2px",
            textTransform: "uppercase",
          }}
        >
          Snap
        </span>
      </button>

      <button
        type="button"
        onClick={onToggleUnit}
        className="hairline-subtle px-10 py-7 inline-flex items-center gap-6 hover:border-[var(--border-hover)] text-text-secondary hover:text-text transition-colors"
        aria-label={`Floor unit: ${
          floorUnit === "m" ? "meters" : "feet"
        }. Click to switch.`}
        title="Floor measurement unit · switching only relabels (coordinates are not rescaled)"
      >
        <Ruler size={11} strokeWidth={1.5} />
        <span
          className="tnum"
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "1.2px",
            textTransform: "uppercase",
          }}
        >
          {floorUnit === "m" ? "m" : "ft"}
        </span>
      </button>

      <div className="ml-auto flex items-center gap-10 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onZoomOut}
            className="hairline-subtle p-7 hover:border-[var(--border-hover)] text-text-secondary hover:text-text transition-colors"
            aria-label="Zoom out"
            title="Zoom out (⌘−)"
          >
            <ZoomOut size={11} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onZoomReset}
            className="hairline-subtle px-10 py-7 hover:border-[var(--border-hover)] text-text-secondary hover:text-text transition-colors tnum"
            aria-label="Reset zoom to 100%"
            title="Reset zoom (⇧0)"
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: "0.8px",
              minWidth: 56,
            }}
          >
            {Math.round(zoomPercent)}%
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            className="hairline-subtle p-7 hover:border-[var(--border-hover)] text-text-secondary hover:text-text transition-colors"
            aria-label="Zoom in"
            title="Zoom in (⌘+)"
          >
            <ZoomIn size={11} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onFit}
            className="hairline-subtle p-7 hover:border-[var(--border-hover)] text-text-secondary hover:text-text transition-colors"
            aria-label="Fit floor to view"
            title="Fit to view (⇧1)"
          >
            <Maximize2 size={11} strokeWidth={1.5} />
          </button>
        </div>

        {feedback && (
          <span
            className={`inline-flex items-center gap-6 mono-sm ${
              feedback.kind === "ok"
                ? "text-[var(--success)]"
                : "text-[var(--danger)]"
            }`}
          >
            {feedback.kind === "ok" ? (
              <Check size={11} strokeWidth={1.5} />
            ) : (
              <AlertTriangle size={11} strokeWidth={1.5} />
            )}
            <span>{feedback.msg}</span>
          </span>
        )}

        <CornerButton
          type="button"
          variant="primary"
          size="sm"
          onClick={onSave}
          loading={saving}
          disabled={!dirty || saving || saveBlocked}
          title={
            saveBlocked ? "Resolve overlapping sections before saving" : undefined
          }
        >
          <Save size={11} strokeWidth={1.5} />
          {saveBlocked ? "Overlap" : dirty ? "Save layout" : "Saved"}
        </CornerButton>
      </div>
    </header>
  );
}

function AddMenuItem({
  icon: Icon,
  label,
  description,
  onSelect,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      role="menuitem"
      className="flex items-start gap-10 px-12 py-10 text-left hover:bg-[var(--surface-2)] transition-colors"
    >
      <span className="w-22 h-22 hairline-subtle bg-[var(--accent-dim)] flex items-center justify-center shrink-0 text-[var(--accent)] mt-1">
        <Icon size={12} strokeWidth={1.5} />
      </span>
      <div className="flex flex-col gap-2 min-w-0">
        <span
          className="text-text"
          style={{
            fontFamily: "var(--display)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <span
          className="text-text-muted"
          style={{ fontFamily: "var(--mono)", fontSize: 10, lineHeight: 1.45 }}
        >
          {description}
        </span>
      </div>
    </button>
  );
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
