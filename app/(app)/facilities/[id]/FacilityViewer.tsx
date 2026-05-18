"use client";

import { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ViewerCanvas,
  type ViewerSection,
  type ViewerElement,
} from "./ViewerCanvas";
import { useViewport } from "@/app/(app)/facilities/[id]/builder/useViewport";

interface Props {
  facilityId: string;
  canvasWidth: number;
  canvasHeight: number;
  floorUnit: string;
  sections: ViewerSection[];
  elements: ViewerElement[];
}

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

  // Fit floor to the visible canvas on first paint, matching the builder.
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

  // Prefetch the section detail route so the click feels snappy.
  useEffect(() => {
    for (const s of sections) {
      router.prefetch(`/facilities/${facilityId}/sections/${s.id}`);
    }
  }, [router, facilityId, sections]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ViewerCanvas
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        floorUnit={floorUnit}
        sections={sections}
        elements={elements}
        containerRef={containerRef}
        viewportApi={viewportApi}
        onSectionClick={(sectionId) =>
          router.push(`/facilities/${facilityId}/sections/${sectionId}`)
        }
      />
    </div>
  );
}
