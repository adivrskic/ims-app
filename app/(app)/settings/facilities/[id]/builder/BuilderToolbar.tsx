"use client";

import {
  Plus,
  ScanLine,
  Undo2,
  Redo2,
  Save,
  Check,
  AlertTriangle,
} from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";

interface Props {
  sectionCount: number;
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  feedback: { kind: "ok" | "err"; msg: string } | null;
  onAdd: () => void;
  onScan: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
}

export function BuilderToolbar({
  sectionCount,
  dirty,
  saving,
  canUndo,
  canRedo,
  feedback,
  onAdd,
  onScan,
  onUndo,
  onRedo,
  onSave,
}: Props) {
  return (
    <header className="hairline bg-[var(--surface)] px-14 py-10 flex items-center gap-10 flex-wrap">
      <div className="flex items-center gap-10">
        <CornerButton type="button" variant="primary" size="sm" onClick={onAdd}>
          <Plus size={11} strokeWidth={1.5} />
          Add section
        </CornerButton>
        <CornerButton type="button" variant="ghost" size="sm" onClick={onScan}>
          <ScanLine size={11} strokeWidth={1.5} />
          Scan blueprint
        </CornerButton>
      </div>

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
      </div>

      <span className="mono-sm text-text-muted ml-4">
        {sectionCount} {sectionCount === 1 ? "section" : "sections"}
      </span>

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
          {feedback.msg}
        </span>
      )}

      <div className="ml-auto flex items-center gap-10">
        {dirty && (
          <span className="label-text text-[var(--warning)] inline-flex items-center gap-4">
            <span className="dot dot-alert" aria-hidden />
            Unsaved
          </span>
        )}
        <CornerButton
          type="button"
          variant="primary"
          size="sm"
          onClick={onSave}
          loading={saving}
          disabled={!dirty && !saving}
        >
          <Save size={11} strokeWidth={1.5} />
          Save
        </CornerButton>
      </div>
    </header>
  );
}
