import { describe, expect, it } from "vitest";
import {
  CODE128_PATTERNS,
  FNC1,
  code128Svg,
  encodeCode128,
  zplDataToCode128,
} from "@/lib/print/code128";
import { gs1128 } from "@/lib/print/gs1";

const START_B = 104;
const START_C = 105;
const STOP = 106;
const FNC1_VALUE = 102;

/** Independent mod-103 checksum (reference implementation for the tests). */
function referenceChecksum(codesWithoutCheckAndStop: number[]): number {
  let sum = codesWithoutCheckAndStop[0];
  for (let k = 1; k < codesWithoutCheckAndStop.length; k++) {
    sum += codesWithoutCheckAndStop[k] * k;
  }
  return sum % 103;
}

describe("CODE128_PATTERNS table", () => {
  it("has exactly 107 unique patterns", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
  });

  it("every data/start pattern is 6 elements summing to 11 modules; stop is 7 elements / 13 modules", () => {
    for (let v = 0; v <= 105; v++) {
      const p = CODE128_PATTERNS[v];
      expect(p, `value ${v}`).toHaveLength(6);
      const sum = [...p].reduce((s, c) => s + (c.charCodeAt(0) - 48), 0);
      expect(sum, `value ${v}`).toBe(11);
    }
    const stop = CODE128_PATTERNS[106];
    expect(stop).toHaveLength(7);
    expect([...stop].reduce((s, c) => s + (c.charCodeAt(0) - 48), 0)).toBe(13);
  });

  it("matches known published patterns (spot checks against the Code 128 spec)", () => {
    expect(CODE128_PATTERNS[0]).toBe("212222"); // space / "00"  = 11011001100
    expect(CODE128_PATTERNS[33]).toBe("111323"); // "A" in set B = 10100011000
    expect(CODE128_PATTERNS[103]).toBe("211412"); // Start A     = 11010000100
    expect(CODE128_PATTERNS[104]).toBe("211214"); // Start B     = 11010010000
    expect(CODE128_PATTERNS[105]).toBe("211232"); // Start C     = 11010011100
    expect(CODE128_PATTERNS[106]).toBe("2331112"); // Stop       = 1100011101011
  });
});

describe("encodeCode128 — known-answer sequences (hand-computed)", () => {
  it('encodes "ABC" in set B with checksum 1', () => {
    // Start B(104), A=33, B=34, C=35.
    // check = (104 + 1·33 + 2·34 + 3·35) mod 103 = 310 mod 103 = 1
    expect(encodeCode128("ABC")).toEqual([104, 33, 34, 35, 1, STOP]);
  });

  it('encodes "123456" entirely in set C with checksum 44', () => {
    // Start C(105), 12, 34, 56.
    // check = (105 + 1·12 + 2·34 + 3·56) mod 103 = 353 mod 103 = 44
    expect(encodeCode128("123456")).toEqual([105, 12, 34, 56, 44, STOP]);
  });

  it('encodes odd all-digit "12345" as C pairs then a set-B tail digit', () => {
    // Start C(105), 12, 34, CodeB(100), "5"=21.
    // check = (105 + 1·12 + 2·34 + 3·100 + 4·21) mod 103 = 569 mod 103 = 54
    expect(encodeCode128("12345")).toEqual([105, 12, 34, 100, 21, 54, STOP]);
  });

  it('encodes "RI476394652CH" with a mid-string B→C switch (odd 9-digit run spends one digit in B)', () => {
    // Start B(104), R=50, I=41, "4"=20 (odd-run leftover), CodeC(99),
    // 76, 39, 46, 52, CodeB(100), C=35, H=40.
    // check = (104 + 50 + 2·41 + 3·20 + 4·99 + 5·76 + 6·39 + 7·46 + 8·52
    //          + 9·100 + 10·35 + 11·40) mod 103 = 3734 mod 103 = 26
    expect(encodeCode128("RI476394652CH")).toEqual([
      104, 50, 41, 20, 99, 76, 39, 46, 52, 100, 35, 40, 26, STOP,
    ]);
  });

  it("keeps short digit runs (<6) in set B", () => {
    // "PJJ123C": run of 3 digits mid-string must NOT trigger a C switch.
    const codes = encodeCode128("PJJ123C");
    expect(codes[0]).toBe(START_B);
    expect(codes).not.toContain(99); // no CodeC
    expect(codes.slice(1, 8)).toEqual([48, 42, 42, 17, 18, 19, 35]);
  });

  it("switches B→C for a 6+ digit interior run", () => {
    const codes = encodeCode128("AB123456CD");
    // Start B, A, B, CodeC, 12, 34, 56, CodeB, C, D, check, stop
    expect(codes.slice(0, 10)).toEqual([104, 33, 34, 99, 12, 34, 56, 100, 35, 36]);
  });
});

describe("encodeCode128 — GS1 / FNC1", () => {
  it("encodes FNC1 + AI(01) GTIN-14 as Start C, FNC1(102), digit pairs", () => {
    const codes = encodeCode128(FNC1 + "0100012345678905");
    expect(codes.slice(0, 10)).toEqual([
      START_C, FNC1_VALUE, 1, 0, 1, 23, 45, 67, 89, 5,
    ]);
    expect(codes[codes.length - 1]).toBe(STOP);
    expect(codes[codes.length - 2]).toBe(
      referenceChecksum(codes.slice(0, -2))
    );
  });

  it("encodes a mid-payload FNC1 (variable-length AI separator) in set C", () => {
    // (01)GTIN + (10)lot "42" separated correctly — FNC1 valid inside set C.
    const codes = encodeCode128(FNC1 + "0100012345678905" + "10AB" + FNC1 + "3742");
    expect(codes).toContain(FNC1_VALUE);
    // count both FNC1s
    expect(codes.filter((c) => c === FNC1_VALUE)).toHaveLength(2);
    expect(codes[codes.length - 2]).toBe(referenceChecksum(codes.slice(0, -2)));
  });

  it("zplDataToCode128 converts lib/print/gs1 zplData (>8 markers) to FNC1 sentinels", () => {
    const { zplData } = gs1128({ gtin: "00012345678905", lot: "L42" });
    expect(zplData).toBe(">8010001234567890510L42");
    expect(zplDataToCode128(zplData)).toBe(FNC1 + "010001234567890510L42");
    // and the converted payload must be encodable
    const codes = encodeCode128(zplDataToCode128(zplData));
    expect(codes[0]).toBe(START_C);
    expect(codes[1]).toBe(FNC1_VALUE);
  });
});

describe("encodeCode128 — structural invariants", () => {
  const samples = [
    "A-12-3", // bay label code
    "MEZZ-10-4",
    "4006381333931", // EAN-13 product barcode
    "SKU-00042",
    "x",
    "0",
    FNC1 + "0100012345678905",
  ];

  it("every encoding starts with a start code, ends with stop, and self-checksums", () => {
    for (const s of samples) {
      const codes = encodeCode128(s);
      expect([START_B, START_C]).toContain(codes[0]);
      expect(codes[codes.length - 1]).toBe(STOP);
      expect(codes[codes.length - 2]).toBe(
        referenceChecksum(codes.slice(0, -2))
      );
      // every symbol value is within the table
      for (const c of codes) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(106);
      }
    }
  });

  it("rejects empty and non-set-B-encodable input", () => {
    expect(() => encodeCode128("")).toThrow();
    expect(() => encodeCode128("café")).toThrow(/not encodable/);
    expect(() => encodeCode128("line\nbreak")).toThrow(/not encodable/);
  });
});

describe("code128Svg", () => {
  it("renders the expected module width and bar count for ABC", () => {
    // 6 symbols: 5 × 11-module symbols + 13-module stop = 68 modules,
    // + 2 × 10-module quiet zones = 88. Bars: 3 per 6-element symbol,
    // 4 in the stop pattern → 5·3 + 4 = 19 rects.
    const svg = code128Svg("ABC", { height: 40 });
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toContain('viewBox="0 0 88 40"');
    expect(svg.match(/<rect /g)).toHaveLength(19);
    // first bar starts after the quiet zone
    expect(svg).toContain('<rect x="10" y="0" width="2" height="40"/>');
  });

  it("escapes the value in the aria-label", () => {
    const svg = code128Svg('A"B&C');
    expect(svg).toContain("aria-label=\"Barcode A&quot;B&amp;C\"");
  });
});
