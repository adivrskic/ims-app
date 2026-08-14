import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgContext } from "@/lib/data/user";
import { parseSort, parseOrder, type InventoryRow } from "@/lib/data/inventory";
import { type NextRequest } from "next/server";
import { csvCell } from "@/lib/print/csv";

/*
 * Inventory CSV export.
 *
 * Backed by the same `inventory_list` RPC as the inventory page, so the
 * download mirrors what's on screen: search (q), category filter
 * (category=<category_id>), low-stock-only (low=1), sort/order, and facility
 * scope (facility=<id>; omit or "all" for workspace-wide). One large window
 * pulls the whole filtered set into a single CSV.
 */

const EXPORT_LIMIT = 100_000;


export async function GET(req: NextRequest) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return new Response("Not signed in", { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const category = url.searchParams.get("category");
  const low = url.searchParams.get("low") === "1";
  const sort = parseSort(url.searchParams.get("sort") ?? undefined);
  const order = parseOrder(url.searchParams.get("order") ?? undefined);
  const facilityParam = url.searchParams.get("facility");
  const facilityId =
    facilityParam && facilityParam !== "all" ? facilityParam : null;

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("inventory_list", {
    p_org: ctx.orgId,
    p_facility: facilityId,
    p_q: q?.trim() || null,
    p_category: category || null,
    p_low_only: low,
    p_sort: sort,
    p_order: order,
    p_limit: EXPORT_LIMIT,
    p_offset: 0,
  });

  if (error) {
    console.error("inventory export rpc failed:", error.message);
    return new Response("Export failed", { status: 500 });
  }

  const rows = (data as InventoryRow[]) ?? [];

  const lines: string[] = [];
  lines.push(
    [
      "SKU",
      "Name",
      "Barcode",
      "Category",
      "Manufacturer",
      "Reorder point",
      "On hand",
      "Primary location",
      "Updated",
    ].join(",")
  );

  for (const p of rows) {
    lines.push(
      [
        csvCell(p.internal_sku ?? ""),
        csvCell(p.name),
        csvCell(p.barcode),
        csvCell(p.category_name ?? ""),
        csvCell(p.manufacturer ?? ""),
        csvCell(p.reorder_point ?? 0),
        csvCell(p.on_hand ?? 0),
        csvCell(p.primary_location ?? ""),
        csvCell(p.updated_at ?? ""),
      ].join(",")
    );
  }

  const csv = lines.join("\r\n");
  const today = new Date().toISOString().slice(0, 10);

  let suffix = "";
  if (facilityId) {
    const { data: wh } = await admin
      .from("warehouses")
      .select("name")
      .eq("id", facilityId)
      .maybeSingle();
    if (wh?.name) {
      const slug = wh.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      suffix = `-${slug}`;
    }
  }
  if (low) suffix += "-low-stock";

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Nautilus-inventory${suffix}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
