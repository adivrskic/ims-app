import { describe, it, expect } from "vitest";
import {
  parseDelimited,
  parseTable,
  sniffDelimiter,
} from "@/lib/csv/parse";

describe("sniffDelimiter", () => {
  it("defaults to comma", () => {
    expect(sniffDelimiter("barcode,name\n1,Widget")).toBe(",");
  });

  it("prefers tabs when present (pasted spreadsheet cells)", () => {
    expect(sniffDelimiter("barcode\tname\n1\tWidget, large")).toBe("\t");
  });

  it("picks semicolon when it outnumbers commas (European Excel)", () => {
    expect(sniffDelimiter("barcode;name;notes\n1;Widget;a, b")).toBe(";");
  });

  it("ignores delimiters inside quotes", () => {
    expect(sniffDelimiter('"a;b;c",name\n1,2')).toBe(",");
  });

  it("skips leading blank lines", () => {
    expect(sniffDelimiter("\n\nbarcode\tname\n")).toBe("\t");
  });
});

describe("parseDelimited", () => {
  it("handles quoted commas and doubled quotes", () => {
    expect(parseDelimited('a,"b, c","say ""hi"""\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
    ]);
  });

  it("keeps a multi-line quoted cell together", () => {
    const text = 'barcode,notes\n1,"line one\nline two"\n2,plain';
    expect(parseDelimited(text)).toEqual([
      ["barcode", "notes"],
      ["1", "line one\nline two"],
      ["2", "plain"],
    ]);
  });

  it("treats a mid-cell quote as a literal inch mark", () => {
    expect(parseDelimited('1,7" plank,x')).toEqual([["1", '7" plank', "x"]]);
  });

  it("accepts CRLF, LF and bare CR line endings", () => {
    expect(parseDelimited("a,b\r\nc,d\re,f\ng,h")).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
      ["g", "h"],
    ]);
  });

  it("strips a UTF-8 BOM so the first header still matches", () => {
    expect(parseDelimited("\uFEFFbarcode,name\n1,W")[0]).toEqual([
      "barcode",
      "name",
    ]);
  });

  it("parses tab-separated text without an explicit delimiter", () => {
    expect(parseDelimited("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns an empty cell list for an empty input", () => {
    expect(parseDelimited("")).toEqual([]);
  });
});

describe("parseTable", () => {
  it("returns headers and non-blank rows with source line numbers", () => {
    const t = parseTable("barcode, name \n1,A\n\n , \n2,B\n");
    expect(t.headers).toEqual(["barcode", "name"]);
    expect(t.rows).toEqual([
      { line: 2, cells: ["1", "A"] },
      { line: 5, cells: ["2", "B"] },
    ]);
    expect(t.delimiter).toBe(",");
  });

  it("skips leading blank lines before the header", () => {
    const t = parseTable("\n\nbarcode,name\n1,A");
    expect(t.headers).toEqual(["barcode", "name"]);
    expect(t.rows[0].line).toBe(4);
  });

  it("is empty for whitespace-only input", () => {
    expect(parseTable("  \n \n")).toEqual({
      headers: [],
      rows: [],
      delimiter: ",",
    });
  });
});
