/**
 * prepareImport — parse + match + validate, shared by every import action.
 * Pure: the server actions add the DB half (existing-row lookups, writes).
 */

import { parseTable } from "@/lib/csv/parse";
import { DELIMITER_LABEL } from "@/lib/csv/parse";
import {
  buildRecords,
  matchHeaders,
  type BuiltRow,
  type ImportSpec,
  type MappingEntry,
  type RowError,
} from "./spec";

export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** What the "Check" phase shows before anything is written. */
export interface ImportPreview {
  /** Set when nothing can proceed (no header, missing required column…). */
  fatal?: string;
  delimiter: "comma" | "tab" | "semicolon";
  /** Non-blank data rows found. */
  total: number;
  /** Rows that pass validation (before existing-row checks). */
  valid: number;
  mapping: MappingEntry[];
  unmatched: string[];
  errors: RowError[];
}

/** The import phase adds what actually happened. */
export interface ImportOutcome extends ImportPreview {
  mode: "check" | "import";
  imported: number;
  updated: number;
  skipped: number;
  /** Non-fatal, non-row messages ("created 3 categories"). */
  notes: string[];
}

export function emptyOutcome(
  mode: "check" | "import",
  fatal: string
): ImportOutcome {
  return {
    mode,
    fatal,
    delimiter: "comma",
    total: 0,
    valid: 0,
    mapping: [],
    unmatched: [],
    errors: [],
    imported: 0,
    updated: 0,
    skipped: 0,
    notes: [],
  };
}

export function prepareImport(
  text: string,
  spec: ImportSpec
): { preview: ImportPreview; rows: BuiltRow[] } {
  const table = parseTable(text);
  const delimiter = DELIMITER_LABEL[table.delimiter] as ImportPreview["delimiter"];
  const base: ImportPreview = {
    delimiter,
    total: table.rows.length,
    valid: 0,
    mapping: [],
    unmatched: [],
    errors: [],
  };

  if (table.headers.length === 0) {
    return {
      preview: {
        ...base,
        fatal: "Nothing to import — the first row must be the column headers.",
      },
      rows: [],
    };
  }
  if (table.rows.length === 0) {
    return {
      preview: { ...base, fatal: "Only a header row was found — no data rows." },
      rows: [],
    };
  }
  if (table.rows.length > MAX_IMPORT_ROWS) {
    return {
      preview: {
        ...base,
        fatal: `That's ${table.rows.length.toLocaleString()} rows — the limit is ${MAX_IMPORT_ROWS.toLocaleString()} per import. Split the file and run it twice.`,
      },
      rows: [],
    };
  }

  const match = matchHeaders(table.headers, spec);
  if (match.missingRequired.length > 0) {
    const list = match.missingRequired.join(", ");
    return {
      preview: {
        ...base,
        mapping: match.mapping,
        unmatched: match.unmatched,
        fatal: `Missing required column${
          match.missingRequired.length === 1 ? "" : "s"
        }: ${list}. Rename a column to match, or add it — see the expected columns.`,
      },
      rows: [],
    };
  }

  const built = buildRecords(table, match, spec);
  return {
    preview: {
      ...base,
      valid: built.rows.length,
      mapping: match.mapping,
      unmatched: match.unmatched,
      errors: built.errors,
    },
    rows: built.rows,
  };
}
