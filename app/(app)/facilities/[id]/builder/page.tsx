import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ArrowLeft } from "lucide-react";
import { BuilderShell } from "./BuilderShell";
import { ELEMENT_PRESETS } from "./elementPresets";
import type { ElementKind } from "./types";

export const metadata = { title: "Layout builder" };

const VALID_ELEMENT_KINDS: readonly ElementKind[] = [
  "walkway",
  "note",
  "door",
  "obstacle",
  "staging",
] as const;

export default async function BuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id, name, floor_canvas_width, floor_canvas_height, floor_unit")
    .eq("id", id)
    .maybeSingle();

  if (!warehouse) notFound();

  /*
   * Parallel-fetch sections + layout elements. The builder reducer expects
   * both arrays to be defined at mount; previously elements was missing
   * entirely, which crashed BuilderToolbar's `state.elements.length` read
   * on the very first render.
   */
  const [{ data: sections }, { data: elements }] = await Promise.all([
    supabase
      .from("sections")
      .select(
        "id, code, name, color, total_bays, total_levels, sort_order, floor_x, floor_y, floor_width, floor_height, rotation"
      )
      .eq("warehouse_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("layout_elements")
      .select(
        "id, kind, floor_x, floor_y, floor_width, floor_height, rotation, color, label, data, sort_order"
      )
      .eq("warehouse_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  const initialSections = (sections ?? []).map((s) => ({
    id: s.id,
    isNew: false,
    code: s.code ?? "",
    name: s.name ?? "",
    floor_x: Number(s.floor_x),
    floor_y: Number(s.floor_y),
    floor_width: Number(s.floor_width),
    floor_height: Number(s.floor_height),
    rotation: Number(s.rotation),
    total_bays: s.total_bays ?? 10,
    total_levels: s.total_levels ?? 3,
    color: s.color ?? "#D4A853",
    sort_order: s.sort_order ?? 0,
  }));

  const initialElements = (elements ?? [])
    .filter((e): e is typeof e & { kind: ElementKind } =>
      VALID_ELEMENT_KINDS.includes(e.kind as ElementKind)
    )
    .map((e) => ({
      id: e.id,
      isNew: false,
      kind: e.kind,
      floor_x: Number(e.floor_x),
      floor_y: Number(e.floor_y),
      floor_width: Number(e.floor_width),
      floor_height: Number(e.floor_height),
      rotation: Number(e.rotation),
      color: e.color ?? ELEMENT_PRESETS[e.kind].defaultColor,
      label: e.label ?? "",
      data: (e.data as Record<string, unknown>) ?? {},
      sort_order: e.sort_order ?? 0,
    }));

  return (
    <div className="flex flex-col gap-24 flex-1 min-h-0">
      <div className="flex flex-col gap-12 shrink-0">
        {/* Back-link updated: /settings/facilities → /facilities */}
        <Link
          href="/facilities"
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors w-fit"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text">All facilities</span>
        </Link>
        <PageHeader
          eyebrow="Facility"
          title={`${warehouse.name} · Layout`}
          description="Drag sections to position them. Resize from the corners. Scan a blueprint to auto-detect sections from an existing floor plan."
        />
      </div>

      <BuilderShell
        warehouseId={warehouse.id}
        canvasWidth={Number(warehouse.floor_canvas_width)}
        canvasHeight={Number(warehouse.floor_canvas_height)}
        floorUnit={warehouse.floor_unit}
        initialSections={initialSections}
        initialElements={initialElements}
      />
    </div>
  );
}
