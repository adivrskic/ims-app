"use client";

import { useEffect, useState } from "react";
import type { SectionDraft } from "./types";

type DragMode = "move" | "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  initial: SectionDraft;
}

interface Props {
  section: SectionDraft;
  selected: boolean;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<SectionDraft>) => void;
  clientToSvg: (clientX: number, clientY: number) => { x: number; y: number };
}

const MIN_SIZE = 40;

export function SectionRect({
  section,
  selected,
  onSelect,
  onUpdate,
  clientToSvg,
}: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const { x, y } = clientToSvg(e.clientX, e.clientY);
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      const init = drag.initial;

      switch (drag.mode) {
        case "move":
          onUpdate(section.id, {
            floor_x: Math.max(0, init.floor_x + dx),
            floor_y: Math.max(0, init.floor_y + dy),
          });
          break;
        case "e":
          onUpdate(section.id, {
            floor_width: Math.max(MIN_SIZE, init.floor_width + dx),
          });
          break;
        case "w": {
          const newW = Math.max(MIN_SIZE, init.floor_width - dx);
          onUpdate(section.id, {
            floor_x: init.floor_x + (init.floor_width - newW),
            floor_width: newW,
          });
          break;
        }
        case "s":
          onUpdate(section.id, {
            floor_height: Math.max(MIN_SIZE, init.floor_height + dy),
          });
          break;
        case "n": {
          const newH = Math.max(MIN_SIZE, init.floor_height - dy);
          onUpdate(section.id, {
            floor_y: init.floor_y + (init.floor_height - newH),
            floor_height: newH,
          });
          break;
        }
        case "se":
          onUpdate(section.id, {
            floor_width: Math.max(MIN_SIZE, init.floor_width + dx),
            floor_height: Math.max(MIN_SIZE, init.floor_height + dy),
          });
          break;
        case "sw": {
          const newW = Math.max(MIN_SIZE, init.floor_width - dx);
          onUpdate(section.id, {
            floor_x: init.floor_x + (init.floor_width - newW),
            floor_width: newW,
            floor_height: Math.max(MIN_SIZE, init.floor_height + dy),
          });
          break;
        }
        case "ne": {
          const newH = Math.max(MIN_SIZE, init.floor_height - dy);
          onUpdate(section.id, {
            floor_width: Math.max(MIN_SIZE, init.floor_width + dx),
            floor_y: init.floor_y + (init.floor_height - newH),
            floor_height: newH,
          });
          break;
        }
        case "nw": {
          const newW = Math.max(MIN_SIZE, init.floor_width - dx);
          const newH = Math.max(MIN_SIZE, init.floor_height - dy);
          onUpdate(section.id, {
            floor_x: init.floor_x + (init.floor_width - newW),
            floor_width: newW,
            floor_y: init.floor_y + (init.floor_height - newH),
            floor_height: newH,
          });
          break;
        }
      }
    };
    const onUp = () => setDrag(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, section.id, onUpdate, clientToSvg]);

  const startDrag = (mode: DragMode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const { x, y } = clientToSvg(e.clientX, e.clientY);
    onSelect(section.id);
    setDrag({ mode, startX: x, startY: y, initial: { ...section } });
  };

  const {
    floor_x: x,
    floor_y: y,
    floor_width: w,
    floor_height: h,
    color,
    code,
    name,
  } = section;
  const handleSize = 10;

  const handles: Array<{
    mode: DragMode;
    cx: number;
    cy: number;
    cursor: string;
  }> = selected
    ? [
        { mode: "nw", cx: x, cy: y, cursor: "nw-resize" },
        { mode: "ne", cx: x + w, cy: y, cursor: "ne-resize" },
        { mode: "sw", cx: x, cy: y + h, cursor: "sw-resize" },
        { mode: "se", cx: x + w, cy: y + h, cursor: "se-resize" },
        { mode: "n", cx: x + w / 2, cy: y, cursor: "n-resize" },
        { mode: "s", cx: x + w / 2, cy: y + h, cursor: "s-resize" },
        { mode: "w", cx: x, cy: y + h / 2, cursor: "w-resize" },
        { mode: "e", cx: x + w, cy: y + h / 2, cursor: "e-resize" },
      ]
    : [];

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={color}
        fillOpacity={selected ? 0.25 : 0.16}
        stroke={selected ? "var(--accent)" : color}
        strokeWidth={selected ? 1.5 : 1}
        style={{ cursor: drag?.mode === "move" ? "grabbing" : "grab" }}
        onPointerDown={startDrag("move")}
      />
      <text
        x={x + w / 2}
        y={y + h / 2 - 4}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize={Math.min(20, w / 5)}
        fontWeight={600}
        fill="var(--text)"
        pointerEvents="none"
      >
        {code}
      </text>
      <text
        x={x + w / 2}
        y={y + h / 2 + 14}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize={Math.min(11, w / 12)}
        fill="var(--text-muted)"
        pointerEvents="none"
      >
        {name}
      </text>
      {handles.map(({ mode, cx, cy, cursor }) => (
        <rect
          key={mode}
          x={cx - handleSize / 2}
          y={cy - handleSize / 2}
          width={handleSize}
          height={handleSize}
          fill="var(--accent)"
          stroke="var(--bg)"
          strokeWidth={1}
          style={{ cursor }}
          onPointerDown={startDrag(mode)}
        />
      ))}
    </g>
  );
}
