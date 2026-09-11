import { describe, it, expect } from "vitest";
import { parseTable } from "@/lib/csv/parse";
import {
  buildRecords,
  matchHeaders,
  normalizeHeader,
  parseCell,
} from "@/lib/import/spec";
import { templateCsv } from "@/lib/import/template";
import {
  CUSTOMER_SPEC,
  IMPORT_SPECS,
  PRODUCT_SPEC,
  SUPPLIER_SPEC,
} from "@/lib/import/specs";
import { prepareImport, MAX_IMPORT_ROWS } from "@/lib/import/prepare";

describe("normalizeHeader", () => {
  it("snake_cases, lowercases and drops parentheticals + BOM", () => {
    expect(normalizeHeader("﻿ Product Name ")).toBe("product_name");
    expect(normalizeHeader("Weight (lb)")).toBe("weight");
    expect(normalizeHeader("Qty On-Hand*")).toBe("qty_on_hand");
    expect(normalizeHeader("Net 30")).toBe("net_30");
  });
});

describe("matchHeaders", () => {
  it("matches canonical names, aliases and ignores extras", () => {
    const m = matchHeaders(
      ["UPC", "Product Name", "Vendor", "Qty on hand", "Color"],
      PRODUCT_SPEC
    );
    expect(m.columns.barcode).toBe(0);
    expect(m.columns.name).toBe(1);
    expect(m.columns.supplier).toBe(2);
    expect(m.columns.quantity).toBe(3);
    expect(m.unmatched).toEqual(["Color"]);
    expect(m.missingRequired).toEqual([]);
  });

  it("falls back to the SKU column as the barcode and says so", () => {
    const m = matchHeaders(["SKU", "Name"], PRODUCT_SPEC);
    expect(m.columns.barcode).toBe(0);
    expect(m.columns.internal_sku).toBeUndefined();
    expect(m.missingRequired).toEqual([]);
    const barcodeRow = m.mapping.find((e) => e.field === "barcode");
    expect(barcodeRow?.header).toBe("SKU");
    expect(barcodeRow?.note).toMatch(/using “SKU” as the barcode/);
  });

  it("keeps SKU as internal_sku when a real barcode column exists", () => {
    const m = matchHeaders(["Barcode", "SKU", "Name"], PRODUCT_SPEC);
    expect(m.columns.barcode).toBe(0);
    expect(m.columns.internal_sku).toBe(1);
  });

  it("lets description alias name only when no name column exists", () => {
    const a = matchHeaders(["Barcode", "Description"], PRODUCT_SPEC);
    expect(a.columns.name).toBe(1);
    const b = matchHeaders(["Barcode", "Name", "Description"], PRODUCT_SPEC);
    expect(b.columns.name).toBe(1);
    expect(b.unmatched).toEqual(["Description"]);
  });

  it("reports missing required columns by label", () => {
    const m = matchHeaders(["Price", "Vendor"], PRODUCT_SPEC);
    expect(m.missingRequired).toEqual(["Barcode", "Name"]);
  });

  it("does not let one source column satisfy two fields", () => {
    // "cost" is an alias of unit_cost only; "price" of unit_price only.
    const m = matchHeaders(["barcode", "name", "price"], PRODUCT_SPEC);
    expect(m.columns.unit_price).toBe(2);
    expect(m.columns.unit_cost).toBeUndefined();
  });
});

describe("parseCell", () => {
  const int = PRODUCT_SPEC.fields.find((f) => f.key === "quantity")!;
  const money = PRODUCT_SPEC.fields.find((f) => f.key === "unit_cost")!;
  const terms = SUPPLIER_SPEC.fields.find((f) => f.key === "payment_terms")!;
  const pct = CUSTOMER_SPEC.fields.find((f) => f.key === "discount_percent")!;

  it("blank is null, never an error", () => {
    expect(parseCell("   ", int)).toEqual({ value: null });
  });

  it("parses integers with thousands separators and rejects fractions", () => {
    expect(parseCell("1,200", int)).toEqual({ value: 1200 });
    expect(parseCell("12.0", int)).toEqual({ value: 12 });
    expect(parseCell("12.5", int)).toMatchObject({ error: expect.any(String) });
    expect(parseCell("-3", int)).toMatchObject({ error: /negative/ });
  });

  it("parses money with currency symbols and rounds to cents", () => {
    expect(parseCell("$1,234.567", money)).toEqual({ value: 1234.57 });
    expect(parseCell("abc", money)).toMatchObject({ error: /must be a number/ });
  });

  it("maps payment terms spellings onto the canonical enum", () => {
    expect(parseCell("Net 30", terms)).toEqual({ value: "net_30" });
    expect(parseCell("NET30", terms)).toEqual({ value: "net_30" });
    expect(parseCell("due on receipt", terms)).toEqual({
      value: "due_on_receipt",
    });
    expect(parseCell("Net 45", terms)).toMatchObject({
      error: /must be one of: COD, Due on receipt, Net 15/,
    });
  });

  it("bounds percentages", () => {
    expect(parseCell("12.5%", pct)).toEqual({ value: 12.5 });
    expect(parseCell("120", pct)).toMatchObject({ error: /between 0 and 100/ });
  });
});

describe("buildRecords", () => {
  it("builds typed records and reports bad rows by spreadsheet row number", () => {
    const table = parseTable(
      [
        "barcode,name,qty,cost",
        "111,Widget,10,$4.50",
        ",No barcode,1,1",
        "222,Bad qty,ten,1",
        "111,Dup,1,1",
        "333,Fine,,",
      ].join("\n")
    );
    const match = matchHeaders(table.headers, PRODUCT_SPEC);
    const out = buildRecords(table, match, PRODUCT_SPEC);

    expect(out.rows.map((r) => r.key)).toEqual(["111", "333"]);
    expect(out.rows[0].record).toMatchObject({
      barcode: "111",
      name: "Widget",
      quantity: 10,
      unit_cost: 4.5,
      supplier: null,
    });
    expect(out.errors).toEqual([
      { row: 3, key: "", message: "Missing barcode" },
      {
        row: 4,
        key: "222",
        message: "Quantity on hand must be a whole number (got “ten”)",
      },
      { row: 5, key: "111", message: "Duplicate barcode within this file" },
    ]);
  });

  it("treats supplier/customer names as case-insensitive duplicates", () => {
    const table = parseTable("name\nAcme\nACME\n");
    const match = matchHeaders(table.headers, SUPPLIER_SPEC);
    const out = buildRecords(table, match, SUPPLIER_SPEC);
    expect(out.rows).toHaveLength(1);
    expect(out.errors[0].message).toBe("Duplicate name within this file");
  });
});

describe("prepareImport", () => {
  it("is fatal without a header, with only a header, or over the row cap", () => {
    expect(prepareImport("", PRODUCT_SPEC).preview.fatal).toMatch(/first row/);
    expect(prepareImport("barcode,name\n", PRODUCT_SPEC).preview.fatal).toMatch(
      /Only a header row/
    );
    const big =
      "barcode,name\n" +
      Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `${i},x`).join(
        "\n"
      );
    expect(prepareImport(big, PRODUCT_SPEC).preview.fatal).toMatch(/limit/);
  });

  it("is fatal when a required column is missing, but still shows the mapping", () => {
    const { preview, rows } = prepareImport("sku_x,price\n1,2", PRODUCT_SPEC);
    expect(preview.fatal).toMatch(/Missing required columns: Barcode, Name/);
    expect(preview.mapping.length).toBe(PRODUCT_SPEC.fields.length);
    expect(rows).toEqual([]);
  });

  it("reports the sniffed delimiter and counts", () => {
    const { preview, rows } = prepareImport(
      "Barcode\tName\tQty\n1\tA\t5\n2\tB\tx\n",
      PRODUCT_SPEC
    );
    expect(preview.fatal).toBeUndefined();
    expect(preview.delimiter).toBe("tab");
    expect(preview.total).toBe(2);
    expect(preview.valid).toBe(1);
    expect(preview.errors).toHaveLength(1);
    expect(rows[0].record.quantity).toBe(5);
  });
});

describe("templates", () => {
  it("round-trip: every template parses back into a fully-matched, valid row", () => {
    for (const spec of Object.values(IMPORT_SPECS)) {
      const { preview, rows } = prepareImport(templateCsv(spec), spec);
      expect(preview.fatal, spec.entity).toBeUndefined();
      expect(preview.unmatched, spec.entity).toEqual([]);
      expect(preview.errors, spec.entity).toEqual([]);
      expect(rows, spec.entity).toHaveLength(1);
      // Every column in the template maps to its own field.
      for (const entry of preview.mapping) {
        expect(entry.header, `${spec.entity}.${entry.field}`).toBe(entry.field);
      }
    }
  });

  it("has unique keys and aliases within each spec", () => {
    for (const spec of Object.values(IMPORT_SPECS)) {
      const seen = new Map<string, string>();
      for (const f of spec.fields) {
        for (const name of [f.key, ...(f.aliases ?? [])]) {
          expect(
            seen.has(name),
            `${spec.entity}: "${name}" claimed by ${seen.get(name)} and ${f.key}`
          ).toBe(false);
          seen.set(name, f.key);
        }
      }
    }
  });
});
