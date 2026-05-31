/**
 * GS1 barcode helpers — pure, no deps. Used by the ZPL templates to emit
 * GS1-128 (UCC/EAN-128) barcodes and SSCC shipping labels.
 *
 * GS1-128 encodes structured data via Application Identifiers (AIs):
 *   (00) SSCC (18 digits, fixed)      (01) GTIN (14, fixed)
 *   (17) expiry YYMMDD (6, fixed)     (10) batch/lot (variable)
 *   (37) count (variable)
 *
 * In ZPL Code-128 (^BC), FNC1 is written as ">8". GS1-128 must START with
 * FNC1, and a variable-length AI must be FOLLOWED by FNC1 before the next AI.
 * We therefore emit all fixed-length AIs first, then variable ones, joining
 * the variable segments with ">8".
 */

const FNC1 = ">8";

/** GS1 mod-10 check digit over a payload that excludes the check digit. */
export function gs1CheckDigit(payload: string): number {
  let sum = 0;
  for (let i = 0; i < payload.length; i++) {
    const digit = payload.charCodeAt(payload.length - 1 - i) - 48;
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function isNumeric(s: string): boolean {
  return /^\d+$/.test(s);
}

/**
 * Normalize a UPC-A (12) / EAN-13 (13) / GTIN-14 barcode to a 14-digit GTIN by
 * left-padding with zeros (the indicator digit). Returns null if the barcode
 * isn't a plausible 8–14 digit numeric GTIN — caller should fall back to a
 * plain Code-128 label.
 */
export function toGtin14(barcode: string): string | null {
  const b = barcode.trim();
  if (!isNumeric(b) || b.length < 8 || b.length > 14) return null;
  return b.padStart(14, "0");
}

/**
 * Build an 18-digit SSCC from a GS1 company prefix + a serial reference.
 *   SSCC = extension digit (0) + company prefix + serial (→17) + check digit
 */
export function buildSscc(companyPrefix: string, serialRef: string): string {
  const cp = companyPrefix.replace(/\D/g, "");
  const serial = serialRef.replace(/\D/g, "");
  const body = ("0" + cp).slice(0, 17);
  const sscc17 = (body + serial.padStart(17 - body.length, "0")).slice(0, 17);
  return sscc17 + gs1CheckDigit(sscc17);
}

interface Gs1Input {
  /** 14-digit GTIN (AI 01). */
  gtin?: string | null;
  /** Batch / lot (AI 10, variable). */
  lot?: string | null;
  /** Expiry as YYMMDD (AI 17, fixed 6). */
  expiryYYMMDD?: string | null;
  /** Count (AI 37, variable). */
  qty?: number | null;
  /** 18-digit SSCC (AI 00). */
  sscc?: string | null;
}

/** Format a Date as GS1 YYMMDD. */
export function toYYMMDD(d: Date): string {
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/**
 * Returns the ZPL ^FD data string (with FNC1 markers) and a human-readable
 * "(AI)value" line for the AIs present.
 */
export function gs1128(input: Gs1Input): { zplData: string; human: string } {
  const fixed: string[] = [];
  const variable: string[] = [];
  const human: string[] = [];

  if (input.sscc) {
    fixed.push("00" + input.sscc);
    human.push(`(00) ${input.sscc}`);
  }
  if (input.gtin) {
    fixed.push("01" + input.gtin);
    human.push(`(01) ${input.gtin}`);
  }
  if (input.expiryYYMMDD) {
    fixed.push("17" + input.expiryYYMMDD);
    human.push(`(17) ${input.expiryYYMMDD}`);
  }
  if (input.lot) {
    variable.push("10" + input.lot);
    human.push(`(10) ${input.lot}`);
  }
  if (input.qty != null) {
    variable.push("37" + String(input.qty));
    human.push(`(37) ${input.qty}`);
  }

  const zplData =
    FNC1 + fixed.join("") + (variable.length ? variable.join(FNC1) : "");
  return { zplData, human: human.join("  ") };
}
