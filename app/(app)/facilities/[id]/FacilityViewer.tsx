"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Box, Layers3 } from "lucide-react";
import {
  ViewerCanvas,
  type ViewerSection,
  type ViewerElement,
} from "./ViewerCanvas";
import { useViewport } from "@/app/(app)/facilities/[id]/builder/useViewport";

/**
 * 3D viewer is dynamically imported with ssr:false. Two reasons:
 *   1. Three.js + drei is heavy — defer the bundle until someone actually
 *      toggles into 3D mode.
 *   2. r3f relies on browser-only APIs (WebGL, ResizeObserver); SSR would
 *      blow up.
 */
const FacilityViewer3D = dynamic(
  () => import("./FacilityViewer3D").then((m) => m.FacilityViewer3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 min-h-0 hairline bg-[var(--surface)] flex items-center justify-center">
        <p
          className="mono-sm text-text-dim"
          style={{
            letterSpacing: "1px",
            textTransform: "uppercase",
            fontSize: 10,
          }}
        >
          Loading 3D view…
        </p>
      </div>
    ),
  }
);

interface Props {
  facilityId: string;
  canvasWidth: number;
  canvasHeight: number;
  floorUnit: string;
  sections: ViewerSection[];
  elements: ViewerElement[];
}

type ViewMode = "2d" | "3d";

const STORAGE_KEY = "nimbus.facilityViewer.mode";

export function FacilityViewer({
  facilityId,
  canvasWidth,
  canvasHeight,
  floorUnit,
  sections,
  elements,
}: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportApi = useViewport();
  const { fitToContainer } = viewportApi;

  // Persist the user's last chosen view per browser. Default is 2D so the
  // baseline experience is unchanged for everyone who hasn't opted in.
  const [mode, setMode] = useState<ViewMode>("2d");
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "2d" || stored === "3d") setMode(stored);
    } catch {
      // localStorage unavailable (private mode, etc.) — quietly stay on 2D.
    }
  }, []);
  const updateMode = (next: ViewMode) => {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  // Fit floor to the visible canvas on first paint (2D only).
  useEffect(() => {
    if (mode !== "2d") return;
    const id = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      fitToContainer(rect.width, rect.height, canvasWidth, canvasHeight);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Prefetch the section detail route so click feels snappy in either view.
  useEffect(() => {
    for (const s of sections) {
      router.prefetch(`/facilities/${facilityId}/sections/${s.id}`);
    }
  }, [router, facilityId, sections]);

  const goToSection = (sectionId: string) =>
    router.push(`/facilities/${facilityId}/sections/${sectionId}`);

  return (
    <div className="relative flex flex-col flex-1 min-h-0">
      {/* View toggle — pinned to the upper-right of the canvas surface. */}
      <ViewToggle mode={mode} onChange={updateMode} />

      {mode === "2d" ? (
        <ViewerCanvas
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          floorUnit={floorUnit}
          sections={sections}
          elements={elements}
          containerRef={containerRef}
          viewportApi={viewportApi}
          onSectionClick={goToSection}
        />
      ) : (
        <FacilityViewer3D
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          floorUnit={floorUnit}
          sections={sections}
          elements={elements}
          onSectionClick={goToSection}
        />
      )}
    </div>
  );
}

// ─── View toggle ─────────────────────────────────────────────────────────

function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
  return (
    <div
      className="absolute top-14 right-14 z-10 hairline bg-[var(--surface)] flex items-center"
      role="group"
      aria-label="Viewer mode"
    >
      <ToggleButton
        active={mode === "2d"}
        onClick={() => onChange("2d")}
        label="2D"
        title="Top-down view"
      >
        <Layers3 size={11} strokeWidth={1.5} />
        <span>2D</span>
      </ToggleButton>
      <span className="w-px h-14 bg-[var(--border-subtle)]" aria-hidden />
      <ToggleButton
        active={mode === "3d"}
        onClick={() => onChange("3d")}
        label="3D"
        title="Orbital 3D view (beta)"
      >
        <Box size={11} strokeWidth={1.5} />
        <span>3D</span>
        <span
          className="ml-2 text-[var(--accent)]"
          style={{
            fontFamily: "var(--mono)",
            fontSize: 8,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
          }}
        >
          β
        </span>
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={title}
      className={`flex items-center gap-6 px-12 py-7 transition-colors ${
        active
          ? "text-[var(--accent)] bg-[var(--accent-dim)]"
          : "text-text-secondary hover:text-text hover:bg-[var(--surface-2)]"
      }`}
      style={{
        fontFamily: "var(--mono)",
        fontSize: 10,
        letterSpacing: "1px",
        textTransform: "uppercase",
      }}
    >
      {children}
    </button>
  );
}
