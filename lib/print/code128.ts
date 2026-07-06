/**
 * Pure Code 128 encoder + minimal SVG renderer — no deps, no DOM.
 *
 * Used by the printable label-sheet pages (the browser-print fallback for
 * the WebUSB/ZPL Zebra path in lib/print/zebra.ts). The barcode payloads
 * must match what the ZPL templates (lib/print/zplTemplates.ts) send to a
 * Zebra's ^BC (Code 128) field, so a scanner reads the exact same value
 * from a paper sheet as from a thermal label.
 *
 * Capabilities:
 *   - Code set B (ASCII 32–126) and code set C (digit pairs), with a
 *     greedy optimizer: start in C for 4+ leading digits, switch B→C for
 *     runs of 6+ digits (or 4+ digits ending the payload), odd runs spend
 *     one digit in B first. Code set A (control chars) is NOT supported —
 *     nothing in our label data needs it.
 *   - FNC1 (symbol value 102, valid in sets B and C) for GS1-128. Put the
 *     exported FNC1 sentinel character in the input string where ZPL would
 *     have ">8"; `zplDataToCode128` converts a gs1128() zplData string.
 *   - Correct start code, mod-103 check symbol, stop pattern, and 10-module
 *     quiet zones in the SVG.
 *
 * `encodeCode128` returns raw symbol values so the math is unit-testable
 * without any SVG concerns (see test/code128.test.ts).
 */

/**
 * FNC1 placeholder character (Latin-1 ñ, the same sentinel bwip-js and
 * JsBarcode use). It cannot otherwise appear in a Code 128 payload — set B
 * covers only ASCII 32–126 — so there's no collision with real data.
 */
export const FNC1 = "ñ";

/** Convert a ZPL ^FD data string from lib/print/gs1 (FNC1 as ">8") to this encoder's input form. */
export function zplDataToCode128(zplData: string): string {
  return zplData.split(">8").join(FNC1);
}

const CODE_C = 99;
const CODE_B = 100;
const FNC1_VALUE = 102;
const START_B = 104;
const START_C = 105;
const STOP = 106;

/**
 * Standard Code 128 bar/space widths for symbol values 0–106, written as
 * strings of module widths, alternating bar,space,bar,… starting with a bar.
 * Values 0–105 are 6 elements / 11 modules; the stop pattern (106) is
 * 7 elements / 13 modules (it ends with an extra 2-module bar).
 */
export const CODE128_PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213",
  "122312", "132212", "221213", "221312", "231212", "112232", "122132",
  "122231", "113222", "123122", "123221", "223211", "221132", "221231",
  "213212", "223112", "312131", "311222", "321122", "321221", "312212",
  "322112", "322211", "212123", "212321", "232121", "111323", "131123",
  "131321", "112313", "132113", "132311", "211313", "231113", "231311",
  "112133", "112331", "132131", "113123", "113321", "133121", "313121",
  "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111",
  "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114",
  "413111", "241112", "134111", "111242", "121142", "121241", "114212",
  "124112", "124211", "411212", "421112", "421211", "212141", "214121",
  "412121", "111143", "111341", "131141", "114113", "114311", "411113",
  "411311", "113141", "114131", "311141", "411131", "211412", "211214",
  "211232", "2331112",
];

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

/** Set-B symbol value for an ASCII 32–126 character. Throws otherwise. */
function charToB(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code < 32 || code > 126) {
    throw new Error(
      `Code 128: character ${JSON.stringify(ch)} (U+${code
        .toString(16)
        .toUpperCase()
        .padStart(4, "0")}) is not encodable in code set B`
    );
  }
  return code - 32;
}

/**
 * Encode a string as Code 128 symbol values, including the start code,
 * mod-103 check symbol, and stop code. Input may contain the FNC1 sentinel.
 */
export function encodeCode128(value: string): number[] {
  if (!value) throw new Error("Code 128: cannot encode an empty string");

  /** Consecutive plain digits starting at index i (FNC1 ends the run). */
  const digitsAhead = (i: number): number => {
    let n = 0;
    while (i + n < value.length && isDigit(value[i + n])) n++;
    return n;
  };

  // Pick the start set: C when the payload — ignoring any leading FNC1s,
  // as GS1-128 payloads begin with FNC1 — opens with 4+ digits.
  let lead = 0;
  while (value[lead] === FNC1) lead++;
  let set: "B" | "C" = digitsAhead(lead) >= 4 ? "C" : "B";

  const codes: number[] = [set === "C" ? START_C : START_B];
  let i = 0;
  while (i < value.length) {
    const ch = value[i];
    if (ch === FNC1) {
      codes.push(FNC1_VALUE); // value 102 in both set B and set C
      i++;
      continue;
    }
    if (set === "C") {
      if (digitsAhead(i) >= 2) {
        codes.push(Number(value.slice(i, i + 2)));
        i += 2;
      } else {
        codes.push(CODE_B);
        set = "B";
      }
      continue;
    }
    // set B
    const run = digitsAhead(i);
    if (run >= 6 || (run >= 4 && i + run === value.length)) {
      if (run % 2 === 1) {
        codes.push(charToB(ch)); // odd run: one digit stays in B
        i++;
      }
      codes.push(CODE_C);
      set = "C";
      continue;
    }
    codes.push(charToB(ch));
    i++;
  }

  // Mod-103 checksum: start value + Σ (value × position), position from 1.
  let sum = codes[0];
  for (let k = 1; k < codes.length; k++) sum += codes[k] * k;
  codes.push(sum % 103);
  codes.push(STOP);
  return codes;
}

export interface Code128SvgOptions {
  /** Bar height in SVG user units (1 unit = 1 module width). Default 48. */
  height?: number;
  /** Quiet zone on each side, in modules. Spec minimum (and default) is 10. */
  quietZone?: number;
  /** Bar fill color. Default #111. */
  color?: string;
}

function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render a Code 128 barcode as a standalone SVG string.
 *
 * `preserveAspectRatio="none"` + `viewBox` means the caller sizes it with
 * plain CSS (width/height); horizontal stretching scales every module
 * uniformly, so bar-width ratios — all a scanner cares about — survive.
 */
export function code128Svg(value: string, opts: Code128SvgOptions = {}): string {
  const codes = encodeCode128(value);
  const height = opts.height ?? 48;
  const quiet = opts.quietZone ?? 10;
  const color = opts.color ?? "#111";

  const rects: string[] = [];
  let x = quiet;
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    for (let j = 0; j < pattern.length; j++) {
      const w = pattern.charCodeAt(j) - 48; // '1'..'4' → 1..4
      if (j % 2 === 0) {
        rects.push(`<rect x="${x}" y="0" width="${w}" height="${height}"/>`);
      }
      x += w;
    }
  }
  const totalWidth = x + quiet;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" ` +
    `preserveAspectRatio="none" shape-rendering="crispEdges" role="img" ` +
    `aria-label="Barcode ${escapeXmlAttr(value)}" fill="${escapeXmlAttr(color)}">` +
    rects.join("") +
    `</svg>`
  );
}
