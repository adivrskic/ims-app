"use client";

import { useEffect, useState } from "react";
import {
  X,
  History,
  Save,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import {
  listSnapshots,
  createSnapshot,
  deleteSnapshot,
  restoreSnapshot,
  type LayoutSnapshotRow,
  type RestoreSnapshotResult,
} from "./actions";
import type { SectionDraft, LayoutElementDraft } from "./types";

interface Props {
  warehouseId: string;
  sections: SectionDraft[];
  elements: LayoutElementDraft[];
  dirty: boolean;
  onClose: () => void;
  onRestored: (result: RestoreSnapshotResult) => void;
}

export function SnapshotsModal({
  warehouseId,
  sections,
  elements,
  dirty,
  onClose,
  onRestored,
}: Props) {
  const [snapshots, setSnapshots] = useState<LayoutSnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  // Two-stage actions per row: clicking once arms confirmation, second click commits.
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Load on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await listSnapshots(warehouseId);
      if (cancelled) return;
      setLoading(false);
      if (r.error) setErr(r.error);
      else setSnapshots(r.snapshots ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [warehouseId]);

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleCreate = async () => {
    setSaving(true);
    setErr(null);
    const r = await createSnapshot({
      warehouseId,
      label: label.trim() || null,
      sections,
      elements,
    });
    setSaving(false);
    if (r.error) {
      setErr(r.error);
      return;
    }
    if (r.snapshot) {
      setSnapshots((prev) => [r.snapshot!, ...prev]);
      setLabel("");
    }
  };

  const handleRestore = async (id: string) => {
    if (pendingRestore !== id) {
      setPendingRestore(id);
      setPendingDelete(null);
      return;
    }
    setBusyId(id);
    setErr(null);
    const r = await restoreSnapshot(id);
    setBusyId(null);
    setPendingRestore(null);
    if (r.error) {
      setErr(r.error);
      return;
    }
    if (r.result) {
      onRestored(r.result);
      onClose();
    }
  };

  const handleDelete = async (id: string) => {
    if (pendingDelete !== id) {
      setPendingDelete(id);
      setPendingRestore(null);
      return;
    }
    setBusyId(id);
    setErr(null);
    const r = await deleteSnapshot(id);
    setBusyId(null);
    setPendingDelete(null);
    if (r.error) {
      setErr(r.error);
      return;
    }
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/55"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 hairline bg-[var(--surface)] flex flex-col"
        style={{
          width: "min(560px, 92vw)",
          maxHeight: "min(720px, 86vh)",
        }}
        role="dialog"
        aria-label="Snapshots"
        aria-modal="true"
      >
        {/* Header */}
        <header className="hairline-b px-18 py-14 flex items-center gap-10 shrink-0">
          <span
            className="w-22 h-22 hairline-subtle bg-[var(--accent-dim)] flex items-center justify-center text-[var(--accent)]"
            aria-hidden
          >
            <History size={11} strokeWidth={1.5} />
          </span>
          <h2
            className="text-text"
            style={{
              fontFamily: "var(--display)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Snapshots
          </h2>
          <span className="ml-auto" />
          <button
            type="button"
            onClick={onClose}
            className="hairline-subtle p-7 hover:border-[var(--accent)] text-text-secondary hover:text-text transition-colors"
            aria-label="Close"
          >
            <X size={11} strokeWidth={1.5} />
          </button>
        </header>

        {/* Create form */}
        <div className="px-18 py-14 hairline-b flex flex-col gap-10 shrink-0">
          <p className="mono-sm text-text-dim" style={{ lineHeight: 1.55 }}>
            Capture the current layout — including any unsaved changes — so you
            can restore it later.
          </p>
          <div className="flex items-end gap-8">
            <div className="flex-1">
              <Input
                label="Label (optional)"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`Snapshot ${new Date().toLocaleString()}`}
                maxLength={80}
              />
            </div>
            <CornerButton
              type="button"
              variant="primary"
              size="sm"
              onClick={handleCreate}
              loading={saving}
              disabled={saving}
            >
              <Save size={11} strokeWidth={1.5} />
              Save snapshot
            </CornerButton>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {err && (
            <div
              className="m-14 hairline-subtle px-12 py-8 flex items-start gap-8"
              style={{
                background: "var(--danger-dim)",
                color: "var(--danger)",
              }}
            >
              <AlertTriangle
                size={11}
                strokeWidth={1.5}
                className="mt-2 shrink-0"
              />
              <span className="mono-sm">{err}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-8 px-18 py-24 mono-sm text-text-dim">
              <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
              Loading snapshots…
            </div>
          ) : snapshots.length === 0 ? (
            <div
              className="px-18 py-24 mono-sm text-text-dim text-center"
              style={{ lineHeight: 1.6 }}
            >
              No snapshots yet. Save one above to mark this layout.
            </div>
          ) : (
            <ul className="flex flex-col">
              {snapshots.map((s) => (
                <SnapshotRow
                  key={s.id}
                  snapshot={s}
                  busy={busyId === s.id}
                  restoreArmed={pendingRestore === s.id}
                  deleteArmed={pendingDelete === s.id}
                  dirty={dirty}
                  onRestore={() => handleRestore(s.id)}
                  onDelete={() => handleDelete(s.id)}
                  onCancelArm={() => {
                    setPendingRestore(null);
                    setPendingDelete(null);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function SnapshotRow({
  snapshot,
  busy,
  restoreArmed,
  deleteArmed,
  dirty,
  onRestore,
  onDelete,
  onCancelArm,
}: {
  snapshot: LayoutSnapshotRow;
  busy: boolean;
  restoreArmed: boolean;
  deleteArmed: boolean;
  dirty: boolean;
  onRestore: () => void;
  onDelete: () => void;
  onCancelArm: () => void;
}) {
  const dt = new Date(snapshot.created_at);
  const dateLine = dt.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: dt.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <li className="hairline-b px-18 py-12 flex items-center gap-10">
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <span
          className="text-text truncate"
          style={{
            fontFamily: "var(--display)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {snapshot.label ?? "Untitled snapshot"}
        </span>
        <span
          className="text-text-dim"
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
          }}
        >
          {dateLine} · {snapshot.is_mine ? "You" : "Team member"}
        </span>
      </div>

      {restoreArmed && (
        <span
          className="mono-sm text-text-muted hidden sm:inline"
          style={{ fontSize: 10 }}
        >
          {dirty
            ? "Discard unsaved · click again to restore"
            : "Click again to restore"}
        </span>
      )}
      {deleteArmed && (
        <span
          className="mono-sm hidden sm:inline"
          style={{ fontSize: 10, color: "var(--danger)" }}
        >
          Click again to delete
        </span>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onRestore}
          disabled={busy}
          className={`hairline-subtle px-10 py-7 inline-flex items-center gap-6 transition-colors ${
            restoreArmed
              ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
              : "hover:border-[var(--border-hover)] text-text-secondary hover:text-text"
          } disabled:opacity-50`}
          title="Restore this snapshot"
        >
          {busy && restoreArmed ? (
            <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
          ) : (
            <RotateCcw size={11} strokeWidth={1.5} />
          )}
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
            }}
          >
            {restoreArmed ? "Confirm" : "Restore"}
          </span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          onBlur={onCancelArm}
          className={`hairline-subtle p-7 transition-colors ${
            deleteArmed
              ? "border-[var(--danger)] text-[var(--danger)] bg-[var(--danger-dim)]"
              : "hover:border-[var(--danger)] text-text-secondary hover:text-[var(--danger)]"
          } disabled:opacity-50`}
          title={deleteArmed ? "Confirm delete" : "Delete snapshot"}
          aria-label={deleteArmed ? "Confirm delete" : "Delete snapshot"}
        >
          {busy && deleteArmed ? (
            <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
          ) : (
            <Trash2 size={11} strokeWidth={1.5} />
          )}
        </button>
      </div>
    </li>
  );
}
