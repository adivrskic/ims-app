#!/usr/bin/env node
/**
 * seed-demo.mjs — populate a workspace with a realistic demo dataset.
 *
 * WHY THIS EXISTS
 * ---------------
 * A freshly-created workspace is five empty panels. Roughly a third of the
 * app (forecast, valuation, dead stock, slotting, KPI sparklines, low-stock
 * alerts, the auto-draft-PO cron) needs *history*, not just rows — the
 * forecast engine reads a 90-day scan window, velocity reads 60 days, and
 * ABC/turnover need unit costs. Hand-clicking that is hours of work per
 * tester, so this writes it directly.
 *
 * WHAT IT CREATES
 * ---------------
 *   facility + dock door + 4 sections (with floor geometry and pick zones)
 *   6 categories · 3 suppliers · 4 customers
 *   26 products (costs, reorder points, lead times, safety stock)
 *     ├─ 3 lot-tracked, with lots expiring in 9/25/120 days + 1 expired
 *     ├─ 1 kit with a 3-component bill of materials
 *     ├─ 4 deliberately below reorder point (low-stock + auto-draft-PO)
 *     └─ 3 deliberate dead stock (on hand, no picks for 200+ days)
 *   ~150 stock locations across the sections
 *   ~90 days of scan_history (pick/adjust) with weekday seasonality
 *   3 purchase orders: draft · sent · partially received
 *   5 orders: complete · in-flight · one deliberately backordered
 *
 * USAGE
 * -----
 *   node scripts/seed-demo.mjs --org <slug|uuid>
 *   node scripts/seed-demo.mjs --email owner@example.com
 *   node scripts/seed-demo.mjs --org acme --wipe      # remove seed data first
 *   node scripts/seed-demo.mjs --org acme --wipe-only # remove and stop
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * Uses the service-role key, so it bypasses RLS — never point it at a
 * customer workspace you don't intend to modify.
 *
 * SAFETY / IDEMPOTENCE
 * --------------------
 * Every row it writes is tagged with the marker below (in `notes`, or via a
 * name prefix where the table has no notes column). --wipe deletes only
 * tagged rows, so it will never touch real data in a shared workspace.
 * Re-running without --wipe will create a second set; use --wipe to reset.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/** Every seeded row carries this so --wipe can find it again. */
const MARK = "[seed-demo]";
const PREFIX = "QA";

// ── env ───────────────────────────────────────────────────────────────────

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(resolve(ROOT, file), "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (!m) continue;
        const key = m[1];
        let val = m[2].trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        )
          val = val.slice(1, -1);
        if (!(key in process.env)) process.env[key] = val;
      }
    } catch {
      /* file may not exist — fall through to process.env */
    }
  }
}

// ── tiny deterministic RNG so reruns produce the same shape ───────────────

let _seed = 20260730;
const rnd = () => {
  _seed = (_seed * 1664525 + 1013904223) % 4294967296;
  return _seed / 4294967296;
};
const randInt = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const dayISO = (offsetDays) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString();
};
const dateOnly = (offsetDays) => dayISO(offsetDays).slice(0, 10);

// ── catalog definition ────────────────────────────────────────────────────

const CATEGORIES = [
  "Hardwood",
  "Laminate",
  "Tile",
  "Underlayment",
  "Adhesives",
  "Tools",
];

/**
 * velocity = average units picked per day. Drives how much scan history is
 * generated, which in turn drives forecast, dead-stock and turnover.
 *   dead: true  → no picks in the last 200 days (dead-stock report)
 *   low:  true  → seeded on-hand lands below reorder point (low-stock/PO cron)
 */
const PRODUCTS = [
  { sku: "WO-PLK-7",   name: "White Oak Plank 7in",        cat: "Hardwood",     cost: 6.4,  rop: 240, lead: 14, vel: 22 },
  { sku: "WO-PLK-5",   name: "White Oak Plank 5in",        cat: "Hardwood",     cost: 5.1,  rop: 200, lead: 14, vel: 17 },
  { sku: "RO-PLK-7",   name: "Red Oak Plank 7in",          cat: "Hardwood",     cost: 5.8,  rop: 180, lead: 14, vel: 13 },
  { sku: "HIC-PLK-6",  name: "Hickory Plank 6in",          cat: "Hardwood",     cost: 7.9,  rop: 120, lead: 21, vel: 8 },
  { sku: "MPL-PLK-4",  name: "Maple Plank 4in",            cat: "Hardwood",     cost: 6.9,  rop: 90,  lead: 21, vel: 5, low: true },
  { sku: "WAL-PLK-6",  name: "Walnut Plank 6in",           cat: "Hardwood",     cost: 11.2, rop: 60,  lead: 28, vel: 3 },
  { sku: "BAM-PLK-5",  name: "Bamboo Plank 5in",           cat: "Hardwood",     cost: 4.2,  rop: 80,  lead: 30, vel: 0, dead: true },

  { sku: "LAM-OAK-8",  name: "Laminate Oak 8mm",           cat: "Laminate",     cost: 2.1,  rop: 300, lead: 10, vel: 26 },
  { sku: "LAM-GRY-8",  name: "Laminate Grey Ash 8mm",      cat: "Laminate",     cost: 2.3,  rop: 260, lead: 10, vel: 19 },
  { sku: "LAM-WAL-12", name: "Laminate Walnut 12mm",       cat: "Laminate",     cost: 3.4,  rop: 150, lead: 12, vel: 9, low: true },
  { sku: "LAM-WHT-8",  name: "Laminate Whitewash 8mm",     cat: "Laminate",     cost: 2.2,  rop: 100, lead: 10, vel: 0, dead: true },

  { sku: "TIL-CER-12", name: 'Ceramic Tile 12"',           cat: "Tile",         cost: 1.6,  rop: 400, lead: 7,  vel: 31 },
  { sku: "TIL-POR-24", name: 'Porcelain Tile 24"',         cat: "Tile",         cost: 3.9,  rop: 220, lead: 9,  vel: 15 },
  { sku: "TIL-MOS-2",  name: 'Mosaic Tile 2" Sheet',       cat: "Tile",         cost: 5.5,  rop: 90,  lead: 12, vel: 6 },
  { sku: "TIL-SLT-16", name: 'Slate Tile 16"',             cat: "Tile",         cost: 7.2,  rop: 70,  lead: 18, vel: 2, low: true },

  { sku: "UND-FOAM-2", name: "Foam Underlayment 2mm",      cat: "Underlayment", cost: 0.7,  rop: 500, lead: 5,  vel: 38, lots: true },
  { sku: "UND-CORK-3", name: "Cork Underlayment 3mm",      cat: "Underlayment", cost: 1.4,  rop: 260, lead: 8,  vel: 14, lots: true },
  { sku: "UND-FELT-5", name: "Felt Underlayment 5mm",      cat: "Underlayment", cost: 1.1,  rop: 180, lead: 8,  vel: 7 },

  { sku: "ADH-URE-4",  name: "Urethane Adhesive 4gal",     cat: "Adhesives",    cost: 42.0, rop: 60,  lead: 12, vel: 4, lots: true },
  { sku: "ADH-ACR-1",  name: "Acrylic Adhesive 1gal",      cat: "Adhesives",    cost: 16.5, rop: 80,  lead: 12, vel: 6 },
  { sku: "ADH-EPX-2",  name: "Epoxy Grout 2gal",           cat: "Adhesives",    cost: 28.0, rop: 40,  lead: 15, vel: 0, dead: true },

  { sku: "TOL-SAW-01", name: "Flooring Saw Blade 10in",    cat: "Tools",        cost: 34.0, rop: 30,  lead: 6,  vel: 2 },
  { sku: "TOL-NLR-01", name: "Pneumatic Flooring Nailer",  cat: "Tools",        cost: 210.0, rop: 8,  lead: 20, vel: 1, low: true },
  { sku: "TOL-SPC-50", name: "Spacer Wedges (50pk)",       cat: "Tools",        cost: 8.5,  rop: 60,  lead: 6,  vel: 5 },
  { sku: "TOL-KNP-01", name: "Tapping Block + Pull Bar",   cat: "Tools",        cost: 22.0, rop: 25,  lead: 9,  vel: 3 },
];

/** Kit assembled from three real components above. */
const KIT = {
  sku: "KIT-INSTALL-1",
  name: "Installer Starter Kit",
  cat: "Tools",
  cost: 64.0,
  rop: 15,
  lead: 10,
  components: [
    ["TOL-SPC-50", 2],
    ["TOL-KNP-01", 1],
    ["ADH-ACR-1", 1],
  ],
};

const SECTIONS = [
  { code: "A", name: "Hardwood Racks", zone: "Zone A", cat: "Hardwood",     x: 60,  y: 80,  w: 300, h: 90, bays: 12, levels: 4 },
  { code: "B", name: "Laminate Racks", zone: "Zone A", cat: "Laminate",     x: 60,  y: 210, w: 300, h: 90, bays: 12, levels: 4 },
  { code: "C", name: "Tile Bulk",      zone: "Zone B", cat: "Tile",         x: 420, y: 80,  w: 260, h: 90, bays: 10, levels: 3 },
  { code: "D", name: "Consumables",    zone: "Zone B", cat: "Underlayment", x: 420, y: 210, w: 260, h: 90, bays: 10, levels: 3 },
];

const SUPPLIERS = [
  { name: `${PREFIX} Timberline Mills`,  email: "orders@timberline.example", terms: "net_30", lead: 14 },
  { name: `${PREFIX} Cascade Surfaces`,  email: "sales@cascade.example",     terms: "net_45", lead: 10 },
  { name: `${PREFIX} Ironwood Supply`,   email: "ap@ironwood.example",       terms: "net_15", lead: 7 },
];

const CUSTOMERS = [
  { name: `${PREFIX} Brightpath Builders`, company: "Brightpath Builders LLC", type: "business", terms: "net_30", discount: 5 },
  { name: `${PREFIX} Halden Renovations`,  company: "Halden Renovations Inc",  type: "business", terms: "net_15", discount: 0 },
  { name: `${PREFIX} Marcus Ellery`,       company: null,                     type: "individual", terms: "due_on_receipt", discount: 0 },
  { name: `${PREFIX} Northgate Interiors`, company: "Northgate Interiors",    type: "business", terms: "net_30", discount: 2.5 },
];

// ── main ──────────────────────────────────────────────────────────────────

async function main() {
  loadEnv();

  const args = process.argv.slice(2);
  const argOf = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  const orgArg = argOf("--org");
  const emailArg = argOf("--email");
  const wipe = args.includes("--wipe") || args.includes("--wipe-only");
  const wipeOnly = args.includes("--wipe-only");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    fail(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Add them to .env.local (see .env.local.example)."
    );
  }
  if (!orgArg && !emailArg) {
    fail(
      "Tell me which workspace to seed:\n" +
        "  node scripts/seed-demo.mjs --org <slug|uuid>\n" +
        "  node scripts/seed-demo.mjs --email owner@example.com\n" +
        "Add --wipe to clear previously seeded rows first."
    );
  }

  const db = createClient(url, key, {
    db: { schema: "app" },
    auth: { persistSession: false },
  });

  // ── resolve org + an owner user to attribute rows to ────────────────────
  const org = await resolveOrg(db, orgArg, emailArg);
  const userId = await resolveOwner(db, org.id);

  console.log(`\n  Workspace : ${org.name}  (${org.slug})`);
  console.log(`  Org id    : ${org.id}`);
  console.log(`  Acting as : ${userId}\n`);

  if (wipe) {
    await wipeSeed(db, org.id);
    if (wipeOnly) {
      console.log("\n  Wipe complete. Nothing seeded (--wipe-only).\n");
      return;
    }
  }

  const t0 = Date.now();

  const warehouseId = await seedFacility(db, org.id, userId);
  const sectionIds = await seedSections(db, org.id, warehouseId);
  const categoryIds = await seedCategories(db, org.id);
  const supplierIds = await seedSuppliers(db, org.id);
  await seedCustomers(db, org.id);
  const productIds = await seedProducts(db, org.id, categoryIds, supplierIds);
  await seedKit(db, org.id, categoryIds, productIds);
  const placements = await seedLocations(
    db, org.id, warehouseId, sectionIds, productIds, userId
  );
  await seedLots(db, org.id, productIds, supplierIds, userId);
  await seedScanHistory(db, org.id, warehouseId, productIds, userId);
  await seedPurchaseOrders(db, org.id, warehouseId, supplierIds, productIds, userId);
  await seedOrders(db, org.id, warehouseId, productIds, userId);

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n  Done in ${secs}s.`);
  console.log(`  Placed ${placements} stock locations.\n`);
  console.log("  Next steps:");
  console.log("    • Open the app and switch the facility scope to");
  console.log(`      "${PREFIX} Demo Facility" — /picking needs a single facility.`);
  console.log("    • Dashboard sparklines stay flat until the nightly");
  console.log("      kpi-snapshots cron has run at least twice.");
  console.log("    • To remove everything: --wipe-only\n");
}

// ── resolution helpers ────────────────────────────────────────────────────

const isUuid = (s) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

async function resolveOrg(db, orgArg, emailArg) {
  if (orgArg) {
    const col = isUuid(orgArg) ? "id" : "slug";
    const { data, error } = await db
      .from("orgs")
      .select("id, name, slug")
      .eq(col, orgArg)
      .maybeSingle();
    if (error) fail(`Looking up org: ${error.message}`);
    if (!data) fail(`No workspace with ${col} "${orgArg}".`);
    return data;
  }

  const { data: prof, error: pErr } = await db
    .from("profiles")
    .select("id")
    .ilike("email", emailArg)
    .maybeSingle();
  if (pErr) fail(`Looking up profile: ${pErr.message}`);
  if (!prof) fail(`No account for ${emailArg}.`);

  const { data: mem, error: mErr } = await db
    .from("org_members")
    .select("org_id, orgs(id, name, slug)")
    .eq("user_id", prof.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (mErr) fail(`Looking up membership: ${mErr.message}`);
  if (!mem?.orgs) fail(`${emailArg} isn't a member of any workspace.`);
  return mem.orgs;
}

async function resolveOwner(db, orgId) {
  const { data, error } = await db
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", orgId)
    .in("role", ["owner", "admin"])
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) fail(`Looking up owner: ${error.message}`);
  if (!data) fail("That workspace has no owner or admin to attribute rows to.");
  return data.user_id;
}

// ── wipe ──────────────────────────────────────────────────────────────────

async function wipeSeed(db, orgId) {
  step("Wiping previous seed data");

  // Facilities created by the seeder — cascade children by warehouse id.
  const { data: whs } = await db
    .from("warehouses")
    .select("id")
    .eq("org_id", orgId)
    .like("name", `${PREFIX} %`);
  const whIds = (whs ?? []).map((w) => w.id);

  const { data: prods } = await db
    .from("products")
    .select("id")
    .eq("org_id", orgId)
    .like("notes", `%${MARK}%`);
  const prodIds = (prods ?? []).map((p) => p.id);

  // Children first, then parents.
  if (whIds.length) {
    await db.from("scan_history").delete().eq("org_id", orgId).in("warehouse_id", whIds);
    await db.from("locations").delete().eq("org_id", orgId).in("warehouse_id", whIds);
    await db.from("layout_elements").delete().eq("org_id", orgId).in("warehouse_id", whIds);
    await db.from("sections").delete().eq("org_id", orgId).in("warehouse_id", whIds);

    const { data: pos } = await db
      .from("purchase_orders").select("id").eq("org_id", orgId).in("warehouse_id", whIds);
    if (pos?.length) {
      await db.from("po_line_items").delete().in("po_id", pos.map((p) => p.id));
      await db.from("purchase_orders").delete().in("id", pos.map((p) => p.id));
    }

    const { data: ords } = await db
      .from("orders").select("id").eq("org_id", orgId).in("warehouse_id", whIds);
    if (ords?.length) {
      await db.from("order_items").delete().in("order_id", ords.map((o) => o.id));
      await db.from("pick_waves").delete().eq("org_id", orgId).in("warehouse_id", whIds);
      await db.from("orders").delete().in("id", ords.map((o) => o.id));
    }
  }

  if (prodIds.length) {
    await db.from("scan_history").delete().eq("org_id", orgId).in("product_id", prodIds);
    await db.from("locations").delete().eq("org_id", orgId).in("product_id", prodIds);
    await db.from("lots").delete().eq("org_id", orgId).in("product_id", prodIds);
    await db.from("kit_components").delete().eq("org_id", orgId).in("kit_product_id", prodIds);
    await db.from("kit_components").delete().eq("org_id", orgId).in("component_product_id", prodIds);
    await db.from("products").delete().in("id", prodIds);
  }

  if (whIds.length) await db.from("warehouses").delete().in("id", whIds);
  await db.from("suppliers").delete().eq("org_id", orgId).like("name", `${PREFIX} %`);
  await db.from("customers").delete().eq("org_id", orgId).like("name", `${PREFIX} %`);

  console.log(
    `      removed ${whIds.length} facility(ies), ${prodIds.length} products and their rows`
  );
}

// ── seeders ───────────────────────────────────────────────────────────────

async function seedFacility(db, orgId, userId) {
  step("Facility + dock door");
  const { data, error } = await db
    .from("warehouses")
    .insert({
      org_id: orgId,
      name: `${PREFIX} Demo Facility`,
      address: "1400 Kiln Road",
      city: "Tacoma",
      state: "WA",
      zip: "98402",
      phone: "253-555-0142",
      owner_id: userId,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) fail(`facility: ${error.message}`);

  // The dock door is the origin for travel-distance scoring in slotting and
  // pick-zone ordering. Without it those features silently degrade.
  const { error: eErr } = await db.from("layout_elements").insert({
    org_id: orgId,
    warehouse_id: data.id,
    kind: "door",
    floor_x: 330,
    floor_y: 360,
    floor_width: 80,
    floor_height: 12,
    rotation: 0,
    color: "#D4A853",
    label: "Receiving",
    data: {},
    sort_order: 0,
  });
  if (eErr) fail(`dock door: ${eErr.message}`);
  return data.id;
}

async function seedSections(db, orgId, warehouseId) {
  step("Sections");
  const rows = SECTIONS.map((s, i) => ({
    org_id: orgId,
    warehouse_id: warehouseId,
    code: s.code,
    name: s.name,
    floor_x: s.x,
    floor_y: s.y,
    floor_width: s.w,
    floor_height: s.h,
    rotation: 0,
    total_bays: s.bays,
    total_levels: s.levels,
    color: null,
    sort_order: i,
    slot_capacity: 400,
    default_category: s.cat,
    pick_zone: s.zone,
  }));
  const { data, error } = await db.from("sections").insert(rows).select("id, code");
  if (error) fail(`sections: ${error.message}`);
  return Object.fromEntries(data.map((s) => [s.code, s.id]));
}

async function seedCategories(db, orgId) {
  step("Categories");
  const { data: existing } = await db
    .from("categories").select("id, name").eq("org_id", orgId);
  const have = new Map((existing ?? []).map((c) => [c.name, c.id]));

  const missing = CATEGORIES.filter((n) => !have.has(n));
  if (missing.length) {
    const { data, error } = await db
      .from("categories")
      .insert(missing.map((name, i) => ({ org_id: orgId, name, sort_order: i })))
      .select("id, name");
    if (error) fail(`categories: ${error.message}`);
    for (const c of data) have.set(c.name, c.id);
  }
  return Object.fromEntries(have);
}

async function seedSuppliers(db, orgId) {
  step("Suppliers");
  const { data, error } = await db
    .from("suppliers")
    .insert(
      SUPPLIERS.map((s) => ({
        org_id: orgId,
        name: s.name,
        email: s.email,
        country: "US",
        payment_terms: s.terms,
        default_lead_time_days: s.lead,
        is_active: true,
        notes: MARK,
      }))
    )
    .select("id, name");
  if (error) fail(`suppliers: ${error.message}`);
  return data.map((s) => s.id);
}

async function seedCustomers(db, orgId) {
  step("Customers");
  const { error } = await db.from("customers").insert(
    CUSTOMERS.map((c) => ({
      org_id: orgId,
      name: c.name,
      company_name: c.company,
      customer_type: c.type,
      country: "US",
      payment_terms: c.terms,
      discount_percent: c.discount,
      is_active: true,
      notes: MARK,
    }))
  );
  if (error) fail(`customers: ${error.message}`);
}

async function seedProducts(db, orgId, categoryIds, supplierIds) {
  step("Products");
  const rows = PRODUCTS.map((p, i) => ({
    org_id: orgId,
    barcode: `${PREFIX}${String(1000000 + i * 7919).padStart(9, "0")}`,
    internal_sku: p.sku,
    name: p.name,
    category_id: categoryIds[p.cat] ?? null,
    manufacturer: pick(["Timberline", "Cascade", "Ironwood"]),
    reorder_point: p.rop,
    unit_cost: p.cost,
    lead_time_days: p.lead,
    safety_stock: Math.round(p.rop * 0.2),
    preferred_supplier_id: supplierIds[i % supplierIds.length],
    track_lots: !!p.lots,
    notes: MARK,
  }));
  const { data, error } = await db
    .from("products").insert(rows).select("id, internal_sku");
  if (error) fail(`products: ${error.message}`);
  return Object.fromEntries(data.map((p) => [p.internal_sku, p.id]));
}

async function seedKit(db, orgId, categoryIds, productIds) {
  step("Kit + bill of materials");
  const { data, error } = await db
    .from("products")
    .insert({
      org_id: orgId,
      barcode: `${PREFIX}000999001`,
      internal_sku: KIT.sku,
      name: KIT.name,
      category_id: categoryIds[KIT.cat] ?? null,
      reorder_point: KIT.rop,
      unit_cost: KIT.cost,
      lead_time_days: KIT.lead,
      safety_stock: 3,
      is_kit: true,
      notes: MARK,
    })
    .select("id")
    .single();
  if (error) fail(`kit: ${error.message}`);
  productIds[KIT.sku] = data.id;

  const { error: cErr } = await db.from("kit_components").insert(
    KIT.components.map(([sku, qty]) => ({
      org_id: orgId,
      kit_product_id: data.id,
      component_product_id: productIds[sku],
      quantity: qty,
    }))
  );
  if (cErr) fail(`kit components: ${cErr.message}`);
}

async function seedLocations(db, orgId, warehouseId, sectionIds, productIds, userId) {
  step("Placing stock");
  const rows = [];

  for (const p of PRODUCTS) {
    const section = SECTIONS.find((s) => s.cat === p.cat) ?? SECTIONS[0];
    const sectionId = sectionIds[section.code];

    /* On-hand target: enough for ~40 days of demand, except `low` products
       which land just under their reorder point so they surface in the
       low-stock queue and the auto-draft-PO cron. */
    let total = p.low
      ? Math.max(1, Math.floor(p.rop * 0.55))
      : p.dead
        ? randInt(40, 120)
        : Math.round(Math.max(p.rop * 1.4, p.vel * 40));

    // Spread across 1–3 slots so consolidation/slotting has something to say.
    const slots = total > 300 ? 3 : total > 120 ? 2 : 1;
    for (let s = 0; s < slots; s++) {
      const qty = s === slots - 1 ? total : Math.floor(total / slots);
      total -= qty;
      if (qty <= 0) continue;
      rows.push({
        org_id: orgId,
        warehouse_id: warehouseId,
        section_id: sectionId,
        bay: randInt(1, section.bays),
        level: randInt(1, section.levels),
        product_id: productIds[p.sku],
        quantity: qty,
        is_active: true,
        quarantined: false,
        placed_by: userId,
      });
    }
  }

  // Components for the kit build live in Consumables/Tools too — already
  // covered above since the kit's components are real products.

  const { error } = await db.from("locations").insert(rows);
  if (error) fail(`locations: ${error.message}`);
  return rows.length;
}

async function seedLots(db, orgId, productIds, supplierIds, userId) {
  step("Lots (incl. expiring + expired)");
  const lotted = PRODUCTS.filter((p) => p.lots);
  const rows = [];
  const offsets = [9, 25, 120, -6]; // days until expiry; negative = expired
  lotted.forEach((p, i) => {
    offsets.forEach((off, j) => {
      rows.push({
        org_id: orgId,
        product_id: productIds[p.sku],
        lot_number: `${PREFIX}-LOT-${p.sku}-${String(j + 1).padStart(2, "0")}`,
        expires_at: dateOnly(off),
        supplier_id: supplierIds[(i + j) % supplierIds.length],
        received_at: dayISO(-randInt(20, 90)),
        notes: MARK,
        created_by: userId,
      });
    });
  });
  const { error } = await db.from("lots").insert(rows);
  if (error) fail(`lots: ${error.message}`);
}

async function seedScanHistory(db, orgId, warehouseId, productIds, userId) {
  step("90 days of scan history");
  const rows = [];
  const DAYS = 92;

  for (const p of PRODUCTS) {
    if (p.vel <= 0 && !p.dead) continue;

    for (let d = DAYS; d >= 0; d--) {
      // Dead stock: no picks inside the recent window.
      if (p.dead && d < 200) continue;

      const date = new Date();
      date.setUTCDate(date.getUTCDate() - d);
      const dow = date.getUTCDay();
      if (dow === 0) continue; // closed Sundays
      const weekday = dow === 6 ? 0.4 : 1; // light Saturdays

      // Poisson-ish daily demand around the product's velocity.
      const base = p.vel * weekday;
      const jitter = 0.55 + rnd() * 0.9;
      const units = Math.round(base * jitter);
      if (units <= 0) continue;

      const picksToday = Math.min(4, Math.max(1, Math.round(units / 12)));
      for (let k = 0; k < picksToday; k++) {
        const q = Math.max(1, Math.round(units / picksToday));
        const stamp = new Date(date);
        stamp.setUTCHours(randInt(7, 17), randInt(0, 59), 0, 0);
        rows.push({
          org_id: orgId,
          product_id: productIds[p.sku],
          warehouse_id: warehouseId,
          scanned_by: userId,
          action: "pick",
          quantity: q,
          scanned_at: stamp.toISOString(),
        });
      }

      // Occasional cycle-count correction keeps `adjust` non-empty.
      if (rnd() < 0.02) {
        const stamp = new Date(date);
        stamp.setUTCHours(randInt(7, 17), 0, 0, 0);
        rows.push({
          org_id: orgId,
          product_id: productIds[p.sku],
          warehouse_id: warehouseId,
          scanned_by: userId,
          action: "adjust",
          quantity: randInt(-4, 4) || 2,
          scanned_at: stamp.toISOString(),
        });
      }
    }
  }

  // Dead-stock products need one ancient pick so "days inactive" is real
  // rather than "never seen".
  for (const p of PRODUCTS.filter((x) => x.dead)) {
    const stamp = new Date();
    stamp.setUTCDate(stamp.getUTCDate() - randInt(210, 300));
    rows.push({
      org_id: orgId,
      product_id: productIds[p.sku],
      warehouse_id: warehouseId,
      scanned_by: userId,
      action: "pick",
      quantity: randInt(5, 20),
      scanned_at: stamp.toISOString(),
    });
  }

  // Insert in chunks — this is the biggest table by far (~8-12k rows).
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from("scan_history").insert(rows.slice(i, i + CHUNK));
    if (error) fail(`scan_history: ${error.message}`);
  }
  console.log(`      ${rows.length} scans`);
}

async function seedPurchaseOrders(db, orgId, warehouseId, supplierIds, productIds, userId) {
  step("Purchase orders (draft · sent · partially received)");

  const { data: sup } = await db
    .from("suppliers").select("id, name, email").in("id", supplierIds);
  const byId = new Map((sup ?? []).map((s) => [s.id, s]));

  const specs = [
    { status: "draft",              recv: 0,   skus: ["WO-PLK-7", "WO-PLK-5", "RO-PLK-7"] },
    { status: "sent",               recv: 0,   skus: ["LAM-OAK-8", "LAM-GRY-8"] },
    { status: "partially_received", recv: 0.6, skus: ["TIL-CER-12", "TIL-POR-24", "UND-FOAM-2"] },
  ];

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const supplier = byId.get(supplierIds[i % supplierIds.length]);

    const { data: num } = await db.rpc("next_document_number", {
      p_org_id: orgId, p_kind: "PO", p_prefix: "PO", p_pad: 0, p_start: 2049,
    });

    const { data: po, error } = await db
      .from("purchase_orders")
      .insert({
        org_id: orgId,
        warehouse_id: warehouseId,
        po_number: String(num),
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        supplier_contact: supplier.email,
        status: spec.status,
        expected_date: dateOnly(randInt(3, 21)),
        notes: MARK,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) fail(`purchase_orders: ${error.message}`);

    const lines = spec.skus.map((sku) => {
      const p = PRODUCTS.find((x) => x.sku === sku);
      const expected = randInt(120, 600);
      return {
        po_id: po.id,
        product_id: productIds[sku],
        product_name: p.name,
        quantity_expected: expected,
        quantity_received: Math.floor(expected * spec.recv),
        unit_cost: p.cost,
      };
    });
    const { error: lErr } = await db.from("po_line_items").insert(lines);
    if (lErr) fail(`po_line_items: ${lErr.message}`);
  }
}

async function seedOrders(db, orgId, warehouseId, productIds, userId) {
  step("Orders (incl. one deliberately backordered)");

  const specs = [
    { status: "complete",           cust: CUSTOMERS[0], skus: ["WO-PLK-7", "UND-FOAM-2"], qty: [80, 120] },
    { status: "complete",           cust: CUSTOMERS[1], skus: ["TIL-CER-12"],             qty: [200] },
    { status: "out_for_delivery",   cust: CUSTOMERS[3], skus: ["LAM-OAK-8", "ADH-ACR-1"], qty: [150, 6] },
    { status: "created",            cust: CUSTOMERS[2], skus: ["MPL-PLK-4", "TOL-SPC-50"],qty: [40, 10] },
    // Far exceeds on-hand → produces visible backorder lines.
    { status: "created",            cust: CUSTOMERS[0], skus: ["TOL-NLR-01", "TIL-SLT-16"], qty: [400, 900] },
  ];

  for (const spec of specs) {
    const { data: num } = await db.rpc("next_document_number", {
      p_org_id: orgId, p_kind: "ORD", p_prefix: "ORD", p_pad: 0, p_start: 1049,
    });

    const { data: order, error } = await db
      .from("orders")
      .insert({
        org_id: orgId,
        warehouse_id: warehouseId,
        order_type: "installer_job",
        status: spec.status,
        order_number: String(num),
        customer_name: spec.cust.name,
        delivery_date: dateOnly(randInt(1, 14)),
        notes: MARK,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) fail(`orders: ${error.message}`);

    const { error: iErr } = await db.from("order_items").insert(
      spec.skus.map((sku, i) => ({
        order_id: order.id,
        product_id: productIds[sku],
        quantity_requested: spec.qty[i],
      }))
    );
    if (iErr) fail(`order_items: ${iErr.message}`);

    /* Allocate through the real RPC so ATP, reservations and backorder
       maths match exactly what the app would have produced. */
    const { error: aErr } = await db.rpc("allocate_order", {
      p_org_id: orgId,
      p_order_id: order.id,
    });
    if (aErr) console.warn(`      ! allocate_order: ${aErr.message}`);
  }
}

// ── output helpers ────────────────────────────────────────────────────────

function step(label) {
  console.log(`  → ${label}`);
}

function fail(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

main().catch((e) => fail(e?.stack || e?.message || String(e)));
