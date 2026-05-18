import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SectionDetail } from "./SectionDetail";

export default async function SectionPage({
  params,
}: {
  params: Promise<{ id: string; sectionId: string }>;
}) {
  const { id: facilityId, sectionId } = await params;
  const supabase = await createClient();

  const { data: section } = await supabase
    .from("sections")
    .select("id, code, name, total_bays, total_levels, color, warehouse_id")
    .eq("id", sectionId)
    .maybeSingle();

  if (!section || section.warehouse_id !== facilityId) notFound();

  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id, name")
    .eq("id", facilityId)
    .maybeSingle();

  if (!warehouse) notFound();

  // Locations within this section, joined to product info. is_active is
  // respected so retired slot records don't muddy the grid.
  const { data: rawLocations } = await supabase
    .from("locations")
    .select(
      "id, bay, level, quantity, placed_at, product:products(id, name, barcode, internal_sku, photo_url, category_id)"
    )
    .eq("section_id", sectionId)
    .eq("is_active", true)
    .order("level", { ascending: false })
    .order("bay", { ascending: true });

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
      <header className="hairline-b pb-12 mb-12 flex items-center gap-14 shrink-0">
        <Link
          href={`/facilities/${facilityId}`}
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text">{warehouse.name}</span>
        </Link>

        <span
          className="h-14 w-px bg-[var(--border-subtle)] hidden sm:inline-block"
          aria-hidden
        />

        <div className="flex items-baseline gap-10 min-w-0">
          <span className="label-text text-text-muted">Section</span>
          <h1
            className="text-text truncate"
            style={{
              fontFamily: "var(--display)",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {section.code} · {section.name}
          </h1>
        </div>
      </header>

      <SectionDetail
        warehouseId={facilityId}
        sectionId={section.id}
        sectionCode={section.code ?? ""}
        sectionName={section.name ?? ""}
        sectionColor={section.color ?? "#D4A853"}
        totalBays={section.total_bays ?? 1}
        totalLevels={section.total_levels ?? 1}
        locations={locations}
      />
    </>
  );
}
