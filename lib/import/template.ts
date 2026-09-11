import { csvCell, csvRow, CSV_EOL } from "@/lib/print/csv";
import type { ImportSpec } from "./spec";

/**
 * Downloadable template for an import spec: header + one example row,
 * encoded with the shared (injection-safe) CSV encoder. Server-side only —
 * lib/print/csv.ts is marked server-only, which is why this is not in spec.ts.
 */
export function templateCsv(spec: ImportSpec): string {
  const header = csvRow(spec.fields.map((f) => csvCell(f.key)));
  const example = csvRow(spec.fields.map((f) => csvCell(f.example)));
  return header + CSV_EOL + example + CSV_EOL;
}

export function templateFilename(spec: ImportSpec): string {
  return `${spec.singular}-import-template.csv`;
}
