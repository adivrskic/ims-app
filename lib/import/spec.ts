/**
 * Import engine — the pure half.
 *
 * An ImportSpec describes one importable entity (products, suppliers,
 * customers): its canonical fields, the header aliases we accept for each
 * (so a spreadsheet exported from another system imports without renaming
 * columns), how each cell parses, and which field identifies an existing row.
 *
 * `matchHeaders` + `buildRecords` turn a parsed table into typed records and
 * per-row errors. No DB here — the per-entity import server actions own
 * lookups (categories, suppliers, sections) and the writes. Everything in this
 * file is unit-tested (test/importSpec.test.ts) and importable client-side —
 * the template builder lives in lib/import/template.ts because it needs the
 * server-only CSV encoder.
 */

import type { ParsedTable } from "@/lib/csv/parse";

export type FieldKind =
  | "text"
  | "email"
  | "int"
  | "money"
  | "percent"
  | "enum"
  | "bool";

export interface FieldDef {
  /** Canonical column name — what the template uses. */
  key: string;
  /** Human label for the mapping panel and error messages. */
  label: string;
  required?: boolean;
  /** Alternate header names (normalized form), most specific first. */
  aliases?: string[];
  /** Shown in the "expected columns" table. */
  hint: string;
  /** Example value for the downloadable template. */
  example: string;
  kind?: FieldKind;
  /** enum: normalized input → canonical value. */
  values?: Record<string, string>;
  /** enum: allowed inputs listed in the error message. */
  allowed?: string[];
  /** int / percent upper bound (percent defaults to 100). */
  max?: number;
  /** text: max length (default 500). */
  maxLength?: number;
}

export type ImportEntity = "products" | "suppliers" | "customers";

export interface ImportSpec {
  entity: ImportEntity;
  /** Plural, lowercase — "products". */
  label: string;
  /** Singular, lowercase — "product". */
  singular: string;
  /** Field that identifies an existing row (skip-or-update decision). */
  keyField: string;
  /** How the key reads in messages — "barcode", "name". */
  keyLabel: string;
  /** Names collide case-insensitively; barcodes are exact. */
  keyCaseInsensitive?: boolean;
  /** If the key column is absent, borrow this field's column (SKU → barcode). */
  keyFallback?: string;
  fields: FieldDef[];
}

export type CellValue = string | number | boolean | null;
export type ImportRecord = Record<string, CellValue>;

export interface RowError {
  /** 1-based source line (header is line 1), i.e. the spreadsheet row number. */
  row: number;
  /** The row's key value (barcode / name), for the error table. */
  key: string;
  message: string;
}

export interface MappingEntry {
  field: string;
  label: string;
  required: boolean;
  /** Source header text that matched, or null when the column is absent. */
  header: string | null;
  /** Extra context, e.g. "using SKU as barcode". */
  note?: string;
}

export interface HeaderMatch {
  /** field key → column index in the source. */
  columns: Record<string, number>;
  mapping: MappingEntry[];
  /** Source headers that matched nothing (ignored on import). */
  unmatched: string[];
  /** Labels of required fields with no column. */
  missingRequired: string[];
}

/**
 * Normalize a header (or enum cell) for matching: lowercase, drop BOM /
 * parentheticals ("Weight (lb)" → "weight") / punctuation, snake_case.
 */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/\uFEFF/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function matchHeaders(headers: string[], spec: ImportSpec): HeaderMatch {
  const norm = headers.map(normalizeHeader);
  const claimed = new Set<number>();
  const columns: Record<string, number> = {};

  const findColumn = (candidates: string[]): number => {
    for (const c of candidates) {
      const idx = norm.findIndex((h, i) => h === c && !claimed.has(i));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  // Spec order is precedence: "description" can alias the name field, but
  // only when no name-ish column exists, because name is matched first.
  for (const f of spec.fields) {
    const idx = findColumn([f.key, ...(f.aliases ?? [])]);
    if (idx >= 0) {
      columns[f.key] = idx;
      claimed.add(idx);
    }
  }

  const notes: Record<string, string> = {};
  if (
    spec.keyFallback &&
    columns[spec.keyField] === undefined &&
    columns[spec.keyFallback] !== undefined
  ) {
    const idx = columns[spec.keyFallback];
    columns[spec.keyField] = idx;
    delete columns[spec.keyFallback];
    notes[
      spec.keyField
    ] = `No ${spec.keyLabel} column — using “${headers[idx]}” as the ${spec.keyLabel}`;
  }

  const mapping: MappingEntry[] = spec.fields.map((f) => {
    const idx = columns[f.key];
    return {
      field: f.key,
      label: f.label,
      required: Boolean(f.required),
      header: idx === undefined ? null : headers[idx],
      ...(notes[f.key] ? { note: notes[f.key] } : {}),
    };
  });

  const unmatched = headers.filter(
    (h, i) => !claimed.has(i) && h.trim() !== ""
  );
  const missingRequired = spec.fields
    .filter((f) => f.required && columns[f.key] === undefined)
    .map((f) => f.label);

  return { columns, mapping, unmatched, missingRequired };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRUE_WORDS = new Set(["yes", "y", "true", "1", "active", "on"]);
const FALSE_WORDS = new Set(["no", "n", "false", "0", "inactive", "off"]);

/** Parse one cell per its field definition. Blank → null (never an error here). */
export function parseCell(
  raw: string,
  f: FieldDef
): { value: CellValue } | { error: string } {
  const s = raw.trim();
  if (s === "") return { value: null };

  switch (f.kind ?? "text") {
    case "int": {
      const cleaned = s.replace(/[,\s]/g, "");
      if (!/^-?\d+(\.0+)?$/.test(cleaned)) {
        return { error: `${f.label} must be a whole number (got “${s}”)` };
      }
      const n = parseInt(cleaned, 10);
      if (n < 0) return { error: `${f.label} can't be negative` };
      if (f.max !== undefined && n > f.max) {
        return { error: `${f.label} must be ${f.max} or less` };
      }
      return { value: n };
    }
    case "money": {
      const n = Number(s.replace(/[$€£,\s]/g, ""));
      if (!Number.isFinite(n)) {
        return { error: `${f.label} must be a number (got “${s}”)` };
      }
      if (n < 0) return { error: `${f.label} can't be negative` };
      return { value: Math.round(n * 100) / 100 };
    }
    case "percent": {
      const max = f.max ?? 100;
      const n = Number(s.replace(/[%\s]/g, ""));
      if (!Number.isFinite(n)) {
        return { error: `${f.label} must be a number (got “${s}”)` };
      }
      if (n < 0 || n > max) {
        return { error: `${f.label} must be between 0 and ${max}` };
      }
      return { value: n };
    }
    case "enum": {
      const v = f.values?.[normalizeHeader(s)];
      if (!v) {
        return {
          error: `${f.label} must be one of: ${(f.allowed ?? []).join(
            ", "
          )} (got “${s}”)`,
        };
      }
      return { value: v };
    }
    case "email": {
      if (!EMAIL_RE.test(s)) {
        return { error: `${f.label} doesn't look like an email (got “${s}”)` };
      }
      return { value: s.toLowerCase() };
    }
    case "bool": {
      const k = s.toLowerCase();
      if (TRUE_WORDS.has(k)) return { value: true };
      if (FALSE_WORDS.has(k)) return { value: false };
      return { error: `${f.label} must be yes or no (got “${s}”)` };
    }
    default: {
      const max = f.maxLength ?? 500;
      if (s.length > max) {
        return { error: `${f.label} is too long (max ${max} characters)` };
      }
      return { value: s };
    }
  }
}

export interface BuiltRow {
  row: number;
  key: string;
  record: ImportRecord;
}

export interface BuildResult {
  rows: BuiltRow[];
  errors: RowError[];
}

/**
 * Turn parsed rows into typed records. A row with any bad cell is reported
 * once (first problem) and dropped; the valid rows still import — the
 * customer fixes the reported rows and re-uploads just those.
 */
export function buildRecords(
  table: Pick<ParsedTable, "rows">,
  match: HeaderMatch,
  spec: ImportSpec
): BuildResult {
  const rows: BuiltRow[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();
  const keyIdx = match.columns[spec.keyField];

  for (const r of table.rows) {
    const keyRaw = keyIdx === undefined ? "" : (r.cells[keyIdx] ?? "").trim();
    const record: ImportRecord = {};
    let problem: string | null = null;

    for (const f of spec.fields) {
      const idx = match.columns[f.key];
      const raw = idx === undefined ? "" : r.cells[idx] ?? "";
      const res = parseCell(raw, f);
      if ("error" in res) {
        problem = res.error;
        break;
      }
      if (res.value === null && f.required) {
        problem = `Missing ${f.label.toLowerCase()}`;
        break;
      }
      record[f.key] = res.value;
    }

    if (problem) {
      errors.push({ row: r.line, key: keyRaw, message: problem });
      continue;
    }

    const dupKey = spec.keyCaseInsensitive ? keyRaw.toLowerCase() : keyRaw;
    if (seen.has(dupKey)) {
      errors.push({
        row: r.line,
        key: keyRaw,
        message: `Duplicate ${spec.keyLabel} within this file`,
      });
      continue;
    }
    seen.add(dupKey);
    rows.push({ row: r.line, key: keyRaw, record });
  }

  return { rows, errors };
}
