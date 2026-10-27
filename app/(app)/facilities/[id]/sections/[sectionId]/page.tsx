import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getReasons } from "@/lib/data/adjustments";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionDetail } from "./SectionDetail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; sectionId: string }>;
}) {
  const { sectionId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("sections")
    .select("code, name")
    .eq("id", sectionId)
    .maybeSingle();
  return {
    title: data
      ? `Section ${data.code ?? ""}${data.name ? ` · ${data.name}` : ""}`.trim()
      : "Section",
  };
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ id: string; sectionId: string }>;
}) {
  const { id: facilityId, sectionId } = await params;
  const supabase = await createClient();

  // The section, its facility, its locations and the org context only need
  // the route ids, so they load in one round; the reason codes need the org.
  const [{ data: section }, { data: warehouse }, { data: rawLocations }, ctx] =
    await Promise.all([
      supabase
        .from("sections")
        .select(
          "id, code, name, total_bays, total_levels, color, warehouse_id, slot_capacity"
        )
        .eq("id", sectionId)
        .maybeSingle(),
      supabase
        .from("warehouses")
        .select("id, name")
        .eq("id", facilityId)
        .maybeSingle(),
      // Locations within this section, joined to product info. is_active is
      // respected so retired slot records don't muddy the grid.
      supabase
        .from("locations")
        .select(
          "id, bay, level, quantity, placed_at, product:products(id, name, barcode, internal_sku, photo_url, category_id)"
        )
        .eq("section_id", sectionId)
        .eq("is_active", true)
        .order("level", { ascending: false })
        .order("bay", { ascending: true }),
      getCurrentOrgContext(),
    ]);

  if (!section || section.warehouse_id !== facilityId) notFound();
  if (!warehouse) notFound();

  // Active adjustment reasons for the manual-edit reason picker (controlled
  // vocabulary; a reason flagged requires_approval routes the edit to the queue).
  const reasonRows = ctx ? await getReasons(supabase, ctx.orgId, true) : [];
  const reasons = reasonRows.map((r) => ({ code: r.code, label: r.label }));

  const locations = (rawLocations ?? []).map((r) => ({
    id: r.id as string,
    bay: r.bay as number,
    level: r.level as number,
    quantity: r.quantity as number | null,
    placed_at: r.placed_at as string | null,
    product: r.product
      ? {
          id: (r.product as any).id as string,
          name: (r.product as any).name as string,
          barcode: (r.product as any).barcode as string,
          internal_sku: (r.product as any).internal_sku as string | null,
          photo_url: (r.product as any).photo_url as string | null,
        }
      : null,
  }));

  return (
    <>
      <PageHeader
        backHref={`/facilities/${facilityId}`}
        backLabel={warehouse.name}
        eyebrow="Section"
        title={`${section.code} · ${section.name}`}
      />

      <SectionDetail
        warehouseId={facilityId}
        sectionId={section.id}
        sectionCode={section.code ?? ""}
        sectionName={section.name ?? ""}
        sectionColor={section.color ?? "#D4A853"}
        totalBays={section.total_bays ?? 1}
        totalLevels={section.total_levels ?? 1}
        slotCapacity={section.slot_capacity ?? null}
        locations={locations}
        reasons={reasons}
      />
    </>
  );
}
