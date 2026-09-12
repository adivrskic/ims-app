import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { type NextRequest } from "next/server";
import { csvCell } from "@/lib/print/csv";

/*
 * Orders CSV export. Mirrors the inventory export pattern.
 *
 * Query params:
 *   facility=<id> — scope to one facility (omit or "all" for workspace-wide)
 *   status=<key>  — filter to one status group (e.g. "complete", "in_progress")
 *   from=<iso>    — start of date range (created_at >=)
 *   to=<iso>      — end of date range (created_at <=)
 */


const ORDER_TYPE_LABEL: Record<string, string> = {
  installer_job: "Installer job",
  customer_pickup: "Customer pickup",
  internal_transfer: "Internal transfer",
  restock: "Section restock",
};

// Matches the inventory export. The old 5,000 cap silently truncated a busy
// workspace's export with nothing in the file to say so.
const EXPORT_LIMIT = 100_000;

const STATUS_GROUPS: Record<string, string[]> = {
  active: [
    "created",
    "pick_list_assigned",
    "in_progress",
    "staged",
    "ready",
    "out_for_delivery",
  ],
  complete: ["complete"],
  cancelled: ["cancelled"],
  in_progress: ["pick_list_assigned", "in_progress"],
  ready: ["ready"],
};

export async function GET(req: NextRequest) {
  // Answer 401 rather than handing back an empty 200 CSV. Row-level security
  // already kept the data safe, but without a session check an unauthenticated
  // caller got a well-formed file with only headers — indistinguishable from a
  // workspace that genuinely has no orders. The sibling exports all do this.
  const ctx = await getCurrentOrgContext();
  if (!ctx) return new Response("Not signed in", { status: 401 });

  const supabase = await createClient();
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facility");
  const statusKey = url.searchParams.get("status");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  // An unknown status used to be passed through as a literal filter value, so a
  // typo produced a valid-looking empty file rather than telling anyone. Fail
  // loudly instead, and name the groups that do work.
  if (statusKey && !STATUS_GROUPS[statusKey]) {
    return new Response(
      `Unknown status "${statusKey}". Valid values: ${Object.keys(
        STATUS_GROUPS
      ).join(", ")}.`,
      { status: 400 }
    );
  }

  let query = supabase
    .from("orders")
    .select(
      `
      order_number, order_type, status, customer_name, customer_phone,
      delivery_date, delivery_window, notes, created_at, updated_at,
      warehouse:warehouses ( name ),
      items:order_items ( count )
    `
    )
    // Explicit scope: a user who belongs to two workspaces would otherwise get
    // both orgs' orders merged into one file, since nothing here narrowed it.
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(EXPORT_LIMIT);

  if (facilityId && facilityId !== "all") {
    query = query.eq("warehouse_id", facilityId);
  }
  if (statusKey) {
    query = query.in("status", STATUS_GROUPS[statusKey]);
  }
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data } = await query;

  type Row = {
    order_number: string | null;
    order_type: string;
    status: string;
    customer_name: string | null;
    customer_phone: string | null;
    delivery_date: string | null;
    delivery_window: string | null;
    notes: string | null;
    created_at: string | null;
    updated_at: string | null;
    warehouse: { name: string } | { name: string }[] | null;
    items: Array<{ count: number }> | { count: number } | null;
  };
  const rows = (data ?? []) as Row[];

  const lines: string[] = [];
  lines.push(
    [
      "Order number",
      "Type",
      "Status",
      "Customer",
      "Phone",
      "Facility",
      "Items",
      "Delivery date",
      "Delivery window",
      "Created",
      "Updated",
      "Notes",
    ].join(",")
  );

  for (const o of rows) {
    const facility = Array.isArray(o.warehouse) ? o.warehouse[0] : o.warehouse;
    const items = Array.isArray(o.items) ? o.items[0] : o.items;
    lines.push(
      [
        csvCell(o.order_number ?? ""),
        csvCell(ORDER_TYPE_LABEL[o.order_type] ?? o.order_type),
        csvCell(o.status),
        csvCell(o.customer_name ?? ""),
        csvCell(o.customer_phone ?? ""),
        csvCell(facility?.name ?? ""),
        csvCell(items?.count ?? 0),
        csvCell(o.delivery_date ?? ""),
        csvCell(o.delivery_window ?? ""),
        csvCell(o.created_at ?? ""),
        csvCell(o.updated_at ?? ""),
        csvCell(o.notes ?? ""),
      ].join(",")
    );
  }

  const csv = lines.join("\r\n");
  const today = new Date().toISOString().slice(0, 10);

  // Filename suffixes for disambiguation when multiple exports land in
  // the same download folder.
  let suffix = "";
  if (facilityId && facilityId !== "all") {
    const { data: wh } = await supabase
      .from("warehouses")
      .select("name")
      .eq("id", facilityId)
      .maybeSingle();
    if (wh?.name) {
      const slug = wh.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      suffix += `-${slug}`;
    }
  }
  if (statusKey) suffix += `-${statusKey}`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Nautilus-orders${suffix}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
