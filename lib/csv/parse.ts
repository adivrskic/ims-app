/**
 * Delimited-text parser for every import surface (products, suppliers,
 * customers, bulk invites). Pure — no DB, no React — so it is unit-tested
 * and safe to import from client components (the paste preview) as well as
 * server actions.
 *
 * - RFC 4180 quoting: `"a, b"`, doubled quotes (`""`) inside a quoted cell,
 *   and quoted cells that span lines (an Excel export with a multi-line
 *   notes column used to be silently mis-parsed).
 * - Delimiter sniffing: comma, tab (what you get when you copy cells out of
 *   Excel / Google Sheets and paste), or semicolon (European Excel).
 * - BOM tolerant: Excel prepends U+FEFF, which used to corrupt the first
 *   header (`\uFEFFbarcode` never matched `barcode`).
 *
 * The matching export encoder lives in lib/print/csv.ts.
 */

export type Delimiter = "," | "\t" | ";";

export const DELIMITER_LABEL: Record<Delimiter, string> = {
  ",": "comma",
  "\t": "tab",
  ";": "semicolon",
};

/**
 * Guess the delimiter from the first non-empty line, ignoring characters
 * inside quotes. Tabs win ties: a pasted spreadsheet row can carry commas
 * inside cells but never tabs.
 */
export function sniffDelimiter(text: string): Delimiter {
  const firstLine =
    text.split(/\r\n|\r|\n/).find((l) => l.trim().length > 0) ?? "";
  const counts: Record<Delimiter, number> = { ",": 0, "\t": 0, ";": 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "," || ch === "\t" || ch === ";")) {
      counts[ch] += 1;
    }
  }
  if (counts["\t"] > 0 && counts["\t"] >= counts[","]) return "\t";
  if (counts[";"] > counts[","]) return ";";
  return ",";
}

/**
 * Parse delimited text into rows of cells. Trailing blank rows are kept
 * (callers drop rows that are entirely blank — see `parseTable`).
 */
export function parseDelimited(
  input: string,
  delimiter?: Delimiter
): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const d = delimiter ?? sniffDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endRow = () => {
    row.push(cell);
    rows.push(row);
    row = [];
    cell = "";
  };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    // A quote only opens quoting at the start of a cell — `7" plank` in an
    // unquoted cell is a literal inch mark, not a broken quote.
    if (ch === '"' && cell.length === 0) {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === d) {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      endRow();
      i += text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell.length > 0 || row.length > 0) endRow();
  return rows;
}

export interface ParsedTable {
  /** Raw header cells, trimmed (not normalized — the UI shows these back). */
  headers: string[];
  /** Data rows with their 1-based line number in the source (header = 1). */
  rows: Array<{ line: number; cells: string[] }>;
  delimiter: Delimiter;
}

/**
 * Parse into a header row + non-blank data rows, remembering each row's
 * source line so error messages point at the spreadsheet row the user sees.
 */
export function parseTable(input: string, delimiter?: Delimiter): ParsedTable {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const d = delimiter ?? sniffDelimiter(text);
  const all = parseDelimited(text, d);
  const isBlank = (cells: string[]) => cells.every((c) => c.trim() === "");

  let headerIdx = 0;
  while (headerIdx < all.length && isBlank(all[headerIdx])) headerIdx += 1;
  if (headerIdx >= all.length) return { headers: [], rows: [], delimiter: d };

  const headers = all[headerIdx].map((h) => h.trim());
  const rows: ParsedTable["rows"] = [];
  for (let i = headerIdx + 1; i < all.length; i += 1) {
    if (isBlank(all[i])) continue;
    rows.push({ line: i + 1, cells: all[i] });
  }
  return { headers, rows, delimiter: d };
}
