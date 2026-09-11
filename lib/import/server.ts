import "server-only";
import { MAX_IMPORT_BYTES } from "./prepare";

/**
 * Server-side halves shared by every import action: reading the source
 * (an uploaded file OR rows pasted from a spreadsheet), the two form switches,
 * and a chunker for batched writes.
 */

export async function readImportInput(
  formData: FormData
): Promise<{ text: string } | { fatal: string }> {
  const file = formData.get("file");
  const pasted = String(formData.get("text") ?? "");

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_IMPORT_BYTES) {
      return {
        fatal: `That file is ${(file.size / 1024 / 1024).toFixed(
          1
        )}MB — the limit is ${MAX_IMPORT_BYTES / 1024 / 1024}MB. Split it and import in parts.`,
      };
    }
    return { text: await file.text() };
  }

  if (pasted.trim().length > 0) {
    if (pasted.length > MAX_IMPORT_BYTES) {
      return {
        fatal: `That's more than ${
          MAX_IMPORT_BYTES / 1024 / 1024
        }MB of text — paste fewer rows, or upload a file in parts.`,
      };
    }
    return { text: pasted };
  }

  return { fatal: "Choose a CSV file, or paste rows copied from a spreadsheet." };
}

/** "check" = dry run (nothing written); "import" = write. Default: check. */
export function readImportMode(formData: FormData): "check" | "import" {
  return formData.get("mode") === "import" ? "import" : "check";
}

/** What to do with rows whose key already exists. Default: skip. */
export function readExistingMode(formData: FormData): "skip" | "update" {
  return formData.get("existing") === "update" ? "update" : "skip";
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Non-null string fields of a record → a patch object (blank never overwrites). */
export function patchFrom<T extends Record<string, unknown>>(
  record: T,
  keys: string[]
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const k of keys) {
    const v = record[k];
    if (v !== null && v !== undefined) patch[k] = v;
  }
  return patch;
}
