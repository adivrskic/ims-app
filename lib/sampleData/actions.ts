"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";
import { sampleActivity, sampleCatalogFor } from "./catalog";
import {
  SAMPLE_DATA_VERSION,
  emptySampleIds,
  type SampleDataIds,
  type SampleDataMarker,
} from "./types";

export type SampleDataResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const SAMPLE_NOTE = "Sample data";

type Admin = ReturnType<typeof createAdminClient>;

async function gate(): Promise<
  | { ok: true; orgId: string; userId: string }
  | { ok: false; error: string }
> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (ctx.role === "member" || !ctx.can("inventory.manage")) {
    return {
      ok: false,
      error: "Only owners and admins can load or clear sample data.",
    };
  }
  return { ok: true, orgId: ctx.orgId, userId: ctx.user.id };
}

function bustEverything(orgId: string) {
  for (const t of [
    tags.products,
    tags.inventory,
    tags.categories,
    tags.suppliers,
    tags.customers,
    tags.orders,
    tags.purchaseOrders,
    tags.scans,
    tags.sections,
    tags.org,
  ]) {
    revalidateTag(t(orgId));
  }
  revalidatePath("/", "layout");
}

async function writeMarker(
  admin: Admin,
  orgId: string,
  marker: SampleDataMarker | null
) {
  await admin.from("orgs").update({ sample_data: marker }).eq("id", orgId);
}

/**
 * Seed a realistic, industry-appropriate demo set into the caller's
 * workspace: categories, suppliers, customers, three sections, ten products
 * with stock in real bays, a purchase order in transit, two open orders and
 * two weeks of backdated scans. Every created row's id is recorded on
 * orgs.sample_data so `clearSampleData` removes exactly those rows.
 *
 * Idempotent per workspace (refuses while a marker exists). Rows that already
 * exist by name / barcode / section code are reused, not duplicated, and are
 * NOT recorded — clearing never touches something the customer made.
 * Service-role client with explicit org_id filters throughout.
 */
export async function loadSampleData(): Promise<SampleDataResult> {
  const g = await gate();
  if (!g.ok) return g;
  const { orgId, userId } = g;
  const admin = createAdminClient();

  const { data: org } = await admin
    .from("orgs")
    .select("industry, sample_data")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return { ok: false, error: "Workspace not found." };
  if (org.sample_data) {
    return {
      ok: false,
      error: "Sample data is already loaded — clear it before loading again.",
    };
  }

  const { data: warehouse } = await admin
    .from("warehouses")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!warehouse) {
    return {
      ok: false,
      error:
        "Add a facility first (Facilities → New facility), then load sample data into it.",
    };
  }

  const catalog = sampleCatalogFor(org.industry as string | null);
  const activity = sampleActivity(catalog);
  const ids: SampleDataIds = emptySampleIds();
  const nowMs = Date.now();
  const at = (daysAgo: number, hour = 10): string => {
    if (daysAgo === 0) return new Date(nowMs - 45 * 60_000).toISOString();
    const t = new Date(nowMs - daysAgo * 86_400_000);
    t.setHours(hour, 0, 0, 0);
    return t.toISOString();
  };
  const dateOnly = (daysFromNow: number): string =>
    new Date(nowMs + daysFromNow * 86_400_000).toISOString().slice(0, 10);

  const marker = (): SampleDataMarker => ({
    version: SAMPLE_DATA_VERSION,
    seeded_at: new Date(nowMs).toISOString(),
    seeded_by: userId,
    warehouse_id: warehouse.id,
    ids,
  });

  // Anything created before a failure is recorded, so "Clear sample data"
  // can remove the partial set.
  const fail = async (step: string, message: string): Promise<SampleDataResult> => {
    const anything = Object.values(ids).some((l) => l.length > 0);
    if (anything) await writeMarker(admin, orgId, marker());
    bustEverything(orgId);
    return {
      ok: false,
      error: `Sample data stopped while creating ${step}: ${message}.${
        anything ? " Use “Clear sample data” to remove the partial set, then try again." : ""
      }`,
    };
  };

  // ── Categories ────────────────────────────────────────────────────────
  const catMap = new Map<string, string>();
  {
    const { data: existing } = await admin
      .from("categories")
      .select("id, name")
      .eq("org_id", orgId);
    for (const c of existing ?? []) catMap.set(c.name.toLowerCase(), c.id);
    const names = [...new Set(catalog.products.map((p) => p.category))];
    const missing = names.filter((n) => !catMap.has(n.toLowerCase()));
    if (missing.length > 0) {
      const { data, error } = await admin
        .from("categories")
        .insert(
          missing.map((name, i) => ({ org_id: orgId, name, sort_order: 100 + i }))
        )
        .select("id, name");
      if (error) return fail("categories", error.message);
      for (const c of data ?? []) {
        catMap.set(c.name.toLowerCase(), c.id);
        ids.categories.push(c.id);
      }
    }
  }

  // ── Suppliers ─────────────────────────────────────────────────────────
  const supplierIds: string[] = [];
  {
    const { data: existing } = await admin
      .from("suppliers")
      .select("id, name")
      .eq("org_id", orgId);
    const byName = new Map(
      (existing ?? []).map((s) => [s.name.toLowerCase(), s.id as string])
    );
    const missing = catalog.suppliers.filter(
      (s) => !byName.has(s.name.toLowerCase())
    );
    if (missing.length > 0) {
      const { data, error } = await admin
        .from("suppliers")
        .insert(
          missing.map((s) => ({
            org_id: orgId,
            name: s.name,
            contact_name: s.contactName,
            email: s.email,
            phone: s.phone,
            city: s.city,
            state: s.state,
            country: "US",
            payment_terms: s.paymentTerms,
            default_lead_time_days: s.leadTimeDays,
            notes: SAMPLE_NOTE,
            is_active: true,
            created_by: userId,
          }))
        )
        .select("id, name");
      if (error) return fail("suppliers", error.message);
      for (const s of data ?? []) {
        byName.set(s.name.toLowerCase(), s.id);
        ids.suppliers.push(s.id);
      }
    }
    for (const s of catalog.suppliers) {
      supplierIds.push(byName.get(s.name.toLowerCase())!);
    }
  }

  // ── Customers ─────────────────────────────────────────────────────────
  const customerIds: string[] = [];
  {
    const { data: existing } = await admin
      .from("customers")
      .select("id, name")
      .eq("org_id", orgId);
    const byName = new Map(
      (existing ?? []).map((c) => [c.name.toLowerCase(), c.id as string])
    );
    const missing = catalog.customers.filter(
      (c) => !byName.has(c.name.toLowerCase())
    );
    if (missing.length > 0) {
      const { data, error } = await admin
        .from("customers")
        .insert(
          missing.map((c) => ({
            org_id: orgId,
            name: c.name,
            company_name: c.companyName,
            customer_type: c.companyName ? "business" : "individual",
            email: c.email,
            phone: c.phone,
            city: c.city,
            state: c.state,
            country: "US",
            payment_terms: "net_30",
            discount_percent: 0,
            notes: SAMPLE_NOTE,
            is_active: true,
            created_by: userId,
          }))
        )
        .select("id, name");
      if (error) return fail("customers", error.message);
      for (const c of data ?? []) {
        byName.set(c.name.toLowerCase(), c.id);
        ids.customers.push(c.id);
      }
    }
    for (const c of catalog.customers) {
      customerIds.push(byName.get(c.name.toLowerCase())!);
    }
  }

  // ── Sections (in the first facility) ──────────────────────────────────
  const sectionByCode = new Map<
    string,
    { id: string; bays: number; levels: number }
  >();
  {
    const { data: existing } = await admin
      .from("sections")
      .select("id, code, total_bays, total_levels")
      .eq("org_id", orgId)
      .eq("warehouse_id", warehouse.id);
    for (const s of existing ?? []) {
      sectionByCode.set(String(s.code).trim().toUpperCase(), {
        id: s.id,
        bays: s.total_bays,
        levels: s.total_levels,
      });
    }
    const missing = catalog.sections.filter(
      (s) => !sectionByCode.has(s.code.toUpperCase())
    );
    if (missing.length > 0) {
      const colors = ["#D4A853", "#7FA6B8", "#8FA37A"];
      const { data, error } = await admin
        .from("sections")
        .insert(
          missing.map((s, i) => ({
            org_id: orgId,
            warehouse_id: warehouse.id,
            code: s.code,
            name: s.name,
            total_bays: s.bays,
            total_levels: s.levels,
            color: colors[i % colors.length],
            sort_order: 100 + i,
            floor_x: 40 + i * 260,
            floor_y: 60,
            floor_width: 220,
            floor_height: 80,
          }))
        )
        .select("id, code, total_bays, total_levels");
      if (error) return fail("sections", error.message);
      for (const s of data ?? []) {
        sectionByCode.set(String(s.code).trim().toUpperCase(), {
          id: s.id,
          bays: s.total_bays,
          levels: s.total_levels,
        });
        ids.sections.push(s.id);
      }
    }
  }

  // ── Products ──────────────────────────────────────────────────────────
  const productIdByBarcode = new Map<string, string>();
  {
    const barcodes = catalog.products.map((p) => p.barcode);
    const { data: existing } = await admin
      .from("products")
      .select("id, barcode")
      .eq("org_id", orgId)
      .in("barcode", barcodes);
    const taken = new Set((existing ?? []).map((p) => p.barcode as string));
    const fresh = catalog.products.filter((p) => !taken.has(p.barcode));
    if (fresh.length > 0) {
      const { data, error } = await admin
        .from("products")
        .insert(
          fresh.map((p) => ({
            org_id: orgId,
            barcode: p.barcode,
            internal_sku: p.sku,
            name: p.name,
            category_id: catMap.get(p.category.toLowerCase()) ?? null,
            manufacturer: p.manufacturer,
            weight: p.weight,
            reorder_point: p.reorderPoint,
            safety_stock: p.safetyStock,
            lead_time_days: p.leadTimeDays,
            unit_cost: p.unitCost,
            unit_price: p.unitPrice,
            preferred_supplier_id: supplierIds[p.supplier] ?? null,
            notes: SAMPLE_NOTE,
          }))
        )
        .select("id, barcode");
      if (error) return fail("products", error.message);
      for (const p of data ?? []) {
        productIdByBarcode.set(p.barcode, p.id);
        ids.products.push(p.id);
      }
    }
  }
  const created = catalog.products.filter((p) =>
    productIdByBarcode.has(p.barcode)
  );
  const idOf = (barcode: string) => productIdByBarcode.get(barcode) ?? null;

  const slotOf = (location: string) => {
    const [code, bay, level] = location.split("-");
    const section = sectionByCode.get(code.toUpperCase());
    if (!section) return null;
    return {
      section_id: section.id,
      bay: Math.min(Number(bay) || 1, section.bays),
      level: Math.min(Number(level) || 1, section.levels),
    };
  };

  // ── On-hand stock in real bays ────────────────────────────────────────
  {
    const rows = created
      .filter((p) => p.qty > 0)
      .map((p) => {
        const slot = slotOf(p.location);
        return {
          org_id: orgId,
          warehouse_id: warehouse.id,
          section_id: slot?.section_id ?? null,
          bay: slot?.bay ?? 1,
          level: slot?.level ?? 1,
          product_id: idOf(p.barcode)!,
          quantity: p.qty,
          is_active: true,
          placed_by: userId,
          placed_at: at(12, 9),
        };
      });
    if (rows.length > 0) {
      const { error } = await admin.from("locations").insert(rows);
      if (error) return fail("stock", error.message);
    }
  }

  // ── A purchase order in transit ───────────────────────────────────────
  {
    const lines = activity.purchaseOrder.lines.filter((l) =>
      idOf(l.product.barcode)
    );
    const supplier = catalog.suppliers[activity.purchaseOrder.supplier];
    const supplierId = supplierIds[activity.purchaseOrder.supplier];
    if (lines.length > 0 && supplierId) {
      const { data: poNumber, error: numErr } = await admin.rpc(
        "next_document_number",
        { p_org_id: orgId, p_kind: "PO", p_prefix: "PO", p_pad: 0, p_start: 2049 }
      );
      if (numErr) return fail("the purchase order", numErr.message);
      const { data: po, error } = await admin
        .from("purchase_orders")
        .insert({
          org_id: orgId,
          warehouse_id: warehouse.id,
          po_number: poNumber as string,
          supplier_id: supplierId,
          supplier_name: supplier.name,
          supplier_contact: supplier.email,
          status: "sent",
          expected_date: dateOnly(activity.purchaseOrder.expectedInDays),
          notes: SAMPLE_NOTE,
          created_by: userId,
          sent_at: at(activity.purchaseOrder.sentDaysAgo, 14),
          created_at: at(activity.purchaseOrder.sentDaysAgo, 13),
        })
        .select("id")
        .single();
      if (error || !po) {
        return fail("the purchase order", error?.message ?? "unknown error");
      }
      ids.purchase_orders.push(po.id);
      const { error: lineErr } = await admin.from("po_line_items").insert(
        lines.map((l) => ({
          po_id: po.id,
          product_id: idOf(l.product.barcode),
          product_name: l.product.name,
          barcode: l.product.barcode,
          quantity_expected: l.quantity,
          unit_cost: l.product.unitCost,
        }))
      );
      if (lineErr) return fail("purchase order lines", lineErr.message);
    }
  }

  // ── Two open orders ───────────────────────────────────────────────────
  for (const o of activity.orders) {
    const lines = o.lines.filter((l) => idOf(l.product.barcode));
    const customer = catalog.customers[o.customer];
    const customerId = customerIds[o.customer];
    if (lines.length === 0 || !customerId) continue;
    const { data: orderNumber, error: numErr } = await admin.rpc(
      "next_document_number",
      { p_org_id: orgId, p_kind: "ORD", p_prefix: "ORD", p_pad: 0, p_start: 1049 }
    );
    if (numErr) return fail("orders", numErr.message);
    const total = lines.reduce(
      (sum, l) => sum + l.quantity * l.product.unitPrice,
      0
    );
    const { data: order, error } = await admin
      .from("orders")
      .insert({
        org_id: orgId,
        warehouse_id: warehouse.id,
        order_type: "customer_pickup",
        status: o.status,
        order_number: orderNumber as string,
        customer_id: customerId,
        customer_name: customer.companyName ?? customer.name,
        customer_phone: customer.phone,
        customer_email: customer.email,
        notes: SAMPLE_NOTE,
        created_by: userId,
        source: "manual",
        total: Math.round(total * 100) / 100,
        placed_at: at(1, 11),
        created_at: at(1, 11),
      })
      .select("id")
      .single();
    if (error || !order) return fail("orders", error?.message ?? "unknown error");
    ids.orders.push(order.id);
    const { error: itemErr } = await admin.from("order_items").insert(
      lines.map((l) => ({
        order_id: order.id,
        product_id: idOf(l.product.barcode),
        quantity_requested: l.quantity,
        unit_price: l.product.unitPrice,
        line_total: Math.round(l.quantity * l.product.unitPrice * 100) / 100,
      }))
    );
    if (itemErr) return fail("order lines", itemErr.message);
  }

  // ── Two weeks of activity ─────────────────────────────────────────────
  {
    const rows = activity.scans
      .filter((s) => idOf(s.product.barcode))
      .map((s) => ({
        org_id: orgId,
        product_id: idOf(s.product.barcode),
        warehouse_id: warehouse.id,
        scanned_by: userId,
        action: s.action,
        quantity: s.quantity,
        to_location: s.action === "register" ? slotOf(s.product.location) : null,
        scanned_at: at(s.daysAgo, 9 + (s.daysAgo % 6)),
        notes: SAMPLE_NOTE,
      }));
    if (rows.length > 0) {
      const { data, error } = await admin
        .from("scan_history")
        .insert(rows)
        .select("id");
      if (error) return fail("activity", error.message);
      for (const r of data ?? []) ids.scans.push(r.id);
    }
  }

  await writeMarker(admin, orgId, marker());
  bustEverything(orgId);

  return {
    ok: true,
    message: `Loaded ${ids.products.length} products with stock at ${warehouse.name}, ${ids.suppliers.length} suppliers, ${ids.customers.length} customers, a purchase order in transit, ${ids.orders.length} open orders and ${ids.scans.length} scans.`,
  };
}

/**
 * Remove everything `loadSampleData` created — and nothing else. Deletion
 * order respects the FKs: activity and documents first, then products (their
 * stock cascades), then the reference rows. Customer-made rows that point at
 * sample products (order lines, PO lines) block the clear with a plain
 * message rather than being silently deleted.
 */
export async function clearSampleData(): Promise<SampleDataResult> {
  const g = await gate();
  if (!g.ok) return g;
  const { orgId } = g;
  const admin = createAdminClient();

  const { data: org } = await admin
    .from("orgs")
    .select("sample_data")
    .eq("id", orgId)
    .maybeSingle();
  const stored = (org?.sample_data ?? null) as SampleDataMarker | null;
  if (!stored) return { ok: false, error: "There is no sample data to clear." };
  const ids: SampleDataIds = { ...emptySampleIds(), ...stored.ids };

  const del = async (table: string, list: string[]): Promise<string | null> => {
    if (list.length === 0) return null;
    const { error } = await admin
      .from(table)
      .delete()
      .eq("org_id", orgId)
      .in("id", list);
    return error ? `${table}: ${error.message}` : null;
  };
  const stop = (what: string, message: string): SampleDataResult => ({
    ok: false,
    error: `Couldn't remove the sample ${what} (${message}). Fix that and try again — the rest is still tracked.`,
  });

  // Guard: the customer's own documents referencing sample products.
  if (ids.products.length > 0) {
    let q = admin
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .in("product_id", ids.products);
    if (ids.orders.length > 0) {
      q = q.not("order_id", "in", `(${ids.orders.join(",")})`);
    }
    const { count: orderLines } = await q;
    if (orderLines) {
      return {
        ok: false,
        error: `${orderLines} line${
          orderLines === 1 ? "" : "s"
        } on your own orders use sample products — remove those lines (or those orders) first.`,
      };
    }
    let p = admin
      .from("po_line_items")
      .select("id", { count: "exact", head: true })
      .in("product_id", ids.products);
    if (ids.purchase_orders.length > 0) {
      p = p.not("po_id", "in", `(${ids.purchase_orders.join(",")})`);
    }
    const { count: poLines } = await p;
    if (poLines) {
      return {
        ok: false,
        error: `${poLines} line${
          poLines === 1 ? "" : "s"
        } on your own purchase orders use sample products — remove those first.`,
      };
    }
  }

  // Activity, including any scans the customer did on sample products.
  if (ids.products.length > 0) {
    const { error } = await admin
      .from("scan_history")
      .delete()
      .eq("org_id", orgId)
      .in("product_id", ids.products);
    if (error) return stop("activity", error.message);
  }
  let err = await del("scan_history", ids.scans);
  if (err) return stop("activity", err);

  // Documents (lines cascade).
  err = await del("orders", ids.orders);
  if (err) return stop("orders", err);
  err = await del("purchase_orders", ids.purchase_orders);
  if (err) return stop("purchase order", err);

  // Products (stock rows cascade).
  err = await del("products", ids.products);
  if (err) return stop("products", err);

  // Reference rows. Unhook anything of the customer's that points at them.
  if (ids.categories.length > 0) {
    await admin
      .from("products")
      .update({ category_id: null })
      .eq("org_id", orgId)
      .in("category_id", ids.categories);
    await admin
      .from("sections")
      .update({ default_category: null })
      .eq("org_id", orgId)
      .in("default_category", ids.categories);
  }
  err = await del("categories", ids.categories);
  if (err) return stop("categories", err);
  err = await del("suppliers", ids.suppliers);
  if (err) return stop("suppliers", err);
  err = await del("customers", ids.customers);
  if (err) return stop("customers", err);
  err = await del("sections", ids.sections);
  if (err) return stop("sections", err);

  await writeMarker(admin, orgId, null);
  bustEverything(orgId);
  return { ok: true, message: "Sample data cleared. Your own data is untouched." };
}
