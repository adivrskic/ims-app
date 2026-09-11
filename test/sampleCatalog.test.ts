import { describe, it, expect } from "vitest";
import {
  SAMPLE_CATALOGS,
  sampleActivity,
  sampleCatalogFor,
} from "@/lib/sampleData/catalog";
import { INDUSTRY_SLUGS } from "@/lib/industries";
import { sampleCounts, type SampleDataMarker } from "@/lib/sampleData/types";

describe("sample catalogs", () => {
  it("covers every industry plus a general fallback", () => {
    for (const slug of INDUSTRY_SLUGS) {
      expect(sampleCatalogFor(slug).key, slug).toBe(slug);
    }
    expect(sampleCatalogFor(null).key).toBe("general");
    expect(sampleCatalogFor("not-a-real-industry").key).toBe("general");
  });

  for (const cat of SAMPLE_CATALOGS) {
    describe(cat.key, () => {
      it("has unique barcodes and SKUs, and barcodes are 12 digits", () => {
        const barcodes = cat.products.map((p) => p.barcode);
        const skus = cat.products.map((p) => p.sku);
        expect(new Set(barcodes).size).toBe(barcodes.length);
        expect(new Set(skus).size).toBe(skus.length);
        for (const b of barcodes) expect(b).toMatch(/^\d{12}$/);
      });

      it("places every product in a slot that exists", () => {
        const sections = new Map(cat.sections.map((s) => [s.code, s]));
        for (const p of cat.products) {
          const [code, bay, level] = p.location.split("-");
          const section = sections.get(code);
          expect(section, `${p.sku} → ${p.location}`).toBeDefined();
          expect(Number(bay)).toBeGreaterThanOrEqual(1);
          expect(Number(bay)).toBeLessThanOrEqual(section!.bays);
          expect(Number(level)).toBeGreaterThanOrEqual(1);
          expect(Number(level)).toBeLessThanOrEqual(section!.levels);
        }
      });

      it("references real suppliers and prices above cost", () => {
        for (const p of cat.products) {
          expect(cat.suppliers[p.supplier], p.sku).toBeDefined();
          expect(p.unitPrice, p.sku).toBeGreaterThan(p.unitCost);
          expect(p.qty).toBeGreaterThanOrEqual(0);
        }
      });

      it("has at least two products below their reorder point (alerts)", () => {
        const low = cat.products.filter((p) => p.qty <= p.reorderPoint);
        expect(low.length).toBeGreaterThanOrEqual(2);
      });

      it("derives activity that resolves to catalog rows", () => {
        const a = sampleActivity(cat);
        expect(a.purchaseOrder.lines.length).toBeGreaterThan(0);
        for (const l of a.purchaseOrder.lines) {
          expect(l.product.supplier).toBe(a.purchaseOrder.supplier);
          expect(l.quantity).toBeGreaterThan(0);
        }
        for (const o of a.orders) {
          expect(cat.customers[o.customer]).toBeDefined();
          for (const l of o.lines) expect(l.product).toBeDefined();
        }
        for (const s of a.scans) {
          expect(s.product).toBeDefined();
          expect(s.daysAgo).toBeLessThanOrEqual(13);
        }
      });

      it("uses unique names for suppliers and customers", () => {
        const sup = cat.suppliers.map((s) => s.name.toLowerCase());
        const cus = cat.customers.map((c) => c.name.toLowerCase());
        expect(new Set(sup).size).toBe(sup.length);
        expect(new Set(cus).size).toBe(cus.length);
      });
    });
  }
});

describe("sampleCounts", () => {
  const marker: SampleDataMarker = {
    version: 1,
    seeded_at: "2026-09-01T00:00:00.000Z",
    seeded_by: null,
    warehouse_id: null,
    ids: {
      categories: ["c1"],
      suppliers: ["s1", "s2"],
      customers: [],
      sections: ["x"],
      products: ["p1", "p2", "p3"],
      purchase_orders: ["po"],
      orders: ["o1"],
      scans: ["a", "b", "c", "d"],
    },
  };

  it("is all zeros without a marker", () => {
    expect(sampleCounts(null).products).toBe(0);
    expect(sampleCounts(undefined).scansInWindow).toBe(0);
  });

  it("counts ids and ages sample scans out of the 14-day window", () => {
    const fresh = sampleCounts(marker, new Date("2026-09-05T00:00:00Z"));
    expect(fresh).toMatchObject({
      products: 3,
      suppliers: 2,
      sections: 1,
      orders: 1,
      scans: 4,
      scansInWindow: 4,
    });
    const old = sampleCounts(marker, new Date("2026-09-20T00:00:00Z"));
    expect(old.scans).toBe(4);
    expect(old.scansInWindow).toBe(0);
  });
});
