"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/facilityScope";

export interface ScanLookupResult {
  found: boolean;
  barcode: string;
  product?: {
    id: string;
    name: string;
    barcode: string;
    internal_sku: string | null;
    manufacturer: string | null;
    reorder_point: number | null;
    category_name: string | null;
    on_hand_total: number;
    on_hand_here: number | null;
    locations: Array<{
      bay: number;
      level: number;
      quantity: number;
      section_code: string | null;
      section_name: string | null;
      facility_id: string;
    }>;
  };
  error?: string;
}

/**
 * Look up a scanned barcode. Returns the product with its current
 * locations, on-hand totals (workspace-wide and at the active facility),
 * and a fast "not found" if the barcode isn't in the catalog yet.
 *
 * Used by the /scan page and any other workflow that wants to resolve a
 * scan into a product. Keep this server-side — barcode lookups should
 * always go through Supabase RLS rather than client-side cache.
 */
export async function lookupBarcode(
  barcode: string
): Promise<ScanLookupResult> {
  const trimmed = barcode.trim();
  if (!trimmed) {
    return { found: false, barcode, error: "Empty barcode" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: product, error } = await supabase
    .from("products")
    .select(
      `
      id, name, barcode, internal_sku, manufacturer, reorder_point,
      category:categories ( name ),
      locations:locations (
        bay, level, quantity, warehouse_id,
        section:sections ( code, name )
      )
    `
    )
    .eq("barcode", trimmed)
    .maybeSingle();

  if (error) {
    return { found: false, barcode: trimmed, error: error.message };
  }

  if (!product) {
    return { found: false, barcode: trimmed };
  }

  type LocRow = {
    bay: number;
    level: number;
    quantity: number | null;
    warehouse_id: string;
    section:
      | { code: string | null; name: string | null }
      | { code: string | null; name: string | null }[]
      | null;
  };
  const rawLocs = (product.locations ?? []) as LocRow[];

  const locations = rawLocs.map((l) => {
    const sec = Array.isArray(l.section) ? l.section[0] : l.section;
    return {
      bay: l.bay,
      level: l.level,
      quantity: l.quantity ?? 0,
      section_code: sec?.code?.trim() ?? null,
      section_name: sec?.name ?? null,
      facility_id: l.warehouse_id,
    };
  });

  const on_hand_total = locations.reduce((s, l) => s + l.quantity, 0);
  const on_hand_here =
    scope.mode === "single"
      ? locations
          .filter((l) => l.facility_id === scope.id)
          .reduce((s, l) => s + l.quantity, 0)
      : null;

  const cat = Array.isArray(product.category)
    ? product.category[0]
    : product.category;

  return {
    found: true,
    barcode: trimmed,
    product: {
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      internal_sku: product.internal_sku,
      manufacturer: product.manufacturer,
      reorder_point: product.reorder_point,
      category_name: cat?.name ?? null,
      on_hand_total,
      on_hand_here,
      locations:
        scope.mode === "single"
          ? locations.filter((l) => l.facility_id === scope.id)
          : locations,
    },
  };
}
