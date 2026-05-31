"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { AlertTriangle } from "lucide-react";
import { BuilderToolbar } from "./BuilderToolbar";
import { overlappingSectionIds as computeOverlaps } from "./overlap";
import { FloorCanvas } from "./FloorCanvas";
import { Inspector } from "./Inspector";
import { ScanUploadModal } from "./ScanUploadModal";
import { saveLayout, setFloorUnit, type FloorUnit } from "./actions";
import { useViewport } from "./useViewport";
import { ELEMENT_PRESETS } from "./elementPresets";
import { refsEqual } from "./types";
import { useIsMobile } from "./useIsMobile";
import { MobileInspectorSheet } from "./MobileInspectorSheet";
import { SnapshotsModal } from "./SnapshotsModal";
import type { RestoreSnapshotResult } from "./actions";
import type {
  SectionDraft,
  LayoutElementDraft,
  DetectedSection,
  SelectionRef,
  ElementKind,
} from "./types";
import type { DragMode } from "./snap";
import type { RectPatch } from "./useDraggableItem";

interface Props {
  warehouseId: string;
  canvasWidth: number;
  canvasHeight: number;
  floorUnit: string;
  initialSections: SectionDraft[];
  initialElements: LayoutElementDraft[];
}

interface HistoryEntry {
  sections: SectionDraft[];
  elements: LayoutElementDraft[];
  deletedSectionIds: string[];
  deletedElementIds: string[];
}

interface State extends HistoryEntry {
  selection: SelectionRef[];
  // Drag transaction state. dragInProgress is true between begin_drag and
  // end_drag — used to coalesce per-frame patches into a single undo entry.
  // moveSnapshot is populated only for move-mode drags so deltas can be
  // applied against the original positions.
  dragInProgress: boolean;
  moveSnapshot: Map<string, { x: number; y: number }> | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  dirty: boolean;
}

type DragKind = "move" | "resize" | "rotate";

type Action =
  | { type: "set_selection"; refs: SelectionRef[] }
  | { type: "toggle_selection"; ref: SelectionRef }
  | { type: "select_all" }
  | { type: "add_section"; floorX: number; floorY: number }
  | { type: "add_element"; kind: ElementKind; floorX: number; floorY: number }
  | { type: "update_section"; id: string; patch: Partial<SectionDraft> }
  | { type: "update_element"; id: string; patch: Partial<LayoutElementDraft> }
  | { type: "delete_selected" }
  | { type: "duplicate_selected" }
  | { type: "nudge"; dx: number; dy: number }
  | { type: "begin_drag"; mode: DragKind }
  | { type: "drag_move"; dx: number; dy: number }
  | { type: "end_drag" }
  | {
      type: "import";
      detected: DetectedSection[];
      canvasWidth: number;
      canvasHeight: number;
    }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset_dirty" }
  | { type: "apply_restored"; result: RestoreSnapshotResult }
  | { type: "hydrate"; entry: PersistedState };

// The slice of builder state we persist to sessionStorage so an accidental
// reload doesn't wipe unsaved edits + undo history. Transient fields
// (selection, drag, moveSnapshot) are intentionally excluded.
interface PersistedState {
  sections: SectionDraft[];
  elements: LayoutElementDraft[];
  deletedSectionIds: string[];
  deletedElementIds: string[];
  past: HistoryEntry[];
  future: HistoryEntry[];
}

const SECTION_COLORS = [
  "#D4A853",
  "#3b82f6",
  "#10b981",
  "#ef4444",
  "#a855f7",
  "#f97316",
  "#6b7280",
];
const HISTORY_MAX = 50;
const GRID_SIZE = 10;
const NEW_SECTION_W = 280;
const NEW_SECTION_H = 180;
const DUPLICATE_OFFSET = 20;

function snap(state: State): HistoryEntry {
  return {
    sections: state.sections,
    elements: state.elements,
    deletedSectionIds: state.deletedSectionIds,
    deletedElementIds: state.deletedElementIds,
  };
}

function pushHistory(state: State): State {
  const past = [...state.past, snap(state)].slice(-HISTORY_MAX);
  return { ...state, past, future: [] };
}

function newId() {
  return `new-${Math.random().toString(36).slice(2, 10)}`;
}

const refKey = (r: SelectionRef) => `${r.kind}:${r.id}`;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set_selection":
      return { ...state, selection: action.refs };

    case "toggle_selection": {
      const exists = state.selection.some((r) => refsEqual(r, action.ref));
      return {
        ...state,
        selection: exists
          ? state.selection.filter((r) => !refsEqual(r, action.ref))
          : [...state.selection, action.ref],
      };
    }

    case "select_all": {
      const refs: SelectionRef[] = [
        ...state.sections.map((s) => ({ kind: "section" as const, id: s.id })),
        ...state.elements.map((e) => ({ kind: e.kind, id: e.id })),
      ];
      return { ...state, selection: refs };
    }

    case "add_section": {
      const nextSort =
        Math.max(0, ...state.sections.map((s) => s.sort_order)) + 1;
      const code = String.fromCharCode(65 + state.sections.length) || "X";
      const newSection: SectionDraft = {
        id: newId(),
        isNew: true,
        code,
        name: `Section ${code}`,
        floor_x: Math.max(0, action.floorX - NEW_SECTION_W / 2),
        floor_y: Math.max(0, action.floorY - NEW_SECTION_H / 2),
        floor_width: NEW_SECTION_W,
        floor_height: NEW_SECTION_H,
        rotation: 0,
        total_bays: 10,
        total_levels: 3,
        color: SECTION_COLORS[state.sections.length % SECTION_COLORS.length],
        sort_order: nextSort,
        slot_capacity: null,
      };
      const next = pushHistory(state);
      return {
        ...next,
        sections: [...state.sections, newSection],
        selection: [{ kind: "section", id: newSection.id }],
        dirty: true,
      };
    }

    case "add_element": {
      const preset = ELEMENT_PRESETS[action.kind];
      const nextSort =
        Math.max(0, ...state.elements.map((e) => e.sort_order)) + 1;
      const newElement: LayoutElementDraft = {
        id: newId(),
        isNew: true,
        kind: action.kind,
        floor_x: Math.max(0, action.floorX - preset.defaultWidth / 2),
        floor_y: Math.max(0, action.floorY - preset.defaultHeight / 2),
        floor_width: preset.defaultWidth,
        floor_height: preset.defaultHeight,
        rotation: 0,
        color: preset.defaultColor,
        label: preset.label,
        data: {},
        sort_order: nextSort,
      };
      const next = pushHistory(state);
      return {
        ...next,
        elements: [...state.elements, newElement],
        selection: [{ kind: action.kind, id: newElement.id }],
        dirty: true,
      };
    }

    case "update_section": {
      // Skip history push if we're inside a drag transaction — begin_drag
      // already captured the pre-drag state.
      const next = state.dragInProgress ? state : pushHistory(state);
      return {
        ...next,
        sections: state.sections.map((s) =>
          s.id === action.id ? { ...s, ...action.patch } : s
        ),
        dirty: true,
      };
    }

    case "update_element": {
      const next = state.dragInProgress ? state : pushHistory(state);
      return {
        ...next,
        elements: state.elements.map((e) =>
          e.id === action.id ? { ...e, ...action.patch } : e
        ),
        dirty: true,
      };
    }

    case "delete_selected": {
      if (state.selection.length === 0) return state;
      const next = pushHistory(state);
      let sections = state.sections;
      let elements = state.elements;
      let deletedSectionIds = state.deletedSectionIds;
      let deletedElementIds = state.deletedElementIds;
      for (const ref of state.selection) {
        if (ref.kind === "section") {
          const target = sections.find((s) => s.id === ref.id);
          if (!target) continue;
          sections = sections.filter((s) => s.id !== ref.id);
          if (!target.isNew) deletedSectionIds = [...deletedSectionIds, ref.id];
        } else {
          const target = elements.find((e) => e.id === ref.id);
          if (!target) continue;
          elements = elements.filter((e) => e.id !== ref.id);
          if (!target.isNew) deletedElementIds = [...deletedElementIds, ref.id];
        }
      }
      return {
        ...next,
        sections,
        elements,
        deletedSectionIds,
        deletedElementIds,
        selection: [],
        dirty: true,
      };
    }

    case "duplicate_selected": {
      if (state.selection.length === 0) return state;
      const next = pushHistory(state);
      let sections = state.sections;
      let elements = state.elements;
      let sectionSort = Math.max(0, ...sections.map((s) => s.sort_order));
      let elementSort = Math.max(0, ...elements.map((e) => e.sort_order));
      const newSelection: SelectionRef[] = [];
      for (const ref of state.selection) {
        if (ref.kind === "section") {
          const src = sections.find((s) => s.id === ref.id);
          if (!src) continue;
          sectionSort += 1;
          const clone: SectionDraft = {
            ...src,
            id: newId(),
            isNew: true,
            floor_x: src.floor_x + DUPLICATE_OFFSET,
            floor_y: src.floor_y + DUPLICATE_OFFSET,
            sort_order: sectionSort,
          };
          sections = [...sections, clone];
          newSelection.push({ kind: "section", id: clone.id });
        } else {
          const src = elements.find((e) => e.id === ref.id);
          if (!src) continue;
          elementSort += 1;
          const clone: LayoutElementDraft = {
            ...src,
            id: newId(),
            isNew: true,
            floor_x: src.floor_x + DUPLICATE_OFFSET,
            floor_y: src.floor_y + DUPLICATE_OFFSET,
            sort_order: elementSort,
          };
          elements = [...elements, clone];
          newSelection.push({ kind: src.kind, id: clone.id });
        }
      }
      return {
        ...next,
        sections,
        elements,
        selection: newSelection,
        dirty: true,
      };
    }

    case "nudge": {
      if (state.selection.length === 0) return state;
      const lastEntry = state.past[state.past.length - 1];
      const sameShape =
        lastEntry &&
        lastEntry.sections.length === state.sections.length &&
        lastEntry.elements.length === state.elements.length;
      const next = sameShape ? state : pushHistory(state);
      const selectedSectionIds = new Set(
        state.selection.filter((r) => r.kind === "section").map((r) => r.id)
      );
      const selectedElementIds = new Set(
        state.selection.filter((r) => r.kind !== "section").map((r) => r.id)
      );
      return {
        ...next,
        sections: state.sections.map((s) =>
          selectedSectionIds.has(s.id)
            ? {
                ...s,
                floor_x: Math.max(0, s.floor_x + action.dx),
                floor_y: Math.max(0, s.floor_y + action.dy),
              }
            : s
        ),
        elements: state.elements.map((e) =>
          selectedElementIds.has(e.id)
            ? {
                ...e,
                floor_x: Math.max(0, e.floor_x + action.dx),
                floor_y: Math.max(0, e.floor_y + action.dy),
              }
            : e
        ),
        dirty: true,
      };
    }

    case "begin_drag": {
      const next = pushHistory(state);
      let moveSnapshot: Map<string, { x: number; y: number }> | null = null;
      if (action.mode === "move") {
        moveSnapshot = new Map();
        for (const ref of state.selection) {
          if (ref.kind === "section") {
            const s = state.sections.find((x) => x.id === ref.id);
            if (s)
              moveSnapshot.set(refKey(ref), { x: s.floor_x, y: s.floor_y });
          } else {
            const e = state.elements.find((x) => x.id === ref.id);
            if (e)
              moveSnapshot.set(refKey(ref), { x: e.floor_x, y: e.floor_y });
          }
        }
      }
      return { ...next, dragInProgress: true, moveSnapshot };
    }

    case "drag_move": {
      if (!state.moveSnapshot) return state;
      const newSections = state.sections.map((s) => {
        const k = refKey({ kind: "section", id: s.id });
        const snap = state.moveSnapshot!.get(k);
        if (!snap) return s;
        return {
          ...s,
          floor_x: Math.max(0, snap.x + action.dx),
          floor_y: Math.max(0, snap.y + action.dy),
        };
      });
      const newElements = state.elements.map((e) => {
        const k = refKey({ kind: e.kind, id: e.id });
        const snap = state.moveSnapshot!.get(k);
        if (!snap) return e;
        return {
          ...e,
          floor_x: Math.max(0, snap.x + action.dx),
          floor_y: Math.max(0, snap.y + action.dy),
        };
      });
      return {
        ...state,
        sections: newSections,
        elements: newElements,
        dirty: true,
      };
    }

    case "end_drag":
      return { ...state, dragInProgress: false, moveSnapshot: null };

    case "import": {
      const next = pushHistory(state);
      const imported: SectionDraft[] = action.detected.map((d, i) => ({
        id: newId(),
        isNew: true,
        code: d.code,
        name: d.name,
        floor_x: d.x * action.canvasWidth,
        floor_y: d.y * action.canvasHeight,
        floor_width: Math.max(40, d.width * action.canvasWidth),
        floor_height: Math.max(40, d.height * action.canvasHeight),
        rotation: 0,
        total_bays: d.approximate_bays,
        total_levels: d.approximate_levels,
        color: SECTION_COLORS[i % SECTION_COLORS.length],
        sort_order: i + 1,
        slot_capacity: null,
      }));
      const newDeleted = [
        ...state.deletedSectionIds,
        ...state.sections.filter((s) => !s.isNew).map((s) => s.id),
      ];
      return {
        ...next,
        sections: imported,
        deletedSectionIds: newDeleted,
        selection: [],
        dirty: true,
      };
    }

    case "apply_restored": {
      const next = pushHistory(state);
      return {
        ...next,
        sections: action.result.sections,
        elements: action.result.elements,
        deletedSectionIds: [],
        deletedElementIds: [],
        selection: [],
        dragInProgress: false,
        moveSnapshot: null,
        dirty: false,
      };
    }

    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...state,
        sections: prev.sections,
        elements: prev.elements,
        deletedSectionIds: prev.deletedSectionIds,
        deletedElementIds: prev.deletedElementIds,
        past: state.past.slice(0, -1),
        future: [snap(state), ...state.future],
        dirty: true,
      };
    }

    case "redo": {
      const nxt = state.future[0];
      if (!nxt) return state;
      return {
        ...state,
        sections: nxt.sections,
        elements: nxt.elements,
        deletedSectionIds: nxt.deletedSectionIds,
        deletedElementIds: nxt.deletedElementIds,
        past: [...state.past, snap(state)],
        future: state.future.slice(1),
        dirty: true,
      };
    }

    case "reset_dirty":
      return { ...state, dirty: false };

    case "hydrate":
      return {
        ...state,
        sections: action.entry.sections,
        elements: action.entry.elements,
        deletedSectionIds: action.entry.deletedSectionIds,
        deletedElementIds: action.entry.deletedElementIds,
        past: action.entry.past,
        future: action.entry.future,
        selection: [],
        dragInProgress: false,
        moveSnapshot: null,
        // We only persist while dirty, so a hydrated layout is by definition
        // unsaved work to restore.
        dirty: true,
      };
  }
}

const STORAGE_VERSION = 1;
const storageKey = (warehouseId: string) =>
  `nimbus.builder.v${STORAGE_VERSION}.${warehouseId}`;

export function BuilderShell({
  warehouseId,
  canvasWidth,
  canvasHeight,
  floorUnit: initialFloorUnit,
  initialSections,
  initialElements,
}: Props) {
  // Canonical unit is feet; meters is the only alternative. Switching only
  // relabels (coords are unitless) — see setFloorUnit in actions.ts.
  const [floorUnit, setFloorUnitState] = useState<FloorUnit>(
    initialFloorUnit === "m" ? "m" : "ft"
  );
  const [state, dispatch] = useReducer(reducer, {
    sections: initialSections,
    elements: initialElements,
    deletedSectionIds: [],
    deletedElementIds: [],
    selection: [],
    dragInProgress: false,
    moveSnapshot: null,
    past: [],
    future: [],
    dirty: false,
  });

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);

  // Slotting (#8) reads a `door` element as the receiving / travel-distance
  // origin. Surface a non-blocking nudge when a facility has none.
  const hasDoor = state.elements.some((e) => e.kind === "door");

  // Overlapping sections corrupt slotting geometry, so saving is blocked
  // until they're separated. Recomputed only when section geometry changes.
  const overlapIds = useMemo(
    () => computeOverlaps(state.sections),
    [state.sections]
  );
  const hasOverlap = overlapIds.size > 0;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportApi = useViewport();
  const isMobile = useIsMobile();
  const { viewport, zoomInAt, zoomOutAt, resetZoom, fitToContainer } =
    viewportApi;

  // Refs so callbacks passed to children see fresh selection.
  const selectionRef = useRef(state.selection);
  useEffect(() => {
    selectionRef.current = state.selection;
  }, [state.selection]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      fitToContainer(rect.width, rect.height, canvasWidth, canvasHeight);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rehydrate unsaved edits + undo history from sessionStorage once on mount,
  // so an accidental reload doesn't discard work. Keyed per warehouse/tab.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = sessionStorage.getItem(storageKey(warehouseId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedState;
      if (Array.isArray(parsed?.sections) && Array.isArray(parsed?.elements)) {
        dispatch({ type: "hydrate", entry: parsed });
      }
    } catch {
      // Corrupt/incompatible payload — ignore and start from server state.
    }
  }, [warehouseId]);

  // Persist the working state whenever it changes (and we're not mid-drag, to
  // avoid stringifying on every frame). Clears the key once saved/clean.
  useEffect(() => {
    if (state.dragInProgress) return;
    try {
      if (state.dirty) {
        const payload: PersistedState = {
          sections: state.sections,
          elements: state.elements,
          deletedSectionIds: state.deletedSectionIds,
          deletedElementIds: state.deletedElementIds,
          past: state.past,
          future: state.future,
        };
        sessionStorage.setItem(
          storageKey(warehouseId),
          JSON.stringify(payload)
        );
      } else {
        sessionStorage.removeItem(storageKey(warehouseId));
      }
    } catch {
      // Storage full or unavailable — non-fatal; persistence is best-effort.
    }
  }, [
    warehouseId,
    state.dirty,
    state.dragInProgress,
    state.sections,
    state.elements,
    state.deletedSectionIds,
    state.deletedElementIds,
    state.past,
    state.future,
  ]);

  const handleRestored = useCallback((result: RestoreSnapshotResult) => {
    dispatch({ type: "apply_restored", result });
    setFeedback({
      kind: "ok",
      msg:
        result.unlinkedLocations > 0
          ? `Layout restored · ${result.unlinkedLocations} location${
              result.unlinkedLocations === 1 ? "" : "s"
            } unlinked`
          : "Layout restored",
    });
    setTimeout(() => setFeedback(null), 3500);
  }, []);

  const handleSave = useCallback(async () => {
    if (computeOverlaps(state.sections).size > 0) {
      setFeedback({
        kind: "err",
        msg: "Resolve overlapping sections before saving",
      });
      setTimeout(() => setFeedback(null), 3000);
      return;
    }
    setSaving(true);
    setFeedback(null);
    const result = await saveLayout({
      warehouseId,
      sections: state.sections,
      deletedSectionIds: state.deletedSectionIds,
      elements: state.elements,
      deletedElementIds: state.deletedElementIds,
    });
    setSaving(false);
    if (result.error) {
      setFeedback({ kind: "err", msg: result.error });
      return;
    }
    setFeedback({ kind: "ok", msg: result.success ?? "Saved" });
    dispatch({ type: "reset_dirty" });
    setTimeout(() => setFeedback(null), 2000);
  }, [
    warehouseId,
    state.sections,
    state.deletedSectionIds,
    state.elements,
    state.deletedElementIds,
  ]);

  const handleToggleUnit = useCallback(async () => {
    const next: FloorUnit = floorUnit === "ft" ? "m" : "ft";
    const prev = floorUnit;
    setFloorUnitState(next); // optimistic — it's only a label
    const r = await setFloorUnit(warehouseId, next);
    if (r.error) {
      setFloorUnitState(prev);
      setFeedback({ kind: "err", msg: r.error });
      setTimeout(() => setFeedback(null), 2500);
    }
  }, [floorUnit, warehouseId]);

  const viewportCenterFloor = useCallback((): { x: number; y: number } => {
    const el = containerRef.current;
    if (!el) return { x: canvasWidth / 2, y: canvasHeight / 2 };
    const rect = el.getBoundingClientRect();
    return {
      x: (rect.width / 2 - viewport.panX) / viewport.zoom,
      y: (rect.height / 2 - viewport.panY) / viewport.zoom,
    };
  }, [canvasWidth, canvasHeight, viewport.panX, viewport.panY, viewport.zoom]);

  const handleAddSection = useCallback(() => {
    const { x, y } = viewportCenterFloor();
    dispatch({ type: "add_section", floorX: x, floorY: y });
  }, [viewportCenterFloor]);

  const handleAddElement = useCallback(
    (kind: ElementKind) => {
      const { x, y } = viewportCenterFloor();
      dispatch({ type: "add_element", kind, floorX: x, floorY: y });
    },
    [viewportCenterFloor]
  );

  const handleDuplicate = useCallback(() => {
    dispatch({ type: "duplicate_selected" });
  }, []);

  const handleDelete = useCallback(() => {
    dispatch({ type: "delete_selected" });
  }, []);

  // The selection + drag-start callback handed to each rect. Returns true
  // to start the drag, false to skip (e.g. shift+click toggle off).
  const handlePointerDownItem = useCallback(
    (ref: SelectionRef, e: React.PointerEvent, mode: DragMode) => {
      // Resize/rotate handles only appear when a single item is selected,
      // so we don't touch selection — just open the drag transaction.
      if (mode !== "move") {
        // Any non-"move" handle (the n/e/s/w + corner handles) is a resize.
        dispatch({
          type: "begin_drag",
          mode: "resize",
        });
        return true;
      }

      const currentSel = selectionRef.current;
      const isInSelection = currentSel.some((r) => refsEqual(r, ref));

      if (e.shiftKey) {
        dispatch({ type: "toggle_selection", ref });
        if (isInSelection) {
          // Removed from selection — don't start a drag.
          return false;
        }
        dispatch({ type: "begin_drag", mode: "move" });
        return true;
      }

      // Plain click: if already in selection, keep it; otherwise replace.
      if (!isInSelection) {
        dispatch({ type: "set_selection", refs: [ref] });
      }
      dispatch({ type: "begin_drag", mode: "move" });
      return true;
    },
    []
  );

  const handleMoveDelta = useCallback((dx: number, dy: number) => {
    dispatch({ type: "drag_move", dx, dy });
  }, []);

  const handleResizeSection = useCallback((id: string, patch: RectPatch) => {
    dispatch({ type: "update_section", id, patch });
  }, []);

  const handleResizeElement = useCallback((id: string, patch: RectPatch) => {
    dispatch({ type: "update_element", id, patch });
  }, []);

  const handleRotateStart = useCallback(() => {
    dispatch({ type: "begin_drag", mode: "rotate" });
  }, []);

  const handleRotateSection = useCallback((id: string, patch: RectPatch) => {
    dispatch({ type: "update_section", id, patch });
  }, []);

  const handleRotateElement = useCallback((id: string, patch: RectPatch) => {
    dispatch({ type: "update_element", id, patch });
  }, []);

  const handleDragEnd = useCallback(() => {
    dispatch({ type: "end_drag" });
  }, []);

  const handleSetSelection = useCallback((refs: SelectionRef[]) => {
    dispatch({ type: "set_selection", refs });
  }, []);

  const withContainerCenter = (fn: (sx: number, sy: number) => void) => () => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    fn(r.width / 2, r.height / 2);
  };

  const handleZoomIn = withContainerCenter(zoomInAt);
  const handleZoomOut = withContainerCenter(zoomOutAt);
  const handleFit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    fitToContainer(r.width, r.height, canvasWidth, canvasHeight);
  }, [canvasWidth, canvasHeight, fitToContainer]);

  // Keyboard
  useEffect(() => {
    const isFormField = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target.isContentEditable
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (isFormField(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "undo" });
        return;
      }
      if (
        (mod && e.shiftKey && e.key.toLowerCase() === "z") ||
        (mod && e.key === "y")
      ) {
        e.preventDefault();
        dispatch({ type: "redo" });
        return;
      }
      if (mod && e.key === "s") {
        e.preventDefault();
        handleSave();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        dispatch({ type: "select_all" });
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        handleDuplicate();
        return;
      }
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        handleZoomIn();
        return;
      }
      if (mod && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        handleZoomOut();
        return;
      }
      if (e.shiftKey && !mod && e.key === ")") {
        e.preventDefault();
        resetZoom();
        return;
      }
      if (e.shiftKey && !mod && e.key === "!") {
        e.preventDefault();
        handleFit();
        return;
      }

      if (
        state.selection.length > 0 &&
        (e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight")
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx =
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy =
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        dispatch({ type: "nudge", dx, dy });
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (state.selection.length > 0) {
          e.preventDefault();
          handleDelete();
        }
        return;
      }

      if (e.key === "Escape") {
        dispatch({ type: "set_selection", refs: [] });
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    state.selection.length,
    handleSave,
    handleZoomIn,
    handleZoomOut,
    handleFit,
    resetZoom,
    handleDelete,
    handleDuplicate,
  ]);

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
    <div className="flex flex-col gap-12 flex-1 min-h-0 relative">
      <BuilderToolbar
        sectionCount={state.sections.length}
        elementCount={state.elements.length}
        selectionCount={state.selection.length}
        dirty={state.dirty}
        saving={saving}
        saveBlocked={hasOverlap}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        canDuplicate={state.selection.length > 0}
        feedback={feedback}
        onAddSection={handleAddSection}
        onAddElement={handleAddElement}
        onScan={() => setScanOpen(true)}
        onOpenSnapshots={() => setSnapshotsOpen(true)}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onDuplicate={handleDuplicate}
        onSave={handleSave}
        snapEnabled={snapEnabled}
        onToggleSnap={() => setSnapEnabled((v) => !v)}
        floorUnit={floorUnit}
        onToggleUnit={handleToggleUnit}
        zoomPercent={viewport.zoom * 100}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={resetZoom}
        onFit={handleFit}
      />

      {hasOverlap && (
        <div
          className="hairline-subtle px-12 py-8 flex items-center gap-10 shrink-0"
          style={{ background: "var(--danger-dim)" }}
          role="alert"
        >
          <AlertTriangle
            size={12}
            strokeWidth={1.5}
            className="shrink-0 text-[var(--danger)]"
          />
          <span className="mono-sm text-[var(--danger)] flex-1">
            {overlapIds.size} section{overlapIds.size === 1 ? "" : "s"} overlap
            another. Saving is blocked until sections occupy distinct floor
            space.
          </span>
        </div>
      )}

      {!hasDoor && (
        <div
          className="hairline-subtle px-12 py-8 flex items-center gap-10 shrink-0"
          style={{ background: "var(--accent-dim)" }}
          role="status"
        >
          <AlertTriangle
            size={12}
            strokeWidth={1.5}
            className="shrink-0 text-[var(--accent)]"
          />
          <span className="mono-sm text-text-secondary flex-1">
            No dock door placed. Slotting suggestions use a door as the
            travel-distance origin — add one for accurate golden-zone scoring.
          </span>
          <button
            type="button"
            onClick={() => handleAddElement("door")}
            className="hairline-subtle px-10 py-5 hover:border-[var(--accent)] hover:text-[var(--accent)] text-text-secondary transition-colors shrink-0"
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
            }}
          >
            Add door
          </button>
        </div>
      )}

      <div className="flex gap-12 flex-1 min-h-0">
        <FloorCanvas
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          floorUnit={floorUnit}
          sections={state.sections}
          elements={state.elements}
          selection={state.selection}
          overlappingSectionIds={overlapIds}
          onPointerDownItem={handlePointerDownItem}
          onSetSelection={handleSetSelection}
          onMoveDelta={handleMoveDelta}
          onResizeSection={handleResizeSection}
          onResizeElement={handleResizeElement}
          onRotateStart={handleRotateStart}
          onRotateSection={handleRotateSection}
          onRotateElement={handleRotateElement}
          onDragEnd={handleDragEnd}
          containerRef={containerRef}
          viewportApi={viewportApi}
          gridSize={GRID_SIZE}
          gridEnabled={snapEnabled}
          isMobile={isMobile}
        />

        {!isMobile && (
          <Inspector
            selection={state.selection}
            sections={state.sections}
            elements={state.elements}
            floorUnit={floorUnit}
            onUpdateSection={(id, patch) =>
              dispatch({ type: "update_section", id, patch })
            }
            onUpdateElement={(id, patch) =>
              dispatch({ type: "update_element", id, patch })
            }
            onDeleteSelected={handleDelete}
          />
        )}
      </div>

      {isMobile && (
        <MobileInspectorSheet
          open={state.selection.length > 0}
          selection={state.selection}
          sections={state.sections}
          elements={state.elements}
          floorUnit={floorUnit}
          onUpdateSection={(id, patch) =>
            dispatch({ type: "update_section", id, patch })
          }
          onUpdateElement={(id, patch) =>
            dispatch({ type: "update_element", id, patch })
          }
          onDeleteSelected={handleDelete}
          onClose={() => dispatch({ type: "set_selection", refs: [] })}
        />
      )}

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

      {snapshotsOpen && (
        <SnapshotsModal
          warehouseId={warehouseId}
          sections={state.sections}
          elements={state.elements}
          dirty={state.dirty}
          onClose={() => setSnapshotsOpen(false)}
          onRestored={handleRestored}
        />
      )}
    </div>
  );
}
