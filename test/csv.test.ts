import { describe, it, expect } from "vitest";
import { csvCell } from "@/lib/print/csv";

/**
 * Regression tests for the shared CSV encoder. These lock down the two bugs
 * that the four divergent per-route copies had drifted into — see lib/print/csv.ts.
 */
describe("csvCell", () => {
  describe("formula injection", () => {
    it("neutralizes the four formula lead characters", () => {
      expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(
        "\"'=HYPERLINK(\"\"http://evil\"\")\""
      );
      expect(csvCell("+1234;cmd")).toBe("'+1234;cmd");
      expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
      // No comma/quote/newline in this payload, so it is prefixed but not quoted.
      expect(csvCell("-2+3+cmd|' /c calc'!A0")).toBe("'-2+3+cmd|' /c calc'!A0");
    });

    it("neutralizes leading tab and carriage return", () => {
      // A tab is a formula lead but not an RFC 4180 quote trigger.
      expect(csvCell("\t=1+1")).toBe("'\t=1+1");
      // A CR is both — prefixed AND quoted.
      expect(csvCell("\r=1+1")).toBe("\"'\r=1+1\"");
    });
  });

  describe("numbers stay numeric (the valuation/report export bug)", () => {
    it("does not quote-prefix negative integers", () => {
      expect(csvCell(-12)).toBe("-12");
      expect(csvCell("-12")).toBe("-12");
    });

    it("does not quote-prefix negative decimals", () => {
      expect(csvCell(-12.5)).toBe("-12.5");
      expect(csvCell("-1234.56")).toBe("-1234.56");
    });

    it("does not quote-prefix explicitly positive numbers", () => {
      expect(csvCell("+42")).toBe("+42");
      expect(csvCell("+42.75")).toBe("+42.75");
    });

    it("still escapes things that only look numeric", () => {
      // Trailing junk means it is not a number — must be neutralized.
      expect(csvCell("-12.5.3")).toBe("'-12.5.3");
      expect(csvCell("-1e9")).toBe("'-1e9");
    });
  });

  describe("RFC 4180 quoting (the bare-CR framing bug)", () => {
    it("quotes on comma, quote and newline", () => {
      expect(csvCell("a,b")).toBe('"a,b"');
      expect(csvCell('say "hi"')).toBe('"say ""hi"""');
      expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    });

    it("quotes on a bare carriage return", () => {
      // Two of the old copies omitted \r here, which broke row framing.
      expect(csvCell("line1\rline2")).toBe('"line1\rline2"');
    });

    it("doubles embedded quotes", () => {
      expect(csvCell('a"b"c')).toBe('"a""b""c"');
    });
  });

  describe("null-ish and passthrough", () => {
    it("renders null and undefined as empty", () => {
      expect(csvCell(null)).toBe("");
      expect(csvCell(undefined)).toBe("");
    });

    it("leaves ordinary text untouched", () => {
      expect(csvCell("Widget A")).toBe("Widget A");
      expect(csvCell("SKU-001")).toBe("SKU-001");
      expect(csvCell(0)).toBe("0");
    });
  });
});
