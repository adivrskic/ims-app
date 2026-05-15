"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { BuilderToolbar } from "./BuilderToolbar";
import { FloorCanvas } from "./FloorCanvas";
import { SectionInspector } from "./SectionInspector";
import { ScanUploadModal } from "./ScanUploadModal";
import { saveLayout } from "./actions";
import type { SectionDraft, DetectedSection } from "./types";

interface Props {
  warehouseId: string;
  canvasWidth: number;
  canvasHeight: number;
  floorUnit: string;
  initialSections: SectionDraft[];
}

interface State {
  sections: SectionDraft[];
  deletedIds: string[];
  selectedId: string | null;
  past: Array<{ sections: SectionDraft[]; deletedIds: string[] }>;
  future: Array<{ sections: SectionDraft[]; deletedIds: string[] }>;
  dirty: boolean;
}

type Action =
  | { type: "select"; id: string | null }
  | { type: "add" }
  | { type: "update"; id: string; patch: Partial<SectionDraft> }
  | { type: "delete"; id: string }
  | {
      type: "import";
      detected: DetectedSection[];
      canvasWidth: number;
      canvasHeight: number;
    }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset_dirty" };

const COLORS = [
  "#D4A853",
  "#3b82f6",
  "#10b981",
  "#ef4444",
  "#a855f7",
  "#f97316",
  "#6b7280",
];
const HISTORY_MAX = 50;

function snap(state: State): {
  sections: SectionDraft[];
  deletedIds: string[];
} {
  return { sections: state.sections, deletedIds: state.deletedIds };
}

function pushHistory(state: State): State {
  const past = [...state.past, snap(state)].slice(-HISTORY_MAX);
  return { ...state, past, future: [] };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "select":
      return { ...state, selectedId: action.id };

    case "add": {
      const nextSort =
        Math.max(0, ...state.sections.map((s) => s.sort_order)) + 1;
      const code = String.fromCharCode(65 + state.sections.length) || "X";
      const newSection: SectionDraft = {
        id: `new-${Math.random().toString(36).slice(2, 10)}`,
        isNew: true,
        code,
        name: `Section ${code}`,
        floor_x: 40,
        floor_y: 40,
        floor_width: 280,
        floor_height: 180,
        rotation: 0,
        total_bays: 10,
        total_levels: 3,
        color: COLORS[state.sections.length % COLORS.length],
        sort_order: nextSort,
      };
      const next = pushHistory(state);
      return {
        ...next,
        sections: [...state.sections, newSection],
        selectedId: newSection.id,
        dirty: true,
      };
    }

    case "update": {
      const next = pushHistory(state);
      return {
        ...next,
        sections: state.sections.map((s) =>
          s.id === action.id ? { ...s, ...action.patch } : s
        ),
        dirty: true,
      };
    }

    case "delete": {
      const target = state.sections.find((s) => s.id === action.id);
      if (!target) return state;
      const next = pushHistory(state);
      const deletedIds = target.isNew
        ? state.deletedIds
        : [...state.deletedIds, target.id];
      return {
        ...next,
        sections: state.sections.filter((s) => s.id !== action.id),
        deletedIds,
        selectedId: null,
        dirty: true,
      };
    }

    case "import": {
      const { detected, canvasWidth, canvasHeight } = action;
      // Mark all existing sections for deletion (replace mode) — alternative
      // would be merge by code; keeping simple: scan replaces.
      const existingIds = state.sections
        .filter((s) => !s.isNew)
        .map((s) => s.id);
      const newSections: SectionDraft[] = detected.map((d, i) => ({
        id: `new-${Math.random().toString(36).slice(2, 10)}`,
        isNew: true,
        code: d.code,
        name: d.name,
        floor_x: d.x * canvasWidth,
        floor_y: d.y * canvasHeight,
        floor_width: d.width * canvasWidth,
        floor_height: d.height * canvasHeight,
        rotation: 0,
        total_bays: d.approximate_bays,
        total_levels: d.approximate_levels,
        color: COLORS[i % COLORS.length],
        sort_order: i,
      }));
      const next = pushHistory(state);
      return {
        ...next,
        sections: newSections,
        deletedIds: [...state.deletedIds, ...existingIds],
        selectedId: null,
        dirty: true,
      };
    }

    case "undo": {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return {
        ...state,
        sections: prev.sections,
        deletedIds: prev.deletedIds,
        past: state.past.slice(0, -1),
        future: [snap(state), ...state.future].slice(0, HISTORY_MAX),
        dirty: true,
      };
    }

    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        ...state,
        sections: next.sections,
        deletedIds: next.deletedIds,
        past: [...state.past, snap(state)].slice(-HISTORY_MAX),
        future: state.future.slice(1),
        dirty: true,
      };
    }

    case "reset_dirty":
      return { ...state, dirty: false };

    default:
      return state;
  }
}

export function BuilderShell({
  warehouseId,
  canvasWidth,
  canvasHeight,
  floorUnit,
  initialSections,
}: Props) {
  const [state, dispatch] = useReducer(reducer, {
    sections: initialSections,
    deletedIds: [],
    selectedId: null,
    past: [],
    future: [],
    dirty: false,
  });

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  const selected =
    state.sections.find((s) => s.id === state.selectedId) ?? null;

  const handleSave = useCallback(async () => {
    setSaving(true);
    setFeedback(null);
    const result = await saveLayout({
      warehouseId,
      sections: state.sections,
      deletedIds: state.deletedIds,
    });
    setSaving(false);
    if (result.error) {
      setFeedback({ kind: "err", msg: result.error });
      return;
    }
    setFeedback({ kind: "ok", msg: result.success ?? "Saved" });
    dispatch({ type: "reset_dirty" });
    setTimeout(() => setFeedback(null), 2000);
  }, [warehouseId, state.sections, state.deletedIds]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "undo" });
      } else if (
        ((e.metaKey || e.ctrlKey) &&
          e.shiftKey &&
          e.key.toLowerCase() === "z") ||
        ((e.metaKey || e.ctrlKey) && e.key === "y")
      ) {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (state.selectedId) {
          e.preventDefault();
          dispatch({ type: "delete", id: state.selectedId });
        }
      } else if (e.key === "Escape") {
        dispatch({ type: "select", id: null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.selectedId, handleSave]);

  // Beforeunload warning when dirty
  useEffect(() => {
    if (!state.dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state.dirty]);

  return (
    <div className="flex flex-col gap-12 flex-1 min-h-0">
      <BuilderToolbar
        sectionCount={state.sections.length}
        dirty={state.dirty}
        saving={saving}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        feedback={feedback}
        onAdd={() => dispatch({ type: "add" })}
        onScan={() => setScanOpen(true)}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onSave={handleSave}
      />

      <div className="flex gap-12 flex-1 min-h-0">
        <FloorCanvas
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          floorUnit={floorUnit}
          sections={state.sections}
          selectedId={state.selectedId}
          onSelect={(id) => dispatch({ type: "select", id })}
          onUpdate={(id, patch) => dispatch({ type: "update", id, patch })}
        />

        <SectionInspector
          section={selected}
          floorUnit={floorUnit}
          onUpdate={(patch) =>
            selected && dispatch({ type: "update", id: selected.id, patch })
          }
          onDelete={() =>
            selected && dispatch({ type: "delete", id: selected.id })
          }
        />
      </div>

      {scanOpen && (
        <ScanUploadModal
          onClose={() => setScanOpen(false)}
          onImport={(detected) => {
            dispatch({
              type: "import",
              detected,
              canvasWidth,
              canvasHeight,
            });
            setScanOpen(false);
          }}
        />
      )}
    </div>
  );
}
