"use client";

import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CornerButton } from "@/components/ui/CornerButton";
import type { SectionDraft, CategoryOption } from "./types";

const COLORS = [
  "#D4A853",
  "#3b82f6",
  "#10b981",
  "#ef4444",
  "#a855f7",
  "#f97316",
  "#6b7280",
];

interface Props {
  section: SectionDraft | null;
  floorUnit: string;
  categories: CategoryOption[];
  onUpdate: (patch: Partial<SectionDraft>) => void;
  onDelete: () => void;
}

export function SectionInspector({
  section,
  floorUnit,
  categories,
  onUpdate,
  onDelete,
}: Props) {
  if (!section) {
    return (
      <aside
        className="hairline bg-[var(--surface)] p-16 flex flex-col gap-12 shrink-0"
        style={{ width: 280 }}
        aria-label="Section inspector"
      >
        <p className="label-text text-text-muted">Inspector</p>
        <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
          Select a section to edit its properties — code, name, color,
          dimensions, bays, and levels.
        </p>
        <div className="hairline-t pt-12 mt-auto">
          <p className="label-text text-text-dim mb-6">Shortcuts</p>
          <ul
            className="flex flex-col gap-4 mono-sm text-text-muted"
            style={{ fontSize: 10 }}
          >
            <li>
              <kbd>⌘Z</kbd> undo · <kbd>⌘⇧Z</kbd> redo
            </li>
            <li>
              <kbd>⌘S</kbd> save
            </li>
            <li>
              <kbd>Del</kbd> remove selected
            </li>
            <li>
              <kbd>Esc</kbd> deselect
            </li>
          </ul>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="hairline bg-[var(--surface)] p-16 flex flex-col gap-14 shrink-0 overflow-y-auto"
      style={{ width: 280 }}
      aria-label="Section inspector"
    >
      <header className="flex items-start justify-between gap-10">
        <div>
          <p className="label-text text-text-muted">Section</p>
          <p
            className="text-text mt-2"
            style={{
              fontFamily: "var(--display)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {section.code} · {section.name}
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="hairline-subtle p-6 hover:border-[var(--danger)] hover:text-[var(--danger)] text-text-muted transition-colors"
          aria-label="Delete section"
          title="Delete (Del)"
        >
          <Trash2 size={11} strokeWidth={1.5} />
        </button>
      </header>

      <Input
        label="Code"
        value={section.code}
        onChange={(e) =>
          onUpdate({ code: e.target.value.toUpperCase().slice(0, 4) })
        }
        maxLength={4}
      />
      <Input
        label="Name"
        value={section.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
      />

      <div>
        <label className="label-text text-text-muted block mb-6">Color</label>
        <div className="flex items-center gap-4">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onUpdate({ color: c })}
              className={`w-18 h-18 hairline-subtle transition-all ${
                c === section.color
                  ? "ring-1 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface)]"
                  : ""
              }`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              aria-pressed={c === section.color}
            />
          ))}
        </div>
      </div>

      <div className="hairline-t pt-12">
        <label className="label-text text-text-muted block mb-6">
          Default category
        </label>
        <Select
          value={section.default_category ?? ""}
          onChange={(v) => onUpdate({ default_category: v || null })}
          ariaLabel="Default category"
          placeholder="No preference"
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
        <p className="mono-sm text-text-dim mt-6" style={{ fontSize: 10 }}>
          Slotting prefers homing this category's products here.
        </p>
        <div className="mt-10">
          <Input
            label="Pick zone"
            value={section.pick_zone ?? ""}
            onChange={(e) =>
              onUpdate({ pick_zone: e.target.value.trim() || null })
            }
            placeholder="(its own zone)"
            maxLength={40}
          />
          <p className="mono-sm text-text-dim mt-6" style={{ fontSize: 10 }}>
            Group sections into a named zone for wave picking. Blank = the
            section is its own zone.
          </p>
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
            value={Math.round(section.floor_x)}
            onChange={(e) =>
              onUpdate({
                floor_x: Math.max(0, parseFloat(e.target.value) || 0),
              })
            }
          />
          <Input
            label="Y"
            type="number"
            value={Math.round(section.floor_y)}
            onChange={(e) =>
              onUpdate({
                floor_y: Math.max(0, parseFloat(e.target.value) || 0),
              })
            }
          />
          <Input
            label="Width"
            type="number"
            value={Math.round(section.floor_width)}
            onChange={(e) =>
              onUpdate({
                floor_width: Math.max(40, parseFloat(e.target.value) || 40),
              })
            }
          />
          <Input
            label="Height"
            type="number"
            value={Math.round(section.floor_height)}
            onChange={(e) =>
              onUpdate({
                floor_height: Math.max(40, parseFloat(e.target.value) || 40),
              })
            }
          />
        </div>
      </div>

      <div className="hairline-t pt-12">
        <p className="label-text text-text-muted mb-8">Storage</p>
        <div className="grid grid-cols-2 gap-8">
          <Input
            label="Bays"
            type="number"
            value={section.total_bays}
            onChange={(e) =>
              onUpdate({
                total_bays: Math.max(1, parseInt(e.target.value, 10) || 1),
              })
            }
          />
          <Input
            label="Levels"
            type="number"
            value={section.total_levels}
            onChange={(e) =>
              onUpdate({
                total_levels: Math.max(1, parseInt(e.target.value, 10) || 1),
              })
            }
          />
        </div>
        <p className="mono-sm text-text-dim mt-6" style={{ fontSize: 10 }}>
          {section.total_bays * section.total_levels} potential storage
          locations
        </p>
        <div className="mt-10">
          <Input
            label="Slot capacity (units)"
            type="number"
            min={1}
            placeholder="Unlimited"
            value={section.slot_capacity ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (raw === "") {
                onUpdate({ slot_capacity: null });
                return;
              }
              const n = parseInt(raw, 10);
              onUpdate({
                slot_capacity: Number.isNaN(n) || n < 1 ? null : n,
              });
            }}
          />
          <p className="mono-sm text-text-dim mt-6" style={{ fontSize: 10 }}>
            Max units per bay·level slot. Leave blank for unlimited — slotting
            treats it as a soft factor.
          </p>
        </div>
      </div>
    </aside>
  );
}
