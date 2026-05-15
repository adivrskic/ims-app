"use client";

import { useRef } from "react";
import { SectionRect } from "./SectionRect";
import type { SectionDraft } from "./types";

interface Props {
  canvasWidth: number;
  canvasHeight: number;
  floorUnit: string;
  sections: SectionDraft[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<SectionDraft>) => void;
}

export function FloorCanvas({
  canvasWidth,
  canvasHeight,
  floorUnit,
  sections,
  selectedId,
  onSelect,
  onUpdate,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  const clientToSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const t = pt.matrixTransform(ctm.inverse());
    return { x: t.x, y: t.y };
  };

  return (
    <div className="relative flex-1 overflow-auto hairline bg-[var(--surface)] min-h-[600px]">
      {/* Ruler badge */}
      <div
        className="absolute top-10 left-10 hairline-subtle bg-[var(--surface-2)] px-8 py-4 z-10 pointer-events-none"
        style={{
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: "1px",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        {Math.round(canvasWidth)} × {Math.round(canvasHeight)} {floorUnit}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        style={{ width: canvasWidth, height: canvasHeight, display: "block" }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelect(null);
        }}
      >
        <defs>
          <pattern
            id="grid-minor"
            width={20}
            height={20}
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="var(--border-faint)"
              strokeWidth={0.5}
            />
          </pattern>
          <pattern
            id="grid-major"
            width={100}
            height={100}
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 100 0 L 0 0 0 100"
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth={0.8}
            />
          </pattern>
        </defs>
        <rect
          x={0}
          y={0}
          width={canvasWidth}
          height={canvasHeight}
          fill="url(#grid-minor)"
          onClick={() => onSelect(null)}
        />
        <rect
          x={0}
          y={0}
          width={canvasWidth}
          height={canvasHeight}
          fill="url(#grid-major)"
          pointerEvents="none"
        />

        {sections.map((s) => (
          <SectionRect
            key={s.id}
            section={s}
            selected={s.id === selectedId}
            onSelect={onSelect}
            onUpdate={onUpdate}
            clientToSvg={clientToSvg}
          />
        ))}
      </svg>
    </div>
  );
}
