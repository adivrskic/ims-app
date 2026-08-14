import "server-only";

/**
 * Shared CSV cell encoder for every export route.
 *
 * WHY THIS EXISTS: four export routes (inventory, orders, reports, valuation)
 * each carried their own copy of this function, and they had drifted apart in
 * two ways that mattered:
 *
 *   1. Two copies quoted ANY value starting with `-`, so a negative number like
 *      `-12.50` was emitted as `'-12.50` — Excel/Sheets then treat the cell as
 *      text and it drops out of SUM(). That silently corrupted the valuation
 *      and custom-report exports, which are exactly the ones full of negative
 *      variances and adjustments.
 *   2. Two copies omitted `\r` from the quote trigger, so a value containing a
 *      bare carriage return broke row framing in the emitted file.
 *
 * One implementation, both bugs fixed, one place to change it next time.
 */

/** A plain number (incl. sign and decimals) that must stay numeric in Excel. */
const NUMERIC = /^[-+]?\d+(\.\d+)?$/;

/** Leading characters Excel/Sheets treat as the start of a formula. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** Characters that force the cell to be quoted per RFC 4180. */
const NEEDS_QUOTING = /[",\n\r]/;

/**
 * Encode one value as a CSV cell.
 *
 * Neutralizes spreadsheet formula injection: a cell beginning with `= + - @`
 * (or a leading tab/CR) is evaluated on open, so `=HYPERLINK(...)` or
 * `=cmd|'/c calc'!A1` in a product name would execute. Such values get an
 * apostrophe prefix to force text — EXCEPT plain numbers, which are left alone
 * so numeric columns stay numeric.
 */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);

  if (FORMULA_LEAD.test(s) && !NUMERIC.test(s)) {
    s = `'${s}`;
  }

  return NEEDS_QUOTING.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Join pre-encoded cells into a row. */
export function csvRow(cells: string[]): string {
  return cells.join(",");
}

/**
 * CRLF line ending per RFC 4180 — Excel on Windows is the primary consumer.
 */
export const CSV_EOL = "\r\n";
