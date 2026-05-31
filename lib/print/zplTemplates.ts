/**
 * ZPL II template builders.
 *
 * All templates target 203 DPI Zebra printers (the desktop default —
 * ZD420, ZD620, GK420, ZD230). For 300 DPI printers (ZT411 etc), every
 * dot dimension here should be multiplied by 1.5; we'll add a DPI param
 * if/when we encounter one.
 *
 * Sizes:
 *   - 4" × 2"   (812 × 406 dots) — product shelf labels, location labels
 *   - 4" × 6"   (812 × 1218 dots) — pallet / receive labels
 *
 * Field origin (^FO) is top-left in dots. Fonts use ^A0N (Helvetica-like
 * scalable). Code 128 barcode via ^BC.
 */

import { gs1128, toGtin14, toYYMMDD } from "@/lib/print/gs1";

const DPI = 203;
const IN = (inches: number) => Math.round(inches * DPI);

interface ProductLabelInput {
  productName: string;
  barcode: string;
  sku?: string | null;
  category?: string | null;
  location?: string | null;
}

/**
 * 4" × 2" shelf/product label.
 *
 * Layout:
 *   [Category eyebrow ]
 *   [PRODUCT NAME — bold ]
 *   [    Code 128 barcode    ]    [SKU: xyz]
 *   [    barcode text below  ]    [LOC: abc]
 */
export function productLabel(input: ProductLabelInput): string {
  const name = sanitize(input.productName).slice(0, 40);
  const barcode = sanitize(input.barcode).slice(0, 30);
  const sku = input.sku ? sanitize(input.sku).slice(0, 20) : "";
  const category = input.category ? sanitize(input.category).slice(0, 30) : "";
  const loc = input.location ? sanitize(input.location).slice(0, 20) : "";

  return [
    "^XA",
    `^PW${IN(4)}`,
    `^LL${IN(2)}`,
    "^LH0,0",
    "^CI28", // UTF-8 encoding
    // Category eyebrow
    category ? `^FO20,18^A0N,18,18^FD${category}^FS` : "",
    // Product name (large)
    `^FO20,42^A0N,36,36^FB${IN(4) - 40},2,0,L,0^FD${name}^FS`,
    // Barcode block — ^BY sets module width; ^BC = Code 128
    `^FO20,${IN(1.05)}^BY3,3,${IN(0.55)}^BCN,${IN(0.55)},Y,N,N^FD${barcode}^FS`,
    // Right-side meta
    sku ? `^FO${IN(2.95)},${IN(1.15)}^A0N,20,20^FDSKU^FS` : "",
    sku ? `^FO${IN(2.95)},${IN(1.35)}^A0N,22,22^FD${sku}^FS` : "",
    loc ? `^FO${IN(2.95)},${IN(1.55)}^A0N,20,20^FDLOC^FS` : "",
    loc ? `^FO${IN(2.95)},${IN(1.75)}^A0N,22,22^FD${loc}^FS` : "",
    "^XZ",
  ]
    .filter(Boolean)
    .join("\n");
}

interface LocationLabelInput {
  /** The bay code shown big in the middle — e.g. "A-12-3" */
  code: string;
  /** Optional smaller secondary line — e.g. section name "Floor" */
  sectionName?: string | null;
  /** Optional capacity — e.g. "10 bays · 3 levels" */
  capacity?: string | null;
}

/**
 * 4" × 2" location/bay label. Code is huge so it can be read from
 * across an aisle; section name + capacity are small details.
 */
export function locationLabel(input: LocationLabelInput): string {
  const code = sanitize(input.code).slice(0, 16);
  const section = input.sectionName
    ? sanitize(input.sectionName).slice(0, 30)
    : "";
  const capacity = input.capacity ? sanitize(input.capacity).slice(0, 30) : "";

  return [
    "^XA",
    `^PW${IN(4)}`,
    `^LL${IN(2)}`,
    "^LH0,0",
    "^CI28",
    section ? `^FO20,18^A0N,20,20^FD${section}^FS` : "",
    // Giant code, centered horizontally
    `^FO0,${IN(0.4)}^FB${IN(4)},1,0,C,0^A0N,100,100^FD${code}^FS`,
    // Barcode beneath
    `^FO40,${IN(1.4)}^BY3,3,${IN(0.4)}^BCN,${IN(0.4)},Y,N,N^FD${code}^FS`,
    capacity ? `^FO20,${IN(1.85)}^A0N,16,16^FD${capacity}^FS` : "",
    "^XZ",
  ]
    .filter(Boolean)
    .join("\n");
}

interface ReceiveLabelInput {
  poNumber: string;
  productName: string;
  barcode: string;
  quantity: number;
  lotNumber?: string | null;
  receivedAt: Date;
}

/**
 * 4" × 6" pallet/box label used at receiving — bigger format so it's
 * readable on a stack from a forklift.
 */
export function receiveLabel(input: ReceiveLabelInput): string {
  const po = sanitize(input.poNumber).slice(0, 20);
  const product = sanitize(input.productName).slice(0, 60);
  const barcode = sanitize(input.barcode).slice(0, 30);
  const lot = input.lotNumber ? sanitize(input.lotNumber).slice(0, 30) : "";
  const stamp = input.receivedAt.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return [
    "^XA",
    `^PW${IN(4)}`,
    `^LL${IN(6)}`,
    "^LH0,0",
    "^CI28",
    `^FO20,30^A0N,30,30^FD${po}^FS`,
    `^FO20,75^A0N,22,22^FDReceived ${stamp}^FS`,
    `^FO20,135^A0N,40,40^FB${IN(4) - 40},3,0,L,0^FD${product}^FS`,
    `^FO20,${IN(3.2)}^BY4,3,${IN(1.0)}^BCN,${IN(1.0)},Y,N,N^FD${barcode}^FS`,
    `^FO20,${IN(4.6)}^A0N,28,28^FDQty${"  "}${input.quantity}^FS`,
    lot ? `^FO20,${IN(5.0)}^A0N,28,28^FDLot${"  "}${lot}^FS` : "",
    "^XZ",
  ]
    .filter(Boolean)
    .join("\n");
}

interface Gs1ProductLabelInput {
  productName: string;
  /** Product barcode — normalized to a GTIN-14 (AI 01). */
  barcode: string;
  sku?: string | null;
  category?: string | null;
  /** Optional lot/batch (AI 10) and expiry (AI 17) for per-lot labels. */
  lot?: string | null;
  expiry?: Date | null;
}

/**
 * 4" × 2" GS1-128 product label. Encodes (01)GTIN — plus (10)lot and (17)expiry
 * when provided — as a single GS1-128 barcode, with the human-readable AI line
 * beneath. Returns null when the barcode isn't a GTIN-able numeric (caller
 * should fall back to `productLabel`, a plain Code-128).
 */
export function gs1ProductLabel(input: Gs1ProductLabelInput): string | null {
  const gtin = toGtin14(input.barcode);
  if (!gtin) return null;

  const name = sanitize(input.productName).slice(0, 40);
  const sku = input.sku ? sanitize(input.sku).slice(0, 20) : "";
  const category = input.category ? sanitize(input.category).slice(0, 30) : "";
  const lot = input.lot ? sanitize(input.lot).slice(0, 20) : "";

  const { zplData, human } = gs1128({
    gtin,
    lot: lot || null,
    expiryYYMMDD: input.expiry ? toYYMMDD(input.expiry) : null,
  });

  return [
    "^XA",
    `^PW${IN(4)}`,
    `^LL${IN(2)}`,
    "^LH0,0",
    "^CI28",
    category ? `^FO20,16^A0N,18,18^FD${category}^FS` : "",
    `^FO20,40^A0N,34,34^FB${IN(4) - 40},2,0,L,0^FD${name}^FS`,
    // GS1-128 — ^BC Code 128, data carries FNC1 (>8) + AIs (see lib/print/gs1).
    `^FO20,${IN(1.0)}^BY3,3,${IN(0.5)}^BCN,${IN(0.5)},N,N,N^FD${zplData}^FS`,
    // Human-readable AI line under the bars.
    `^FO20,${IN(1.6)}^A0N,20,20^FB${IN(4) - 40},2,0,L,0^FD${human}^FS`,
    sku ? `^FO${IN(2.95)},16^A0N,18,18^FDSKU ${sku}^FS` : "",
    "^XZ",
  ]
    .filter(Boolean)
    .join("\n");
}

interface SsccLabelInput {
  /** 18-digit SSCC (use buildSscc to generate). */
  sscc: string;
  /** Optional title line — e.g. "Transfer TRN-1042" or ship-to. */
  title?: string | null;
  shipTo?: string | null;
  product?: string | null;
  quantity?: number | null;
}

/**
 * 4" × 6" SSCC shipping-container (pallet/carton) label: a GS1-128 (00)SSCC
 * license plate, big and forklift-readable, plus optional ship-to / contents.
 */
export function ssccLabel(input: SsccLabelInput): string {
  const sscc = sanitize(input.sscc).slice(0, 18);
  const title = input.title ? sanitize(input.title).slice(0, 40) : "";
  const shipTo = input.shipTo ? sanitize(input.shipTo).slice(0, 60) : "";
  const product = input.product ? sanitize(input.product).slice(0, 60) : "";
  const { zplData, human } = gs1128({ sscc });

  return [
    "^XA",
    `^PW${IN(4)}`,
    `^LL${IN(6)}`,
    "^LH0,0",
    "^CI28",
    "^FO20,30^A0N,26,26^FDSSCC^FS",
    title ? `^FO20,70^A0N,30,30^FB${IN(4) - 40},2,0,L,0^FD${title}^FS` : "",
    shipTo ? `^FO20,150^A0N,26,26^FB${IN(4) - 40},3,0,L,0^FDShip to: ${shipTo}^FS` : "",
    product ? `^FO20,270^A0N,28,28^FB${IN(4) - 40},2,0,L,0^FD${product}^FS` : "",
    input.quantity != null ? `^FO20,340^A0N,26,26^FDQty ${input.quantity}^FS` : "",
    // Big GS1-128 SSCC barcode toward the bottom.
    `^FO20,${IN(3.6)}^BY4,3,${IN(1.2)}^BCN,${IN(1.2)},N,N,N^FD${zplData}^FS`,
    `^FO20,${IN(5.0)}^A0N,28,28^FD${human}^FS`,
    "^XZ",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Strip characters ZPL treats as control / delimiters. Keeps ASCII text
 * predictable; non-ASCII passes through (^CI28 above enables UTF-8).
 */
function sanitize(s: string): string {
  return s.replace(/[\^~]/g, " ").trim();
}
