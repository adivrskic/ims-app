"use client";

import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import type { LayoutElementDraft, ElementKind } from "./types";
import { ELEMENT_PRESETS } from "./elementPresets";

interface Props {
  element: LayoutElementDraft;
  floorUnit: string;
  onUpdate: (patch: Partial<LayoutElementDraft>) => void;
  onDelete: () => void;
}

const PALETTE: Record<ElementKind, string[]> = {
  walkway: ["#6b7280", "#9ca3af", "#475569"],
  note: ["#D4A853", "#f97316", "#ef4444", "#10b981", "#3b82f6"],
  door: ["#D4A853", "#ef4444", "#10b981"],
  obstacle: ["#404040", "#1f2937", "#6b7280"],
  staging: ["#3b82f6", "#10b981", "#a855f7", "#D4A853"],
};

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

export function ElementInspector({
  element,
  floorUnit,
  onUpdate,
  onDelete,
}: Props) {
  const palette = PALETTE[element.kind];
  const preset = ELEMENT_PRESETS[element.kind];
  const isNote = element.kind === "note";

  return (
    <aside
      className="hairline bg-[var(--surface)] p-16 flex flex-col gap-12 shrink-0 overflow-y-auto"
      style={{ width: 280 }}
      aria-label={`${kindToLabel(element.kind)} inspector`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-8 min-w-0">
          <span
            className="w-22 h-22 hairline-subtle bg-[var(--accent-dim)] flex items-center justify-center shrink-0 text-[var(--accent)]"
            aria-hidden
          >
            <preset.icon size={11} strokeWidth={1.5} />
          </span>
          <p className="label-text text-text-muted">
            {kindToLabel(element.kind)}
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="hairline-subtle p-7 hover:border-[var(--danger)] text-text-secondary hover:text-[var(--danger)] transition-colors"
          aria-label="Delete element"
          title="Delete (Del)"
        >
          <Trash2 size={11} strokeWidth={1.5} />
        </button>
      </div>

      <div>
        <p className="label-text text-text-muted mb-8">
          {isNote ? "Body" : "Label"}
        </p>
        {isNote ? (
          <textarea
            rows={5}
            className="field-input resize-none w-full"
            placeholder="Type a note for the floor…"
            value={element.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
          />
        ) : (
          <Input
            type="text"
            value={element.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder={preset.label}
          />
        )}
      </div>

      <div>
        <p className="label-text text-text-muted mb-8">Color</p>
        <div className="flex items-center gap-6 flex-wrap">
          {palette.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onUpdate({ color: c })}
              className={`w-22 h-22 hairline-subtle transition-all ${
                c === element.color
                  ? "ring-1 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface)]"
                  : ""
              }`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              aria-pressed={c === element.color}
            />
          ))}
        </div>
      </div>

      <div className="hairline-t pt-12">
        <p className="label-text text-text-muted mb-8">
          Position ({floorUnit})
        </p>
        <div className="grid grid-cols-2 gap-8">
          <Input
            label="X"
            type="number"
            value={Math.round(element.floor_x)}
            onChange={(e) =>
              onUpdate({
                floor_x: Math.max(0, parseFloat(e.target.value) || 0),
              })
            }
          />
          <Input
            label="Y"
            type="number"
            value={Math.round(element.floor_y)}
            onChange={(e) =>
              onUpdate({
                floor_y: Math.max(0, parseFloat(e.target.value) || 0),
              })
            }
          />
          <Input
            label="Width"
            type="number"
            value={Math.round(element.floor_width)}
            onChange={(e) =>
              onUpdate({
                floor_width: Math.max(8, parseFloat(e.target.value) || 8),
              })
            }
          />
          <Input
            label="Height"
            type="number"
            value={Math.round(element.floor_height)}
            onChange={(e) =>
              onUpdate({
                floor_height: Math.max(8, parseFloat(e.target.value) || 8),
              })
            }
          />
        </div>
      </div>

      <div className="hairline-t pt-12">
        <p className="label-text text-text-muted mb-8">Rotation</p>
        <Input
          label="Degrees"
          type="number"
          value={Math.round(element.rotation)}
          onChange={(e) =>
            onUpdate({ rotation: parseFloat(e.target.value) || 0 })
          }
        />
      </div>
    </aside>
  );
}
