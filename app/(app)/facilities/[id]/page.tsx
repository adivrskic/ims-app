import { notFound } from "next/navigation";
import { FileText, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { CornerLink } from "@/components/ui/CornerButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { FacilityViewer } from "./FacilityViewer";
import { ELEMENT_PRESETS } from "@/app/(app)/facilities/[id]/builder/elementPresets";
import type { ElementKind } from "@/app/(app)/facilities/[id]/builder/types";
import { BulkPrintBayLabels } from "@/components/print/BulkPrintBayLabels";
const VALID_ELEMENT_KINDS: readonly ElementKind[] = [
  "walkway",
  "note",
  "door",
  "obstacle",
  "staging",
] as const;

export default async function FacilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: warehouse } = await supabase
    .from("warehouses")
    .select(
      "id, name, address, city, state, floor_canvas_width, floor_canvas_height, floor_unit"
    )
    .eq("id", id)
    .maybeSingle();

  if (!warehouse) notFound();

  // Permission check for the edit affordance — purely cosmetic, server still
  // enforces on save. Keyed on the granular permission (cookie-aware context),
  // not role, so a granted member sees the affordance and a revoked admin doesn't.
  const ctx = await getCurrentOrgContext();
  const canEdit = ctx?.can("facilities.manage") ?? false;

  // Layout + occupancy in parallel. The occupancy aggregate is cheap (one
  // row per section in this warehouse) and lets the viewer tint sections
  // by how full they are.
  const [{ data: sections }, { data: elements }, { data: occupancy }] =
    await Promise.all([
      supabase
        .from("sections")
        .select(
          "id, code, name, floor_x, floor_y, floor_width, floor_height, rotation, total_bays, total_levels, color, sort_order"
        )
        .eq("warehouse_id", id)
        .order("sort_order"),
      supabase
        .from("layout_elements")
        .select(
          "id, kind, floor_x, floor_y, floor_width, floor_height, rotation, color, label, data, sort_order"
        )
        .eq("warehouse_id", id)
        .order("sort_order"),
      // Occupied slots per section: any active location with a product.
      // We bucket by section, not by exact (bay, level), since a slot
      // with multiple SKUs still counts as one occupied slot.
      supabase
        .from("locations")
        .select("section_id, bay, level")
        .eq("warehouse_id", id)
        .eq("is_active", true)
        .not("product_id", "is", null),
    ]);

  // Build a distinct-(bay,level) count per section_id.
  const occMap = new Map<string, Set<string>>();
  for (const row of occupancy ?? []) {
    if (!row.section_id) continue;
    const set = occMap.get(row.section_id) ?? new Set<string>();
    set.add(`${row.bay}:${row.level}`);
    occMap.set(row.section_id, set);
  }

  const sectionData = (sections ?? []).map((s) => ({
    id: s.id,
    code: s.code ?? "",
    name: s.name ?? "",
    floor_x: Number(s.floor_x),
    floor_y: Number(s.floor_y),
    floor_width: Number(s.floor_width),
    floor_height: Number(s.floor_height),
    rotation: Number(s.rotation),
    total_bays: s.total_bays ?? 1,
    total_levels: s.total_levels ?? 1,
    color: s.color ?? "#D4A853",
    sort_order: s.sort_order ?? 0,
    occupied: occMap.get(s.id)?.size ?? 0,
    capacity: (s.total_bays ?? 1) * (s.total_levels ?? 1),
  }));

  const elementData = (elements ?? [])
    .filter((e): e is typeof e & { kind: ElementKind } =>
      VALID_ELEMENT_KINDS.includes(e.kind as ElementKind)
    )
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      floor_x: Number(e.floor_x),
      floor_y: Number(e.floor_y),
      floor_width: Number(e.floor_width),
      floor_height: Number(e.floor_height),
      rotation: Number(e.rotation),
      color: e.color ?? ELEMENT_PRESETS[e.kind as ElementKind].defaultColor,
      label: e.label ?? "",
    }));

  const addrLine = [warehouse.address, warehouse.city, warehouse.state]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <PageHeader
        title={warehouse.name}
        description={addrLine || undefined}
        backHref="/facilities"
        backLabel="All facilities"
        actions={
          <>
            <BulkPrintBayLabels
              sections={sectionData.map((s) => ({
                code: s.code,
                name: s.name ?? null,
                total_bays: s.total_bays ?? 0,
                total_levels: s.total_levels ?? 0,
              }))}
              buttonLabel="Print all bay labels"
              variant="ghost"
              size="sm"
            />
            {/* Browser-print fallback: works everywhere (no WebUSB/Zebra
                needed) and doubles as a PDF export for Zebra owners. */}
            <CornerLink
              href={`/facilities/${warehouse.id}/labels`}
              variant="ghost"
              size="sm"
              ariaLabel="Printable bay label sheet"
            >
              <FileText size={11} strokeWidth={1.5} />
              Label sheet
            </CornerLink>
            {canEdit && (
              <CornerLink
                href={`/facilities/${warehouse.id}/builder`}
                variant="ghost"
                size="sm"
              >
                <Pencil size={11} strokeWidth={1.5} />
                Edit layout
              </CornerLink>
            )}
          </>
        }
      />

      <div className="flex-1 min-h-0">
        <FacilityViewer
          facilityId={warehouse.id}
          canvasWidth={Number(warehouse.floor_canvas_width)}
          canvasHeight={Number(warehouse.floor_canvas_height)}
          floorUnit={warehouse.floor_unit}
          sections={sectionData}
          elements={elementData}
        />
      </div>
    </>
  );
}
